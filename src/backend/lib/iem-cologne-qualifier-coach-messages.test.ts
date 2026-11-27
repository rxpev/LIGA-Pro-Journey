import assert from 'node:assert/strict';
import { FederationSlug, TierSlug } from '@liga/shared';
import {
  getIemCologneQualifierCoachMessage,
  getIemCologneQualifierCoachSubject,
} from './iem-cologne-qualifier-coach-messages';

for (const teamTierSlug of [
  TierSlug.LEAGUE_OPEN,
  TierSlug.LEAGUE_INTERMEDIATE,
  TierSlug.LEAGUE_MAIN,
  TierSlug.LEAGUE_ADVANCED,
  TierSlug.LEAGUE_PRO,
]) {
  for (const outcome of ['start', 'eliminated', 'winner'] as const) {
    assert.ok(getIemCologneQualifierCoachMessage({ teamTierSlug, outcome }));
  }
}

assert.equal(
  getIemCologneQualifierCoachSubject({
    federationSlug: FederationSlug.ESPORTS_AMERICAS,
    season: 6,
  }),
  'Americas IEM Cologne Open Qualifier — Season 6',
);
assert.equal(
  getIemCologneQualifierCoachMessage({ teamTierSlug: TierSlug.CCT_SERIES, outcome: 'start' }),
  null,
);
