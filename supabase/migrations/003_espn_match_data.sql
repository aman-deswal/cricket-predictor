-- ESPN Cricinfo data table
-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS espn_match_data (
    match_id TEXT PRIMARY KEY REFERENCES matches(match_id) ON DELETE CASCADE,
    espn_event_id TEXT,

    -- Venue (verified, not AI-guessed)
    venue_name TEXT,
    venue_city TEXT,
    venue_country TEXT,
    venue_capacity INTEGER,
    venue_grass BOOLEAN,
    venue_image_url TEXT,
    venue_espn_id TEXT,

    -- Toss
    toss_winner TEXT,
    toss_decision TEXT,

    -- Schedule info
    match_number TEXT,
    match_days TEXT,
    hours_of_play TEXT,
    series_note TEXT,

    -- Rich JSON data
    officials JSONB DEFAULT '[]'::jsonb,
    rosters JSONB DEFAULT '[]'::jsonb,
    head_to_head JSONB DEFAULT '[]'::jsonb,
    scorecards JSONB DEFAULT '[]'::jsonb,
    standings JSONB DEFAULT '[]'::jsonb,

    fetched_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_espn_match_data_event_id ON espn_match_data(espn_event_id);

-- Enable RLS (read-only for anon)
ALTER TABLE espn_match_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access on espn_match_data"
    ON espn_match_data FOR SELECT
    USING (true);
