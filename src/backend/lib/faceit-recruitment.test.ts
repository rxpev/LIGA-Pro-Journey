import assert from 'node:assert/strict';
import { Constants, TierSlug } from '@liga/shared';
import {
  applyCareerPeakTierFloor,
  getFaceitRecruitmentBand,
  getFaceitRecruitmentPerformance,
  getFaceitRecruitmentPlan,
  isFaceitRecruitmentSpotFit,
  rollFaceitTrialGoal,
  rollFaceitTrialSeries,
  shouldOfferPermanentDeal,
  getFollowUpPermanentOfferChance,
  shouldOfferFollowUpPermanentDeal,
} from './faceit-recruitment';

assert.equal(rollFaceitTrialSeries(0), 3);
assert.equal(rollFaceitTrialSeries(0.999), 5);
assert.deepEqual(rollFaceitTrialGoal('AWPER', 0), { type: 'RATING', value: 1.4 });
assert.deepEqual(rollFaceitTrialGoal('RIFLER', 0.999), { type: 'RATING', value: 1.5 });
assert.deepEqual(rollFaceitTrialGoal('IGL', 0.999), { type: 'WIN_RATE', value: 100 });
assert.equal(shouldOfferPermanentDeal('excellent', 0.24), true);
assert.equal(shouldOfferPermanentDeal('excellent', 0.25), false);
assert.equal(shouldOfferPermanentDeal('absurd', 0.49), true);
assert.equal(shouldOfferPermanentDeal('adequate', 0), false);
assert.equal(
  getFollowUpPermanentOfferChance({
    band: 'good',
    teamTier: TierSlug.LEAGUE_OPEN,
    permanentStints: 0,
  }),
  15,
);
assert.equal(
  getFollowUpPermanentOfferChance({
    band: 'excellent',
    teamTier: TierSlug.LEAGUE_ADVANCED,
    permanentStints: 2,
    outcomeBoost: 5,
  }),
  35,
);
assert.equal(
  getFollowUpPermanentOfferChance({
    band: 'absurd',
    teamTier: TierSlug.LEAGUE_OPEN,
    permanentStints: 10,
    outcomeBoost: 10,
  }),
  75,
);
assert.equal(
  getFollowUpPermanentOfferChance({
    band: 'poor',
    teamTier: TierSlug.LEAGUE_OPEN,
    permanentStints: 10,
    outcomeBoost: 10,
  }),
  0,
);
assert.equal(
  shouldOfferFollowUpPermanentDeal(
    { band: 'good', teamTier: TierSlug.LEAGUE_MAIN, permanentStints: 0 },
    0.049,
  ),
  true,
);
assert.deepEqual(
  applyCareerPeakTierFloor(
    {
      [TierSlug.LEAGUE_MAIN]: 55,
      [TierSlug.LEAGUE_ADVANCED]: 40,
      [TierSlug.LEAGUE_PRO]: 5,
    },
    Constants.Prestige.indexOf(TierSlug.LEAGUE_PRO),
    'excellent',
  ),
  { [TierSlug.LEAGUE_ADVANCED]: 40, [TierSlug.LEAGUE_PRO]: 5 },
);
assert.deepEqual(
  applyCareerPeakTierFloor(
    {
      [TierSlug.LEAGUE_MAIN]: 55,
      [TierSlug.LEAGUE_ADVANCED]: 40,
      [TierSlug.LEAGUE_PRO]: 5,
    },
    Constants.Prestige.indexOf(TierSlug.LEAGUE_PRO),
    'adequate',
  ),
  {
    [TierSlug.LEAGUE_MAIN]: 55,
    [TierSlug.LEAGUE_ADVANCED]: 40,
    [TierSlug.LEAGUE_PRO]: 5,
  },
);
assert.deepEqual(
  applyCareerPeakTierFloor(
    { [TierSlug.LEAGUE_OPEN]: 100 },
    Constants.Prestige.indexOf(TierSlug.LEAGUE_PRO),
    'good',
  ),
  {},
);
assert.deepEqual(
  applyCareerPeakTierFloor(
    { [TierSlug.LEAGUE_OPEN]: 75, [TierSlug.LEAGUE_INTERMEDIATE]: 25 },
    Constants.Prestige.indexOf(TierSlug.LEAGUE_PRO),
    'poor',
  ),
  { [TierSlug.LEAGUE_OPEN]: 75, [TierSlug.LEAGUE_INTERMEDIATE]: 25 },
);

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
