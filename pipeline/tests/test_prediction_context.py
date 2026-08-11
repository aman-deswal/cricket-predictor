"""Regression tests for prediction context normalization."""

import os
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from predict import _h2h_counts_from_espn, _stored_h2h_to_edge_results, persist_prediction
from utils.edge_score import compute_edge_score


class TestPredictionContext(unittest.TestCase):
    def test_counts_espn_h2h_with_gendered_team_names(self):
        results = [
            {"winner": "Southern Brave Women"},
            {"winner": "Southern Brave (Women)"},
            {"winner": "Southern Brave (Women)"},
            {"winner": "Welsh Fire Women"},
            {"winner": "Welsh Fire (Women)"},
        ]

        counts = _h2h_counts_from_espn(
            results,
            "Welsh Fire (Women)",
            "Southern Brave (Women)",
        )

        self.assertEqual(counts, {
            "total_matches": 5,
            "team1_wins": 2,
            "team2_wins": 3,
        })

    def test_converts_stored_h2h_rows_for_edge_score(self):
        stored = [{
            "date": "2026-07-22",
            "note": "Southern Brave Women won by 8 wickets",
            "teams": [
                {"name": "Welsh Fire Women", "score": "118/8", "winner": False},
                {"name": "Southern Brave Women", "score": "126/7", "winner": True},
            ],
        }]

        results = _stored_h2h_to_edge_results(stored)

        self.assertEqual(results[0]["winner"], "Southern Brave Women")
        self.assertEqual(results[0]["status"], "Southern Brave Women won by 8 wickets")

    def test_zero_edge_has_no_faux_edge_team(self):
        edge = compute_edge_score(
            team1="Team A",
            team2="Team B",
            team1_form={"win_rate": 0.5},
            team2_form={"win_rate": 0.5},
            espn_h2h=[],
            series_scoreline="",
            match_type="T20",
            odds=None,
        )

        self.assertEqual(edge["net_edge"], 0)
        self.assertEqual(edge["edge_team"], "")
        self.assertEqual(edge["narrative"], "No clear edge on the structured factors")

    @patch("predict.store_prediction_snapshot", return_value=True)
    @patch("predict._store_edge_score")
    @patch("predict.store_prediction")
    def test_persists_latest_contract_and_snapshot_without_mutating_core(
        self,
        store_latest,
        store_edge,
        store_snapshot,
    ):
        edge = {"net_edge": 9, "edge_team": "Team A"}
        prediction = {
            "match_id": "espn-1",
            "team1": "Team A",
            "team2": "Team B",
            "predicted_winner": "Team A",
            "team1_win_probability": 0.64,
            "team2_win_probability": 0.36,
            "confidence": "high",
            "reasoning": "Stable narrative.",
            "toss_insight": "Neutral toss.",
            "model": "deterministic-core",
            "ensemble_size": 1,
            "edge_score": edge,
        }

        latest = persist_prediction(prediction)

        self.assertNotIn("edge_score", latest)
        self.assertEqual(prediction["edge_score"], edge)
        store_latest.assert_called_once_with(latest)
        store_edge.assert_called_once_with("espn-1", edge)
        store_snapshot.assert_called_once_with(latest, edge)


if __name__ == "__main__":
    unittest.main()
