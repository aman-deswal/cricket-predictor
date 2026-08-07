-- Persistent franchise logo lookup used across all match cards
-- Run this in your Supabase SQL editor

CREATE TABLE IF NOT EXISTS franchise_logos (
    normalized_team_name TEXT PRIMARY KEY,
    team_name TEXT NOT NULL,
    team_abbr TEXT,
    logo_url TEXT NOT NULL,
    competition_name TEXT,
    fetched_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_franchise_logos_team_abbr ON franchise_logos(team_abbr);

ALTER TABLE franchise_logos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access on franchise_logos"
    ON franchise_logos FOR SELECT
    USING (true);

-- Seed the IPL teams we know immediately so the app never falls back to flags
INSERT INTO franchise_logos (
    normalized_team_name, team_name, team_abbr, logo_url, competition_name, fetched_at, updated_at
) VALUES
    (
        'mumbai indians',
        'Mumbai Indians',
        'MI',
        'https://upload.wikimedia.org/wikipedia/en/thumb/c/cd/Mumbai_Indians_Logo.svg/1280px-Mumbai_Indians_Logo.svg.png',
        'Indian Premier League',
        NOW(),
        NOW()
    ),
    (
        'chennai super kings',
        'Chennai Super Kings',
        'CSK',
        'https://upload.wikimedia.org/wikipedia/en/thumb/2/2b/Chennai_Super_Kings_Logo.svg/1280px-Chennai_Super_Kings_Logo.svg.png',
        'Indian Premier League',
        NOW(),
        NOW()
    )
ON CONFLICT (normalized_team_name) DO UPDATE SET
    team_name = EXCLUDED.team_name,
    team_abbr = EXCLUDED.team_abbr,
    logo_url = EXCLUDED.logo_url,
    competition_name = EXCLUDED.competition_name,
    updated_at = NOW();
