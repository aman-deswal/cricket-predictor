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
