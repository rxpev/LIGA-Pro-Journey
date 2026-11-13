import assert from 'node:assert/strict';
import {
  getAcademyIntegrityFieldSize,
  getAcademyVacancyDecisionScore,
  getAcademyRecruitmentAgeScore,
  getAcademyUserClause,
  isAcademyAgeMoveAllowed,
  shouldPromoteAcademyPlayer,
} from './academy-system';

assert.equal(getAcademyIntegrityFieldSize(32, 0), 0);
assert.equal(getAcademyIntegrityFieldSize(32, 16), 16);
assert.equal(getAcademyIntegrityFieldSize(32, 40), 32);

assert.equal(
  shouldPromoteAcademyPlayer({
    academy: { id: 1, age: 19, role: 'RIFLER', rating: 1.26, maps: 20 },
    incumbent: { id: 2, age: 27, role: 'RIFLER', rating: 0.86, maps: 20 },
    academyTier: 1,
    parentTier: 3,
  }),
  true,
);

assert.equal(
  shouldPromoteAcademyPlayer({
    academy: { id: 1, age: 19, role: 'RIFLER', rating: 1.3, maps: 8 },
    incumbent: { id: 2, age: 30, role: 'RIFLER', rating: 0.82, maps: 24 },
    academyTier: 1,
    parentTier: 3,
  }),
  false,
);

assert.equal(
  shouldPromoteAcademyPlayer({
    academy: { id: 1, age: 20, role: 'RIFLER', rating: 1.4, maps: 20 },
    incumbent: { id: 2, age: 29, role: 'RIFLER', rating: 1.06, maps: 20 },
    academyTier: 1,
    parentTier: 3,
  }),
  true,
);

assert.equal(isAcademyAgeMoveAllowed(27, [{ age: 29 }]), false);
assert.ok(
  getAcademyRecruitmentAgeScore({ age: 18, isRegen: true, currentRoster: [] }) >
    getAcademyRecruitmentAgeScore({ age: 23, currentRoster: [] }),
);
assert.equal(getAcademyUserClause({ role: 'AWPER', clubConfidence: 'guarantee' }).target, 1.45);
const iglTarget = getAcademyUserClause({
  role: 'IGL',
  incumbentRating: 1.06,
  clubConfidence: 'guarantee',
}).target!;
assert.ok(iglTarget >= 0.85 && iglTarget <= 1);

const academyVacancyScore = getAcademyVacancyDecisionScore({
  xp: 70,
  rating: 1.15,
  maps: 20,
  compatibilityScore: 5,
  academyPlayer: true,
});
assert.ok(
  getAcademyVacancyDecisionScore({
    xp: 84,
    rating: 1.22,
    maps: 20,
    compatibilityScore: 5,
  }) > academyVacancyScore,
  'a clearly stronger outside replacement should beat the academy option',
);
assert.ok(
  academyVacancyScore >
    getAcademyVacancyDecisionScore({
      xp: 72,
      rating: 1.08,
      maps: 20,
      compatibilityScore: 5,
    }),
  'a good academy fit should beat a merely comparable outside replacement',
);

console.log('academy-system tests passed');
