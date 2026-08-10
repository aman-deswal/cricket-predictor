"""Unit tests for quota-safe sportsbook discovery, selection, and fetching."""

import os
import sys
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import requests

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import fetch_odds

NOW = datetime(2026, 8, 10, 12, 0, tzinfo=timezone.utc)


def _http_error(status_code: int, payload=None, headers=None) -> requests.HTTPError:
    response = requests.Response()
    response.status_code = status_code
    response.headers.update(headers or {})
    if payload is not None:
        response._content = __import__("json").dumps(payload).encode()
        response.headers["content-type"] = "application/json"
    return requests.HTTPError(f"{status_code} error", response=response)


def _fixture(
    match_id: str,
    competition: str,
    team1: str = "Team A",
    team2: str = "Team B",
    hours: int = 4,
    match_type: str = "T20",
) -> dict:
    return {
        "match_id": match_id,
        "name": f"{team1} vs {team2}, {competition}",
        "team1": team1,
        "team2": team2,
        "date": (NOW + timedelta(hours=hours)).isoformat(),
        "match_type": match_type,
        "status": "upcoming",
    }


def _event(fixture: dict) -> dict:
    return {
        "id": f"provider-{fixture['match_id']}",
        "teams": [fixture["team1"], fixture["team2"]],
        "home_team": fixture["team1"],
        "away_team": fixture["team2"],
        "commence_time": fixture["date"],
    }


class TestSportDiscovery(unittest.TestCase):
    @patch("fetch_odds.requests.get")
    def test_cpl_is_selected_and_free_quota_headers_are_read(self, mock_get):
        response = MagicMock()
        response.json.return_value = [
            {"key": "cricket_caribbean_premier_league", "active": True},
            {"key": "cricket_ipl", "active": False},
        ]
        response.headers = {
            "x-requests-used": "123",
            "x-requests-remaining": "377",
            "x-requests-last": "0",
        }
        mock_get.return_value = response

        result = fetch_odds.get_available_cricket_sports()

        self.assertEqual(result.data, ["cricket_caribbean_premier_league"])
        self.assertEqual(result.quota, fetch_odds.ApiQuota(used=123, remaining=377, last=0))

    @patch("fetch_odds.requests.get")
    def test_events_endpoint_is_free_discovery(self, mock_get):
        response = MagicMock()
        response.json.return_value = []
        response.headers = {"x-requests-used": "7", "x-requests-last": "0"}
        mock_get.return_value = response

        result = fetch_odds.get_events_for_sport("cricket_ipl")

        self.assertEqual(result.quota.last, 0)
        self.assertTrue(mock_get.call_args.args[0].endswith("/sports/cricket_ipl/events"))


class TestCompetitionMappingAndRelevance(unittest.TestCase):
    def test_maps_explicit_competitions_without_team_inference(self):
        self.assertEqual(
            fetch_odds.map_fixture_to_sport(_fixture("ipl", "Indian Premier League")),
            "cricket_ipl",
        )
        self.assertEqual(
            fetch_odds.map_fixture_to_sport(
                _fixture("tour", "India tour of England", match_type="Test")
            ),
            "cricket_test_match",
        )
        one_famous_team = _fixture(
            "unknown",
            "Charity Match",
            team1="Mumbai Indians",
            team2="Invitational XI",
        )
        self.assertIsNone(fetch_odds.map_fixture_to_sport(one_famous_team))

    def test_filters_to_actual_upcoming_local_fixture_pair_and_time(self):
        ipl = _fixture("ipl", "Indian Premier League", "Mumbai Indians", "Chennai Super Kings")
        psl = _fixture("psl", "Pakistan Super League", "Lahore Qalandars", "Karachi Kings")
        unrelated_event = {
            "teams": ["Mumbai Indians", "Delhi Capitals"],
            "commence_time": ipl["date"],
        }

        relevant = fetch_odds.relevant_fixtures_for_sport(
            "cricket_ipl",
            [_event(ipl), unrelated_event],
            [ipl, psl],
            NOW,
        )

        self.assertEqual([row["match_id"] for row in relevant], ["ipl"])

    def test_normalizes_parenthesized_women_suffix(self):
        trent = _fixture(
            "trent",
            "The Hundred Women's Competition",
            "Trent Rockets (Women)",
            "Southern Brave (Women)",
        )
        event = _event(trent)

        relevant = fetch_odds.relevant_fixtures_for_sport(
            "cricket_the_hundred",
            [event],
            [trent],
            NOW,
        )

        self.assertEqual([row["match_id"] for row in relevant], ["trent"])

    def test_rejects_explicit_competition_mismatch_even_when_teams_match(self):
        psl = _fixture("psl", "Pakistan Super League", "Lahore Qalandars", "Karachi Kings")

        relevant = fetch_odds.relevant_fixtures_for_sport(
            "cricket_ipl",
            [_event(psl)],
            [psl],
            NOW,
        )

        self.assertEqual(relevant, [])


class TestSportPriority(unittest.TestCase):
    def test_international_before_ipl_before_other_leagues(self):
        relevant = {
            "cricket_psl": [_fixture("psl", "Pakistan Super League", hours=1)],
            "cricket_ipl": [_fixture("ipl", "Indian Premier League", hours=20)],
            "cricket_odi": [_fixture("odi", "ODI", hours=30, match_type="ODI")],
            "cricket_big_bash": [_fixture("bbl", "Big Bash League", hours=2)],
        }

        self.assertEqual(
            fetch_odds.prioritize_relevant_sports(relevant),
            ["cricket_odi", "cricket_ipl", "cricket_big_bash", "cricket_psl"],
        )

    def test_equal_tier_uses_earliest_kickoff_then_sport_key(self):
        relevant = {
            "cricket_t20_intl": [_fixture("t20", "T20I", hours=6)],
            "cricket_test_match": [_fixture("test", "Test Match", hours=3, match_type="Test")],
            "cricket_odi": [_fixture("odi", "ODI", hours=3, match_type="ODI")],
        }

        self.assertEqual(
            fetch_odds.prioritize_relevant_sports(relevant),
            ["cricket_odi", "cricket_test_match", "cricket_t20_intl"],
        )


class TestFreshnessAndRequestContract(unittest.TestCase):
    def test_eight_hour_freshness_interval(self):
        self.assertTrue(
            fetch_odds.is_sport_fresh(
                "cricket_ipl",
                {"cricket_ipl": NOW - timedelta(hours=7, minutes=59)},
                NOW,
            )
        )
        self.assertFalse(
            fetch_odds.is_sport_fresh(
                "cricket_ipl",
                {"cricket_ipl": NOW - timedelta(hours=8)},
                NOW,
            )
        )

    def test_paid_request_uses_at_most_ten_bookmakers_and_no_regions(self):
        params = fetch_odds.paid_request_params()

        self.assertNotIn("regions", params)
        self.assertEqual(params["markets"], "h2h")
        self.assertLessEqual(len(params["bookmakers"].split(",")), 10)
        self.assertEqual(len(params["bookmakers"].split(",")), len(set(fetch_odds.BOOKMAKERS)))

    @patch("fetch_odds.requests.get")
    def test_paid_call_sends_bookmakers_not_regions(self, mock_get):
        response = MagicMock()
        response.json.return_value = []
        response.headers = {
            "x-requests-used": "20",
            "x-requests-remaining": "480",
            "x-requests-last": "0",
        }
        mock_get.return_value = response

        fetch_odds.fetch_odds_for_sport("cricket_ipl")

        params = mock_get.call_args.kwargs["params"]
        self.assertIn("bookmakers", params)
        self.assertNotIn("regions", params)


class TestQuotaBudget(unittest.TestCase):
    def test_ceiling_preserves_fifty_credit_reserve(self):
        self.assertTrue(fetch_odds.can_make_paid_call(fetch_odds.ApiQuota(used=449)))
        self.assertFalse(fetch_odds.can_make_paid_call(fetch_odds.ApiQuota(used=450)))
        self.assertFalse(fetch_odds.can_make_paid_call(fetch_odds.ApiQuota()))

    def test_empty_response_tracks_actual_zero_cost_headers(self):
        before = fetch_odds.ApiQuota(used=449, remaining=51)
        after = fetch_odds.merge_quota(
            before,
            fetch_odds.ApiQuota(used=449, remaining=51, last=0),
            assume_charge=True,
        )

        self.assertEqual(after, fetch_odds.ApiQuota(used=449, remaining=51, last=0))

    def test_missing_paid_headers_are_conservatively_counted(self):
        after = fetch_odds.merge_quota(
            fetch_odds.ApiQuota(used=449, remaining=51),
            fetch_odds.ApiQuota(),
            assume_charge=True,
        )

        self.assertEqual(after.used, 450)
        self.assertEqual(after.remaining, 50)


class TestOddsHistory(unittest.TestCase):
    @patch("fetch_odds.fetch_odds_for_sport")
    @patch("fetch_odds.get_client")
    def test_appends_existing_linked_row_shape_without_provider_call(
        self,
        mock_get_client,
        mock_fetch_odds,
    ):
        table = MagicMock()
        table.upsert.return_value = table
        mock_get_client.return_value.table.return_value = table
        rows = [{
            "match_id": "espn-1",
            "bookmaker": "Bet365",
            "team1_odds": 1.8,
            "team2_odds": 2.1,
            "draw_odds": None,
            "market": "h2h",
            "fetched_at": NOW.isoformat(),
        }]

        self.assertEqual(fetch_odds.store_odds_history([*rows, *rows]), 1)
        mock_fetch_odds.assert_not_called()
        mock_get_client.return_value.table.assert_called_once_with("match_odds_history")
        table.upsert.assert_called_once_with(
            rows,
            on_conflict="match_id,bookmaker,fetched_at",
            ignore_duplicates=True,
        )


class TestApiErrorDiagnostics(unittest.TestCase):
    def test_reports_provider_code_and_quota_without_request_url(self):
        error = _http_error(
            401,
            {
                "message": "Usage quota has been exhausted",
                "error_code": "OUT_OF_USAGE_CREDITS",
            },
            {
                "x-requests-remaining": "0",
                "x-requests-used": "500",
            },
        )
        error.request = requests.Request(
            "GET",
            "https://api.the-odds-api.com/v4/sports/cricket_odi/odds",
            params={"apiKey": "never-log-this-key"},
        ).prepare()

        details = fetch_odds.describe_api_error(error)

        self.assertIn("status=401", details)
        self.assertIn("error_code=OUT_OF_USAGE_CREDITS", details)
        self.assertIn("x-requests-remaining=0", details)
        self.assertNotIn("never-log-this-key", details)
        self.assertNotIn("apiKey", details)


class TestRefreshOutcomes(unittest.TestCase):
    def setUp(self):
        self.api_key = patch.object(fetch_odds, "ODDS_API_KEY", "test-key")
        self.api_key.start()
        self.ipl = _fixture(
            "ipl",
            "Indian Premier League",
            "Mumbai Indians",
            "Chennai Super Kings",
        )

    def tearDown(self):
        self.api_key.stop()

    def _base_patches(self, quota_used=10, refresh_state=None):
        return [
            patch(
                "fetch_odds.get_available_cricket_sports",
                return_value=fetch_odds.ProviderResult(
                    ["cricket_ipl"],
                    fetch_odds.ApiQuota(used=quota_used, remaining=500 - quota_used, last=0),
                ),
            ),
            patch("fetch_odds.get_upcoming_local_fixtures", return_value=[self.ipl]),
            patch("fetch_odds.get_refresh_state", return_value=refresh_state or {}),
            patch(
                "fetch_odds.get_events_for_sport",
                return_value=fetch_odds.ProviderResult(
                    [_event(self.ipl)],
                    fetch_odds.ApiQuota(used=quota_used, remaining=500 - quota_used, last=0),
                ),
            ),
            patch("fetch_odds.store_refresh_state"),
            patch("fetch_odds.match_odds_to_matches", return_value=[]),
            patch("fetch_odds.store_odds", return_value=0),
            patch("fetch_odds.store_odds_history", return_value=0),
        ]

    def test_legitimate_empty_market_succeeds_and_persists_freshness(self):
        patches = self._base_patches()
        for active_patch in patches:
            active_patch.start()
            self.addCleanup(active_patch.stop)
        with patch(
            "fetch_odds.fetch_odds_for_sport",
            return_value=fetch_odds.ProviderResult(
                [],
                fetch_odds.ApiQuota(used=10, remaining=490, last=0),
            ),
        ):
            self.assertEqual(fetch_odds.main(), 0)
        fetch_odds.store_refresh_state.assert_called_once()

    def test_budget_exhaustion_is_intentional_success_without_paid_call(self):
        patches = self._base_patches(quota_used=450)
        for active_patch in patches:
            active_patch.start()
            self.addCleanup(active_patch.stop)
        with patch("fetch_odds.fetch_odds_for_sport") as paid:
            self.assertEqual(fetch_odds.main(), 0)
            paid.assert_not_called()

    def test_fresh_sport_is_skipped(self):
        patches = self._base_patches(
            refresh_state={"cricket_ipl": datetime.now(timezone.utc) - timedelta(hours=1)}
        )
        for active_patch in patches:
            active_patch.start()
            self.addCleanup(active_patch.stop)
        with patch("fetch_odds.fetch_odds_for_sport") as paid:
            self.assertEqual(fetch_odds.main(), 0)
            paid.assert_not_called()

    def test_auth_failure_is_fatal(self):
        patches = self._base_patches()
        for active_patch in patches:
            active_patch.start()
            self.addCleanup(active_patch.stop)
        with patch("fetch_odds.fetch_odds_for_sport", side_effect=_http_error(401)):
            self.assertEqual(fetch_odds.main(), 1)

    def test_total_paid_upstream_failure_is_fatal(self):
        patches = self._base_patches()
        for active_patch in patches:
            active_patch.start()
            self.addCleanup(active_patch.stop)
        with patch(
            "fetch_odds.fetch_odds_for_sport",
            side_effect=requests.ConnectionError("down"),
        ):
            self.assertEqual(fetch_odds.main(), 1)

    def test_failed_paid_call_is_counted_before_admitting_next_sport(self):
        psl = _fixture(
            "psl",
            "Pakistan Super League",
            "Lahore Qalandars",
            "Karachi Kings",
        )
        discovery = fetch_odds.ProviderResult(
            ["cricket_ipl", "cricket_psl"],
            fetch_odds.ApiQuota(used=449, remaining=51, last=0),
        )
        with (
            patch("fetch_odds.get_available_cricket_sports", return_value=discovery),
            patch("fetch_odds.get_upcoming_local_fixtures", return_value=[self.ipl, psl]),
            patch("fetch_odds.get_refresh_state", return_value={}),
            patch(
                "fetch_odds.get_events_for_sport",
                side_effect=[
                    fetch_odds.ProviderResult([_event(self.ipl)], discovery.quota),
                    fetch_odds.ProviderResult([_event(psl)], discovery.quota),
                ],
            ),
            patch(
                "fetch_odds.fetch_odds_for_sport",
                side_effect=requests.ConnectionError("response lost"),
            ) as paid,
            patch("fetch_odds.store_refresh_state"),
        ):
            self.assertEqual(fetch_odds.main(), 1)
            self.assertEqual(paid.call_count, 1)

    def test_refresh_state_waits_for_odds_storage(self):
        patches = self._base_patches()
        for active_patch in patches:
            active_patch.start()
            self.addCleanup(active_patch.stop)
        fetch_odds.store_odds.side_effect = RuntimeError("database unavailable")
        with (
            patch(
                "fetch_odds.fetch_odds_for_sport",
                return_value=fetch_odds.ProviderResult(
                    [{
                        **_event(self.ipl),
                        "sport_key": "cricket_ipl",
                        "bookmakers": [],
                    }],
                    fetch_odds.ApiQuota(used=11, remaining=489, last=1),
                ),
            ),
            patch("fetch_odds.parse_odds_events", return_value=[{"row": True}]),
            patch("fetch_odds.match_odds_to_matches", return_value=[{"linked": True}]),
        ):
            with self.assertRaises(RuntimeError):
                fetch_odds.main()
        fetch_odds.store_refresh_state.assert_not_called()

    def test_refresh_state_waits_for_history_storage(self):
        patches = self._base_patches()
        for active_patch in patches:
            active_patch.start()
            self.addCleanup(active_patch.stop)
        fetch_odds.store_odds_history.side_effect = RuntimeError("history unavailable")
        linked_rows = [{
            "match_id": self.ipl["match_id"],
            "bookmaker": "Bet365",
            "team1_odds": 1.8,
            "team2_odds": 2.1,
            "draw_odds": None,
            "market": "h2h",
            "fetched_at": NOW.isoformat(),
        }]
        with (
            patch(
                "fetch_odds.fetch_odds_for_sport",
                return_value=fetch_odds.ProviderResult(
                    [{
                        **_event(self.ipl),
                        "sport_key": "cricket_ipl",
                        "bookmakers": [],
                    }],
                    fetch_odds.ApiQuota(used=11, remaining=489, last=1),
                ),
            ) as paid,
            patch("fetch_odds.parse_odds_events", return_value=[{"row": True}]),
            patch("fetch_odds.match_odds_to_matches", return_value=linked_rows),
        ):
            with self.assertRaises(RuntimeError):
                fetch_odds.main()
        paid.assert_called_once_with("cricket_ipl")
        fetch_odds.store_odds.assert_called_once_with(linked_rows)
        fetch_odds.store_odds_history.assert_called_once_with(linked_rows)
        fetch_odds.store_refresh_state.assert_not_called()

    def test_partial_paid_success_is_preserved(self):
        psl = _fixture(
            "psl",
            "Pakistan Super League",
            "Lahore Qalandars",
            "Karachi Kings",
        )
        discovery = fetch_odds.ProviderResult(
            ["cricket_ipl", "cricket_psl"],
            fetch_odds.ApiQuota(used=10, remaining=490, last=0),
        )
        event_results = [
            fetch_odds.ProviderResult([_event(self.ipl)], discovery.quota),
            fetch_odds.ProviderResult([_event(psl)], discovery.quota),
        ]
        paid_results = [
            fetch_odds.ProviderResult([], fetch_odds.ApiQuota(used=10, remaining=490, last=0)),
            requests.ConnectionError("down"),
        ]
        with (
            patch("fetch_odds.get_available_cricket_sports", return_value=discovery),
            patch("fetch_odds.get_upcoming_local_fixtures", return_value=[self.ipl, psl]),
            patch("fetch_odds.get_refresh_state", return_value={}),
            patch("fetch_odds.get_events_for_sport", side_effect=event_results),
            patch("fetch_odds.fetch_odds_for_sport", side_effect=paid_results),
            patch("fetch_odds.store_refresh_state"),
            patch("fetch_odds.match_odds_to_matches", return_value=[]),
            patch("fetch_odds.store_odds", return_value=0),
            patch("fetch_odds.store_odds_history", return_value=0),
        ):
            self.assertEqual(fetch_odds.main(), 0)

    def test_total_free_event_upstream_failure_is_fatal(self):
        with (
            patch(
                "fetch_odds.get_available_cricket_sports",
                return_value=fetch_odds.ProviderResult(
                    ["cricket_ipl"],
                    fetch_odds.ApiQuota(used=10, remaining=490),
                ),
            ),
            patch("fetch_odds.get_upcoming_local_fixtures", return_value=[self.ipl]),
            patch("fetch_odds.get_refresh_state", return_value={}),
            patch(
                "fetch_odds.get_events_for_sport",
                side_effect=requests.ConnectionError("down"),
            ),
        ):
            self.assertEqual(fetch_odds.main(), 1)


class TestFixtureLinking(unittest.TestCase):
    def test_cpl_aliases_link_to_corresponding_fixture(self):
        matches = [{
            "match_id": "espn-1534181",
            "team1": "St Lucia Kings",
            "team2": "Antigua and Barbuda Falcons",
            "date": "2026-08-10T23:00:00+00:00",
        }]

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
        }], matches)

        self.assertEqual(linked[0]["match_id"], "espn-1534181")
        self.assertEqual(linked[0]["team1_odds"], 1.7)
        self.assertEqual(linked[0]["team2_odds"], 2.2)


if __name__ == "__main__":
    unittest.main()
