"""Print the live garnish fields for a set of match IDs."""

from __future__ import annotations

import argparse
import json

from utils.db import get_client


def fetch_rows(match_ids: list[str]) -> list[dict]:
    client = get_client()
    predictions = (
        client.table("predictions")
        .select("match_id,team1,team2,reasoning,toss_insight")
        .in_("match_id", match_ids)
        .execute()
        .data
        or []
    )
    enrichments = (
        client.table("match_enrichment")
        .select("match_id,expert_preview,player_updates,source_links,generated_at")
        .in_("match_id", match_ids)
        .execute()
        .data
        or []
    )

    prediction_map = {row["match_id"]: row for row in predictions}
    enrichment_map = {row["match_id"]: row for row in enrichments}

    rows = []
    for match_id in match_ids:
        prediction = prediction_map.get(match_id, {})
        enrichment = enrichment_map.get(match_id, {})
        rows.append(
            {
                "match_id": match_id,
                "team1": prediction.get("team1"),
                "team2": prediction.get("team2"),
                "reasoning": prediction.get("reasoning"),
                "toss_insight": prediction.get("toss_insight"),
                "expert_preview": enrichment.get("expert_preview"),
                "player_updates": enrichment.get("player_updates") or [],
                "source_links": enrichment.get("source_links") or [],
                "generated_at": enrichment.get("generated_at"),
            }
        )
    return rows


def main(match_ids: list[str]) -> int:
    print(json.dumps(fetch_rows(match_ids), indent=2, ensure_ascii=True))
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Report live garnish fields for match IDs")
    parser.add_argument("--match-id", action="append", dest="match_ids", required=True)
    args = parser.parse_args()
    raise SystemExit(main(args.match_ids))
