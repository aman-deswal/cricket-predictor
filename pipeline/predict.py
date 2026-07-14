"""Generate match predictions using GitHub Models (GPT-4o)."""

import json
import logging
import os
from datetime import date

from openai import OpenAI

from utils.cricsheet import get_head_to_head, get_team_recent_form, get_venue_stats
from utils.db import get_upcoming_matches, store_prediction

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

PREDICTION_PROMPT = """You are an expert cricket analyst. Predict the outcome of the following cricket match.

**Match Details:**
- {team1} vs {team2}
- Format: {match_type}
- Venue: {venue}
- Date: {date}

**Team 1 ({team1}) Recent Form:**
- Win rate (last 10): {team1_win_rate:.1%}
- Recent matches played: {team1_matches}
- Recent wins: {team1_wins}

**Team 2 ({team2}) Recent Form:**
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

Based on all available information, predict the winner and provide win probabilities.

Respond in JSON format:
{{
    "predicted_winner": "<team name>",
    "team1_win_probability": <float 0-1>,
    "team2_win_probability": <float 0-1>,
    "confidence": "<low|medium|high>",
    "reasoning": "<2-3 sentence explanation>"
}}"""

NUM_ENSEMBLE_CALLS = 5
TEMPERATURE = 0.3
MODEL = "openai/gpt-4o"


def build_context(match: dict) -> dict:
    """Build statistical context for a match prediction."""
    team1 = match["team1"]
    team2 = match["team2"]
    venue = match.get("venue", "Unknown")
    match_type = match.get("match_type", "t20")

    # Map CricAPI match types to Cricsheet format
    cricsheet_type = "t20s" if "t20" in match_type.lower() else match_type.lower()

    team1_form = get_team_recent_form(team1, cricsheet_type)
    team2_form = get_team_recent_form(team2, cricsheet_type)
    h2h = get_head_to_head(team1, team2, cricsheet_type)
    venue_data = get_venue_stats(venue, cricsheet_type)

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

    return {
        "match_id": match["match_id"],
        "team1": context["team1"],
        "team2": context["team2"],
        "predicted_winner": predicted_winner,
        "team1_win_probability": round(avg_team1_prob, 4),
        "team2_win_probability": round(avg_team2_prob, 4),
        "confidence": predictions[0].get("confidence", "medium"),
        "reasoning": combined_reasoning,
        "model": MODEL,
        "ensemble_size": len(predictions),
    }


def main() -> None:
    """Generate predictions for today's upcoming matches."""
    today = date.today().isoformat()
    logger.info(f"Generating predictions for {today}...")

    matches = get_upcoming_matches(today)
    logger.info(f"Found {len(matches)} matches for today")

    for match in matches:
        logger.info(f"Predicting: {match['team1']} vs {match['team2']}")
        try:
            prediction = ensemble_predict(match)
            store_prediction(prediction)
            logger.info(
                f"  → {prediction['predicted_winner']} "
                f"({prediction['team1_win_probability']:.1%} / {prediction['team2_win_probability']:.1%})"
            )
        except Exception as e:
            logger.error(f"  Failed to predict {match['match_id']}: {e}")

    logger.info("Prediction run complete.")


if __name__ == "__main__":
    main()
