"""Fetch sportsbook odds from The Odds API and store in Supabase."""

import argparse
import logging
import os
from datetime import datetime, timezone
from typing import Optional

import requests

from utils.db import get_client

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

ODDS_API_BASE = "https://api.the-odds-api.com/v4"
ODDS_API_KEY = os.environ.get("ODDS_API_KEY", "")

# Cricket sport keys on The Odds API
CRICKET_SPORTS = [
    "cricket_ipl",
    "cricket_big_bash",
    "cricket_the_hundred",
    "cricket_odi",
    "cricket_t20_intl",
    "cricket_test_match",
    "cricket_psl",
]

REGIONS = "uk,au"  # Best cricket bookmaker coverage
MARKETS = "h2h"  # Match winner odds


def get_available_cricket_sports() -> list[str]:
    """Return cricket sport keys that are currently in-season."""
    resp = requests.get(
        f"{ODDS_API_BASE}/sports/",
        params={"apiKey": ODDS_API_KEY},
        timeout=15,
    )
    resp.raise_for_status()
    all_sports = resp.json()
    active = [s["key"] for s in all_sports if s["key"] in CRICKET_SPORTS and s.get("active")]
    logger.info(f"Active cricket sports: {active}")
    return active


def fetch_odds_for_sport(sport_key: str) -> list[dict]:
    """Fetch h2h odds for a cricket sport."""
    resp = requests.get(
        f"{ODDS_API_BASE}/sports/{sport_key}/odds/",
        params={
            "apiKey": ODDS_API_KEY,
            "regions": REGIONS,
            "markets": MARKETS,
            "oddsFormat": "decimal",
            "dateFormat": "iso",
        },
        timeout=15,
    )
    resp.raise_for_status()

    remaining = resp.headers.get("x-requests-remaining", "?")
    logger.info(f"  {sport_key}: {len(resp.json())} events | API quota remaining: {remaining}")
    return resp.json()


def parse_odds_events(events: list[dict]) -> list[dict]:
    """Parse odds API events into rows for our match_odds table."""
    rows = []
    for event in events:
        event_id = event.get("id")
        home_team = event.get("home_team", "")
        away_team = event.get("away_team", "")
        commence_time = event.get("commence_time", "")
        sport_key = event.get("sport_key", "")

        for bookmaker in event.get("bookmakers", []):
            bk_name = bookmaker.get("title", bookmaker.get("key", "unknown"))
            for market in bookmaker.get("markets", []):
                if market.get("key") != "h2h":
                    continue
                outcomes = {o["name"]: o["price"] for o in market.get("outcomes", [])}
                if not outcomes:
                    continue

                # Map outcomes to team1/team2
                team1_odds = outcomes.get(home_team)
                team2_odds = outcomes.get(away_team)
                draw_odds = outcomes.get("Draw")

                if team1_odds is None and team2_odds is None:
                    continue

                rows.append({
                    "odds_api_event_id": event_id,
                    "sport_key": sport_key,
                    "team1": home_team,
                    "team2": away_team,
                    "bookmaker": bk_name,
                    "team1_odds": team1_odds,
                    "team2_odds": team2_odds,
                    "draw_odds": draw_odds,
                    "market": "h2h",
                    "commence_time": commence_time,
                    "fetched_at": datetime.now(timezone.utc).isoformat(),
                })

    return rows


def match_odds_to_matches(odds_rows: list[dict]) -> list[dict]:
    """Try to link odds to our matches table by team names and date."""
    client = get_client()
    matches = client.table("matches").select("match_id, team1, team2, date").eq("status", "upcoming").execute().data or []

    def normalize(name: str) -> str:
        return name.lower().strip().replace(" women", "").replace(" men", "")

    # Build lookup by normalized team pair
    match_lookup: dict[tuple, dict] = {}
    for m in matches:
        key = tuple(sorted([normalize(m["team1"]), normalize(m["team2"])]))
        match_lookup[key] = m

    linked = []
    for row in odds_rows:
        key = tuple(sorted([normalize(row["team1"]), normalize(row["team2"])]))
        match = match_lookup.get(key)
        if match:
            linked.append({
                "match_id": match["match_id"],
                "bookmaker": row["bookmaker"],
                "team1_odds": row["team1_odds"],
                "team2_odds": row["team2_odds"],
                "draw_odds": row["draw_odds"],
                "market": row["market"],
                "fetched_at": row["fetched_at"],
            })

    return linked


def store_odds(odds_rows: list[dict]) -> int:
    """Store odds in Supabase match_odds table."""
    if not odds_rows:
        return 0
    client = get_client()
    # Deduplicate by (match_id, bookmaker) — keep last entry
    seen = {}
    for row in odds_rows:
        key = (row["match_id"], row["bookmaker"])
        seen[key] = row
    deduped = list(seen.values())
    # Upsert by match_id + bookmaker
    client.table("match_odds").upsert(
        deduped,
        on_conflict="match_id,bookmaker",
    ).execute()
    return len(deduped)


def main(sport: Optional[str] = None) -> int:
    if not ODDS_API_KEY:
        logger.error("ODDS_API_KEY environment variable not set")
        return 1

    # Get active cricket sports
    if sport:
        sports = [sport]
    else:
        sports = get_available_cricket_sports()

    if not sports:
        logger.info("No active cricket sports found on The Odds API")
        return 0

    # Fetch odds for each sport
    all_odds_rows: list[dict] = []
    for sport_key in sports:
        try:
            events = fetch_odds_for_sport(sport_key)
            rows = parse_odds_events(events)
            all_odds_rows.extend(rows)
        except requests.RequestException as e:
            logger.error(f"Failed to fetch {sport_key}: {e}")

    logger.info(f"Total odds rows fetched: {len(all_odds_rows)} from {len(sports)} sports")

    # Link to our matches
    linked = match_odds_to_matches(all_odds_rows)
    logger.info(f"Matched {len(linked)} odds rows to {len(set(r['match_id'] for r in linked))} of our matches")

    # Store
    stored = store_odds(linked)
    logger.info(f"Stored {stored} odds rows in Supabase")

    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Fetch sportsbook odds from The Odds API")
    parser.add_argument("--sport", help="Specific sport key to fetch (e.g. cricket_odi)")
    args = parser.parse_args()
    exit(main(sport=args.sport))
