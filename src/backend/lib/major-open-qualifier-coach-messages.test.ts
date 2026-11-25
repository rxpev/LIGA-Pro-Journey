import assert from 'node:assert/strict';
import { Constants, TierSlug } from '@liga/shared';
import Tournament from '@liga/shared/tournament';
import {
  getCoachTierFromTeamTier,
  getMajorOpenQualifierCoachMessage,
  getMajorOpenQualifierCoachSubject,
  getMajorOpenQualifierConfig,
  hasSecuredMajorOpenQualifierPlace,
  MAJOR_OPEN_QUALIFIER_CONFIG,
} from './major-open-qualifier-coach-messages';

const europeQualifiers = [
  TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_1,
  TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_2,
  TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_3,
  TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_4,
];
const restOfWorldQualifiers = [
  TierSlug.MAJOR_AMERICAS_OPEN_QUALIFIER_1,
  TierSlug.MAJOR_AMERICAS_OPEN_QUALIFIER_2,
  TierSlug.MAJOR_ASIA_OPEN_QUALIFIER_1,
  TierSlug.MAJOR_ASIA_OPEN_QUALIFIER_2,
  TierSlug.MAJOR_CHINA_OPEN_QUALIFIER_1,
  TierSlug.MAJOR_CHINA_OPEN_QUALIFIER_2,
  TierSlug.MAJOR_OCE_OPEN_QUALIFIER_1,
  TierSlug.MAJOR_OCE_OPEN_QUALIFIER_2,
];
const allCoachTiers = [
  TierSlug.LEAGUE_OPEN,
  TierSlug.LEAGUE_INTERMEDIATE,
  TierSlug.LEAGUE_MAIN,
  TierSlug.LEAGUE_ADVANCED,
  TierSlug.LEAGUE_PRO,
];

assert.equal(Object.keys(MAJOR_OPEN_QUALIFIER_CONFIG).length, 12);

for (const qualifierTierSlug of europeQualifiers) {
  const qualifier = getMajorOpenQualifierConfig(qualifierTierSlug);
  assert.equal(qualifier?.format, 'europe');
  assert.equal(qualifier?.totalQualifiers, 4);
  assert.equal(qualifier?.qualificationPlaces, 4);
  for (const teamTierSlug of allCoachTiers) {
    for (const outcome of ['start', 'loss', 'qualified'] as const) {
      assert.ok(
        getMajorOpenQualifierCoachMessage({ qualifierTierSlug, teamTierSlug, outcome }),
        `${qualifierTierSlug}/${teamTierSlug}/${outcome} should have copy`,
      );
    }
  }
}

for (const qualifierTierSlug of restOfWorldQualifiers) {
  const qualifier = getMajorOpenQualifierConfig(qualifierTierSlug);
  assert.equal(qualifier?.format, 'rest-of-world');
  assert.equal(qualifier?.totalQualifiers, 2);
  assert.ok(qualifier?.qualificationPlaces);
  for (const teamTierSlug of qualifier?.supportedCoachTiers ?? []) {
    for (const outcome of ['start', 'loss', 'qualified'] as const) {
      assert.ok(
        getMajorOpenQualifierCoachMessage({ qualifierTierSlug, teamTierSlug, outcome }),
        `${qualifierTierSlug}/${teamTierSlug}/${outcome} should have copy`,
      );
    }
  }
}

for (const qualifierTierSlug of [
  TierSlug.MAJOR_ASIA_OPEN_QUALIFIER_1,
  TierSlug.MAJOR_ASIA_OPEN_QUALIFIER_2,
  TierSlug.MAJOR_CHINA_OPEN_QUALIFIER_1,
  TierSlug.MAJOR_CHINA_OPEN_QUALIFIER_2,
  TierSlug.MAJOR_OCE_OPEN_QUALIFIER_1,
  TierSlug.MAJOR_OCE_OPEN_QUALIFIER_2,
]) {
  for (const teamTierSlug of [TierSlug.LEAGUE_INTERMEDIATE, TierSlug.LEAGUE_MAIN]) {
    assert.equal(
      getMajorOpenQualifierCoachMessage({
        qualifierTierSlug,
        teamTierSlug,
        outcome: 'start',
      }),
      null,
    );
  }
}

assert.equal(
  getMajorOpenQualifierConfig(TierSlug.MAJOR_ASIA_OPEN_QUALIFIER_1)?.qualificationPlaces,
  2,
);
assert.equal(
  getMajorOpenQualifierConfig(TierSlug.MAJOR_CHINA_OPEN_QUALIFIER_1)?.qualificationPlaces,
  1,
);
assert.equal(
  getMajorOpenQualifierConfig(TierSlug.MAJOR_OCE_OPEN_QUALIFIER_1)?.qualificationPlaces,
  1,
);
assert.equal(
  getMajorOpenQualifierConfig(TierSlug.MAJOR_AMERICAS_OPEN_QUALIFIER_1)?.qualificationPlaces,
  4,
);

for (const [index, teamTierSlug] of Constants.Prestige.entries()) {
  assert.equal(getCoachTierFromTeamTier(index), teamTierSlug);
}
assert.equal(getCoachTierFromTeamTier(-1), null);
assert.equal(getCoachTierFromTeamTier(null), null);

assert.equal(hasSecuredMajorOpenQualifierPlace({ pos: 4 }, 4), true);
assert.equal(hasSecuredMajorOpenQualifierPlace({ pos: 5 }, 4), false);
assert.equal(hasSecuredMajorOpenQualifierPlace({ pos: 2 }, 2), true);
assert.equal(hasSecuredMajorOpenQualifierPlace({ pos: 2 }, 1), false);
assert.equal(hasSecuredMajorOpenQualifierPlace({ gpos: 1, pos: 4 }, 1), true);

const bracket = new Tournament(8, { short: true });
bracket.addCompetitors([101, 102, 103, 104, 105, 106, 107, 108]);
bracket.start();
for (const match of bracket.$base.currentRound(Constants.BracketIdentifier.UPPER)) {
  bracket.$base.score(match.id, [13, 5]);
}
const bracketStandings = bracket.$base.results();
assert.equal(
  hasSecuredMajorOpenQualifierPlace(
    bracketStandings.find((standing) => standing.seed === 1),
    4,
  ),
  true,
  'a quarterfinal winner has secured one of four RMR places',
);
assert.equal(
  hasSecuredMajorOpenQualifierPlace(
    bracketStandings.find((standing) => standing.seed === 2),
    4,
  ),
  false,
  'a quarterfinal loser has not secured an RMR place',
);

assert.equal(
  getMajorOpenQualifierCoachSubject({
    qualifierTierSlug: TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_3,
    season: 7,
  }),
  'Europe RMR Open Qualifier 3/4 — Season 7',
);
assert.equal(
  getMajorOpenQualifierCoachMessage({
    qualifierTierSlug: TierSlug.LEAGUE_OPEN,
    teamTierSlug: TierSlug.LEAGUE_OPEN,
    outcome: 'start',
  }),
  null,
);

assert.match(
  getMajorOpenQualifierCoachMessage({
    qualifierTierSlug: TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_3,
    teamTierSlug: TierSlug.LEAGUE_ADVANCED,
    outcome: 'loss',
  }) ?? '',
  /below our usual standards\.$/,
);
