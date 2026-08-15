"""Tests for garnish-only refresh helpers."""

import os
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from refresh_garnish import (
    build_match_garnish_payload,
    build_prediction_reasoning,
    refresh_match,
    trim_source_links,
)


class TestTrimSourceLinks(unittest.TestCase):
    def test_keeps_only_frontend_fields(self):
        trimmed = trim_source_links([
            {
                "title": "Preview",
                "url": "https://example.com/story",
                "source": "ESPNcricinfo",
                "published_at": "2026-08-15T00:00:00Z",
                "article_text": "long body",
                "score": 0.99,
            }
        ])

        self.assertEqual(
            trimmed,
            [{
                "title": "Preview",
                "url": "https://example.com/story",
                "source": "ESPNcricinfo",
                "published_at": "2026-08-15T00:00:00Z",
            }],
        )


class TestBuildMatchGarnishPayload(unittest.TestCase):
    def test_only_persists_garnish_fields(self):
        payload = build_match_garnish_payload(
            "espn-1",
            {
                "expert_preview": "Measured preview.",
                "player_updates": [{"status": "Captain available", "confidence": "reported"}],
                "source_links": [{"title": "Story", "url": "https://example.com", "source": "ICC"}],
                "venue_name": "Should not be persisted here",
                "confidence": "high",
            },
            generated_at="2026-08-15T01:00:00Z",
        )

        self.assertEqual(
            payload,
            {
                "match_id": "espn-1",
                "expert_preview": "Measured preview.",
                "player_updates": [{"status": "Captain available", "confidence": "reported"}],
                "source_links": [{"title": "Story", "url": "https://example.com", "source": "ICC"}],
                "generated_at": "2026-08-15T01:00:00Z",
            },
        )


class TestBuildPredictionReasoning(unittest.TestCase):
    def test_uses_stored_pick_without_recomputing_core(self):
        reasoning = build_prediction_reasoning(
            {
                "team1": "India",
                "team2": "Australia",
                "match_type": "odi",
                "team1_win_rate": 0.7,
                "team1_matches": 10,
                "team2_win_rate": 0.5,
                "team2_matches": 10,
                "h2h_team1_wins": 6,
                "h2h_team2_wins": 4,
                "h2h_total": 10,
                "odds_data": {"team1_odds": 1.8, "team2_odds": 2.1, "bookmaker": "OddsFeed"},
            },
            {
                "predicted_winner": "India",
                "team1_win_probability": 0.62,
                "team2_win_probability": 0.38,
            },
        )

        self.assertIn("India remain the stored SixSense pick at 62% win probability", reasoning)
        self.assertIn("Latest market context from OddsFeed lists India at 1.80 and Australia at 2.10", reasoning)
        self.assertNotIn("rewriting the stored winner", reasoning.lower())


class TestRefreshMatch(unittest.TestCase):
    @patch("refresh_garnish.update_prediction_garnish")
    @patch("refresh_garnish.build_context")
    @patch("refresh_garnish.get_prediction")
    @patch("refresh_garnish.store_match_garnish")
    @patch("refresh_garnish.enrich_match")
    def test_updates_only_garnish_paths_when_prediction_exists(
        self,
        mock_enrich_match,
        mock_store_match_garnish,
        mock_get_prediction,
        mock_build_context,
        mock_update_prediction_garnish,
    ):
        mock_enrich_match.return_value = {
            "expert_preview": "Conservative preview.",
            "player_updates": [{"status": "Reported availability note", "confidence": "reported"}],
            "source_links": [{"title": "Story", "url": "https://example.com", "source": "ICC"}],
            "toss_insight": "Chasing looks slightly better.",
        }
        mock_get_prediction.return_value = {
            "predicted_winner": "India",
            "team1_win_probability": 0.62,
            "team2_win_probability": 0.38,
        }
        mock_build_context.return_value = {
            "team1": "India",
            "team2": "Australia",
            "match_type": "odi",
            "team1_win_rate": 0.7,
            "team1_matches": 10,
            "team2_win_rate": 0.5,
            "team2_matches": 10,
            "h2h_team1_wins": 6,
            "h2h_team2_wins": 4,
            "h2h_total": 10,
            "odds_data": None,
            "venue": "Wankhede Stadium",
            "toss_bat_win_rate": 0.42,
        }

        garnish, updated_prediction = refresh_match(
            {"match_id": "espn-1", "team1": "India", "team2": "Australia"},
            source_limit=8,
        )

        self.assertTrue(updated_prediction)
        mock_store_match_garnish.assert_called_once()
        mock_update_prediction_garnish.assert_called_once()
        self.assertEqual(garnish["match_id"], "espn-1")
        self.assertEqual(garnish["expert_preview"], "Conservative preview.")

    @patch("refresh_garnish.update_prediction_garnish")
    @patch("refresh_garnish.get_prediction")
    @patch("refresh_garnish.store_match_garnish")
    @patch("refresh_garnish.enrich_match")
    def test_skips_prediction_update_when_core_row_missing(
        self,
        mock_enrich_match,
        mock_store_match_garnish,
        mock_get_prediction,
        mock_update_prediction_garnish,
    ):
        mock_enrich_match.return_value = {
            "expert_preview": "Preview.",
            "player_updates": [],
            "source_links": [],
        }
        mock_get_prediction.return_value = None

        _, updated_prediction = refresh_match(
            {"match_id": "espn-2", "team1": "Team A", "team2": "Team B"},
            source_limit=8,
        )

        self.assertFalse(updated_prediction)
        mock_store_match_garnish.assert_called_once()
        mock_update_prediction_garnish.assert_not_called()


if __name__ == "__main__":
    unittest.main()
