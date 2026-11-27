import assert from 'node:assert/strict';
import { FederationSlug, TierSlug } from '@liga/shared';
import {
  getEseaCashCupCoachMessage,
  getEseaCashCupCoachSubject,
} from './esea-cash-cup-coach-messages';

for (const federationSlug of [
  FederationSlug.ESPORTS_EUROPA,
  FederationSlug.ESPORTS_AMERICAS,
  FederationSlug.ESPORTS_ASIA,
  FederationSlug.ESPORTS_OCE,
]) {
  for (const outcome of ['start', 'eliminated', 'winner'] as const) {
    assert.ok(
      getEseaCashCupCoachMessage({ federationSlug, teamTierSlug: TierSlug.LEAGUE_OPEN, outcome }),
    );
  }
}

for (const federationSlug of [
  FederationSlug.ESPORTS_EUROPA,
  FederationSlug.ESPORTS_AMERICAS,
]) {
  assert.ok(
    getEseaCashCupCoachMessage({
      federationSlug,
      teamTierSlug: TierSlug.LEAGUE_INTERMEDIATE,
      outcome: 'start',
    }),
  );
  assert.equal(
    getEseaCashCupCoachMessage({
      federationSlug,
      teamTierSlug: TierSlug.LEAGUE_ADVANCED,
      outcome: 'start',
    }),
    null,
  );
}

for (const federationSlug of [FederationSlug.ESPORTS_ASIA, FederationSlug.ESPORTS_OCE]) {
  assert.ok(
    getEseaCashCupCoachMessage({
      federationSlug,
      teamTierSlug: TierSlug.LEAGUE_ADVANCED,
      outcome: 'winner',
    }),
  );
  assert.equal(
    getEseaCashCupCoachMessage({
      federationSlug,
      teamTierSlug: TierSlug.LEAGUE_INTERMEDIATE,
      outcome: 'winner',
    }),
    null,
  );
}

assert.equal(
  getEseaCashCupCoachSubject({ federationSlug: FederationSlug.ESPORTS_OCE, season: 3 }),
  'Oceania ESEA Cash Cup — Season 3',
);
