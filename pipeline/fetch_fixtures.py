"""Fetch upcoming cricket fixtures from CricAPI and store in Supabase.

Also detects completed matches from the fixtures response and scores
any pending predictions — avoiding extra CricAPI calls to match_info.
"""

import argparse
import logging
from datetime import datetime
from typing import Optional

from utils.cricapi import fetch_all_current_matches
from utils.db import get_client, replace_upcoming_matches

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


def main(match_types: Optional[list[str]] = None) -> None:
    """
    Fetch current fixtures from CricAPI and store in database.
    Also scores any completed matches found in the response.

    Args:
        match_types: List of match types to fetch (default: ["odi", "t20"])
    """
    if match_types is None:
        match_types = ["odi", "t20"]

    logger.info("Fetching current matches...")
    upcoming, completed = fetch_all_current_matches(match_types)
    logger.info(f"Found {len(upcoming)} upcoming, {len(completed)} completed matches")

    logger.info("Upserting upcoming matches...")
    replace_upcoming_matches(upcoming)

    if completed:
        logger.info(f"Processing {len(completed)} completed matches for scoring...")
        scored = _process_completed_matches(completed)
        logger.info(f"Scored {scored} predictions from fixtures data")

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
