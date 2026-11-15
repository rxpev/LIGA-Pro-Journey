import assert from 'node:assert/strict';
import {
  getCareerTransferEvents,
  getStintStats,
  type RosterPlayer,
  type TransferTeam,
} from './roster';

const thunder: TransferTeam = {
  blazon: 'thunder.svg',
  id: 391,
  name: 'THUNDER dOWNUNDER',
};
const bardolphs: TransferTeam = {
  blazon: 'bardolphs.svg',
  id: 389,
  name: 'The Bardolphs',
};
const matchAndBenchDate = new Date('2036-07-01T23:00:00.000Z');

const player = {
  id: 1446,
  name: 'mitzymijo',
  careerStints: [
    {
      endedAt: new Date('2026-05-06T23:00:00.000Z'),
      id: 1446,
      isTrial: false,
      playerId: 1446,
      startedAt: new Date('2026-01-01T00:00:00.000Z'),
      starter: false,
      team: bardolphs,
      teamId: bardolphs.id,
      tier: 6,
      trialSeriesTarget: null,
    },
    {
      endedAt: matchAndBenchDate,
      id: 3085,
      isTrial: false,
      playerId: 1446,
      startedAt: new Date('2026-05-06T23:00:00.000Z'),
      starter: true,
      team: thunder,
      teamId: thunder.id,
      tier: 6,
      trialSeriesTarget: null,
    },
    {
      endedAt: new Date('2036-08-31T23:00:00.000Z'),
      id: 13926,
      isTrial: false,
      playerId: 1446,
      startedAt: matchAndBenchDate,
      starter: false,
      team: thunder,
      teamId: thunder.id,
      tier: 6,
      trialSeriesTarget: null,
    },
  ],
} as unknown as RosterPlayer;

const events = getCareerTransferEvents([player], thunder);
assert.deepEqual(
  events.map((event) => event.id),
  ['join_1446_3085', 'bench_1446_13926', 'release_1446_13926'],
  'a final bench stint should produce both the bench and later release events',
);

const boundaryGame = [{ date: matchAndBenchDate, rating: 0.64, teamIds: [3, thunder.id] }];
const starterStats = getStintStats(
  boundaryGame,
  player.careerStints![1],
  thunder.id,
  matchAndBenchDate,
);
const benchStats = getStintStats(
  boundaryGame,
  player.careerStints![2],
  thunder.id,
  new Date('2036-09-01T00:00:00.000Z'),
);

assert.equal(starterStats.maps, 1);
assert.equal(starterStats.rating, 0.64);
assert.equal(benchStats.maps, 0);
assert.equal(benchStats.rating, null);

console.log('Roster history regression checks passed.');
