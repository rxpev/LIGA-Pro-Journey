import assert from 'node:assert/strict';
import {
  EseaAsiaAdvancedCoachOutcome,
  getEseaAsiaAdvancedCoachMessage,
  getEseaAsiaAdvancedCoachSubject,
  getEseaAsiaAdvancedRegularSeasonOutcome,
} from './esea-asia-advanced-coach-messages';

for (const outcome of [
  'start',
  'missed_playoffs',
  'relegated',
  'playoff_qualified',
  'lower_round_1_loss',
  'lower_round_2_loss',
  'lower_semifinal_loss',
  'lower_final_loss',
  'final_loss',
  'champion',
] satisfies EseaAsiaAdvancedCoachOutcome[]) {
  assert.ok(getEseaAsiaAdvancedCoachMessage({ outcome, city: 'Test City' }));
}

assert.match(
  getEseaAsiaAdvancedCoachMessage({ outcome: 'champion', city: 'Test City' }),
  /Test City/,
);
assert.equal(getEseaAsiaAdvancedRegularSeasonOutcome(4), 'playoff_qualified');
assert.equal(getEseaAsiaAdvancedRegularSeasonOutcome(5), 'missed_playoffs');
assert.equal(getEseaAsiaAdvancedRegularSeasonOutcome(10), 'relegated');
assert.equal(getEseaAsiaAdvancedCoachSubject(2), 'Asia ESEA Advanced — Season 2');

