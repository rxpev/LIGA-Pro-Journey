import assert from 'node:assert/strict';
import { FederationSlug } from '@liga/shared';
import {
  EseaEuAmericasOpenCoachOutcome,
  getEseaEuAmericasOpenCoachMessage,
  getEseaEuAmericasOpenCoachSubject,
  getEseaEuAmericasOpenRegion,
} from './esea-eu-americas-open-coach-messages';

for (const outcome of [
  'start',
  'missed_playoffs',
  'playoff_qualified',
  'round_of_16_loss',
  'quarterfinal_loss',
  'semifinal_loss',
  'final_loss',
  'champion',
] satisfies EseaEuAmericasOpenCoachOutcome[]) {
  assert.ok(getEseaEuAmericasOpenCoachMessage(outcome));
}

assert.equal(getEseaEuAmericasOpenRegion(FederationSlug.ESPORTS_EUROPA), 'Europe');
assert.equal(getEseaEuAmericasOpenRegion(FederationSlug.ESPORTS_AMERICAS), 'Americas');
assert.equal(getEseaEuAmericasOpenRegion(FederationSlug.ESPORTS_ASIA), null);
assert.equal(
  getEseaEuAmericasOpenCoachSubject({ region: 'Europe', season: 4 }),
  'Europe ESEA Open — Season 4',
);

