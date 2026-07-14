"""Fetch player statistics from CricAPI for players in upcoming match squads."""

import argparse
import os
import sys
import time
from datetime import datetime, timezone
from typing import Optional

import requests
from dotenv import load_dotenv

from utils.db import get_client

load_dotenv()

BASE_URL = "https://api.cricapi.com/v1"


def _get_api_key() -> str:
    return os.environ["CRICAPI_KEY"]


def search_player(name: str) -> Optional[dict]:
    """
    Search for a player by name using CricAPI.

    Returns: {id, name, country} or None
    """
    try:
        response = requests.get(
            f"{BASE_URL}/players",
            params={"apikey": _get_api_key(), "search": name, "offset": 0},
            timeout=30,
        )
        response.raise_for_status()
        data = response.json()

        if data.get("status") != "success":
            return None

        players = data.get("data", [])
        if not players:
            return None

        # Try exact match first
        for p in players:
            if p.get("name", "").lower() == name.lower():
                return p

        # Fall back to first result
        return players[0]

    except requests.RequestException:
        return None


def fetch_player_stats(player_id: str) -> Optional[dict]:
    """
    Fetch detailed stats for a player from CricAPI.

    Returns raw stats dict or None.
    """
    try:
        response = requests.get(
            f"{BASE_URL}/players_info",
            params={"apikey": _get_api_key(), "id": player_id},
            timeout=30,
        )
        response.raise_for_status()
        data = response.json()

        if data.get("status") != "success":
            return None

        return data.get("data", {})

    except requests.RequestException:
        return None


def parse_batting_stats(stats_data: dict, format_key: str) -> dict:
    """Extract batting stats for a specific format (t20i, odi, test)."""
    stats = stats_data.get("stats", [])

    # CricAPI returns individual stat entries: {fn, matchtype, stat, value}
    batting = {}
    for entry in stats:
        if entry.get("fn") != "batting":
            continue
        mt = entry.get("matchtype", "").lower()
        if mt != format_key.lower():
            continue
        stat_name = entry.get("stat", "")
        value = entry.get("value", "0")

        if stat_name == "m":
            batting["matches"] = _safe_int(value)
        elif stat_name == "inn":
            batting["innings"] = _safe_int(value)
        elif stat_name == "runs":
            batting["runs"] = _safe_int(value)
        elif stat_name == "avg":
            batting["average"] = _safe_float(value)
        elif stat_name == "sr":
            batting["strike_rate"] = _safe_float(value)
        elif stat_name == "hs":
            batting["highest"] = value
        elif stat_name == "50s":
            batting["fifties"] = _safe_int(value)
        elif stat_name == "100s":
            batting["hundreds"] = _safe_int(value)
        elif stat_name == "4s":
            batting["fours"] = _safe_int(value)
        elif stat_name == "6s":
            batting["sixes"] = _safe_int(value)

    return batting


def parse_bowling_stats(stats_data: dict, format_key: str) -> dict:
    """Extract bowling stats for a specific format."""
    stats = stats_data.get("stats", [])

    bowling = {}
    for entry in stats:
        if entry.get("fn") != "bowling":
            continue
        mt = entry.get("matchtype", "").lower()
        if mt != format_key.lower():
            continue
        stat_name = entry.get("stat", "")
        value = entry.get("value", "0")

        if stat_name == "m":
            bowling["matches"] = _safe_int(value)
        elif stat_name == "inn":
            bowling["innings"] = _safe_int(value)
        elif stat_name == "wkts":
            bowling["wickets"] = _safe_int(value)
        elif stat_name == "avg":
            bowling["average"] = _safe_float(value)
        elif stat_name == "econ":
            bowling["economy"] = _safe_float(value)
        elif stat_name == "sr":
            bowling["strike_rate"] = _safe_float(value)
        elif stat_name == "bbf":
            bowling["best_bowling"] = value
        elif stat_name == "5w":
            bowling["five_wickets"] = _safe_int(value)

    return bowling


def _safe_int(value) -> int:
    """Safely convert to int."""
    try:
        return int(str(value).replace(",", "").replace("-", "0").split(".")[0])
    except (ValueError, TypeError):
        return 0


def _safe_float(value) -> float:
    """Safely convert to float."""
    try:
        return float(str(value).replace(",", "").replace("-", "0"))
    except (ValueError, TypeError):
        return 0.0


def determine_format(match_type: str) -> str:
    """Map our match_type to CricAPI stat matchtype key."""
    mt = match_type.lower()
    if "t20" in mt:
        return "t20i"
    if "odi" in mt:
        return "odi"
    if "test" in mt:
        return "test"
    # Domestic T20 leagues
    if any(league in mt for league in ["ipl", "bbl", "psl", "hundred", "cpl"]):
        return "t20i"  # CricAPI uses t20i for all T20 stats
    return "t20i"


def store_player_stats(player_data: dict) -> None:
    """Store player stats in Supabase player_stats table."""
    client = get_client()

    try:
        client.table("player_stats").upsert(
            player_data, on_conflict="player_name,team,format"
        ).execute()
    except Exception as e:
        print(f"  ❌ Failed to store stats: {e}")


def process_player(player: dict, team: str, format_key: str) -> Optional[dict]:
    """
    Fetch and process stats for a single player.

    Args:
        player: Player dict from match_squads (has id, name, role)
        team: Team name
        format_key: Cricket format (t20i, odi, test)

    Returns:
        Processed player stats dict or None
    """
    player_id = player.get("id", "")
    player_name = player.get("name", "")

    if not player_id:
        # Try to find player by name
        found = search_player(player_name)
        if not found:
            print(f"    ⚠️  Could not find player: {player_name}")
            return None
        player_id = found.get("id", "")

    stats_data = fetch_player_stats(player_id)
    if not stats_data:
        print(f"    ⚠️  No stats available for {player_name}")
        return None

    batting = parse_batting_stats(stats_data, format_key)
    bowling = parse_bowling_stats(stats_data, format_key)

    return {
        "player_name": player_name,
        "player_id": player_id,
        "team": team,
        "format": format_key,
        "role": player.get("role", "Batter"),
        "batting_avg": batting.get("average", 0),
        "batting_sr": batting.get("strike_rate", 0),
        "batting_innings": batting.get("innings", 0),
        "batting_runs": batting.get("runs", 0),
        "batting_highest": batting.get("highest", "0"),
        "batting_fifties": batting.get("fifties", 0),
        "batting_hundreds": batting.get("hundreds", 0),
        "bowling_avg": bowling.get("average", 0),
        "bowling_economy": bowling.get("economy", 0),
        "bowling_wickets": bowling.get("wickets", 0),
        "bowling_innings": bowling.get("innings", 0),
        "bowling_best": bowling.get("best_bowling", ""),
        "bowling_five_wickets": bowling.get("five_wickets", 0),
        "matches_played": max(batting.get("matches", 0), bowling.get("matches", 0)),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }


def fetch_stats_for_match_squads(match_id: Optional[str] = None, force: bool = False, limit: int = 0) -> None:
    """
    Fetch player stats for all players in upcoming match squads.

    Args:
        match_id: Specific match to process (default: all with squads)
        force: Re-fetch even if stats already exist
        limit: Max number of players to fetch (0 = no limit)
    """
    client = get_client()

    # Get squads
    query = client.table("match_squads").select("*")
    if match_id:
        query = query.eq("match_id", match_id)

    squad_resp = query.execute()
    squads = squad_resp.data if squad_resp.data else []

    if not squads:
        print("No squads found. Run fetch_squads.py first.")
        return

    # Get match types for format detection
    match_ids_list = list(set(s["match_id"] for s in squads))
    matches_resp = client.table("matches").select("match_id, match_type").in_("match_id", match_ids_list).execute()
    match_type_map = {m["match_id"]: m.get("match_type", "t20") for m in (matches_resp.data or [])}

    print(f"🏏 Processing player stats for {len(squads)} team squads...\n")
    total_fetched = 0
    total_skipped = 0

    for squad in squads:
        team_name = squad.get("team", "")
        players = squad.get("players", [])
        match_type = match_type_map.get(squad["match_id"], "t20")
        format_key = determine_format(match_type)

        print(f"📋 {team_name} ({format_key}) — {len(players)} players")

        for player in players:
            player_name = player.get("name", "")
            if not player_name:
                continue

            # Check if we already have recent stats (skip if updated in last 24h)
            if not force:
                existing = (
                    client.table("player_stats")
                    .select("updated_at")
                    .eq("player_name", player_name)
                    .eq("format", format_key)
                    .execute()
                )
                if existing.data:
                    last_updated = existing.data[0].get("updated_at", "")
                    if last_updated:
                        try:
                            updated_dt = datetime.fromisoformat(last_updated.replace("Z", "+00:00"))
                            age_hours = (datetime.now(timezone.utc) - updated_dt).total_seconds() / 3600
                            if age_hours < 24:
                                total_skipped += 1
                                continue
                        except (ValueError, TypeError):
                            pass

            print(f"  🔍 {player_name}...", end=" ", flush=True)
            stats = process_player(player, team_name, format_key)

            if stats:
                store_player_stats(stats)
                print(f"✅ (avg:{stats['batting_avg']}, sr:{stats['batting_sr']}, wkts:{stats['bowling_wickets']})")
                total_fetched += 1
            elif stats is None:
                print("⏭️ skipped")
                # Check if we're rate-limited (API returns failure)
                if total_fetched == 0 and total_skipped == 0:
                    # Might be blocked, wait longer
                    print("  ⚠️  Possible rate limit. Waiting 60s...")
                    time.sleep(60)

            # Rate limit: 3s between requests to stay safe on free tier
            time.sleep(3)

            # Optional limit to avoid burning all credits
            if limit and total_fetched >= limit:
                print(f"\n⏸️  Reached limit of {limit} players. Stopping.")
                break

    print(f"\n✅ Done! Fetched {total_fetched} player stats, skipped {total_skipped} (recent)")


def main():
    parser = argparse.ArgumentParser(description="Fetch player stats from CricAPI")
    parser.add_argument("--match-id", type=str, help="Fetch stats for players in specific match")
    parser.add_argument("--force", action="store_true", help="Re-fetch all stats regardless of age")
    parser.add_argument("--player", type=str, help="Fetch stats for a specific player by name")
    parser.add_argument("--limit", type=int, default=0, help="Max players to fetch (0=all, default=0)")
    args = parser.parse_args()

    if args.player:
        # Quick single-player lookup
        print(f"🔍 Looking up: {args.player}")
        found = search_player(args.player)
        if found:
            print(f"  Found: {found.get('name')} (ID: {found.get('id')}, {found.get('country', 'N/A')})")
            stats = fetch_player_stats(found["id"])
            if stats:
                for format_key in ["t20i", "odi", "test"]:
                    batting = parse_batting_stats(stats, format_key)
                    bowling = parse_bowling_stats(stats, format_key)
                    if batting.get("matches", 0) > 0 or bowling.get("matches", 0) > 0:
                        print(f"\n  📊 {format_key.upper()}:")
                        if batting.get("matches", 0) > 0:
                            print(f"    Batting: {batting['runs']} runs, avg {batting['average']}, SR {batting['strike_rate']}")
                        if bowling.get("matches", 0) > 0:
                            print(f"    Bowling: {bowling['wickets']} wkts, econ {bowling['economy']}, avg {bowling['average']}")
        else:
            print("  ❌ Player not found")
        return

    fetch_stats_for_match_squads(match_id=args.match_id, force=args.force, limit=args.limit)


if __name__ == "__main__":
    main()
