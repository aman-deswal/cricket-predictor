"""Compute rolling statistics from Cricsheet historical data."""

import argparse
import logging
from typing import Optional

import pandas as pd

from utils.cricsheet import (
    get_head_to_head,
    get_team_recent_form,
    get_venue_stats,
    load_match_data,
)
from utils.db import get_client

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


def compute_team_stats(match_type: str = "t20s") -> pd.DataFrame:
    """
    Compute rolling team statistics.

    Returns DataFrame with columns: team, win_rate, avg_score, form_last_10
    """
    df = load_match_data(match_type)
    teams = set(df["team1"].unique()) | set(df["team2"].unique())

    stats = []
    for team in teams:
        form = get_team_recent_form(team, match_type)
        stats.append({
            "team": team,
            "match_type": match_type,
            **form,
        })

    return pd.DataFrame(stats)


def compute_venue_stats(match_type: str = "t20s") -> pd.DataFrame:
    """Compute venue-level statistics."""
    df = load_match_data(match_type)
    venues = df["venue"].dropna().unique()

    stats = []
    for venue in venues:
        venue_data = get_venue_stats(venue, match_type)
        stats.append({
            "venue": venue,
            "match_type": match_type,
            **venue_data,
        })

    return pd.DataFrame(stats)


def compute_h2h_stats(match_type: str = "t20s") -> pd.DataFrame:
    """Compute head-to-head records for all team pairs."""
    df = load_match_data(match_type)
    teams = sorted(set(df["team1"].unique()) | set(df["team2"].unique()))

    records = []
    seen = set()
    for i, team1 in enumerate(teams):
        for team2 in teams[i + 1:]:
            key = tuple(sorted([team1, team2]))
            if key in seen:
                continue
            seen.add(key)

            h2h = get_head_to_head(team1, team2, match_type)
            if h2h["total_matches"] > 0:
                records.append({
                    "team1": team1,
                    "team2": team2,
                    "match_type": match_type,
                    **h2h,
                })

    return pd.DataFrame(records)


def cache_stats(match_type: str = "t20s") -> None:
    """Compute all stats and cache to Supabase."""
    logger.info(f"Computing team stats for {match_type}...")
    team_stats = compute_team_stats(match_type)

    logger.info(f"Computing venue stats for {match_type}...")
    venue_stats = compute_venue_stats(match_type)

    logger.info(f"Computing H2H stats for {match_type}...")
    h2h_stats = compute_h2h_stats(match_type)

    client = get_client()

    # Store in stats_cache table
    all_stats = {
        "team_stats": team_stats.to_dict(orient="records"),
        "venue_stats": venue_stats.to_dict(orient="records"),
        "h2h_stats": h2h_stats.to_dict(orient="records"),
    }

    for stat_type, records in all_stats.items():
        if records:
            client.table("stats_cache").upsert(
                [{"stat_type": stat_type, "match_type": match_type, "data": records}],
                on_conflict="stat_type,match_type",
            ).execute()

    logger.info("Stats cached successfully.")


def main(match_types: Optional[list[str]] = None) -> None:
    if match_types is None:
        match_types = ["t20s", "ipl"]

    for mt in match_types:
        cache_stats(mt)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Compute cricket statistics")
    parser.add_argument(
        "--types",
        nargs="+",
        default=["t20s", "ipl"],
        help="Match types to compute stats for",
    )
    args = parser.parse_args()
    main(match_types=args.types)
