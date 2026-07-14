"""Supabase database client wrapper."""

import os
from typing import Optional

from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()


def get_client() -> Client:
    """Initialize and return Supabase client from environment variables."""
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_KEY"]
    return create_client(url, key)


def upsert_matches(matches: list[dict]) -> None:
    """Upsert match fixtures into the matches table."""
    client = get_client()
    client.table("matches").upsert(matches, on_conflict="match_id").execute()


def replace_upcoming_matches(matches: list[dict]) -> None:
    """Replace currently displayed upcoming/current match fixtures."""
    client = get_client()
    client.table("matches").delete().eq("status", "upcoming").execute()
    if matches:
        client.table("matches").upsert(matches, on_conflict="match_id").execute()


def get_upcoming_matches(date: Optional[str] = None) -> list[dict]:
    """Fetch upcoming matches, optionally constrained to a single date."""
    client = get_client()
    query = client.table("matches").select("*").eq("status", "upcoming")
    if date is not None:
        query = query.eq("date", date)
    response = query.order("date", desc=False).execute()
    return response.data


def store_prediction(prediction: dict) -> None:
    """Insert a prediction record."""
    client = get_client()
    client.table("predictions").upsert(prediction, on_conflict="match_id").execute()


def get_prediction(match_id: str) -> Optional[dict]:
    """Fetch one prediction, if present."""
    client = get_client()
    response = (
        client.table("predictions")
        .select("*")
        .eq("match_id", match_id)
        .execute()
    )
    return response.data[0] if response.data else None


def get_match_enrichment(match_id: str) -> Optional[dict]:
    """Fetch enrichment for one match, if present."""
    client = get_client()
    response = (
        client.table("match_enrichment")
        .select("*")
        .eq("match_id", match_id)
        .execute()
    )
    return response.data[0] if response.data else None


def store_match_enrichment(enrichment: dict) -> None:
    """Upsert match enrichment generated from web/news sources."""
    client = get_client()
    client.table("match_enrichment").upsert(enrichment, on_conflict="match_id").execute()


def get_pending_results() -> list[dict]:
    """Get matches that are completed but not yet scored."""
    client = get_client()
    response = (
        client.table("matches")
        .select("*, predictions(*)")
        .eq("status", "completed")
        .is_("predictions.scored_at", "null")
        .execute()
    )
    return response.data


def store_result(result: dict) -> None:
    """Store a prediction result with scoring."""
    client = get_client()
    client.table("prediction_results").upsert(result, on_conflict="prediction_id").execute()


def get_all_predictions() -> list[dict]:
    """Fetch all scored predictions for calibration."""
    client = get_client()
    response = (
        client.table("prediction_results")
        .select("*, predictions(*)")
        .execute()
    )
    return response.data


# --- Stats cache lookups (Supabase-backed) ---

_stats_cache: dict[str, list[dict]] = {}


def _load_stats_cache(stat_type: str, match_type: str) -> list[dict]:
    """Load a stats_cache entry, with in-memory caching for the session."""
    key = f"{stat_type}:{match_type}"
    if key not in _stats_cache:
        client = get_client()
        response = (
            client.table("stats_cache")
            .select("data")
            .eq("stat_type", stat_type)
            .eq("match_type", match_type)
            .execute()
        )
        _stats_cache[key] = response.data[0]["data"] if response.data else []
    return _stats_cache[key]


def get_team_form_from_cache(team: str, match_type: str) -> dict:
    """Look up team form from Supabase stats_cache."""
    records = _load_stats_cache("team_stats", match_type)
    # Try exact match first, then case-insensitive
    for record in records:
        if record.get("team") == team:
            return {
                "win_rate": record.get("win_rate", 0.5),
                "matches_played": record.get("matches_played", 0),
                "recent_wins": record.get("recent_wins", 0),
            }
    # Try partial/case-insensitive match
    team_lower = team.lower().replace(" women", "").replace(" men", "").strip()
    for record in records:
        if record.get("team", "").lower() == team_lower:
            return {
                "win_rate": record.get("win_rate", 0.5),
                "matches_played": record.get("matches_played", 0),
                "recent_wins": record.get("recent_wins", 0),
            }
    return {"win_rate": 0.5, "matches_played": 0, "recent_wins": 0}


def get_h2h_from_cache(team1: str, team2: str, match_type: str) -> dict:
    """Look up head-to-head from Supabase stats_cache."""
    records = _load_stats_cache("h2h_stats", match_type)
    for record in records:
        r_team1 = record.get("team1", "")
        r_team2 = record.get("team2", "")
        if (r_team1 == team1 and r_team2 == team2) or (r_team1 == team2 and r_team2 == team1):
            # Normalize direction
            if r_team1 == team1:
                return {
                    "total_matches": record.get("total_matches", 0),
                    "team1_wins": record.get("team1_wins", 0),
                    "team2_wins": record.get("team2_wins", 0),
                }
            else:
                return {
                    "total_matches": record.get("total_matches", 0),
                    "team1_wins": record.get("team2_wins", 0),
                    "team2_wins": record.get("team1_wins", 0),
                }
    return {"total_matches": 0, "team1_wins": 0, "team2_wins": 0}


def get_venue_from_cache(venue: str, match_type: str) -> dict:
    """Look up venue stats from Supabase stats_cache."""
    records = _load_stats_cache("venue_stats", match_type)
    venue_lower = venue.lower()
    for record in records:
        if venue_lower in record.get("venue", "").lower() or record.get("venue", "").lower() in venue_lower:
            return {
                "matches_at_venue": record.get("matches_at_venue", 0),
                "toss_bat_first_win_rate": record.get("toss_bat_first_win_rate", 0.5),
            }
    return {"matches_at_venue": 0, "toss_bat_first_win_rate": 0.5}
