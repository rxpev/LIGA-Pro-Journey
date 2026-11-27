import assert from 'node:assert/strict';
import { TierSlug } from '@liga/shared';
import { getIemKrakowCoachMessage, getIemKrakowCoachSubject } from './iem-krakow-coach-messages';

for (const teamTierSlug of [
  TierSlug.LEAGUE_OPEN,
  TierSlug.LEAGUE_INTERMEDIATE,
  TierSlug.LEAGUE_MAIN,
  TierSlug.LEAGUE_ADVANCED,
  TierSlug.LEAGUE_PRO,
]) {
  for (const outcome of [
    'start',
    'upper_final_win',
    'quarterfinal_qualified',
    'quarterfinal_loss',
    'semifinal_loss',
    'final_loss',
    'champion',
  ] as const) {
    assert.ok(getIemKrakowCoachMessage({ teamTierSlug, outcome }));
  }
  for (const eliminationStage of ['lower_round_1', 'lower_semifinal', 'lower_final'] as const) {
    assert.ok(
      getIemKrakowCoachMessage({
        teamTierSlug,
        outcome: 'group_eliminated',
        eliminationStage,
      }),
    );
  }
}

assert.equal(getIemKrakowCoachSubject(9), 'IEM Krakow — Season 9');
