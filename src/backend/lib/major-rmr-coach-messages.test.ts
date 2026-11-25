import assert from 'node:assert/strict';
import { TierSlug } from '@liga/shared';
import {
  getMajorRmrCoachMessage,
  getMajorRmrCoachOutcome,
  getMajorRmrCoachSubject,
  getMajorRmrConfig,
  MAJOR_RMR_CONFIG,
} from './major-rmr-coach-messages';

const allCoachTiers = [
  TierSlug.LEAGUE_OPEN,
  TierSlug.LEAGUE_INTERMEDIATE,
  TierSlug.LEAGUE_MAIN,
  TierSlug.LEAGUE_ADVANCED,
  TierSlug.LEAGUE_PRO,
];

assert.equal(Object.keys(MAJOR_RMR_CONFIG).length, 4);

for (const rmrTierSlug of [
  TierSlug.MAJOR_EUROPE_RMR_A,
  TierSlug.MAJOR_EUROPE_RMR_B,
  TierSlug.MAJOR_AMERICAS_RMR,
]) {
  for (const teamTierSlug of allCoachTiers) {
    assert.match(
      getMajorRmrCoachMessage({
        rmrTierSlug,
        teamTierSlug,
        outcome: 'start',
        city: 'Test City',
      }) ?? '',
      /Test City/,
    );
    assert.match(
      getMajorRmrCoachMessage({
        rmrTierSlug,
        teamTierSlug,
        outcome: 'qualified',
        city: 'Major City',
      }) ?? '',
      /Major City/,
    );
    for (const wins of [0, 1, 2]) {
      assert.ok(
        getMajorRmrCoachMessage({
          rmrTierSlug,
          teamTierSlug,
          outcome: 'eliminated',
          wins,
        }),
      );
    }
  }
}

for (const teamTierSlug of [TierSlug.LEAGUE_OPEN, TierSlug.LEAGUE_ADVANCED]) {
  for (const outcome of ['start', 'qualified'] as const) {
    assert.ok(
      getMajorRmrCoachMessage({
        rmrTierSlug: TierSlug.MAJOR_ASIA_RMR,
        teamTierSlug,
        outcome,
        city: 'Shanghai',
      }),
    );
  }
  for (const wins of [0, 1, 2]) {
    assert.ok(
      getMajorRmrCoachMessage({
        rmrTierSlug: TierSlug.MAJOR_ASIA_RMR,
        teamTierSlug,
        outcome: 'eliminated',
        wins,
      }),
    );
  }
}

for (const teamTierSlug of [
  TierSlug.LEAGUE_INTERMEDIATE,
  TierSlug.LEAGUE_MAIN,
  TierSlug.LEAGUE_PRO,
]) {
  assert.equal(
    getMajorRmrCoachMessage({
      rmrTierSlug: TierSlug.MAJOR_ASIA_RMR,
      teamTierSlug,
      outcome: 'start',
      city: 'Shanghai',
    }),
    null,
  );
}

assert.equal(getMajorRmrConfig(TierSlug.MAJOR_EUROPE_RMR_A)?.qualificationPlaces, 8);
assert.equal(getMajorRmrConfig(TierSlug.MAJOR_AMERICAS_RMR)?.qualificationPlaces, 5);
assert.equal(getMajorRmrConfig(TierSlug.MAJOR_ASIA_RMR)?.qualificationPlaces, 3);

assert.equal(
  getMajorRmrCoachOutcome({
    rmrTierSlug: TierSlug.MAJOR_EUROPE_RMR_A,
    standing: { wins: 3, losses: 1, pos: 4 },
    lostThisBatch: false,
  }),
  'qualified',
);
assert.equal(
  getMajorRmrCoachOutcome({
    rmrTierSlug: TierSlug.MAJOR_EUROPE_RMR_A,
    standing: { wins: 1, losses: 3, pos: 12 },
    lostThisBatch: true,
  }),
  'eliminated',
);
assert.equal(
  getMajorRmrCoachOutcome({
    rmrTierSlug: TierSlug.MAJOR_EUROPE_RMR_A,
    standing: { wins: 1, losses: 2, pos: 10 },
    lostThisBatch: true,
  }),
  null,
);
assert.equal(
  getMajorRmrCoachOutcome({
    rmrTierSlug: TierSlug.MAJOR_AMERICAS_RMR,
    standing: { wins: 2, losses: 2, pos: 6 },
    lostThisBatch: true,
  }),
  'eliminated',
);
assert.equal(
  getMajorRmrCoachOutcome({
    rmrTierSlug: TierSlug.MAJOR_ASIA_RMR,
    standing: { wins: 2, losses: 1, pos: 3 },
    lostThisBatch: false,
  }),
  'qualified',
);
assert.equal(
  getMajorRmrCoachOutcome({
    rmrTierSlug: TierSlug.MAJOR_ASIA_RMR,
    standing: { wins: 2, losses: 2, pos: 4 },
    lostThisBatch: true,
  }),
  'eliminated',
);
assert.equal(
  getMajorRmrCoachOutcome({
    rmrTierSlug: TierSlug.MAJOR_ASIA_RMR,
    standing: { wins: 0, losses: 1, pos: 8 },
    lostThisBatch: true,
  }),
  null,
);

assert.equal(
  getMajorRmrCoachSubject({ rmrTierSlug: TierSlug.MAJOR_AMERICAS_RMR, season: 4 }),
  'Americas RMR — Season 4',
);
assert.equal(
  getMajorRmrCoachMessage({
    rmrTierSlug: TierSlug.MAJOR_EUROPE_RMR_A,
    teamTierSlug: TierSlug.LEAGUE_OPEN,
    outcome: 'start',
    city: 'Copenhagen',
  })?.includes('CITY'),
  false,
);
