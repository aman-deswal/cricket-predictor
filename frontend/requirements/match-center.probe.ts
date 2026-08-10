import { strict as assert } from 'node:assert';
import { compareMatchCenterMatches } from '../src/lib/competition';

function match(
  matchId: string,
  overrides: Partial<{
    competition_name: string;
    status: string;
    date: string;
  }> = {},
) {
  return {
    match_id: matchId,
    name: `${matchId} match`,
    team1: `${matchId} one`,
    team2: `${matchId} two`,
    date: '2026-08-10T12:00:00Z',
    match_type: 'T20',
    status: 'upcoming',
    ...overrides,
  };
}

assert.ok(
  compareMatchCenterMatches(
    match('live-unknown', { status: 'live' }),
    match('upcoming-ipl', { competition_name: 'Indian Premier League' }),
  ) > 0,
  'a low-tier live match should not outrank a marquee upcoming fixture',
);

assert.ok(
  compareMatchCenterMatches(
    match('live-ipl', { status: 'live', competition_name: 'Indian Premier League' }),
    match('upcoming-ipl-2', { competition_name: 'Indian Premier League' }),
  ) < 0,
  'live fixtures should still outrank upcoming fixtures within the same tier',
);

assert.ok(
  compareMatchCenterMatches(
    match('live-unknown-a', { status: 'live' }),
    match('live-unknown-b', { status: 'live', competition_name: 'Bangladesh Premier League' }),
  ) > 0,
  'more recognizable live leagues should still rank ahead of obscure live fixtures',
);

console.log('Match center ranking requirements passed');
