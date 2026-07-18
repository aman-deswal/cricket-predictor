"""Enrich upcoming matches with source-backed LLM research notes."""

import argparse
import html
import re
import json
import logging
import os
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import urljoin, urlparse

import requests
from openai import OpenAI

from utils.cricsheet import get_head_to_head, get_recent_player_pool, get_team_recent_form
from utils.db import (
    get_client,
    get_upcoming_matches,
    get_match_squad_names,
    store_match_enrichment,
    get_team_form_from_cache,
    get_h2h_from_cache,
    get_recent_results,
)
from utils.espn import get_espn_enrichment_context, format_espn_context

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

MODEL = "openai/gpt-4o"
REPUTABLE_SOURCES = {
    "BBC Sport",
    "Cricbuzz",
    "ESPNcricinfo",
    "ICC",
    "International Cricket Council",
    "The Cricketer",
    "Wisden",
}
SOURCE_DOMAINS = {
    "bbc.co.uk",
    "bbc.com",
    "cricbuzz.com",
    "espncricinfo.com",
    "icc-cricket.com",
    "thecricketer.com",
    "wisden.com",
}
PRIMARY_SOURCE_DOMAINS = (
    "cricbuzz.com",
)
MIN_ARTICLE_TEXT_CHARS = 300
REQUEST_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}
TOP_INTERNATIONAL_TEAMS = {
    "India",
    "Australia",
    "England",
    "South Africa",
    "New Zealand",
    "Pakistan",
    "Sri Lanka",
    "Bangladesh",
    "West Indies",
    "Afghanistan",
    "Zimbabwe",
    "Ireland",
}
POPULAR_LEAGUES = (
    "indian premier league",
    "ipl",
    "womens premier league",
    "women premier league",
    "wpl",
    "big bash league",
    "bbl",
    "the hundred",
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
)

ENRICHMENT_PROMPT = """You are a careful cricket research assistant. Use only the source snippets and ESPN data below.

Match:
- {team1} vs {team2}
- Format: {match_type}
- Date: {date}
- Series or venue: {venue}

{espn_context}

{recent_results_context}

Sources:
{sources}

Return JSON with this shape:
{{
  "venue_name": string | null,
  "venue_confidence": "confirmed" | "reported" | "unknown",
    "possible_xi": {{"team1": string[], "team2": string[]}},
  "player_updates": [{{"player": string, "team": string, "status": string, "confidence": "confirmed" | "reported" | "speculative", "source_index": number}}],
  "expert_preview": string,
  "toss_insight": string,
  "confidence": "high" | "medium" | "low"
}}

Rules:
- Do not invent injuries, availability, squads, or playing XIs.
- For venue_name: use the ESPN confirmed venue if provided. Otherwise use the venue from sources if mentioned. Do NOT guess venues from general knowledge — venue data comes from ESPN Cricinfo separately. Use null if no source mentions the venue.
- toss_insight: a single sentence about which team benefits more from winning the toss at this venue and what they should choose (bat/bowl first), with approximate percentage edge if possible. Use your cricket knowledge of the venue and conditions.
- expert_preview: 3-5 sentences. Incorporate ESPN head-to-head results and recent series form data when available. Reference recent results and current team momentum. Mention uncertainty when sources are thin.
- If sources do not support a field, use null, empty arrays, or say that no reliable update was found.
- Use source_index values from the source list for player updates.
- Prefer article body text over headlines. Headlines alone are not enough for venue, XI, or injury claims.
- For possible_xi, include only players explicitly named in source-backed squad, probable XI, or playing XI material. Do not imply they are a confirmed playing XI unless the source says so.
- Do not discuss unrelated matches, unrelated teams, or generic cricket news.
"""

MODEL_FALLBACK_PROMPT = """You are a cricket analyst. You do not have live web access in this call.

Use the fixture details, historical Cricsheet stats, ESPN data, and your general cricket knowledge below.

Match:
- {team1} vs {team2}
- Format: {match_type}
- Date: {date}
- Series or venue field from fixture API: {venue}

{espn_context}

{recent_results_context}

Historical stats:
- {team1} recent form: {team1_wins} wins in last {team1_matches} matches, win rate {team1_win_rate:.1%}
- {team2} recent form: {team2_wins} wins in last {team2_matches} matches, win rate {team2_win_rate:.1%}
- Head-to-head: {h2h_total} matches, {team1} {h2h_team1_wins} wins, {team2} {h2h_team2_wins} wins

Recent Cricsheet player pools:
- {team1}: {team1_player_pool}
- {team2}: {team2_player_pool}

Confirmed squads (ONLY use these players for key_battles):
- {team1}: {team1_squad}
- {team2}: {team2_squad}

Return JSON with this shape:
{{
    "venue_name": string | null,
    "venue_confidence": "unknown",
    "expert_preview": string,
    "toss_insight": string,
    "possible_xi": {{"team1": string[], "team2": string[]}},
    "player_updates": [{{"player": string, "team": string, "status": string, "confidence": "speculative"}}],
    "key_battles": [{{"batter": string, "batter_team": string, "bowler": string, "bowler_team": string, "insight": string}}],
    "confidence": "medium" | "low"
}}

Rules:
- The preview must incorporate ESPN head-to-head data, recent series results, and standings when available. Reference actual recent scores and team momentum.
- Use general cricket knowledge and fixture context to fill in details.
- venue_name: ONLY use a venue if the fixture API field or ESPN data already contains one. Do NOT guess or infer venues from general knowledge — venue data comes from ESPN Cricinfo separately. Use null if no data provides the venue.
- toss_insight: a single sentence about which team benefits more from winning the toss at this venue and what they should choose (bat/bowl first), with approximate percentage edge if possible. If venue is unknown, provide a general insight for the format.
- possible_xi should contain recent-player candidates only, not a confirmed squad or playing XI.
- Select possible_xi names only from the Recent Cricsheet player pools above. If a pool is empty, return an empty array for that team.
- player_updates should be empty unless there is a widely known, non-live context note. Do not invent fresh injuries or availability news.
- key_battles: list 3-4 batter vs bowler matchups between opposing teams. **CRITICAL: Every player in key_battles MUST be from the confirmed squads listed above.** Do not use players who are not in the squad. insight should explain why the battle matters.
- Do not include players from unrelated teams or unrelated matches.
- Keep the preview to 3-5 sentences.
"""


def parse_datetime(value: str) -> Optional[datetime]:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def is_future_match(match: dict) -> bool:
    match_time = parse_datetime(match.get("date", ""))
    return match_time is not None and match_time > datetime.now(timezone.utc)


def normalize_team(team: str) -> str:
    return re.sub(r"\s+(Women|Men)$", "", team).strip()



def match_priority(match: dict) -> tuple[int, str]:
    team1 = normalize_team(match.get("team1", ""))
    team2 = normalize_team(match.get("team2", ""))
    haystack = f"{match.get('name', '')} {match.get('venue', '')}".lower()

    if team1 in TOP_INTERNATIONAL_TEAMS and team2 in TOP_INTERNATIONAL_TEAMS:
        return (0, match.get("date", ""))
    if any(league in haystack for league in POPULAR_LEAGUES):
        return (1, match.get("date", ""))
    return (2, match.get("date", ""))

def build_query(match: dict) -> str:
    parts = [
        match.get("team1", ""),
        match.get("team2", ""),
        match.get("venue", ""),
        "cricket preview squad injury possible XI venue",
    ]
    return " ".join(part for part in parts if part).strip()


def series_name(match: dict) -> str:
    name = match.get("name", "")
    if "," in name:
        return name.split(",", 1)[1].strip()
    return match.get("venue", "")


def match_year(match: dict) -> str:
    match_time = parse_datetime(match.get("date", ""))
    return str(match_time.year) if match_time else ""


def team_terms(team: str) -> list[str]:
    normalized = normalize_team(team).lower()
    aliases = [normalized]
    words = [word for word in re.split(r"\W+", normalized) if len(word) >= 4]
    aliases.extend(words)
    return list(dict.fromkeys(alias for alias in aliases if alias))


def mentions_team(team: str, text: str) -> bool:
    return any(term in text for term in team_terms(team))


def is_allowed_source(source_name: str, url: str) -> bool:
    if source_name in REPUTABLE_SOURCES:
        return True
    return any(domain in url for domain in SOURCE_DOMAINS)


def strip_html(value: str) -> str:
    text = re.sub(r"<script[\s\S]*?</script>", " ", value, flags=re.IGNORECASE)
    text = re.sub(r"<style[\s\S]*?</style>", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", " ", text)
    text = html.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def extract_article_text(url: str, max_chars: int = 4500) -> str:
    try:
        response = requests.get(
            url,
            timeout=20,
            headers=REQUEST_HEADERS,
        )
        response.raise_for_status()
    except requests.RequestException as exc:
        logger.info(f"Unable to fetch source article {url}: {exc}")
        return ""

    text = strip_html(response.text)
    return text[:max_chars]


def source_relevance(match: dict, source: dict) -> int:
    haystack = f"{source.get('title', '')} {source.get('snippet', '')} {source.get('article_text', '')}".lower()
    score = 0
    if mentions_team(match.get("team1", ""), haystack):
        score += 1
    if mentions_team(match.get("team2", ""), haystack):
        score += 1
    year = match_year(match)
    if year and year in haystack:
        score += 1
    series_words = [word for word in re.split(r"\W+", series_name(match).lower()) if len(word) >= 5]
    if series_words and sum(1 for word in series_words if word in haystack) >= min(2, len(series_words)):
        score += 1
    if "injur" in haystack or "squad" in haystack or "xi" in haystack or "venue" in haystack:
        score += 1
    return score


def has_match_specific_heading(match: dict, source: dict) -> bool:
    heading = f"{source.get('title', '')} {source.get('snippet', '')}".lower()
    if mentions_team(match.get("team1", ""), heading) and mentions_team(match.get("team2", ""), heading):
        return True

    series_words = [word for word in re.split(r"\W+", series_name(match).lower()) if len(word) >= 5]
    return bool(series_words) and sum(1 for word in series_words if word in heading) >= min(2, len(series_words))


def normalize_source(source: dict, match: dict) -> Optional[dict]:
    source["snippet"] = strip_html(source.get("snippet", ""))
    if not has_match_specific_heading(match, source):
        return None
    source["article_text"] = extract_article_text(source.get("url", ""))
    if len(source.get("article_text", "")) < MIN_ARTICLE_TEXT_CHARS:
        return None
    if source_relevance(match, source) < 2:
        return None
    text = f"{source.get('title', '')} {source.get('snippet', '')} {source.get('article_text', '')}".lower()
    if not mentions_team(match.get("team1", ""), text) or not mentions_team(match.get("team2", ""), text):
        return None
    return source


def source_name_from_url(url: str) -> str:
    domain = urlparse(url).netloc.lower()
    if "cricbuzz.com" in domain:
        return "Cricbuzz"
    if "espncricinfo.com" in domain:
        return "ESPNcricinfo"
    return domain or "Unknown"


def is_candidate_article_url(url: str, allowed_domain: str) -> bool:
    parsed = urlparse(url)
    path = parsed.path.lower().rstrip("/")
    if allowed_domain not in parsed.netloc.lower() or not path:
        return False
    if any(skip in path for skip in ("/profiles/", "/authors/", "/ci/engine/player/", "/photo/")):
        return False
    if "cricbuzz.com" in allowed_domain:
        return bool(re.match(r"^/cricket-news/\d+/.+", path))
    if "espncricinfo.com" in allowed_domain:
        return "/story/" in path or "/series/" in path and "/match-preview" in path
    return False


def extract_result_links(page_url: str, base_url: str, allowed_domain: str) -> list[str]:
    response = requests.get(
        page_url,
        timeout=30,
        headers=REQUEST_HEADERS,
    )
    response.raise_for_status()

    links = []
    seen = set()
    for href in re.findall(r'href=["\']([^"\']+)["\']', response.text):
        url = urljoin(base_url, html.unescape(href))
        if not is_candidate_article_url(url, allowed_domain):
            continue
        if url in seen:
            continue
        seen.add(url)
        links.append(url)
    return links


def search_primary_cricket_sites(match: dict, limit: int) -> list[dict]:
    site_pages = (
        ("cricbuzz.com", "https://www.cricbuzz.com", "https://www.cricbuzz.com/"),
        ("cricbuzz.com", "https://www.cricbuzz.com", "https://www.cricbuzz.com/cricket-news"),
        ("cricbuzz.com", "https://www.cricbuzz.com", "https://www.cricbuzz.com/cricket-match/live-scores/upcoming-matches"),
    )
    sources = []
    seen_urls = set()
    for domain, base_url, page_url in site_pages:
        try:
            result_links = extract_result_links(page_url, base_url, domain)
        except requests.RequestException as exc:
            logger.info(f"Direct site crawl failed for {domain}: {exc}")
            continue

        for url in result_links:
            if url in seen_urls:
                continue
            seen_urls.add(url)
            title = urlparse(url).path.rsplit("/", 1)[-1].replace("-", " ").strip()
            source = {
                "title": title,
                "url": url,
                "source": source_name_from_url(url),
                "published_at": None,
                "snippet": "",
            }
            normalized = normalize_source(source, match)
            if normalized:
                sources.append(normalized)
            if len(sources) >= limit:
                return sources
    return sources


def search_sources(match: dict, limit: int = 8) -> list[dict]:
    if limit <= 0:
        return []

    providers = (search_primary_cricket_sites,)
    sources = []
    seen_urls = set()

    for provider in providers:
        try:
            provider_sources = provider(match, limit)
        except (requests.RequestException, ValueError) as exc:
            logger.info(f"Source provider {provider.__name__} failed: {exc}")
            continue

        for source in provider_sources:
            url = source.get("url", "")
            if not url or url in seen_urls:
                continue
            seen_urls.add(url)
            sources.append(source)
            if len(sources) >= limit:
                return sources

    return sources


def format_sources(sources: list[dict]) -> str:
    if not sources:
        return "No reputable sources found."
    return "\n".join(
        f"[{index}] {source['source']} - {source['title']}\n"
        f"URL: {source['url']}\n"
        f"Published: {source['published_at']}\n"
        f"Snippet: {source['snippet']}\n"
        f"Article text: {source.get('article_text') or 'Unavailable'}"
        for index, source in enumerate(sources, start=1)
    )


def source_corpus(sources: list[dict]) -> str:
    return " ".join(
        f"{source.get('title', '')} {source.get('snippet', '')} {source.get('article_text', '')}"
        for source in sources
    ).lower()


def text_mentions(value: str, text: str) -> bool:
    normalized = value.lower().strip()
    if not normalized:
        return False
    words = [word for word in re.split(r"\W+", normalized) if len(word) >= 3]
    return bool(words) and all(word in text for word in words)


def has_squad_or_xi_context(text: str) -> bool:
    return any(token in text for token in ("playing xi", "probable xi", "possible xi", "squad", "line-up", "lineup", "team news", "named", "announced"))


def sanitize_source_backed_details(details: dict, sources: list[dict]) -> dict:
    """Remove live claims that are not explicitly backed by source text."""
    corpus = source_corpus(sources)

    venue_name = details.get("venue_name")
    if venue_name and text_mentions(venue_name, corpus):
        details["venue_confidence"] = "confirmed"
    elif venue_name:
        # AI inferred it without source backing — null it out
        details["venue_name"] = None
        details["venue_confidence"] = "unknown"

    if has_squad_or_xi_context(corpus):
        possible_xi = details.get("possible_xi") or {"team1": [], "team2": []}
        details["possible_xi"] = {
            "team1": [player for player in possible_xi.get("team1", []) if text_mentions(player, corpus)],
            "team2": [player for player in possible_xi.get("team2", []) if text_mentions(player, corpus)],
        }
    else:
        details["possible_xi"] = {"team1": [], "team2": []}

    source_count = len(sources)
    backed_updates = []
    for update in details.get("player_updates") or []:
        source_index = update.get("source_index")
        player = update.get("player", "")
        status = update.get("status", "")
        if not isinstance(source_index, int) or source_index < 1 or source_index > source_count:
            continue
        source = sources[source_index - 1]
        source_text = source_corpus([source])
        if text_mentions(player, source_text) and any(word in source_text for word in ("injur", "fit", "available", "ruled", "rest", "squad")):
            backed_updates.append({**update, "status": status})
    details["player_updates"] = backed_updates

    return details


def call_llm(match: dict, sources: list[dict], espn_ctx: str = "", recent_results_ctx: str = "") -> dict:
    client = OpenAI(
        base_url="https://models.github.ai/inference",
        api_key=os.environ["GITHUB_TOKEN"],
    )
    prompt = ENRICHMENT_PROMPT.format(
        team1=match.get("team1", ""),
        team2=match.get("team2", ""),
        match_type=match.get("match_type", ""),
        date=match.get("date", ""),
        venue=match.get("venue", ""),
        sources=format_sources(sources),
        espn_context=espn_ctx or "No ESPN data available.",
        recent_results_context=recent_results_ctx or "",
    )
    response = client.chat.completions.create(
        model=MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.1,
        response_format={"type": "json_object"},
    )
    return json.loads(response.choices[0].message.content)


def call_model_fallback(match: dict, stats: dict, espn_ctx: str = "", recent_results_ctx: str = "") -> dict:
    client = OpenAI(
        base_url="https://models.github.ai/inference",
        api_key=os.environ["GITHUB_TOKEN"],
    )
    prompt = MODEL_FALLBACK_PROMPT.format(
        team1=match.get("team1", ""),
        team2=match.get("team2", ""),
        match_type=match.get("match_type", ""),
        date=match.get("date", ""),
        venue=match.get("venue", ""),
        espn_context=espn_ctx or "No ESPN data available.",
        recent_results_context=recent_results_ctx or "",
        **stats,
    )
    response = client.chat.completions.create(
        model=MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.2,
        response_format={"type": "json_object"},
    )
    return json.loads(response.choices[0].message.content)


def filter_players_to_pool(players: list[str], pool: list[str], limit: int = 15) -> list[str]:
    pool_by_key = {player.casefold(): player for player in pool}
    filtered = []
    seen = set()
    for player in players:
        canonical = pool_by_key.get(str(player).casefold())
        if canonical and canonical not in seen:
            filtered.append(canonical)
            seen.add(canonical)
        if len(filtered) >= limit:
            break
    return filtered


def filter_possible_xi_to_pools(possible_xi: dict, team1_pool: list[str], team2_pool: list[str]) -> dict:
    return {
        "team1": filter_players_to_pool(possible_xi.get("team1", []), team1_pool),
        "team2": filter_players_to_pool(possible_xi.get("team2", []), team2_pool),
    }


def get_cricsheet_type(match_type: str) -> str:
    if "t20" in match_type.lower():
        return "t20s"
    if "odi" in match_type.lower():
        return "odis"
    return match_type.lower()


def build_data_backed_details(match: dict, espn_ctx: str = "", recent_results_ctx: str = "") -> dict:
    team1 = match.get("team1", "")
    team2 = match.get("team2", "")
    cricsheet_type = get_cricsheet_type(match.get("match_type", ""))

    # Try Supabase stats_cache first, then local Cricsheet CSVs
    team1_form = get_team_form_from_cache(team1, cricsheet_type)
    team2_form = get_team_form_from_cache(team2, cricsheet_type)
    h2h = get_h2h_from_cache(team1, team2, cricsheet_type)

    # Fall back to local Cricsheet if cache returned defaults
    if team1_form.get("matches_played", 0) == 0:
        try:
            team1_form = get_team_recent_form(team1, cricsheet_type)
        except FileNotFoundError:
            pass
    if team2_form.get("matches_played", 0) == 0:
        try:
            team2_form = get_team_recent_form(team2, cricsheet_type)
        except FileNotFoundError:
            pass
    if h2h.get("total_matches", 0) == 0:
        try:
            h2h = get_head_to_head(team1, team2, cricsheet_type)
        except FileNotFoundError:
            pass

    # Get player pools from local Cricsheet (no cache equivalent yet)
    try:
        team1_player_pool = get_recent_player_pool(team1, cricsheet_type)
        team2_player_pool = get_recent_player_pool(team2, cricsheet_type)
    except FileNotFoundError:
        team1_player_pool = []
        team2_player_pool = []

    has_stats = team1_form.get("matches_played", 0) > 0 or team2_form.get("matches_played", 0) > 0

    if not has_stats:
        return {
            "venue_name": None,
            "venue_confidence": "unknown",
            "possible_xi": {"team1": [], "team2": []},
            "player_updates": [],
            "expert_preview": (
                "No recent reputable source-backed updates or local historical data were found for this fixture yet. "
                "Venue, XI, and injury details should be treated as unavailable until a reliable source is found."
            ),
            "confidence": "low",
        }

    # Fetch confirmed squads for key battles
    match_id = match.get("match_id", "")
    team1_squad, team2_squad = get_match_squad_names(match_id) if match_id else ([], [])

    stats = {
        "team1_win_rate": team1_form.get("win_rate", 0.5),
        "team1_matches": team1_form.get("matches_played", 0),
        "team1_wins": team1_form.get("recent_wins", 0),
        "team2_win_rate": team2_form.get("win_rate", 0.5),
        "team2_matches": team2_form.get("matches_played", 0),
        "team2_wins": team2_form.get("recent_wins", 0),
        "h2h_total": h2h.get("total_matches", 0),
        "h2h_team1_wins": h2h.get("team1_wins", 0),
        "h2h_team2_wins": h2h.get("team2_wins", 0),
        "team1_player_pool": ", ".join(team1_player_pool) if team1_player_pool else "none",
        "team2_player_pool": ", ".join(team2_player_pool) if team2_player_pool else "none",
        "team1_squad": ", ".join(team1_squad) if team1_squad else "not available",
        "team2_squad": ", ".join(team2_squad) if team2_squad else "not available",
    }

    try:
        fallback = call_model_fallback(match, stats, espn_ctx=espn_ctx, recent_results_ctx=recent_results_ctx)
        venue_name = fallback.get("venue_name")
        venue_confidence = fallback.get("venue_confidence", "unknown")
        preview = fallback.get("expert_preview", "")
        toss_insight = fallback.get("toss_insight")
        possible_xi = filter_possible_xi_to_pools(
            fallback.get("possible_xi", {"team1": [], "team2": []}),
            team1_player_pool,
            team2_player_pool,
        )
        player_updates = fallback.get("player_updates", [])
        key_players = fallback.get("key_battles", fallback.get("key_players", []))
        # Filter battles to only include players from confirmed squads
        if team1_squad or team2_squad:
            all_squad = set(n.lower() for n in team1_squad + team2_squad)
            key_players = [
                b for b in key_players
                if (b.get("batter", b.get("name", "")).lower() in all_squad
                    or not all_squad)
                and (b.get("bowler", "").lower() in all_squad
                     or not b.get("bowler")
                     or not all_squad)
            ]
        confidence = fallback.get("confidence", "low")
    except Exception as exc:
        logger.warning(f"Model fallback failed: {exc}")
        venue_name = None
        venue_confidence = "unknown"
        toss_insight = None
        possible_xi = {"team1": [], "team2": []}
        player_updates = []
        key_players = []
        preview = (
            f"No recent reputable article-backed updates were found for this fixture. "
            f"Using stats cache: {team1} have won "
            f"{team1_form.get('recent_wins', 0)} of their last {team1_form.get('matches_played', 0)} "
            f"{match.get('match_type', '').upper()} matches, while {team2} have won "
            f"{team2_form.get('recent_wins', 0)} of their last {team2_form.get('matches_played', 0)}. "
            f"Their historical head-to-head has {h2h.get('total_matches', 0)} matches, "
            f"with {team1} winning {h2h.get('team1_wins', 0)} and {team2} winning {h2h.get('team2_wins', 0)}. "
            f"No source-backed XI or injury update is available yet."
        )
        confidence = "low"

    return {
        "venue_name": venue_name,
        "venue_confidence": venue_confidence,
        "toss_insight": toss_insight,
        "possible_xi": possible_xi,
        "player_updates": player_updates,
        "key_players": key_players,
        "expert_preview": preview,
        "confidence": confidence,
    }


def enrich_match(match: dict, source_limit: int) -> dict:
    match_id = match.get("match_id", "")

    # --- Fetch ESPN enrichment context ---
    espn_ctx_text = ""
    espn_event_id = _get_espn_event_id(match_id, match=match)
    espn_league_id = _get_espn_league_id(match_id)

    # Auto-discover ESPN event ID if not stored
    if not espn_event_id:
        try:
            from utils.espn import find_espn_event_id
            team1 = match.get("team1", "")
            team2 = match.get("team2", "")
            match_date = match.get("date", "")
            match_type = match.get("match_type", "")
            espn_event_id = find_espn_event_id(team1, team2, match_date, match_type)
            if espn_event_id:
                logger.info(f"  Auto-discovered ESPN event {espn_event_id} for {team1} vs {team2}")
                # Store on both tables for future use
                try:
                    client = get_client()
                    client.table("espn_match_data").upsert({
                        "match_id": match_id,
                        "espn_event_id": espn_event_id,
                    }, on_conflict="match_id").execute()
                    client.table("matches").update({
                        "espn_event_id": espn_event_id,
                    }).eq("match_id", match_id).execute()
                except Exception:
                    pass
        except Exception as e:
            logger.debug(f"  ESPN auto-discovery failed: {e}")

    if espn_event_id:
        logger.info(f"  Fetching ESPN context for event {espn_event_id}...")
        espn_ctx = get_espn_enrichment_context(espn_event_id, league_id=espn_league_id or "8039")
        espn_ctx_text = format_espn_context(espn_ctx)
        if espn_ctx_text:
            logger.info(f"  ESPN context: {len(espn_ctx_text)} chars "
                        f"(H2H={len(espn_ctx.get('h2h_results', []))}, "
                        f"news={len(espn_ctx.get('news', []))}, "
                        f"standings={len(espn_ctx.get('standings', []))})")
    else:
        logger.info(f"  No ESPN event ID — skipping ESPN context")

    # --- Fetch recent scored results from our DB ---
    recent_results_ctx = _build_recent_results_context(match)

    # --- Run enrichment (source-backed or model fallback) ---
    sources = search_sources(match, limit=source_limit)
    has_article_text = any(source.get("article_text") for source in sources)
    if sources and has_article_text:
        details = sanitize_source_backed_details(
            call_llm(match, sources, espn_ctx=espn_ctx_text, recent_results_ctx=recent_results_ctx),
            sources,
        )
    else:
        details = build_data_backed_details(match, espn_ctx=espn_ctx_text, recent_results_ctx=recent_results_ctx)

    # Overlay ESPN-verified venue if available (never trust AI for venues)
    espn_venue = _get_espn_venue(match_id)
    if espn_venue:
        details["venue_name"] = espn_venue
        details["venue_confidence"] = "confirmed"

    return {
        "match_id": match_id,
        "venue_name": details.get("venue_name"),
        "venue_confidence": details.get("venue_confidence", "unknown"),
        "toss_insight": details.get("toss_insight"),
        "possible_xi": details.get("possible_xi", {"team1": [], "team2": []}),
        "player_updates": details.get("player_updates", []),
        "key_players": details.get("key_battles", details.get("key_players", [])),
        "expert_preview": details.get("expert_preview", ""),
        "source_links": sources,
        "confidence": details.get("confidence", "low"),
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


def _get_espn_event_id(match_id: str, match: dict = None) -> Optional[str]:
    """Look up ESPN event ID — first from match record, then espn_match_data table."""
    # Check match record directly (new: espn_event_id on matches table)
    if match and match.get("espn_event_id"):
        return str(match["espn_event_id"])

    if not match_id:
        return None
    try:
        client = get_client()
        # Try matches table first
        r = client.table("matches").select("espn_event_id").eq("match_id", match_id).execute()
        if r.data and r.data[0].get("espn_event_id"):
            return str(r.data[0]["espn_event_id"])
        # Fall back to espn_match_data lookup table
        r = client.table("espn_match_data").select("espn_event_id").eq("match_id", match_id).execute()
        if r.data and r.data[0].get("espn_event_id"):
            return str(r.data[0]["espn_event_id"])
    except Exception:
        pass
    return None


def _get_espn_league_id(match_id: str) -> Optional[str]:
    """Look up ESPN league ID for a match. Returns None if not available."""
    # league_id isn't stored anywhere yet — return None to use default
    return None


def _build_recent_results_context(match: dict) -> str:
    """Build context string of recent scored results involving these teams."""
    team1 = match.get("team1", "").lower()
    team2 = match.get("team2", "").lower()

    try:
        recent = get_recent_results(days=14)
    except Exception:
        return ""

    if not recent:
        return ""

    # Filter to results involving either team in this match
    relevant = [
        r for r in recent
        if team1 in r["team1"].lower() or team1 in r["team2"].lower()
        or team2 in r["team1"].lower() or team2 in r["team2"].lower()
    ]

    if not relevant:
        return ""

    lines = ["Recent match results (from our scored predictions, last 14 days):"]
    for r in relevant[:8]:
        marker = "✓" if r["correct"] else "✗"
        lines.append(
            f"  {r['team1']} vs {r['team2']}: Winner = {r['actual_winner']} "
            f"(we predicted {r['predicted_winner']} {marker})"
        )
    return "\n".join(lines)


def _get_espn_venue(match_id: str) -> Optional[str]:
    """Look up ESPN-verified venue for a match from espn_match_data table."""
    if not match_id:
        return None
    try:
        client = get_client()
        r = client.table("espn_match_data").select("venue_name").eq("match_id", match_id).execute()
        if r.data and r.data[0].get("venue_name"):
            return r.data[0]["venue_name"]
    except Exception:
        pass
    return None


def main(limit: int, source_limit: int, match_id: Optional[str] = None) -> None:
    matches = [match for match in get_upcoming_matches() if is_future_match(match)]
    if match_id is not None:
        matches = [match for match in matches if match.get("match_id") == match_id]
    matches = sorted(matches, key=match_priority)
    matches = matches[:limit]
    logger.info(f"Enriching {len(matches)} upcoming matches")

    for match in matches:
        logger.info(f"Enriching {match['team1']} vs {match['team2']}")
        enrichment = enrich_match(match, source_limit=source_limit)
        store_match_enrichment(enrichment)

        # Backfill venue on the matches table if enrichment found one
        venue_name = enrichment.get("venue_name")
        if venue_name and not match.get("venue"):
            try:
                client = get_client()
                client.table("matches").update({"venue": venue_name}).eq(
                    "match_id", match["match_id"]
                ).execute()
                logger.info(f"  Backfilled venue: {venue_name}")
            except Exception as e:
                logger.warning(f"  Failed to backfill venue: {e}")

    logger.info("Enrichment run complete")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Enrich upcoming cricket matches from reputable web/news sources")
    parser.add_argument("--limit", type=int, default=5, help="Maximum matches to enrich")
    parser.add_argument("--source-limit", type=int, default=8, help="Maximum reputable sources per match")
    parser.add_argument("--match-id", help="Enrich one specific match ID")
    args = parser.parse_args()
    main(limit=args.limit, source_limit=args.source_limit, match_id=args.match_id)