"""Fetch squad / playing XI data from ESPN, Cricbuzz, and CricAPI."""

import argparse
import json
import os
import re
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

import requests
from dotenv import load_dotenv

from utils.db import get_client
from utils.espn import _normalize_team, get_match_summary

load_dotenv()

BASE_URL = "https://api.cricapi.com/v1"
CRICBUZZ_UPCOMING_URL = "https://www.cricbuzz.com/cricket-match/live-scores/upcoming-matches"
CRICBUZZ_SQUADS_URL = "https://www.cricbuzz.com/cricket-match-squads/{match_id}/{slug}"
CRICBUZZ_USER_AGENT = "Mozilla/5.0"
PLACEHOLDER_IMAGE_TOKENS = (
    "default-player-logo",
    "generic-headshot",
    "player-placeholder",
    "cricketdata",
    "/logo.",
)


def _get_api_key() -> str:
    return os.environ.get("CRICAPI_KEY", "")


def _is_placeholder_image_url(url: str) -> bool:
    if not url:
        return True
    lowered = url.lower().strip()
    return any(token in lowered for token in PLACEHOLDER_IMAGE_TOKENS)


def _is_confirmed_lineup(players: list[dict], _source: str) -> bool:
    """Treat a roster as confirmed only when it looks like a playing XI."""
    return len(players) == 11


@dataclass(frozen=True)
class MatchSquadFetchResult:
    match_id: str
    status: str
    stored_team_count: int = 0
    error: str = ""


def _match_teams(team1: str, team2: str, candidate1: str, candidate2: str) -> bool:
    return {
        _normalize_team(team1),
        _normalize_team(team2),
    } == {
        _normalize_team(candidate1),
        _normalize_team(candidate2),
    }


def _extract_cricbuzz_match_links(page_html: str) -> list[dict]:
    links: list[dict] = []
    seen: set[str] = set()
    for anchor in re.finditer(r"<a\b(?P<attrs>[^>]*)>", page_html, re.IGNORECASE):
        attrs = anchor.group("attrs")
        href_match = re.search(
            r'href="/live-cricket-scores/(?P<match_id>\d+)/(?P<slug>[^"]+)"',
            attrs,
            re.IGNORECASE,
        )
        title_match = re.search(r'title="(?P<title>[^"]+)"', attrs, re.IGNORECASE)
        if not href_match or not title_match:
            continue
        title = title_match.group("title").strip()
        matchup = title.split(" - ", 1)[0].split(",", 1)[0].strip()
        if " vs " not in matchup:
            continue
        team1, team2 = [part.strip() for part in matchup.split(" vs ", 1)]
        match_id = href_match.group("match_id")
        if match_id in seen:
            continue
        seen.add(match_id)
        links.append({
            "match_id": match_id,
            "slug": href_match.group("slug"),
            "team1": team1,
            "team2": team2,
            "title": title,
        })
    return links


def _find_cricbuzz_match_link(team1: str, team2: str) -> Optional[dict]:
    try:
        response = requests.get(
            CRICBUZZ_UPCOMING_URL,
            headers={"User-Agent": CRICBUZZ_USER_AGENT},
            timeout=30,
        )
        response.raise_for_status()
    except requests.RequestException as exc:
        print(f"  ⚠️  Cricbuzz upcoming fetch failed: {exc}")
        return None

    candidates = [
        link for link in _extract_cricbuzz_match_links(response.text)
        if _match_teams(team1, team2, link["team1"], link["team2"])
    ]
    return candidates[0] if candidates else None


def _cricbuzz_image_url(image_id: Optional[int]) -> str:
    if not image_id:
        return ""
    return f"https://static.cricbuzz.com/a/img/v1/48x48/i1/c{image_id}/i.jpg"


def _normalize_cricbuzz_player(player: dict) -> dict:
    image_details = player.get("imageDetails") or {}
    return {
        "id": str(player.get("id", "")),
        "name": player.get("fullName") or player.get("name", ""),
        "role": _classify_role({
            "role": player.get("role", ""),
            "isKeeper": player.get("keeper", False),
            "battingStyle": player.get("battingStyle", ""),
            "bowlingStyle": player.get("bowlingStyle", ""),
        }),
        "batting_style": player.get("battingStyle", ""),
        "bowling_style": player.get("bowlingStyle", ""),
        "is_captain": player.get("captain", False),
        "is_keeper": player.get("keeper", False),
        "image_url": _cricbuzz_image_url(image_details.get("imageId")),
    }


def _extract_cricbuzz_team_objects(page_html: str) -> list[dict]:
    normalized_page = page_html.replace('\\"', '"')
    decoder = json.JSONDecoder()
    team_objects: list[dict] = []
    seen_teams: set[str] = set()

    legacy_pattern = re.compile(
        r'"teamId":(?P<team_id>\d+),"teamName":"(?P<team>[^"]+)","teamSName":"[^"]+",'
        r'(?:\"imageDetails\":\{.*?\},)?'
        r'"profileUrl":"[^"]+"\},"players":\{"Squad":(?P<squad>\[.*?\])'
        r'(?:,"Playing XI":(?P<xi>\[.*?\]))?\}',
        re.S,
    )
    for match in legacy_pattern.finditer(normalized_page):
        team_name = match.group("team")
        if team_name in seen_teams:
            continue
        try:
            squad = json.loads(match.group("squad"))
            playing_xi = json.loads(match.group("xi")) if match.group("xi") else []
        except json.JSONDecodeError:
            continue
        seen_teams.add(team_name)
        team_objects.append({
            "teamId": int(match.group("team_id")),
            "teamName": team_name,
            "players": {
                "Squad": squad,
                "Playing XI": playing_xi,
            },
        })

    def _decode_object(start: int) -> Optional[dict]:
        try:
            parsed, _ = decoder.raw_decode(normalized_page[start:])
        except json.JSONDecodeError:
            return None
        return parsed if isinstance(parsed, dict) else None

    def _coerce_team_object(candidate: dict) -> Optional[dict]:
        if not isinstance(candidate, dict):
            return None
        team_info = candidate.get("team") if isinstance(candidate.get("team"), dict) else candidate
        players_block = candidate.get("players")
        if not isinstance(players_block, dict):
            return None
        team_name = team_info.get("teamName") or team_info.get("displayName") or ""
        if not team_name:
            return None
        team_id = team_info.get("teamId") or team_info.get("id") or ""
        return {
            "teamId": int(team_id) if str(team_id).isdigit() else team_id,
            "teamName": team_name,
            "players": {
                "Squad": players_block.get("Squad") or [],
                "Playing XI": players_block.get("Playing XI") or [],
            },
        }

    start_patterns = (
        re.compile(r'(?P<start>\{"teamId":\d+,"teamName":"[^"]+","teamSName":"[^"]+")'),
        re.compile(r'"team[12]":(?P<start>\{"team":\{"teamId":\d+,"teamName":"[^"]+")'),
    )
    for pattern in start_patterns:
        for match in pattern.finditer(normalized_page):
            team_object = _coerce_team_object(_decode_object(match.start("start")) or {})
            if not team_object:
                continue
            team_name = team_object["teamName"]
            if team_name in seen_teams:
                continue
            seen_teams.add(team_name)
            team_objects.append(team_object)
    return team_objects


def fetch_squad_from_cricbuzz(team1: str, team2: str) -> Optional[list[dict]]:
    link = _find_cricbuzz_match_link(team1, team2)
    if not link:
        return None

    try:
        response = requests.get(
            CRICBUZZ_SQUADS_URL.format(match_id=link["match_id"], slug=link["slug"]),
            headers={"User-Agent": CRICBUZZ_USER_AGENT},
            timeout=30,
        )
        response.raise_for_status()
    except requests.RequestException as exc:
        print(f"  ⚠️  Cricbuzz squads fetch failed: {exc}")
        return None

    team_objects = _extract_cricbuzz_team_objects(response.text)
    if not team_objects:
        return None

    squads: list[dict] = []
    for team_object in team_objects:
        players_block = team_object.get("players") or {}
        raw_players = players_block.get("Playing XI") or players_block.get("Squad") or []
        if not raw_players:
            continue
        players = [_normalize_cricbuzz_player(player) for player in raw_players]
        is_confirmed = "Playing XI" in players_block and len(raw_players) == 11
        squads.append({
            "teamName": team_object.get("teamName", ""),
            "players": players,
            "is_confirmed": is_confirmed,
        })

    return squads if squads else None


def fetch_squad_from_espn(match_id: str) -> Optional[list[dict]]:
    """
    Fetch squad/playing XI from ESPN summary for a match.

    Requires an ESPN event ID to be stored in espn_match_data table.
    ESPN can surface either a broader squad or the eventual playing XI.

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


def fetch_squad_for_match(match_id: str, raise_on_error: bool = False) -> Optional[list[dict]]:
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
        if raise_on_error:
            raise
        return None


def normalize_player(player: dict) -> dict:
    """Normalize player data from CricAPI format."""
    raw_image_url = player.get("playerImg", "")
    return {
        "id": player.get("id", ""),
        "name": player.get("name", player.get("playerName", "")),
        "role": _classify_role(player),
        "batting_style": player.get("battingStyle", ""),
        "bowling_style": player.get("bowlingStyle", ""),
        "is_captain": player.get("isCaptain", False),
        "is_keeper": player.get("isKeeper", False),
        # Treat generic provider logos/placeholders as missing so headshot enrichment can resolve.
        "image_url": "" if _is_placeholder_image_url(raw_image_url) else raw_image_url,
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
                is_confirmed: bool = False, source: str = "cricapi_fantasy") -> bool:
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
        return True
    except Exception as e:
        print(f"  ❌ Failed to store squad for {team_name}: {e}")
        return False


def fetch_and_store_squads(
    match_ids: Optional[list[str]] = None,
    force: bool = False,
) -> list[MatchSquadFetchResult]:
    """
    Fetch squads for upcoming matches and store in Supabase.

    Args:
        match_ids: Specific match IDs to fetch (default: all upcoming)
        force: Re-fetch even if squad already exists
    """
    client = get_client()
    results: list[MatchSquadFetchResult] = []

    if match_ids:
        matches = []
        for mid in match_ids:
            resp = client.table("matches").select("*").eq("match_id", mid).execute()
            if resp.data:
                matches.extend(resp.data)
    else:
        response = (
            client.table("matches")
            .select("*")
            .in_("status", ["upcoming", "live"])
            .order("date", desc=False)
            .execute()
        )
        matches = response.data or []

    if not matches:
        print("No upcoming matches found.")
        return results

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
                results.append(MatchSquadFetchResult(match_id=match_id, status="skipped"))
                continue

        # Try ESPN first (free, unlimited)
        squad_data = fetch_squad_from_espn(match_id)
        source = "espn"

        # Fall back to Cricbuzz's public squads page when ESPN has the fixture
        # but future-match rosters are still blank in the summary response.
        if not squad_data:
            squad_data = fetch_squad_from_cricbuzz(team1, team2)
            source = "cricbuzz"

        # Fall back to CricAPI only if key is set and match is not ESPN-sourced
        api_key = _get_api_key()
        if not squad_data and api_key and not match_id.startswith("espn-"):
            try:
                squad_data = fetch_squad_for_match(match_id, raise_on_error=True)
            except Exception as exc:
                print(f"  ❌ CricAPI squad fetch failed: {exc}")
                results.append(MatchSquadFetchResult(match_id=match_id, status="error", error=str(exc)))
                continue
            source = "cricapi_fantasy"

        if not squad_data:
            print("  ⏳ Squad not available yet")
            results.append(MatchSquadFetchResult(match_id=match_id, status="unavailable"))
            continue

        stored_team_count = 0
        store_failed = False
        for team_squad in squad_data:
            team_name = team_squad.get("teamName", "")
            raw_players = team_squad.get("players", [])

            if not raw_players:
                print(f"  ⚠️  No players listed for {team_name}")
                continue

            # ESPN and Cricbuzz players are already normalized
            if source in {"espn", "cricbuzz"}:
                players = raw_players
            else:
                players = [normalize_player(p) for p in raw_players]

            is_confirmed = bool(team_squad.get("is_confirmed")) or _is_confirmed_lineup(players, source)

            stored = store_squad(match_id, team_name, players, is_confirmed=is_confirmed, source=source)
            if not stored:
                store_failed = True
                continue
            print(f"  ✅ {team_name}: {len(players)} players {'(confirmed XI)' if is_confirmed else '(squad)'} [{source}]")
            success_count += 1
            stored_team_count += 1

        # Rate limit: only needed for CricAPI calls
        if source == "cricapi_fantasy":
            time.sleep(1)

        if store_failed and stored_team_count == 0:
            results.append(MatchSquadFetchResult(match_id=match_id, status="error", error="Failed to store fetched squad data"))
        elif stored_team_count > 0:
            results.append(MatchSquadFetchResult(match_id=match_id, status="stored", stored_team_count=stored_team_count))
        else:
            results.append(MatchSquadFetchResult(match_id=match_id, status="unavailable"))

    print(f"\n✅ Done! Stored {success_count} team squads, skipped {skip_count}")
    return results


def main():
    parser = argparse.ArgumentParser(description="Fetch squad data from CricAPI")
    parser.add_argument("--match-id", type=str, help="Fetch squad for specific match ID")
    parser.add_argument("--force", action="store_true", help="Re-fetch even if squad exists")
    args = parser.parse_args()

    match_ids = [args.match_id] if args.match_id else None
    fetch_and_store_squads(match_ids=match_ids, force=args.force)


if __name__ == "__main__":
    main()
