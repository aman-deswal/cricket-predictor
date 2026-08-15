"""Unit tests for greedy squad refresh planning."""

import os
import sys
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import unittest

from fetch_squads import MatchSquadFetchResult, _is_confirmed_lineup
from refresh_match_squads import MatchRefreshPlan, _build_refresh_plan, _refresh_match_with_retry, main


class TestRefreshMatchSquads(unittest.TestCase):
    def setUp(self):
        self.now = datetime(2026, 8, 10, 12, 0, tzinfo=timezone.utc)

    def _match(self, match_id: str, *, hours_from_now: float, status: str = "upcoming") -> dict:
        return {
            "match_id": match_id,
            "date": (self.now + timedelta(hours=hours_from_now)).isoformat(),
            "status": status,
        }

    def _squad_row(
        self,
        match_id: str,
        *,
        confirmed: bool,
        fetched_minutes_ago: int,
    ) -> dict:
        return {
            "match_id": match_id,
            "is_confirmed": confirmed,
            "fetched_at": (self.now - timedelta(minutes=fetched_minutes_ago)).isoformat(),
        }

    def test_missing_squad_is_greedily_selected_within_lookahead(self):
        plan = _build_refresh_plan(
            [self._match("missing", hours_from_now=24)],
            [],
            now=self.now,
            lookahead_hours=72,
            window_minutes=15,
            live_grace_minutes=15,
        )

        self.assertEqual(plan, [MatchRefreshPlan(match_id="missing", force=False)])

    def test_fresh_unconfirmed_squad_is_not_retried_too_soon(self):
        plan = _build_refresh_plan(
            [self._match("fresh", hours_from_now=2)],
            [self._squad_row("fresh", confirmed=False, fetched_minutes_ago=20)],
            now=self.now,
            lookahead_hours=72,
            window_minutes=15,
            live_grace_minutes=15,
        )

        self.assertEqual(plan, [])

    def test_stale_unconfirmed_squad_is_retried_before_start(self):
        plan = _build_refresh_plan(
            [self._match("stale", hours_from_now=2)],
            [self._squad_row("stale", confirmed=False, fetched_minutes_ago=45)],
            now=self.now,
            lookahead_hours=72,
            window_minutes=15,
            live_grace_minutes=15,
        )

        self.assertEqual(plan, [MatchRefreshPlan(match_id="stale", force=False)])

    def test_imminent_match_forces_confirmed_xi_refresh(self):
        plan = _build_refresh_plan(
            [self._match("imminent", hours_from_now=0.05)],
            [self._squad_row("imminent", confirmed=True, fetched_minutes_ago=2)],
            now=self.now,
            lookahead_hours=72,
            window_minutes=15,
            live_grace_minutes=15,
        )

        self.assertEqual(plan, [MatchRefreshPlan(match_id="imminent", force=True)])

    def test_matches_outside_lookahead_are_ignored(self):
        plan = _build_refresh_plan(
            [self._match("later", hours_from_now=96)],
            [],
            now=self.now,
            lookahead_hours=72,
            window_minutes=15,
            live_grace_minutes=15,
        )

        self.assertEqual(plan, [])


class TestRefreshRetry(unittest.TestCase):
    @patch("refresh_match_squads.time.sleep", return_value=None)
    @patch("refresh_match_squads.fetch_and_store_squads")
    def test_error_retries_once_then_succeeds(self, mock_fetch, _mock_sleep):
        mock_fetch.side_effect = [
            [MatchSquadFetchResult(match_id="m1", status="error", error="timeout")],
            [MatchSquadFetchResult(match_id="m1", status="stored", stored_team_count=2)],
        ]

        result = _refresh_match_with_retry("m1", force=False, retry_delay_seconds=0)

        self.assertEqual(result.status, "stored")
        self.assertEqual(mock_fetch.call_count, 2)

    @patch("refresh_match_squads.time.sleep", return_value=None)
    @patch("refresh_match_squads.fetch_and_store_squads")
    def test_non_error_does_not_retry(self, mock_fetch, _mock_sleep):
        mock_fetch.return_value = [MatchSquadFetchResult(match_id="m1", status="unavailable")]

        result = _refresh_match_with_retry("m1", force=False, retry_delay_seconds=0)

        self.assertEqual(result.status, "unavailable")
        self.assertEqual(mock_fetch.call_count, 1)


class TestRefreshMain(unittest.TestCase):
    @patch("refresh_match_squads.resolve_missing_headshots")
    @patch("refresh_match_squads.fetch_stats_for_match_squads")
    @patch("refresh_match_squads._refresh_match_with_retry")
    @patch("refresh_match_squads.select_match_refresh_plan")
    def test_refreshes_headshots_only_for_matches_that_were_stored(
        self,
        mock_select_plan,
        mock_refresh,
        mock_fetch_stats,
        mock_resolve_headshots,
    ):
        mock_select_plan.return_value = [
            MatchRefreshPlan(match_id="m1", force=False),
            MatchRefreshPlan(match_id="m2", force=True),
        ]
        mock_refresh.side_effect = [
            MatchSquadFetchResult(match_id="m1", status="stored", stored_team_count=2),
            MatchSquadFetchResult(match_id="m2", status="unavailable"),
        ]

        main()

        mock_fetch_stats.assert_called_once_with(match_id="m1", force=False)
        mock_resolve_headshots.assert_called_once_with(match_ids=["m1"], force=False)


class TestConfirmedLineupDetection(unittest.TestCase):
    def test_eleven_players_counts_as_confirmed(self):
        self.assertTrue(_is_confirmed_lineup([{}] * 11, "espn"))

    def test_full_squad_stays_unconfirmed_until_playing_xi(self):
        self.assertFalse(_is_confirmed_lineup([{}] * 15, "espn"))
        self.assertFalse(_is_confirmed_lineup([{}] * 16, "cricapi_fantasy"))


if __name__ == "__main__":
    unittest.main()
