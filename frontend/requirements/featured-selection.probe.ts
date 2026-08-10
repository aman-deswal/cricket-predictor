import { strict as assert } from 'node:assert';
import { FeaturedCandidate, selectFeaturedMatch } from '../src/lib/featured-selection';

const NOW = Date.parse('2026-08-10T00:00:00Z');

function candidate(
  matchId: string,
  hoursFromNow: number,
  overrides: Partial<FeaturedCandidate> = {},
): FeaturedCandidate {
  return {
    match_id: matchId,
    name: `${matchId} match`,
    team1: `${matchId} one`,
    team2: `${matchId} two`,
    date: new Date(NOW + hoursFromNow * 60 * 60 * 1000).toISOString(),
    match_type: 'T20',
    status: 'upcoming',
    predictions: {
      confidence: 'medium',
      reasoning: '',
      team1_win_probability: 0.55,
      team2_win_probability: 0.45,
    },
    ...overrides,
  };
}

const validMarket = {
  bookmaker: 'Bet365',
  team1_odds: 1.9,
  team2_odds: 2.0,
};

assert.equal(
  selectFeaturedMatch([
    candidate('model-only', 4, { name: 'IPL model-only match' }),
    candidate('market-backed', 5, { bookmaker_odds: validMarket }),
  ], NOW)?.match_id,
  'market-backed',
  'valid market-backed candidates are preferred within the selected horizon',
);

assert.equal(
  selectFeaturedMatch([
    candidate('sparse-marquee', 4, {
      name: 'Mumbai Indians vs Chennai Super Kings, IPL',
      competition_name: 'Indian Premier League',
    }),
    candidate('rich-lower-tier', 5, {
      venue: 'Providence Stadium',
      predictions: {
        confidence: 'medium',
        reasoning: 'Verified recent form and matchup context support this model projection.',
        team1_win_probability: 0.55,
        team2_win_probability: 0.45,
      },
      spotlight_signals: {
        has_expert_preview: true,
        has_espn_context: true,
        h2h_match_count: 4,
        source_link_count: 3,
        key_player_count: 4,
        possible_xi_player_count: 18,
        player_update_count: 2,
      },
      team1_recent_form: ['W', 'L', 'W', 'W', 'L'],
      team2_recent_form: ['L', 'W', 'L', 'W', 'W'],
    }),
  ], NOW)?.match_id,
  'rich-lower-tier',
  'a richly evidenced lower-tier model projection beats a sparse marquee fixture',
);

assert.equal(
  selectFeaturedMatch([
    candidate('model-b', 6),
    candidate('model-a', 6),
  ], NOW)?.match_id,
  'model-a',
  'model-only candidates remain eligible and use the stable match-id tie-break',
);

assert.equal(
  selectFeaturedMatch([
    candidate('live', 2, { status: 'live', bookmaker_odds: validMarket }),
    candidate('future-model', 3),
  ], NOW)?.match_id,
  'future-model',
  'live matches are excluded',
);

assert.equal(
  selectFeaturedMatch([
    candidate('inside-24h', 23),
    candidate('market-outside-24h', 25, { bookmaker_odds: validMarket }),
  ], NOW)?.match_id,
  'inside-24h',
  'the 24-hour horizon is selected before market preference and ranking',
);

assert.equal(
  selectFeaturedMatch([
    candidate('inside-48h', 47),
    candidate('market-outside-48h', 49, { bookmaker_odds: validMarket }),
  ], NOW)?.match_id,
  'inside-48h',
  'the 48-hour fallback horizon is selected before ranking',
);

assert.equal(
  selectFeaturedMatch([
    candidate('past', -1, { bookmaker_odds: validMarket }),
    candidate('future', 72),
  ], NOW)?.match_id,
  'future',
  'all future predicted fixtures are the final staged fallback',
);

console.log('Featured selection requirements passed');
