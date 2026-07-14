# 🏏 Cricket Predictor

AI-powered cricket match outcome predictor using GPT-4o-mini, historical stats, and automated pipelines.

## Architecture

```
┌─────────────────┐     ┌──────────────┐     ┌─────────────────┐
│  GitHub Actions │────▶│   Pipeline   │────▶│    Supabase     │
│   (Scheduled)   │     │   (Python)   │     │   (Database)    │
└─────────────────┘     └──────────────┘     └────────┬────────┘
                                                       │
                              ┌─────────────────┐      │
                              │    Frontend      │◀─────┘
                              │  (Next.js SSG)   │
                              │  GitHub Pages    │
                              └─────────────────┘
```

## How It Works

1. **Fetch Fixtures** — Every 6 hours, pull upcoming T20I/IPL matches from CricAPI
2. **Compute Stats** — Generate rolling team/player/venue statistics from Cricsheet data
3. **Predict** — Daily at 6 AM UTC, generate win probabilities using GPT-4o via GitHub Models (5x ensemble, JSON mode)
4. **Fetch Results** — Every 2 hours, check completed matches and score predictions
5. **Calibrate** — After 50+ predictions, apply isotonic regression for calibration

## Local Setup

### Pipeline

```bash
cd pipeline
python -m venv venv
source venv/bin/activate
pip install -r ../requirements.txt
cp ../.env.example ../.env  # Fill in your API keys
```

Build local Cricsheet historical CSVs for prediction context:

```bash
python pipeline/fetch_cricsheet.py --types t20s odis
```

### Frontend

```bash
cd frontend
npm install
cp .env.example .env.local  # Fill in Supabase credentials
npm run dev
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `GITHUB_TOKEN` | GitHub token for accessing GitHub Models API (free, auto-available in Actions) |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_KEY` | Supabase anon/service key |
| `CRICAPI_KEY` | CricAPI key for fixtures/results |

> **Note:** This project uses [GitHub Models](https://github.com/marketplace/models) (GPT-4o via `models.github.ai`) instead of a paid OpenAI API key. In GitHub Actions, `GITHUB_TOKEN` is automatically available. For local development, use a GitHub PAT with `models:read` scope.

## Tech Stack

- **Pipeline**: Python 3.11, OpenAI SDK (GitHub Models compatible), Supabase client, pandas, scikit-learn
- **Frontend**: Next.js 14, Tailwind CSS, Recharts, Supabase JS
- **Database**: Supabase (PostgreSQL)
- **Deployment**: GitHub Actions + GitHub Pages
- **Data Sources**: CricAPI (live), Cricsheet (historical)

## Supabase Tables

- `matches` — Upcoming and completed match fixtures
- `predictions` — Model predictions with probabilities and reasoning
- `prediction_results` — Scored predictions with actual outcomes
- `stats_cache` — Precomputed team/player statistics

## License

MIT
