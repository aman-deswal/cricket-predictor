"""Fetch upcoming cricket fixtures and store in Supabase.

Data sources (in priority order):
1. **ESPN Cricinfo** (primary) — free, unlimited. Uses the scoreboard/header
   endpoint for upcoming matches across all cricket leagues, plus series-
   specific scoreboards for known leagues.
2. **CricAPI** (supplementary) — 100 calls/day free tier. Adds matches that
   ESPN header doesn't cover.

Also detects completed matches from both sources and scores any pending
predictions.
"""

import argparse
import logging
from datetime import datetime
from typing import Optional

from utils.cricapi import fetch_all_current_matches
from utils.db import get_client, replace_upcoming_matches
from utils.espn import (
    get_espn_fixtures,
    get_espn_match_winner,
    get_series_fixtures,
    match_espn_to_cricapi,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


def _extract_winner(match: dict) -> Optional[str]:
    """Try to determine winner from a cricScore response entry.

    CricAPI cricScore returns ``matchEnded`` (bool) and a ``status`` string
    like "India won by 5 wickets".  The ``matchWinner`` field is also present
    on some payloads.
    """
    if not match.get("matchEnded", False):
        return None

    # Prefer explicit matchWinner field
    winner = match.get("matchWinner")
    if winner:
        return winner

    status = match.get("status", "")
    if not status:
        return None

    # Pattern: "<Team> won by …"
    if " won by " in status:
        return status.split(" won by ")[0].strip()

    return None


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


def _process_completed_matches(completed: list[dict]) -> int:
    """Score predictions for completed matches. Returns number scored."""
    if not completed:
        return 0

    client = get_client()
    scored = 0

    for match in completed:
        match_id = match["id"]
        winner = _extract_winner(match)
        if not winner:
            continue

        # Update match status
        client.table("matches").update({
            "status": "completed",
            "winner": winner,
        }).eq("match_id", match_id).execute()

        # Look up unscored prediction
        response = (
            client.table("predictions")
            .select("*")
            .eq("match_id", match_id)
            .is_("scored_at", "null")
            .execute()
        )
        if not response.data:
            continue

        prediction = response.data[0]
        result = _score_prediction(prediction, winner)

        # Insert prediction result
        client.table("prediction_results").upsert(
            result, on_conflict="prediction_id"
        ).execute()

        # Mark prediction as scored
        client.table("predictions").update({
            "scored_at": datetime.utcnow().isoformat(),
        }).eq("match_id", match_id).execute()

        correct_str = "✓" if result["correct"] else "✗"
        logger.info(
            f"Scored: {prediction['team1']} vs {prediction['team2']} → "
            f"winner={winner}, predicted={prediction['predicted_winner']} {correct_str}"
        )
        scored += 1

    return scored


def _store_espn_event_mappings(mapping: dict[str, str]) -> int:
    """Store ESPN event ID mappings in espn_match_data table.

    Only inserts for match_ids that don't already have an entry.
    Returns number of new mappings stored.
    """
    if not mapping:
        return 0

    client = get_client()
    stored = 0

    for match_id, espn_event_id in mapping.items():
        # Check if already exists
        existing = (
            client.table("espn_match_data")
            .select("match_id")
            .eq("match_id", match_id)
            .execute()
        )
        if existing.data:
            continue

        # Insert minimal record — fetch_espn.py will fill in details later
        try:
            client.table("espn_match_data").insert({
                "match_id": match_id,
                "espn_event_id": espn_event_id,
            }).execute()
            stored += 1
        except Exception as e:
            logger.debug(f"Failed to store ESPN mapping for {match_id}: {e}")

    return stored


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

        # Look up unscored prediction
        pred_resp = (
            client.table("predictions")
            .select("*")
            .eq("match_id", match_id)
            .is_("scored_at", "null")
            .execute()
        )
        if not pred_resp.data:
            continue

        prediction = pred_resp.data[0]

        # Map ESPN winner name to our team names
        from utils.espn import _normalize_team
        norm_winner = _normalize_team(espn_winner)
        actual = None
        if _normalize_team(prediction["team1"]) == norm_winner or norm_winner in _normalize_team(prediction["team1"]):
            actual = prediction["team1"]
        elif _normalize_team(prediction["team2"]) == norm_winner or norm_winner in _normalize_team(prediction["team2"]):
            actual = prediction["team2"]
        else:
            logger.warning(f"ESPN winner '{espn_winner}' doesn't match {prediction['team1']}/{prediction['team2']}")
            continue

        # Update match status
        client.table("matches").update({
            "status": "completed",
            "winner": actual,
        }).eq("match_id", match_id).execute()

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
    Fetch current fixtures from ESPN (primary) + CricAPI (supplementary).
    Auto-maps ESPN event IDs to CricAPI matches for downstream enrichment.
    Also scores any completed matches found in either response.

    Args:
        match_types: List of match types to fetch (default: ["odi", "t20"])
    """
    if match_types is None:
        match_types = ["odi", "t20"]

    # --- Phase 1: ESPN fixture discovery ---
    logger.info("Phase 1: Fetching fixtures from ESPN...")
    espn_fixtures = get_espn_fixtures()
    logger.info(f"ESPN: {len(espn_fixtures)} fixtures from header")

    # --- Phase 2: CricAPI fixtures (supplementary) ---
    logger.info("Phase 2: Fetching fixtures from CricAPI...")
    try:
        upcoming, completed = fetch_all_current_matches(match_types)
        logger.info(f"CricAPI: {len(upcoming)} upcoming, {len(completed)} completed")
    except Exception as e:
        logger.warning(f"CricAPI failed (rate limit?): {e}")
        upcoming, completed = [], []

    # --- Phase 3: Upsert matches ---
    if upcoming:
        logger.info("Upserting CricAPI matches...")
        replace_upcoming_matches(upcoming)

    # --- Phase 3b: ESPN fallback — upsert upcoming fixtures when CricAPI is unavailable ---
    espn_upcoming = _espn_fixtures_to_matches(espn_fixtures)
    if espn_upcoming:
        if not upcoming:
            logger.info(f"CricAPI unavailable — upserting {len(espn_upcoming)} ESPN upcoming fixtures as fallback...")
        else:
            logger.info(f"Supplementing with {len(espn_upcoming)} ESPN upcoming fixtures...")
        replace_upcoming_matches(espn_upcoming)

    # --- Phase 4: Auto-map ESPN event IDs onto matches ---
    # For ESPN-sourced matches the espn_event_id is already embedded in match_id;
    # stamp it on the matches table and espn_match_data for downstream enrichment.
    if espn_upcoming:
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

    if upcoming and espn_fixtures:
        logger.info("Auto-mapping ESPN event IDs to matches...")
        mapping = match_espn_to_cricapi(espn_fixtures, upcoming)
        if mapping:
            # Store on espn_match_data table (backward compat)
            stored = _store_espn_event_mappings(mapping)
            # Also stamp espn_event_id directly on matches table
            client = get_client()
            stamped = 0
            for match_id, espn_event_id in mapping.items():
                try:
                    client.table("matches").update({
                        "espn_event_id": espn_event_id,
                    }).eq("match_id", match_id).execute()
                    stamped += 1
                except Exception:
                    pass
            logger.info(f"ESPN IDs: {stored} new in espn_match_data, {stamped} stamped on matches table (of {len(mapping)} matched)")
        else:
            logger.info("No new ESPN ↔ CricAPI matches found")

    # --- Phase 5: Score completed matches ---
    total_scored = 0

    # Score from CricAPI completed matches
    if completed:
        logger.info(f"Scoring from CricAPI: {len(completed)} completed matches...")
        total_scored += _process_completed_matches(completed)

    # Score from ESPN completed matches
    if espn_fixtures:
        espn_completed = [f for f in espn_fixtures if f.get("status") == "post" and f.get("winner")]
        if espn_completed:
            logger.info(f"Scoring from ESPN: {len(espn_completed)} completed matches...")
            total_scored += _score_espn_completed(espn_fixtures)

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
