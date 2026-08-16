"""Unit tests for pipeline/fetch_results.py (ESPN-only scoring pipeline)."""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import unittest
from unittest.mock import MagicMock, patch

from datetime import datetime, timezone

from fetch_results import (
    _correct_espn_event,
    _espn_winner_from_summary,
    _finalize_stale_active_matches,
    _match_espn_winner_to_prediction,
    _normalize,
    _parse_winner_flag,
    _score_prediction,
    _should_force_retire_stale_match,
)


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


class TestEspnWinnerParsing(unittest.TestCase):
    def _summary(self, flags):
        return {
            "header": {
                "competitions": [{
                    "status": {"type": {"description": "Result", "shortDetail": "TKR won"}},
                    "competitors": [
                        {"winner": flag, "team": {"displayName": team}}
                        for flag, team in zip(flags, ["St Kitts and Nevis Patriots", "Trinbago Knight Riders"])
                    ],
                }],
            },
        }

    def test_parse_winner_flag_accepts_only_booleans_and_boolean_strings(self):
        self.assertIs(_parse_winner_flag(True), True)
        self.assertIs(_parse_winner_flag(False), False)
        self.assertIs(_parse_winner_flag("true"), True)
        self.assertIs(_parse_winner_flag("false"), False)
        self.assertIsNone(_parse_winner_flag("yes"))
        self.assertIsNone(_parse_winner_flag(1))

    @patch("fetch_results.requests.get")
    def test_string_false_does_not_beat_string_true(self, mock_get):
        mock_get.return_value.status_code = 200
        mock_get.return_value.json.return_value = self._summary(["false", "true"])

        winner, result_text = _espn_winner_from_summary("1534180")

        self.assertEqual(winner, "Trinbago Knight Riders")
        self.assertEqual(result_text, "TKR won")

    @patch("fetch_results.requests.get")
    def test_boolean_flags_select_exactly_one_winner(self, mock_get):
        mock_get.return_value.status_code = 200
        mock_get.return_value.json.return_value = self._summary([False, True])

        winner, _ = _espn_winner_from_summary("1534180")

        self.assertEqual(winner, "Trinbago Knight Riders")

    @patch("fetch_results.requests.get")
    def test_ambiguous_two_winner_payload_is_skipped(self, mock_get):
        mock_get.return_value.status_code = 200
        mock_get.return_value.json.return_value = self._summary([True, "true"])

        self.assertEqual(_espn_winner_from_summary("1534180"), (None, None))

    @patch("fetch_results.requests.get")
    def test_no_winner_payload_is_skipped(self, mock_get):
        mock_get.return_value.status_code = 200
        mock_get.return_value.json.return_value = self._summary([False, "false"])

        self.assertEqual(_espn_winner_from_summary("1534180"), (None, None))

    @patch("fetch_results.requests.get")
    def test_malformed_winner_payload_is_skipped(self, mock_get):
        mock_get.return_value.status_code = 200
        mock_get.return_value.json.return_value = self._summary(["yes", True])

        self.assertEqual(_espn_winner_from_summary("1534180"), (None, None))


class TestTargetedCorrection(unittest.TestCase):
    @patch("fetch_results._espn_winner_from_summary", return_value=("Trinbago Knight Riders", "TKR won"))
    @patch("fetch_results._persist_score")
    def test_rewrites_previously_scored_event(self, mock_persist, _mock_summary):
        client = MagicMock()
        tables = {}

        def table_side_effect(name):
            table = MagicMock()
            table.select.return_value = table
            table.eq.return_value = table
            if name == "espn_match_data":
                table.execute.return_value = MagicMock(data=[{"match_id": "espn-1534180"}])
            elif name == "predictions":
                table.execute.return_value = MagicMock(data=[{
                    "match_id": "espn-1534180",
                    "team1": "St Kitts and Nevis Patriots",
                    "team2": "Trinbago Knight Riders",
                    "predicted_winner": "Trinbago Knight Riders",
                    "team1_win_probability": 0.45,
                    "team2_win_probability": 0.55,
                    "scored_at": "2026-08-09T00:00:00",
                }])
            tables[name] = table
            return table

        client.table.side_effect = table_side_effect

        self.assertTrue(_correct_espn_event(client, "1534180"))
        mock_persist.assert_called_once()
        self.assertEqual(mock_persist.call_args.args[2], "Trinbago Knight Riders")


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


class TestFinalizeStaleActiveMatches(unittest.TestCase):
    def test_live_test_match_within_grace_is_preserved(self):
        client = MagicMock()
        matches = MagicMock()
        client.table.return_value = matches
        matches.select.return_value = matches
        matches.in_.return_value = matches
        matches.lt.return_value = matches
        matches.execute.return_value = MagicMock(data=[{
            "match_id": "espn-99",
            "team1": "India",
            "team2": "Australia",
            "date": "2026-08-01T10:00:00Z",
            "status": "live",
            "match_type": "Test",
            "espn_event_id": None,
        }])

        marked = _finalize_stale_active_matches(
            client,
            datetime(2026, 8, 6, tzinfo=timezone.utc),
        )

        self.assertEqual(marked, {"authoritative": 0, "retired": 0})
        self.assertIn(
            unittest.mock.call("status", ["upcoming", "live"]),
            matches.in_.call_args_list,
        )
        matches.update.assert_not_called()

    @patch("fetch_results._espn_winner_from_summary", return_value=("India", "India won by 5 wickets"))
    def test_marks_stale_match_completed_without_scoring(self, _mock_summary):
        client = MagicMock()
        tables = {}

        def table_side_effect(name):
            t = MagicMock()
            t.select.return_value = t
            t.eq.return_value = t
            t.lt.return_value = t
            t.in_.return_value = t
            t.update.return_value = t
            if name == "matches":
                t.execute.return_value = MagicMock(data=[{
                    "match_id": "espn-42",
                    "team1": "India",
                    "team2": "Australia",
                    "date": "2026-07-30T10:00:00+00:00",
                    "espn_event_id": "42",
                }])
            else:
                t.execute.return_value = MagicMock(data=[])
            tables[name] = t
            return t

        client.table.side_effect = table_side_effect

        marked = _finalize_stale_active_matches(client, datetime(2026, 8, 1, tzinfo=timezone.utc))

        self.assertEqual(marked, {"authoritative": 1, "retired": 0})
        tables["matches"].update.assert_called_once_with({
            "status": "completed",
            "winner": "India",
        })
        client.table.assert_any_call("matches")
        self.assertNotIn("prediction_results", tables)

    def test_retires_stale_cricbuzz_upcoming_without_espn_link(self):
        client = MagicMock()
        tables = {}

        def table_side_effect(name):
            t = MagicMock()
            t.select.return_value = t
            t.eq.return_value = t
            t.lt.return_value = t
            t.in_.return_value = t
            t.update.return_value = t
            if name == "matches":
                t.execute.return_value = MagicMock(data=[{
                    "match_id": "cricbuzz-abc123",
                    "team1": "Lancashire",
                    "team2": "Surrey",
                    "date": "2026-07-21T10:00:00Z",
                    "status": "upcoming",
                    "match_type": "T20",
                    "espn_event_id": None,
                }])
            else:
                t.execute.return_value = MagicMock(data=[])
            tables[name] = t
            return t

        client.table.side_effect = table_side_effect

        marked = _finalize_stale_active_matches(client, datetime(2026, 7, 22, tzinfo=timezone.utc))

        self.assertEqual(marked, {"authoritative": 0, "retired": 1})
        tables["matches"].update.assert_called_once_with({
            "status": "completed",
            "winner": None,
        })


class TestStaleRetireGrace(unittest.TestCase):
    def test_force_retires_cricbuzz_upcoming_after_short_grace(self):
        self.assertTrue(_should_force_retire_stale_match({
            "match_id": "cricbuzz-abc123",
            "date": "2026-07-21T10:00:00Z",
            "status": "upcoming",
            "match_type": "T20",
        }, datetime(2026, 7, 21, 17, tzinfo=timezone.utc)))

    def test_live_test_is_not_force_retired_during_multiday_window(self):
        self.assertFalse(_should_force_retire_stale_match({
            "match_id": "espn-99",
            "date": "2026-08-01T10:00:00Z",
            "status": "live",
            "match_type": "Test",
        }, datetime(2026, 8, 6, tzinfo=timezone.utc)))


if __name__ == "__main__":
    unittest.main()
