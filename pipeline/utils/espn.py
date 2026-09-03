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
    "st lucia kings": ["saint lucia kings", "st lucia kings", "st lucia stars", "st lucia zouks"],
    "barbados royals": ["barbados royals", "barbados tridents"],
    "antigua and barbuda falcons": ["antigua and barbuda falcons", "antigua barbuda falcons", "antigua & barbuda falcons"],
    "st kitts and nevis patriots": ["st kitts and nevis patriots", "st kitts & nevis patriots"],
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


def _parse_event_id(value: Any) -> Optional[int]:
    text = str(value or "").strip()
    if not text:
        return None
    try:
        return int(text)
    except (TypeError, ValueError):
        return None


def derive_match_type_from_series_note(series_note: str) -> Optional[str]:
    """Derive a canonical match type from ESPN's series note text."""
    if not series_note:
        return None

    normalized = re.sub(r"\s+", " ", series_note).strip().lower()
    if not normalized:
        return None
    if normalized == "cricket":
        return None
    if "world test championship" in normalized or re.search(r"\btest\b", normalized):
        return "Test"
    if "t10" in normalized:
        return "T10"
    if "hundred" in normalized:
        return "The Hundred"
    if any(marker in normalized for marker in (
        "ipl",
        "indian premier league",
        "wpl",
        "women's premier league",
        "womens premier league",
        "big bash league",
        "bbl",
        "wbbl",
        "caribbean premier league",
        "cpl",
        "pakistan super league",
        "psl",
        "sa20",
        "major league cricket",
        "mlc",
        "lanka premier league",
        "lpl",
        "bangladesh premier league",
        "bpl",
        "international league t20",
        "ilt20",
        "t20 blast",
        "vitality blast",
        "super smash",
        "csa t20 challenge",
        "global super league",
        "t20 world cup",
        "t20i",
    )):
        return "T20"
    if any(marker in normalized for marker in (
        "cricket world cup",
        "world cup league 2",
        "champions trophy",
        "odi series",
        "odi tri series",
        "odi super league",
        "one day cup",
    )):
        return "ODI"
    if "odi" in normalized or "one day" in normalized or "one-day" in normalized or "50 over" in normalized or "50-over" in normalized:
        return "ODI"
    if "t20" in normalized or "twenty20" in normalized or "twenty 20" in normalized:
        return "T20"
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

    return _parse_summary(data, event_id, league_id=league_id)


def _parse_summary(data: dict, event_id: str, league_id: Optional[str] = None) -> Dict[str, Any]:
    """Parse the raw ESPN summary response into a clean structure."""
    payload_league = str(((data.get("leagues") or [{}])[0].get("id") or "")).strip()
    result = {
        "espn_event_id": event_id,
        "league_id": payload_league or str(league_id or DEFAULT_LEAGUE),
    }

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

    # -- Rosters / Squads --
    result["rosters"] = _extract_summary_rosters(data)

    # -- Head to Head --
    h2h_games = []
    seen_event_ids: set[str] = set()
    for h2h_block in data.get("headToHeadGames", []):
        perspective_team = h2h_block.get("team", {})
        perspective_id = perspective_team.get("id", "")
        for evt in h2h_block.get("events", []):
            eid = evt.get("id", "")
            if eid in seen_event_ids:
                continue
            seen_event_ids.add(eid)
            opponent = evt.get("opponent", {})
            home_score = evt.get("homeTeamScore", "")
            away_score = evt.get("awayTeamScore", "")
            game_result = evt.get("gameResult", "")  # W, L, T, NR (from perspective team)
            home_team_id = str(evt.get("homeTeamId", ""))
            # Determine which score belongs to which team
            # homeTeamScore/awayTeamScore are venue-based, not perspective-based
            if home_team_id == perspective_id:
                perspective_score = home_score
                opponent_score = away_score
            else:
                perspective_score = away_score
                opponent_score = home_score
            game = {
                "date": evt.get("gameDate", ""),
                "note": evt.get("matchNote", ""),
                "teams": [
                    {
                        "name": perspective_team.get("displayName", ""),
                        "abbreviation": perspective_team.get("abbreviation", ""),
                        "score": perspective_score,
                        "winner": game_result == "W",
                    },
                    {
                        "name": opponent.get("displayName", ""),
                        "abbreviation": opponent.get("abbreviation", ""),
                        "score": opponent_score,
                        "winner": game_result == "L",
                    },
                ],
            }
            h2h_games.append(game)
    # Sort by date descending (most recent first)
    h2h_games.sort(key=lambda g: g.get("date", ""), reverse=True)
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

    # -- Series Leaders (top performers this series) --
    series_leaders = []
    for team_block in data.get("leaders", []):
        team_info = team_block.get("team", {})
        team_name = team_info.get("displayName", "")
        team_abbr = team_info.get("abbreviation", "")
        for category in team_block.get("leaders", []):
            cat_name = category.get("displayName", category.get("name", ""))
            for entry in category.get("leaders", [])[:1]:  # top 1 per category per team
                athlete = entry.get("athlete", {})
                headshot = athlete.get("headshot", {})
                headshot_url = ""
                if isinstance(headshot, dict):
                    headshot_url = headshot.get("href", "")
                elif isinstance(headshot, str):
                    headshot_url = headshot
                if "default-player-logo" in headshot_url:
                    headshot_url = ""
                series_leaders.append({
                    "player_name": athlete.get("displayName", ""),
                    "player_id": athlete.get("id", ""),
                    "team": team_name,
                    "team_abbr": team_abbr,
                    "category": cat_name,
                    "value": entry.get("displayValue", ""),
                    "headshot_url": headshot_url,
                })
    result["series_leaders"] = series_leaders

    # -- Series scoreline (from latest H2H matchNote) --
    series_scoreline = ""
    if h2h_games:
        # Most recent game's note has the series state
        series_scoreline = h2h_games[0].get("note", "")
    result["series_scoreline"] = series_scoreline

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


def _espn_headshot_url(raw_headshot: Any) -> str:
    headshot_url = ""
    if isinstance(raw_headshot, dict):
        headshot_url = raw_headshot.get("href", "")
    elif isinstance(raw_headshot, str):
        headshot_url = raw_headshot
    if "default-player-logo" in headshot_url:
        return ""
    return headshot_url


def _extract_roster_players(roster_entries: list[dict]) -> list[dict]:
    players = []
    for entry in roster_entries:
        athlete = entry.get("athlete", {})
        position = entry.get("position", {})
        players.append({
            "name": athlete.get("displayName", ""),
            "espn_id": athlete.get("id", ""),
            "position": position.get("name", "") if isinstance(position, dict) else str(position),
            "position_abbr": position.get("abbreviation", "") if isinstance(position, dict) else "",
            "headshot_url": _espn_headshot_url(athlete.get("headshot", {})),
        })
    return players


def _extract_summary_rosters(data: dict) -> list[dict]:
    rosters = []
    for roster in data.get("rosters", []):
        team = roster.get("team", {})
        rosters.append({
            "team_name": team.get("displayName", ""),
            "team_abbr": team.get("abbreviation", ""),
            "team_id": team.get("id", ""),
            "team_logo": (team.get("logos") or [{}])[0].get("href", "") if team.get("logos") else "",
            "home_away": roster.get("homeAway", ""),
            "players": _extract_roster_players(roster.get("roster", [])),
        })
    if any(roster.get("players") for roster in rosters):
        return rosters

    fallback_rosters = []
    for squad in data.get("squads", []):
        team = squad.get("team", {})
        players = []
        for athlete in squad.get("athletes", []):
            position = athlete.get("position", {})
            players.append({
                "name": athlete.get("displayName", ""),
                "espn_id": athlete.get("id", ""),
                "position": position.get("name", "") if isinstance(position, dict) else str(position),
                "position_abbr": position.get("abbreviation", "") if isinstance(position, dict) else "",
                "headshot_url": _espn_headshot_url(athlete.get("headshot", {})),
            })
        fallback_rosters.append({
            "team_name": team.get("displayName", ""),
            "team_abbr": team.get("abbreviation", ""),
            "team_id": team.get("id", ""),
            "team_logo": (team.get("logos") or [{}])[0].get("href", "") if team.get("logos") else "",
            "home_away": "",
            "players": players,
        })
    return fallback_rosters


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
                event_id = str(ev.get("id", "") or "").strip()
                if event_id:
                    return event_id

        # If scoreboard didn't have it (only shows active matches),
        # try summary for nearby event IDs
        # ESPN event IDs for a series are usually sequential
        for ev in events:
            base_id = _parse_event_id(ev.get("id"))
            if base_id is None:
                continue
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
                event_id = str(ev.get("id", "") or "").strip()
                if event_id:
                    return event_id
            # Use any event as anchor for scanning
            base_id = _parse_event_id(ev.get("id"))
            if base_id is not None:
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


# ---------------------------------------------------------------------------
# Fixture discovery: upcoming/recent matches across all cricket
# ---------------------------------------------------------------------------

ESPN_HEADER_URL = "https://site.web.api.espn.com/apis/v2/scoreboard/header"


def get_espn_fixtures() -> List[Dict[str, Any]]:
    """Fetch all current/upcoming/recent cricket matches from ESPN header.

    Returns a list of dicts with keys:
        espn_event_id, team1, team2, date, venue, league_name, league_id,
        status (pre/in/post), winner (if completed)
    """
    try:
        resp = requests.get(
            ESPN_HEADER_URL,
            params={"sport": "cricket"},
            timeout=REQUEST_TIMEOUT,
        )
        if resp.status_code != 200:
            logger.warning(f"ESPN header returned {resp.status_code}")
            return []

        data = resp.json()
    except Exception as e:
        logger.warning(f"ESPN header request failed: {e}")
        return []

    fixtures: List[Dict[str, Any]] = []

    for sport in data.get("sports", []):
        for league in sport.get("leagues", []):
            league_id = league.get("id", "")
            league_name = league.get("name", "")

            for event in league.get("events", []):
                competitors = event.get("competitors", [])
                if len(competitors) < 2:
                    continue

                team1 = competitors[0].get("displayName", "")
                team2 = competitors[1].get("displayName", "")
                status = event.get("status", "pre")  # pre/in/post
                date_str = event.get("date", "")

                winner = None
                if status == "post":
                    for c in competitors:
                        if c.get("winner"):
                            winner = c.get("displayName")

                fixtures.append({
                    "espn_event_id": str(event.get("id", "")),
                    "team1": team1,
                    "team2": team2,
                    "date": date_str,
                    "league_name": league_name,
                    "league_id": league_id,
                    "event_type": event.get("eventType", ""),
                    "class_card": (event.get("class") or {}).get("generalClassCard", ""),
                    "title": event.get("title", ""),
                    "description": event.get("description", ""),
                    "status": status,
                    "winner": winner,
                })

    logger.info(f"ESPN header: found {len(fixtures)} fixtures across {len(data.get('sports', [{}])[0].get('leagues', []))} leagues")
    return fixtures


def get_series_fixtures(league_id: str) -> List[Dict[str, Any]]:
    """Fetch matches from an ESPN series scoreboard.

    Returns list of dicts similar to get_espn_fixtures() output.
    """
    try:
        url = ESPN_SCOREBOARD_URL.format(league_id=league_id)
        resp = requests.get(url, params={"limit": 50}, timeout=REQUEST_TIMEOUT)
        if resp.status_code != 200:
            return []
        data = resp.json()
    except Exception as e:
        logger.debug(f"ESPN series scoreboard failed for {league_id}: {e}")
        return []

    fixtures = []
    for event in data.get("events", []):
        comps = event.get("competitions", [{}])[0]
        competitors = comps.get("competitors", [])
        if len(competitors) < 2:
            continue

        status_obj = comps.get("status", {}).get("type", {})
        status_desc = status_obj.get("description", "")
        status_state = status_obj.get("state", "pre")

        winner = None
        if status_desc == "Result":
            for c in competitors:
                if c.get("winner"):
                    winner = c.get("team", {}).get("displayName")

        venue = comps.get("venue", {})

        fixtures.append({
            "espn_event_id": str(event.get("id", "")),
            "team1": competitors[0].get("team", {}).get("displayName", ""),
            "team2": competitors[1].get("team", {}).get("displayName", ""),
            "date": event.get("date", ""),
            "league_name": data.get("leagues", [{}])[0].get("name", ""),
            "league_id": league_id,
            "event_type": event.get("eventType", ""),
            "class_card": (event.get("class") or {}).get("generalClassCard", ""),
            "title": event.get("title", ""),
            "description": event.get("description", ""),
            "status": status_state,
            "winner": winner,
            "venue": venue.get("fullName", ""),
        })

    return fixtures


def get_espn_match_winner(event_id: str) -> Optional[str]:
    """Quick check if a match has a winner via ESPN summary header.

    Returns winner team display name, '__no_result__' for abandoned,
    or None if not completed.
    """
    try:
        url = ESPN_SUMMARY_URL.format(league_id=DEFAULT_LEAGUE)
        r = requests.get(url, params={"event": event_id}, timeout=REQUEST_TIMEOUT)
        if r.status_code != 200:
            return None
        data = r.json()

        header = data.get("header", {})
        comp = header.get("competitions", [{}])[0]
        status = comp.get("status", {}).get("type", {})
        status_desc = status.get("description", "")

        if status_desc not in ("Result", "Abandoned", "No Result"):
            return None

        for c in comp.get("competitors", []):
            if c.get("winner"):
                return c.get("team", {}).get("displayName")

        if status_desc in ("Abandoned", "No Result"):
            return "__no_result__"

        return None
    except Exception:
        return None


def match_espn_to_cricapi(
    espn_fixtures: List[Dict[str, Any]],
    cricapi_matches: List[Dict[str, Any]],
) -> Dict[str, str]:
    """Match ESPN fixtures to CricAPI match records by team names + date.

    Returns dict mapping CricAPI match_id → ESPN event_id.
    """
    mapping: Dict[str, str] = {}

    for cric in cricapi_matches:
        c_team1 = _normalize_team(cric.get("team1", ""))
        c_team2 = _normalize_team(cric.get("team2", ""))
        c_date = _parse_date(cric.get("date", ""))

        for espn in espn_fixtures:
            e_team1 = _normalize_team(espn.get("team1", ""))
            e_team2 = _normalize_team(espn.get("team2", ""))
            e_date = _parse_date(espn.get("date", ""))

            # Teams must match (order doesn't matter)
            teams_ok = {c_team1, c_team2} == {e_team1, e_team2}
            if not teams_ok:
                continue

            # Date must be within 1 day
            if c_date and e_date:
                diff = abs((c_date - e_date).total_seconds())
                if diff > 86400 * 2:  # 2 days tolerance
                    continue

            mapping[cric["match_id"]] = espn["espn_event_id"]
            break

    return mapping


# ---------------------------------------------------------------------------
# Enrichment context: pull structured data from ESPN for LLM prompts
# ---------------------------------------------------------------------------

def get_espn_enrichment_context(event_id: str, league_id: str = DEFAULT_LEAGUE) -> Dict[str, Any]:
    """Fetch rich context from ESPN summary for LLM enrichment.

    Returns dict with:
        h2h_results:  list of recent H2H results with scores
        news:         list of article headlines + stories
        standings:    list of team standings (if league/tournament)
        venue:        confirmed venue name
        recent_form:  list of recent matchcard results in the series
    """
    context: Dict[str, Any] = {
        "h2h_results": [],
        "news": [],
        "standings": [],
        "venue": None,
        "recent_form": [],
    }

    try:
        url = ESPN_SUMMARY_URL.format(league_id=league_id)
        r = requests.get(url, params={"event": event_id}, timeout=REQUEST_TIMEOUT)
        if r.status_code != 200:
            return context
        data = r.json()
    except Exception as e:
        logger.debug(f"ESPN enrichment context failed for {event_id}: {e}")
        return context

    # Venue
    venue = data.get("gameInfo", {}).get("venue", {})
    if venue.get("fullName"):
        context["venue"] = venue["fullName"]

    # Head-to-head past games
    for game in data.get("headToHeadGames", []):
        comps = game.get("competitions", [{}])[0]
        teams = comps.get("competitors", [])
        if len(teams) < 2:
            continue
        t1 = teams[0].get("team", {}).get("displayName", "")
        t2 = teams[1].get("team", {}).get("displayName", "")
        s1 = teams[0].get("score", "")
        s2 = teams[1].get("score", "")
        winner = ""
        for t in teams:
            if t.get("winner"):
                winner = t.get("team", {}).get("displayName", "")
        date = game.get("date", "")[:10]
        status = comps.get("status", {}).get("type", {}).get("shortDetail", "")
        context["h2h_results"].append({
            "date": date,
            "team1": t1,
            "team2": t2,
            "score1": s1,
            "score2": s2,
            "winner": winner,
            "status": status,
        })

    # News articles
    for article in data.get("news", {}).get("articles", [])[:5]:
        headline = article.get("headline", "")
        story = article.get("story", "")
        # Strip HTML from story, keep first 500 chars
        story_clean = re.sub(r"<[^>]+>", " ", story)
        story_clean = re.sub(r"\s+", " ", story_clean).strip()[:500]
        if headline:
            context["news"].append({
                "headline": headline,
                "story": story_clean,
                "url": (
                    article.get("links", {}).get("web", {}).get("href")
                    or article.get("link")
                    or article.get("url")
                ),
                "published_at": article.get("published") or article.get("lastModified"),
            })

    # Main article (match report/preview)
    main_article = data.get("article", {})
    if main_article.get("headline"):
        story = main_article.get("story", "")
        story_clean = re.sub(r"<[^>]+>", " ", story)
        story_clean = re.sub(r"\s+", " ", story_clean).strip()[:800]
        context["news"].insert(0, {
            "headline": main_article["headline"],
            "story": story_clean,
            "url": (
                main_article.get("links", {}).get("web", {}).get("href")
                or main_article.get("link")
                or main_article.get("url")
            ),
            "published_at": main_article.get("published") or main_article.get("lastModified"),
        })

    # Standings
    for entry in data.get("standings", {}).get("entries", []):
        team = entry.get("team", {}).get("displayName", "")
        stats = {s.get("name", ""): s.get("displayValue", "") for s in entry.get("stats", [])}
        if team:
            context["standings"].append({
                "team": team,
                "wins": stats.get("wins", ""),
                "losses": stats.get("losses", ""),
                "points": stats.get("points", ""),
                "nrr": stats.get("netRunRate", ""),
            })

    # Matchcards — recent results in this series with scorecards
    for mc in data.get("matchcards", [])[:4]:
        team_name = mc.get("teamName", "")
        runs = mc.get("runs", "")
        total = mc.get("total", "")
        headline = mc.get("headline", "")
        top_performers = []
        for p in mc.get("playerDetails", [])[:3]:
            name = p.get("playerName", "")
            runs_scored = p.get("runs", "")
            balls = p.get("ballsFaced", "")
            wickets = p.get("wickets", "")
            overs = p.get("overs", "")
            if headline == "Batting" and runs_scored:
                top_performers.append(f"{name} {runs_scored}({balls})")
            elif headline == "Bowling" and wickets:
                top_performers.append(f"{name} {wickets}/{p.get('conceded', '')} ({overs} ov)")
        context["recent_form"].append({
            "team": team_name,
            "type": headline,
            "score": f"{runs}{total}" if runs else "",
            "top_performers": top_performers,
        })

    return context


def format_espn_context(ctx: Dict[str, Any]) -> str:
    """Format ESPN enrichment context as text for LLM prompts."""
    sections = []

    if ctx.get("venue"):
        sections.append(f"ESPN Confirmed Venue: {ctx['venue']}")

    if ctx.get("h2h_results"):
        lines = ["Recent Head-to-Head Results (from ESPN):"]
        for g in ctx["h2h_results"]:
            line = f"  {g['date']}: {g['team1']} ({g['score1']}) vs {g['team2']} ({g['score2']})"
            if g["winner"]:
                line += f" → {g['winner']} won"
            lines.append(line)
        sections.append("\n".join(lines))

    if ctx.get("standings"):
        lines = ["Tournament Standings:"]
        for s in ctx["standings"]:
            line = f"  {s['team']}: W={s['wins']} L={s['losses']}"
            if s.get("points"):
                line += f" Pts={s['points']}"
            if s.get("nrr"):
                line += f" NRR={s['nrr']}"
            lines.append(line)
        sections.append("\n".join(lines))

    if ctx.get("recent_form"):
        lines = ["Recent Series Scorecards:"]
        for mc in ctx["recent_form"]:
            line = f"  {mc['team']} {mc['type']}: {mc['score']}"
            if mc["top_performers"]:
                line += f" — {', '.join(mc['top_performers'])}"
            lines.append(line)
        sections.append("\n".join(lines))

    if ctx.get("news"):
        lines = ["ESPN News & Previews:"]
        for n in ctx["news"][:3]:
            lines.append(f"  • {n['headline']}")
            if n.get("story"):
                lines.append(f"    {n['story'][:300]}")
        sections.append("\n".join(lines))

    return "\n\n".join(sections) if sections else ""
