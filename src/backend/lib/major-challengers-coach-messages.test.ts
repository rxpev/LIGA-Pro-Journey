import assert from 'node:assert/strict';
import { FederationSlug, TierSlug } from '@liga/shared';
import {
  getMajorChallengersCoachMessage,
  getMajorChallengersCoachOutcome,
  getMajorChallengersCoachOutcomeMessage,
  getMajorChallengersCoachSubject,
  getMajorChallengersRegion,
} from './major-challengers-coach-messages';

const allCoachTiers = [
  TierSlug.LEAGUE_OPEN,
  TierSlug.LEAGUE_INTERMEDIATE,
  TierSlug.LEAGUE_MAIN,
  TierSlug.LEAGUE_ADVANCED,
  TierSlug.LEAGUE_PRO,
];

for (const region of ['Europe', 'Americas'] as const) {
  for (const teamTierSlug of allCoachTiers) {
    const message = getMajorChallengersCoachMessage({
      region,
      teamTierSlug,
      city: 'Test City',
    });
    assert.ok(message, `${region} ${teamTierSlug} should have a message`);
    assert.equal(message.includes('CITY'), false);
  }
}

for (const region of ['Asia', 'Oceania'] as const) {
  for (const teamTierSlug of [
    TierSlug.LEAGUE_OPEN,
    TierSlug.LEAGUE_ADVANCED,
    TierSlug.LEAGUE_PRO,
  ]) {
    assert.ok(getMajorChallengersCoachMessage({ region, teamTierSlug, city: 'Test City' }));
  }
  for (const teamTierSlug of [TierSlug.LEAGUE_INTERMEDIATE, TierSlug.LEAGUE_MAIN]) {
    assert.equal(getMajorChallengersCoachMessage({ region, teamTierSlug, city: 'Test City' }), null);
  }
}

assert.equal(getMajorChallengersRegion(FederationSlug.ESPORTS_EUROPA), 'Europe');
assert.equal(getMajorChallengersRegion(FederationSlug.ESPORTS_AMERICAS), 'Americas');
assert.equal(getMajorChallengersRegion(FederationSlug.ESPORTS_ASIA), 'Asia');
assert.equal(getMajorChallengersRegion(FederationSlug.ESPORTS_OCE), 'Oceania');
assert.equal(getMajorChallengersRegion('world'), null);
assert.equal(getMajorChallengersCoachSubject(9), 'Major Challengers Stage — Season 9');

for (const region of ['Europe', 'Americas'] as const) {
  for (const teamTierSlug of allCoachTiers) {
    assert.ok(getMajorChallengersCoachOutcomeMessage({ region, teamTierSlug, outcome: 'qualified' }));
    for (const wins of [0, 1, 2]) {
      assert.ok(
        getMajorChallengersCoachOutcomeMessage({
          region,
          teamTierSlug,
          outcome: 'eliminated',
          wins,
        }),
      );
    }
  }
}

for (const region of ['Asia', 'Oceania'] as const) {
  for (const teamTierSlug of [
    TierSlug.LEAGUE_OPEN,
    TierSlug.LEAGUE_ADVANCED,
    TierSlug.LEAGUE_PRO,
  ]) {
    assert.ok(getMajorChallengersCoachOutcomeMessage({ region, teamTierSlug, outcome: 'qualified' }));
    for (const wins of [0, 1, 2]) {
      assert.ok(
        getMajorChallengersCoachOutcomeMessage({
          region,
          teamTierSlug,
          outcome: 'eliminated',
          wins,
        }),
      );
    }
  }
}

assert.equal(
  getMajorChallengersCoachOutcome({ standing: { wins: 3, losses: 2 }, lostThisBatch: false }),
  'qualified',
);
assert.equal(
  getMajorChallengersCoachOutcome({ standing: { wins: 2, losses: 3 }, lostThisBatch: true }),
  'eliminated',
);
assert.equal(
  getMajorChallengersCoachOutcome({ standing: { wins: 2, losses: 2 }, lostThisBatch: true }),
  null,
);
