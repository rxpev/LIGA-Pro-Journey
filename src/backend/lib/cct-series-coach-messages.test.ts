import assert from 'node:assert/strict';
import { FederationSlug, TierSlug } from '@liga/shared';
import {
  getCctSeriesCoachMessage,
  getCctSeriesCoachSubject,
  getCctOceaniaGroupOutcome,
  getCctSeriesRegion,
  getCctSeriesSwissOutcome,
} from './cct-series-coach-messages';

for (const region of ['Europe', 'Americas'] as const) {
  for (const teamTierSlug of [
    TierSlug.LEAGUE_OPEN,
    TierSlug.LEAGUE_INTERMEDIATE,
    TierSlug.LEAGUE_MAIN,
  ]) {
    for (const outcome of [
      'start',
      'playoff_qualified',
      'quarterfinal_loss',
      'semifinal_loss',
      'final_loss',
      'champion',
    ] as const) {
      assert.ok(
        getCctSeriesCoachMessage({ region, teamTierSlug, outcome, city: 'Test City' }),
      );
    }
    for (const wins of [0, 1, 2]) {
      assert.ok(
        getCctSeriesCoachMessage({
          region,
          teamTierSlug,
          outcome: 'swiss_eliminated',
          wins,
          city: 'Test City',
        }),
      );
    }
  }
}

assert.equal(getCctSeriesRegion(FederationSlug.ESPORTS_EUROPA), 'Europe');
assert.equal(getCctSeriesRegion(FederationSlug.ESPORTS_ASIA), 'Asia');
for (const teamTierSlug of [TierSlug.LEAGUE_OPEN, TierSlug.LEAGUE_ADVANCED]) {
  for (const outcome of [
    'start',
    'playoff_qualified',
    'quarterfinal_loss',
    'semifinal_loss',
    'final_loss',
    'champion',
  ] as const) {
    assert.ok(
      getCctSeriesCoachMessage({ region: 'Asia', teamTierSlug, outcome, city: 'Test City' }),
    );
  }
  for (const wins of [0, 1, 2]) {
    assert.ok(
      getCctSeriesCoachMessage({
        region: 'Asia',
        teamTierSlug,
        outcome: 'swiss_eliminated',
        wins,
      }),
    );
  }
}
for (const teamTierSlug of [TierSlug.LEAGUE_OPEN, TierSlug.LEAGUE_ADVANCED]) {
  for (const outcome of [
    'start',
    'group_eliminated',
    'playoff_qualified',
    'semifinal_loss',
    'final_loss',
    'champion',
  ] as const) {
    assert.ok(getCctSeriesCoachMessage({ region: 'Oceania', teamTierSlug, outcome }));
  }
}
assert.equal(
  getCctOceaniaGroupOutcome({ wins: 2, losses: 1, lostThisBatch: false }),
  'playoff_qualified',
);
assert.equal(
  getCctOceaniaGroupOutcome({ wins: 1, losses: 2, lostThisBatch: true }),
  'group_eliminated',
);
assert.equal(
  getCctSeriesSwissOutcome({ wins: 3, losses: 2, lostThisBatch: false }),
  'playoff_qualified',
);
assert.equal(
  getCctSeriesSwissOutcome({ wins: 2, losses: 3, lostThisBatch: true }),
  'swiss_eliminated',
);
assert.equal(getCctSeriesCoachSubject({ region: 'Americas', season: 4 }), 'Americas CCT Series — Season 4');
