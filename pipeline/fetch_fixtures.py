"""Fetch upcoming cricket fixtures from CricAPI and store in Supabase."""

import argparse
import logging
from typing import Optional

from utils.cricapi import fetch_current_matches
from utils.db import replace_upcoming_matches

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


def main(match_types: Optional[list[str]] = None) -> None:
    """
    Fetch current fixtures from CricAPI and store in database.

    Args:
        match_types: List of match types to fetch (default: ["odi", "t20"])
    """
    if match_types is None:
        match_types = ["odi", "t20"]

    logger.info("Fetching current matches...")
    all_matches = fetch_current_matches(match_types)
    logger.info(f"Found {len(all_matches)} current matches")

    logger.info("Replacing current matches in database...")
    replace_upcoming_matches(all_matches)
    logger.info("Done.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Fetch current cricket fixtures")
    parser.add_argument(
        "--types",
        nargs="+",
        default=["odi", "t20"],
        help="International match types to fetch (default: odi t20)",
    )
    args = parser.parse_args()
    main(match_types=args.types)
