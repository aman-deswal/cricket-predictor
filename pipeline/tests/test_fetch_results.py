"""Unit tests for pipeline/fetch_results.py (ESPN-only scoring pipeline)."""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import unittest
from unittest.mock import MagicMock, patch

from fetch_results import _normalize, _match_espn_winner_to_prediction, _score_prediction


class TestNormalize(unittest.TestCase):
    def test_lowercases(self):
        self.assertEqual(_normalize("India"), "india")

    def test_strips_whitespace(self):
        self.assertEqual(_normalize("  Australia  "), "australia")

    def test_strips_women_suffix(self):
        self.assertEqual(_normalize("India Women"), "india")

    def test_strips_men_suffix(self):
        self.assertEqual(_normalize("England Men"), "england")

    def test_strips_suffix_case_insensitive(self):
        self.assertEqual(_normalize("West Indies WOMEN"), "west indies")

    def test_no_suffix(self):
        self.assertEqual(_normalize("South Africa"), "south africa")


class TestMatchEspnWinnerToPrediction(unittest.TestCase):
    def _pred(self, team1="India", team2="Australia"):
        return {"team1": team1, "team2": team2}

    def test_exact_match_team1(self):
        result = _match_espn_winner_to_prediction("India", self._pred())
        self.assertEqual(result, "India")

    def test_exact_match_team2(self):
        result = _match_espn_winner_to_prediction("Australia", self._pred())
        self.assertEqual(result, "Australia")

    def test_normalized_match(self):
        # ESPN may return "India Men", prediction stores "India"
        result = _match_espn_winner_to_prediction("India Men", self._pred())
        self.assertEqual(result, "India")

    def test_substring_match_espn_shorter(self):
        # ESPN: "England", prediction: "England Women"
        result = _match_espn_winner_to_prediction(
            "England", self._pred(team1="England Women", team2="Australia Women")
        )
        self.assertEqual(result, "England Women")

    def test_substring_match_espn_longer(self):
        # ESPN: "England Women", prediction: "England"
        result = _match_espn_winner_to_prediction(
            "England Women", self._pred(team1="England", team2="Australia")
        )
        self.assertEqual(result, "England")

    def test_no_result_returns_none(self):
        result = _match_espn_winner_to_prediction("__no_result__", self._pred())
        self.assertIsNone(result)

    def test_unrecognized_winner_returns_none(self):
        result = _match_espn_winner_to_prediction("Zimbabwe", self._pred())
        self.assertIsNone(result)


class TestScorePrediction(unittest.TestCase):
    def _pred(self, predicted="India", t1_prob=0.65, t2_prob=0.35):
        return {
            "match_id": "espn-42",
            "team1": "India",
            "team2": "Australia",
            "predicted_winner": predicted,
            "team1_win_probability": t1_prob,
            "team2_win_probability": t2_prob,
        }

    def test_correct_prediction(self):
        result = _score_prediction(self._pred(predicted="India"), "India")
        self.assertTrue(result["correct"])
        self.assertEqual(result["predicted_winner"], "India")
        self.assertEqual(result["actual_winner"], "India")

    def test_incorrect_prediction(self):
        result = _score_prediction(self._pred(predicted="India"), "Australia")
        self.assertFalse(result["correct"])

    def test_brier_score_team1_wins(self):
        result = _score_prediction(self._pred(t1_prob=0.65, t2_prob=0.35), "India")
        expected_brier = (0.65 - 1.0) ** 2
        self.assertAlmostEqual(result["brier_score"], expected_brier)

    def test_brier_score_team2_wins(self):
        result = _score_prediction(self._pred(t1_prob=0.65, t2_prob=0.35), "Australia")
        expected_brier = (0.35 - 1.0) ** 2
        self.assertAlmostEqual(result["brier_score"], expected_brier)

    def test_brier_none_when_winner_unknown(self):
        result = _score_prediction(self._pred(), "Zimbabwe")
        self.assertIsNone(result["brier_score"])

    def test_predicted_probability_is_max(self):
        result = _score_prediction(self._pred(t1_prob=0.65, t2_prob=0.35), "India")
        self.assertAlmostEqual(result["predicted_probability"], 0.65)

    def test_result_contains_match_id(self):
        result = _score_prediction(self._pred(), "India")
        self.assertEqual(result["match_id"], "espn-42")
        self.assertEqual(result["prediction_id"], "espn-42")

    def test_scored_at_is_set(self):
        result = _score_prediction(self._pred(), "India")
        self.assertIsNotNone(result["scored_at"])
        self.assertIsInstance(result["scored_at"], str)


if __name__ == "__main__":
    unittest.main()
