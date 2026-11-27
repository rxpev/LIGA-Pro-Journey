import assert from 'node:assert/strict';
import { TierSlug } from '@liga/shared';
import {
  getIemCologneCoachMessage,
  getIemCologneCoachSubject,
} from './iem-cologne-coach-messages';

const tiers = [
  TierSlug.LEAGUE_OPEN,
  TierSlug.LEAGUE_INTERMEDIATE,
  TierSlug.LEAGUE_MAIN,
  TierSlug.LEAGUE_ADVANCED,
  TierSlug.LEAGUE_PRO,
];

for (const teamTierSlug of tiers) {
  for (const outcome of [
    'start',
    'upper_final_win',
    'quarterfinal_qualified',
    'quarterfinal_loss',
    'semifinal_loss',
    'final_loss',
    'champion',
  ] as const) {
    assert.ok(getIemCologneCoachMessage({ teamTierSlug, outcome }));
  }
  for (const eliminationStage of ['lower_round_1', 'lower_semifinal', 'lower_final'] as const) {
    assert.ok(
      getIemCologneCoachMessage({
        teamTierSlug,
        outcome: 'group_eliminated',
        eliminationStage,
      }),
    );
  }
}

assert.equal(getIemCologneCoachSubject(4), 'IEM Cologne — Season 4');
assert.equal(
  getIemCologneCoachMessage({
    teamTierSlug: TierSlug.LEAGUE_OPEN,
    outcome: 'group_eliminated',
  }),
  null,
);
