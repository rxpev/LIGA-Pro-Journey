import assert from 'node:assert/strict';
import { getNpcRetirementChance } from './retirement';

const activeElite = {
  xp: 91,
  starter: true,
  teamId: 1,
  transferListed: false,
  hasViableNationalContinuation: true,
};

assert.equal(
  getNpcRetirementChance({ ...activeElite, age: 29 }),
  0,
  'NPCs cannot retire before the veteran stage',
);
assert.ok(
  getNpcRetirementChance({ ...activeElite, age: 30 }) > 0,
  '30-year-olds can retire, but only rarely',
);
assert.ok(
  getNpcRetirementChance({ ...activeElite, age: 36 }) < 40,
  'elite active starters remain the exception after 36',
);
assert.ok(
  getNpcRetirementChance({
    age: 36,
    xp: 52,
    starter: false,
    teamId: null,
    transferListed: true,
    hasViableNationalContinuation: false,
  }) >= 95,
  'an inactive 36-year-old without a national route normally retires',
);
assert.ok(
  getNpcRetirementChance({
    age: 35,
    xp: 58,
    starter: false,
    teamId: 1,
    transferListed: true,
    hasViableNationalContinuation: false,
  }) >
    getNpcRetirementChance({
      age: 35,
      xp: 58,
      starter: true,
      teamId: 1,
      transferListed: false,
      hasViableNationalContinuation: true,
    }),
  'being benched and without a viable continuation raises retirement pressure',
);
assert.ok(
  getNpcRetirementChance({
    age: 34,
    xp: 62,
    starter: false,
    teamId: null,
    transferListed: true,
    hasViableNationalContinuation: false,
    careerTrophyPoints: 6,
  }) >
    getNpcRetirementChance({
      age: 34,
      xp: 62,
      starter: false,
      teamId: null,
      transferListed: true,
      hasViableNationalContinuation: false,
      careerTrophyPoints: 0,
    }),
  'a trophy-laden career raises retirement pressure after a player becomes inactive',
);
