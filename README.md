# 🏏 SixSense — AI Cricket Match Intelligence

SixSense is a full-stack cricket intelligence app that combines live fixtures, ESPN context, market odds, historical stats, and LLM reasoning into match-level prediction briefs.

It is no longer just a simple “winner predictor” — current builds include:
- a rich **match details cockpit** (edge score, squads/headshots, toss factor, H2H, series context, sportsbook view)
- **automated data pipelines** for fixtures/results/squads/headshots/odds/enrichment
- **evaluation surfaces** (history + calibration/accuracy dashboard)

---

## Product Roadmap Status (GitHub issues)

Current work is tracked in milestone-based sprints in GitHub Issues:
- **Sprint 1 — Trust & Foundation (P0):** #40 (done), #41, #42, #43, #44
- **Sprint 2 — Betting Intelligence (P1):** #45, #46, #47, #48, #49, #69, #72
- **Sprint 3 — Cricket Context (P1):** #50, #51, #52, #53, #54, #55, #68, #70
- **Sprint 4 — UX Polish (P2):** #56, #57, #58, #59, #60, #61
- **Sprint 5 — Engagement Features (P3):** #62, #63, #64, #65, #71

Roadmap alignment issue: **#72** (maps the master feature context into this backlog without resetting priorities).

---

## Current Architecture (audited from latest code)

```mermaid
flowchart LR
    A[GitHub Actions Schedules] --> B[Python Pipelines]
    B --> C[(Supabase)]
    C --> D[Next.js Web App]
    C --> K[Expo Native App]
    D --> E[GitHub Pages Static Export]

    G[ESPN Cricinfo APIs] --> B
    H[The Odds API] --> B
    I[Cricsheet Historical Data] --> B
    J[Optional AI Garnish] --> B
```

### Data/Logic flow
1. **Fixtures ingestion** uses ESPN Cricinfo exclusively (free, unlimited). ESPN match IDs (`espn-<id>`) are used as canonical fixture identifiers.
2. **Stats caching** computes team/venue/H2H from Cricsheet and stores in `stats_cache`.
3. **Predictions** are generated deterministically from structured cricket + market data, using:
   - cached form/H2H/venue stats,
   - enrichment notes,
   - ESPN context,
   - sportsbook signal,
   - proprietary **SixSense Edge Score™**.
4. **Optional AI garnish** can layer narrative copy onto enrichment later, but is not required for core prediction freshness.
5. **Results scorer** marks completed matches and computes correctness + Brier score.
6. **Calibration** periodically derives isotonic calibration bins.
6. Frontend reads Supabase directly and renders static-export pages.

---

## Latest App Features

### Match Details (majorly upgraded)
- **Hero verdict view** with team probabilities, formatted odds badges, and donut micro-legend.
- **SixSense Edge Score™** panel:
  - weighted factors: Form, Momentum, Pressure, Market,
  - dual-team color bars,
  - improved contrast/readability for labels + numbers.
- **Sportsbook Odds tile** with clickable bookmaker rows (new-tab outbound behavior).
- **Series context tile** moved higher in page flow for relevance.
- **Squad tile** with role-aware player cards and headshots.
- **Text-heavy cards** now support accordion-style **Show more / Show less** for readability.

### Dashboard & History
- Rolling accuracy trend.
- Calibration scatter chart (when enough data exists).
- Prediction history filters (`all/correct/incorrect`) with probability bar visualization.

### Headshot quality pipeline improvements
- Placeholder/logo image URLs are now treated as missing.
- Headshot resolver now supports CSV mapping + ESPN direct fallback.
- Existing squad rows can be backfilled via `fetch_headshots.py --force`.

---

## Latest Screenshots

> Screenshots below were captured from the current UI iteration and stored in `docs/screenshots/`.

### Match details — odds + interaction styling
![Match details odds tile](docs/screenshots/match-details-odds-tile.png)

### Edge score readability + contrast updates
![Edge score contrast](docs/screenshots/match-details-edge-contrast.png)

### Match layout spacing refinements
![Layout spacing](docs/screenshots/match-details-layout-spacing.png)

### Squad/headshots (after resolver refresh)
![Squad headshots refreshed](docs/screenshots/squad-headshots-refresh.png)

### Prior placeholder-headshot state (before fix)
![Headshot placeholders before fix](docs/screenshots/headshots-placeholder-before.png)

---

## Pipelines & Scheduled Workflows

| Workflow | Schedule | Purpose |
|---|---|---|
| `fetch-fixtures.yml` | every 2 hours | Pull upcoming fixtures and ESPN match context |
| `fetch-results.yml` | hourly | Score unscored predictions on completed matches (ESPN only) |
| `fetch-squads.yml` | every 6 hours | Fetch confirmed XI from ESPN, player stats, and headshots for new squads (CricAPI optional) |
| `fetch-headshots.yml` | manual | Full headshot recovery pass; no separate schedule |
| `fetch-odds.yml` | every 2 hours | Pull bookmaker market data and map to matches |
| `run-predictions.yml` | every 2 hours after odds | Generate deterministic probabilities, reasoning, toss insight, and edge score from stored upstream data |
| `enrich-matches.yml` | after successful predictions | Optional, non-blocking data-backed enrichment and AI garnish |
| `copilot-setup-steps.yml` | on demand / changes to Copilot config | Prepare GitHub Copilot cloud agent with Python deps and deterministic pipeline tooling |
| `calibrate.yml` | weekly | Compute isotonic calibration bins |
| `deploy.yml` | on `main` push / manual | Build static frontend and deploy to GitHub Pages |

---

## Supabase Data Model (active surfaces)

Core tables used by the current app/pipelines:
- `matches` — canonical fixture records (`upcoming`/`completed`)
- `predictions` — winner, probabilities, confidence, reasoning, toss insight
- `prediction_snapshots` — append-only pre-match deterministic core movement
- `prediction_results` — correctness + Brier score + scoring timestamp
- `stats_cache` — team/venue/H2H + calibration data
- `match_enrichment` — venue confidence, XI candidates, updates, source links, preview
- `espn_match_data` — verified venue/toss/rosters/H2H/standings/series context
- `franchise_logos` — persistent franchise logo lookup populated from ESPN rosters
  and seeded IPL franchise defaults
- `match_squads` — team squad or XI snapshots with player metadata + image URLs
- `player_stats` — player batting/bowling aggregates by format
- `match_odds` — bookmaker odds snapshots
- `match_edge_scores` — stored multi-factor edge model output

SQL assets in repo:
- `supabase_schema.sql`
- `supabase/match_enrichment.sql`
- `supabase/stats_cache.sql`
- `supabase/migrations/003_espn_match_data.sql`
- `supabase/migrations/004_franchise_logos.sql`
- `supabase/migrations/007_prediction_snapshots.sql`

---

## Local Development

### JavaScript workspaces

The repository uses npm workspaces for the web app, Expo app, and platform-neutral domain code:

| Workspace | Path | Purpose |
|---|---|---|
| `cricket-predictor-frontend` | `frontend/` | Next.js web client |
| `@sixsense/mobile` | `apps/mobile/` | Expo Router native client |
| `@sixsense/domain` | `packages/domain/` | Shared match and deterministic prediction contracts |

```bash
npm install
npm run dev:web
npm run dev:mobile
npm run typecheck
```

Copy `apps/mobile/.env.example` to `apps/mobile/.env.local` before loading live native data.

## 1) Python pipeline setup
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

### Useful pipeline commands
```bash
# Historical datasets
python pipeline/fetch_cricsheet.py --types t20s odis

# Stats cache build
python pipeline/compute_stats.py --types t20s ipl

# Fixtures + mappings (ESPN primary, Cricbuzz upcoming fallback)
python pipeline/fetch_fixtures.py

# Optional ESPN deep fetch for upcoming matches + franchise logo refresh
python pipeline/fetch_espn.py --limit 20

# Enrichment pass
python pipeline/enrich_matches.py --limit 8 --source-limit 8

# Predictions
python pipeline/predict.py

# Results scoring
python pipeline/fetch_results.py

# Odds
python pipeline/fetch_odds.py

# Squads + player stats + headshots
python pipeline/fetch_squads.py
python pipeline/fetch_player_stats.py
python pipeline/fetch_headshots.py --force
```

## 2) Frontend setup
```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

Set real values in `frontend/.env.local` for:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Data-mode behavior:
- **Demo mode ON** (navbar toggle) → uses bundled mock fixtures/data
- **Demo mode OFF** (navbar toggle) → uses live Supabase prod data

`npm run dev:mock` is still available if you want to boot with mock mode enabled by default.

---

## Environment Variables

### Pipeline (`.env`)
| Variable | Description |
|---|---|
| `GITHUB_TOKEN` | GitHub token for repository/workflow operations |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_KEY` | Supabase service/anon key used by pipelines |
| `CRICAPI_KEY` | *(Optional)* CricAPI key — enables pre-match squad data and player career stats. Not required for fixtures or results. |
| `ODDS_API_KEY` | The Odds API key |
| `ENABLE_LLM_GARNISH` | *(Optional)* Set to `true` only if you intentionally want runtime LLM garnish for enrichment and have a live provider path configured. Defaults to `false`. |
| `LLM_PROFILE`, `LLM_PROFILE_MAP`, `LLM_ROUTE_MAP`, `LLM_FALLBACK_MODELS`, `LLM_MODEL`, `LLM_BASE_URL`, `LLM_API_KEY` | *(Optional garnish only)* Runtime LLM routing for enrichment copy. Core predictions no longer depend on these. |

### Copilot cloud agent / automation

If you want to use **GitHub Copilot automations** for garnish instead of paid runtime model APIs:

1. Keep the repo **private or internal** and enable Copilot cloud agent / automations in the repo settings.
2. Add `SUPABASE_URL` and `SUPABASE_KEY` to the repository's **`copilot` environment** so the agent can read/write the same live data path the frontend uses.
3. Use `.github/copilot-instructions.md` to constrain Copilot to garnish-only updates on top of the deterministic core.
4. Treat Copilot as a **post-refresh narrative pass**, not as the source of truth for probabilities or edge math.

### Recommended hourly garnish flow

For a Copilot automation that keeps the app feeling AI-first without breaking deterministic freshness:

1. Run the automation **hourly**
2. Use `python pipeline/select_garnish_candidates.py --format text`
3. Refresh only high-priority upcoming matches that are missing garnish, stale, or have newer odds / squads / ESPN context than their last garnish pass
4. Update only garnish-style fields in `predictions` and `match_enrichment`

The repository includes `.github/copilot-garnish-automation.md` as a ready-to-copy prompt template for that automation.

### Frontend (`frontend/.env.local`)
| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Browser-accessible Supabase URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser-accessible Supabase anon key |
| `NEXT_PUBLIC_USE_MOCK_DATA` | Set to `true` to run the frontend against bundled demo cricket data |

---

## Deployment Notes

- Frontend uses `next export` mode (`output: "export"`) and deploys to **GitHub Pages**.
- If the repo visibility changes (public ↔ private), re-check **Settings → Pages** and ensure source is set to **GitHub Actions**.
- For private repos, Pages availability depends on your GitHub plan/org settings.

---

## Repository Layout

```text
frontend/                 Next.js app (Matches, Predict, Dashboard, History)
pipeline/                 ETL + prediction + enrichment + scoring jobs
pipeline/utils/           ESPN/Cricsheet/DB/Edge-score helpers (cricapi.py kept for optional squad/stats use)
supabase/                 SQL for enrichment/cache/ESPN tables
.github/workflows/        Scheduled and deploy workflows
docs/screenshots/         Current UI screenshots used in this README
```

---

## Tech Stack

- **Frontend:** Next.js 14, React 18, Tailwind CSS, Framer Motion, Recharts, Supabase JS
- **Pipelines:** Python 3.11, OpenAI SDK, Requests, Pandas, scikit-learn, Supabase Python client
- **LLM garnish:** optional only; disabled by default for the production pipeline
- **Data sources:** ESPN Cricinfo APIs (primary, free/unlimited), The Odds API, Cricsheet, CricAPI (optional)
- **Hosting:** GitHub Pages via Actions

---

## License

MIT
