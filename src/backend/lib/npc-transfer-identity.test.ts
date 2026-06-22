import assert from 'node:assert/strict';
import {
  filterNpcTransferCompatibleCandidates,
  getLowerLeaguePromotionCandidateScore,
  getNpcTransferCompatibilityScore,
  getUserOfferFitBucket,
  getUserOfferFitScore,
  isNpcTransferCompatible,
  sortNpcTransferCandidatesByFit,
  USER_OFFER_FIT_BUCKET_WEIGHTS,
} from './npc-transfer-identity';

const continents = {
  europe: { code: 'EU', federationId: 1 },
  asia: { code: 'AS', federationId: 2 },
  southAmerica: { code: 'SA', federationId: 3 },
  northAmerica: { code: 'NA', federationId: 4 },
  oceania: { code: 'OC', federationId: 5 },
};

const countries = {
  denmark: { id: 10, country: { code: 'dk', continent: continents.europe } },
  sweden: { id: 11, country: { code: 'se', continent: continents.europe } },
  germany: { id: 12, country: { code: 'de', continent: continents.europe } },
  china: { id: 20, country: { code: 'cn', continent: continents.asia } },
  korea: { id: 21, country: { code: 'kr', continent: continents.asia } },
  brazil: { id: 30, country: { code: 'br', continent: continents.southAmerica } },
  usa: { id: 40, country: { code: 'us', continent: continents.northAmerica } },
  australia: { id: 50, country: { code: 'au', continent: continents.oceania } },
  europe: { id: 60, country: { code: 'eu', continent: continents.europe } },
  asia: { id: 61, country: { code: 'as', continent: continents.asia } },
  northAmerica: { id: 62, country: { code: 'na', continent: continents.northAmerica } },
  southAmerica: { id: 63, country: { code: 'xsa', continent: continents.southAmerica } },
  other: { id: 64, country: { code: 'other', continent: continents.oceania } },
};

const tiers = {
  open: 0,
  advanced: 3,
  pro: 4,
};

function player(id: number, country: (typeof countries)[keyof typeof countries], xp = 50) {
  return {
    id,
    countryId: country.id,
    country: country.country,
    starter: true,
    xp,
  };
}

function team(
  country: {
    id: number;
    country: { code: string; continent: { code: string; federationId: number } };
  },
  players: ReturnType<typeof player>[],
  competitionFederationId = country.country.continent.federationId,
) {
  return {
    id: 100,
    countryId: country.id,
    country: country.country,
    competitionFederationId,
    players,
  };
}

const fiveChineseTeam = team(
  countries.china,
  [1, 2, 3, 4, 5].map((id) => player(id, countries.china)),
  continents.europe.federationId,
);
const fourDanishTeam = team(countries.denmark, [
  player(1, countries.denmark),
  player(2, countries.denmark),
  player(3, countries.denmark),
  player(4, countries.denmark),
  player(5, countries.sweden),
]);
const fourGermanTeam = team(countries.germany, [
  player(1, countries.germany),
  player(2, countries.germany),
  player(3, countries.germany),
  player(4, countries.germany),
  player(5, countries.sweden),
]);
const fiveGermanTeam = team(
  countries.germany,
  [1, 2, 3, 4, 5].map((id) => player(id, countries.germany)),
);
const threeGermanTeam = team(countries.germany, [
  player(1, countries.germany),
  player(2, countries.germany),
  player(3, countries.germany),
  player(4, countries.denmark),
  player(5, countries.sweden),
]);
const threeSwedishTeam = team(countries.sweden, [
  player(1, countries.sweden),
  player(2, countries.sweden),
  player(3, countries.sweden),
  player(4, countries.denmark),
  player(5, countries.germany),
]);
const mixedEuropeanTeam = team(countries.germany, [
  player(1, countries.denmark),
  player(2, countries.sweden),
  player(3, countries.germany),
  player(4, countries.china),
  player(5, countries.brazil),
]);
const mixedAsianTeam = team(countries.china, [
  player(1, countries.china),
  player(2, countries.korea),
  player(3, countries.sweden),
  player(4, countries.germany),
  player(5, countries.brazil),
]);
const mixedNorthAmericanTeam = team(countries.usa, [
  player(1, countries.usa),
  player(2, countries.brazil),
  player(3, countries.sweden),
  player(4, countries.germany),
  player(5, countries.china),
]);
const europeanRegionalTeam = team(countries.europe, [
  player(1, countries.denmark),
  player(2, countries.sweden),
  player(3, countries.germany),
  player(4, countries.china),
  player(5, countries.brazil),
]);
const europeanRegionalNoGermanTeam = team(countries.europe, [
  player(1, countries.denmark),
  player(2, countries.sweden),
  player(3, countries.china),
  player(4, countries.korea),
  player(5, countries.brazil),
]);
const asianRegionalTeam = team(countries.asia, [
  player(1, countries.china),
  player(2, countries.korea),
  player(3, countries.sweden),
  player(4, countries.brazil),
  player(5, countries.usa),
]);
const northAmericanRegionalTeam = team(countries.northAmerica, [
  player(1, countries.usa),
  player(2, countries.china),
  player(3, countries.sweden),
  player(4, countries.brazil),
  player(5, countries.korea),
]);
const southAmericanRegionalTeam = team(countries.southAmerica, [
  player(1, countries.brazil),
  player(2, countries.china),
  player(3, countries.sweden),
  player(4, countries.usa),
  player(5, countries.korea),
]);
const otherRegionalTeam = team(countries.other, [
  player(1, countries.australia),
  player(2, countries.china),
  player(3, countries.sweden),
  player(4, countries.usa),
  player(5, countries.korea),
]);
const twoGermanMixedTeam = team(countries.europe, [
  player(1, countries.germany),
  player(2, countries.germany),
  player(3, countries.sweden),
  player(4, countries.china),
  player(5, countries.brazil),
]);
const oneGermanMixedTeam = team(countries.europe, [
  player(1, countries.germany),
  player(2, countries.denmark),
  player(3, countries.sweden),
  player(4, countries.china),
  player(5, countries.brazil),
]);

assert.deepEqual(
  filterNpcTransferCompatibleCandidates(fiveChineseTeam, [
    player(101, countries.china),
    player(102, countries.denmark),
  ]).map((candidate) => candidate.countryId),
  [countries.china.id],
  '5-player national locks only allow that nationality',
);

assert.deepEqual(
  filterNpcTransferCompatibleCandidates(fourDanishTeam, [
    player(101, countries.denmark),
    player(102, countries.sweden),
  ]).map((candidate) => candidate.countryId),
  [countries.denmark.id],
  '4-player national locks only allow that nationality',
);

assert.equal(
  sortNpcTransferCandidatesByFit(threeSwedishTeam, [
    player(101, countries.germany, 75),
    player(102, countries.sweden, 45),
  ])[0].countryId,
  countries.sweden.id,
  '3-player national cores strongly prefer that nationality',
);
assert.equal(
  sortNpcTransferCandidatesByFit(threeSwedishTeam, [player(101, countries.germany, 75)])[0]
    .countryId,
  countries.germany.id,
  '3-player national cores can fall back when no core-nationality player exists',
);

assert.equal(
  sortNpcTransferCandidatesByFit(mixedEuropeanTeam, [
    player(101, countries.china, 60),
    player(102, countries.germany, 60),
  ])[0].countryId,
  countries.germany.id,
  'mixed European teams prefer European players',
);

assert.equal(
  sortNpcTransferCandidatesByFit(mixedAsianTeam, [
    player(101, countries.sweden, 60),
    player(102, countries.korea, 60),
  ])[0].countryId,
  countries.korea.id,
  'mixed Asian teams prefer Asian players',
);

assert.equal(
  isNpcTransferCompatible(fiveChineseTeam, player(101, countries.denmark)),
  false,
  'free agents must obey national locks',
);

assert.equal(
  isNpcTransferCompatible(fiveChineseTeam, player(101, countries.denmark)),
  false,
  'already-signed players must obey national locks',
);

assert.equal(
  getNpcTransferCompatibilityScore(fiveChineseTeam, player(101, countries.denmark)),
  Number.NEGATIVE_INFINITY,
  'competitionFederationId does not override roster nationality locks',
);

assert.equal(
  getUserOfferFitScore(fiveChineseTeam, player(101, countries.germany)),
  Number.NEGATIVE_INFINITY,
  'German users cannot receive offers from 5-player Danish/Chinese-style national locks',
);

assert.equal(
  getUserOfferFitScore(fourDanishTeam, player(101, countries.germany)),
  Number.NEGATIVE_INFINITY,
  'German users cannot receive offers from 4-player non-German national locks',
);

assert.equal(
  getUserOfferFitBucket(fourGermanTeam, player(101, countries.germany)),
  'national',
  'German users can receive offers from 4-player German national locks',
);

assert.equal(
  getUserOfferFitBucket(fiveGermanTeam, player(101, countries.germany)),
  'national',
  'German users can receive offers from 5-player German national locks',
);

assert.equal(
  getUserOfferFitBucket(europeanRegionalTeam, player(101, countries.germany)),
  'national',
  'regional teams with German starters count as national-oriented user offers',
);

assert.equal(
  getUserOfferFitBucket(europeanRegionalNoGermanTeam, player(101, countries.germany)),
  'regional',
  'European regional teams without German starters count as international regional user offers',
);

assert.ok(
  getUserOfferFitScore(europeanRegionalNoGermanTeam, player(101, countries.germany)) >
    getUserOfferFitScore(asianRegionalTeam, player(101, countries.germany)),
  'German users are much more likely to receive European regional offers than Asian regional offers',
);

assert.ok(
  getUserOfferFitScore(asianRegionalTeam, player(101, countries.germany)) > 0 &&
    getUserOfferFitScore(northAmericanRegionalTeam, player(101, countries.germany)) > 0 &&
    getUserOfferFitScore(southAmericanRegionalTeam, player(101, countries.germany)) > 0 &&
    getUserOfferFitScore(otherRegionalTeam, player(101, countries.germany)) > 0,
  'German users can rarely receive Asian, North American, South American, or Other regional offers',
);

assert.equal(
  getUserOfferFitBucket(threeGermanTeam, player(101, countries.germany)),
  'national',
  '3-player German national cores are national-oriented user offers',
);

assert.ok(
  getUserOfferFitScore(threeGermanTeam, player(101, countries.germany)) >
    getUserOfferFitScore(threeSwedishTeam, player(101, countries.germany)),
  '3-player German cores are much more likely than 3-player non-German cores for German users',
);

assert.equal(
  getUserOfferFitBucket(twoGermanMixedTeam, player(101, countries.germany)),
  'national',
  'mixed teams with 2 German starters can send national-oriented user offers',
);

assert.equal(
  getUserOfferFitBucket(oneGermanMixedTeam, player(101, countries.germany)),
  'national',
  'mixed teams with 1 German starter can send national-oriented user offers',
);

assert.ok(
  getUserOfferFitScore(threeSwedishTeam, player(101, countries.germany)) > 0,
  '3-player non-German cores can still offer German users at reduced likelihood',
);

assert.equal(
  USER_OFFER_FIT_BUCKET_WEIGHTS.national,
  45,
  'user-offer pool targets 45% national-oriented offers when enough teams exist',
);

assert.equal(
  USER_OFFER_FIT_BUCKET_WEIGHTS.regional,
  55,
  'user-offer pool targets 55% international regional offers when enough teams exist',
);

assert.ok(
  getLowerLeaguePromotionCandidateScore(fiveChineseTeam, player(101, countries.china, 84), {
    destinationTier: tiers.pro,
    sourceTier: tiers.open,
    advancedTier: tiers.advanced,
    proTier: tiers.pro,
    missingIntermediateTiers: 2,
  }) > 0,
  'ESL Pro League teams can consider high-XP same-nationality lower-league players',
);

assert.ok(
  getLowerLeaguePromotionCandidateScore(threeSwedishTeam, player(101, countries.sweden, 80), {
    destinationTier: tiers.advanced,
    sourceTier: tiers.open,
    advancedTier: tiers.advanced,
    proTier: tiers.pro,
  }) > 0,
  'Advanced teams can consider high-XP same-nationality lower-league players',
);

assert.ok(
  getLowerLeaguePromotionCandidateScore(fiveChineseTeam, player(101, countries.china, 82), {
    destinationTier: tiers.advanced,
    sourceTier: tiers.open,
    advancedTier: tiers.advanced,
    proTier: tiers.pro,
    missingIntermediateTiers: 2,
  }) >
    getLowerLeaguePromotionCandidateScore(fiveChineseTeam, player(101, countries.china, 82), {
      destinationTier: tiers.advanced,
      sourceTier: tiers.open,
      advancedTier: tiers.advanced,
      proTier: tiers.pro,
    }),
  'missing Intermediate/Main tiers increase consideration instead of excluding the player',
);

assert.ok(
  getLowerLeaguePromotionCandidateScore(
    team(countries.australia, [
      player(1, countries.australia),
      player(2, countries.australia),
      player(3, countries.australia),
      player(4, countries.korea),
      player(5, countries.china),
    ]),
    player(101, countries.australia, 82),
    {
      destinationTier: tiers.pro,
      sourceTier: tiers.open,
      advancedTier: tiers.advanced,
      proTier: tiers.pro,
      missingIntermediateTiers: 2,
    },
  ) > 0,
  'thin regions such as Oceania consider high-XP lower-league national players',
);

assert.equal(
  getLowerLeaguePromotionCandidateScore(fiveChineseTeam, player(101, countries.denmark, 95), {
    destinationTier: tiers.pro,
    sourceTier: tiers.open,
    advancedTier: tiers.advanced,
    proTier: tiers.pro,
    missingIntermediateTiers: 2,
  }),
  Number.NEGATIVE_INFINITY,
  'lower-league XP boost does not override national locks',
);

assert.equal(
  getLowerLeaguePromotionCandidateScore(threeSwedishTeam, player(101, countries.sweden, 55), {
    destinationTier: tiers.pro,
    sourceTier: tiers.open,
    advancedTier: tiers.advanced,
    proTier: tiers.pro,
    missingIntermediateTiers: 2,
  }),
  0,
  'low-XP lower-league players do not get the promotion-candidate boost',
);

assert.ok(
  getLowerLeaguePromotionCandidateScore(mixedEuropeanTeam, player(101, countries.germany, 80), {
    destinationTier: tiers.pro,
    sourceTier: tiers.open,
    advancedTier: tiers.advanced,
    proTier: tiers.pro,
  }) >
    getLowerLeaguePromotionCandidateScore(mixedEuropeanTeam, player(102, countries.china, 80), {
      destinationTier: tiers.pro,
      sourceTier: tiers.open,
      advancedTier: tiers.advanced,
      proTier: tiers.pro,
    }),
  'lower-league XP boost still respects regional preference for mixed European teams',
);

assert.ok(
  getLowerLeaguePromotionCandidateScore(mixedNorthAmericanTeam, player(101, countries.usa, 80), {
    destinationTier: tiers.pro,
    sourceTier: tiers.open,
    advancedTier: tiers.advanced,
    proTier: tiers.pro,
  }) > 0,
  'lower-league promotion boost also applies to Americas teams',
);

console.log('npc-transfer-identity tests passed');
