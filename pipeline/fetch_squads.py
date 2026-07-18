"""Fetch squad / playing XI data from ESPN (primary) and CricAPI (fallback)."""

import argparse
import os
import sys
import time
from datetime import datetime, timezone
from typing import Optional

import requests
from dotenv import load_dotenv

from utils.db import get_client, get_upcoming_matches
from utils.espn import get_match_summary

load_dotenv()

BASE_URL = "https://api.cricapi.com/v1"


def _get_api_key() -> str:
    return os.environ.get("CRICAPI_KEY", "")


def fetch_squad_from_espn(match_id: str) -> Optional[list[dict]]:
    """
    Fetch squad/playing XI from ESPN summary for a match.

    Requires an ESPN event ID to be stored in espn_match_data table.
    ESPN only has rosters after match starts (confirmed playing XI).

    Returns list of team dicts: [{teamName, players: [...]}] or None.
    """
    client = get_client()
    espn_resp = (
        client.table("espn_match_data")
        .select("espn_event_id")
        .eq("match_id", match_id)
        .execute()
    )
    if not espn_resp.data:
        return None

    espn_eid = str(espn_resp.data[0]["espn_event_id"])
    summary = get_match_summary(espn_eid)
    if not summary:
        return None

    rosters = summary.get("rosters", [])
    if not rosters:
        return None

    # Check if any roster actually has players (ESPN is empty for future matches)
    if all(len(r.get("players", [])) == 0 for r in rosters):
        return None

    result = []
    for roster in rosters:
        players = []
        for p in roster.get("players", []):
            pos = p.get("position", "")
            players.append({
                "id": p.get("espn_id", ""),
                "name": p.get("name", ""),
                "role": _classify_espn_position(pos),
                "batting_style": "",
                "bowling_style": "",
                "is_captain": False,
                "is_keeper": pos.lower() == "wicketkeeper" if pos else False,
                "image_url": p.get("headshot_url", ""),
            })
        result.append({
            "teamName": roster.get("team_name", ""),
            "players": players,
        })

    return result if any(r["players"] for r in result) else None


def _classify_espn_position(position: str) -> str:
    """Map ESPN position names to our role categories."""
    pos = position.lower() if position else ""
    if "keeper" in pos or "wicketkeeper" in pos:
        return "WK-Batter"
    if "allrounder" in pos or "all-rounder" in pos:
        return "All-Rounder"
    if "bowler" in pos:
        return "Bowler"
    if "batter" in pos or "batsman" in pos or "batsmen" in pos:
        return "Batter"
    return "Batter"  # default


def fetch_squad_for_match(match_id: str) -> Optional[list[dict]]:
    """
    Fetch squad/playing XI for a match from CricAPI.

    Returns list of team dicts: [{teamName, players: [{id, name, role, ...}]}]
    or None if not available yet.
    """
    api_key = _get_api_key()
    if not api_key:
        return None

    try:
        response = requests.get(
            f"{BASE_URL}/match_squad",
            params={"apikey": api_key, "id": match_id},
            timeout=30,
        )
        response.raise_for_status()
        data = response.json()

        if data.get("status") != "success":
            print(f"  ⚠️  API returned status: {data.get('status')}")
            return None

        squads = data.get("data", [])
        if not squads:
            return None

        return squads

    except requests.RequestException as e:
        print(f"  ❌ Request failed: {e}")
        return None


def normalize_player(player: dict) -> dict:
    """Normalize player data from CricAPI format."""
    return {
        "id": player.get("id", ""),
        "name": player.get("name", player.get("playerName", "")),
        "role": _classify_role(player),
        "batting_style": player.get("battingStyle", ""),
        "bowling_style": player.get("bowlingStyle", ""),
        "is_captain": player.get("isCaptain", False),
        "is_keeper": player.get("isKeeper", False),
        "image_url": player.get("playerImg", ""),
    }


def _classify_role(player: dict) -> str:
    """Classify player role from available data."""
    role = player.get("role", "").lower()
    if "keeper" in role or player.get("isKeeper"):
        return "WK-Batter"
    if "all" in role:
        return "All-Rounder"
    if "bowl" in role:
        return "Bowler"
    if "bat" in role:
        return "Batter"
    # Infer from styles
    if player.get("bowlingStyle") and player.get("battingStyle"):
        return "All-Rounder"
    if player.get("bowlingStyle"):
        return "Bowler"
    return "Batter"


def store_squad(match_id: str, team_name: str, players: list[dict],
                is_confirmed: bool = False, source: str = "cricapi_fantasy") -> None:
    """Store squad in Supabase match_squads table."""
    client = get_client()
    squad_data = {
        "match_id": match_id,
        "team": team_name,
        "players": players,
        "is_confirmed": is_confirmed,
        "source": source,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }

    try:
        client.table("match_squads").upsert(
            squad_data, on_conflict="match_id,team"
        ).execute()
    except Exception as e:
        print(f"  ❌ Failed to store squad for {team_name}: {e}")


def fetch_and_store_squads(match_ids: Optional[list[str]] = None, force: bool = False) -> None:
    """
    Fetch squads for upcoming matches and store in Supabase.

    Args:
        match_ids: Specific match IDs to fetch (default: all upcoming)
        force: Re-fetch even if squad already exists
    """
    client = get_client()

    if match_ids:
        matches = []
        for mid in match_ids:
            resp = client.table("matches").select("*").eq("match_id", mid).execute()
            if resp.data:
                matches.extend(resp.data)
    else:
        matches = get_upcoming_matches()

    if not matches:
        print("No upcoming matches found.")
        return

    print(f"🏏 Fetching squads for {len(matches)} matches...\n")
    success_count = 0
    skip_count = 0

    for match in matches:
        match_id = match["match_id"]
        team1 = match.get("team1", "Unknown")
        team2 = match.get("team2", "Unknown")
        print(f"📋 {team1} vs {team2} ({match_id[:8]}...)")

        # Check if we already have squads (skip unless --force)
        if not force:
            existing = (
                client.table("match_squads")
                .select("id, is_confirmed")
                .eq("match_id", match_id)
                .execute()
            )
            if existing.data and any(s.get("is_confirmed") for s in existing.data):
                print("  ✅ Confirmed squad already exists, skipping")
                skip_count += 1
                continue

        # Try ESPN first (free, unlimited)
        squad_data = fetch_squad_from_espn(match_id)
        source = "espn"

        # Fall back to CricAPI
        if not squad_data:
            squad_data = fetch_squad_for_match(match_id)
            source = "cricapi_fantasy"

        if not squad_data:
            print("  ⏳ Squad not available yet")
            continue

        for team_squad in squad_data:
            team_name = team_squad.get("teamName", "")
            raw_players = team_squad.get("players", [])

            if not raw_players:
                print(f"  ⚠️  No players listed for {team_name}")
                continue

            # ESPN players are already normalized
            if source == "espn":
                players = raw_players
            else:
                players = [normalize_player(p) for p in raw_players]

            # CricAPI fantasySquad usually returns full squad (15-18 players)
            # ESPN always returns confirmed XI (11 players)
            is_confirmed = len(players) == 11 or source == "espn"

            store_squad(match_id, team_name, players, is_confirmed=is_confirmed, source=source)
            print(f"  ✅ {team_name}: {len(players)} players {'(confirmed XI)' if is_confirmed else '(squad)'} [{source}]")
            success_count += 1

        # Rate limit: only needed for CricAPI calls
        if source == "cricapi_fantasy":
            time.sleep(1)

    print(f"\n✅ Done! Stored {success_count} team squads, skipped {skip_count}")


def main():
    parser = argparse.ArgumentParser(description="Fetch squad data from CricAPI")
    parser.add_argument("--match-id", type=str, help="Fetch squad for specific match ID")
    parser.add_argument("--force", action="store_true", help="Re-fetch even if squad exists")
    args = parser.parse_args()

    match_ids = [args.match_id] if args.match_id else None
    fetch_and_store_squads(match_ids=match_ids, force=args.force)


if __name__ == "__main__":
    main()
