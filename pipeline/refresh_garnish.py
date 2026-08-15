"""Refresh garnish-only fields for selected upcoming matches."""

from __future__ import annotations

import argparse
import logging
from datetime import datetime, timezone
from typing import Optional

from enrich_matches import enrich_match
from predict import build_context, _build_toss_insight
from select_garnish_candidates import Candidate, build_candidates, emit_text
from utils.db import (
    get_prediction,
    get_upcoming_matches,
    store_match_garnish,
    update_prediction_garnish,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

ALLOWED_SOURCE_LINK_FIELDS = ("title", "url", "source", "published_at")


def trim_source_links(source_links: list[dict] | None) -> list[dict]:
    trimmed: list[dict] = []
    for entry in source_links or []:
        if not isinstance(entry, dict):
            continue
        trimmed.append({
            field: entry.get(field)
            for field in ALLOWED_SOURCE_LINK_FIELDS
            if entry.get(field) is not None
        })
    return trimmed


def build_match_garnish_payload(
    match_id: str,
    enrichment: dict,
    generated_at: Optional[str] = None,
) -> dict:
    return {
        "match_id": match_id,
        "expert_preview": enrichment.get("expert_preview"),
        "player_updates": enrichment.get("player_updates") or [],
        "source_links": trim_source_links(enrichment.get("source_links")),
        "generated_at": generated_at or datetime.now(timezone.utc).isoformat(),
    }


def build_prediction_reasoning(context: dict, prediction: dict) -> str:
    team1 = context["team1"]
    team2 = context["team2"]
    predicted_winner = prediction.get("predicted_winner") or team1
    team1_prob = float(prediction.get("team1_win_probability") or 0.5)
    team2_prob = float(prediction.get("team2_win_probability") or 0.5)
    favorite_prob = team1_prob if predicted_winner == team1 else team2_prob

    sentences = [
        (
            f"{predicted_winner} remain the stored SixSense pick at {favorite_prob:.0%} win probability, "
            f"and this garnish refresh leaves that deterministic call unchanged."
        ),
        (
            f"Recent {context['match_type'].upper()} form has {team1} at {context['team1_win_rate']:.0%} from "
            f"{context['team1_matches']} tracked matches and {team2} at {context['team2_win_rate']:.0%} from "
            f"{context['team2_matches']}, with the head-to-head at {context['h2h_team1_wins']}-"
            f"{context['h2h_team2_wins']} across {context['h2h_total']} meetings."
        ),
    ]

    if context["odds_data"]:
        odds = context["odds_data"]
        sentences.append(
            f"Latest market context from {odds.get('bookmaker') or 'the sportsbook feed'} lists "
            f"{team1} at {odds['team1_odds']:.2f} and {team2} at {odds['team2_odds']:.2f}, which informs the "
            f"surrounding narrative while keeping the stored winner and probabilities intact."
        )
    else:
        sentences.append(
            "No fresh sportsbook line was available during this refresh, so the narrative leans on form, "
            "head-to-head, and the existing deterministic probabilities."
        )

    return " ".join(sentences)


def refresh_match(match: dict, source_limit: int) -> tuple[dict, bool]:
    match_id = match["match_id"]
    enrichment = enrich_match(match, source_limit=source_limit)
    garnish = build_match_garnish_payload(match_id, enrichment)
    store_match_garnish(garnish)

    prediction = get_prediction(match_id)
    if not prediction:
        logger.warning("  No stored prediction found for %s; refreshed match_enrichment garnish only", match_id)
        return garnish, False

    context = build_context(match)
    toss_insight = enrichment.get("toss_insight") or _build_toss_insight(
        context,
        prediction.get("predicted_winner") or context["team1"],
    )
    update_prediction_garnish(
        match_id,
        build_prediction_reasoning(context, prediction),
        toss_insight,
    )
    return garnish, True


def resolve_target_matches(
    *,
    explicit_match_ids: Optional[list[str]],
    hours_ahead: int,
    stale_minutes: int,
    limit: int,
) -> tuple[list[Candidate], list[dict]]:
    all_matches = {
        match["match_id"]: match
        for match in get_upcoming_matches(future_only=True)
        if match.get("match_id")
    }

    if explicit_match_ids:
        candidates = [
            Candidate(
                match_id=match_id,
                team1=all_matches[match_id]["team1"],
                team2=all_matches[match_id]["team2"],
                date=all_matches[match_id]["date"],
                hours_to_start=0.0,
                priority=0,
                reasons=["manual-selection"],
                garnish_generated_at=None,
                latest_source_update=None,
            )
            for match_id in explicit_match_ids
            if match_id in all_matches
        ]
    else:
        candidates = build_candidates(
            hours_ahead=hours_ahead,
            stale_minutes=stale_minutes,
            limit=limit,
        )

    ordered_matches = [all_matches[item.match_id] for item in candidates if item.match_id in all_matches]
    return candidates, ordered_matches


def main(
    *,
    match_ids: Optional[list[str]],
    hours_ahead: int,
    stale_minutes: int,
    limit: int,
    source_limit: int,
) -> int:
    candidates, matches = resolve_target_matches(
        explicit_match_ids=match_ids,
        hours_ahead=hours_ahead,
        stale_minutes=stale_minutes,
        limit=limit,
    )

    if not matches:
        logger.info("No garnish candidates found.")
        return 0

    logger.info("\n%s", emit_text(candidates))
    logger.info("Refreshing garnish for %s upcoming matches", len(matches))

    prediction_updates = 0
    for index, (candidate, match) in enumerate(zip(candidates, matches), start=1):
        logger.info(
            "[%s/%s] %s vs %s | priority=%s | reasons=%s",
            index,
            len(matches),
            match["team1"],
            match["team2"],
            candidate.priority,
            ",".join(candidate.reasons),
        )
        _, updated_prediction = refresh_match(match, source_limit=source_limit)
        if updated_prediction:
            prediction_updates += 1

    logger.info(
        "Garnish refresh complete: %s match_enrichment rows refreshed, %s prediction garnish rows refreshed",
        len(matches),
        prediction_updates,
    )
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Refresh garnish-only fields for upcoming matches")
    parser.add_argument("--match-id", action="append", dest="match_ids", help="Refresh one specific match ID")
    parser.add_argument("--hours-ahead", type=int, default=72, help="Only consider matches starting within this many hours")
    parser.add_argument("--stale-minutes", type=int, default=60, help="Treat garnish older than this as stale")
    parser.add_argument("--limit", type=int, default=8, help="Maximum candidates to refresh")
    parser.add_argument("--source-limit", type=int, default=8, help="Maximum reputable sources per match")
    args = parser.parse_args()
    raise SystemExit(
        main(
            match_ids=args.match_ids,
            hours_ahead=args.hours_ahead,
            stale_minutes=args.stale_minutes,
            limit=args.limit,
            source_limit=args.source_limit,
        )
    )
