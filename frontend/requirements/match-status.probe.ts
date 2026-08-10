import { strict as assert } from 'node:assert';
import { getMatchStatusPresentation } from '../src/lib/match-status';

assert.deepEqual(
  getMatchStatusPresentation('live'),
  { kind: 'live', label: 'LIVE', showCountdown: false },
  'canonical live status renders LIVE and never an upcoming countdown',
);

assert.deepEqual(
  getMatchStatusPresentation('upcoming'),
  { kind: 'upcoming', label: 'UPCOMING', showCountdown: true },
  'canonical upcoming status preserves countdown behavior',
);

assert.deepEqual(
  getMatchStatusPresentation('completed'),
  { kind: 'completed', label: 'FINAL', showCountdown: false },
  'canonical completed status remains final without an upcoming countdown',
);

assert.notEqual(
  getMatchStatusPresentation('live').label,
  getMatchStatusPresentation('completed').label,
  'canonical live status cannot render as final',
);

console.log('Match detail status requirements passed');
