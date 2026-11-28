import assert from 'node:assert/strict';
import {
  EseaAsiaOpenCoachOutcome,
  getEseaAsiaOpenCoachMessage,
  getEseaAsiaOpenCoachSubject,
  getEseaAsiaOpenRegularSeasonOutcome,
} from './esea-asia-open-coach-messages';

for (const outcome of [
  'start',
  'missed_playoffs_and_cct',
  'missed_playoffs_cct_qualified',
  'playoff_qualified',
  'quarterfinal_loss',
  'semifinal_loss',
  'final_loss',
  'champion',
] satisfies EseaAsiaOpenCoachOutcome[]) {
  assert.ok(getEseaAsiaOpenCoachMessage(outcome));
}

assert.equal(
  getEseaAsiaOpenRegularSeasonOutcome({ groupPosition: 3, overallPosition: 8 }),
  'playoff_qualified',
);
assert.equal(
  getEseaAsiaOpenRegularSeasonOutcome({ groupPosition: 4, overallPosition: 11 }),
  'missed_playoffs_cct_qualified',
);
assert.equal(
  getEseaAsiaOpenRegularSeasonOutcome({ groupPosition: 5, overallPosition: 9 }),
  'missed_playoffs_and_cct',
);
assert.equal(getEseaAsiaOpenCoachSubject(5), 'Asia ESEA Open — Season 5');

