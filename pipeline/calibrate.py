"""Calibrate prediction probabilities using isotonic regression."""

import logging
from typing import Optional

import numpy as np
from sklearn.isotonic import IsotonicRegression

from utils.db import get_all_predictions, get_client

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

MIN_PREDICTIONS_FOR_CALIBRATION = 50


def compute_calibration(predictions: list[dict]) -> Optional[IsotonicRegression]:
    """
    Fit an isotonic regression model for probability calibration.

    Args:
        predictions: List of scored prediction results

    Returns:
        Fitted IsotonicRegression model, or None if insufficient data
    """
    if len(predictions) < MIN_PREDICTIONS_FOR_CALIBRATION:
        logger.info(
            f"Only {len(predictions)} predictions available, "
            f"need {MIN_PREDICTIONS_FOR_CALIBRATION} for calibration."
        )
        return None

    # Extract predicted probabilities and actual outcomes
    predicted_probs = []
    actual_outcomes = []

    for pred in predictions:
        prob = pred.get("predicted_probability")
        correct = pred.get("correct")
        if prob is not None and correct is not None:
            predicted_probs.append(prob)
            actual_outcomes.append(1.0 if correct else 0.0)

    if len(predicted_probs) < MIN_PREDICTIONS_FOR_CALIBRATION:
        return None

    predicted_probs = np.array(predicted_probs)
    actual_outcomes = np.array(actual_outcomes)

    # Fit isotonic regression
    iso_reg = IsotonicRegression(y_min=0.0, y_max=1.0, out_of_bounds="clip")
    iso_reg.fit(predicted_probs, actual_outcomes)

    return iso_reg


def compute_calibration_bins(predictions: list[dict], n_bins: int = 10) -> list[dict]:
    """
    Compute calibration bins for visualization.

    Returns list of dicts with bin_center, predicted_avg, actual_avg, count
    """
    predicted_probs = []
    actual_outcomes = []

    for pred in predictions:
        prob = pred.get("predicted_probability")
        correct = pred.get("correct")
        if prob is not None and correct is not None:
            predicted_probs.append(prob)
            actual_outcomes.append(1.0 if correct else 0.0)

    predicted_probs = np.array(predicted_probs)
    actual_outcomes = np.array(actual_outcomes)

    bins = np.linspace(0.5, 1.0, n_bins + 1)
    calibration_data = []

    for i in range(n_bins):
        mask = (predicted_probs >= bins[i]) & (predicted_probs < bins[i + 1])
        if mask.sum() > 0:
            calibration_data.append({
                "bin_center": round((bins[i] + bins[i + 1]) / 2, 3),
                "predicted_avg": round(float(predicted_probs[mask].mean()), 4),
                "actual_avg": round(float(actual_outcomes[mask].mean()), 4),
                "count": int(mask.sum()),
            })

    return calibration_data


def store_calibration(calibration_bins: list[dict]) -> None:
    """Store calibration data in Supabase for frontend consumption."""
    client = get_client()
    client.table("stats_cache").upsert(
        [{"stat_type": "calibration", "match_type": "all", "data": calibration_bins}],
        on_conflict="stat_type,match_type",
    ).execute()


def main() -> None:
    """Run calibration pipeline."""
    logger.info("Loading scored predictions...")
    predictions = get_all_predictions()
    logger.info(f"Found {len(predictions)} scored predictions")

    # Compute calibration model
    model = compute_calibration(predictions)
    if model is None:
        logger.info("Insufficient data for calibration. Skipping.")
        return

    # Compute calibration bins for visualization
    calibration_bins = compute_calibration_bins(predictions)
    logger.info(f"Calibration bins: {calibration_bins}")

    # Store calibration data
    store_calibration(calibration_bins)
    logger.info("Calibration data stored.")


if __name__ == "__main__":
    main()
