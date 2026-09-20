import assert from 'node:assert/strict';
import { calculatePlacement, eloForPlacementKd } from './faceit-placement';
import { verifyFaceitEloIntegrity } from './faceit-elo-integrity';

const killEvent = (attackerId: number, victimId: number) => ({
  payload: JSON.stringify({ type: 'playerkilled' }),
  attackerId,
  victimId,
});

function match(kd: number, lobbyElo: number, win = true) {
  return {
    faceitIsWin: win,
    payload: JSON.stringify({ teamA: [{ elo: lobbyElo }], teamB: [{ elo: lobbyElo }] }),
    events: [
      ...Array.from({ length: Math.round(kd * 20) }, () => killEvent(1, 2)),
      ...Array.from({ length: 20 }, () => killEvent(2, 1)),
    ],
  };
}

async function checkIntegrity(
  elo: number,
  matches: Array<{ faceitEloDelta: number | null; faceitRating: number | null }>,
) {
  return verifyFaceitEloIntegrity(
    {
      match: { findMany: async () => matches.map((entry, index) => ({ id: index + 1, ...entry })) },
    },
    { id: 1, faceitElo: elo },
  );
}

async function main() {
  assert.equal(eloForPlacementKd(0.99), 1000);
  assert.equal(eloForPlacementKd(1), 1100);
  assert.equal(eloForPlacementKd(1.5), 1600);
  assert.equal(eloForPlacementKd(2.5), 2001);
  assert.equal(calculatePlacement([match(1.5, 1500), match(1.5, 1500), match(1.5, 1500)], 1), 1600);
  assert.equal(
    calculatePlacement([match(1.5, 1500), match(1.5, 1500, false), match(1.5, 1500)], 1),
    1550,
  );
  assert.equal(calculatePlacement([match(2.5, 1500)], 1), 2001);
  assert.equal(calculatePlacement([match(2.5, 1500), match(0.8, 2001)], 1), 1800);
  const rebound = calculatePlacement(
    [match(1.3, 1400), match(0.8, 2001, false), match(1.5, 1600)],
    1,
  );
  assert.ok(rebound >= 1550 && rebound <= 1800, `rebound Elo: ${rebound}`);

  assert.equal((await checkIntegrity(0, [])).valid, true);
  assert.equal(
    (await checkIntegrity(0, [{ faceitEloDelta: null, faceitRating: null }])).valid,
    true,
  );
  const repairablePlacement = await checkIntegrity(1500, [
    { faceitEloDelta: null, faceitRating: null },
  ]);
  assert.equal(repairablePlacement.valid, false);
  assert.equal(repairablePlacement.repairable, true);
  assert.equal(repairablePlacement.expectedElo, 0);
  assert.equal((await checkIntegrity(1200, [])).valid, true);
  assert.equal(
    (await checkIntegrity(1225, [{ faceitEloDelta: 25, faceitRating: null }])).valid,
    true,
  );
  const placed: Array<{ faceitEloDelta: number | null; faceitRating: number | null }> = [
    { faceitEloDelta: null, faceitRating: null },
    { faceitEloDelta: null, faceitRating: null },
    { faceitEloDelta: null, faceitRating: 1600 },
  ];
  assert.equal((await checkIntegrity(1600, placed)).valid, true);
  assert.equal(
    (await checkIntegrity(1625, [...placed, { faceitEloDelta: 25, faceitRating: null }])).valid,
    true,
  );
  const repairableRated = await checkIntegrity(1500, [
    ...placed,
    { faceitEloDelta: 25, faceitRating: null },
  ]);
  assert.equal(repairableRated.valid, false);
  assert.equal(repairableRated.repairable, true);
  assert.equal(repairableRated.expectedElo, 1625);
  const invalidDelta = await checkIntegrity(1625, [
    ...placed,
    { faceitEloDelta: 999, faceitRating: null },
  ]);
  assert.equal(invalidDelta.valid, false);
  assert.equal(invalidDelta.repairable, false);
  assert.equal((await checkIntegrity(1700, placed)).valid, false);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
