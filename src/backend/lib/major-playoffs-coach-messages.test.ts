import assert from 'node:assert/strict';
import { TierSlug } from '@liga/shared';
import {
  getMajorPlayoffsCoachMessage,
  getMajorPlayoffsCoachSubject,
} from './major-playoffs-coach-messages';

const allTiers = [
  TierSlug.LEAGUE_OPEN,
  TierSlug.LEAGUE_INTERMEDIATE,
  TierSlug.LEAGUE_MAIN,
  TierSlug.LEAGUE_ADVANCED,
  TierSlug.LEAGUE_PRO,
];

for (const region of ['Europe', 'Americas'] as const) {
  for (const teamTierSlug of allTiers) {
    for (const outcome of [
      'start',
      'quarterfinal_loss',
      'semifinal_loss',
      'semifinal_win',
    ] as const) {
      assert.ok(
        getMajorPlayoffsCoachMessage({ region, teamTierSlug, outcome, city: 'Test City' }),
      );
    }
    for (const losingScore of [0, 1, 2]) {
      assert.ok(
        getMajorPlayoffsCoachMessage({
          region,
          teamTierSlug,
          outcome: 'final_loss',
          losingScore,
          city: 'Test City',
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
    for (const outcome of [
      'start',
      'quarterfinal_loss',
      'semifinal_loss',
      'semifinal_win',
    ] as const) {
      assert.ok(getMajorPlayoffsCoachMessage({ region, teamTierSlug, outcome }));
    }
    for (const losingScore of [0, 1, 2]) {
      assert.ok(
        getMajorPlayoffsCoachMessage({
          region,
          teamTierSlug,
          outcome: 'final_loss',
          losingScore,
        }),
      );
    }
  }
}

assert.equal(getMajorPlayoffsCoachSubject(11), 'Major Playoffs — Season 11');
