"""Refresh garnish-only match copy for the highest-priority upcoming fixtures."""

from __future__ import annotations

import argparse
import logging

from enrich_matches import enrich_match
from fetch_headshots import process_squads as resolve_missing_headshots
from fetch_player_stats import fetch_stats_for_match_squads
from fetch_squads import fetch_and_store_squads
from select_garnish_candidates import Candidate, build_candidates, emit_text
from utils.db import (
    get_prediction,
    get_upcoming_matches,
    store_match_enrichment,
    store_prediction_garnish,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


def _clean_text(value: str | None) -> str:
    return " ".join((value or "").split())


def _format_probability(value: object) -> str:
    if isinstance(value, (int, float)):
        return f"{value:.0%}"
    return "n/a"


def _summarize_player_updates(updates: list[dict], limit: int = 2) -> str:
    snippets: list[str] = []
    for update in updates:
        player = _clean_text(str(update.get("player") or ""))
        status = _clean_text(str(update.get("status") or ""))
        team = _clean_text(str(update.get("team") or ""))
        if not player or not status:
            continue
        label = f"{player} ({team})" if team else player
        snippets.append(f"{label}: {status}")
        if len(snippets) >= limit:
            break
    if not snippets:
        return ""
    return "Reported player notes: " + "; ".join(snippets) + "."


def build_prediction_garnish_reasoning(prediction: dict, enrichment: dict) -> str:
    """Refresh prediction copy while preserving the stored deterministic contract."""
    team1 = prediction.get("team1") or "Team 1"
    team2 = prediction.get("team2") or "Team 2"
    predicted_winner = prediction.get("predicted_winner") or team1
    team1_prob = prediction.get("team1_win_probability")
    team2_prob = prediction.get("team2_win_probability")
    favorite_prob = max(
        value for value in (team1_prob, team2_prob)
        if isinstance(value, (int, float))
    ) if any(isinstance(value, (int, float)) for value in (team1_prob, team2_prob)) else None

    opening = (
        f"{predicted_winner} remain the SixSense pick at {_format_probability(favorite_prob)} "
        f"win probability ({team1} {_format_probability(team1_prob)}, {team2} {_format_probability(team2_prob)}); "
        "this garnish refresh does not alter the deterministic core."
    )

    preview = _clean_text(enrichment.get("expert_preview"))
    if not preview:
        preview = (
            "No new source-backed match preview was available beyond the latest structured data, "
            "so the pre-match read stays conservative."
        )

    updates = _summarize_player_updates(enrichment.get("player_updates") or [])
    return " ".join(part for part in (opening, preview, updates) if part)


def _refresh_match_inputs(match_id: str) -> None:
    fetch_and_store_squads(match_ids=[match_id], force=False)
    fetch_stats_for_match_squads(match_id=match_id, force=False)
    resolve_missing_headshots(match_ids=[match_id], force=False)


def refresh_candidate(candidate: Candidate, match: dict, source_limit: int) -> dict:
    logger.info(
        "Refreshing garnish for %s vs %s | priority=%s | reasons=%s",
        candidate.team1,
        candidate.team2,
        candidate.priority,
        ",".join(candidate.reasons),
    )

    _refresh_match_inputs(candidate.match_id)
    enrichment = enrich_match(match, source_limit=source_limit)
    store_match_enrichment(enrichment)

    prediction = get_prediction(candidate.match_id)
    prediction_updated = False
    if prediction:
        prediction_updated = store_prediction_garnish(
            candidate.match_id,
            reasoning=build_prediction_garnish_reasoning(prediction, enrichment),
            toss_insight=enrichment.get("toss_insight") or prediction.get("toss_insight"),
        )
    else:
        logger.warning("No prediction row present for %s; refreshed match_enrichment only", candidate.match_id)

    logger.info(
        "Completed garnish refresh for %s | prediction_garnish_updated=%s",
        candidate.match_id,
        prediction_updated,
    )
    return {
        "match_id": candidate.match_id,
        "prediction_updated": prediction_updated,
        "source_count": len(enrichment.get("source_links") or []),
    }


def main(hours_ahead: int, stale_minutes: int, limit: int, source_limit: int) -> int:
    candidates = build_candidates(
        hours_ahead=hours_ahead,
        stale_minutes=stale_minutes,
        limit=limit,
    )
    print(emit_text(candidates))
    if not candidates:
        logger.info("No garnish candidates found.")
        return 0

    matches = {
        match["match_id"]: match
        for match in get_upcoming_matches(future_only=True)
        if match.get("match_id")
    }

    refreshed = 0
    for candidate in candidates:
        match = matches.get(candidate.match_id)
        if not match:
            logger.warning("Skipping %s because the upcoming match record is unavailable", candidate.match_id)
            continue
        refresh_candidate(candidate, match, source_limit)
        refreshed += 1

    logger.info("Garnish refresh complete. Refreshed %s/%s candidates.", refreshed, len(candidates))
    return 0 if refreshed else 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Refresh garnish-only fields for prioritized upcoming matches")
    parser.add_argument("--hours-ahead", type=int, default=72, help="Only consider matches starting within this many hours")
    parser.add_argument("--stale-minutes", type=int, default=60, help="Treat garnish older than this as stale")
    parser.add_argument("--limit", type=int, default=8, help="Maximum candidates to refresh")
    parser.add_argument("--source-limit", type=int, default=8, help="Maximum reputable sources per match")
    args = parser.parse_args()
    raise SystemExit(
        main(
            hours_ahead=args.hours_ahead,
            stale_minutes=args.stale_minutes,
            limit=args.limit,
            source_limit=args.source_limit,
        )
    )
