alter table stats_cache enable row level security;

drop policy if exists "Allow public read stats_cache" on stats_cache;
create policy "Allow public read stats_cache"
on stats_cache for select
using (true);