"""Unit tests for Cricbuzz squad fallback parsing."""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import unittest

from fetch_squads import _extract_cricbuzz_match_links, _extract_cricbuzz_team_objects, fetch_squad_from_cricbuzz


CRICBUZZ_UPCOMING_HTML = """
<a href="/live-cricket-scores/151020/ire-vs-afg-4th-odi-afghanistan-tour-of-ireland-2026"
   title="Ireland vs Afghanistan, 4th ODI - Preview ">
  <div class="text-white">Ireland vs Afghanistan</div>
</a>
"""


CRICBUZZ_SQUADS_HTML = """
<script>
{"teamId":27,"teamName":"Ireland","teamSName":"IRE","imageDetails":{"imageId":"839366"},"profileUrl":"/cricket-team/ireland/27"},"players":{"Squad":[
  {"id":1114,"name":"Paul Stirling","fullName":"Paul Stirling","captain":true,"keeper":false,"role":"Batting Allrounder","battingStyle":"RIGHT","bowlingStyle":"Right Arm off break","imageDetails":{"imageId":845642}},
  {"id":11131,"name":"Lorcan Tucker","fullName":"Lorcan Tucker","captain":false,"keeper":true,"role":"WK-Batter","battingStyle":"RIGHT","bowlingStyle":"$undefined","imageDetails":{"imageId":845647}}
]}}
{"teamId":96,"teamName":"Afghanistan","teamSName":"AFG","imageDetails":{"imageId":"776177"},"profileUrl":"/cricket-team/afghanistan/96"},"players":{"Squad":[
  {"id":8023,"name":"Rahmanullah Gurbaz","fullName":"Rahmanullah Gurbaz","captain":false,"keeper":true,"role":"WK-Batter","battingStyle":"RIGHT","bowlingStyle":"$undefined","imageDetails":{"imageId":845700}},
  {"id":9257,"name":"Hashmatullah Shahidi","fullName":"Hashmatullah Shahidi","captain":true,"keeper":false,"role":"Batter","battingStyle":"LEFT","bowlingStyle":"$undefined","imageDetails":{"imageId":845701}}
]}}
</script>
"""


class TestCricbuzzFallbackParsing(unittest.TestCase):
    def test_extracts_match_links_from_upcoming_page(self):
        links = _extract_cricbuzz_match_links(CRICBUZZ_UPCOMING_HTML)

        self.assertEqual(len(links), 1)
        self.assertEqual(links[0]["match_id"], "151020")
        self.assertEqual(links[0]["slug"], "ire-vs-afg-4th-odi-afghanistan-tour-of-ireland-2026")
        self.assertEqual(links[0]["team1"], "Ireland")
        self.assertEqual(links[0]["team2"], "Afghanistan")

    def test_extracts_team_objects_from_squads_page(self):
        teams = _extract_cricbuzz_team_objects(CRICBUZZ_SQUADS_HTML)

        self.assertEqual([team["teamName"] for team in teams], ["Ireland", "Afghanistan"])
        self.assertEqual(teams[0]["players"]["Squad"][0]["fullName"], "Paul Stirling")

    def test_fetches_normalized_squads_from_cricbuzz_pages(self):
        class MockResponse:
            def __init__(self, text: str):
                self.text = text

            def raise_for_status(self) -> None:
                return None

        responses = [MockResponse(CRICBUZZ_UPCOMING_HTML), MockResponse(CRICBUZZ_SQUADS_HTML)]

        def fake_get(*_args, **_kwargs):
            return responses.pop(0)

        from unittest.mock import patch

        with patch("fetch_squads.requests.get", side_effect=fake_get):
            squads = fetch_squad_from_cricbuzz("Ireland", "Afghanistan")

        self.assertIsNotNone(squads)
        assert squads is not None
        self.assertEqual([team["teamName"] for team in squads], ["Ireland", "Afghanistan"])
        self.assertEqual(squads[0]["players"][0]["name"], "Paul Stirling")
        self.assertTrue(squads[0]["players"][0]["is_captain"])
        self.assertTrue(squads[0]["players"][1]["is_keeper"])
        self.assertFalse(squads[0]["is_confirmed"])


if __name__ == "__main__":
    unittest.main()
