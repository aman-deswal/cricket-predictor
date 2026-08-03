"""Regression tests for prediction context normalization."""

import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from predict import _h2h_counts_from_espn, _stored_h2h_to_edge_results
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


if __name__ == "__main__":
    unittest.main()
