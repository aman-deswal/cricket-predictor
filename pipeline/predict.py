"""Generate match predictions using GitHub Models (GPT-4o)."""

import argparse
import json
import logging
import os
import sys
from datetime import datetime, timezone
from typing import Optional

from openai import OpenAI

from utils.cricsheet import get_head_to_head, get_team_recent_form, get_venue_stats
from utils.db import (
    get_client,
    get_h2h_from_cache,
    get_match_enrichment,
    get_prediction,
    get_team_form_from_cache,
    get_upcoming_matches,
    get_venue_from_cache,
    store_prediction,
    store_match_enrichment,
)
from utils.espn import get_espn_enrichment_context, format_espn_context
from enrich_matches import enrich_match

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

PREDICTION_PROMPT = """You are an expert cricket analyst. Predict the outcome of the following cricket match.

**Match Details:**
- {team1} vs {team2}
- Format: {match_type}
- Venue: {venue}
- Date: {date}

**Team 1 ({team1}) Recent Form (VERIFIED DATA — use these exact numbers):**
- Win rate (last 10): {team1_win_rate:.1%}
- Recent matches played: {team1_matches}
- Recent wins: {team1_wins}

**Team 2 ({team2}) Recent Form (VERIFIED DATA — use these exact numbers):**
- Win rate (last 10): {team2_win_rate:.1%}
- Recent matches played: {team2_matches}
- Recent wins: {team2_wins}

**Head-to-Head Record:**
- Total matches: {h2h_total}
- {team1} wins: {h2h_team1_wins}
- {team2} wins: {h2h_team2_wins}

**Venue Stats:**
- Matches at venue: {venue_matches}
- Toss-bat-first win rate: {toss_bat_win_rate:.1%}

**Source-backed Match Notes:**
{enrichment_notes}

**ESPN Cricinfo Context (H2H results, news, series data):**
{espn_context}

Based on all available information, predict the winner and provide win probabilities.
IMPORTANT: When referencing win rates in your reasoning, use the EXACT percentages provided above. Do not estimate or round differently.
Reference specific ESPN data (series scoreline, recent match results, key player form, injury/retirement news) in your reasoning to make it substantive and contextual.

Also analyze the toss factor for this specific match. Consider:
- Historical toss impact at this venue (pitch type, dew factor, day/night)
- Each team's preference and record when batting/bowling first
- Format-specific toss tendencies

Respond in JSON format:
{{
    "predicted_winner": "<team name>",
    "team1_win_probability": <float 0-1>,
    "team2_win_probability": <float 0-1>,
    "confidence": "<low|medium|high>",
    "reasoning": "<3-5 sentence analysis referencing specific data: series scoreline, recent match scores, key player form (names + stats), injury/retirement news, and venue conditions. Be specific, not generic.>",
    "toss_insight": "<single sentence: which team benefits more from winning the toss and what they should choose, with a percentage edge if possible>"
}}"""

NUM_ENSEMBLE_CALLS = int(os.getenv("NUM_ENSEMBLE_CALLS", "5"))
TEMPERATURE = 0.3
MODEL = "openai/gpt-4o"


def get_default_context_stats() -> tuple[dict, dict, dict, dict]:
    """Return neutral stats when historical data is unavailable."""
    team_form = {"win_rate": 0.5, "matches_played": 0, "recent_wins": 0}
    h2h = {"total_matches": 0, "team1_wins": 0, "team2_wins": 0}
    venue = {"matches_at_venue": 0, "toss_bat_first_win_rate": 0.5}
    return team_form, team_form, h2h, venue


def build_context(match: dict) -> dict:
    """Build statistical context for a match prediction."""
    team1 = match["team1"]
    team2 = match["team2"]
    venue = match.get("venue", "Unknown")
    match_type = match.get("match_type", "t20")

    # Map CricAPI match types to Cricsheet archive names.
    if "t20" in match_type.lower():
        cricsheet_type = "t20s"
    elif "odi" in match_type.lower():
        cricsheet_type = "odis"
    else:
        cricsheet_type = match_type.lower()

    try:
        team1_form = get_team_form_from_cache(team1, cricsheet_type)
        team2_form = get_team_form_from_cache(team2, cricsheet_type)
        h2h = get_h2h_from_cache(team1, team2, cricsheet_type)
        venue_data = get_venue_from_cache(venue, cricsheet_type)

        # If cache had no data for either team, try local Cricsheet CSVs as fallback
        if team1_form["matches_played"] == 0 and team2_form["matches_played"] == 0:
            raise LookupError("No cached stats found, trying local CSVs")
    except (LookupError, Exception):
        try:
            team1_form = get_team_recent_form(team1, cricsheet_type)
            team2_form = get_team_recent_form(team2, cricsheet_type)
            h2h = get_head_to_head(team1, team2, cricsheet_type)
            venue_data = get_venue_stats(venue, cricsheet_type)
        except FileNotFoundError as exc:
            logger.warning(f"Historical stats unavailable for {cricsheet_type}: {exc}")
            team1_form, team2_form, h2h, venue_data = get_default_context_stats()

    enrichment = get_match_enrichment(match["match_id"])
    enrichment_notes = "No source-backed enrichment available."
    if enrichment:
        player_updates = enrichment.get("player_updates") or []
        updates_text = "; ".join(
            update.get("status", "") for update in player_updates if update.get("status")
        ) or "No specific player updates found."
        enrichment_notes = (
            f"Venue: {enrichment.get('venue_name') or 'unknown'} "
            f"({enrichment.get('venue_confidence', 'unknown')}).\n"
            f"Player updates: {updates_text}\n"
            f"Preview: {enrichment.get('expert_preview') or 'No preview available.'}\n"
            f"Research confidence: {enrichment.get('confidence', 'low')}"
        )

    # Fetch ESPN enrichment context for richer reasoning
    espn_ctx = "No ESPN data available."
    espn_event_id = match.get("espn_event_id")
    if not espn_event_id:
        try:
            client = get_client()
            r = client.table("espn_match_data").select("espn_event_id").eq("match_id", match["match_id"]).execute()
            if r.data and r.data[0].get("espn_event_id"):
                espn_event_id = r.data[0]["espn_event_id"]
        except Exception:
            pass
    if espn_event_id:
        try:
            ctx = get_espn_enrichment_context(espn_event_id)
            formatted = format_espn_context(ctx)
            if formatted.strip():
                espn_ctx = formatted
                logger.info(f"  ESPN context for prediction: {len(espn_ctx)} chars")
        except Exception as exc:
            logger.warning(f"  Failed to get ESPN context: {exc}")

    return {
        "team1": team1,
        "team2": team2,
        "match_type": match_type,
        "venue": venue,
        "date": match.get("date", ""),
        "team1_win_rate": team1_form["win_rate"],
        "team1_matches": team1_form["matches_played"],
        "team1_wins": team1_form.get("recent_wins", 0),
        "team2_win_rate": team2_form["win_rate"],
        "team2_matches": team2_form["matches_played"],
        "team2_wins": team2_form.get("recent_wins", 0),
        "h2h_total": h2h["total_matches"],
        "h2h_team1_wins": h2h["team1_wins"],
        "h2h_team2_wins": h2h["team2_wins"],
        "venue_matches": venue_data.get("matches_at_venue", 0),
        "toss_bat_win_rate": venue_data.get("toss_bat_first_win_rate", 0.5),
        "enrichment_notes": enrichment_notes,
        "espn_context": espn_ctx,
    }


def call_openai(prompt: str) -> dict:
    """Make a single prediction call via GitHub Models API."""
    client = OpenAI(
        base_url="https://models.github.ai/inference",
        api_key=os.environ["GITHUB_TOKEN"],
    )
    response = client.chat.completions.create(
        model=MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=TEMPERATURE,
        response_format={"type": "json_object"},
    )
    content = response.choices[0].message.content
    return json.loads(content)


def ensemble_predict(match: dict) -> dict:
    """
    Generate ensemble prediction by calling OpenAI multiple times and averaging.

    Args:
        match: Match dict with team1, team2, venue, match_type, date

    Returns:
        Averaged prediction dict
    """
    context = build_context(match)
    prompt = PREDICTION_PROMPT.format(**context)

    predictions = []
    for i in range(NUM_ENSEMBLE_CALLS):
        try:
            pred = call_openai(prompt)
            predictions.append(pred)
            logger.info(f"  Call {i+1}/{NUM_ENSEMBLE_CALLS}: {pred.get('predicted_winner')} "
                       f"({pred.get('team1_win_probability', 0):.2f} / {pred.get('team2_win_probability', 0):.2f})")
        except Exception as e:
            logger.warning(f"  Call {i+1} failed: {e}")

    if not predictions:
        raise RuntimeError("All prediction calls failed")

    # Average probabilities
    avg_team1_prob = sum(p.get("team1_win_probability", 0.5) for p in predictions) / len(predictions)
    avg_team2_prob = sum(p.get("team2_win_probability", 0.5) for p in predictions) / len(predictions)

    # Normalize to sum to 1
    total = avg_team1_prob + avg_team2_prob
    avg_team1_prob /= total
    avg_team2_prob /= total

    predicted_winner = context["team1"] if avg_team1_prob > avg_team2_prob else context["team2"]

    # Collect reasoning from all calls
    reasonings = [p.get("reasoning", "") for p in predictions if p.get("reasoning")]
    combined_reasoning = reasonings[0] if reasonings else "No reasoning available."

    # Pick the longest (most detailed) toss insight
    toss_insights = [p.get("toss_insight", "") for p in predictions if p.get("toss_insight")]
    toss_insight = max(toss_insights, key=len) if toss_insights else None

    return {
        "match_id": match["match_id"],
        "team1": context["team1"],
        "team2": context["team2"],
        "predicted_winner": predicted_winner,
        "team1_win_probability": round(avg_team1_prob, 4),
        "team2_win_probability": round(avg_team2_prob, 4),
        "confidence": predictions[0].get("confidence", "medium"),
        "reasoning": combined_reasoning,
        "toss_insight": toss_insight,
        "model": MODEL,
        "ensemble_size": len(predictions),
    }


def parse_match_datetime(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def main(limit: Optional[int] = None, match_id: Optional[str] = None, force: bool = False) -> int:
    """Generate predictions for future upcoming matches."""
    logger.info("Generating predictions for future upcoming matches...")

    now = datetime.now(timezone.utc)
    matches = [
        match for match in get_upcoming_matches()
        if parse_match_datetime(match["date"]) > now
    ]
    if match_id:
        matches = [match for match in matches if match["match_id"] == match_id]
    if not force:
        matches = [match for match in matches if get_prediction(match["match_id"]) is None]
    if limit is not None:
        matches = matches[:limit]
    logger.info(f"Found {len(matches)} future upcoming matches")

    stored = 0
    for match in matches:
        logger.info(f"Predicting: {match['team1']} vs {match['team2']}")
        try:
            prediction = ensemble_predict(match)
            store_prediction(prediction)
            logger.info(
                f"  → {prediction['predicted_winner']} "
                f"({prediction['team1_win_probability']:.1%} / {prediction['team2_win_probability']:.1%})"
            )
            stored += 1
        except Exception as e:
            logger.error(f"  Failed to predict {match['match_id']}: {e}")

    logger.info(f"Prediction run complete. Stored {stored} predictions.")

    # Run enrichment for predicted matches (web research + LLM summary)
    logger.info("Running match enrichment...")
    enriched = 0
    for match in matches:
        try:
            existing = get_match_enrichment(match["match_id"])
            if existing and not force:
                continue
            logger.info(f"Enriching: {match['team1']} vs {match['team2']}")
            enrichment = enrich_match(match, source_limit=8)
            store_match_enrichment(enrichment)
            enriched += 1
        except Exception as e:
            logger.error(f"  Failed to enrich {match['match_id']}: {e}")
    logger.info(f"Enrichment complete. Enriched {enriched} matches.")

    return 0 if stored > 0 or not matches else 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate predictions for future upcoming matches")
    parser.add_argument("--limit", type=int, default=None, help="Maximum matches to predict")
    parser.add_argument("--match-id", default=None, help="Predict one specific match ID")
    parser.add_argument("--force", action="store_true", help="Regenerate predictions that already exist")
    args = parser.parse_args()
    sys.exit(main(limit=args.limit, match_id=args.match_id, force=args.force))
