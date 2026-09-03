import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from unittest.mock import patch

from utils.espn import _parse_summary, find_espn_event_id


class TestEspnSummaryParsing(unittest.TestCase):
    def test_falls_back_to_summary_squads_when_rosters_are_empty(self):
        parsed = _parse_summary(
            {
                "gameInfo": {"venue": {"fullName": "Darwin Stadium", "address": {}}},
                "rosters": [
                    {
                        "team": {"displayName": "Australia", "abbreviation": "AUS", "id": "2"},
                        "roster": [],
                    },
                    {
                        "team": {"displayName": "Bangladesh", "abbreviation": "BAN", "id": "25"},
                        "roster": [],
                    },
                ],
                "squads": [
                    {
                        "team": {
                            "displayName": "Australia",
                            "abbreviation": "AUS",
                            "id": "2",
                            "logos": [{"href": "https://a.espncdn.com/i/teamlogos/cricket/500/2.png"}],
                        },
                        "athletes": [
                            {
                                "id": "489889",
                                "displayName": "Pat Cummins",
                                "position": {"name": "Bowler", "abbreviation": "BL"},
                            }
                        ],
                    },
                    {
                        "team": {
                            "displayName": "Bangladesh",
                            "abbreviation": "BAN",
                            "id": "25",
                            "logos": [{"href": "https://a.espncdn.com/i/teamlogos/cricket/500/25.png"}],
                        },
                        "athletes": [
                            {
                                "id": "303669",
                                "displayName": "Najmul Hossain Shanto",
                                "position": {"name": "Batter", "abbreviation": "BT"},
                            }
                        ],
                    },
                ],
            },
            "1527273",
        )

        self.assertEqual([roster["team_name"] for roster in parsed["rosters"]], ["Australia", "Bangladesh"])
        self.assertEqual(parsed["rosters"][0]["players"][0]["name"], "Pat Cummins")
        self.assertEqual(parsed["rosters"][1]["players"][0]["position"], "Batter")


class TestFindEspnEventId(unittest.TestCase):
    @patch("utils.espn._scan_nearby_events", return_value="1549001")
    @patch("utils.espn.get_series_events")
    @patch("utils.espn.find_series_id", return_value="8039")
    def test_skips_blank_event_ids_when_scanning_series_events(
        self,
        _find_series_id,
        mock_get_series_events,
        mock_scan_nearby_events,
    ):
        mock_get_series_events.return_value = [
            {"id": "", "date": "2026-09-04T10:00:00Z", "teams": ["Other", "Teams"]},
            {"id": "1548897", "date": "2026-09-05T10:00:00Z", "teams": ["Other", "Teams"]},
        ]

        event_id = find_espn_event_id("Qatar", "Singapore", "2026-09-04T12:00:00Z", "")

        self.assertEqual(event_id, "1549001")
        mock_scan_nearby_events.assert_called_once_with(
            1548897,
            "Qatar",
            "Singapore",
            "2026-09-04",
        )


if __name__ == "__main__":
    unittest.main()
