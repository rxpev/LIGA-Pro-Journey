import assert from 'node:assert/strict';
import { FederationSlug, TierSlug } from '@liga/shared';
import {
  getIemKrakowQualifierCoachMessage,
  getIemKrakowQualifierCoachSubject,
} from './iem-krakow-qualifier-coach-messages';

for (const teamTierSlug of [
  TierSlug.LEAGUE_OPEN,
  TierSlug.LEAGUE_INTERMEDIATE,
  TierSlug.LEAGUE_MAIN,
  TierSlug.LEAGUE_ADVANCED,
  TierSlug.LEAGUE_PRO,
]) {
  for (const outcome of ['start', 'eliminated', 'winner'] as const) {
    assert.ok(getIemKrakowQualifierCoachMessage({ teamTierSlug, outcome }));
  }
}

assert.equal(
  getIemKrakowQualifierCoachSubject({
    federationSlug: FederationSlug.ESPORTS_ASIA,
    season: 7,
  }),
  'Asia IEM Krakow Open Qualifier — Season 7',
);
assert.equal(
  getIemKrakowQualifierCoachMessage({ teamTierSlug: TierSlug.CCT_SERIES, outcome: 'start' }),
  null,
);
