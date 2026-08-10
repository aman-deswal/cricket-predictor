import { strict as assert } from 'node:assert';
import { getMatchFormatLabel } from '../src/lib/competition';

assert.equal(
  getMatchFormatLabel({
    match_type: 'cricket',
    competition_name: 'ICC Cricket World Cup League 2',
    name: 'Nepal vs Scotland',
  }),
  'ODI',
  'generic cricket must resolve to ODI when the competition is clearly one-day cricket',
);

assert.equal(
  getMatchFormatLabel({
    match_type: 'cricket',
    competition_name: 'Indian Premier League',
    name: 'Mumbai Indians vs Chennai Super Kings',
  }),
  'T20',
  'league context must surface a concrete T20 format badge',
);

assert.equal(
  getMatchFormatLabel({
    match_type: 'cricket',
    competition_name: 'The Hundred Men\'s Competition',
    name: 'Oval Invincibles vs Southern Brave',
  }),
  '100-BALL',
  'The Hundred must never collapse into a generic cricket label',
);

assert.equal(
  getMatchFormatLabel({
    match_type: 'cricket',
    competition_name: undefined,
    name: 'Unknown Fixture',
  }),
  'FORMAT TBD',
  'generic cricket without better context must fail safely instead of leaking CRICKET to the UI',
);

console.log('Match format requirements passed');
