"""ESPN Cricinfo API helpers.

Uses the public ESPN web API (site.web.api.espn.com) which requires no
authentication.  Two main capabilities:

1. **Series search** – find ESPN league/series IDs by team names.
2. **Match summary** – fetch rich match data (venue, toss, playing XI,
   officials, head-to-head, scorecards, standings, schedule info) given
   an ESPN event ID.

Typical flow:
    series = search_series("England", "India", 2026)
    events = get_series_events(series["id"])
    for eid in events:
        data = get_match_summary(eid)
"""

import logging
import re
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

import requests

logger = logging.getLogger(__name__)

ESPN_SEARCH_URL = "https://site.web.api.espn.com/apis/common/v3/search"
ESPN_SCOREBOARD_URL = "https://site.web.api.espn.com/apis/site/v2/sports/cricket/{league_id}/scoreboard"
ESPN_SUMMARY_URL = "https://site.web.api.espn.com/apis/site/v2/sports/cricket/{league_id}/summary"

# Fallback league ID – works for any event regardless of actual league
DEFAULT_LEAGUE = "8039"

REQUEST_TIMEOUT = 15

# Team name normalization for matching
TEAM_ALIASES = {
    "india": ["india", "ind"],
    "england": ["england", "eng"],
    "australia": ["australia", "aus"],
    "south africa": ["south africa", "sa", "rsa"],
    "new zealand": ["new zealand", "nz"],
    "pakistan": ["pakistan", "pak"],
    "sri lanka": ["sri lanka", "sl"],
    "bangladesh": ["bangladesh", "ban"],
    "west indies": ["west indies", "wi", "windies"],
    "afghanistan": ["afghanistan", "afg"],
    "zimbabwe": ["zimbabwe", "zim"],
    "ireland": ["ireland", "ire"],
}


def _normalize_team(name: str) -> str:
    lower = name.strip().lower()
    # Strip "women" suffix for matching
    lower = re.sub(r"\s*women\s*$", "", lower)
    for canonical, aliases in TEAM_ALIASES.items():
        if lower in aliases or lower == canonical:
            return canonical
    return lower


def _teams_match(espn_teams: List[str], target_team1: str, target_team2: str) -> bool:
    """Check if ESPN team names match our target teams."""
    espn_set = {_normalize_team(t) for t in espn_teams}
    target_set = {_normalize_team(target_team1), _normalize_team(target_team2)}
    return espn_set == target_set


def _parse_date(date_str: str) -> Optional[datetime]:
    """Parse an ISO date string, tolerating various formats."""
    if not date_str:
        return None
    try:
        # ESPN uses ISO 8601 with Z suffix
        clean = date_str.replace("Z", "+00:00")
        return datetime.fromisoformat(clean)
    except (ValueError, TypeError):
        return None


# ---------------------------------------------------------------------------
# Series search
# ---------------------------------------------------------------------------

def search_series(team1: str, team2: str, year: Optional[int] = None,
                  match_type: Optional[str] = None) -> List[Dict[str, Any]]:
    """Search ESPN for cricket series matching the given teams.

    Returns a list of dicts with keys: id, name, type.
    """
    query_parts = [team1, team2]
    if year:
        query_parts.append(str(year))
    if match_type:
        query_parts.append(match_type)

    try:
        resp = requests.get(
            ESPN_SEARCH_URL,
            params={"query": " ".join(query_parts), "sport": "cricket", "limit": 15},
            timeout=REQUEST_TIMEOUT,
        )
        resp.raise_for_status()
        data = resp.json()
    except (requests.RequestException, ValueError) as exc:
        logger.warning("ESPN series search failed: %s", exc)
        return []

    results = []
    for item in data.get("items", []):
        results.append({
            "id": item.get("id"),
            "name": item.get("displayName", item.get("title", "")),
            "type": item.get("type", ""),
        })
    return results


def find_series_id(team1: str, team2: str, year: Optional[int] = None,
                   match_type: Optional[str] = None) -> Optional[str]:
    """Find the best-matching ESPN series/league ID for a bilateral series."""
    results = search_series(team1, team2, year, match_type)
    if not results:
        return None

    # Prefer series whose name includes the match type
    type_hint = (match_type or "").lower()
    for r in results:
        name_lower = r["name"].lower()
        if type_hint and type_hint in name_lower:
            return str(r["id"])

    # Fall back to "tour" or first result
    for r in results:
        if "tour" in r["name"].lower():
            return str(r["id"])

    return str(results[0]["id"]) if results else None


# ---------------------------------------------------------------------------
# Scoreboard – list events in a series/league
# ---------------------------------------------------------------------------

def get_series_events(league_id: str,
                      date_start: Optional[str] = None,
                      date_end: Optional[str] = None) -> List[Dict[str, Any]]:
    """Get events from an ESPN league/series scoreboard.

    Returns list of dicts with keys: id, name, date, teams, venue.
    """
    url = ESPN_SCOREBOARD_URL.format(league_id=league_id)
    params = {"limit": 50}
    if date_start and date_end:
        params["dates"] = f"{date_start}-{date_end}"
    elif date_start:
        params["dates"] = date_start

    try:
        resp = requests.get(url, params=params, timeout=REQUEST_TIMEOUT)
        resp.raise_for_status()
        data = resp.json()
    except (requests.RequestException, ValueError) as exc:
        logger.warning("ESPN scoreboard fetch failed for league %s: %s", league_id, exc)
        return []

    events = []
    for e in data.get("events", []):
        comp = (e.get("competitions") or [{}])[0]
        venue = comp.get("venue", {})
        competitors = comp.get("competitors", [])
        teams = [c.get("team", {}).get("displayName", "") for c in competitors]
        events.append({
            "id": str(e.get("id", "")),
            "name": e.get("name", ""),
            "date": e.get("date", ""),
            "teams": teams,
            "venue_name": venue.get("fullName", ""),
            "venue_city": venue.get("address", {}).get("city", ""),
        })
    return events


# ---------------------------------------------------------------------------
# Match summary – rich data for a single event
# ---------------------------------------------------------------------------

def get_match_summary(event_id: str, league_id: str = DEFAULT_LEAGUE) -> Optional[Dict[str, Any]]:
    """Fetch the full ESPN match summary for an event.

    Returns a normalized dict with all available data, or None on failure.
    """
    url = ESPN_SUMMARY_URL.format(league_id=league_id)
    try:
        resp = requests.get(url, params={"event": event_id}, timeout=REQUEST_TIMEOUT)
        resp.raise_for_status()
        data = resp.json()
    except (requests.RequestException, ValueError) as exc:
        logger.warning("ESPN summary fetch failed for event %s: %s", event_id, exc)
        return None

    if "code" in data:
        logger.warning("ESPN summary returned error for event %s: %s", event_id, data.get("message"))
        return None

    return _parse_summary(data, event_id)


def _parse_summary(data: dict, event_id: str) -> Dict[str, Any]:
    """Parse the raw ESPN summary response into a clean structure."""
    result = {"espn_event_id": event_id}

    # -- Venue --
    gi = data.get("gameInfo", {})
    venue = gi.get("venue", {})
    addr = venue.get("address", {})
    venue_images = venue.get("images", [])
    venue_image = None
    if venue_images and isinstance(venue_images[0], dict):
        venue_image = venue_images[0].get("$ref", venue_images[0].get("href"))

    result["venue"] = {
        "name": venue.get("fullName", ""),
        "short_name": venue.get("shortName", ""),
        "city": addr.get("city", ""),
        "country": addr.get("country", ""),
        "capacity": venue.get("capacity"),
        "grass": venue.get("grass"),
        "address": addr.get("summary", ""),
        "image_url": venue_image,
        "espn_id": venue.get("id"),
    }

    # -- Officials --
    officials = []
    for o in gi.get("officials", []):
        officials.append({
            "name": o.get("displayName", ""),
            "role": o.get("position", {}).get("displayName", ""),
        })
    result["officials"] = officials

    # -- Notes (toss, schedule, series info) --
    notes = data.get("notes", [])
    notes_map = {}
    for n in notes:
        ntype = n.get("type", "")
        ntext = n.get("text", "")
        if ntype in notes_map:
            if isinstance(notes_map[ntype], list):
                notes_map[ntype].append(ntext)
            else:
                notes_map[ntype] = [notes_map[ntype], ntext]
        else:
            notes_map[ntype] = ntext

    # Toss
    toss_text = notes_map.get("toss", "")
    toss_winner = ""
    toss_decision = ""
    if toss_text:
        # Pattern: "India , elected to field first"
        toss_match = re.match(r"(.+?)\s*,\s*elected to\s+(.+)", toss_text)
        if toss_match:
            toss_winner = toss_match.group(1).strip()
            toss_decision = toss_match.group(2).strip()
    result["toss"] = {
        "winner": toss_winner,
        "decision": toss_decision,
        "raw": toss_text,
    }

    # Schedule
    result["schedule"] = {
        "match_days": notes_map.get("matchdays", ""),
        "hours_of_play": notes_map.get("hoursofplay", ""),
        "match_number": notes_map.get("matchnumber", ""),
        "season": notes_map.get("season", ""),
        "series_note": notes_map.get("seriesnote", ""),
    }

    # -- Rosters (Playing XI) --
    rosters = []
    for r in data.get("rosters", []):
        team = r.get("team", {})
        players = []
        for p in r.get("roster", []):
            ath = p.get("athlete", {})
            pos = p.get("position", {})
            headshot = ath.get("headshot", {})
            headshot_url = ""
            if isinstance(headshot, dict):
                headshot_url = headshot.get("href", "")
            elif isinstance(headshot, str):
                headshot_url = headshot

            # Skip default placeholder headshots
            if "default-player-logo" in headshot_url:
                headshot_url = ""

            players.append({
                "name": ath.get("displayName", ""),
                "espn_id": ath.get("id", ""),
                "position": pos.get("name", "") if isinstance(pos, dict) else str(pos),
                "position_abbr": pos.get("abbreviation", "") if isinstance(pos, dict) else "",
                "headshot_url": headshot_url,
            })
        rosters.append({
            "team_name": team.get("displayName", ""),
            "team_abbr": team.get("abbreviation", ""),
            "team_id": team.get("id", ""),
            "team_logo": (team.get("logos") or [{}])[0].get("href", "") if team.get("logos") else "",
            "home_away": r.get("homeAway", ""),
            "players": players,
        })
    result["rosters"] = rosters

    # -- Head to Head --
    h2h_games = []
    for g in data.get("headToHeadGames", []):
        comps = g.get("competitors", [])
        game = {
            "date": g.get("date", ""),
            "teams": [],
        }
        for c in comps:
            team = c.get("team", {})
            game["teams"].append({
                "name": team.get("displayName", ""),
                "abbreviation": team.get("abbreviation", ""),
                "score": c.get("score", ""),
                "winner": c.get("winner", False),
            })
        h2h_games.append(game)
    result["head_to_head"] = h2h_games

    # -- Scorecards (matchcards) --
    scorecards = []
    for mc in data.get("matchcards", []):
        innings = {
            "innings_number": mc.get("inningsNumber"),
            "team_name": mc.get("teamName", ""),
            "headline": mc.get("headline", ""),
            "batting": [],
            "extras": mc.get("extras", {}),
            "total": mc.get("total", {}),
        }
        for pd in mc.get("playerDetails", []):
            if pd.get("runs") is not None:
                innings["batting"].append({
                    "player_id": pd.get("playerID"),
                    "player_name": pd.get("playerName", ""),
                    "runs": pd.get("runs"),
                    "balls_faced": pd.get("ballsFaced"),
                    "fours": pd.get("fours"),
                    "sixes": pd.get("sixes"),
                    "dismissal": pd.get("dismissal", ""),
                })
        if innings["batting"] or innings["headline"]:
            scorecards.append(innings)
    result["scorecards"] = scorecards

    # -- Standings --
    standings_data = data.get("standings", {})
    standings = []
    for child in standings_data.get("children", []):
        entries = child.get("standings", {}).get("entries", [])
        for entry in entries:
            team = entry.get("team", {})
            stats = {}
            for s in entry.get("stats", []):
                stats[s.get("name", "")] = s.get("displayValue", "")
            standings.append({
                "team_name": team.get("displayName", ""),
                "team_abbr": team.get("abbreviation", ""),
                "stats": stats,
            })
    result["standings"] = standings

    # -- Article --
    article = data.get("article", {})
    if article.get("headline"):
        result["article"] = {
            "headline": article.get("headline", ""),
            "description": article.get("description", ""),
        }
    else:
        result["article"] = None

    # -- Debuts --
    result["debuts"] = data.get("debuts", [])

    return result


# ---------------------------------------------------------------------------
# High-level: find ESPN event for a CricAPI match
# ---------------------------------------------------------------------------

def find_espn_event_id(team1: str, team2: str, match_date: str,
                       match_type: str = "") -> Optional[str]:
    """Try to find the ESPN event ID for a match by searching series then
    scanning events. Falls back to brute-force ID scanning near known series.

    Args:
        team1: First team name
        team2: Second team name
        match_date: ISO date string (YYYY-MM-DD or full ISO)
        match_type: e.g. "odi", "t20", "test"

    Returns:
        ESPN event ID string, or None
    """
    target_date = match_date[:10]  # YYYY-MM-DD

    # Parse year from date
    try:
        year = int(target_date[:4])
    except (ValueError, TypeError):
        year = None

    # Step 1: Search for the series
    series_id = find_series_id(team1, team2, year, match_type)
    if series_id:
        # Try scoreboard for that series
        events = get_series_events(series_id)
        for ev in events:
            ev_date = (ev.get("date") or "")[:10]
            ev_teams = ev.get("teams", [])
            if ev_date == target_date and _teams_match(ev_teams, team1, team2):
                return ev["id"]

        # If scoreboard didn't have it (only shows active matches),
        # try summary for nearby event IDs
        # ESPN event IDs for a series are usually sequential
        for ev in events:
            base_id = int(ev["id"])
            found = _scan_nearby_events(base_id, team1, team2, target_date)
            if found:
                return found

    # Step 2: Try the tour-level series (broader)
    tour_id = find_series_id(team1, team2, year, "tour")
    if tour_id and tour_id != series_id:
        events = get_series_events(tour_id)
        for ev in events:
            ev_date = (ev.get("date") or "")[:10]
            ev_teams = ev.get("teams", [])
            if ev_date == target_date and _teams_match(ev_teams, team1, team2):
                return ev["id"]
            # Use any event as anchor for scanning
            if ev.get("id"):
                base_id = int(ev["id"])
                found = _scan_nearby_events(base_id, team1, team2, target_date)
                if found:
                    return found

    return None


def _scan_nearby_events(base_id: int, team1: str, team2: str,
                        target_date: str, scan_range: int = 15) -> Optional[str]:
    """Scan event IDs near a base ID to find a match by date.

    ESPN event IDs for matches in a series are typically sequential,
    so scanning ±15 from a known event usually finds siblings.
    """
    for offset in range(-scan_range, scan_range + 1):
        eid = str(base_id + offset)
        try:
            resp = requests.get(
                ESPN_SUMMARY_URL.format(league_id=DEFAULT_LEAGUE),
                params={"event": eid},
                timeout=8,
            )
            if resp.status_code != 200:
                continue
            data = resp.json()
            if "code" in data:
                continue

            notes = data.get("notes", [])
            match_days = next(
                (n.get("text", "") for n in notes if n.get("type") == "matchdays"), ""
            )

            # Check if the date matches
            gi = data.get("gameInfo", {})
            venue = gi.get("venue", {})
            if not venue.get("fullName"):
                continue

            # Parse date from matchdays note (e.g. "16 July 2026 - day/night match")
            if target_date:
                try:
                    target_dt = datetime.strptime(target_date, "%Y-%m-%d")
                    # Check if target date appears in matchdays text
                    day = target_dt.day
                    month = target_dt.strftime("%B")
                    year_str = str(target_dt.year)
                    if (str(day) in match_days and month in match_days
                            and year_str in match_days):
                        # Verify teams match via rosters
                        rosters = data.get("rosters", [])
                        roster_teams = [r.get("team", {}).get("displayName", "") for r in rosters]
                        if roster_teams and _teams_match(roster_teams, team1, team2):
                            return eid
                        # If no rosters (future match), trust the date match
                        if not any(r.get("roster") for r in rosters):
                            return eid
                except ValueError:
                    pass
        except (requests.RequestException, ValueError):
            continue

    return None


def find_and_fetch(team1: str, team2: str, match_date: str,
                   match_type: str = "") -> Optional[Dict[str, Any]]:
    """Convenience: find ESPN event ID and fetch full summary in one call."""
    event_id = find_espn_event_id(team1, team2, match_date, match_type)
    if not event_id:
        return None
    return get_match_summary(event_id)
