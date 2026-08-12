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
  CONSTRAINT match_odds_history_snapshot_key
    UNIQUE(match_id, bookmaker, fetched_at)
);

CREATE INDEX IF NOT EXISTS idx_match_odds_history_lookup
  ON match_odds_history(match_id, bookmaker, fetched_at DESC);

CREATE OR REPLACE FUNCTION match_odds_history_matches_latest(
  candidate_match_id text,
  candidate_bookmaker text,
  candidate_team1_odds decimal,
  candidate_team2_odds decimal,
  candidate_draw_odds decimal,
  candidate_market text,
  candidate_fetched_at timestamptz
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM match_odds latest
    WHERE latest.match_id = candidate_match_id
      AND latest.bookmaker = candidate_bookmaker
      AND latest.team1_odds IS NOT DISTINCT FROM candidate_team1_odds
      AND latest.team2_odds IS NOT DISTINCT FROM candidate_team2_odds
      AND latest.draw_odds IS NOT DISTINCT FROM candidate_draw_odds
      AND latest.market IS NOT DISTINCT FROM candidate_market
      AND latest.fetched_at = candidate_fetched_at
      AND latest.fetched_at = (
        SELECT MAX(snapshot.fetched_at)
        FROM match_odds snapshot
        WHERE snapshot.match_id = candidate_match_id
          AND snapshot.bookmaker = candidate_bookmaker
      )
  );
$$;

CREATE OR REPLACE FUNCTION enforce_match_odds_history_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT match_odds_history_matches_latest(
    NEW.match_id,
    NEW.bookmaker,
    NEW.team1_odds,
    NEW.team2_odds,
    NEW.draw_odds,
    NEW.market,
    NEW.fetched_at
  ) THEN
    RAISE EXCEPTION 'match_odds_history must match the latest match_odds snapshot';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_match_odds_history_snapshot
  ON match_odds_history;
CREATE TRIGGER enforce_match_odds_history_snapshot
  BEFORE INSERT ON match_odds_history
  FOR EACH ROW
  EXECUTE FUNCTION enforce_match_odds_history_snapshot();

ALTER TABLE match_odds_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access on match_odds_history"
  ON match_odds_history FOR SELECT
  USING (true);

CREATE POLICY "Allow matching snapshot inserts on match_odds_history"
  ON match_odds_history FOR INSERT
  WITH CHECK (
    match_odds_history_matches_latest(
      match_id,
      bookmaker,
      team1_odds,
      team2_odds,
      draw_odds,
      market,
      fetched_at
    )
  );

REVOKE ALL ON TABLE match_odds_history FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON TABLE match_odds_history TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION match_odds_history_matches_latest(
  text, text, decimal, decimal, decimal, text, timestamptz
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION match_odds_history_matches_latest(
  text, text, decimal, decimal, decimal, text, timestamptz
) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION enforce_match_odds_history_snapshot() FROM PUBLIC;

-- Append-only deterministic prediction history. The predictions table remains
-- the source of truth for the latest row consumed by existing surfaces.
CREATE TABLE IF NOT EXISTS prediction_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id text NOT NULL,
  team1 text NOT NULL,
  team2 text NOT NULL,
  predicted_winner text NOT NULL,
  team1_win_probability decimal NOT NULL
    CHECK (team1_win_probability >= 0 AND team1_win_probability <= 1),
  team2_win_probability decimal NOT NULL
    CHECK (team2_win_probability >= 0 AND team2_win_probability <= 1),
  confidence text NOT NULL CHECK (confidence IN ('low', 'medium', 'high')),
  edge_score jsonb NOT NULL,
  model text NOT NULL,
  ensemble_size integer NOT NULL,
  input_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  change_events jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(change_events) = 'array'),
  captured_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prediction_snapshots_lookup
  ON prediction_snapshots(match_id, captured_at ASC);

CREATE OR REPLACE FUNCTION append_prediction_snapshot(
  candidate_match_id text,
  candidate_team1 text,
  candidate_team2 text,
  candidate_predicted_winner text,
  candidate_team1_win_probability decimal,
  candidate_team2_win_probability decimal,
  candidate_confidence text,
  candidate_edge_score jsonb,
  candidate_model text,
  candidate_ensemble_size integer,
  candidate_input_state jsonb,
  candidate_change_events jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  latest prediction_snapshots%ROWTYPE;
  probability_delta decimal;
  attributed_events jsonb;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(candidate_match_id));

  IF NOT EXISTS (
    SELECT 1
    FROM matches fixture
    WHERE fixture.match_id::text = candidate_match_id
      AND fixture.status = 'upcoming'
      AND fixture.date > clock_timestamp()
  ) THEN
    RETURN FALSE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM predictions current_prediction
    WHERE current_prediction.match_id::text = candidate_match_id
      AND current_prediction.team1 IS NOT DISTINCT FROM candidate_team1
      AND current_prediction.team2 IS NOT DISTINCT FROM candidate_team2
      AND current_prediction.predicted_winner IS NOT DISTINCT FROM candidate_predicted_winner
      AND current_prediction.team1_win_probability::decimal
        IS NOT DISTINCT FROM candidate_team1_win_probability
      AND current_prediction.team2_win_probability::decimal
        IS NOT DISTINCT FROM candidate_team2_win_probability
      AND current_prediction.confidence IS NOT DISTINCT FROM candidate_confidence
      AND current_prediction.model IS NOT DISTINCT FROM candidate_model
      AND current_prediction.ensemble_size IS NOT DISTINCT FROM candidate_ensemble_size
  ) THEN
    RAISE EXCEPTION 'prediction snapshot must match the latest prediction';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM match_edge_scores authoritative_edge
    WHERE authoritative_edge.match_id::text = candidate_match_id
      AND jsonb_build_object(
        'team1_score', authoritative_edge.team1_score,
        'team2_score', authoritative_edge.team2_score,
        'net_edge', authoritative_edge.net_edge,
        'edge_team', authoritative_edge.edge_team,
        'narrative', authoritative_edge.narrative,
        'factors', authoritative_edge.factors
      ) IS NOT DISTINCT FROM candidate_edge_score
  ) THEN
    RAISE EXCEPTION 'prediction snapshot must match the authoritative edge score';
  END IF;

  SELECT *
  INTO latest
  FROM prediction_snapshots
  WHERE match_id = candidate_match_id
  ORDER BY captured_at DESC, id DESC
  LIMIT 1;

  IF latest.id IS NOT NULL
     AND latest.predicted_winner IS NOT DISTINCT FROM candidate_predicted_winner
     AND latest.team1_win_probability IS NOT DISTINCT FROM candidate_team1_win_probability
     AND latest.team2_win_probability IS NOT DISTINCT FROM candidate_team2_win_probability
     AND latest.confidence IS NOT DISTINCT FROM candidate_confidence
     AND latest.edge_score IS NOT DISTINCT FROM candidate_edge_score THEN
    RETURN FALSE;
  END IF;

  probability_delta := CASE
    WHEN latest.id IS NULL THEN NULL
    ELSE candidate_team1_win_probability - latest.team1_win_probability
  END;
  SELECT COALESCE(
    jsonb_agg(
      event || jsonb_build_object('probability_delta', probability_delta)
    ),
    '[]'::jsonb
  )
  INTO attributed_events
  FROM jsonb_array_elements(COALESCE(candidate_change_events, '[]'::jsonb)) event;

  INSERT INTO prediction_snapshots (
    match_id,
    team1,
    team2,
    predicted_winner,
    team1_win_probability,
    team2_win_probability,
    confidence,
    edge_score,
    model,
    ensemble_size,
    input_state,
    change_events
  ) VALUES (
    candidate_match_id,
    candidate_team1,
    candidate_team2,
    candidate_predicted_winner,
    candidate_team1_win_probability,
    candidate_team2_win_probability,
    candidate_confidence,
    candidate_edge_score,
    candidate_model,
    candidate_ensemble_size,
    COALESCE(candidate_input_state, '{}'::jsonb),
    attributed_events
  );

  RETURN TRUE;
END;
$$;

ALTER TABLE prediction_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access on prediction_snapshots"
  ON prediction_snapshots FOR SELECT
  USING (true);

REVOKE ALL ON TABLE prediction_snapshots FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE prediction_snapshots TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION append_prediction_snapshot(
  text, text, text, text, decimal, decimal, text, jsonb, text, integer, jsonb, jsonb
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION append_prediction_snapshot(
  text, text, text, text, decimal, decimal, text, jsonb, text, integer, jsonb, jsonb
) TO service_role;
