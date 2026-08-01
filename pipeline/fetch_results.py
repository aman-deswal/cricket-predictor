"""Fetch completed match results and score predictions.

Uses ESPN Cricinfo exclusively — free, unlimited. Checks stored ESPN event IDs
and the live ESPN header for completed matches.
"""

import argparse
import json
import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Optional

import requests

from utils.db import get_client

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

ESPN_SUMMARY_URL = "https://site.web.api.espn.com/apis/site/v2/sports/cricket/{league_id}/summary"
DEFAULT_LEAGUE = "8048"


# ---------------------------------------------------------------------------
# Scoring helpers
# ---------------------------------------------------------------------------

def _score_prediction(prediction: dict, actual_winner: str, result_text: Optional[str] = None) -> dict:
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
        "result_text": result_text,
        "scored_at": datetime.utcnow().isoformat(),
    }


def _persist_score(client, prediction: dict, actual_winner: str, result_text: Optional[str] = None) -> bool:
    """Score, persist result, and mark prediction as scored. Returns True on success."""
    result = _score_prediction(prediction, actual_winner, result_text)

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


def _espn_winner_from_summary(event_id: str, league_id: str = DEFAULT_LEAGUE) -> tuple[Optional[str], Optional[str]]:
    """Fetch ESPN summary and extract winner + result text.
    Returns (team_display_name, result_text) or (None, None).
    result_text is e.g. 'India won by 47 runs' from ESPN's status note.
    """
    try:
        url = ESPN_SUMMARY_URL.format(league_id=league_id)
        r = requests.get(url, params={"event": event_id}, timeout=15)
        if r.status_code != 200:
            return None, None
        data = r.json()
        header = data.get("header", {})
        comp = header.get("competitions", [{}])[0]
        comps = comp.get("competitors", [])
        status = comp.get("status", {})

        # Only score if match is actually completed
        status_desc = status.get("type", {}).get("description", "")
        if status_desc not in ("Result", "Abandoned", "No Result"):
            return None, None

        # ESPN puts the result margin in status.type.shortDetail or comp.note
        result_text = (
            status.get("type", {}).get("shortDetail")
            or comp.get("note")
            or status.get("shortDetail")
        ) or None

        for c in comps:
            if c.get("winner"):
                return c.get("team", {}).get("displayName"), result_text

        # Abandoned / No Result — no winner
        if status_desc in ("Abandoned", "No Result"):
            return "__no_result__", result_text or status_desc

        return None, None
    except Exception as e:
        logger.debug(f"ESPN summary failed for event {event_id}: {e}")
        return None, None


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


def _mark_stale_upcoming_completed(client, now: datetime) -> int:
    """Finalize stale upcoming matches from stored ESPN event IDs without scoring."""
    stale_resp = (
        client.table("matches")
        .select("match_id,team1,team2,date,espn_event_id")
        .eq("status", "upcoming")
        .lt("date", now.isoformat())
        .execute()
    )
    stale_matches = stale_resp.data or []
    if not stale_matches:
        return 0

    event_ids = {
        match["match_id"]: match.get("espn_event_id")
        for match in stale_matches
        if match.get("espn_event_id")
    }
    missing_event_match_ids = [
        match["match_id"] for match in stale_matches if not event_ids.get(match["match_id"])
    ]
    if missing_event_match_ids:
        espn_resp = (
            client.table("espn_match_data")
            .select("match_id,espn_event_id")
            .in_("match_id", missing_event_match_ids)
            .execute()
        )
        for row in espn_resp.data or []:
            if row.get("espn_event_id"):
                event_ids[row["match_id"]] = row["espn_event_id"]

    marked = 0
    for match in stale_matches:
        event_id = event_ids.get(match["match_id"])
        if not event_id:
            logger.info(
                f"  Stale upcoming {match['team1']} vs {match['team2']} has no ESPN event ID; leaving unchanged"
            )
            continue

        espn_winner, result_text = _espn_winner_from_summary(str(event_id))
        if espn_winner == "__no_result__":
            client.table("matches").update({
                "status": "completed",
                "winner": None,
            }).eq("match_id", match["match_id"]).execute()
            logger.info(
                f"  Marked stale completed: {match['team1']} vs {match['team2']} — {result_text or 'No Result'}"
            )
            marked += 1
            continue

        if not espn_winner:
            continue

        actual = _match_espn_winner_to_prediction(espn_winner, match)
        if not actual:
            continue

        client.table("matches").update({
            "status": "completed",
            "winner": actual,
        }).eq("match_id", match["match_id"]).execute()
        logger.info(
            f"  Marked stale completed: {match['team1']} vs {match['team2']} → winner={actual}"
        )
        marked += 1

    return marked


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

    now = datetime.now(timezone.utc)

    if not unscored:
        finalized = _mark_stale_upcoming_completed(client, now)
        logger.info(f"Marked {finalized} stale upcoming matches completed")
        return

    # Get match dates from matches table
    match_ids = [p["match_id"] for p in unscored]
    matches_resp = client.table("matches").select("match_id,date").in_("match_id", match_ids).execute()
    date_map = {m["match_id"]: m["date"] for m in matches_resp.data}

    # Filter to past matches only (date < now)
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
        finalized = _mark_stale_upcoming_completed(client, now)
        logger.info(f"Marked {finalized} stale upcoming matches completed")
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
            espn_winner, result_text = _espn_winner_from_summary(str(espn_eid))
            if espn_winner and espn_winner != "__no_result__":
                mapped = _match_espn_winner_to_prediction(espn_winner, prediction)
                if mapped:
                    _persist_score(client, prediction, mapped, result_text)
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
                        _persist_score(client, prediction, mapped, espn_match.get("result_text"))
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

    finalized = _mark_stale_upcoming_completed(client, now)
    logger.info(f"Marked {finalized} stale upcoming matches completed")
    logger.info(f"Total scored this run: {scored}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Score completed match predictions")
    parser.add_argument("--force", action="store_true", help="Re-score already scored predictions")
    args = parser.parse_args()
    main(force=args.force)
