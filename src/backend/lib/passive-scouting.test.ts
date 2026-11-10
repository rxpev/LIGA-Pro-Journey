import assert from 'node:assert/strict';
import { Constants, TierSlug } from '@liga/shared';
import {
  getPassiveCareerLevel,
  getPassivePermanentOfferChance,
  getPassiveTierWeights,
  getOfficialScoutingPlan,
  getOfficialScoutingQuality,
  hasOfficialScoutingCapacity,
  OfficialScoutingEvidence,
} from './passive-scouting';

const zeroEvidence: OfficialScoutingEvidence = {
  maps: 0,
  matches: 0,
  rating: null,
  daysSinceLastMatch: null,
  lanMapShare: 0,
  eventPrestige: 0,
};
const oneMatchEvidence: OfficialScoutingEvidence = {
  maps: 2,
  matches: 1,
  rating: 0.95,
  daysSinceLastMatch: 3,
  lanMapShare: 0,
  eventPrestige: 0.6,
};
assert.deepEqual(
  getOfficialScoutingPlan({ evidence: zeroEvidence, quality: 0, transferListed: false }),
  { band: 'inactive', weeklyChance: 0, seasonMin: 0, seasonMax: 0 },
);
const lowPlan = getOfficialScoutingPlan({
  evidence: oneMatchEvidence,
  quality: 0.2,
  transferListed: false,
});
assert.equal(lowPlan.band, 'low');
assert.equal(lowPlan.seasonMax, 1);
assert.ok(lowPlan.weeklyChance >= 0.5 && lowPlan.weeklyChance <= 2);
const strongLanQuality = getOfficialScoutingQuality({
  evidence: {
    maps: 20,
    matches: 8,
    rating: 1.3,
    daysSinceLastMatch: 3,
    lanMapShare: 0.8,
    eventPrestige: 1.5,
  },
  promotionCount: 1,
  titleReputation: 1.5,
  majorWinner: false,
});
const staleQuality = getOfficialScoutingQuality({
  evidence: {
    maps: 20,
    matches: 8,
    rating: 1.3,
    daysSinceLastMatch: 120,
    lanMapShare: 0.8,
    eventPrestige: 1.5,
  },
  promotionCount: 1,
  titleReputation: 1.5,
  majorWinner: false,
});
assert.ok(strongLanQuality > 0.75);
assert.ok(staleQuality < strongLanQuality);
const exceptionalPlan = getOfficialScoutingPlan({
  evidence: {
    maps: 20,
    matches: 8,
    rating: 1.3,
    daysSinceLastMatch: 3,
    lanMapShare: 0.8,
    eventPrestige: 1.5,
  },
  quality: strongLanQuality,
  transferListed: false,
});
assert.equal(exceptionalPlan.band, 'exceptional');
assert.equal(exceptionalPlan.seasonMin, 4);
assert.equal(exceptionalPlan.seasonMax, 6);
assert.ok(exceptionalPlan.weeklyChance >= 9 && exceptionalPlan.weeklyChance <= 13);
assert.equal(hasOfficialScoutingCapacity(exceptionalPlan, 5), true);
assert.equal(hasOfficialScoutingCapacity(exceptionalPlan, 6), false);
const listedPlan = getOfficialScoutingPlan({
  evidence: oneMatchEvidence,
  quality: 0.2,
  transferListed: true,
});
assert.equal(listedPlan.band, 'strong');
assert.equal(listedPlan.seasonMax, 4);
assert.equal(hasOfficialScoutingCapacity(listedPlan, 4), false);
const stalePlan = getOfficialScoutingPlan({
  evidence: {
    maps: 20,
    matches: 8,
    rating: 1.3,
    daysSinceLastMatch: 120,
    lanMapShare: 0.8,
    eventPrestige: 1.5,
  },
  quality: staleQuality,
  transferListed: false,
});
assert.equal(stalePlan.band, 'low');
assert.equal(stalePlan.seasonMax, 1);
assert.equal(
  getPassiveCareerLevel({
    permanentStints: 0,
    peakTier: null,
    majorWinner: false,
    prestige: Constants.Prestige,
  }),
  'BEGINNER',
);
assert.equal(
  getPassiveCareerLevel({
    permanentStints: 1,
    peakTier: Constants.Prestige.indexOf(TierSlug.LEAGUE_MAIN),
    majorWinner: false,
    prestige: Constants.Prestige,
  }),
  TierSlug.LEAGUE_MAIN,
);
assert.equal(
  getPassiveCareerLevel({
    permanentStints: 1,
    peakTier: Constants.Prestige.indexOf(TierSlug.LEAGUE_OPEN),
    majorWinner: true,
    prestige: Constants.Prestige,
  }),
  TierSlug.LEAGUE_PRO,
);
assert.deepEqual(getPassiveTierWeights({ level: 'BEGINNER', attention: 1 }), {
  [TierSlug.LEAGUE_OPEN]: 100,
});
assert.deepEqual(getPassiveTierWeights({ level: TierSlug.LEAGUE_MAIN, attention: 0.8 }), {
  [TierSlug.LEAGUE_INTERMEDIATE]: 1,
  [TierSlug.LEAGUE_MAIN]: 65,
  [TierSlug.LEAGUE_ADVANCED]: 34,
});
assert.ok(
  getPassivePermanentOfferChance({
    level: TierSlug.LEAGUE_ADVANCED,
    attention: 0.8,
    permanentStints: 3,
  }) >
    getPassivePermanentOfferChance({
      level: 'BEGINNER',
      attention: 0.5,
      permanentStints: 0,
    }),
);

console.log('passive scouting tests passed');
