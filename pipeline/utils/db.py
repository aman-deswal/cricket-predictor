"""Supabase database client wrapper."""

import os
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


def get_upcoming_matches(date: str) -> list[dict]:
    """Fetch upcoming matches for a given date."""
    client = get_client()
    response = (
        client.table("matches")
        .select("*")
        .eq("date", date)
        .eq("status", "upcoming")
        .execute()
    )
    return response.data


def store_prediction(prediction: dict) -> None:
    """Insert a prediction record."""
    client = get_client()
    client.table("predictions").upsert(prediction, on_conflict="match_id").execute()


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
