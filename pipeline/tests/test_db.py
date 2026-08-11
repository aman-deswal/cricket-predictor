"""Unit tests for pipeline database helpers."""

import os
import sys
import unittest
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from utils.db import get_all_predictions, store_prediction_snapshot


class TestGetAllPredictions(unittest.TestCase):
    @patch("utils.db.get_client")
    def test_fetches_calibration_fields_without_embedded_relationship(self, mock_get_client):
        client = MagicMock()
        query = client.table.return_value
        query.select.return_value = query
        expected = [{"predicted_probability": 0.72, "correct": True}]
        query.execute.return_value = MagicMock(data=expected)
        mock_get_client.return_value = client

        result = get_all_predictions()

        client.table.assert_called_once_with("prediction_results")
        query.select.assert_called_once_with("predicted_probability, correct")
        self.assertEqual(result, expected)


class TestStorePredictionSnapshot(unittest.TestCase):
    @patch("utils.db.get_client")
    def test_calls_atomic_append_function_with_deterministic_core(self, mock_get_client):
        client = MagicMock()
        client.rpc.return_value.execute.return_value = MagicMock(data=True)
        mock_get_client.return_value = client
        prediction = {
            "match_id": "espn-1",
            "team1": "Team A",
            "team2": "Team B",
            "predicted_winner": "Team A",
            "team1_win_probability": 0.61,
            "team2_win_probability": 0.39,
            "confidence": "medium",
            "model": "deterministic-core",
            "ensemble_size": 1,
            "reasoning": "Narrative is not part of the deterministic snapshot.",
        }
        edge = {"net_edge": 7, "edge_team": "Team A"}

        self.assertTrue(store_prediction_snapshot(prediction, edge))
        client.rpc.assert_called_once_with(
            "append_prediction_snapshot",
            {
                "candidate_match_id": "espn-1",
                "candidate_team1": "Team A",
                "candidate_team2": "Team B",
                "candidate_predicted_winner": "Team A",
                "candidate_team1_win_probability": 0.61,
                "candidate_team2_win_probability": 0.39,
                "candidate_confidence": "medium",
                "candidate_edge_score": edge,
                "candidate_model": "deterministic-core",
                "candidate_ensemble_size": 1,
            },
        )

    @patch("utils.db.get_client")
    def test_returns_false_when_database_deduplicates_unchanged_core(self, mock_get_client):
        client = MagicMock()
        client.rpc.return_value.execute.return_value = MagicMock(data=False)
        mock_get_client.return_value = client
        prediction = {
            "match_id": "espn-1",
            "team1": "Team A",
            "team2": "Team B",
            "predicted_winner": "Team A",
            "team1_win_probability": 0.61,
            "team2_win_probability": 0.39,
            "confidence": "medium",
            "model": "deterministic-core",
            "ensemble_size": 1,
        }

        self.assertFalse(store_prediction_snapshot(prediction, {"net_edge": 7}))


if __name__ == "__main__":
    unittest.main()
