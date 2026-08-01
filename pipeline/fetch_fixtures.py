"""Fetch upcoming cricket fixtures and store in Supabase.

Uses ESPN Cricinfo exclusively — free, unlimited. Fetches all upcoming and
recently completed matches from the ESPN header endpoint.

Also detects completed matches and scores any pending predictions.
"""

import argparse
import logging
from datetime import datetime
from typing import Optional

from utils.db import get_client, replace_upcoming_matches
from utils.espn import (
    get_espn_fixtures,
    get_espn_match_winner,
    get_series_fixtures,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


def _status_rank(status: str) -> int:
    """Higher rank = more progressed match state."""
    if status == "post":
        return 3
    if status == "in":
        return 2
    if status == "pre":
        return 1
    return 0


def _merge_fixtures_by_event(fixtures: list[dict]) -> list[dict]:
    """Deduplicate fixtures by ESPN event ID, keeping the best-quality row."""
    merged: dict[str, dict] = {}
    for fixture in fixtures:
        event_id = fixture.get("espn_event_id")
        if not event_id:
            continue

        current = merged.get(event_id)
        if current is None:
            merged[event_id] = fixture
            continue

        current_rank = _status_rank(current.get("status", ""))
        incoming_rank = _status_rank(fixture.get("status", ""))
        if incoming_rank > current_rank:
            merged[event_id] = fixture
            continue

        # Same status: prefer row with venue populated.
        if incoming_rank == current_rank and fixture.get("venue") and not current.get("venue"):
            merged[event_id] = fixture

    return list(merged.values())


def _score_prediction(prediction: dict, actual_winner: str) -> dict:
    """Score a single prediction against the actual winner."""
    predicted_winner = prediction["predicted_winner"]
    correct = predicted_winner == actual_winner

    if actual_winner == prediction["team1"]:
        brier = (prediction["team1_win_probability"] - 1.0) ** 2
    elif actual_winner == prediction["team2"]:
        brier = (prediction["team2_win_probability"] - 1.0) ** 2
    else:
        brier = None

    return {
        "prediction_id": prediction["match_id"],
        "match_id": prediction["match_id"],
        "predicted_winner": predicted_winner,
        "actual_winner": actual_winner,
        "correct": correct,
        "brier_score": brier,
        "predicted_probability": max(
            prediction["team1_win_probability"],
            prediction["team2_win_probability"],
        ),
        "scored_at": datetime.utcnow().isoformat(),
    }


def _score_espn_completed(espn_fixtures: list[dict]) -> int:
    """Score predictions for matches ESPN reports as completed.

    Returns number of predictions scored.
    """
    completed = [f for f in espn_fixtures if f.get("status") == "post" and f.get("winner")]
    if not completed:
        return 0

    client = get_client()
    scored = 0

    for fixture in completed:
        espn_winner = fixture["winner"]
        espn_eid = fixture["espn_event_id"]

        # Find our match by ESPN event ID
        espn_rec = (
            client.table("espn_match_data")
            .select("match_id")
            .eq("espn_event_id", espn_eid)
            .execute()
        )
        if not espn_rec.data:
            continue

        match_id = espn_rec.data[0]["match_id"]

        match_resp = (
            client.table("matches")
            .select("match_id, team1, team2")
            .eq("match_id", match_id)
            .execute()
        )
        if not match_resp.data:
            continue

        # Map ESPN winner name to our team names
        from utils.espn import _normalize_team
        norm_winner = _normalize_team(espn_winner)
        match = match_resp.data[0]
        actual = None
        if _normalize_team(match["team1"]) == norm_winner or norm_winner in _normalize_team(match["team1"]):
            actual = match["team1"]
        elif _normalize_team(match["team2"]) == norm_winner or norm_winner in _normalize_team(match["team2"]):
            actual = match["team2"]
        else:
            logger.warning(f"ESPN winner '{espn_winner}' doesn't match {match['team1']}/{match['team2']}")
            continue

        client.table("matches").update({
            "status": "completed",
            "winner": actual,
        }).eq("match_id", match_id).execute()

        # Look up unscored prediction, if one exists.
        pred_resp = (
            client.table("predictions")
            .select("*")
            .eq("match_id", match_id)
            .is_("scored_at", "null")
            .execute()
        )
        if not pred_resp.data:
            logger.info(f"ESPN completed: {match['team1']} vs {match['team2']} → winner={actual} (no prediction to score)")
            continue

        prediction = pred_resp.data[0]
        result = _score_prediction(prediction, actual)
        client.table("prediction_results").upsert(result, on_conflict="prediction_id").execute()
        client.table("predictions").update({"scored_at": datetime.utcnow().isoformat()}).eq("match_id", match_id).execute()

        correct_str = "✓" if result["correct"] else "✗"
        logger.info(f"ESPN scored: {prediction['team1']} vs {prediction['team2']} → winner={actual} {correct_str}")
        scored += 1

    return scored


def _infer_match_type(league_name: str) -> str:
    """Infer a match type string from an ESPN league name."""
    lower = league_name.lower()
    if "test" in lower:
        return "Test"
    if "odi" in lower or "one day" in lower or "one-day" in lower:
        return "ODI"
    return "T20"


def _espn_fixtures_to_matches(espn_fixtures: list[dict]) -> list[dict]:
    """Convert ESPN 'pre' (upcoming) fixtures to matches-table rows.

    Uses 'espn-<event_id>' as a stable match_id so these records can coexist
    with CricAPI-sourced rows without collisions.
    """
    matches = []
    for f in espn_fixtures:
        if f.get("status") != "pre":
            continue
        espn_id = f.get("espn_event_id", "")
        if not espn_id:
            continue
        team1 = f.get("team1", "")
        team2 = f.get("team2", "")
        if not team1 or not team2:
            continue
        matches.append({
            "match_id": f"espn-{espn_id}",
            "name": f"{team1} vs {team2}",
            "team1": team1,
            "team2": team2,
            "date": f.get("date", ""),
            "venue": f.get("venue", ""),
            "match_type": _infer_match_type(f.get("league_name", "")),
            "status": "upcoming",
        })
    return matches


def main(match_types: Optional[list[str]] = None) -> None:
    """
    Fetch current fixtures from ESPN (free, unlimited).
    Upserts upcoming matches and scores completed ones.

    Args:
        match_types: Unused — kept for CLI backward compatibility.
    """
    # --- Phase 1: ESPN fixture discovery ---
    logger.info("Phase 1: Fetching fixtures from ESPN...")
    espn_fixtures = get_espn_fixtures()
    logger.info(f"ESPN header: found {len(espn_fixtures)} fixtures")

    # Header feed is often current-day biased; expand via league scoreboards.
    league_ids = sorted({f.get("league_id", "") for f in espn_fixtures if f.get("league_id")})
    series_fixtures: list[dict] = []
    for league_id in league_ids:
        league_rows = get_series_fixtures(league_id)
        if league_rows:
            series_fixtures.extend(league_rows)
    if series_fixtures:
        logger.info(f"ESPN series scoreboards: found {len(series_fixtures)} fixtures across {len(league_ids)} leagues")

    all_fixtures = _merge_fixtures_by_event([*espn_fixtures, *series_fixtures])
    logger.info(f"ESPN merged fixture set: {len(all_fixtures)} unique events")

    # --- Phase 2: Upsert upcoming fixtures ---
    espn_upcoming = _espn_fixtures_to_matches(all_fixtures)
    if espn_upcoming:
        logger.info(f"Upserting {len(espn_upcoming)} upcoming ESPN fixtures...")
        replace_upcoming_matches(espn_upcoming)

        # Stamp espn_event_id on matches row and create espn_match_data stubs
        client = get_client()
        for m in espn_upcoming:
            espn_eid = m["match_id"].removeprefix("espn-")
            try:
                client.table("matches").update({
                    "espn_event_id": espn_eid,
                }).eq("match_id", m["match_id"]).execute()
            except Exception:
                pass
            try:
                existing = client.table("espn_match_data").select("match_id").eq("match_id", m["match_id"]).execute()
                if not existing.data:
                    client.table("espn_match_data").insert({
                        "match_id": m["match_id"],
                        "espn_event_id": espn_eid,
                    }).execute()
            except Exception:
                pass
    else:
        logger.warning("No upcoming fixtures from ESPN header.")

    # --- Phase 3: Score completed matches ---
    espn_completed = [f for f in all_fixtures if f.get("status") == "post" and f.get("winner")]
    if espn_completed:
        logger.info(f"Scoring from ESPN: {len(espn_completed)} completed matches...")
        total_scored = _score_espn_completed(all_fixtures)
        if total_scored:
            logger.info(f"Total scored: {total_scored} predictions")

    logger.info("Done.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Fetch current cricket fixtures")
    parser.add_argument(
        "--types",
        nargs="+",
        default=["odi", "t20"],
        help="International match types to fetch (default: odi t20)",
    )
    args = parser.parse_args()
    main(match_types=args.types)
