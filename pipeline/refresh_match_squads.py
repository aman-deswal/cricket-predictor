"""Refresh squads for matches that are about to go live."""

import argparse
from datetime import datetime, timedelta, timezone

from utils.db import get_client
from fetch_squads import fetch_and_store_squads
from fetch_player_stats import fetch_stats_for_match_squads


def _parse_match_time(value: str) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def select_imminent_match_ids(window_minutes: int, live_grace_minutes: int) -> list[str]:
    client = get_client()
    response = (
        client.table("matches")
        .select("match_id, date, status")
        .in_("status", ["upcoming", "live"])
        .order("date", desc=False)
        .execute()
    )

    now = datetime.now(timezone.utc)
    pre_live_cutoff = now + timedelta(minutes=window_minutes)
    live_cutoff = now - timedelta(minutes=live_grace_minutes)

    match_ids: list[str] = []
    for match in response.data or []:
        match_time = _parse_match_time(match.get("date", ""))
        if match_time is None:
            continue

        status = str(match.get("status", "")).lower()
        if status == "upcoming" and now <= match_time <= pre_live_cutoff:
            match_ids.append(match["match_id"])
        elif status == "live" and live_cutoff <= match_time <= pre_live_cutoff:
            match_ids.append(match["match_id"])

    return match_ids


def main(window_minutes: int = 5, live_grace_minutes: int = 10) -> None:
    match_ids = select_imminent_match_ids(window_minutes, live_grace_minutes)
    if not match_ids:
        print("No imminent matches need squad refresh.")
        return

    print(f"Refreshing squads for {len(match_ids)} imminent matches...")
    for match_id in match_ids:
        fetch_and_store_squads(match_ids=[match_id], force=True)
        fetch_stats_for_match_squads(match_id=match_id, force=False)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Refresh squads for matches about to go live")
    parser.add_argument("--window-minutes", type=int, default=5, help="Minutes before kickoff to refresh squads")
    parser.add_argument("--live-grace-minutes", type=int, default=10, help="Minutes after kickoff to still refresh live matches")
    args = parser.parse_args()
    main(window_minutes=args.window_minutes, live_grace_minutes=args.live_grace_minutes)
