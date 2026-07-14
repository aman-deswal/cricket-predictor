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
3. **Predict** — Daily at 6 AM UTC, generate win probabilities using GPT-4o-mini (3x ensemble, JSON mode)
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
| `OPENAI_API_KEY` | OpenAI API key for GPT-4o-mini |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_KEY` | Supabase anon/service key |
| `CRICAPI_KEY` | CricAPI key for fixtures/results |

## Tech Stack

- **Pipeline**: Python 3.11, OpenAI SDK, Supabase client, pandas, scikit-learn
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
