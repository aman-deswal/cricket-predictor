import { strict as assert } from 'node:assert';
import {
  buildPreMatchMovement,
  SIXSENSE_SERIES_ID,
  toNormalizedImpliedProbability,
} from '../src/lib/pre-match-movement';

const modelHistory = [
  {
    team1_win_probability: 0.54,
    team2_win_probability: 0.46,
    captured_at: '2026-08-10T00:00:00Z',
  },
  {
    team1_win_probability: 0.61,
    team2_win_probability: 0.39,
    captured_at: '2026-08-10T04:00:00Z',
    change_events: [{
      event_at: '2026-08-10T03:55:00Z',
      category: 'market',
      type: 'market_price_changed',
      label: 'Bet365 market input changed',
      summary: 'The refreshed market input coincided with the model move.',
      affected_input: 'market_odds',
      relationship: 'coincided_input_change' as const,
      probability_delta: 0.07,
      source: { name: 'Bet365', reference: 'match_odds' },
    }],
  },
];
const marketHistory = [
  {
    team1_odds: 2,
    team2_odds: 2,
    draw_odds: null,
    fetched_at: '2026-08-10T01:00:00Z',
  },
  {
    team1_odds: 1.8,
    team2_odds: 2.2,
    draw_odds: null,
    fetched_at: '2026-08-10T04:00:00Z',
  },
];

const movement = buildPreMatchMovement(
  modelHistory,
  [{ id: 'bet365', bookmaker: 'Bet365', color: '#22d3ee', history: marketHistory }],
  'team1',
);

assert.deepEqual(
  movement.series.map((series) => [series.id, series.kind]),
  [[SIXSENSE_SERIES_ID, 'model'], ['bet365', 'market']],
  'model and market series are explicitly distinguished',
);
assert.equal(movement.chartRows.length, 3, 'shared timestamps merge into one chart row');
assert.deepEqual(
  movement.chartRows.map((row) => row.timestamp),
  [...movement.chartRows.map((row) => row.timestamp)].sort((a, b) => Number(a) - Number(b)),
  'movement rows are chronological',
);
assert.equal(movement.chartRows[2][SIXSENSE_SERIES_ID], 61);
assert.equal(movement.modelPointCount, 2);
assert.equal(movement.marketPointCount, 2);
assert.equal(movement.annotations.length, 1, 'only snapshots with actual move attribution get chart markers');
assert.equal(movement.events.length, 1, 'stored events are shaped without inventing extra attribution');
assert.equal(movement.events[0].label, 'Bet365 market input changed');
assert.equal(movement.events[0].display_probability_delta, 0.07);

const noVig = toNormalizedImpliedProbability(marketHistory[1], 'team1');
assert.ok(noVig !== null && noVig > 54 && noVig < 56, 'market probability removes the two-sided overround');

const marketOnly = buildPreMatchMovement(
  [],
  [{ id: 'bet365', bookmaker: 'Bet365', color: '#22d3ee', history: marketHistory }],
  'team2',
);
assert.equal(marketOnly.series.length, 1, 'market history remains visible without model history');
assert.equal(marketOnly.series[0].kind, 'market');

const modelOnly = buildPreMatchMovement(modelHistory, [], 'team2');
assert.equal(modelOnly.series.length, 1, 'model history remains visible without market history');
assert.equal(modelOnly.chartRows[0][SIXSENSE_SERIES_ID], 46);
assert.equal(
  modelOnly.events[0].display_probability_delta,
  -0.07,
  'stored team-one deltas are inverted when the chart tracks team two',
);

const syntheticCurrentOnly = buildPreMatchMovement([{
  team1_win_probability: 0.75,
  team2_win_probability: 0.25,
  captured_at: '2026-08-11T19:00:00Z',
  synthetic_current: true,
}], [], 'team2');
assert.equal(syntheticCurrentOnly.series.length, 1, 'synthetic current model point still renders the model series');
assert.equal(syntheticCurrentOnly.annotations.length, 0, 'synthetic current model points do not invent move annotations');
assert.equal(syntheticCurrentOnly.chartRows[0][SIXSENSE_SERIES_ID], 25);

const unchangedCadence = buildPreMatchMovement([
  {
    team1_win_probability: 0.52,
    team2_win_probability: 0.48,
    captured_at: '2026-08-11T18:00:00Z',
  },
  {
    team1_win_probability: 0.52,
    team2_win_probability: 0.48,
    captured_at: '2026-08-11T19:00:00Z',
    change_events: [],
  },
], [], 'team1');
assert.equal(unchangedCadence.modelPointCount, 2, 'unchanged snapshots still render multiple model points across time');
assert.equal(unchangedCadence.annotations.length, 0, 'unchanged snapshots do not invent a move annotation');
assert.equal(unchangedCadence.events.length, 0, 'unchanged snapshots do not add fallback attribution noise');

const empty = buildPreMatchMovement([], [], 'team1');
assert.deepEqual(empty.chartRows, []);
assert.deepEqual(empty.series, []);

console.log('Pre-match movement requirements passed');
