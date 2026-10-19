import assert from 'node:assert/strict';
import {
  filterNpcTransferCompatibleCandidates,
  getLowerLeaguePromotionCandidateScore,
  getNpcTransferCompatibilityScore,
  getNpcTransferRecruitmentPolicy,
  getNpcTransferTeamIdentity,
  getUserOfferFitBucket,
  getUserOfferFitScore,
  isNpcTransferCompatible,
  inferNpcTransferRecruitmentPolicy,
  NPC_TRANSFER_AFFINITY_COUNTRY_CODES,
  serializeNpcTransferRecruitmentPolicy,
  sortNpcTransferCandidatesByFit,
  USER_OFFER_FIT_BUCKET_WEIGHTS,
} from './npc-transfer-identity';

assert.deepEqual(
  Object.fromEntries(
    Object.entries(NPC_TRANSFER_AFFINITY_COUNTRY_CODES)
      .filter(([group]) => group !== 'cis')
      .map(([group, codes]) => [group, [...codes]]),
  ),
  {
    francophone: ['fr', 'be'],
    dach: ['de', 'at', 'ch'],
    'czech-slovak': ['cz', 'sk'],
    'north-american': ['us', 'ca'],
    anz: ['au', 'nz'],
    baltic: ['ee', 'lv', 'lt'],
    benelux: ['nl', 'be', 'lu'],
    'southern-cone': ['ar', 'uy'],
    'greater-chinese': ['cn', 'tw', 'hk'],
    'british-irish': ['gb', 'ie'],
    'albanian-speaking': ['al', 'xk'],
    'south-slavic': ['rs', 'hr', 'ba', 'me'],
  },
  'all requested transfer affinity memberships are configured',
);

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
  russia: { id: 13, country: { code: 'ru', continent: continents.europe } },
  ukraine: { id: 14, country: { code: 'ua', continent: continents.europe } },
  belarus: { id: 15, country: { code: 'by', continent: continents.europe } },
  uzbekistan: { id: 16, country: { code: 'uz', continent: continents.asia } },
  china: { id: 20, country: { code: 'cn', continent: continents.asia } },
  korea: { id: 21, country: { code: 'kr', continent: continents.asia } },
  brazil: { id: 30, country: { code: 'br', continent: continents.southAmerica } },
  usa: { id: 40, country: { code: 'us', continent: continents.northAmerica } },
  australia: { id: 50, country: { code: 'au', continent: continents.oceania } },
  france: { id: 70, country: { code: 'fr', continent: continents.europe } },
  belgium: { id: 71, country: { code: 'be', continent: continents.europe } },
  austria: { id: 72, country: { code: 'at', continent: continents.europe } },
  switzerland: { id: 73, country: { code: 'ch', continent: continents.europe } },
  czechia: { id: 74, country: { code: 'cz', continent: continents.europe } },
  slovakia: { id: 75, country: { code: 'sk', continent: continents.europe } },
  canada: { id: 76, country: { code: 'ca', continent: continents.northAmerica } },
  newZealand: { id: 77, country: { code: 'nz', continent: continents.oceania } },
  estonia: { id: 78, country: { code: 'ee', continent: continents.europe } },
  latvia: { id: 79, country: { code: 'lv', continent: continents.europe } },
  lithuania: { id: 80, country: { code: 'lt', continent: continents.europe } },
  netherlands: { id: 81, country: { code: 'nl', continent: continents.europe } },
  argentina: { id: 82, country: { code: 'ar', continent: continents.southAmerica } },
  uruguay: { id: 83, country: { code: 'uy', continent: continents.southAmerica } },
  taiwan: { id: 84, country: { code: 'tw', continent: continents.asia } },
  hongKong: { id: 85, country: { code: 'hk', continent: continents.asia } },
  unitedKingdom: { id: 86, country: { code: 'gb', continent: continents.europe } },
  ireland: { id: 87, country: { code: 'ie', continent: continents.europe } },
  albania: { id: 88, country: { code: 'al', continent: continents.europe } },
  kosovo: { id: 89, country: { code: 'xk', continent: continents.europe } },
  serbia: { id: 90, country: { code: 'rs', continent: continents.europe } },
  croatia: { id: 91, country: { code: 'hr', continent: continents.europe } },
  bosnia: { id: 92, country: { code: 'ba', continent: continents.europe } },
  montenegro: { id: 93, country: { code: 'me', continent: continents.europe } },
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
const arcredStyleCisTeam = team(countries.europe, [
  player(1, countries.uzbekistan),
  player(2, countries.belarus),
  player(3, countries.uzbekistan),
  player(4, countries.russia),
  player(5, countries.ukraine),
]);
const russianMajorityCisTeam = team(countries.russia, [
  player(1, countries.russia),
  player(2, countries.russia),
  player(3, countries.russia),
  player(4, countries.ukraine),
  player(5, countries.belarus),
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

const affinityCases = [
  ['francophone', countries.france, countries.belgium],
  ['dach', countries.germany, countries.austria],
  ['czech-slovak', countries.czechia, countries.slovakia],
  ['north-american', countries.usa, countries.canada],
  ['anz', countries.australia, countries.newZealand],
  ['baltic', countries.estonia, countries.latvia],
  ['benelux', countries.netherlands, countries.belgium],
  ['southern-cone', countries.argentina, countries.uruguay],
  ['greater-chinese', countries.china, countries.taiwan],
  ['british-irish', countries.unitedKingdom, countries.ireland],
  ['albanian-speaking', countries.albania, countries.kosovo],
  ['south-slavic', countries.serbia, countries.croatia],
] as const;

for (const [affinityGroup, firstCountry, secondCountry] of affinityCases) {
  const affinityTeam = team(countries.europe, [
    player(1, firstCountry),
    player(2, firstCountry),
    player(3, secondCountry),
    player(4, secondCountry),
    player(5, countries.denmark),
  ]);
  const identity = getNpcTransferTeamIdentity(affinityTeam);
  assert.equal(identity.type, 'affinity-core', `${affinityGroup} rosters become affinity cores`);
  assert.equal(
    identity.type === 'affinity-core' ? identity.affinityGroup : null,
    affinityGroup,
    `${affinityGroup} identity retains its group`,
  );
  assert.equal(
    isNpcTransferCompatible(affinityTeam, player(101, secondCountry)),
    true,
    `${affinityGroup} teams accept another nationality from the group`,
  );
  assert.equal(
    isNpcTransferCompatible(affinityTeam, player(102, countries.denmark)),
    false,
    `${affinityGroup} teams reject nationalities outside the group`,
  );
}

assert.deepEqual(
  filterNpcTransferCompatibleCandidates(fiveChineseTeam, [
    player(101, countries.china),
    player(103, countries.taiwan),
    player(102, countries.denmark),
  ]).map((candidate) => candidate.countryId),
  [countries.china.id, countries.taiwan.id],
  '5-player national locks allow their nationality plus rare affinity recruitment',
);

assert.ok(
  getNpcTransferCompatibilityScore(fiveChineseTeam, player(101, countries.china)) >
    getNpcTransferCompatibilityScore(fiveChineseTeam, player(102, countries.taiwan)),
  '5-player national locks strongly prefer their exact nationality over affinity candidates',
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
  isNpcTransferCompatible(fourGermanTeam, player(101, countries.austria)),
  true,
  '4-player national locks can recruit from their affinity group',
);
assert.equal(
  getUserOfferFitBucket(fourGermanTeam, player(101, countries.austria)),
  'regional',
  'affinity offers from national locks remain rarer than exact-national offers',
);
assert.equal(
  isNpcTransferCompatible(fourGermanTeam, player(101, countries.france)),
  false,
  '4-player national locks still reject players outside their affinity group',
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

assert.deepEqual(
  getNpcTransferTeamIdentity(arcredStyleCisTeam),
  {
    type: 'cis-core',
    count: 5,
    region: 'Europe',
    dominantCountryId: countries.uzbekistan.id,
    dominantCount: 2,
  },
  'mixed CIS teams are classified separately while keeping their displayed region identity',
);

assert.deepEqual(
  filterNpcTransferCompatibleCandidates(arcredStyleCisTeam, [
    player(101, countries.russia),
    player(102, countries.denmark),
    player(103, countries.china),
    player(104, countries.ukraine),
  ]).map((candidate) => candidate.countryId),
  [countries.russia.id, countries.ukraine.id],
  'CIS teams only allow CIS-nationality transfer candidates',
);

assert.equal(
  getUserOfferFitScore(arcredStyleCisTeam, player(101, countries.denmark)),
  Number.NEGATIVE_INFINITY,
  'non-CIS European users cannot receive ordinary regional offers from CIS teams',
);

assert.ok(
  getNpcTransferCompatibilityScore(russianMajorityCisTeam, player(101, countries.russia)) >
    getNpcTransferCompatibilityScore(russianMajorityCisTeam, player(102, countries.ukraine)),
  'Russian-majority CIS teams prefer same-country players over cross-CIS players',
);

assert.ok(
  getNpcTransferCompatibilityScore(russianMajorityCisTeam, player(101, countries.ukraine)) > 0,
  'cross-CIS transfers into Russian-majority teams remain possible',
);

assert.equal(
  isNpcTransferCompatible(russianMajorityCisTeam, player(101, countries.denmark)),
  false,
  'Russian-majority CIS teams reject non-CIS European players',
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

const persistedChinesePolicyTeam = {
  ...fiveChineseTeam,
  players: fiveChineseTeam.players.slice(0, 4),
  npcRecruitmentPolicy: serializeNpcTransferRecruitmentPolicy({
    version: 1,
    type: 'national-lock',
    countryId: countries.china.id,
    region: 'Asia',
  }),
};
assert.deepEqual(
  getNpcTransferTeamIdentity(persistedChinesePolicyTeam),
  {
    type: 'national-lock',
    countryId: countries.china.id,
    count: 4,
    region: 'Asia',
  },
  'persisted national locks survive a temporary vacancy',
);
assert.equal(
  isNpcTransferCompatible(persistedChinesePolicyTeam, player(101, countries.denmark)),
  false,
  'persisted national locks reject a regional substitute during a vacancy',
);

const persistedRegionalTeam = {
  ...europeanRegionalTeam,
  npcRecruitmentPolicy: serializeNpcTransferRecruitmentPolicy({
    version: 1,
    type: 'regional',
    region: 'Europe',
  }),
};
assert.deepEqual(
  getNpcTransferTeamIdentity({
    ...persistedRegionalTeam,
    players: [1, 2, 3, 4, 5].map((id) => player(id, countries.germany)),
  }),
  {
    type: 'national-lock',
    countryId: countries.germany.id,
    count: 5,
    region: 'Europe',
  },
  'a complete same-country roster upgrades a prior regional policy to a lock',
);
assert.deepEqual(
  getNpcTransferRecruitmentPolicy(persistedChinesePolicyTeam),
  {
    version: 1,
    type: 'national-lock',
    countryId: countries.china.id,
    region: 'Asia',
  },
  'policy serialization round-trips with only supported fields',
);
assert.equal(
  inferNpcTransferRecruitmentPolicy({
    ...russianMajorityCisTeam,
    players: [1, 2, 3, 4, 5].map((id) => player(id, countries.russia)),
  }).type,
  'national-lock',
  'five same-country CIS starters take national-lock precedence',
);

console.log('npc-transfer-identity tests passed');
