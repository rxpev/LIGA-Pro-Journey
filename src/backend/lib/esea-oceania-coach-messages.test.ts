import assert from 'node:assert/strict';
import { TierSlug } from '@liga/shared';
import {
  getEseaOceaniaCoachMessage,
  getEseaOceaniaCoachSubject,
} from './esea-oceania-coach-messages';

for (const outcome of [
  'start',
  'regular_eliminated',
  'playoff_qualified',
  'quarterfinal_loss',
  'semifinal_loss',
  'final_loss',
  'champion',
] as const) {
  assert.ok(getEseaOceaniaCoachMessage({ tierSlug: TierSlug.LEAGUE_OPEN, outcome }));
}

for (const outcome of [
  'start',
  'regular_eliminated',
  'relegation_required',
  'relegation_won',
  'relegated',
  'playoff_qualified',
  'quarterfinal_loss',
  'quarterfinal_loss_cct',
  'semifinal_loss',
  'final_loss',
  'champion',
] as const) {
  assert.ok(
    getEseaOceaniaCoachMessage({
      tierSlug: TierSlug.LEAGUE_ADVANCED,
      outcome,
      city: 'Test City',
    }),
  );
}

assert.match(
  getEseaOceaniaCoachMessage({
    tierSlug: TierSlug.LEAGUE_ADVANCED,
    outcome: 'champion',
    city: 'Test City',
  }) ?? '',
  /Test City/,
);
assert.equal(
  getEseaOceaniaCoachMessage({
    tierSlug: TierSlug.LEAGUE_INTERMEDIATE,
    outcome: 'start',
  }),
  null,
);
assert.equal(getEseaOceaniaCoachSubject(3), 'Oceania ESEA Season 3');

