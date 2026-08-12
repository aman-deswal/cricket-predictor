"""Generate deterministic match predictions with optional AI garnish downstream."""

import argparse
import json
import logging
import re
import sys
from math import exp
from datetime import datetime, timezone
from typing import Any, Optional

from utils.cricsheet import get_head_to_head, get_team_recent_form, get_venue_stats
from utils.db import (
    get_client,
    get_h2h_from_cache,
    get_match_enrichment,
    get_latest_prediction_snapshot,
    get_prediction,
    get_team_form_from_cache,
    get_upcoming_matches,
    get_venue_from_cache,
    store_prediction,
    store_prediction_snapshot,
    store_match_enrichment,
)
from fetch_squads import fetch_and_store_squads
from fetch_player_stats import fetch_stats_for_match_squads
from utils.espn import get_espn_enrichment_context, format_espn_context
from utils.edge_score import compute_edge_score, format_edge_for_prompt
from enrich_matches import enrich_match

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

def get_default_context_stats() -> tuple[dict, dict, dict, dict]:
    """Return neutral stats when historical data is unavailable."""
    team_form = {"win_rate": 0.5, "matches_played": 0, "recent_wins": 0}
    h2h = {"total_matches": 0, "team1_wins": 0, "team2_wins": 0}
    venue = {"matches_at_venue": 0, "toss_bat_first_win_rate": 0.5}
    return team_form, team_form, h2h, venue


def _normalize_team_key(name: str) -> str:
    normalized = name.lower().replace("&", "and")
    normalized = re.sub(r"\((men|women)\)", r" \1 ", normalized)
    normalized = re.sub(r"[^a-z0-9]+", " ", normalized)
    return re.sub(r"\s+", " ", normalized).strip()


def _team_matches(candidate: str, expected: str) -> bool:
    candidate_key = _normalize_team_key(candidate)
    expected_key = _normalize_team_key(expected)
    return bool(candidate_key and expected_key) and (
        candidate_key == expected_key
        or candidate_key in expected_key
        or expected_key in candidate_key
    )


def _parse_json_array(value: Any) -> list[dict]:
    if isinstance(value, list):
        return [item for item in value if isinstance(item, dict)]
    if isinstance(value, str) and value.strip():
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError:
            return []
        if isinstance(parsed, list):
            return [item for item in parsed if isinstance(item, dict)]
    return []


def _stored_h2h_to_edge_results(stored_h2h: list[dict]) -> list[dict]:
    results = []
    for game in stored_h2h:
        teams = game.get("teams") or []
        if not isinstance(teams, list) or len(teams) < 2:
            continue
        winner = next((team for team in teams if isinstance(team, dict) and team.get("winner")), None)
        results.append({
            "date": game.get("date", ""),
            "team1": teams[0].get("name", ""),
            "team2": teams[1].get("name", ""),
            "score1": teams[0].get("score", ""),
            "score2": teams[1].get("score", ""),
            "winner": winner.get("name", "") if winner else "",
            "status": game.get("note", ""),
        })
    return results


def _h2h_counts_from_espn(results: list[dict], team1: str, team2: str) -> Optional[dict]:
    if not results:
        return None

    team1_wins = 0
    team2_wins = 0
    counted = 0
    for game in results:
        winner = game.get("winner", "")
        if not winner:
            continue
        if _team_matches(winner, team1):
            team1_wins += 1
            counted += 1
        elif _team_matches(winner, team2):
            team2_wins += 1
            counted += 1

    if counted == 0:
        return None

    return {
        "total_matches": counted,
        "team1_wins": team1_wins,
        "team2_wins": team2_wins,
    }


def _store_edge_score(match_id: str, edge: dict) -> None:
    """Store edge score in Supabase match_edge_scores table."""
    try:
        client = get_client()
        row = {
            "match_id": match_id,
            "team1_score": edge["team1_score"],
            "team2_score": edge["team2_score"],
            "net_edge": edge["net_edge"],
            "edge_team": edge["edge_team"],
            "narrative": edge["narrative"],
            "factors": edge["factors"],
        }
        client.table("match_edge_scores").upsert(row, on_conflict="match_id").execute()
        if edge["edge_team"]:
            logger.info(f"  Edge score stored: {edge['edge_team']} +{abs(edge['net_edge']):.0f}")
        else:
            logger.info("  Edge score stored: no clear edge")
    except Exception as exc:
        logger.warning(f"  Failed to store edge score: {exc}")


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
    espn_h2h_results: list = []
    espn_series_scoreline = ""
    h2h_source = "cricsheet"
    espn_event_id = match.get("espn_event_id")
    stored_espn_h2h: list[dict] = []
    try:
        client = get_client()
        r = (
            client.table("espn_match_data")
            .select("espn_event_id,series_scoreline,head_to_head")
            .eq("match_id", match["match_id"])
            .execute()
        )
        if r.data:
            row = r.data[0]
            espn_event_id = espn_event_id or row.get("espn_event_id")
            espn_series_scoreline = row.get("series_scoreline") or ""
            stored_espn_h2h = _parse_json_array(row.get("head_to_head"))
            espn_h2h_results = _stored_h2h_to_edge_results(stored_espn_h2h)
            if espn_h2h_results:
                h2h_source = "espn"
    except Exception as exc:
        logger.warning(f"  Failed to read stored ESPN context: {exc}")

    if espn_event_id:
        try:
            ctx = get_espn_enrichment_context(espn_event_id)
            formatted = format_espn_context(ctx)
            if formatted.strip():
                espn_ctx = formatted
                logger.info(f"  ESPN context for prediction: {len(espn_ctx)} chars")
            live_h2h = ctx.get("h2h_results", [])
            if live_h2h:
                espn_h2h_results = live_h2h
                h2h_source = "espn"
        except Exception as exc:
            logger.warning(f"  Failed to get ESPN context: {exc}")

    espn_h2h = _h2h_counts_from_espn(espn_h2h_results, team1, team2)
    if espn_h2h and espn_h2h["total_matches"] > h2h.get("total_matches", 0):
        h2h = espn_h2h
        logger.info(
            "  Using ESPN H2H: %s %s-%s %s across %s matches",
            team1,
            h2h["team1_wins"],
            h2h["team2_wins"],
            team2,
            h2h["total_matches"],
        )

    # Fetch latest sportsbook odds
    odds_data = None
    odds_context = "No sportsbook odds available."
    try:
        client = get_client()
        r = (
            client.table("match_odds")
            .select("team1_odds,team2_odds,bookmaker,fetched_at")
            .eq("match_id", match["match_id"])
            .order("fetched_at", desc=True)
            .limit(1)
            .execute()
        )
        if r.data:
            odds_row = r.data[0]
            odds_data = {
                "team1_odds": odds_row["team1_odds"],
                "team2_odds": odds_row["team2_odds"],
                "bookmaker": odds_row.get("bookmaker"),
                "fetched_at": odds_row.get("fetched_at"),
            }
            t1_implied = (1.0 / odds_row["team1_odds"] * 100) if odds_row["team1_odds"] else 0
            t2_implied = (1.0 / odds_row["team2_odds"] * 100) if odds_row["team2_odds"] else 0
            odds_context = (
                f"{team1}: {odds_row['team1_odds']:.2f} (implied {t1_implied:.0f}%)  |  "
                f"{team2}: {odds_row['team2_odds']:.2f} (implied {t2_implied:.0f}%)\n"
                f"Source: {odds_row.get('bookmaker', 'unknown')} @ {odds_row.get('fetched_at', '')[:16]}"
            )
            logger.info(f"  Odds: {team1} {odds_row['team1_odds']:.2f} / {team2} {odds_row['team2_odds']:.2f}")
    except Exception as exc:
        logger.warning(f"  Failed to fetch odds: {exc}")

    # Compute SixSense Edge Score™
    edge = compute_edge_score(
        team1=team1,
        team2=team2,
        team1_form=team1_form,
        team2_form=team2_form,
        espn_h2h=espn_h2h_results,
        series_scoreline=espn_series_scoreline,
        match_type=match_type,
        odds=odds_data,
    )
    edge_score_context = format_edge_for_prompt(edge, team1, team2)
    logger.info(f"  Edge Score: {team1} {edge['team1_score']:.0f} / {team2} {edge['team2_score']:.0f} (net: {edge['edge_team']} +{abs(edge['net_edge']):.0f})")

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
        "edge_score_context": edge_score_context,
        "odds_context": odds_context,
        "odds_data": odds_data,
        "series_scoreline": espn_series_scoreline,
        "h2h_source": h2h_source,
        "edge_score": edge,
    }


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def _probability_from_edge(context: dict) -> tuple[float, float]:
    """Convert the structured edge score into a calibrated probability pair.

    The edge score already blends form, momentum, pressure, and market signal.
    We convert the net edge into a probability while damping confidence when the
    recent-data sample is thin.
    """
    edge = context["edge_score"]
    gap = edge["team1_score"] - edge["team2_score"]
    raw_team1 = 1 / (1 + exp(-(gap / 12.0)))

    data_strength = min(1.0, max(context["team1_matches"], context["team2_matches"]) / 8.0)
    h2h_strength = min(1.0, context["h2h_total"] / 5.0)
    shrink = max(0.45, min(1.0, data_strength * 0.8 + h2h_strength * 0.2))
    adjusted_team1 = 0.5 + (raw_team1 - 0.5) * shrink

    team1_prob = round(_clamp(adjusted_team1, 0.18, 0.82), 4)
    team2_prob = round(1 - team1_prob, 4)
    return team1_prob, team2_prob


def _confidence_from_context(context: dict, team1_prob: float) -> str:
    edge_gap = abs(team1_prob - 0.5)
    data_strength = min(1.0, max(context["team1_matches"], context["team2_matches"]) / 8.0)
    if edge_gap >= 0.10 and data_strength >= 0.8:
        return "high"
    if edge_gap >= 0.06 and data_strength >= 0.5:
        return "medium"
    return "low"


def _build_reasoning(context: dict, predicted_winner: str, team1_prob: float, team2_prob: float) -> str:
    team1 = context["team1"]
    team2 = context["team2"]
    edge = context["edge_score"]
    favorite_prob = team1_prob if predicted_winner == team1 else team2_prob
    underdog = team2 if predicted_winner == team1 else team1

    sentences = [
        (
            f"{predicted_winner} rate as the deterministic SixSense pick at {favorite_prob:.0%} win probability, "
            f"driven by the structured edge score: {edge['narrative']}."
        ),
        (
            f"Recent form favors {team1} at {context['team1_win_rate']:.0%} from {context['team1_matches']} matches "
            f"versus {team2} at {context['team2_win_rate']:.0%} from {context['team2_matches']}, "
            f"while the head-to-head sits {context['h2h_team1_wins']}-{context['h2h_team2_wins']} across {context['h2h_total']} meetings."
        ),
    ]

    if context["odds_data"]:
        sentences.append(
            f"Market pricing remains in the mix: {context['odds_context'].splitlines()[0]}, "
            f"but SixSense still grades {predicted_winner} ahead of {underdog} on the structured edge score."
        )
    else:
        sentences.append(
            f"No live sportsbook line was available, so the projection leans on form, pressure, and venue context rather than market confirmation."
        )

    venue_name = context["venue"] or "the venue"
    sentences.append(
        f"At {venue_name}, teams batting first have won {context['toss_bat_win_rate']:.0%} of tracked matches, "
        f"so venue conditions are a secondary tiebreaker rather than the main driver of the pick."
    )
    return " ".join(sentences)


def _build_toss_insight(context: dict, predicted_winner: str) -> str:
    venue_name = context["venue"] or "this venue"
    bat_first_rate = context["toss_bat_win_rate"]
    edge_pct = abs(round((bat_first_rate - 0.5) * 100))
    match_type = context["match_type"].upper()

    if bat_first_rate >= 0.56:
        return (
            f"Toss edge leans batting first at {venue_name}: teams setting a total have won about {bat_first_rate:.0%} "
            f"of tracked {match_type} matches here, so {predicted_winner} should prefer to bat if they win the toss."
        )
    if bat_first_rate <= 0.44:
        return (
            f"Toss edge leans chasing at {venue_name}: sides batting second have won about {(1 - bat_first_rate):.0%} "
            f"of tracked {match_type} matches here, so {predicted_winner} should look to bowl first if they win the toss."
        )
    return (
        f"Toss looks close to neutral at {venue_name}, with only about a {edge_pct}% swing away from a 50/50 split; "
        f"{predicted_winner} should choose based more on conditions on the day than a fixed bat-or-bowl rule."
    )


def build_prediction(match: dict) -> dict:
    """Generate a fully deterministic prediction from structured data."""
    context = build_context(match)
    team1_prob, team2_prob = _probability_from_edge(context)
    predicted_winner = context["team1"] if team1_prob >= team2_prob else context["team2"]
    confidence = _confidence_from_context(context, team1_prob)
    reasoning = _build_reasoning(context, predicted_winner, team1_prob, team2_prob)
    toss_insight = _build_toss_insight(context, predicted_winner)

    return {
        "match_id": match["match_id"],
        "team1": context["team1"],
        "team2": context["team2"],
        "predicted_winner": predicted_winner,
        "team1_win_probability": team1_prob,
        "team2_win_probability": team2_prob,
        "confidence": confidence,
        "reasoning": reasoning,
        "toss_insight": toss_insight,
        "model": "deterministic-core",
        "ensemble_size": 1,
        "edge_score": context.get("edge_score"),
        "_snapshot_inputs": {
            "version": 1,
            "fixture": {
                "team1": context["team1"],
                "team2": context["team2"],
                "match_type": context["match_type"],
            },
            "team_form": {
                "team1": {
                    "team": context["team1"],
                    "win_rate": context["team1_win_rate"],
                    "matches": context["team1_matches"],
                    "recent_wins": context["team1_wins"],
                },
                "team2": {
                    "team": context["team2"],
                    "win_rate": context["team2_win_rate"],
                    "matches": context["team2_matches"],
                    "recent_wins": context["team2_wins"],
                },
            },
            "head_to_head": {
                "total": context["h2h_total"],
                "team1_wins": context["h2h_team1_wins"],
                "team2_wins": context["h2h_team2_wins"],
                "source": context["h2h_source"],
            },
            "series": {
                "scoreline": context["series_scoreline"],
            },
            "market": context["odds_data"],
        },
    }


def _change_event(
    category: str,
    event_type: str,
    label: str,
    summary: str,
    affected_input: str,
    event_at: str,
    affected_team: Optional[str] = None,
    source: Optional[dict] = None,
) -> dict:
    return {
        "event_at": event_at,
        "category": category,
        "type": event_type,
        "label": label,
        "summary": summary,
        "affected_team": affected_team,
        "affected_input": affected_input,
        "relationship": "coincided_input_change",
        "source": source or {},
    }


def derive_snapshot_change_events(
    previous_snapshot: Optional[dict],
    current_inputs: dict,
    captured_at: str,
) -> list[dict]:
    """Describe observed structured-input changes without claiming causation."""
    if previous_snapshot is None:
        return [_change_event(
            "baseline",
            "initial_snapshot",
            "Initial pre-match model snapshot",
            "The first deterministic pre-match probability was captured.",
            "deterministic_core",
            captured_at,
            source={"name": "SixSense deterministic pipeline"},
        )]

    previous_inputs = previous_snapshot.get("input_state")
    if not isinstance(previous_inputs, dict) or not previous_inputs:
        return [_change_event(
            "legacy",
            "attribution_unavailable",
            "Earlier input details unavailable",
            "This model move follows a legacy snapshot that did not retain structured input attribution.",
            "structured_inputs",
            captured_at,
        )]

    events: list[dict] = []
    previous_fixture = previous_inputs.get("fixture") or {}
    current_fixture = current_inputs.get("fixture") or {}
    if previous_fixture != current_fixture:
        events.append(_change_event(
            "fixture",
            "fixture_context_changed",
            "Fixture context corrected",
            "Team or match-format inputs changed before this model snapshot.",
            "fixture_context",
            captured_at,
            source={"name": "fixture feed"},
        ))

    previous_form = previous_inputs.get("team_form") or {}
    current_form = current_inputs.get("team_form") or {}
    for team_key in ("team1", "team2"):
        before = previous_form.get(team_key) or {}
        after = current_form.get(team_key) or {}
        if before == after:
            continue
        team = after.get("team") or current_fixture.get(team_key) or team_key
        events.append(_change_event(
            "form",
            "recent_form_changed",
            f"{team} recent-form inputs changed",
            (
                f"The structured form sample moved from {before.get('recent_wins', 0)}/"
                f"{before.get('matches', 0)} wins to {after.get('recent_wins', 0)}/"
                f"{after.get('matches', 0)}; this change coincided with the model move."
            ),
            f"team_form.{team_key}",
            captured_at,
            affected_team=team,
            source={"name": "Cricsheet/statistics cache"},
        ))

    before_h2h = previous_inputs.get("head_to_head") or {}
    after_h2h = current_inputs.get("head_to_head") or {}
    if before_h2h != after_h2h:
        events.append(_change_event(
            "head_to_head",
            "head_to_head_changed",
            "Head-to-head input refreshed",
            (
                f"The tracked H2H sample changed from {before_h2h.get('total', 0)} to "
                f"{after_h2h.get('total', 0)} matches and coincided with this model move."
            ),
            "head_to_head",
            captured_at,
            source={"name": after_h2h.get("source") or "structured results"},
        ))

    before_series = previous_inputs.get("series") or {}
    after_series = current_inputs.get("series") or {}
    if before_series != after_series:
        scoreline = after_series.get("scoreline") or "No active scoreline"
        events.append(_change_event(
            "series",
            "series_context_changed",
            "Series context changed",
            f"The structured series context now reads “{scoreline}”; this update coincided with the model move.",
            "series.scoreline",
            captured_at,
            source={"name": "ESPN series context"},
        ))

    before_market = previous_inputs.get("market")
    after_market = current_inputs.get("market")
    if before_market != after_market:
        bookmaker = (after_market or {}).get("bookmaker") or "sportsbook market"
        observed_at = (after_market or {}).get("fetched_at") or captured_at
        if after_market:
            summary = (
                f"{bookmaker} prices changed to {after_market.get('team1_odds')} / "
                f"{after_market.get('team2_odds')}; the refreshed market input coincided with the model move."
            )
        else:
            summary = "The previously available sportsbook input was no longer present for this model snapshot."
        events.append(_change_event(
            "market",
            "market_price_changed",
            f"{bookmaker} market input changed",
            summary,
            "market_odds",
            observed_at,
            source={
                "name": bookmaker,
                "reference": "match_odds",
                "observed_at": observed_at,
            },
        ))

    if not events:
        events.append(_change_event(
            "model_inputs",
            "structured_inputs_changed",
            "Structured edge inputs changed",
            "One or more retained deterministic edge inputs changed and coincided with this probability move.",
            "edge_score",
            captured_at,
            source={"name": "SixSense deterministic pipeline"},
        ))
    return events


def persist_prediction(prediction: dict) -> dict:
    """Persist the latest contract and append a changed pre-match core snapshot."""
    edge = prediction.get("edge_score") or {}
    input_state = prediction.get("_snapshot_inputs") or {}
    previous_snapshot = get_latest_prediction_snapshot(prediction["match_id"])
    captured_at = datetime.now(timezone.utc).isoformat()
    change_events = derive_snapshot_change_events(
        previous_snapshot,
        input_state,
        captured_at,
    )
    latest_prediction = {
        key: value for key, value in prediction.items()
        if key not in ("edge_score", "_snapshot_inputs")
    }
    store_prediction(latest_prediction)
    if edge:
        _store_edge_score(prediction["match_id"], edge)
    appended = store_prediction_snapshot(
        latest_prediction,
        edge,
        input_state,
        change_events,
    )
    logger.info(
        "  Prediction snapshot %s",
        "recorded" if appended else "skipped after kickoff",
    )
    return latest_prediction


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
        match for match in get_upcoming_matches(future_only=True)
        if parse_match_datetime(match["date"]) > now
    ]
    if match_id:
        matches = [match for match in matches if match["match_id"] == match_id]
    if not force:
        matches = [match for match in matches if get_prediction(match["match_id"]) is None]
    if limit is not None:
        matches = matches[:limit]
    logger.info(f"Found {len(matches)} future upcoming matches")

    if matches:
        logger.info("Refreshing squads before prediction/enrichment...")
        for match in matches:
            fetch_and_store_squads(match_ids=[match["match_id"]], force=force)
            fetch_stats_for_match_squads(match_id=match["match_id"], force=False)

    stored = 0
    for match in matches:
        logger.info(f"Predicting: {match['team1']} vs {match['team2']}")
        try:
            prediction = persist_prediction(build_prediction(match))
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
