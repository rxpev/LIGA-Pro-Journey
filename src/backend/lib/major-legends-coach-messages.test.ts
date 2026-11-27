import assert from 'node:assert/strict';
import { TierSlug } from '@liga/shared';
import {
  getMajorLegendsCoachOutcome,
  getMajorLegendsCoachSubject,
  getMajorLegendsOutcomeMessage,
  getMajorLegendsStartMessage,
} from './major-legends-coach-messages';

const allTiers = [
  TierSlug.LEAGUE_OPEN,
  TierSlug.LEAGUE_INTERMEDIATE,
  TierSlug.LEAGUE_MAIN,
  TierSlug.LEAGUE_ADVANCED,
  TierSlug.LEAGUE_PRO,
];

for (const region of ['Europe', 'Americas'] as const) {
  for (const teamTierSlug of allTiers) {
    assert.ok(getMajorLegendsStartMessage({ region, teamTierSlug, entryPath: 'promoted' }));
    assert.ok(
      getMajorLegendsStartMessage({ region, teamTierSlug, entryPath: 'direct', city: 'Test City' }),
    );
    assert.ok(getMajorLegendsOutcomeMessage({ region, teamTierSlug, outcome: 'qualified' }));
    for (const wins of [0, 1, 2]) {
      assert.ok(getMajorLegendsOutcomeMessage({ region, teamTierSlug, outcome: 'eliminated', wins }));
    }
  }
}

for (const region of ['Asia', 'Oceania'] as const) {
  for (const teamTierSlug of [
    TierSlug.LEAGUE_OPEN,
    TierSlug.LEAGUE_ADVANCED,
    TierSlug.LEAGUE_PRO,
  ]) {
    assert.ok(getMajorLegendsStartMessage({ region, teamTierSlug, entryPath: 'promoted' }));
    assert.equal(getMajorLegendsStartMessage({ region, teamTierSlug, entryPath: 'direct' }), null);
    assert.ok(getMajorLegendsOutcomeMessage({ region, teamTierSlug, outcome: 'qualified' }));
    for (const wins of [0, 1, 2]) {
      assert.ok(getMajorLegendsOutcomeMessage({ region, teamTierSlug, outcome: 'eliminated', wins }));
    }
  }
}

assert.equal(
  getMajorLegendsCoachOutcome({ standing: { wins: 3, losses: 2 }, lostThisBatch: false }),
  'qualified',
);
assert.equal(
  getMajorLegendsCoachOutcome({ standing: { wins: 2, losses: 3 }, lostThisBatch: true }),
  'eliminated',
);
assert.equal(
  getMajorLegendsCoachOutcome({ standing: { wins: 2, losses: 2 }, lostThisBatch: true }),
  null,
);
assert.equal(getMajorLegendsCoachSubject(8), 'Major Legends Stage — Season 8');
