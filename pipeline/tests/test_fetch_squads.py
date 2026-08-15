"""Unit tests for Cricbuzz squad fallback parsing."""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import unittest
from unittest.mock import MagicMock, patch

from fetch_squads import (
    _extract_cricbuzz_match_links,
    _extract_cricbuzz_team_objects,
    _merge_existing_player_images,
    fetch_squad_from_cricbuzz,
    store_squad,
)


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

CRICBUZZ_UPCOMING_HTML_TITLE_FIRST = """
<a title="Australia vs Bangladesh, 1st Test - Preview "
   href="/live-cricket-scores/148316/aus-vs-ban-1st-test-bangladesh-tour-of-australia-2026"
   class="fixture-link">
  <span>Australia vs Bangladesh</span>
</a>
"""

CRICBUZZ_SQUADS_HTML_NEXT = """
<script>self.__next_f.push([1,"{\\"team1\\":{\\"team\\":{\\"teamId\\":4,\\"teamName\\":\\"Australia\\",\\"teamSName\\":\\"AUS\\"},\\"players\\":{\\"Squad\\":[{\\"id\\":8095,\\"name\\":\\"Pat Cummins\\",\\"fullName\\":\\"Pat Cummins\\",\\"captain\\":true,\\"keeper\\":false,\\"role\\":\\"Bowler\\",\\"battingStyle\\":\\"Right-hand bat\\",\\"bowlingStyle\\":\\"Right-arm fast\\",\\"imageDetails\\":{\\"imageId\\":352460}}]}},\\"team2\\":{\\"team\\":{\\"teamId\\":6,\\"teamName\\":\\"Bangladesh\\",\\"teamSName\\":\\"BAN\\"},\\"players\\":{\\"Squad\\":[{\\"id\\":56007,\\"name\\":\\"Najmul Hossain Shanto\\",\\"fullName\\":\\"Najmul Hossain Shanto\\",\\"captain\\":true,\\"keeper\\":false,\\"role\\":\\"Batter\\",\\"battingStyle\\":\\"Left-hand bat\\",\\"bowlingStyle\\":\\"Right-arm offbreak\\",\\"imageDetails\\":{\\"imageId\\":845999}}]}}}"])</script>
"""


class TestCricbuzzFallbackParsing(unittest.TestCase):
    def test_extracts_match_links_from_upcoming_page(self):
        links = _extract_cricbuzz_match_links(CRICBUZZ_UPCOMING_HTML)

        self.assertEqual(len(links), 1)
        self.assertEqual(links[0]["match_id"], "151020")
        self.assertEqual(links[0]["slug"], "ire-vs-afg-4th-odi-afghanistan-tour-of-ireland-2026")
        self.assertEqual(links[0]["team1"], "Ireland")
        self.assertEqual(links[0]["team2"], "Afghanistan")

    def test_extracts_match_links_when_title_precedes_href(self):
        links = _extract_cricbuzz_match_links(CRICBUZZ_UPCOMING_HTML_TITLE_FIRST)

        self.assertEqual(len(links), 1)
        self.assertEqual(links[0]["match_id"], "148316")
        self.assertEqual(links[0]["team1"], "Australia")
        self.assertEqual(links[0]["team2"], "Bangladesh")

    def test_extracts_team_objects_from_squads_page(self):
        teams = _extract_cricbuzz_team_objects(CRICBUZZ_SQUADS_HTML)

        self.assertEqual([team["teamName"] for team in teams], ["Ireland", "Afghanistan"])
        self.assertEqual(teams[0]["players"]["Squad"][0]["fullName"], "Paul Stirling")

    def test_extracts_team_objects_from_next_payload(self):
        teams = _extract_cricbuzz_team_objects(CRICBUZZ_SQUADS_HTML_NEXT)

        self.assertEqual([team["teamName"] for team in teams], ["Australia", "Bangladesh"])
        self.assertEqual(teams[0]["players"]["Squad"][0]["fullName"], "Pat Cummins")

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


class TestPlayerImagePreservation(unittest.TestCase):
    def test_merge_preserves_existing_valid_headshot_when_refresh_is_blank(self):
        merged = _merge_existing_player_images(
            [{"id": "42", "name": "KL Rahul", "image_url": ""}],
            [{"id": "42", "name": "KL Rahul", "image_url": "https://cdn.example/rahul.png"}],
        )

        self.assertEqual(merged[0]["image_url"], "https://cdn.example/rahul.png")

    def test_merge_falls_back_to_name_match_when_provider_id_changes(self):
        merged = _merge_existing_player_images(
            [{"id": "new-42", "name": "K L Rahul", "image_url": ""}],
            [{"id": "42", "name": "KL Rahul", "image_url": "https://cdn.example/rahul.png"}],
        )

        self.assertEqual(merged[0]["image_url"], "https://cdn.example/rahul.png")

    @patch("fetch_squads.get_client")
    def test_store_squad_preserves_existing_headshots_during_upsert(self, mock_get_client):
        client = MagicMock()
        select_query = MagicMock()
        select_query.eq.return_value = select_query
        select_query.limit.return_value = select_query
        select_query.execute.return_value = MagicMock(
            data=[{"players": [{"id": "42", "name": "KL Rahul", "image_url": "https://cdn.example/rahul.png"}]}]
        )

        upsert_query = MagicMock()
        match_squads_table = MagicMock()
        match_squads_table.select.return_value = select_query
        match_squads_table.upsert.return_value = upsert_query
        client.table.return_value = match_squads_table
        mock_get_client.return_value = client

        stored = store_squad(
            "match-1",
            "India",
            [{"id": "42", "name": "KL Rahul", "image_url": ""}],
            is_confirmed=True,
            source="espn",
        )

        self.assertTrue(stored)
        stored_payload = match_squads_table.upsert.call_args[0][0]
        self.assertEqual(stored_payload["players"][0]["image_url"], "https://cdn.example/rahul.png")


if __name__ == "__main__":
    unittest.main()
