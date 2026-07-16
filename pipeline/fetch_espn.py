"""Fetch rich match data from ESPN Cricinfo and store in Supabase.

For each upcoming match, this script:
1. Searches ESPN for the matching series/event
2. Fetches venue, toss, playing XI, officials, H2H, standings, scorecards
3. Stores everything in the ``espn_match_data`` table
4. Backfills verified venue on the ``matches`` table

Usage:
    python fetch_espn.py                    # all upcoming matches
    python fetch_espn.py --limit 5          # first 5 matches
    python fetch_espn.py --match-id <id>    # single match
"""

import argparse
import json
import logging
import os
from datetime import datetime, timezone
from typing import Optional

from dotenv import load_dotenv

load_dotenv()

from utils.espn import find_espn_event_id, get_match_summary
from utils.db import get_client, get_upcoming_matches

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


def store_espn_data(client, match_id: str, espn_data: dict) -> None:
    """Upsert ESPN data into Supabase."""
    venue = espn_data.get("venue", {})
    toss = espn_data.get("toss", {})
    schedule = espn_data.get("schedule", {})

    row = {
        "match_id": match_id,
        "espn_event_id": espn_data.get("espn_event_id"),
        # Venue
        "venue_name": venue.get("name", ""),
        "venue_city": venue.get("city", ""),
        "venue_country": venue.get("country", ""),
        "venue_capacity": venue.get("capacity"),
        "venue_grass": venue.get("grass"),
        "venue_image_url": venue.get("image_url"),
        "venue_espn_id": venue.get("espn_id"),
        # Toss
        "toss_winner": toss.get("winner", ""),
        "toss_decision": toss.get("decision", ""),
        # Schedule
        "match_number": schedule.get("match_number", ""),
        "match_days": schedule.get("match_days", ""),
        "hours_of_play": schedule.get("hours_of_play", ""),
        "series_note": schedule.get("series_note", ""),
        # Rich JSON data
        "officials": json.dumps(espn_data.get("officials", [])),
        "rosters": json.dumps(espn_data.get("rosters", [])),
        "head_to_head": json.dumps(espn_data.get("head_to_head", [])),
        "scorecards": json.dumps(espn_data.get("scorecards", [])),
        "standings": json.dumps(espn_data.get("standings", [])),
        # Metadata
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }

    try:
        client.table("espn_match_data").upsert(
            row, on_conflict="match_id"
        ).execute()
        logger.info("  Stored ESPN data for match %s (event %s)", match_id, espn_data.get("espn_event_id"))
    except Exception as exc:
        logger.error("  Failed to store ESPN data: %s", exc)


def backfill_venue(client, match_id: str, venue: dict) -> None:
    """Update the matches table with verified ESPN venue."""
    venue_name = venue.get("name", "")
    if not venue_name:
        return

    try:
        client.table("matches").update({
            "venue": venue_name,
        }).eq("match_id", match_id).execute()
        logger.info("  Backfilled venue: %s", venue_name)
    except Exception as exc:
        logger.warning("  Failed to backfill venue: %s", exc)


def backfill_enrichment_venue(client, match_id: str, venue: dict) -> None:
    """Update match_enrichment with verified ESPN venue."""
    venue_name = venue.get("name", "")
    if not venue_name:
        return

    try:
        client.table("match_enrichment").update({
            "venue_name": venue_name,
            "venue_confidence": "confirmed",
        }).eq("match_id", match_id).execute()
        logger.info("  Fixed enrichment venue: %s", venue_name)
    except Exception as exc:
        logger.debug("  No enrichment row to update: %s", exc)


def process_match(client, match: dict) -> bool:
    """Fetch ESPN data for a single match. Returns True if successful."""
    team1 = match.get("team1", "")
    team2 = match.get("team2", "")
    match_date = match.get("date", "")
    match_type = match.get("match_type", "")
    match_id = match.get("match_id", "")

    logger.info("Processing: %s vs %s (%s, %s)", team1, team2, match_date[:10], match_type)

    # Check if we already have ESPN data with an event ID
    try:
        existing = client.table("espn_match_data").select("espn_event_id, fetched_at").eq(
            "match_id", match_id
        ).execute()
        if existing.data and existing.data[0].get("espn_event_id"):
            # Re-fetch to get updated data (toss, scorecard, etc.)
            event_id = existing.data[0]["espn_event_id"]
            logger.info("  Re-fetching known ESPN event %s", event_id)
            espn_data = get_match_summary(event_id)
            if espn_data:
                store_espn_data(client, match_id, espn_data)
                backfill_venue(client, match_id, espn_data.get("venue", {}))
                backfill_enrichment_venue(client, match_id, espn_data.get("venue", {}))
                return True
            return False
    except Exception:
        pass

    # Find ESPN event ID
    event_id = find_espn_event_id(team1, team2, match_date, match_type)
    if not event_id:
        logger.warning("  No ESPN event found for %s vs %s", team1, team2)
        return False

    logger.info("  Found ESPN event ID: %s", event_id)

    # Fetch full summary
    espn_data = get_match_summary(event_id)
    if not espn_data:
        logger.warning("  Failed to fetch ESPN summary for event %s", event_id)
        return False

    # Store
    store_espn_data(client, match_id, espn_data)
    backfill_venue(client, match_id, espn_data.get("venue", {}))
    backfill_enrichment_venue(client, match_id, espn_data.get("venue", {}))

    return True


def main(limit: int = 50, match_id: Optional[str] = None) -> None:
    client = get_client()
    matches = get_upcoming_matches()

    if match_id:
        matches = [m for m in matches if m.get("match_id") == match_id]

    matches = matches[:limit]
    logger.info("Fetching ESPN data for %d matches", len(matches))

    success = 0
    for match in matches:
        if process_match(client, match):
            success += 1

    logger.info("ESPN fetch complete: %d/%d matches enriched", success, len(matches))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Fetch ESPN Cricinfo match data")
    parser.add_argument("--limit", type=int, default=50, help="Max matches to process")
    parser.add_argument("--match-id", help="Process a single match by ID")
    args = parser.parse_args()
    main(limit=args.limit, match_id=args.match_id)
