import assert from 'node:assert/strict';
import Tournament from '@liga/shared/tournament';
import { seedGroupsByWorldRanking } from './world-ranking-group-seeding';

const competitors = Array.from({ length: 32 }, (_, index) => ({
  id: index + 1,
  teamId: index + 1,
  team: { elo: 10_000 - index },
}));
const seeded = seedGroupsByWorldRanking(competitors, 4, true);
const tournament = new Tournament(32, {
  groupSize: 4,
  groupSwiss: true,
  maxLosses: 2,
  maxRounds: 3,
  maxWins: 2,
});
tournament.addCompetitors(seeded.map((competitor) => competitor.id));
tournament.start();

const groups = Array.from({ length: 8 }, (_, index) =>
  competitors
    .filter((competitor) => tournament.getGroupByCompetitorId(competitor.id) === index + 1)
    .map((competitor) => competitor.id),
);

assert.deepEqual(groups, [
  [1, 16, 17, 32],
  [2, 15, 18, 31],
  [3, 14, 19, 30],
  [4, 13, 20, 29],
  [5, 12, 21, 28],
  [6, 11, 22, 27],
  [7, 10, 23, 26],
  [8, 9, 24, 25],
]);

const leagueSeeded = seedGroupsByWorldRanking(competitors, 4, false);
const leagueTournament = new Tournament(32, { groupSize: 4, meetTwice: false });
leagueTournament.addCompetitors(leagueSeeded.map((competitor) => competitor.id));
leagueTournament.start();
const leagueGroups = Array.from({ length: 8 }, (_, index) =>
  competitors
    .filter((competitor) => leagueTournament.getGroupByCompetitorId(competitor.id) === index + 1)
    .map((competitor) => competitor.id),
);
assert.deepEqual(leagueGroups, groups);

console.log('World-ranking group seeding tests passed.');
