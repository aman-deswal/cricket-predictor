create table if not exists match_enrichment (
  match_id text primary key references matches(match_id) on delete cascade,
  venue_name text,
  venue_confidence text not null default 'unknown',
  possible_xi jsonb not null default '{"team1": [], "team2": []}'::jsonb,
  player_updates jsonb not null default '[]'::jsonb,
  expert_preview text,
  source_links jsonb not null default '[]'::jsonb,
  confidence text not null default 'low',
  generated_at timestamptz not null default now()
);

alter table match_enrichment enable row level security;

drop policy if exists "Allow public read match_enrichment" on match_enrichment;
create policy "Allow public read match_enrichment"
on match_enrichment for select
using (true);