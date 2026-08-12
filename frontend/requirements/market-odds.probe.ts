import { strict as assert } from 'node:assert';
import { normalizeBookmaker, selectFreshestTrustedSportsbookOdds } from '../src/lib/market-odds';

const rows = [
  { bookmaker: 'Paddy Power', team1_odds: 1.4, team2_odds: 3.2, fetched_at: '2026-08-12T06:00:00Z' },
  { bookmaker: 'Betfair', team1_odds: 1.42, team2_odds: 3.1, fetched_at: '2026-08-12T06:00:00Z' },
  { bookmaker: 'Paddy Power', team1_odds: 1.02, team2_odds: 11, fetched_at: '2026-08-12T08:00:00Z' },
  { bookmaker: 'Betfair', team1_odds: 1.03, team2_odds: 10.5, fetched_at: '2026-08-12T08:00:00Z' },
  { bookmaker: 'Untracked Book', team1_odds: 1.01, team2_odds: 15, fetched_at: '2026-08-12T09:00:00Z' },
];

const freshest = selectFreshestTrustedSportsbookOdds(rows);
assert.equal(freshest.length, 2, 'only trusted books from the freshest cohort are selected');
assert.deepEqual(
  freshest.map((row) => normalizeBookmaker(row.bookmaker)),
  ['paddypower', 'betfair'],
  'freshest trusted books are ordered by configured priority inside the latest cohort',
);
assert.equal(freshest[0].team1_odds, 1.02);
assert.equal(freshest[1].team1_odds, 1.03);

const staleButHigherPriority = selectFreshestTrustedSportsbookOdds([
  { bookmaker: 'DraftKings', team1_odds: 1.5, team2_odds: 2.6, fetched_at: '2026-08-12T05:00:00Z' },
  { bookmaker: 'Betfair', team1_odds: 1.35, team2_odds: 3.4, fetched_at: '2026-08-12T07:00:00Z' },
]);
assert.equal(staleButHigherPriority.length, 1, 'stale higher-priority books are excluded from the current cohort');
assert.equal(normalizeBookmaker(staleButHigherPriority[0].bookmaker), 'betfair');

console.log('Market odds requirements passed');
