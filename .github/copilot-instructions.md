# SixSense Copilot instructions

## Product contract

SixSense now has a **deterministic prediction core** and an **optional AI garnish layer**.

- Core prediction fields are the source of truth and must remain deterministic:
  - `predicted_winner`
  - `team1_win_probability`
  - `team2_win_probability`
  - `confidence`
  - `edge_score`
- AI garnish is secondary and should never block production freshness.

## What Copilot may update

When working on garnish refresh or narrative quality tasks, prefer updating only:

- `predictions.reasoning`
- `predictions.toss_insight`
- `match_enrichment.expert_preview`
- `match_enrichment.player_updates`
- `match_enrichment.source_links`
- other clearly narrative or summary-style fields that do not redefine the deterministic prediction math

## What Copilot must not change casually

Do **not** rewrite or invent the deterministic core without an explicit user request:

- probability math
- winner selection logic
- edge-score weighting
- data freshness logic
- schema contracts consumed by the frontend

## Grounding rules

- Use the latest structured data already available in Supabase, ESPN-derived context, odds, squads, and Cricsheet stats.
- Do not invent unavailable player injuries, venue conditions, or lineup confirmations.
- If evidence is weak, keep garnish conservative and explicit.
- Prefer short, factual summaries over dramatic prose.

## Operational guidance for garnish automation

- Treat garnish as a **post-refresh pass** that runs after fixture, results, odds, and deterministic prediction data are fresh.
- Default cadence should be **hourly**, using `python pipeline/select_garnish_candidates.py --format ids` and then `python pipeline/refresh_garnish.py --match-id <MATCH_ID>` for each candidate.
- If garnish cannot be generated, leave the deterministic core intact and preserve the existing fallback behavior.
- If writing to live data stores, update only the intended garnish fields and preserve the existing row shape.
- Scheduled garnish automations are **execution-only operator runs**:
  - do not edit repository files
  - do not create branches, commits, pull requests, or workflow changes
  - do not treat a live refresh failure as a prompt to patch code
  - report failures instead of attempting repairs during the automation run
