import assert from 'node:assert/strict';
import { Constants, TierSlug } from '@liga/shared';
import {
  getFaceitRecruitmentBand,
  getFaceitRecruitmentPerformance,
  getFaceitRecruitmentPlan,
  isFaceitRecruitmentSpotFit,
} from './faceit-recruitment';

assert.equal(getFaceitRecruitmentBand(getFaceitRecruitmentPerformance(1, 50)), 'poor');
assert.equal(getFaceitRecruitmentBand(getFaceitRecruitmentPerformance(1.3, 70)), 'poor');
assert.equal(getFaceitRecruitmentBand(getFaceitRecruitmentPerformance(1.8, 70)), 'good');
assert.equal(getFaceitRecruitmentBand(getFaceitRecruitmentPerformance(2.3, 75)), 'excellent');
assert.equal(getFaceitRecruitmentBand(getFaceitRecruitmentPerformance(2.8, 80)), 'absurd');
assert.equal(getFaceitRecruitmentBand(getFaceitRecruitmentPerformance(1.61, 100)), 'adequate');

const euBelowLevelTen = getFaceitRecruitmentPlan({
  federation: Constants.FederationSlug.ESPORTS_EUROPA,
  matchCount: 25,
  elo: 2000,
  xp: 35,
  kd: 2,
  winRatePct: 90,
});
assert.equal(euBelowLevelTen?.eligible, false);

const euRankedProspect = getFaceitRecruitmentPlan({
  federation: Constants.FederationSlug.ESPORTS_EUROPA,
  matchCount: 8,
  elo: 2001,
  xp: 35,
  kd: 2.8,
  winRatePct: 80,
});
assert.equal(euRankedProspect?.eligible, true);
assert.equal(euRankedProspect?.offerChance, 65);
assert.equal(euRankedProspect?.tierWeights[TierSlug.LEAGUE_OPEN], 50);
assert.equal(euRankedProspect?.tierWeights[TierSlug.LEAGUE_MAIN], 5);

const euCeiling = getFaceitRecruitmentPlan({
  federation: Constants.FederationSlug.ESPORTS_EUROPA,
  matchCount: 25,
  elo: 2150,
  xp: 20,
  kd: 1.8,
  winRatePct: 65,
});
assert.equal(euCeiling?.eligible, true);
assert.equal(euCeiling?.guaranteed, true);

const oceBelowLevelTen = getFaceitRecruitmentPlan({
  federation: Constants.FederationSlug.ESPORTS_OCE,
  matchCount: 5,
  elo: 1750,
  xp: 20,
  kd: 1.3,
  winRatePct: 70,
});
assert.equal(oceBelowLevelTen?.eligible, true);
assert.deepEqual(oceBelowLevelTen?.tierWeights, { [TierSlug.LEAGUE_OPEN]: 100 });

const asiaAdvanced = getFaceitRecruitmentPlan({
  federation: Constants.FederationSlug.ESPORTS_ASIA,
  matchCount: 10,
  elo: 2200,
  xp: 20,
  kd: 1.3,
  winRatePct: 70,
});
assert.equal(asiaAdvanced?.tierWeights[TierSlug.LEAGUE_ADVANCED], 100);

const ordinaryProspect = { band: 'good' as const, projectedXp: 20, minimumStarterRatio: 0.93 };
assert.equal(
  isFaceitRecruitmentSpotFit(ordinaryProspect, [{ xp: 40, officialMaps: 10, officialRating: 0.9 }]),
  true,
  'an underperforming incumbent is vulnerable regardless of their FACEIT ELO',
);
assert.equal(
  isFaceitRecruitmentSpotFit(ordinaryProspect, [
    { xp: 40, officialMaps: 10, officialRating: 1.21 },
  ]),
  false,
  'a strong official performer is protected when the prospect is not ability-competitive',
);

console.log('faceit recruitment tests passed');
