import assert from 'node:assert/strict';
import { FederationSlug, TierSlug } from '@liga/shared';
import {
  getEslChallengerCoachMessage,
  getEslChallengerCoachSubject,
  getEslChallengerGroupOutcome,
  getEslChallengerRegion,
} from './esl-challenger-coach-messages';

const entries = [
  ['Europe', TierSlug.LEAGUE_MAIN],
  ['Americas', TierSlug.LEAGUE_ADVANCED],
  ['Asia', TierSlug.LEAGUE_ADVANCED],
  ['Oceania', TierSlug.LEAGUE_ADVANCED],
] as const;

for (const [region, teamTierSlug] of entries) {
  for (const outcome of [
    'start',
    'qualified',
    'group_eliminated',
    'semifinal_loss',
    'final_loss',
    'champion',
  ] as const) {
    const message = getEslChallengerCoachMessage({
      region,
      teamTierSlug,
      outcome,
      city: 'Test City',
    });
    assert.ok(message);
    assert.equal(message.includes('CITY'), false);
  }
}

assert.equal(
  getEslChallengerCoachMessage({
    region: 'Europe',
    teamTierSlug: TierSlug.LEAGUE_ADVANCED,
    outcome: 'start',
  }),
  null,
);
assert.equal(getEslChallengerRegion(FederationSlug.ESPORTS_AMERICAS), 'Americas');
assert.equal(getEslChallengerGroupOutcome({ wins: 2, losses: 1, lostThisBatch: false }), 'qualified');
assert.equal(
  getEslChallengerGroupOutcome({ wins: 1, losses: 2, lostThisBatch: true }),
  'group_eliminated',
);
assert.equal(getEslChallengerGroupOutcome({ wins: 1, losses: 1, lostThisBatch: true }), null);
assert.equal(getEslChallengerCoachSubject(5), 'ESL Challenger — Season 5');
