import assert from 'node:assert/strict';
import {
  buildTopPlayersOfYearAnalysis,
  isTopPlayersOfYearMeaningfulPeak,
  isTopPlayersOfYearMeaningfulWeakness,
} from './news';

type TopPlayerFixture = Parameters<typeof buildTopPlayersOfYearAnalysis>[0];
type TopPlayerEventFixture = NonNullable<Parameters<typeof isTopPlayersOfYearMeaningfulPeak>[0]>;

const basePlayer: TopPlayerFixture = {
  playerId: 1,
  playerName: 'testPlayer',
  playerAvatar: null,
  playerCountryCode: 'dk',
  playerAge: 22,
  playerRole: 'RIFLER',
  teamId: 10,
  teamName: 'Test Team',
  teamBlazon: null,
  maps: 45,
  actualMaps: 45,
  actualRating: 1.2,
  notableRating: 1.2,
  score: 100,
  mvpCount: 0,
  eliteMaps: 24,
  bigEventMaps: 30,
  bigEventRating: 1.19,
  pressureRating: 1.18,
  strongEventCount: 3,
  weakEventCount: 2,
  bestEvent: null,
  weakEvent: null,
  teams: [{ id: 10, name: 'Test Team', blazon: null, maps: 45 }],
  mvpTournaments: [],
  trophies: [],
};

const belowBaselineMajor: TopPlayerEventFixture = {
  competitionId: 100,
  name: 'the Major',
  maps: 7,
  placement: 9,
  rating: 1.05,
};

assert.equal(
  isTopPlayersOfYearMeaningfulPeak(belowBaselineMajor, basePlayer),
  false,
  'a below-baseline Major should not be selected as a defining peak',
);

assert.equal(
  isTopPlayersOfYearMeaningfulWeakness(belowBaselineMajor, basePlayer),
  true,
  'a below-baseline prestige event can be selected as an important weakness',
);

const firstSeasonArticle = buildTopPlayersOfYearAnalysis(
  {
    ...basePlayer,
    weakEventCount: 3,
  },
  14,
  2026,
);

assert.doesNotMatch(
  firstSeasonArticle,
  /first LIGA Top 20 appearance|fresh name|reaches the year-end list for the first time/i,
  'first save year should not emit first-appearance boilerplate',
);

assert.doesNotMatch(
  firstSeasonArticle,
  /3 weaker|3 dips|3 strong|usual threshold|notable-event/i,
  'weakness counts should not leak directly into prose',
);

const weakEventArticle = buildTopPlayersOfYearAnalysis(
  {
    ...basePlayer,
    weakEvent: belowBaselineMajor,
  },
  14,
  2027,
  {
    appearances: 1,
    bestRank: 16,
    firstYear: 2026,
    lastAppearance: { rank: 16, year: 2026 },
    previousYearRank: 16,
    years: [2026],
  },
);

assert.match(
  weakEventArticle,
  /the Major|1\.05/,
  'important weaknesses should be grounded in concrete event evidence',
);
