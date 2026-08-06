"""Fetch current cricket fixtures and store authoritative states in Supabase.

Uses ESPN Cricinfo as the primary source and Cricbuzz JSON-LD as a fallback
for upcoming fixtures when ESPN's header feed is too current-day biased.

Also detects completed matches and scores any pending predictions.
"""

import argparse
import logging
import re
from datetime import datetime, timedelta
from typing import Optional

from utils.db import get_client
from utils.cricbuzz import get_cricbuzz_upcoming_fixtures
from utils.espn import (
    _normalize_team,
    get_espn_fixtures,
    get_series_fixtures,
)
from fetch_results import _espn_winner_from_summary

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


def _status_rank(status: str) -> int:
    """Higher rank = more progressed match state."""
    if status == "post":
        return 3
    if status == "in":
        return 2
    if status == "pre":
        return 1
    return 0


ESPN_TO_MATCH_STATUS = {
    "pre": "upcoming",
    "in": "live",
    "post": "completed",
}

MATCH_STATUS_RANK = {
    "upcoming": 1,
    "live": 2,
    "completed": 3,
}


def _merge_fixtures_by_event(fixtures: list[dict]) -> list[dict]:
    """Deduplicate fixtures by ESPN event ID, keeping the best-quality row."""
    merged: dict[str, dict] = {}
    for fixture in fixtures:
        event_id = fixture.get("espn_event_id")
        if not event_id:
            continue

        current = merged.get(event_id)
        if current is None:
            merged[event_id] = fixture
            continue

        current_rank = _status_rank(current.get("status", ""))
        incoming_rank = _status_rank(fixture.get("status", ""))
        if incoming_rank > current_rank:
            merged[event_id] = fixture
            continue

        # Same status: prefer row with venue populated.
        if incoming_rank == current_rank and fixture.get("venue") and not current.get("venue"):
            merged[event_id] = fixture

    return list(merged.values())


def _normalize_fixture_team(name: str) -> str:
    """Normalize source-specific gender labels without erasing women's teams."""
    normalized = name.strip().lower()
    normalized = re.sub(r"\s*\((men|women)\)\s*", r" \1", normalized)
    normalized = re.sub(r"\s+", " ", normalized).strip()
    if normalized.endswith(" men"):
        normalized = normalized[:-4].strip()
    elif not normalized.endswith(" women"):
        normalized = _normalize_team(normalized)
    return normalized


def _parse_fixture_date(value: str) -> Optional[datetime]:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None
    return parsed


def _same_fixture_window(left: dict, right: dict, tolerance: timedelta = timedelta(hours=2)) -> bool:
    left_teams = sorted([
        _normalize_fixture_team(left.get("team1", "")),
        _normalize_fixture_team(left.get("team2", "")),
    ])
    right_teams = sorted([
        _normalize_fixture_team(right.get("team1", "")),
        _normalize_fixture_team(right.get("team2", "")),
    ])
    if left_teams != right_teams:
        return False

    left_date = _parse_fixture_date(left.get("date", ""))
    right_date = _parse_fixture_date(right.get("date", ""))
    if left_date is None or right_date is None:
        return left.get("date", "") == right.get("date", "")

    return abs(left_date - right_date) <= tolerance


def _merge_fixtures_by_identity(fixtures: list[dict]) -> list[dict]:
    """Deduplicate same match from multiple sources, preferring ESPN rows."""
    merged: list[dict] = []
    for fixture in fixtures:
        match_index = next(
            (idx for idx, current in enumerate(merged) if _same_fixture_window(fixture, current)),
            None,
        )
        if match_index is None:
            merged.append(fixture)
            continue

        current = merged[match_index]
        current_source = current.get("source", "espn")
        incoming_source = fixture.get("source", "espn")
        if current_source != "espn" and incoming_source == "espn":
            merged[match_index] = fixture
            continue

        if fixture.get("venue") and not current.get("venue"):
            merged[match_index] = fixture

    return merged


def _target_exists(client, table: str, match_id: str, select_field: str = "match_id") -> bool:
    response = (
        client.table(table)
        .select(select_field)
        .eq(select_field, match_id)
        .execute()
    )
    return bool(response.data)


def _migrate_single_match_id_table(
    client,
    table: str,
    old_match_id: str,
    new_match_id: str,
    update_payload: Optional[dict] = None,
    target_field: str = "match_id",
) -> None:
    if _target_exists(client, table, new_match_id, select_field=target_field):
        logger.info("Skipping %s migration for %s; target %s already exists", table, old_match_id, new_match_id)
        client.table(table).delete().eq(target_field, old_match_id).execute()
        return

    payload = update_payload or {"match_id": new_match_id}
    client.table(table).update(payload).eq(target_field, old_match_id).execute()


def _migrate_match_squads(client, old_match_id: str, new_match_id: str) -> None:
    squads = (
        client.table("match_squads")
        .select("team")
        .eq("match_id", old_match_id)
        .execute()
        .data
        or []
    )
    for squad in squads:
        team = squad.get("team")
        existing = (
            client.table("match_squads")
            .select("id")
            .eq("match_id", new_match_id)
            .eq("team", team)
            .execute()
            .data
            or []
        )
        if existing:
            continue
        client.table("match_squads").update({"match_id": new_match_id}).eq(
            "match_id", old_match_id
        ).eq("team", team).execute()


def _migrate_links_to_canonical_match(client, old_match_id: str, new_match_id: str) -> None:
    """Move provisional Cricbuzz-linked data to the canonical ESPN match ID."""
    migration_ops = [
        lambda: _migrate_single_match_id_table(client, "predictions", old_match_id, new_match_id),
        lambda: _migrate_single_match_id_table(
            client,
            "prediction_results",
            old_match_id,
            new_match_id,
            update_payload={"prediction_id": new_match_id, "match_id": new_match_id},
            target_field="prediction_id",
        ),
        lambda: _migrate_single_match_id_table(client, "match_edge_scores", old_match_id, new_match_id),
        lambda: _migrate_single_match_id_table(client, "match_enrichment", old_match_id, new_match_id),
        lambda: _migrate_single_match_id_table(client, "espn_match_data", old_match_id, new_match_id),
        lambda: _migrate_match_squads(client, old_match_id, new_match_id),
        lambda: client.table("match_odds").update({"match_id": new_match_id}).eq("match_id", old_match_id).execute(),
    ]
    for migrate in migration_ops:
        try:
            migrate()
        except Exception as exc:
            logger.debug("Provisional fixture link migration skipped: %s", exc)


def _reconcile_provisional_fixtures(client, espn_fixtures: list[dict]) -> int:
    """Replace provisional Cricbuzz match rows with canonical ESPN rows."""
    cricbuzz_matches = (
        client.table("matches")
        .select("match_id, team1, team2, date")
        .like("match_id", "cricbuzz-%")
        .eq("status", "upcoming")
        .execute()
        .data
        or []
    )
    if not cricbuzz_matches:
        return 0

    existing_espn_matches = (
        client.table("matches")
        .select("match_id, team1, team2, date")
        .like("match_id", "espn-%")
        .in_("status", ["upcoming", "live", "completed"])
        .execute()
        .data
        or []
    )
    canonical_fixtures = [
        f for f in espn_fixtures
        if f.get("status") in ESPN_TO_MATCH_STATUS and f.get("espn_event_id")
    ]
    canonical_fixtures.extend(existing_espn_matches)

    reconciled = 0
    reconciled_ids: set[str] = set()
    for espn_fixture in canonical_fixtures:
        new_match_id = espn_fixture.get("match_id")
        if not new_match_id:
            espn_id = espn_fixture.get("espn_event_id")
            if not espn_id:
                continue
            new_match_id = f"espn-{espn_id}"
        if not str(new_match_id).startswith("espn-"):
            continue

        for provisional in cricbuzz_matches:
            old_match_id = provisional["match_id"]
            if old_match_id in reconciled_ids:
                continue
            if not _same_fixture_window(espn_fixture, provisional):
                continue

            try:
                _migrate_links_to_canonical_match(client, old_match_id, new_match_id)
                client.table("matches").delete().eq("match_id", old_match_id).execute()
                logger.info("Reconciled provisional fixture %s -> %s", old_match_id, new_match_id)
                reconciled += 1
                reconciled_ids.add(old_match_id)
            except Exception as exc:
                logger.warning("Failed to reconcile provisional fixture %s -> %s: %s", old_match_id, new_match_id, exc)

    return reconciled


def _score_prediction(prediction: dict, actual_winner: str, result_text: Optional[str] = None) -> dict:
    """Score a single prediction against the actual winner."""
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


def _score_espn_completed(espn_fixtures: list[dict]) -> int:
    """Score predictions for matches ESPN reports as completed.

    Returns number of predictions scored.
    """
    completed = [f for f in espn_fixtures if f.get("status") == "post" and f.get("winner")]
    if not completed:
        return 0

    client = get_client()
    scored = 0

    for fixture in completed:
        espn_eid = fixture["espn_event_id"]
        fixture_winner = fixture["winner"]

        summary_winner, result_text = _espn_winner_from_summary(str(espn_eid))
        if summary_winner == "__no_result__":
            logger.info("ESPN event %s is a no-result; skipping fixture-feed winner %s", espn_eid, fixture_winner)
            continue
        if not summary_winner:
            logger.warning("ESPN event %s has fixture-feed winner %s but no summary winner; skipping scoring", espn_eid, fixture_winner)
            continue
        if summary_winner != fixture_winner:
            logger.warning(
                "ESPN event %s fixture-feed winner %s disagrees with summary winner %s; using summary",
                espn_eid,
                fixture_winner,
                summary_winner,
            )
        espn_winner = summary_winner

        # Find our match by ESPN event ID
        espn_rec = (
            client.table("espn_match_data")
            .select("match_id")
            .eq("espn_event_id", espn_eid)
            .execute()
        )
        if not espn_rec.data:
            continue

        match_id = espn_rec.data[0]["match_id"]

        match_resp = (
            client.table("matches")
            .select("match_id, team1, team2")
            .eq("match_id", match_id)
            .execute()
        )
        if not match_resp.data:
            continue

        # Map ESPN winner name to our team names
        from utils.espn import _normalize_team
        norm_winner = _normalize_team(espn_winner)
        match = match_resp.data[0]
        actual = None
        if _normalize_team(match["team1"]) == norm_winner or norm_winner in _normalize_team(match["team1"]):
            actual = match["team1"]
        elif _normalize_team(match["team2"]) == norm_winner or norm_winner in _normalize_team(match["team2"]):
            actual = match["team2"]
        else:
            logger.warning(f"ESPN winner '{espn_winner}' doesn't match {match['team1']}/{match['team2']}")
            continue

        client.table("matches").update({
            "status": "completed",
            "winner": actual,
        }).eq("match_id", match_id).execute()

        # Look up unscored prediction, if one exists.
        pred_resp = (
            client.table("predictions")
            .select("*")
            .eq("match_id", match_id)
            .is_("scored_at", "null")
            .execute()
        )
        if not pred_resp.data:
            logger.info(f"ESPN completed: {match['team1']} vs {match['team2']} → winner={actual} (no prediction to score)")
            continue

        prediction = pred_resp.data[0]
        result = _score_prediction(prediction, actual, result_text)
        client.table("prediction_results").upsert(result, on_conflict="prediction_id").execute()
        client.table("predictions").update({"scored_at": datetime.utcnow().isoformat()}).eq("match_id", match_id).execute()

        correct_str = "✓" if result["correct"] else "✗"
        logger.info(f"ESPN scored: {prediction['team1']} vs {prediction['team2']} → winner={actual} {correct_str}")
        scored += 1

    return scored


def _infer_match_type(league_name: str) -> str:
    """Infer a match type string from an ESPN league name."""
    lower = league_name.lower()
    if "test" in lower:
        return "Test"
    if "odi" in lower or "one day" in lower or "one-day" in lower:
        return "ODI"
    return "T20"


def _fixture_source_id(fixture: dict) -> Optional[str]:
    source = fixture.get("source", "espn")
    if source == "espn":
        return fixture.get("espn_event_id", "")
    return fixture.get("source_id", "")


def _fixtures_to_matches(fixtures: list[dict]) -> list[dict]:
    """Convert authoritative fixture states to matches-table rows.

    Uses '<source>-<source_id>' as a stable match_id so records from multiple
    fixture sources can coexist without collisions.
    """
    matches = []
    for f in fixtures:
        match_status = ESPN_TO_MATCH_STATUS.get(f.get("status", ""))
        if not match_status:
            continue
        source = f.get("source", "espn")
        source_id = _fixture_source_id(f)
        if not source_id:
            continue
        team1 = f.get("team1", "")
        team2 = f.get("team2", "")
        if not team1 or not team2:
            continue
        match = {
            "match_id": f"{source}-{source_id}",
            "name": f"{team1} vs {team2}",
            "team1": team1,
            "team2": team2,
            "date": f.get("date", ""),
            "venue": f.get("venue", ""),
            "match_type": _infer_match_type(f.get("league_name", "")),
            "status": match_status,
        }
        if source == "espn":
            match["espn_event_id"] = source_id
        matches.append(match)
    return matches


def _espn_fixtures_to_matches(espn_fixtures: list[dict]) -> list[dict]:
    """Backward-compatible wrapper for ESPN fixture conversion."""
    return _fixtures_to_matches(espn_fixtures)


def _allowed_current_statuses(incoming_status: str) -> list[str]:
    """Return states an incoming fixture is allowed to replace."""
    incoming_rank = MATCH_STATUS_RANK.get(incoming_status, 0)
    return [
        status
        for status, rank in MATCH_STATUS_RANK.items()
        if rank <= incoming_rank
    ]


def _persist_fixture_matches(client, matches: list[dict]) -> int:
    """Persist fixture rows without allowing match status to move backwards."""
    if not matches:
        return 0

    match_ids = [match["match_id"] for match in matches]
    existing_response = (
        client.table("matches")
        .select("match_id,status")
        .in_("match_id", match_ids)
        .execute()
    )
    existing_statuses = {
        row["match_id"]: row.get("status", "")
        for row in (existing_response.data or [])
    }

    persisted = 0
    for match in matches:
        match_id = match["match_id"]
        incoming_status = match["status"]
        current_status = existing_statuses.get(match_id)

        if current_status is None:
            try:
                client.table("matches").insert(match).execute()
                existing_statuses[match_id] = incoming_status
                persisted += 1
                continue
            except Exception:
                # Another writer may have inserted the canonical row after our read.
                current_response = (
                    client.table("matches")
                    .select("match_id,status")
                    .eq("match_id", match_id)
                    .execute()
                )
                if not current_response.data:
                    raise
                current_status = current_response.data[0].get("status", "")
                existing_statuses[match_id] = current_status

        if MATCH_STATUS_RANK.get(incoming_status, 0) < MATCH_STATUS_RANK.get(current_status, 0):
            logger.info(
                "Skipping stale status for %s: current=%s incoming=%s",
                match_id,
                current_status,
                incoming_status,
            )
            continue

        # The status predicate protects against another workflow completing the
        # match between our initial read and this update.
        (
            client.table("matches")
            .update(match)
            .eq("match_id", match_id)
            .in_("status", _allowed_current_statuses(incoming_status))
            .execute()
        )
        existing_statuses[match_id] = incoming_status
        persisted += 1

    return persisted


def main(match_types: Optional[list[str]] = None) -> None:
    """
    Fetch current fixtures from ESPN (free, unlimited).
    Persists upcoming/live/completed matches and scores completed ones.

    Args:
        match_types: Unused — kept for CLI backward compatibility.
    """
    # --- Phase 1: ESPN fixture discovery ---
    logger.info("Phase 1: Fetching fixtures from ESPN...")
    espn_fixtures = get_espn_fixtures()
    logger.info(f"ESPN header: found {len(espn_fixtures)} fixtures")

    # Header feed is often current-day biased; expand via league scoreboards.
    league_ids = sorted({f.get("league_id", "") for f in espn_fixtures if f.get("league_id")})
    series_fixtures: list[dict] = []
    for league_id in league_ids:
        league_rows = get_series_fixtures(league_id)
        if league_rows:
            series_fixtures.extend(league_rows)
    if series_fixtures:
        logger.info(f"ESPN series scoreboards: found {len(series_fixtures)} fixtures across {len(league_ids)} leagues")

    cricbuzz_fixtures = get_cricbuzz_upcoming_fixtures()
    if cricbuzz_fixtures:
        logger.info(f"Cricbuzz fallback: found {len(cricbuzz_fixtures)} future fixtures")

    espn_merged = _merge_fixtures_by_event([*espn_fixtures, *series_fixtures])
    all_fixtures = _merge_fixtures_by_identity([*espn_merged, *cricbuzz_fixtures])
    logger.info(f"Merged fixture set: {len(all_fixtures)} unique events")

    # --- Phase 2: Persist authoritative fixture states ---
    fixture_matches = _fixtures_to_matches(all_fixtures)
    if fixture_matches:
        client = get_client()
        persisted = _persist_fixture_matches(client, fixture_matches)
        logger.info(f"Persisted {persisted} fixture states...")

        # Stamp espn_event_id on matches row and create espn_match_data stubs
        for m in fixture_matches:
            if not m["match_id"].startswith("espn-"):
                continue
            espn_eid = m["match_id"].removeprefix("espn-")
            try:
                client.table("matches").update({
                    "espn_event_id": espn_eid,
                }).eq("match_id", m["match_id"]).execute()
            except Exception:
                pass
            try:
                existing = client.table("espn_match_data").select("match_id").eq("match_id", m["match_id"]).execute()
                if not existing.data:
                    client.table("espn_match_data").insert({
                        "match_id": m["match_id"],
                        "espn_event_id": espn_eid,
                    }).execute()
            except Exception:
                pass
        reconciled = _reconcile_provisional_fixtures(client, all_fixtures)
        if reconciled:
            logger.info(f"Reconciled {reconciled} provisional Cricbuzz fixtures to ESPN IDs")
    else:
        logger.warning("No fixture states found from ESPN or Cricbuzz.")

    # --- Phase 3: Score completed matches ---
    espn_completed = [f for f in all_fixtures if f.get("status") == "post" and f.get("winner")]
    if espn_completed:
        logger.info(f"Scoring from ESPN: {len(espn_completed)} completed matches...")
        total_scored = _score_espn_completed(all_fixtures)
        if total_scored:
            logger.info(f"Total scored: {total_scored} predictions")

    logger.info("Done.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Fetch current cricket fixtures")
    parser.add_argument(
        "--types",
        nargs="+",
        default=["odi", "t20"],
        help="International match types to fetch (default: odi t20)",
    )
    args = parser.parse_args()
    main(match_types=args.types)
