"""Unit tests for pipeline/fetch_fixtures.py (ESPN-only pipeline)."""

import sys
import os

# Allow imports from the pipeline root without installing the package
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import unittest
from unittest.mock import MagicMock, patch

from fetch_fixtures import _infer_match_type, _espn_fixtures_to_matches, _score_espn_completed


class TestInferMatchType(unittest.TestCase):
    def test_t20_default(self):
        self.assertEqual(_infer_match_type("IPL 2025"), "T20")

    def test_t20_explicit(self):
        self.assertEqual(_infer_match_type("ICC Men's T20 World Cup"), "T20")

    def test_odi_lowercase(self):
        self.assertEqual(_infer_match_type("ICC Men's ODI World Cup"), "ODI")

    def test_one_day_spaced(self):
        self.assertEqual(_infer_match_type("Men's One Day International"), "ODI")

    def test_one_day_hyphenated(self):
        self.assertEqual(_infer_match_type("Women's One-Day Series"), "ODI")

    def test_test_match(self):
        self.assertEqual(_infer_match_type("ICC World Test Championship"), "Test")

    def test_unknown_league_defaults_to_t20(self):
        self.assertEqual(_infer_match_type("Caribbean Premier League"), "T20")

    def test_empty_string(self):
        self.assertEqual(_infer_match_type(""), "T20")


class TestEspnFixturesToMatches(unittest.TestCase):
    def _make_fixture(self, status="pre", espn_id="12345", team1="India", team2="Australia",
                      date="2026-08-01T10:00:00Z", league_name="ICC T20I", venue=""):
        return {
            "espn_event_id": espn_id,
            "team1": team1,
            "team2": team2,
            "date": date,
            "league_name": league_name,
            "league_id": "100",
            "status": status,
            "winner": None,
            "venue": venue,
        }

    def test_upcoming_fixture_converted(self):
        fixtures = [self._make_fixture()]
        matches = _espn_fixtures_to_matches(fixtures)
        self.assertEqual(len(matches), 1)
        m = matches[0]
        self.assertEqual(m["match_id"], "espn-12345")
        self.assertEqual(m["team1"], "India")
        self.assertEqual(m["team2"], "Australia")
        self.assertEqual(m["status"], "upcoming")
        self.assertEqual(m["match_type"], "T20")
        self.assertEqual(m["name"], "India vs Australia")

    def test_completed_fixture_excluded(self):
        fixtures = [self._make_fixture(status="post")]
        matches = _espn_fixtures_to_matches(fixtures)
        self.assertEqual(matches, [])

    def test_in_progress_fixture_excluded(self):
        fixtures = [self._make_fixture(status="in")]
        matches = _espn_fixtures_to_matches(fixtures)
        self.assertEqual(matches, [])

    def test_missing_espn_id_excluded(self):
        f = self._make_fixture()
        f["espn_event_id"] = ""
        matches = _espn_fixtures_to_matches([f])
        self.assertEqual(matches, [])

    def test_missing_team_name_excluded(self):
        f = self._make_fixture(team1="")
        matches = _espn_fixtures_to_matches([f])
        self.assertEqual(matches, [])

    def test_odi_league_name(self):
        fixtures = [self._make_fixture(league_name="ICC Men's ODI Series")]
        matches = _espn_fixtures_to_matches(fixtures)
        self.assertEqual(matches[0]["match_type"], "ODI")

    def test_test_league_name(self):
        fixtures = [self._make_fixture(league_name="ICC World Test Championship")]
        matches = _espn_fixtures_to_matches(fixtures)
        self.assertEqual(matches[0]["match_type"], "Test")

    def test_venue_propagated(self):
        fixtures = [self._make_fixture(venue="Eden Gardens, Kolkata")]
        matches = _espn_fixtures_to_matches(fixtures)
        self.assertEqual(matches[0]["venue"], "Eden Gardens, Kolkata")

    def test_multiple_fixtures_mixed_statuses(self):
        fixtures = [
            self._make_fixture(espn_id="1", status="pre"),
            self._make_fixture(espn_id="2", status="post"),
            self._make_fixture(espn_id="3", status="pre"),
            self._make_fixture(espn_id="4", status="in"),
        ]
        matches = _espn_fixtures_to_matches(fixtures)
        self.assertEqual(len(matches), 2)
        ids = {m["match_id"] for m in matches}
        self.assertEqual(ids, {"espn-1", "espn-3"})

    def test_stable_match_id_format(self):
        fixtures = [self._make_fixture(espn_id="99887766")]
        matches = _espn_fixtures_to_matches(fixtures)
        self.assertEqual(matches[0]["match_id"], "espn-99887766")


class TestScoreEspnCompleted(unittest.TestCase):
    """Tests for _score_espn_completed — verifies it scores predictions correctly."""

    def _make_espn_fixture(self, espn_eid, winner):
        return {
            "espn_event_id": espn_eid,
            "status": "post",
            "winner": winner,
            "team1": "India",
            "team2": "Australia",
        }

    def _make_prediction(self, match_id, team1, team2, predicted_winner, t1_prob, t2_prob):
        return {
            "match_id": match_id,
            "team1": team1,
            "team2": team2,
            "predicted_winner": predicted_winner,
            "team1_win_probability": t1_prob,
            "team2_win_probability": t2_prob,
            "scored_at": None,
        }

    @patch("fetch_fixtures.get_client")
    def test_no_completed_fixtures_returns_zero(self, mock_get_client):
        result = _score_espn_completed([
            {"espn_event_id": "1", "status": "pre", "winner": None},
        ])
        self.assertEqual(result, 0)
        mock_get_client.assert_not_called()

    @patch("fetch_fixtures.get_client")
    def test_scores_matching_prediction(self, mock_get_client):
        client = MagicMock()
        mock_get_client.return_value = client

        # espn_match_data lookup returns match_id
        client.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [
            {"match_id": "espn-42"}
        ]

        # prediction lookup
        prediction = self._make_prediction(
            "espn-42", "India", "Australia", "India", 0.65, 0.35
        )
        pred_resp = MagicMock()
        pred_resp.data = [prediction]

        # Wire up chained calls
        table_mock = MagicMock()
        client.table.return_value = table_mock
        table_mock.select.return_value = table_mock
        table_mock.eq.return_value = table_mock
        table_mock.is_.return_value = table_mock
        table_mock.update.return_value = table_mock
        table_mock.upsert.return_value = table_mock
        table_mock.execute.return_value = MagicMock(data=[{"match_id": "espn-42"}])

        # Override prediction lookup
        def table_side_effect(name):
            t = MagicMock()
            t.select.return_value = t
            t.eq.return_value = t
            t.is_.return_value = t
            t.update.return_value = t
            t.upsert.return_value = t
            if name == "espn_match_data":
                t.execute.return_value = MagicMock(data=[{"match_id": "espn-42"}])
            elif name == "predictions":
                t.execute.return_value = MagicMock(data=[prediction])
            else:
                t.execute.return_value = MagicMock(data=[])
            return t

        client.table.side_effect = table_side_effect

        scored = _score_espn_completed([self._make_espn_fixture("42", "India")])
        self.assertEqual(scored, 1)

    @patch("fetch_fixtures.get_client")
    def test_skips_when_no_espn_match_data(self, mock_get_client):
        client = MagicMock()
        mock_get_client.return_value = client

        def table_side_effect(name):
            t = MagicMock()
            t.select.return_value = t
            t.eq.return_value = t
            t.execute.return_value = MagicMock(data=[])
            return t

        client.table.side_effect = table_side_effect

        scored = _score_espn_completed([self._make_espn_fixture("999", "India")])
        self.assertEqual(scored, 0)


if __name__ == "__main__":
    unittest.main()
