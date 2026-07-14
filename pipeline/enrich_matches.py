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
from utils.db import get_upcoming_matches, store_match_enrichment

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

ENRICHMENT_PROMPT = """You are a careful cricket research assistant. Use only the source snippets below.

Match:
- {team1} vs {team2}
- Format: {match_type}
- Date: {date}
- Series or venue: {venue}

Sources:
{sources}

Return JSON with this shape:
{{
  "venue_name": string | null,
  "venue_confidence": "confirmed" | "reported" | "unknown",
    "possible_xi": {{"team1": string[], "team2": string[]}},
  "player_updates": [{{"player": string, "team": string, "status": string, "confidence": "confirmed" | "reported" | "speculative", "source_index": number}}],
  "expert_preview": string,
  "confidence": "high" | "medium" | "low"
}}

Rules:
- Do not invent injuries, availability, venue, squads, or playing XIs.
- If sources do not support a field, use null, empty arrays, or say that no reliable update was found.
- Keep expert_preview to 3-5 sentences and mention uncertainty when sources are thin.
- Use source_index values from the source list for player updates.
- Prefer article body text over headlines. Headlines alone are not enough for venue, XI, or injury claims.
- For possible_xi, include only players explicitly named in source-backed squad, probable XI, or playing XI material. Do not imply they are a confirmed playing XI unless the source says so.
- Do not discuss unrelated matches, unrelated teams, or generic cricket news.
"""

MODEL_FALLBACK_PROMPT = """You are a cricket analyst. You do not have live web access in this call.

Use only the fixture details and historical Cricsheet stats below. Do not invent venue, injuries, squads, or playing XIs.

Match:
- {team1} vs {team2}
- Format: {match_type}
- Date: {date}
- Series or venue field from fixture API: {venue}

Historical stats:
- {team1} recent form: {team1_wins} wins in last {team1_matches} matches, win rate {team1_win_rate:.1%}
- {team2} recent form: {team2_wins} wins in last {team2_matches} matches, win rate {team2_win_rate:.1%}
- Head-to-head: {h2h_total} matches, {team1} {h2h_team1_wins} wins, {team2} {h2h_team2_wins} wins

Recent Cricsheet player pools:
- {team1}: {team1_player_pool}
- {team2}: {team2_player_pool}

Return JSON with this shape:
{{
    "venue_name": string | null,
    "venue_confidence": "unknown",
    "expert_preview": string,
    "possible_xi": {{"team1": string[], "team2": string[]}},
    "player_updates": [{{"player": string, "team": string, "status": string, "confidence": "speculative"}}],
    "confidence": "medium" | "low"
}}

Rules:
- The preview must clearly say it is based on historical data, not live team news.
- Use general cricket knowledge and fixture context to estimate the match-detail panel.
- venue_name may be set only if the venue is well-known from the fixture context in model knowledge; otherwise use null. venue_confidence must be "unknown".
- possible_xi should contain recent-player candidates only, not a confirmed squad or playing XI.
- Select possible_xi names only from the Recent Cricsheet player pools above. If a pool is empty, return an empty array for that team.
- player_updates should be empty unless there is a widely known, non-live context note. Do not invent fresh injuries or availability news.
- Do not include players who are not listed in the relevant team pool.
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
    if not venue_name or not text_mentions(venue_name, corpus):
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


def call_llm(match: dict, sources: list[dict]) -> dict:
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
    )
    response = client.chat.completions.create(
        model=MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.1,
        response_format={"type": "json_object"},
    )
    return json.loads(response.choices[0].message.content)


def call_model_fallback(match: dict, stats: dict) -> dict:
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


def build_data_backed_details(match: dict) -> dict:
    team1 = match.get("team1", "")
    team2 = match.get("team2", "")
    cricsheet_type = get_cricsheet_type(match.get("match_type", ""))

    try:
        team1_form = get_team_recent_form(team1, cricsheet_type)
        team2_form = get_team_recent_form(team2, cricsheet_type)
        h2h = get_head_to_head(team1, team2, cricsheet_type)
        team1_player_pool = get_recent_player_pool(team1, cricsheet_type)
        team2_player_pool = get_recent_player_pool(team2, cricsheet_type)
        stats = {
            "team1_win_rate": team1_form["win_rate"],
            "team1_matches": team1_form["matches_played"],
            "team1_wins": team1_form.get("recent_wins", 0),
            "team2_win_rate": team2_form["win_rate"],
            "team2_matches": team2_form["matches_played"],
            "team2_wins": team2_form.get("recent_wins", 0),
            "h2h_total": h2h["total_matches"],
            "h2h_team1_wins": h2h["team1_wins"],
            "h2h_team2_wins": h2h["team2_wins"],
            "team1_player_pool": ", ".join(team1_player_pool) or "none",
            "team2_player_pool": ", ".join(team2_player_pool) or "none",
        }
        try:
            fallback = call_model_fallback(match, stats)
            venue_name = fallback.get("venue_name")
            venue_confidence = fallback.get("venue_confidence", "unknown")
            preview = fallback.get("expert_preview", "")
            possible_xi = filter_possible_xi_to_pools(
                fallback.get("possible_xi", {"team1": [], "team2": []}),
                team1_player_pool,
                team2_player_pool,
            )
            player_updates = fallback.get("player_updates", [])
            confidence = fallback.get("confidence", "low")
        except Exception as exc:
            logger.warning(f"Model fallback failed: {exc}")
            venue_name = None
            venue_confidence = "unknown"
            possible_xi = {"team1": [], "team2": []}
            player_updates = []
            preview = (
                f"No recent reputable article-backed updates were found for this fixture. "
                f"Using Cricsheet history instead: {team1} have won "
                f"{team1_form.get('recent_wins', 0)} of their last {team1_form.get('matches_played', 0)} "
                f"{match.get('match_type', '').upper()} matches, while {team2} have won "
                f"{team2_form.get('recent_wins', 0)} of their last {team2_form.get('matches_played', 0)}. "
                f"Their historical head-to-head sample has {h2h.get('total_matches', 0)} matches, "
                f"with {team1} winning {h2h.get('team1_wins', 0)} and {team2} winning {h2h.get('team2_wins', 0)}. "
                f"No source-backed XI or injury update is available yet."
            )
            confidence = "low"
    except FileNotFoundError:
        venue_name = None
        venue_confidence = "unknown"
        possible_xi = {"team1": [], "team2": []}
        player_updates = []
        preview = (
            "No recent reputable source-backed updates or local historical data were found for this fixture yet. "
            "Venue, XI, and injury details should be treated as unavailable until a reliable source is found."
        )
        confidence = "low"

    return {
        "venue_name": venue_name,
        "venue_confidence": venue_confidence,
        "possible_xi": possible_xi,
        "player_updates": player_updates,
        "expert_preview": preview,
        "confidence": confidence,
    }


def enrich_match(match: dict, source_limit: int) -> dict:
    sources = search_sources(match, limit=source_limit)
    has_article_text = any(source.get("article_text") for source in sources)
    if sources and has_article_text:
        details = sanitize_source_backed_details(call_llm(match, sources), sources)
    else:
        details = build_data_backed_details(match)

    return {
        "match_id": match["match_id"],
        "venue_name": details.get("venue_name"),
        "venue_confidence": details.get("venue_confidence", "unknown"),
        "possible_xi": details.get("possible_xi", {"team1": [], "team2": []}),
        "player_updates": details.get("player_updates", []),
        "expert_preview": details.get("expert_preview", ""),
        "source_links": sources,
        "confidence": details.get("confidence", "low"),
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


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

    logger.info("Enrichment run complete")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Enrich upcoming cricket matches from reputable web/news sources")
    parser.add_argument("--limit", type=int, default=5, help="Maximum matches to enrich")
    parser.add_argument("--source-limit", type=int, default=8, help="Maximum reputable sources per match")
    parser.add_argument("--match-id", help="Enrich one specific match ID")
    args = parser.parse_args()
    main(limit=args.limit, source_limit=args.source_limit, match_id=args.match_id)