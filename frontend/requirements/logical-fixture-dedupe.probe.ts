import { strict as assert } from 'node:assert';
import {
  MatchWithPredictions,
  matchesRepresentSameLogicalFixture,
  mergeLogicalSurfaceMatches,
} from '../src/lib/supabase';

function candidate(matchId: string, overrides: Partial<MatchWithPredictions>): MatchWithPredictions {
  return {
    match_id: matchId,
    name: `${matchId} fixture`,
    team1: 'Saint Lucia Kings',
    team2: 'Barbados Royals',
    date: '2026-08-16T23:00:00Z',
    venue: '',
    match_type: 'T20',
    status: 'upcoming',
    predictions: [],
    ...overrides,
  };
}

const cricbuzz = candidate('cricbuzz-1a1a6148534b5f4c', {
  team1: 'Saint Lucia Kings',
  team2: 'Barbados Royals',
  venue: 'Daren Sammy National Cricket Stadium',
  bookmaker_odds: { bookmaker: 'Betfair', team1_odds: 1.7, team2_odds: 2.1 },
  predictions: [{
    match_id: 'cricbuzz-1a1a6148534b5f4c',
    team1: 'Saint Lucia Kings',
    team2: 'Barbados Royals',
    predicted_winner: 'Saint Lucia Kings',
    team1_win_probability: 0.58,
    team2_win_probability: 0.42,
    confidence: 'medium',
    reasoning: 'Trusted odds and squad context are available.',
    model: 'deterministic-core',
    ensemble_size: 1,
  }],
  spotlight_signals: {
    possible_xi_player_count: 18,
    source_link_count: 1,
  },
  team1_recent_form: ['W', 'W', 'L'],
  team2_recent_form: ['L', 'W', 'L'],
});

const espn = candidate('espn-1534187', {
  team1: 'St Lucia Kings',
  team2: 'Barbados Tridents',
  date: '2026-08-16T22:30:00Z',
  spotlight_signals: {
    has_espn_context: true,
    has_expert_preview: true,
    h2h_match_count: 5,
    source_link_count: 2,
  },
});

assert.equal(
  matchesRepresentSameLogicalFixture(cricbuzz, espn),
  true,
  'CPL source aliases should resolve to the same logical fixture',
);

const mergedCpl = mergeLogicalSurfaceMatches([cricbuzz, espn]);
assert.equal(mergedCpl.length, 1, 'split-source CPL rows collapse into one app-visible match');
assert.equal(mergedCpl[0].match_id, 'cricbuzz-1a1a6148534b5f4c', 'the richer sportsbook-backed row remains the surfaced primary match');
assert.equal(Boolean(mergedCpl[0].bookmaker_odds), true, 'merged match keeps trusted odds from the richer row');
assert.equal(mergedCpl[0].spotlight_signals?.has_espn_context, true, 'merged match keeps ESPN context from the sibling row');
assert.equal(mergedCpl[0].spotlight_signals?.has_expert_preview, true, 'merged match keeps expert preview signals from the sibling row');

const hongKong = candidate('cricbuzz-be7445532a7ca58e', {
  team1: 'Hong Kong',
  team2: 'Italy',
  date: '2026-08-18T09:00:00Z',
});
const italy = candidate('espn-1546351', {
  team1: 'Italy',
  team2: 'Hong Kong',
  date: '2026-08-18T09:30:00Z',
});

assert.equal(
  mergeLogicalSurfaceMatches([hongKong, italy]).length,
  1,
  'nearby Hong Kong versus Italy duplicates also collapse into one logical fixture',
);

console.log('Logical fixture dedupe requirements passed');
