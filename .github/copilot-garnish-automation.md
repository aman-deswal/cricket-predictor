# Hourly Copilot garnish automation

Use this repository prompt when creating a GitHub Copilot automation for hourly garnish refresh.

## Recommended schedule

- **Hourly**
- Run as a post-refresh narrative pass, not as the core prediction engine

## Automation prompt

```text
Execution-only task: refresh live AI garnish for SixSense upcoming matches.

This automation is an operator run, not a coding task.

Do not edit, create, delete, or rename any repository file.
Do not create branches, commits, pull requests, issues, or workflow changes.
Do not attempt to "improve" the system during this run.
If a script fails, report the failure and stop; do not patch code as part of the automation.

1. Run `python pipeline/select_garnish_candidates.py --format ids`.
2. If no IDs are returned, report `No garnish candidates found.` and stop.
3. For each returned match ID, run `python pipeline/refresh_garnish.py --match-id <MATCH_ID>`.
4. Only write garnish-style fields:
   - predictions.reasoning
   - predictions.toss_insight
   - match_enrichment.expert_preview
   - match_enrichment.player_updates
   - match_enrichment.source_links
5. Preserve deterministic core fields exactly as stored:
   - predicted_winner
   - team1_win_probability
   - team2_win_probability
   - confidence
   - edge_score
6. Use only the latest structured data already available in Supabase, ESPN-derived context, squads, odds, and Cricsheet stats.
7. If evidence is weak, keep the summary conservative and factual rather than inventing details.
8. End with a short execution report containing:
   - candidate match IDs
   - refreshed match IDs
   - how many rows were updated
   - whether any refreshed rows had non-empty source_links
   - whether any refreshed rows had non-empty player_updates

Do not invent injuries, lineups, venue facts, or news that are not supported by the available data.
Do not recalculate or rewrite the deterministic prediction core.
```

## Why this cadence works

- Hourly keeps marquee cards fresh without forcing AI into the critical path.
- The selector favors:
  - missing garnish
  - stale garnish
  - source updates after the last garnish run
  - matches starting soon

## Helper command

You can also inspect raw IDs only:

```bash
python pipeline/select_garnish_candidates.py --format ids
```

Then refresh a specific match deterministically:

```bash
python pipeline/refresh_garnish.py --match-id <MATCH_ID>
```
