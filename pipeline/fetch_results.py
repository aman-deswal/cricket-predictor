"""Fetch completed match results and score predictions."""

import logging
from datetime import datetime

from utils.cricapi import fetch_match_result
from utils.db import get_client, get_pending_results, store_result

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


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


def main() -> None:
    """Check for completed matches and score predictions."""
    logger.info("Checking for completed matches...")

    # Get matches with predictions that haven't been scored
    client = get_client()
    response = (
        client.table("predictions")
        .select("*")
        .is_("scored_at", "null")
        .execute()
    )
    pending_predictions = response.data

    logger.info(f"Found {len(pending_predictions)} unscored predictions")

    scored = 0
    for prediction in pending_predictions:
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

    logger.info(f"Scored {scored} predictions.")


if __name__ == "__main__":
    main()
