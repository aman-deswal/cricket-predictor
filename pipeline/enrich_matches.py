"""Enrich upcoming matches with source-backed LLM research notes."""

import argparse
import email.utils
import json
import logging
import os
import urllib.parse
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from typing import Optional

import requests
from openai import OpenAI

from utils.db import get_upcoming_matches, store_match_enrichment

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

MODEL = "openai/gpt-4o"
SEARCH_URL = "https://news.google.com/rss/search"
REPUTABLE_SOURCES = {
    "BBC Sport",
    "Cricbuzz",
    "ESPNcricinfo",
    "ICC",
    "The Cricketer",
    "Wisden",
}

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


def build_query(match: dict) -> str:
    parts = [
        match.get("team1", ""),
        match.get("team2", ""),
        match.get("venue", ""),
        "cricket preview squad injury possible XI venue",
    ]
    return " ".join(part for part in parts if part).strip()


def search_sources(query: str, limit: int = 8) -> list[dict]:
    response = requests.get(
        SEARCH_URL,
        params={"q": query, "hl": "en", "gl": "US", "ceid": "US:en"},
        timeout=30,
    )
    response.raise_for_status()
    root = ET.fromstring(response.content)

    sources = []
    for item in root.findall("./channel/item"):
        source_node = item.find("source")
        source_name = source_node.text if source_node is not None else "Unknown"
        if source_name not in REPUTABLE_SOURCES:
            continue

        published = item.findtext("pubDate", "")
        sources.append({
            "title": item.findtext("title", ""),
            "url": item.findtext("link", ""),
            "source": source_name,
            "published_at": email.utils.parsedate_to_datetime(published).isoformat() if published else None,
            "snippet": item.findtext("description", ""),
        })
        if len(sources) >= limit:
            break

    return sources


def format_sources(sources: list[dict]) -> str:
    if not sources:
        return "No reputable sources found."
    return "\n".join(
        f"[{index}] {source['source']} - {source['title']}\n"
        f"URL: {source['url']}\n"
        f"Published: {source['published_at']}\n"
        f"Snippet: {source['snippet']}"
        for index, source in enumerate(sources, start=1)
    )


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


def enrich_match(match: dict, source_limit: int) -> dict:
    sources = search_sources(build_query(match), limit=source_limit)
    if sources:
        details = call_llm(match, sources)
    else:
        details = {
            "venue_name": None,
            "venue_confidence": "unknown",
            "possible_xi": {"team1": [], "team2": []},
            "player_updates": [],
            "expert_preview": "No recent reputable source-backed updates were found for this fixture yet.",
            "confidence": "low",
        }

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


def main(limit: int, source_limit: int) -> None:
    matches = [match for match in get_upcoming_matches() if is_future_match(match)]
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
    args = parser.parse_args()
    main(limit=args.limit, source_limit=args.source_limit)