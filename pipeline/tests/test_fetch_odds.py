"""Unit tests for sportsbook discovery, fetching, and fixture linking."""

import os
import sys
import unittest
from unittest.mock import MagicMock, patch

import requests

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import fetch_odds


def _http_error(status_code: int) -> requests.HTTPError:
    response = requests.Response()
    response.status_code = status_code
    return requests.HTTPError(f"{status_code} error", response=response)


class TestSportDiscovery(unittest.TestCase):
    @patch("fetch_odds.requests.get")
    def test_cpl_is_selected_when_provider_reports_it_active(self, mock_get):
        response = MagicMock()
        response.json.return_value = [
            {"key": "cricket_caribbean_premier_league", "active": True},
            {"key": "cricket_ipl", "active": False},
        ]
        mock_get.return_value = response

        self.assertEqual(
            fetch_odds.get_available_cricket_sports(),
            ["cricket_caribbean_premier_league"],
        )


class TestRefreshOutcomes(unittest.TestCase):
    def setUp(self):
        self.api_key = patch.object(fetch_odds, "ODDS_API_KEY", "test-key")
        self.api_key.start()

    def tearDown(self):
        self.api_key.stop()

    @patch("fetch_odds.fetch_odds_for_sport", side_effect=_http_error(401))
    def test_auth_failure_is_fatal(self, _mock_fetch):
        self.assertEqual(fetch_odds.main(sport="cricket_ipl"), 1)

    @patch("fetch_odds.fetch_odds_for_sport", side_effect=requests.ConnectionError("down"))
    def test_total_upstream_failure_is_fatal(self, _mock_fetch):
        self.assertEqual(fetch_odds.main(sport="cricket_ipl"), 1)

    @patch("fetch_odds.store_odds", return_value=0)
    @patch("fetch_odds.match_odds_to_matches", return_value=[])
    @patch("fetch_odds.parse_odds_events", return_value=[])
    @patch("fetch_odds.fetch_odds_for_sport", return_value=[])
    def test_legitimate_empty_market_succeeds(self, _fetch, _parse, _match, _store):
        self.assertEqual(fetch_odds.main(sport="cricket_ipl"), 0)

    @patch("fetch_odds.store_odds", return_value=0)
    @patch("fetch_odds.match_odds_to_matches", return_value=[])
    @patch("fetch_odds.parse_odds_events", return_value=[])
    @patch("fetch_odds.get_available_cricket_sports", return_value=["cricket_ipl", "cricket_psl"])
    def test_partial_success_is_preserved(self, _sports, _parse, _match, _store):
        with patch(
            "fetch_odds.fetch_odds_for_sport",
            side_effect=[[], requests.ConnectionError("down")],
        ):
            self.assertEqual(fetch_odds.main(), 0)


class TestFixtureLinking(unittest.TestCase):
    @patch("fetch_odds.get_client")
    def test_cpl_aliases_link_to_corresponding_fixture(self, mock_get_client):
        query = MagicMock()
        query.select.return_value = query
        query.eq.return_value = query
        query.gte.return_value = query
        query.execute.return_value = MagicMock(data=[{
            "match_id": "espn-1534181",
            "team1": "St Lucia Kings",
            "team2": "Antigua and Barbuda Falcons",
            "date": "2026-08-10T23:00:00+00:00",
        }])
        mock_get_client.return_value.table.return_value = query

        linked = fetch_odds.match_odds_to_matches([{
            "team1": "Antigua & Barbuda Falcons",
            "team2": "Saint Lucia Kings",
            "bookmaker": "Bet365",
            "team1_odds": 2.2,
            "team2_odds": 1.7,
            "draw_odds": None,
            "market": "h2h",
            "commence_time": "2026-08-10T23:00:00Z",
            "fetched_at": "2026-08-09T00:00:00Z",
        }])

        self.assertEqual(linked[0]["match_id"], "espn-1534181")
        self.assertEqual(linked[0]["team1_odds"], 1.7)
        self.assertEqual(linked[0]["team2_odds"], 2.2)


if __name__ == "__main__":
    unittest.main()
