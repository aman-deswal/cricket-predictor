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

-- Per-provider-sport paid refresh state. This remains authoritative even when
-- a successful provider response is empty and creates no match_odds rows.
CREATE TABLE IF NOT EXISTS odds_refresh_state (
  sport_key text PRIMARY KEY,
  refreshed_at timestamptz NOT NULL,
  event_count integer NOT NULL DEFAULT 0,
  quota_used integer,
  quota_remaining integer,
  quota_last integer,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Append-only snapshots power bookmaker movement charts without new API calls.
CREATE TABLE IF NOT EXISTS match_odds_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id text NOT NULL,
  bookmaker text NOT NULL,
  team1_odds decimal,
  team2_odds decimal,
  draw_odds decimal,
  market text NOT NULL DEFAULT 'h2h',
  fetched_at timestamptz NOT NULL,
  UNIQUE(match_id, bookmaker, fetched_at)
);

CREATE INDEX IF NOT EXISTS idx_match_odds_history_lookup
  ON match_odds_history(match_id, bookmaker, fetched_at DESC);

ALTER TABLE match_odds_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access on match_odds_history"
  ON match_odds_history FOR SELECT
  USING (true);

CREATE POLICY "Allow matching snapshot inserts on match_odds_history"
  ON match_odds_history FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM match_odds latest
      WHERE latest.match_id = match_odds_history.match_id
        AND latest.bookmaker = match_odds_history.bookmaker
        AND latest.team1_odds IS NOT DISTINCT FROM match_odds_history.team1_odds
        AND latest.team2_odds IS NOT DISTINCT FROM match_odds_history.team2_odds
        AND latest.draw_odds IS NOT DISTINCT FROM match_odds_history.draw_odds
        AND latest.market = match_odds_history.market
        AND latest.fetched_at = match_odds_history.fetched_at
    )
  );
