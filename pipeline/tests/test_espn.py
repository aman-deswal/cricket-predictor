import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from utils.espn import _parse_summary


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


if __name__ == "__main__":
    unittest.main()
