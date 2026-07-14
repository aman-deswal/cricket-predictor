"""CricAPI helper functions for fetching fixtures and results."""

import os
import requests
from dotenv import load_dotenv

load_dotenv()

BASE_URL = "https://api.cricapi.com/v1"


def _get_api_key() -> str:
    return os.environ["CRICAPI_KEY"]


def fetch_upcoming_matches(match_type: str = "t20") -> list[dict]:
    """
    Fetch upcoming matches from CricAPI.

    Args:
        match_type: Type of match (t20, odi, test, ipl)

    Returns:
        List of match dicts with keys: match_id, name, team1, team2, date, venue, match_type
    """
    response = requests.get(
        f"{BASE_URL}/matches",
        params={"apikey": _get_api_key(), "offset": 0},
        timeout=30,
    )
    response.raise_for_status()
    data = response.json()

    if data.get("status") != "success":
        raise RuntimeError(f"CricAPI error: {data.get('status')}")

    matches = []
    for match in data.get("data", []):
        if not match.get("matchStarted", False) and match_type in match.get("matchType", "").lower():
            matches.append({
                "match_id": match["id"],
                "name": match.get("name", ""),
                "team1": match.get("teams", ["", ""])[0] if match.get("teams") else "",
                "team2": match.get("teams", ["", ""])[1] if len(match.get("teams", [])) > 1 else "",
                "date": match.get("date", ""),
                "venue": match.get("venue", ""),
                "match_type": match.get("matchType", ""),
                "status": "upcoming",
            })

    return matches


def fetch_match_result(match_id: str) -> dict | None:
    """
    Fetch the result of a completed match.

    Args:
        match_id: CricAPI match ID

    Returns:
        Dict with match result or None if not completed
    """
    response = requests.get(
        f"{BASE_URL}/match_info",
        params={"apikey": _get_api_key(), "id": match_id},
        timeout=30,
    )
    response.raise_for_status()
    data = response.json()

    if data.get("status") != "success":
        return None

    match_data = data.get("data", {})
    if not match_data.get("matchEnded", False):
        return None

    return {
        "match_id": match_id,
        "winner": match_data.get("matchWinner", ""),
        "score": match_data.get("score", []),
        "status": "completed",
    }
