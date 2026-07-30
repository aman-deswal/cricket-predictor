# Hourly Copilot garnish automation

Use this repository prompt when creating a GitHub Copilot automation for hourly garnish refresh.

## Recommended schedule

- **Hourly**
- Run as a post-refresh narrative pass, not as the core prediction engine

## Automation prompt

```text
Refresh AI garnish for SixSense upcoming matches.

1. Run `python pipeline/select_garnish_candidates.py --format text`.
2. Focus only on the returned candidates, prioritizing higher-priority matches first.
3. Preserve deterministic core fields:
   - predicted_winner
   - team1_win_probability
   - team2_win_probability
   - confidence
   - edge_score
4. Refresh only garnish-style fields such as:
   - predictions.reasoning
   - predictions.toss_insight
   - match_enrichment.expert_preview
   - match_enrichment.player_updates
   - match_enrichment.source_links
5. Use the latest structured data already in Supabase, ESPN-derived context, squads, odds, and Cricsheet stats.
6. If evidence is weak, keep the summary conservative and factual.
7. Write garnish back into the same live data path production already reads, preserving schemas and row shape.

Do not invent injuries, lineups, or venue facts that are not supported by the available data.
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
