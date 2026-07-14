"""Fetch upcoming cricket fixtures from CricAPI and store in Supabase."""

import argparse
import logging
from datetime import datetime

from utils.cricapi import fetch_upcoming_matches
from utils.db import upsert_matches

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


def main(match_types: list[str] | None = None) -> None:
    """
    Fetch upcoming fixtures for specified match types and store in database.

    Args:
        match_types: List of match types to fetch (default: ["t20", "ipl"])
    """
    if match_types is None:
        match_types = ["t20", "ipl"]

    all_matches = []

    for match_type in match_types:
        logger.info(f"Fetching upcoming {match_type} matches...")
        matches = fetch_upcoming_matches(match_type)
        logger.info(f"Found {len(matches)} upcoming {match_type} matches")
        all_matches.extend(matches)

    if all_matches:
        logger.info(f"Upserting {len(all_matches)} matches to database...")
        upsert_matches(all_matches)
        logger.info("Done.")
    else:
        logger.info("No upcoming matches found.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Fetch upcoming cricket fixtures")
    parser.add_argument(
        "--types",
        nargs="+",
        default=["t20", "ipl"],
        help="Match types to fetch (default: t20 ipl)",
    )
    args = parser.parse_args()
    main(match_types=args.types)
