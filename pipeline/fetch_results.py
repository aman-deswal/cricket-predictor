"""Fetch completed match results and score predictions.

Uses two sources to find match results:
1. **ESPN Cricinfo** (primary) — free, unlimited. Checks ESPN event IDs
   stored in ``espn_match_data`` and also tries to find events by team/date.
2. **CricAPI match_info** (fallback) — rate-limited to a small batch per run.

Also pulls results from CricAPI's ``cricScore`` endpoint which returns
recently completed matches without per-match API calls.
"""

import argparse
import json
import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Optional

import requests

from utils.cricapi import fetch_match_result
from utils.db import get_client

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

ESPN_SUMMARY_URL = "https://site.web.api.espn.com/apis/site/v2/sports/cricket/{league_id}/summary"
DEFAULT_LEAGUE = "8048"
MAX_CRICAPI_CALLS = 5


# ---------------------------------------------------------------------------
# Scoring helpers
# ---------------------------------------------------------------------------

def _score_prediction(prediction: dict, actual_winner: str) -> dict:
    """Score a prediction against the actual result."""
    predicted_winner = prediction["predicted_winner"]
    correct = predicted_winner == actual_winner

    if actual_winner == prediction["team1"]:
        brier = (prediction["team1_win_probability"] - 1.0) ** 2
    elif actual_winner == prediction["team2"]:
        brier = (prediction["team2_win_probability"] - 1.0) ** 2
    else:
        brier = None

    return {
        "prediction_id": prediction["match_id"],
        "match_id": prediction["match_id"],
        "predicted_winner": predicted_winner,
        "actual_winner": actual_winner,
        "correct": correct,
        "brier_score": brier,
        "predicted_probability": max(
            prediction["team1_win_probability"],
            prediction["team2_win_probability"],
        ),
        "scored_at": datetime.utcnow().isoformat(),
    }


def _persist_score(client, prediction: dict, actual_winner: str) -> bool:
    """Score, persist result, and mark prediction as scored. Returns True on success."""
    result = _score_prediction(prediction, actual_winner)

    client.table("prediction_results").upsert(
        result, on_conflict="prediction_id"
    ).execute()

    client.table("predictions").update({
        "scored_at": datetime.utcnow().isoformat(),
    }).eq("match_id", prediction["match_id"]).execute()

    client.table("matches").update({
        "status": "completed",
        "winner": actual_winner,
    }).eq("match_id", prediction["match_id"]).execute()

    correct_str = "✓" if result["correct"] else "✗"
    logger.info(
        f"  Scored: {prediction['team1']} vs {prediction['team2']} → "
        f"winner={actual_winner}, predicted={prediction['predicted_winner']} {correct_str}"
    )
    return True


# ---------------------------------------------------------------------------
# ESPN result fetching
# ---------------------------------------------------------------------------

def _normalize(name: str) -> str:
    """Normalize team name for fuzzy matching."""
    name = name.lower().strip()
    name = re.sub(r"\s*(women|men)\s*$", "", name)
    return name


def _espn_winner_from_summary(event_id: str, league_id: str = DEFAULT_LEAGUE) -> Optional[str]:
    """Fetch ESPN summary and extract winner. Returns team display name or None."""
    try:
        url = ESPN_SUMMARY_URL.format(league_id=league_id)
        r = requests.get(url, params={"event": event_id}, timeout=15)
        if r.status_code != 200:
            return None
        data = r.json()
        header = data.get("header", {})
        comps = header.get("competitions", [{}])[0].get("competitors", [])
        status = header.get("competitions", [{}])[0].get("status", {})

        # Only score if match is actually completed
        status_desc = status.get("type", {}).get("description", "")
        if status_desc not in ("Result", "Abandoned", "No Result"):
            return None

        for c in comps:
            if c.get("winner"):
                return c.get("team", {}).get("displayName")

        # Abandoned / No Result — no winner
        if status_desc in ("Abandoned", "No Result"):
            return "__no_result__"

        return None
    except Exception as e:
        logger.debug(f"ESPN summary failed for event {event_id}: {e}")
        return None


def _match_espn_winner_to_prediction(espn_winner: str, prediction: dict) -> Optional[str]:
    """Map ESPN winner name to prediction team name (fuzzy match)."""
    if espn_winner == "__no_result__":
        return None

    t1 = prediction["team1"]
    t2 = prediction["team2"]

    # Exact match
    if espn_winner == t1:
        return t1
    if espn_winner == t2:
        return t2

    # Normalized match
    norm_winner = _normalize(espn_winner)
    if norm_winner == _normalize(t1):
        return t1
    if norm_winner == _normalize(t2):
        return t2

    # Substring match (e.g. "England" in "England Women")
    if _normalize(t1) in norm_winner or norm_winner in _normalize(t1):
        return t1
    if _normalize(t2) in norm_winner or norm_winner in _normalize(t2):
        return t2

    logger.warning(
        f"  ESPN winner '{espn_winner}' doesn't match "
        f"'{t1}' or '{t2}' — skipping"
    )
    return None


# ---------------------------------------------------------------------------
# Main scoring pipeline
# ---------------------------------------------------------------------------

def main(force: bool = False) -> None:
    """Score all unscored predictions using ESPN (primary) + CricAPI (fallback)."""
    logger.info("Result scorer — checking for completed matches...")

    client = get_client()

    # Get unscored predictions
    response = (
        client.table("predictions")
        .select("*")
        .is_("scored_at", "null")
        .execute()
    )
    unscored = response.data
    logger.info(f"Found {len(unscored)} unscored predictions")

    if not unscored:
        return

    # Get match dates from matches table
    match_ids = [p["match_id"] for p in unscored]
    matches_resp = client.table("matches").select("match_id,date").in_("match_id", match_ids).execute()
    date_map = {m["match_id"]: m["date"] for m in matches_resp.data}

    # Filter to past matches only (date < now)
    now = datetime.now(timezone.utc)
    past_unscored = []
    for p in unscored:
        date_str = date_map.get(p["match_id"], "")
        if not date_str:
            past_unscored.append(p)
            continue
        try:
            match_time = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
            if match_time.tzinfo is None:
                match_time = match_time.replace(tzinfo=timezone.utc)
            if match_time < now:
                past_unscored.append(p)
        except (ValueError, TypeError):
            past_unscored.append(p)

    logger.info(f"  {len(past_unscored)} are past their match date")

    if not past_unscored:
        logger.info("No past-date unscored predictions to check.")
        return

    # --- Phase 1: Score via ESPN (stored event IDs) ---
    espn_resp = client.table("espn_match_data").select("match_id,espn_event_id").execute()
    espn_map = {e["match_id"]: e["espn_event_id"] for e in espn_resp.data}

    scored = 0
    still_unscored = []

    for prediction in past_unscored:
        mid = prediction["match_id"]
        espn_eid = espn_map.get(mid)

        if espn_eid:
            logger.info(f"Checking ESPN event {espn_eid} for {prediction['team1']} vs {prediction['team2']}...")
            espn_winner = _espn_winner_from_summary(str(espn_eid))
            if espn_winner and espn_winner != "__no_result__":
                mapped = _match_espn_winner_to_prediction(espn_winner, prediction)
                if mapped:
                    _persist_score(client, prediction, mapped)
                    scored += 1
                    continue
            elif espn_winner == "__no_result__":
                # Abandoned/No Result — mark as scored with no winner
                client.table("predictions").update({
                    "scored_at": datetime.utcnow().isoformat(),
                }).eq("match_id", mid).execute()
                logger.info(f"  {prediction['team1']} vs {prediction['team2']} — No Result (abandoned)")
                scored += 1
                continue

        still_unscored.append(prediction)

    logger.info(f"ESPN phase 1 (stored IDs): scored {scored} predictions")

    # --- Phase 2: Try ESPN header for remaining matches ---
    if still_unscored:
        logger.info(f"Phase 2: Checking ESPN header for {len(still_unscored)} remaining...")
        try:
            from utils.espn import get_espn_fixtures, match_espn_to_cricapi
            espn_fixtures = get_espn_fixtures()
            completed_espn = [f for f in espn_fixtures if f.get("status") == "post" and f.get("winner")]

            if completed_espn:
                # Try to match remaining unscored predictions to ESPN completed fixtures
                mapping = match_espn_to_cricapi(completed_espn, [
                    {"match_id": p["match_id"], "team1": p["team1"], "team2": p["team2"],
                     "date": date_map.get(p["match_id"], "")}
                    for p in still_unscored
                ])

                newly_scored = []
                for prediction in still_unscored:
                    mid = prediction["match_id"]
                    espn_eid = mapping.get(mid)
                    if not espn_eid:
                        continue

                    # Find the ESPN fixture to get the winner
                    espn_match = next((f for f in completed_espn if f["espn_event_id"] == espn_eid), None)
                    if not espn_match or not espn_match.get("winner"):
                        continue

                    mapped = _match_espn_winner_to_prediction(espn_match["winner"], prediction)
                    if mapped:
                        _persist_score(client, prediction, mapped)
                        scored += 1
                        newly_scored.append(mid)

                        # Also store the ESPN event ID for future use
                        try:
                            existing = client.table("espn_match_data").select("match_id").eq("match_id", mid).execute()
                            if not existing.data:
                                client.table("espn_match_data").insert({
                                    "match_id": mid,
                                    "espn_event_id": espn_eid,
                                }).execute()
                        except Exception:
                            pass

                still_unscored = [p for p in still_unscored if p["match_id"] not in newly_scored]
                logger.info(f"ESPN phase 2 (header): scored {len(newly_scored)} more")
        except Exception as e:
            logger.warning(f"ESPN header scoring failed: {e}")

    # --- Phase 3: Score via CricAPI match_info (fallback, limited) ---
    if still_unscored:
        batch = still_unscored[:MAX_CRICAPI_CALLS]
        logger.info(f"CricAPI fallback: checking {len(batch)} of {len(still_unscored)} remaining...")

        for prediction in batch:
            mid = prediction["match_id"]
            try:
                result = fetch_match_result(mid)
            except Exception as e:
                logger.debug(f"CricAPI error for {mid}: {e}")
                continue

            if result and result.get("winner"):
                _persist_score(client, prediction, result["winner"])
                scored += 1

    logger.info(f"Total scored this run: {scored}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Score completed match predictions")
    parser.add_argument("--force", action="store_true", help="Re-score already scored predictions")
    args = parser.parse_args()
    main(force=args.force)
