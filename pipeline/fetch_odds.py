"""Fetch quota-safe sportsbook odds from The Odds API and store in Supabase."""

import argparse
import logging
import os
import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional

import requests

from utils.db import get_client

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

ODDS_API_BASE = "https://api.the-odds-api.com/v4"
ODDS_API_KEY = os.environ.get("ODDS_API_KEY", "")

CRICKET_SPORTS = [
    "cricket_ipl",
    "cricket_big_bash",
    "cricket_the_hundred",
    "cricket_odi",
    "cricket_t20_intl",
    "cricket_test_match",
    "cricket_psl",
    "cricket_caribbean_premier_league",
]
CARIBBEAN_PREMIER_LEAGUE_KEY = "cricket_caribbean_premier_league"

# The frontend treats persisted, named, two-sided prices as trusted market odds.
# These provider keys favor established books with useful UK/Australian cricket coverage.
BOOKMAKERS = (
    "bet365",
    "williamhill",
    "unibet_uk",
    "paddypower",
    "betfair_ex_uk",
    "tab",
    "sportsbet",
    "ladbrokes_au",
    "neds",
    "betright",
)
MARKETS = "h2h"
AUTOMATED_CREDIT_CEILING = 450
REFRESH_INTERVAL = timedelta(hours=8)
FIXTURE_MATCH_WINDOW = timedelta(hours=36)
RELEVANCE_MATCH_WINDOW = timedelta(hours=12)

SPORT_PRIORITY = {
    "cricket_test_match": 0,
    "cricket_odi": 0,
    "cricket_t20_intl": 0,
    "cricket_ipl": 1,
    "cricket_big_bash": 2,
    "cricket_caribbean_premier_league": 3,
    "cricket_the_hundred": 4,
    "cricket_psl": 5,
}

LEAGUE_ALIASES = {
    "cricket_ipl": ("indian premier league", "ipl"),
    "cricket_big_bash": ("big bash league", "bbl", "womens big bash league", "women's big bash league", "wbbl"),
    "cricket_caribbean_premier_league": ("caribbean premier league", "cpl"),
    "cricket_the_hundred": (
        "the hundred",
        "hundred mens competition",
        "hundred men's competition",
        "hundred womens competition",
        "hundred women's competition",
    ),
    "cricket_psl": ("pakistan super league", "psl"),
}


@dataclass(frozen=True)
class ApiQuota:
    used: Optional[int] = None
    remaining: Optional[int] = None
    last: Optional[int] = None


@dataclass(frozen=True)
class ProviderResult:
    data: list[dict]
    quota: ApiQuota


def _parse_int(value: Optional[str]) -> Optional[int]:
    try:
        return int(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def quota_from_headers(headers) -> ApiQuota:
    """Parse provider usage headers without assuming a request was charged."""
    return ApiQuota(
        used=_parse_int(headers.get("x-requests-used")),
        remaining=_parse_int(headers.get("x-requests-remaining")),
        last=_parse_int(headers.get("x-requests-last")),
    )


def merge_quota(previous: ApiQuota, observed: ApiQuota, assume_charge: bool = False) -> ApiQuota:
    """Prefer observed quota values, conservatively accounting for missing paid headers."""
    used = observed.used
    if used is None:
        used = previous.used + 1 if assume_charge and previous.used is not None else previous.used
    remaining = observed.remaining
    if remaining is None:
        remaining = previous.remaining
        if assume_charge and remaining is not None:
            remaining = max(remaining - 1, 0)
    return ApiQuota(used=used, remaining=remaining, last=observed.last)


def quota_log(quota: ApiQuota) -> str:
    return f"used={quota.used if quota.used is not None else '?'} remaining={quota.remaining if quota.remaining is not None else '?'} last={quota.last if quota.last is not None else '?'}"


def describe_api_error(exc: requests.RequestException) -> str:
    """Return provider diagnostics without logging request URLs or API keys."""
    response = getattr(exc, "response", None)
    if response is None:
        return exc.__class__.__name__

    details = [f"status={response.status_code}"]
    try:
        payload = response.json()
    except requests.exceptions.JSONDecodeError:
        payload = {}

    if isinstance(payload, dict):
        if payload.get("error_code"):
            details.append(f"error_code={payload['error_code']}")
        if payload.get("message"):
            details.append(f"message={str(payload['message'])[:240]}")

    for header in ("x-requests-remaining", "x-requests-used", "x-requests-last", "retry-after"):
        if response.headers.get(header) is not None:
            details.append(f"{header}={response.headers[header]}")
    return ", ".join(details)


def _provider_get(path: str, params: Optional[dict] = None) -> ProviderResult:
    request_params = {"apiKey": ODDS_API_KEY, **(params or {})}
    response = requests.get(f"{ODDS_API_BASE}{path}", params=request_params, timeout=15)
    response.raise_for_status()
    payload = response.json()
    if not isinstance(payload, list):
        raise requests.RequestException("Unexpected non-list provider response", response=response)
    return ProviderResult(payload, quota_from_headers(response.headers))


def get_available_cricket_sports() -> ProviderResult:
    """Return configured cricket sport keys that are currently in season."""
    result = _provider_get("/sports/")
    active = [
        sport["key"]
        for sport in result.data
        if sport.get("key") in CRICKET_SPORTS and sport.get("active")
    ]
    logger.info("Active configured cricket sports: %s | quota %s", active, quota_log(result.quota))
    if CARIBBEAN_PREMIER_LEAGUE_KEY not in active:
        logger.warning(
            "CPL market coverage unavailable: The Odds API did not report %s as active",
            CARIBBEAN_PREMIER_LEAGUE_KEY,
        )
    return ProviderResult(active, result.quota)


def get_events_for_sport(sport_key: str) -> ProviderResult:
    """Use the provider's free events endpoint for relevance discovery."""
    result = _provider_get(f"/sports/{sport_key}/events")
    logger.info(
        "Free event discovery %s: %d events | quota %s",
        sport_key,
        len(result.data),
        quota_log(result.quota),
    )
    return result


def paid_request_params() -> dict:
    """Return the one-market, one-credit bookmaker request contract."""
    if len(BOOKMAKERS) > 10:
        raise ValueError("The Odds API supports at most 10 bookmakers for one-region pricing")
    return {
        "bookmakers": ",".join(BOOKMAKERS),
        "markets": MARKETS,
        "oddsFormat": "decimal",
        "dateFormat": "iso",
    }


def fetch_odds_for_sport(sport_key: str) -> ProviderResult:
    """Fetch one paid h2h odds response for a relevant cricket sport."""
    result = _provider_get(f"/sports/{sport_key}/odds/", paid_request_params())
    logger.info(
        "Paid odds %s: %d events | quota %s",
        sport_key,
        len(result.data),
        quota_log(result.quota),
    )
    return result


def parse_time(value: str) -> Optional[datetime]:
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except (AttributeError, TypeError, ValueError):
        return None


def normalize_team(name: str) -> str:
    normalized = name.lower().replace("&", " and ")
    normalized = re.sub(r"\bsaint\b", "st", normalized)
    normalized = re.sub(r"\b(and|the)\b", " ", normalized)
    normalized = re.sub(r"\s+(women|men)\s*$", "", normalized)
    return re.sub(r"[^a-z0-9]+", " ", normalized).strip()


def _normalize_competition(value: str) -> str:
    normalized = value.lower().replace("&", " and ").replace("’", "'")
    return re.sub(r"[^a-z0-9']+", " ", normalized).strip()


def _includes_alias(source: str, alias: str) -> bool:
    normalized_alias = _normalize_competition(alias)
    return bool(re.search(rf"(^|\s){re.escape(normalized_alias)}($|\s)", source))


def fixture_competition(fixture: dict) -> str:
    """Extract persisted ESPN competition text without using team names."""
    explicit = str(fixture.get("competition_name") or "").strip()
    if explicit:
        return explicit
    name = str(fixture.get("name") or "")
    return name.split(",", 1)[1].strip() if "," in name else ""


def map_fixture_to_sport(fixture: dict) -> Optional[str]:
    """Map explicit competition/format metadata to a configured provider sport."""
    source = _normalize_competition(fixture_competition(fixture))
    if not source:
        return None

    for sport_key, aliases in LEAGUE_ALIASES.items():
        if any(_includes_alias(source, alias) for alias in aliases):
            return sport_key

    if any(_includes_alias(source, alias) for alias in ("t20i", "t20 international", "t20 world cup")):
        return "cricket_t20_intl"
    if any(
        _includes_alias(source, alias)
        for alias in ("odi", "one day international", "cricket world cup", "champions trophy")
    ):
        return "cricket_odi"
    if any(_includes_alias(source, alias) for alias in ("test", "test match", "world test championship")):
        return "cricket_test_match"

    # ESPN tour names often omit "international" but preserve a reliable format.
    if " tour of " in f" {source} ":
        match_type = str(fixture.get("match_type") or "").lower()
        if match_type == "test":
            return "cricket_test_match"
        if match_type == "odi":
            return "cricket_odi"
        if match_type in ("t20", "t20i"):
            return "cricket_t20_intl"
    return None


def get_upcoming_local_fixtures(now: Optional[datetime] = None) -> list[dict]:
    """Load actual upcoming local fixtures used to admit provider sports."""
    now = now or datetime.now(timezone.utc)
    response = (
        get_client()
        .table("matches")
        .select("match_id,name,team1,team2,date,match_type,status")
        .eq("status", "upcoming")
        .gte("date", now.isoformat())
        .order("date", desc=False)
        .execute()
    )
    return response.data or []


def relevant_fixtures_for_sport(
    sport_key: str,
    provider_events: list[dict],
    local_fixtures: list[dict],
    now: Optional[datetime] = None,
) -> list[dict]:
    """Correlate provider events to local fixtures by both teams and kickoff."""
    now = now or datetime.now(timezone.utc)
    event_lookup: dict[tuple[str, str], list[datetime]] = {}
    for event in provider_events:
        kickoff = parse_time(event.get("commence_time", ""))
        teams = event.get("teams") or [event.get("home_team", ""), event.get("away_team", "")]
        normalized = [normalize_team(team) for team in teams if team]
        if kickoff and len(normalized) == 2:
            event_lookup.setdefault(tuple(sorted(normalized)), []).append(kickoff)

    relevant = []
    for fixture in local_fixtures:
        kickoff = parse_time(fixture.get("date", ""))
        if not kickoff or kickoff < now:
            continue
        mapped_sport = map_fixture_to_sport(fixture)
        if mapped_sport is not None and mapped_sport != sport_key:
            continue
        pair = tuple(sorted((normalize_team(fixture.get("team1", "")), normalize_team(fixture.get("team2", "")))))
        if not all(pair):
            continue
        if any(abs(event_time - kickoff) <= RELEVANCE_MATCH_WINDOW for event_time in event_lookup.get(pair, [])):
            relevant.append(fixture)
    return sorted(relevant, key=lambda fixture: (parse_time(fixture.get("date", "")) or datetime.max.replace(tzinfo=timezone.utc), fixture.get("match_id", "")))


def prioritize_relevant_sports(relevant: dict[str, list[dict]]) -> list[str]:
    """Order internationals, IPL, then configured leagues by earliest kickoff."""
    def sort_key(sport_key: str):
        fixtures = relevant[sport_key]
        earliest = min(
            (parse_time(fixture.get("date", "")) for fixture in fixtures),
            default=None,
        )
        return (
            SPORT_PRIORITY.get(sport_key, 100),
            earliest or datetime.max.replace(tzinfo=timezone.utc),
            sport_key,
        )

    return sorted(relevant, key=sort_key)


def get_refresh_state() -> dict[str, datetime]:
    """Load successful paid refresh timestamps by provider sport."""
    response = get_client().table("odds_refresh_state").select("sport_key,refreshed_at").execute()
    state = {}
    for row in response.data or []:
        refreshed_at = parse_time(row.get("refreshed_at", ""))
        if refreshed_at:
            state[row["sport_key"]] = refreshed_at
    return state


def is_sport_fresh(
    sport_key: str,
    refresh_state: dict[str, datetime],
    now: Optional[datetime] = None,
) -> bool:
    now = now or datetime.now(timezone.utc)
    refreshed_at = refresh_state.get(sport_key)
    return refreshed_at is not None and now - refreshed_at < REFRESH_INTERVAL


def store_refresh_state(
    sport_key: str,
    event_count: int,
    quota: ApiQuota,
    refreshed_at: Optional[datetime] = None,
) -> None:
    """Persist successful paid calls, including zero-cost empty responses."""
    refreshed_at = refreshed_at or datetime.now(timezone.utc)
    get_client().table("odds_refresh_state").upsert(
        {
            "sport_key": sport_key,
            "refreshed_at": refreshed_at.isoformat(),
            "event_count": event_count,
            "quota_used": quota.used,
            "quota_remaining": quota.remaining,
            "quota_last": quota.last,
            "updated_at": refreshed_at.isoformat(),
        },
        on_conflict="sport_key",
    ).execute()


def can_make_paid_call(quota: ApiQuota) -> bool:
    """Admit a call only when its worst-case next credit stays within 450."""
    return quota.used is not None and quota.used < AUTOMATED_CREDIT_CEILING


def parse_odds_events(events: list[dict]) -> list[dict]:
    """Parse odds API events into rows for the existing match_odds shape."""
    rows = []
    for event in events:
        event_id = event.get("id")
        home_team = event.get("home_team", "")
        away_team = event.get("away_team", "")
        commence_time = event.get("commence_time", "")
        sport_key = event.get("sport_key", "")

        for bookmaker in event.get("bookmakers", []):
            bookmaker_name = bookmaker.get("title", bookmaker.get("key", "unknown"))
            for market in bookmaker.get("markets", []):
                if market.get("key") != "h2h":
                    continue
                outcomes = {outcome["name"]: outcome["price"] for outcome in market.get("outcomes", [])}
                if not outcomes:
                    continue

                team1_odds = outcomes.get(home_team)
                team2_odds = outcomes.get(away_team)
                if team1_odds is None and team2_odds is None:
                    continue

                rows.append({
                    "odds_api_event_id": event_id,
                    "sport_key": sport_key,
                    "team1": home_team,
                    "team2": away_team,
                    "bookmaker": bookmaker_name,
                    "team1_odds": team1_odds,
                    "team2_odds": team2_odds,
                    "draw_odds": outcomes.get("Draw"),
                    "market": "h2h",
                    "commence_time": commence_time,
                    "fetched_at": datetime.now(timezone.utc).isoformat(),
                })
    return rows


def match_odds_to_matches(
    odds_rows: list[dict],
    matches: Optional[list[dict]] = None,
) -> list[dict]:
    """Link odds to local matches by normalized team pair and date."""
    if matches is None:
        matches = get_upcoming_local_fixtures()

    match_lookup: dict[tuple[str, str], list[dict]] = {}
    for match in matches:
        key = tuple(sorted([normalize_team(match["team1"]), normalize_team(match["team2"])]))
        match_lookup.setdefault(key, []).append(match)

    linked = []
    for row in odds_rows:
        key = tuple(sorted([normalize_team(row["team1"]), normalize_team(row["team2"])]))
        candidates = match_lookup.get(key, [])
        event_time = parse_time(row.get("commence_time", ""))
        dated_candidates = [
            (abs((candidate_time - event_time).total_seconds()), candidate)
            for candidate in candidates
            if event_time and (candidate_time := parse_time(candidate.get("date", "")))
        ]
        closest = min(dated_candidates, key=lambda item: item[0]) if dated_candidates else None
        match = closest[1] if closest else (candidates[0] if len(candidates) == 1 else None)
        if match and (not event_time or closest is None or closest[0] <= FIXTURE_MATCH_WINDOW.total_seconds()):
            same_order = normalize_team(row["team1"]) == normalize_team(match["team1"])
            linked.append({
                "match_id": match["match_id"],
                "bookmaker": row["bookmaker"],
                "team1_odds": row["team1_odds"] if same_order else row["team2_odds"],
                "team2_odds": row["team2_odds"] if same_order else row["team1_odds"],
                "draw_odds": row["draw_odds"],
                "market": row["market"],
                "fetched_at": row["fetched_at"],
            })
    return linked


def store_odds(odds_rows: list[dict]) -> int:
    """Store odds in Supabase without changing the existing row contract."""
    if not odds_rows:
        return 0
    seen = {}
    for row in odds_rows:
        seen[(row["match_id"], row["bookmaker"])] = row
    deduped = list(seen.values())
    get_client().table("match_odds").upsert(
        deduped,
        on_conflict="match_id,bookmaker",
    ).execute()
    return len(deduped)


def _is_fatal_access_error(exc: requests.RequestException) -> bool:
    response = getattr(exc, "response", None)
    return response is not None and response.status_code in (401, 403)


def main(sport: Optional[str] = None) -> int:
    if not ODDS_API_KEY:
        logger.error("ODDS_API_KEY environment variable not set")
        return 1

    try:
        discovery = get_available_cricket_sports()
        active_sports = [key for key in discovery.data if sport is None or key == sport]
        local_fixtures = get_upcoming_local_fixtures()
        refresh_state = get_refresh_state()
    except requests.RequestException as exc:
        logger.error("Failed to discover active cricket sports (%s)", describe_api_error(exc))
        return 1

    if not active_sports:
        logger.info("No requested configured cricket sports are active")
        return 0
    if not local_fixtures:
        logger.info("No upcoming local Supabase fixtures; skipping all paid odds calls")
        return 0

    quota = discovery.quota
    relevant: dict[str, list[dict]] = {}
    event_discovery_successes = 0
    event_discovery_failures: list[str] = []
    for sport_key in active_sports:
        try:
            event_result = get_events_for_sport(sport_key)
            event_discovery_successes += 1
            quota = merge_quota(quota, event_result.quota)
            matches = relevant_fixtures_for_sport(sport_key, event_result.data, local_fixtures)
            if matches:
                relevant[sport_key] = matches
                logger.info(
                    "Relevant sport %s: %d local fixtures, earliest=%s",
                    sport_key,
                    len(matches),
                    matches[0].get("date"),
                )
            else:
                logger.info("Skipping %s: no provider event matches an upcoming local fixture", sport_key)
        except requests.RequestException as exc:
            event_discovery_failures.append(sport_key)
            logger.error("Free event discovery failed for %s (%s)", sport_key, describe_api_error(exc))
            if _is_fatal_access_error(exc):
                logger.error("Fatal sportsbook API access failure")
                return 1

    if event_discovery_successes == 0:
        logger.error("Sportsbook refresh failed: all %d free event discovery calls failed", len(active_sports))
        return 1
    if event_discovery_failures:
        logger.warning(
            "Free event discovery partially succeeded: %d succeeded, %d failed (%s)",
            event_discovery_successes,
            len(event_discovery_failures),
            ", ".join(event_discovery_failures),
        )

    ordered_sports = prioritize_relevant_sports(relevant)
    logger.info("Paid odds priority order: %s", ordered_sports)
    due_sports = []
    now = datetime.now(timezone.utc)
    for sport_key in ordered_sports:
        if is_sport_fresh(sport_key, refresh_state, now):
            refreshed_at = refresh_state[sport_key]
            logger.info(
                "Skipping %s: fresh until %s",
                sport_key,
                (refreshed_at + REFRESH_INTERVAL).isoformat(),
            )
        else:
            due_sports.append(sport_key)

    successful_paid_calls = 0
    failed_paid_sports: list[str] = []
    budget_stopped = False
    provider_event_count = 0
    parsed_row_count = 0
    linked_row_count = 0
    stored_row_count = 0
    for sport_key in due_sports:
        if not can_make_paid_call(quota):
            budget_stopped = True
            logger.warning(
                "Automated odds budget stop before %s: quota %s; ceiling=%d reserve=%d",
                sport_key,
                quota_log(quota),
                AUTOMATED_CREDIT_CEILING,
                500 - AUTOMATED_CREDIT_CEILING,
            )
            break
        try:
            before = quota
            result = fetch_odds_for_sport(sport_key)
            quota = merge_quota(before, result.quota, assume_charge=True)
            successful_paid_calls += 1
            parsed_rows = parse_odds_events(result.data)
            linked_rows = match_odds_to_matches(parsed_rows, local_fixtures)
            stored_rows = store_odds(linked_rows)
            store_refresh_state(sport_key, len(result.data), quota)
            provider_event_count += len(result.data)
            parsed_row_count += len(parsed_rows)
            linked_row_count += len(linked_rows)
            stored_row_count += stored_rows
            logger.info(
                "Completed paid refresh %s: events=%d linked_rows=%d stored=%d actual_cost=%s quota %s",
                sport_key,
                len(result.data),
                len(linked_rows),
                stored_rows,
                quota.last if quota.last is not None else "unknown",
                quota_log(quota),
            )
        except requests.RequestException as exc:
            response = getattr(exc, "response", None)
            observed = quota_from_headers(response.headers) if response is not None else ApiQuota()
            quota = merge_quota(quota, observed, assume_charge=True)
            failed_paid_sports.append(sport_key)
            logger.error("Failed to fetch %s (%s)", sport_key, describe_api_error(exc))
            if _is_fatal_access_error(exc):
                logger.error("Fatal sportsbook API access failure")
                return 1

    if due_sports and successful_paid_calls == 0 and failed_paid_sports:
        logger.error("Sportsbook refresh failed: all %d attempted paid sports failed", len(failed_paid_sports))
        return 1
    if failed_paid_sports and successful_paid_calls:
        logger.warning(
            "Sportsbook refresh partially succeeded: %d paid calls succeeded, %d failed (%s)",
            successful_paid_calls,
            len(failed_paid_sports),
            ", ".join(failed_paid_sports),
        )

    logger.info(
        "Odds refresh complete: relevant=%d due=%d paid=%d events=%d odds_rows=%d linked_rows=%d stored=%d budget_stop=%s quota %s",
        len(ordered_sports),
        len(due_sports),
        successful_paid_calls,
        provider_event_count,
        parsed_row_count,
        linked_row_count,
        stored_row_count,
        budget_stopped,
        quota_log(quota),
    )
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Fetch sportsbook odds from The Odds API")
    parser.add_argument("--sport", help="Specific configured sport key to refresh")
    args = parser.parse_args()
    exit(main(sport=args.sport))
