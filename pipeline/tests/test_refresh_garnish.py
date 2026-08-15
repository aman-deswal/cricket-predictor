"""Tests for garnish-only refresh helpers."""

import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from refresh_garnish import build_prediction_garnish_reasoning


class TestRefreshGarnish(unittest.TestCase):
    def test_prediction_reasoning_keeps_core_and_adds_preview(self):
        prediction = {
            "team1": "India",
            "team2": "Australia",
            "predicted_winner": "India",
            "team1_win_probability": 0.61,
            "team2_win_probability": 0.39,
        }
        enrichment = {
            "expert_preview": "India arrive with the stronger recent ODI base, while Australia's seamers keep the margin honest.",
            "player_updates": [
                {"player": "Virat Kohli", "team": "India", "status": "reported fit after training.", "confidence": "reported"},
            ],
        }

        reasoning = build_prediction_garnish_reasoning(prediction, enrichment)

        self.assertIn("India remain the SixSense pick at 61% win probability", reasoning)
        self.assertIn("this garnish refresh does not alter the deterministic core", reasoning)
        self.assertIn("India arrive with the stronger recent ODI base", reasoning)
        self.assertIn("Virat Kohli (India): reported fit after training.", reasoning)

    def test_prediction_reasoning_stays_conservative_when_sources_are_thin(self):
        prediction = {
            "team1": "Team A",
            "team2": "Team B",
            "predicted_winner": "Team B",
            "team1_win_probability": 0.46,
            "team2_win_probability": 0.54,
        }

        reasoning = build_prediction_garnish_reasoning(prediction, {"expert_preview": "", "player_updates": []})

        self.assertIn("Team B remain the SixSense pick at 54% win probability", reasoning)
        self.assertIn("No new source-backed match preview was available", reasoning)


if __name__ == "__main__":
    unittest.main()
