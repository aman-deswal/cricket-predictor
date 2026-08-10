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
    UNIQUE(match_id, bookmaker, fetched_at)
);

CREATE INDEX IF NOT EXISTS idx_match_odds_history_lookup
    ON match_odds_history(match_id, bookmaker, fetched_at DESC);

ALTER TABLE match_odds_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access on match_odds_history"
    ON match_odds_history FOR SELECT
    USING (true);

-- The existing pipeline credential can append only the exact snapshot it just
-- wrote to match_odds. No public update/delete policy exists.
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
