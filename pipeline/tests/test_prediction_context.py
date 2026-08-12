"""Regression tests for prediction context normalization."""

import os
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from predict import (
    _h2h_counts_from_espn,
    _stored_h2h_to_edge_results,
    derive_snapshot_change_events,
    persist_prediction,
)
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
    @patch("predict.get_latest_prediction_snapshot", return_value=None)
    def test_persists_latest_contract_and_snapshot_without_mutating_core(
        self,
        get_latest_snapshot,
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
            "_snapshot_inputs": {"version": 1, "market": None},
        }

        latest = persist_prediction(prediction)

        self.assertNotIn("edge_score", latest)
        self.assertNotIn("_snapshot_inputs", latest)
        self.assertEqual(prediction["edge_score"], edge)
        store_latest.assert_called_once_with(latest)
        store_edge.assert_called_once_with("espn-1", edge)
        snapshot_args = store_snapshot.call_args.args
        self.assertEqual(snapshot_args[:3], (latest, edge, prediction["_snapshot_inputs"]))
        self.assertEqual(snapshot_args[3][0]["type"], "initial_snapshot")
        get_latest_snapshot.assert_called_once_with("espn-1")

    def test_market_attribution_is_correlated_not_causal(self):
        previous = {
            "input_state": {
                "fixture": {"team1": "Team A", "team2": "Team B", "match_type": "T20"},
                "team_form": {},
                "head_to_head": {},
                "series": {},
                "market": {
                    "team1_odds": 2.0,
                    "team2_odds": 1.9,
                    "bookmaker": "Bet365",
                    "fetched_at": "2026-08-11T08:00:00Z",
                },
            },
        }
        current = {
            **previous["input_state"],
            "market": {
                "team1_odds": 1.8,
                "team2_odds": 2.1,
                "bookmaker": "Bet365",
                "fetched_at": "2026-08-11T10:00:00Z",
            },
        }

        events = derive_snapshot_change_events(
            previous,
            current,
            "2026-08-11T10:05:00Z",
        )

        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["category"], "market")
        self.assertEqual(events[0]["event_at"], "2026-08-11T10:00:00Z")
        self.assertIn("coincided", events[0]["summary"])
        self.assertNotIn("caused", events[0]["summary"])
        self.assertEqual(events[0]["source"]["reference"], "match_odds")

    def test_legacy_snapshot_gets_honest_attribution_fallback(self):
        events = derive_snapshot_change_events(
            {"input_state": None},
            {"version": 1},
            "2026-08-11T10:05:00Z",
        )

        self.assertEqual(events[0]["type"], "attribution_unavailable")
        self.assertIn("legacy", events[0]["summary"])


if __name__ == "__main__":
    unittest.main()
