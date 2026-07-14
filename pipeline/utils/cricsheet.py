"""Cricsheet historical data loader and parser."""

import os
from pathlib import Path

import pandas as pd


DATA_DIR = Path(os.getenv("CRICSHEET_DATA_DIR", "data/cricsheet"))


def load_match_data(match_type: str = "t20s") -> pd.DataFrame:
    """
    Load Cricsheet match-level data.

    Args:
        match_type: One of 't20s', 'odis', 'tests', 'ipl'

    Returns:
        DataFrame with columns: match_id, date, team1, team2, winner, venue, toss_winner, toss_decision
    """
    filepath = DATA_DIR / f"{match_type}_matches.csv"
    if not filepath.exists():
        raise FileNotFoundError(f"Cricsheet data not found at {filepath}")

    df = pd.read_csv(filepath, parse_dates=["date"])
    return df


def load_ball_by_ball(match_type: str = "t20s") -> pd.DataFrame:
    """
    Load Cricsheet ball-by-ball data for detailed analysis.

    Args:
        match_type: One of 't20s', 'odis', 'tests', 'ipl'

    Returns:
        DataFrame with delivery-level data
    """
    filepath = DATA_DIR / f"{match_type}_deliveries.csv"
    if not filepath.exists():
        raise FileNotFoundError(f"Cricsheet data not found at {filepath}")

    df = pd.read_csv(filepath)
    return df


def get_team_recent_form(team: str, match_type: str = "t20s", n_matches: int = 10) -> dict:
    """
    Get team's recent form statistics.

    Args:
        team: Team name
        match_type: Match format
        n_matches: Number of recent matches to consider

    Returns:
        Dict with win_rate, avg_score, avg_wickets_lost
    """
    df = load_match_data(match_type)
    team_matches = df[(df["team1"] == team) | (df["team2"] == team)].tail(n_matches)

    if team_matches.empty:
        return {"win_rate": 0.5, "matches_played": 0, "avg_score": 0}

    wins = (team_matches["winner"] == team).sum()
    total = len(team_matches)

    return {
        "win_rate": wins / total if total > 0 else 0.5,
        "matches_played": total,
        "recent_wins": int(wins),
    }


def get_venue_stats(venue: str, match_type: str = "t20s") -> dict:
    """
    Get venue-specific statistics.

    Args:
        venue: Venue name
        match_type: Match format

    Returns:
        Dict with avg_first_innings_score, toss_bat_first_win_rate
    """
    df = load_match_data(match_type)
    venue_matches = df[df["venue"].str.contains(venue, case=False, na=False)]

    if venue_matches.empty:
        return {"matches_at_venue": 0, "avg_first_innings_score": 160}

    bat_first_wins = venue_matches[
        (venue_matches["toss_decision"] == "bat") &
        (venue_matches["toss_winner"] == venue_matches["winner"])
    ]

    return {
        "matches_at_venue": len(venue_matches),
        "toss_bat_first_win_rate": len(bat_first_wins) / len(venue_matches) if len(venue_matches) > 0 else 0.5,
    }


def get_head_to_head(team1: str, team2: str, match_type: str = "t20s") -> dict:
    """
    Get head-to-head record between two teams.

    Args:
        team1: First team name
        team2: Second team name
        match_type: Match format

    Returns:
        Dict with total_matches, team1_wins, team2_wins
    """
    df = load_match_data(match_type)
    h2h = df[
        ((df["team1"] == team1) & (df["team2"] == team2)) |
        ((df["team1"] == team2) & (df["team2"] == team1))
    ]

    if h2h.empty:
        return {"total_matches": 0, "team1_wins": 0, "team2_wins": 0}

    return {
        "total_matches": len(h2h),
        "team1_wins": int((h2h["winner"] == team1).sum()),
        "team2_wins": int((h2h["winner"] == team2).sum()),
    }
