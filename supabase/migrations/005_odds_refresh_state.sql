-- Persist successful paid odds refreshes at provider-sport grain.
-- Empty responses still update this state without changing match_odds rows.

CREATE TABLE IF NOT EXISTS odds_refresh_state (
    sport_key TEXT PRIMARY KEY,
    refreshed_at TIMESTAMPTZ NOT NULL,
    event_count INTEGER NOT NULL DEFAULT 0,
    quota_used INTEGER,
    quota_remaining INTEGER,
    quota_last INTEGER,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
