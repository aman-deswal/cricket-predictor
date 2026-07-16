"""Fetch completed match results and score predictions.

This is a *backup* scorer. Primary scoring now happens inside
``fetch_fixtures.py`` using the cricScore response data, which avoids
extra CricAPI calls.  This script only calls ``match_info`` for a small
batch (max 3) of still-unscored predictions whose match date has passed.
"""

import logging
from datetime import datetime, timezone

from utils.cricapi import fetch_match_result
from utils.db import get_client, get_pending_results, store_result

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

MAX_API_CALLS = 3


def score_prediction(prediction: dict, actual_winner: str) -> dict:
    """
    Score a prediction against the actual result.

    Args:
        prediction: Prediction record with probabilities
        actual_winner: Actual match winner

    Returns:
        Result dict with scoring metrics
    """
    predicted_winner = prediction["predicted_winner"]
    correct = predicted_winner == actual_winner

    # Brier score component: (predicted_prob - actual)^2
    if actual_winner == prediction["team1"]:
        brier = (prediction["team1_win_probability"] - 1.0) ** 2
    elif actual_winner == prediction["team2"]:
        brier = (prediction["team2_win_probability"] - 1.0) ** 2
    else:
        # Draw or no result
        brier = None

    return {
        "prediction_id": prediction["match_id"],
        "match_id": prediction["match_id"],
        "predicted_winner": predicted_winner,
        "actual_winner": actual_winner,
        "correct": correct,
        "brier_score": brier,
        "predicted_probability": max(prediction["team1_win_probability"], prediction["team2_win_probability"]),
        "scored_at": datetime.utcnow().isoformat(),
    }


def update_match_status(match_id: str, winner: str) -> None:
    """Mark a match as completed in the database."""
    client = get_client()
    client.table("matches").update({
        "status": "completed",
        "winner": winner,
    }).eq("match_id", match_id).execute()


def _is_match_in_past(prediction: dict) -> bool:
    """Return True if the match date is in the past (worth checking for results)."""
    date_str = prediction.get("date") or prediction.get("match_date", "")
    if not date_str:
        # No date info — assume it could be finished
        return True
    try:
        match_time = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
        if match_time.tzinfo is None:
            match_time = match_time.replace(tzinfo=timezone.utc)
        return match_time < datetime.now(timezone.utc)
    except (ValueError, TypeError):
        return True


def main() -> None:
    """Check for completed matches and score predictions (backup, max 3 API calls)."""
    logger.info("Backup result scorer — checking for completed matches...")

    client = get_client()
    response = (
        client.table("predictions")
        .select("*")
        .is_("scored_at", "null")
        .execute()
    )
    pending_predictions = response.data

    logger.info(f"Found {len(pending_predictions)} unscored predictions")

    # Filter to only past matches, then cap at MAX_API_CALLS
    past_predictions = [p for p in pending_predictions if _is_match_in_past(p)]
    batch = past_predictions[:MAX_API_CALLS]

    if len(past_predictions) > MAX_API_CALLS:
        logger.info(
            f"Rate-limiting: checking {MAX_API_CALLS} of {len(past_predictions)} "
            f"past-date predictions (skipped {len(pending_predictions) - len(past_predictions)} future)"
        )

    scored = 0
    for prediction in batch:
        match_id = prediction["match_id"]
        result = fetch_match_result(match_id)

        if result is None:
            continue

        logger.info(f"Match completed: {prediction['team1']} vs {prediction['team2']}")
        logger.info(f"  Winner: {result['winner']}")

        # Update match status
        update_match_status(match_id, result["winner"])

        # Score the prediction
        scored_result = score_prediction(prediction, result["winner"])
        store_result(scored_result)

        # Mark prediction as scored
        client.table("predictions").update({
            "scored_at": datetime.utcnow().isoformat(),
        }).eq("match_id", match_id).execute()

        correct_str = "✓" if scored_result["correct"] else "✗"
        logger.info(f"  Prediction: {prediction['predicted_winner']} {correct_str}")
        scored += 1

    logger.info(f"Scored {scored} predictions (API calls used: {len(batch)}/{MAX_API_CALLS}).")


if __name__ == "__main__":
    main()
