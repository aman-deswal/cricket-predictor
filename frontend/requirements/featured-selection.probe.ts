import { strict as assert } from 'node:assert';
import {
  FeaturedCandidate,
  getFeaturedCompositeScore,
  selectFeaturedMatch,
} from '../src/lib/featured-selection';

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

const richEvidence: Partial<FeaturedCandidate> = {
  venue: 'Providence Stadium',
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
};

const completeEvidence: Partial<FeaturedCandidate> = {
  venue: 'Known Ground',
  spotlight_signals: {
    has_expert_preview: true,
    has_espn_context: true,
    h2h_match_count: 5,
    source_link_count: 4,
    key_player_count: 6,
    possible_xi_player_count: 16,
    player_update_count: 4,
  },
  team1_recent_form: ['W', 'L', 'W', 'W', 'L'],
  team2_recent_form: ['L', 'W', 'L', 'W', 'W'],
};

const equalBlendEvidence: Partial<FeaturedCandidate> = {
  venue: 'Known Ground',
  spotlight_signals: {
    has_expert_preview: true,
    has_espn_context: true,
    h2h_match_count: 5,
    source_link_count: 2,
  },
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
    candidate('featured-no-squad', 4, {
      name: 'Ireland vs Afghanistan, ODI',
      team1: 'Ireland',
      team2: 'Afghanistan',
      competition_name: 'ODI Series',
      spotlight_signals: {
        has_expert_preview: true,
        has_espn_context: true,
        h2h_match_count: 5,
        source_link_count: 2,
        player_update_count: 2,
        possible_xi_player_count: 0,
        squad_player_count: 0,
      },
    }),
    candidate('featured-with-squad', 5, {
      name: 'Zimbabwe vs Bangladesh, ODI',
      team1: 'Zimbabwe',
      team2: 'Bangladesh',
      competition_name: 'ODI Series',
      spotlight_signals: {
        has_expert_preview: true,
        has_espn_context: true,
        h2h_match_count: 5,
        source_link_count: 2,
        player_update_count: 2,
        possible_xi_player_count: 0,
        squad_player_count: 22,
      },
    }),
  ], NOW)?.match_id,
  'featured-with-squad',
  'featured selection prefers matches with actual squad evidence over equally strong squadless candidates',
);

assert.equal(
  selectFeaturedMatch([
    candidate('sparse-established', 4, {
      name: 'Sparse match, Super Smash',
      competition_name: 'Super Smash',
    }),
    candidate('rich-established', 5, {
      name: 'Rich match, T20 Blast',
      competition_name: 'T20 Blast',
      ...richEvidence,
    }),
  ], NOW)?.match_id,
  'rich-established',
  'rich evidence wins within the same established-league tier',
);

assert.equal(
  selectFeaturedMatch([
    candidate('sparse-top-tier', 4, {
      name: 'Mumbai Indians vs Chennai Super Kings, IPL',
      competition_name: 'Indian Premier League',
    }),
    candidate('complete-associate', 5, {
      team1: 'Nepal',
      team2: 'Oman',
      ...completeEvidence,
    }),
    candidate('complete-unknown', 6, completeEvidence),
  ], NOW)?.match_id,
  'sparse-top-tier',
  'maximum completeness alone cannot displace a top-tier fixture with associate or unknown competition relevance',
);

assert.equal(
  selectFeaturedMatch([
    candidate('sparse-marquee', 4, {
      name: 'Mumbai Indians vs Chennai Super Kings, IPL',
      competition_name: 'Indian Premier League',
    }),
    candidate('rich-adjacent-tier', 5, {
      name: 'India vs Australia, 1st T20I',
      team1: 'India',
      team2: 'Australia',
      ...richEvidence,
    }),
  ], NOW)?.match_id,
  'rich-adjacent-tier',
  'strong evidence can overcome a modest canonical tier gap',
);

const sparseIpl = candidate('sparse-ipl', 4, {
  name: 'Mumbai Indians vs Chennai Super Kings, IPL',
  competition_name: 'Indian Premier League',
});
const evidencedBbl = candidate('evidenced-bbl', 5, {
  name: 'Sydney Sixers vs Perth Scorchers, BBL',
  competition_name: 'Big Bash League',
  ...equalBlendEvidence,
});

assert.equal(
  getFeaturedCompositeScore(sparseIpl),
  getFeaturedCompositeScore(evidencedBbl),
  'the boundary fixtures deliberately have equal blended relevance and evidence scores',
);

assert.equal(
  selectFeaturedMatch([sparseIpl, evidencedBbl], NOW)?.match_id,
  'evidenced-bbl',
  'equal blended scores resolve through evidence completeness before later tie-breaks',
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
