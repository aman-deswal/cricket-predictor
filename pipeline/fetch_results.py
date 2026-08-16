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
CRICBUZZ_UPCOMING_RETIRE_GRACE = timedelta(hours=6)
DEFAULT_UPCOMING_RETIRE_GRACE = timedelta(hours=18)
DEFAULT_LIVE_RETIRE_GRACE = timedelta(hours=18)
MULTIDAY_LIVE_RETIRE_GRACE = timedelta(days=7)
MULTIDAY_MATCH_TYPES = {"test", "first-class", "first class", "firstclass"}


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


def _parse_match_datetime(value: object) -> Optional[datetime]:
    """Parse stored match timestamps into timezone-aware datetimes."""
    if not value or not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def _match_source(match: dict) -> str:
    match_id = str(match.get("match_id", "") or "")
    if "-" not in match_id:
        return "legacy"
    return match_id.split("-", 1)[0]


def _stale_retire_grace(match: dict) -> timedelta:
    status = str(match.get("status", "") or "").lower()
    if status == "live":
        match_type = str(match.get("match_type", "") or "").strip().lower()
        if match_type in MULTIDAY_MATCH_TYPES:
            return MULTIDAY_LIVE_RETIRE_GRACE
        return DEFAULT_LIVE_RETIRE_GRACE

    if _match_source(match) == "cricbuzz":
        return CRICBUZZ_UPCOMING_RETIRE_GRACE
    return DEFAULT_UPCOMING_RETIRE_GRACE


def _should_force_retire_stale_match(match: dict, now: datetime) -> bool:
    kickoff = _parse_match_datetime(match.get("date"))
    if kickoff is None:
        return False
    return kickoff + _stale_retire_grace(match) < now


def _parse_winner_flag(value: object) -> Optional[bool]:
    """Parse ESPN winner flags without treating non-empty strings as truthy."""
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized == "true":
            return True
        if normalized == "false":
            return False
    return None


def _espn_summary_competition(event_id: str, league_id: Optional[str] = None) -> tuple[Optional[dict], Optional[str]]:
    """Fetch the summary header competition, preferring the stored league when known."""
    league_candidates: list[str] = []
    for candidate in (league_id, DEFAULT_LEAGUE):
        normalized = str(candidate or "").strip()
        if normalized and normalized not in league_candidates:
            league_candidates.append(normalized)

    for candidate in league_candidates:
        try:
            url = ESPN_SUMMARY_URL.format(league_id=candidate)
            response = requests.get(url, params={"event": event_id}, timeout=15)
            if response.status_code != 200:
                continue
            data = response.json()
            competition = (data.get("header", {}).get("competitions") or [{}])[0]
            if competition:
                return competition, candidate
        except Exception as exc:
            logger.debug("ESPN summary failed for event %s in league %s: %s", event_id, candidate, exc)

    return None, None


def _espn_summary_status(event_id: str, league_id: Optional[str] = None) -> dict[str, Optional[str]]:
    """Fetch ESPN summary status, winner, and result text for one event."""
    competition, resolved_league_id = _espn_summary_competition(event_id, league_id)
    if not competition:
        return {
            "state": None,
            "winner": None,
            "result_text": None,
            "league_id": resolved_league_id,
        }

    competitors = competition.get("competitors", [])
    status = competition.get("status", {})
    status_type = status.get("type", {})
    status_desc = status_type.get("description", "")
    result_text = (
        status_type.get("shortDetail")
        or competition.get("note")
        or status.get("shortDetail")
    ) or None
    state = status_type.get("state") or None

    if status_desc in ("Abandoned", "No Result"):
        winner = "__no_result__"
    elif status_desc == "Result":
        winners = []
        for competitor in competitors:
            raw_flag = competitor.get("winner")
            parsed_flag = _parse_winner_flag(raw_flag)
            if raw_flag is not None and parsed_flag is None:
                logger.warning(
                    "ESPN summary event %s has malformed winner flag %r; skipping",
                    event_id,
                    raw_flag,
                )
                return {
                    "state": state,
                    "winner": None,
                    "result_text": result_text,
                    "league_id": resolved_league_id,
                }
            if parsed_flag is True:
                winners.append(competitor)

        if len(winners) != 1:
            logger.warning(
                "ESPN summary event %s has %d winning competitors; skipping",
                event_id,
                len(winners),
            )
            winner = None
        else:
            winner = winners[0].get("team", {}).get("displayName")
    else:
        winner = None

    return {
        "state": state,
        "winner": winner,
        "result_text": result_text,
        "league_id": resolved_league_id,
    }


def _espn_winner_from_summary(event_id: str, league_id: Optional[str] = None) -> tuple[Optional[str], Optional[str]]:
    """Fetch ESPN summary and extract winner + result text."""
    summary = _espn_summary_status(event_id, league_id)
    if not summary["winner"]:
        return None, None
    return summary["winner"], summary["result_text"]


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


def _correct_espn_event(client, event_id: str) -> bool:
    """Re-fetch and idempotently repair a previously scored ESPN event."""
    link_resp = (
        client.table("espn_match_data")
        .select("match_id,league_id")
        .eq("espn_event_id", event_id)
        .execute()
    )
    links = link_resp.data or []
    if len(links) != 1:
        logger.warning(
            "Correction for ESPN event %s requires exactly one linked match; found %d",
            event_id,
            len(links),
        )
        return False

    prediction_resp = (
        client.table("predictions")
        .select("*")
        .eq("match_id", links[0]["match_id"])
        .execute()
    )
    predictions = prediction_resp.data or []
    if len(predictions) != 1:
        logger.warning(
            "Correction for ESPN event %s requires exactly one prediction; found %d",
            event_id,
            len(predictions),
        )
        return False

    prediction = predictions[0]
    espn_winner, result_text = _espn_winner_from_summary(event_id, links[0].get("league_id"))
    if not espn_winner or espn_winner == "__no_result__":
        logger.warning("Correction for ESPN event %s found no valid winner", event_id)
        return False

    actual_winner = _match_espn_winner_to_prediction(espn_winner, prediction)
    if not actual_winner:
        return False

    _persist_score(client, prediction, actual_winner, result_text)
    logger.info("Corrected stored result for ESPN event %s", event_id)
    return True


def _finalize_stale_active_matches(client, now: datetime) -> dict[str, int]:
    """Finalize or retire stale active matches after their lifecycle should have advanced."""
    stale_resp = (
        client.table("matches")
        .select("match_id,team1,team2,date,status,match_type,espn_event_id")
        .in_("status", ["upcoming", "live"])
        .lt("date", now.isoformat())
        .execute()
    )
    stale_matches = stale_resp.data or []
    if not stale_matches:
        return {"authoritative": 0, "promoted": 0, "retired": 0}

    espn_links = {
        match["match_id"]: {
            "espn_event_id": match.get("espn_event_id"),
            "league_id": None,
        }
        for match in stale_matches
        if match.get("espn_event_id")
    }
    stale_match_ids = [
        match["match_id"] for match in stale_matches if match.get("match_id")
    ]
    if stale_match_ids:
        espn_resp = (
            client.table("espn_match_data")
            .select("match_id,espn_event_id,league_id")
            .in_("match_id", stale_match_ids)
            .execute()
        )
        for row in espn_resp.data or []:
            if row.get("espn_event_id"):
                espn_links[row["match_id"]] = {
                    "espn_event_id": row["espn_event_id"],
                    "league_id": row.get("league_id"),
                }

    authoritative = 0
    promoted = 0
    retired = 0
    for match in stale_matches:
        link = espn_links.get(match["match_id"], {})
        event_id = link.get("espn_event_id")
        league_id = link.get("league_id")
        if event_id:
            summary = _espn_summary_status(str(event_id), league_id)
            if summary["state"] == "in":
                if match.get("status") == "upcoming":
                    client.table("matches").update({
                        "status": "live",
                    }).eq("match_id", match["match_id"]).eq("status", "upcoming").execute()
                    logger.info(
                        "  Promoted overdue upcoming match to live from ESPN: %s vs %s",
                        match["team1"],
                        match["team2"],
                    )
                    promoted += 1
                continue

            espn_winner = summary["winner"]
            result_text = summary["result_text"]
            if espn_winner == "__no_result__":
                client.table("matches").update({
                    "status": "completed",
                    "winner": None,
                }).eq("match_id", match["match_id"]).execute()
                logger.info(
                    f"  Marked stale completed: {match['team1']} vs {match['team2']} — {result_text or 'No Result'}"
                )
                authoritative += 1
                continue

            if espn_winner:
                actual = _match_espn_winner_to_prediction(espn_winner, match)
                if actual:
                    client.table("matches").update({
                        "status": "completed",
                        "winner": actual,
                    }).eq("match_id", match["match_id"]).execute()
                    logger.info(
                        f"  Marked stale completed: {match['team1']} vs {match['team2']} → winner={actual}"
                    )
                    authoritative += 1
                    continue

        if not _should_force_retire_stale_match(match, now):
            continue

        client.table("matches").update({
            "status": "completed",
            "winner": None,
        }).eq("match_id", match["match_id"]).execute()
        logger.info(
            "  Retired stale %s fixture without authoritative result: %s vs %s (%s)",
            _match_source(match),
            match["team1"],
            match["team2"],
            match["status"],
        )
        retired += 1

    return {"authoritative": authoritative, "promoted": promoted, "retired": retired}


# ---------------------------------------------------------------------------
# Main scoring pipeline
# ---------------------------------------------------------------------------

def main(force: bool = False, correction_events: Optional[list[str]] = None) -> None:
    """Score all unscored predictions using ESPN (primary) + CricAPI (fallback)."""
    logger.info("Result scorer — checking for completed matches...")

    client = get_client()

    for event_id in correction_events or []:
        _correct_espn_event(client, event_id)

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
        finalized = _finalize_stale_active_matches(client, now)
        total_finalized = finalized["authoritative"] + finalized["promoted"] + finalized["retired"]
        logger.info(
            "Finalized %s stale active matches (%s authoritative, %s promoted live, %s retired without result)",
            total_finalized,
            finalized["authoritative"],
            finalized["promoted"],
            finalized["retired"],
        )
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
            match_time = _parse_match_datetime(date_str)
            if match_time is None:
                past_unscored.append(p)
                continue
            if match_time < now:
                past_unscored.append(p)
        except (ValueError, TypeError):
            past_unscored.append(p)

    logger.info(f"  {len(past_unscored)} are past their match date")

    if not past_unscored:
        logger.info("No past-date unscored predictions to check.")
        finalized = _finalize_stale_active_matches(client, now)
        total_finalized = finalized["authoritative"] + finalized["retired"]
        logger.info(
            "Finalized %s stale active matches (%s authoritative, %s retired without result)",
            total_finalized,
            finalized["authoritative"],
            finalized["retired"],
        )
        return

    # --- Phase 1: Score via ESPN (stored event IDs) ---
    espn_resp = client.table("espn_match_data").select("match_id,espn_event_id,league_id").execute()
    espn_map = {
        e["match_id"]: {
            "espn_event_id": e.get("espn_event_id"),
            "league_id": e.get("league_id"),
        }
        for e in espn_resp.data
    }

    scored = 0
    still_unscored = []

    for prediction in past_unscored:
        mid = prediction["match_id"]
        espn_link = espn_map.get(mid, {})
        espn_eid = espn_link.get("espn_event_id")
        espn_league_id = espn_link.get("league_id")

        if espn_eid:
            logger.info(f"Checking ESPN event {espn_eid} for {prediction['team1']} vs {prediction['team2']}...")
            espn_winner, result_text = _espn_winner_from_summary(str(espn_eid), espn_league_id)
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
                                    "league_id": espn_match.get("league_id"),
                                }).execute()
                        except Exception:
                            pass

                still_unscored = [p for p in still_unscored if p["match_id"] not in newly_scored]
                logger.info(f"ESPN phase 2 (header): scored {len(newly_scored)} more")
        except Exception as e:
            logger.warning(f"ESPN header scoring failed: {e}")

    finalized = _finalize_stale_active_matches(client, now)
    total_finalized = finalized["authoritative"] + finalized["promoted"] + finalized["retired"]
    logger.info(
        "Finalized %s stale active matches (%s authoritative, %s promoted live, %s retired without result)",
        total_finalized,
        finalized["authoritative"],
        finalized["promoted"],
        finalized["retired"],
    )
    logger.info(f"Total scored this run: {scored}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Score completed match predictions")
    parser.add_argument("--force", action="store_true", help="Re-score already scored predictions")
    parser.add_argument(
        "--correct-event",
        action="append",
        default=[],
        help="Idempotently re-fetch and repair a stored result by ESPN event ID",
    )
    args = parser.parse_args()
    main(force=args.force, correction_events=args.correct_event)
