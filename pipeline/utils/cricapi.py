"""CricAPI helper functions for fetching fixtures and results."""

import os
from datetime import datetime, timezone
from typing import Optional

import requests
from dotenv import load_dotenv

load_dotenv()

BASE_URL = "https://api.cricapi.com/v1"

INTERNATIONAL_TEAMS = {
    "Afghanistan",
    "Australia",
    "Bangladesh",
    "Canada",
    "England",
    "Hong Kong",
    "India",
    "Ireland",
    "Namibia",
    "Nepal",
    "Netherlands",
    "New Zealand",
    "Oman",
    "Pakistan",
    "Papua New Guinea",
    "Scotland",
    "South Africa",
    "Sri Lanka",
    "United Arab Emirates",
    "United States",
    "USA",
    "West Indies",
    "Zimbabwe",
}

TEAM_SUFFIXES = (" Women", " Men")


def _get_api_key() -> str:
    return os.environ["CRICAPI_KEY"]


def _is_international_match(match: dict) -> bool:
    teams = match.get("teams") or []
    if len(teams) < 2:
        return False

    return all(_normalize_team_name(team) in INTERNATIONAL_TEAMS for team in teams[:2])


def _normalize_team_name(team: str) -> str:
    for suffix in TEAM_SUFFIXES:
        if team.endswith(suffix):
            return team[: -len(suffix)]
    return team


def _matches_type(match: dict, match_types: set[str]) -> bool:
    match_type = match.get("matchType", "").lower()
    return any(requested_type in match_type for requested_type in match_types)


def _parse_match_datetime(value: str) -> Optional[datetime]:
    if not value:
        return None

    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None

    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _is_upcoming_fixture(match: dict, now: Optional[datetime] = None) -> bool:
    if match.get("ms") and match.get("ms") != "fixture":
        return False

    match_time = _parse_match_datetime(match.get("dateTimeGMT") or match.get("date", ""))
    if match_time is None:
        return False

    current_time = now or datetime.now(timezone.utc)
    return match_time > current_time


def _clean_team_name(team: str) -> str:
    return team.rsplit(" [", 1)[0]


def _to_match_record(match: dict) -> dict:
    teams = match.get("teams") or []
    team1 = match.get("t1") or (teams[0] if teams else "")
    team2 = match.get("t2") or (teams[1] if len(teams) > 1 else "")
    series = match.get("series", "")

    return {
        "match_id": match["id"],
        "name": match.get("name") or f"{team1} vs {team2}, {series}".strip(", "),
        "team1": _clean_team_name(team1),
        "team2": _clean_team_name(team2),
        "date": match.get("dateTimeGMT") or match.get("date", ""),
        "venue": match.get("venue") or series,
        "match_type": match.get("matchType", ""),
        "status": "upcoming",
    }


def fetch_current_matches(match_types: list[str]) -> list[dict]:
    """
    Fetch current scorecard fixtures from CricAPI.

    Args:
        match_types: Match formats to keep, such as ['odi', 't20']

    Returns:
        List of match dicts with keys: match_id, name, team1, team2, date, venue, match_type
    """
    response = requests.get(
        f"{BASE_URL}/cricScore",
        params={"apikey": _get_api_key(), "offset": 0},
        timeout=30,
    )
    response.raise_for_status()
    data = response.json()

    if data.get("status") != "success":
        raise RuntimeError(f"CricAPI error: {data.get('status')}")

    requested_types = {match_type.lower() for match_type in match_types}
    matches = []
    for match in data.get("data", []):
        if _matches_type(match, requested_types) and _is_upcoming_fixture(match):
            matches.append(_to_match_record(match))

    return matches


def fetch_upcoming_matches(match_type: str = "t20") -> list[dict]:
    """
    Fetch upcoming matches from CricAPI.

    Args:
        match_type: Type of match (t20, odi, test, ipl)

    Returns:
        List of match dicts with keys: match_id, name, team1, team2, date, venue, match_type
    """
    return fetch_current_matches([match_type])


def fetch_match_result(match_id: str) -> Optional[dict]:
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
