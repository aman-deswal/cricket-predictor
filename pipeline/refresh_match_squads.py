"""Refresh squads early, then escalate to confirmed XI checks near kickoff."""

import argparse
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional

from fetch_headshots import process_squads as resolve_missing_headshots
from utils.db import get_client
from fetch_squads import MatchSquadFetchResult, fetch_and_store_squads
from fetch_player_stats import fetch_stats_for_match_squads


def _parse_match_time(value: str) -> Optional[datetime]:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


@dataclass(frozen=True)
class MatchRefreshPlan:
    match_id: str
    force: bool = False


def _build_match_squad_index(rows: Optional[list[dict]]) -> dict[str, list[dict]]:
    index: dict[str, list[dict]] = {}
    for row in rows or []:
        match_id = row.get("match_id")
        if not match_id:
            continue
        index.setdefault(str(match_id), []).append(row)
    return index


def _latest_fetch_time(rows: list[dict]) -> Optional[datetime]:
    latest: Optional[datetime] = None
    for row in rows:
        fetched_at = _parse_match_time(str(row.get("fetched_at", "")))
        if fetched_at is None:
            continue
        if latest is None or fetched_at > latest:
            latest = fetched_at
    return latest


def _get_retry_interval(minutes_to_start: float) -> timedelta:
    if minutes_to_start <= 6 * 60:
        return timedelta(minutes=30)
    if minutes_to_start <= 24 * 60:
        return timedelta(hours=2)
    return timedelta(hours=6)


def _should_retry_unconfirmed_squad(
    *,
    match_time: datetime,
    latest_fetch: Optional[datetime],
    now: datetime,
) -> bool:
    if latest_fetch is None:
        return True
    minutes_to_start = max(0.0, (match_time - now).total_seconds() / 60)
    return latest_fetch <= now - _get_retry_interval(minutes_to_start)


def _build_refresh_plan(
    matches: Optional[list[dict]],
    squad_rows: Optional[list[dict]],
    *,
    now: datetime,
    lookahead_hours: int,
    window_minutes: int,
    live_grace_minutes: int,
) -> list[MatchRefreshPlan]:
    prefetch_cutoff = now + timedelta(hours=lookahead_hours)
    pre_live_cutoff = now + timedelta(minutes=window_minutes)
    live_cutoff = now - timedelta(minutes=live_grace_minutes)
    squads_by_match = _build_match_squad_index(squad_rows)

    plans: list[MatchRefreshPlan] = []
    for match in matches or []:
        match_id = match.get("match_id")
        if not match_id:
            continue

        match_time = _parse_match_time(str(match.get("date", "")))
        if match_time is None:
            continue

        status = str(match.get("status", "")).lower()
        if status == "upcoming" and now <= match_time <= pre_live_cutoff:
            plans.append(MatchRefreshPlan(match_id=str(match_id), force=True))
            continue
        if status == "live" and live_cutoff <= match_time <= pre_live_cutoff:
            plans.append(MatchRefreshPlan(match_id=str(match_id), force=True))
            continue
        if status != "upcoming" or not (now <= match_time <= prefetch_cutoff):
            continue

        squad_state = squads_by_match.get(str(match_id), [])
        if not squad_state:
            plans.append(MatchRefreshPlan(match_id=str(match_id)))
            continue

        if any(row.get("is_confirmed") for row in squad_state):
            continue

        latest_fetch = _latest_fetch_time(squad_state)
        if _should_retry_unconfirmed_squad(match_time=match_time, latest_fetch=latest_fetch, now=now):
            plans.append(MatchRefreshPlan(match_id=str(match_id)))

    return plans


def select_match_refresh_plan(
    lookahead_hours: int,
    window_minutes: int,
    live_grace_minutes: int,
) -> list[MatchRefreshPlan]:
    client = get_client()
    response = (
        client.table("matches")
        .select("match_id, date, status")
        .in_("status", ["upcoming", "live"])
        .order("date", desc=False)
        .execute()
    )

    match_ids = [match.get("match_id") for match in response.data or [] if match.get("match_id")]
    squad_rows: list[dict] = []
    if match_ids:
        squad_response = (
            client.table("match_squads")
            .select("match_id, is_confirmed, fetched_at")
            .in_("match_id", match_ids)
            .execute()
        )
        squad_rows = squad_response.data or []

    return _build_refresh_plan(
        response.data or [],
        squad_rows,
        now=datetime.now(timezone.utc),
        lookahead_hours=lookahead_hours,
        window_minutes=window_minutes,
        live_grace_minutes=live_grace_minutes,
    )


def _run_match_refresh(match_id: str, force: bool) -> MatchSquadFetchResult:
    results = fetch_and_store_squads(match_ids=[match_id], force=force)
    return results[0] if results else MatchSquadFetchResult(match_id=match_id, status="unavailable")


def _refresh_match_with_retry(match_id: str, force: bool, retry_delay_seconds: int = 5) -> MatchSquadFetchResult:
    result = _run_match_refresh(match_id, force)
    if result.status != "error":
        return result

    print(f"  ↻ Retrying squad refresh once for {match_id} after failure...")
    time.sleep(retry_delay_seconds)
    retry_result = _run_match_refresh(match_id, force)
    if retry_result.status == "error":
        print(f"  ❌ Retry failed for {match_id}: {retry_result.error or result.error}")
    return retry_result


def main(
    lookahead_hours: int = 72,
    window_minutes: int = 15,
    live_grace_minutes: int = 15,
) -> None:
    refresh_plan = select_match_refresh_plan(
        lookahead_hours=lookahead_hours,
        window_minutes=window_minutes,
        live_grace_minutes=live_grace_minutes,
    )
    if not refresh_plan:
        print("No upcoming matches need squad refresh.")
        return

    force_count = sum(1 for plan in refresh_plan if plan.force)
    print(
        f"Refreshing squads for {len(refresh_plan)} matches "
        f"({force_count} confirmed-XI checks, {len(refresh_plan) - force_count} greedy squad retries)..."
    )
    refreshed_match_ids: list[str] = []
    for plan in refresh_plan:
        result = _refresh_match_with_retry(plan.match_id, plan.force)
        if result.status == "stored":
            refreshed_match_ids.append(plan.match_id)
            fetch_stats_for_match_squads(match_id=plan.match_id, force=False)

    if refreshed_match_ids:
        resolve_missing_headshots(match_ids=refreshed_match_ids, force=False)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Refresh squads early, then retry for confirmed XI near kickoff")
    parser.add_argument("--lookahead-hours", type=int, default=72, help="Hours before kickoff to greedily retry missing or unconfirmed squads")
    parser.add_argument("--window-minutes", type=int, default=15, help="Minutes before kickoff to force a confirmed-XI refresh")
    parser.add_argument("--live-grace-minutes", type=int, default=15, help="Minutes after kickoff to still refresh live matches")
    args = parser.parse_args()
    main(
        lookahead_hours=args.lookahead_hours,
        window_minutes=args.window_minutes,
        live_grace_minutes=args.live_grace_minutes,
    )
