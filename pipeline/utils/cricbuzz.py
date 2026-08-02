"""Cricbuzz fixture helpers.

Uses public JSON-LD SportsEvent metadata from Cricbuzz's upcoming matches page
as a lightweight fallback when ESPN's header feed is too current-day biased.
"""

import hashlib
import html
import json
import logging
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import requests

logger = logging.getLogger(__name__)

CRICBUZZ_UPCOMING_URL = "https://www.cricbuzz.com/cricket-match/live-scores/upcoming-matches"
REQUEST_TIMEOUT = 15


def _parse_start_date(start_date: str) -> Optional[datetime]:
    if not start_date:
        return None
    try:
        return datetime.fromisoformat(start_date.replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None


def _stable_source_id(team1: str, team2: str, start_date: str, event_name: str) -> str:
    raw = "|".join([team1.strip().lower(), team2.strip().lower(), start_date, event_name.strip().lower()])
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]


def _sports_event_to_fixture(event: Dict[str, Any], now: Optional[datetime] = None) -> Optional[Dict[str, Any]]:
    """Convert a JSON-LD SportsEvent into the shared fixture shape."""
    competitors = event.get("competitor", [])
    if not isinstance(competitors, list) or len(competitors) < 2:
        return None

    team1 = competitors[0].get("name", "").strip()
    team2 = competitors[1].get("name", "").strip()
    start_date = event.get("startDate", "")
    if not team1 or not team2 or not start_date:
        return None

    start_dt = _parse_start_date(start_date)
    if start_dt is None:
        return None

    now_dt = now or datetime.now(timezone.utc)
    if start_dt <= now_dt:
        return None

    event_name = event.get("name", "").strip()
    source_id = _stable_source_id(team1, team2, start_date, event_name)

    return {
        "source": "cricbuzz",
        "source_id": source_id,
        "team1": team1,
        "team2": team2,
        "date": start_date,
        "league_name": event_name,
        "league_id": "",
        "status": "pre",
        "winner": None,
        "venue": event.get("location", "").strip(),
    }


def _extract_json_ld_objects(page_html: str) -> List[Dict[str, Any]]:
    decoded = html.unescape(page_html)
    objects: List[Dict[str, Any]] = []
    for script_body in re.findall(r'<script type="application/ld\+json">(.*?)</script>', decoded, re.S):
        try:
            parsed = json.loads(script_body)
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict):
            objects.append(parsed)
    return objects


def get_cricbuzz_upcoming_fixtures(now: Optional[datetime] = None) -> List[Dict[str, Any]]:
    """Fetch future match-level fixtures from Cricbuzz's upcoming matches page."""
    try:
        response = requests.get(
            CRICBUZZ_UPCOMING_URL,
            headers={"User-Agent": "Mozilla/5.0"},
            timeout=REQUEST_TIMEOUT,
        )
        response.raise_for_status()
    except requests.RequestException as exc:
        logger.warning("Cricbuzz upcoming fixtures request failed: %s", exc)
        return []

    fixtures: List[Dict[str, Any]] = []
    for obj in _extract_json_ld_objects(response.text):
        main_entity = obj.get("mainEntity", {})
        if not isinstance(main_entity, dict):
            continue

        for item in main_entity.get("itemListElement", []):
            if not isinstance(item, dict) or item.get("@type") != "SportsEvent":
                continue
            fixture = _sports_event_to_fixture(item, now=now)
            if fixture is not None:
                fixtures.append(fixture)

    logger.info("Cricbuzz upcoming page: found %s future fixtures", len(fixtures))
    return fixtures
