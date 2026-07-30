"""Select hourly Copilot garnish-refresh candidates from live Supabase data.

The goal is to keep AI-facing summaries fresh without touching deterministic
prediction math. This script identifies upcoming matches that are:

- missing enrichment entirely
- stale relative to the latest odds / squads / ESPN updates
- close to starting, so marquee cards get refreshed more often

It is intended to be run by Copilot cloud agent automations.
"""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from utils.db import get_client, get_upcoming_matches


def parse_timestamp(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)
    except ValueError:
        return None


@dataclass
class Candidate:
    match_id: str
    team1: str
    team2: str
    date: str
    hours_to_start: float
    priority: int
    reasons: list[str]
    garnish_generated_at: str | None
    latest_source_update: str | None


def latest_timestamp(rows: list[dict], key: str) -> datetime | None:
    latest: datetime | None = None
    for row in rows:
        parsed = parse_timestamp(row.get(key))
        if parsed and (latest is None or parsed > latest):
            latest = parsed
    return latest


def build_candidates(
    *,
    hours_ahead: int,
    stale_minutes: int,
    limit: int,
) -> list[Candidate]:
    now = datetime.now(timezone.utc)
    deadline = now + timedelta(hours=hours_ahead)
    client = get_client()

    matches = [
        match for match in get_upcoming_matches()
        if (parsed := parse_timestamp(match.get("date"))) is not None and now < parsed <= deadline
    ]

    if not matches:
        return []

    match_ids = [match["match_id"] for match in matches]

    enrich_rows = (
        client.table("match_enrichment")
        .select("match_id, generated_at, confidence")
        .in_("match_id", match_ids)
        .execute()
        .data
        or []
    )
    odds_rows = (
        client.table("match_odds")
        .select("match_id, fetched_at")
        .in_("match_id", match_ids)
        .execute()
        .data
        or []
    )
    squad_rows = (
        client.table("match_squads")
        .select("match_id, fetched_at")
        .in_("match_id", match_ids)
        .execute()
        .data
        or []
    )
    espn_rows = (
        client.table("espn_match_data")
        .select("match_id, fetched_at")
        .in_("match_id", match_ids)
        .execute()
        .data
        or []
    )
    prediction_rows = (
        client.table("predictions")
        .select("match_id")
        .in_("match_id", match_ids)
        .execute()
        .data
        or []
    )

    enrich_by_match = {row["match_id"]: row for row in enrich_rows}
    odds_by_match: dict[str, list[dict]] = {}
    squads_by_match: dict[str, list[dict]] = {}
    espn_by_match: dict[str, list[dict]] = {}
    prediction_ids = {row["match_id"] for row in prediction_rows}

    for row in odds_rows:
        odds_by_match.setdefault(row["match_id"], []).append(row)
    for row in squad_rows:
        squads_by_match.setdefault(row["match_id"], []).append(row)
    for row in espn_rows:
        espn_by_match.setdefault(row["match_id"], []).append(row)

    candidates: list[Candidate] = []
    stale_cutoff = timedelta(minutes=stale_minutes)

    for match in matches:
        match_id = match["match_id"]
        kickoff = parse_timestamp(match["date"])
        if kickoff is None:
            continue

        hours_to_start = round((kickoff - now).total_seconds() / 3600, 1)
        enrichment = enrich_by_match.get(match_id)
        generated_at = parse_timestamp(enrichment.get("generated_at") if enrichment else None)
        latest_source = max(
            [
                ts for ts in [
                    latest_timestamp(odds_by_match.get(match_id, []), "fetched_at"),
                    latest_timestamp(squads_by_match.get(match_id, []), "fetched_at"),
                    latest_timestamp(espn_by_match.get(match_id, []), "fetched_at"),
                ] if ts is not None
            ],
            default=None,
        )

        reasons: list[str] = []
        priority = 0

        if match_id not in prediction_ids:
            reasons.append("prediction-missing")
            priority += 5

        if enrichment is None:
            reasons.append("garnish-missing")
            priority += 100
        elif generated_at is not None and now - generated_at >= stale_cutoff:
            reasons.append("garnish-stale")
            priority += 30

        if latest_source and (generated_at is None or latest_source > generated_at):
            reasons.append("source-updated-since-garnish")
            priority += 45

        if hours_to_start <= 6:
            reasons.append("starts-within-6h")
            priority += 40
        elif hours_to_start <= 24:
            reasons.append("starts-within-24h")
            priority += 20
        elif hours_to_start <= 72:
            reasons.append("starts-within-72h")
            priority += 5

        if enrichment and enrichment.get("confidence") == "low":
            reasons.append("low-confidence-garnish")
            priority += 10

        if not reasons:
            continue

        candidates.append(
            Candidate(
                match_id=match_id,
                team1=match["team1"],
                team2=match["team2"],
                date=match["date"],
                hours_to_start=hours_to_start,
                priority=priority,
                reasons=reasons,
                garnish_generated_at=enrichment.get("generated_at") if enrichment else None,
                latest_source_update=latest_source.isoformat() if latest_source else None,
            )
        )

    candidates.sort(key=lambda item: (-item.priority, item.hours_to_start, item.team1, item.team2))
    return candidates[:limit]


def emit_text(candidates: list[Candidate]) -> str:
    if not candidates:
        return "No garnish candidates found."

    lines = [
        "Hourly garnish candidates:",
        "",
    ]
    for idx, item in enumerate(candidates, start=1):
        lines.extend(
            [
                f"{idx}. {item.team1} vs {item.team2}",
                f"   match_id: {item.match_id}",
                f"   starts_in_hours: {item.hours_to_start}",
                f"   priority: {item.priority}",
                f"   reasons: {', '.join(item.reasons)}",
                f"   garnish_generated_at: {item.garnish_generated_at or 'missing'}",
                f"   latest_source_update: {item.latest_source_update or 'unknown'}",
            ]
        )
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Select hourly Copilot garnish candidates")
    parser.add_argument("--hours-ahead", type=int, default=72, help="Only consider matches starting within this many hours")
    parser.add_argument("--stale-minutes", type=int, default=60, help="Treat garnish older than this as stale")
    parser.add_argument("--limit", type=int, default=8, help="Maximum candidates to emit")
    parser.add_argument(
        "--format",
        choices=("text", "json", "ids"),
        default="text",
        help="Output format for Copilot automation consumption",
    )
    args = parser.parse_args()

    candidates = build_candidates(
        hours_ahead=args.hours_ahead,
        stale_minutes=args.stale_minutes,
        limit=args.limit,
    )

    if args.format == "json":
        print(json.dumps([candidate.__dict__ for candidate in candidates], indent=2))
    elif args.format == "ids":
        print(" ".join(candidate.match_id for candidate in candidates))
    else:
        print(emit_text(candidates))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
