import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from enrich_matches import (
    build_data_backed_preview,
    build_source_links,
    extract_espn_player_updates,
    mentions_team,
)


class TestTeamMentionMatching(unittest.TestCase):
    def test_shared_prefix_teams_do_not_match_on_prefix_alone(self):
        article = "India Pakistan meeting reserved for medals at Asian Games."
        self.assertFalse(mentions_team("Pakistan Blues", article.lower()))
        self.assertFalse(mentions_team("Pakistan Greens", article.lower()))

    def test_full_team_name_still_matches(self):
        article = "Pakistan Blues face Pakistan Greens in the Multan curtain-raiser."
        self.assertTrue(mentions_team("Pakistan Blues", article.lower()))
        self.assertTrue(mentions_team("Pakistan Greens", article.lower()))


class TestFallbackGarnish(unittest.TestCase):
    def test_extracts_player_updates_from_espn_news(self):
        updates = extract_espn_player_updates(
            {
                "news": [
                    {
                        "headline": "George Munsey returns after a fitness scare",
                        "story": "George Munsey is back in the squad after passing a late fitness test.",
                    }
                ]
            },
            team1="Scotland",
            team2="Netherlands",
            team1_squad=["George Munsey", "Richie Berrington"],
            team2_squad=["Max O'Dowd"],
        )
        self.assertEqual(len(updates), 1)
        self.assertEqual(updates[0]["player"], "George Munsey")
        self.assertEqual(updates[0]["team"], "Scotland")
        self.assertEqual(updates[0]["confidence"], "reported")

    def test_builds_preview_without_blank_match_type_or_zero_sample_boilerplate(self):
        preview = build_data_backed_preview(
            match={"team1": "Pakistan Blues", "team2": "Pakistan Greens", "match_type": ""},
            team1_form={"matches_played": 0, "recent_wins": 0},
            team2_form={"matches_played": 3, "recent_wins": 2},
            h2h={"total_matches": 0, "team1_wins": 0, "team2_wins": 0},
            espn_ctx={"news": [{"headline": "Tournament opener set for Multan", "story": ""}], "standings": []},
            player_updates=[],
        )
        self.assertIn("Pakistan Blues do not have a reliable recent tracked sample yet", preview)
        self.assertNotIn("Recent  form", preview)
        self.assertNotIn("0 of their last 0", preview)

    def test_includes_espn_links_when_source_search_is_empty(self):
        links = build_source_links(
            [],
            {
                "news": [
                    {
                        "headline": "Preview: Ireland look to test Afghanistan",
                        "url": "https://www.espncricinfo.com/story/example",
                        "published_at": "2026-08-15T00:00:00Z",
                    }
                ]
            },
            limit=4,
        )
        self.assertEqual(len(links), 1)
        self.assertEqual(links[0]["source"], "ESPNcricinfo")
        self.assertEqual(links[0]["url"], "https://www.espncricinfo.com/story/example")


if __name__ == "__main__":
    unittest.main()
