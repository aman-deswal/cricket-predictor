-- Create tables for player data pipeline
-- Run this in Supabase SQL editor

-- Squad / Playing XI
CREATE TABLE IF NOT EXISTS match_squads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id text NOT NULL,
  team text NOT NULL,
  players jsonb DEFAULT '[]'::jsonb,
  is_confirmed boolean DEFAULT false,
  source text DEFAULT 'cricapi_fantasy',
  fetched_at timestamptz DEFAULT now(),
  UNIQUE(match_id, team)
);

-- Player stats cache
CREATE TABLE IF NOT EXISTS player_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_name text NOT NULL,
  player_id text,
  team text,
  format text NOT NULL,  -- t20i, odi, test, t20
  role text,
  batting_avg decimal DEFAULT 0,
  batting_sr decimal DEFAULT 0,
  batting_innings int DEFAULT 0,
  batting_runs int DEFAULT 0,
  batting_highest text DEFAULT '0',
  batting_fifties int DEFAULT 0,
  batting_hundreds int DEFAULT 0,
  bowling_avg decimal DEFAULT 0,
  bowling_economy decimal DEFAULT 0,
  bowling_wickets int DEFAULT 0,
  bowling_innings int DEFAULT 0,
  bowling_best text DEFAULT '',
  bowling_five_wickets int DEFAULT 0,
  matches_played int DEFAULT 0,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(player_name, team, format)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_match_squads_match_id ON match_squads(match_id);
CREATE INDEX IF NOT EXISTS idx_player_stats_team_format ON player_stats(team, format);
CREATE INDEX IF NOT EXISTS idx_player_stats_player_name ON player_stats(player_name);

-- Also create match_odds table (for the odds integration PR)
CREATE TABLE IF NOT EXISTS match_odds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id text,
  bookmaker text,
  team1_odds decimal,
  team2_odds decimal,
  draw_odds decimal,
  market text DEFAULT 'h2h',
  fetched_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_match_odds_match_id ON match_odds(match_id);
