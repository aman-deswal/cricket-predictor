"""Unit tests for Cricbuzz fixture fallback parsing."""

import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import unittest

from utils.cricbuzz import _extract_json_ld_objects, _sports_event_to_fixture


class TestCricbuzzJsonLd(unittest.TestCase):
    def test_extract_json_ld_objects(self):
        html = """
        <html>
          <script type="application/ld+json">{"@type":"WebPage","name":"Upcoming"}</script>
          <script type="application/ld+json">{invalid}</script>
        </html>
        """

        objects = _extract_json_ld_objects(html)

        self.assertEqual(objects, [{"@type": "WebPage", "name": "Upcoming"}])

    def test_sports_event_to_future_fixture(self):
        event = {
            "@type": "SportsEvent",
            "name": "19th Match, The Hundred Men's Competition 2026",
            "competitor": [
                {"@type": "SportsTeam", "name": "Welsh Fire"},
                {"@type": "SportsTeam", "name": "Southern Brave"},
            ],
            "location": "Sophia Gardens, Cardiff, ",
            "startDate": "2026-08-03T17:30:00.000Z",
        }

        fixture = _sports_event_to_fixture(
            event,
            now=datetime(2026, 8, 2, tzinfo=timezone.utc),
        )

        self.assertIsNotNone(fixture)
        assert fixture is not None
        self.assertEqual(fixture["source"], "cricbuzz")
        self.assertEqual(fixture["team1"], "Welsh Fire")
        self.assertEqual(fixture["team2"], "Southern Brave")
        self.assertEqual(fixture["date"], "2026-08-03T17:30:00.000Z")
        self.assertEqual(fixture["status"], "pre")
        self.assertEqual(fixture["venue"], "Sophia Gardens, Cardiff,")
        self.assertTrue(fixture["source_id"])

    def test_sports_event_to_fixture_skips_past_match(self):
        event = {
            "@type": "SportsEvent",
            "name": "Completed Match",
            "competitor": [
                {"@type": "SportsTeam", "name": "Team A"},
                {"@type": "SportsTeam", "name": "Team B"},
            ],
            "startDate": "2026-08-01T17:30:00.000Z",
        }

        fixture = _sports_event_to_fixture(
            event,
            now=datetime(2026, 8, 2, tzinfo=timezone.utc),
        )

        self.assertIsNone(fixture)


if __name__ == "__main__":
    unittest.main()
