-- Append the same snapshots already fetched for match_odds so the UI can
-- render market movement without making additional provider requests.

CREATE TABLE IF NOT EXISTS match_odds_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id TEXT NOT NULL,
    bookmaker TEXT NOT NULL,
    team1_odds DECIMAL,
    team2_odds DECIMAL,
    draw_odds DECIMAL,
    market TEXT NOT NULL DEFAULT 'h2h',
    fetched_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT match_odds_history_snapshot_key
        UNIQUE(match_id, bookmaker, fetched_at)
);

CREATE INDEX IF NOT EXISTS idx_match_odds_history_lookup
    ON match_odds_history(match_id, bookmaker, fetched_at DESC);

CREATE OR REPLACE FUNCTION match_odds_history_matches_latest(
    candidate_match_id TEXT,
    candidate_bookmaker TEXT,
    candidate_team1_odds DECIMAL,
    candidate_team2_odds DECIMAL,
    candidate_draw_odds DECIMAL,
    candidate_market TEXT,
    candidate_fetched_at TIMESTAMPTZ
)
RETURNS BOOLEAN
LANGUAGE SQL
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
RETURNS TRIGGER
LANGUAGE PLPGSQL
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

-- The existing pipeline credential can append only the exact snapshot it just
-- wrote to match_odds. No public update/delete policy exists.
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

-- The shared pipeline key may be anon or service_role. Explicit privileges plus
-- the trigger keep every application credential append-only; service_role can
-- bypass RLS but cannot bypass the trigger.
REVOKE ALL ON TABLE match_odds_history FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON TABLE match_odds_history TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION match_odds_history_matches_latest(
    TEXT, TEXT, DECIMAL, DECIMAL, DECIMAL, TEXT, TIMESTAMPTZ
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION match_odds_history_matches_latest(
    TEXT, TEXT, DECIMAL, DECIMAL, DECIMAL, TEXT, TIMESTAMPTZ
) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION enforce_match_odds_history_snapshot() FROM PUBLIC;
