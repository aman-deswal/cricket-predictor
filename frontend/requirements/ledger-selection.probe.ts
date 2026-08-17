import { strict as assert } from 'node:assert';
import { selectLedgerEntries, type LedgerEntry } from '../src/lib/ledger';

const NOW = new Date('2026-08-16T12:00:00Z');

function entry(
  matchId: string,
  scope: 'international' | 'league',
  daysAgo: number,
  overrides: Partial<LedgerEntry> = {},
): LedgerEntry {
  const isInternational = scope === 'international';
  const [team1, team2] = isInternational
    ? ['India', 'Australia']
    : ['Mumbai Indians', 'Chennai Super Kings'];

  return {
    match_id: matchId,
    name: `${team1} vs ${team2}`,
    team1,
    team2,
    date: new Date(NOW.getTime() - daysAgo * 24 * 60 * 60 * 1000).toISOString(),
    venue: 'Known venue',
    match_type: 'T20',
    status: 'completed',
    predicted_winner: team1,
    actual_winner: team1,
    correct: true,
    confidence: 'medium',
    team1_win_probability: 0.61,
    team2_win_probability: 0.39,
    predicted_probability: 0.61,
    result_text: `${team1} won comfortably`,
    scored_at: new Date(NOW.getTime() - daysAgo * 24 * 60 * 60 * 1000).toISOString(),
    competition_name: isInternational ? 'Bilateral series' : 'League Finals',
    series_scoreline: 'Series level 1-1',
    scorecards: [{ team_name: team1, total: { runs: 178, wickets: 5 } }],
    bookmaker_odds: { bookmaker: 'Bet365', team1_odds: 1.8, team2_odds: 2.05 },
    edge_score: { net_edge: 6.5, edge_team: team1 },
    ...overrides,
  };
}

const internationalPool = [
  entry('intl-win-1', 'international', 1),
  entry('intl-loss-1', 'international', 2, {
    correct: false,
    actual_winner: 'Australia',
    result_text: 'Australia won by 4 wickets',
  }),
  entry('intl-win-2', 'international', 3),
  entry('intl-win-3', 'international', 4),
];

const leaguePool = [
  entry('league-1', 'league', 1, { competition_name: 'Same League' }),
  entry('league-2', 'league', 2, { competition_name: 'Same League' }),
  entry('league-3', 'league', 3, { competition_name: 'Same League' }),
  entry('league-4', 'league', 4, { competition_name: 'Different League' }),
];

const intlSelection = selectLedgerEntries(internationalPool, 'international', NOW);
assert.equal(intlSelection.length, 3, 'returns three international cards when enough data exists');
assert.ok(intlSelection.some((candidate) => !candidate.correct), 'includes at least one miss when misses exist');

const leagueSelection = selectLedgerEntries(leaguePool, 'league', NOW);
assert.equal(leagueSelection.length, 3, 'returns three league cards when enough data exists');
assert.ok(
  leagueSelection.filter((candidate) => candidate.competition_name === 'Same League').length <= 2,
  'caps a visible trio to two cards from the same competition when alternatives exist',
);

const sparseSelection = selectLedgerEntries([entry('only-one', 'league', 1)], 'league', NOW);
assert.equal(sparseSelection.length, 1, 'returns sparse sets without inventing filler');

console.log('Ledger selection requirements passed');
