import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Constants } from '@liga/shared';

process.env.NODE_ENV = 'cli';

async function main() {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'liga-retirement-evidence-'));
  const save = path.join(temporaryRoot, 'LIGA Pro Journey', 'saves', 'save_0.db');
  await fs.mkdir(path.dirname(save), { recursive: true });
  await fs.copyFile(path.resolve('src/backend/prisma/saves/save_0.db'), save);
  process.env.APPDATA = temporaryRoot;
  const { default: DatabaseClient } =
    require('./database-client') as typeof import('./database-client');
  const { readRetirementEvidence } =
    require('./retirement-evidence') as typeof import('./retirement-evidence');
  try {
    await DatabaseClient.connect(0);
    const prisma = DatabaseClient.prisma;
    const teams = await prisma.team.findMany({ take: 3, orderBy: { id: 'asc' } });
    const players = await prisma.player.findMany({ take: 30, orderBy: { id: 'asc' } });
    const tier = await prisma.tier.findFirstOrThrow();
    const federation = await prisma.federation.findFirstOrThrow();
    const tiers = [tier.slug, Constants.TierSlug.MAJOR_CHAMPIONS_STAGE];
    // Preserve the existing rule: every first-place entry in a competition the
    // player appeared in counts, even if the winning team differs from theirs.
    await prisma.competition.create({
      data: {
        tierId: tier.id,
        federationId: federation.id,
        competitors: { create: teams.map((team) => ({ teamId: team.id, position: 1 })) },
        matches: {
          create: {
            date: new Date('2026-06-01'),
            payload: '{}',
            status: Constants.MatchStatus.COMPLETED,
            players: { connect: [{ id: players[0].id }] },
          },
        },
      },
    });
    let oldMs = 0;
    let newMs = 0;
    for (const player of players) {
      for (const peakTier of [-1, 0, 3, 10]) {
        const started = performance.now();
        const nationalTeams = await prisma.team.findMany({
          where: { profile: null, countryId: player.countryId },
          select: {
            id: true,
            tier: true,
            players: { where: { starter: true }, select: { xp: true } },
          },
        });
        const trophies = await prisma.competitionToTeam.findMany({
          where: {
            position: 1,
            teamId: { not: null },
            competition: {
              OR: [
                { tier: { slug: { in: tiers } } },
                { tier: { league: { slug: Constants.LeagueSlug.ESPORTS_PRO_LEAGUE } } },
              ],
              matches: { some: { players: { some: { id: player.id } } } },
            },
          },
          select: { competition: { select: { tier: { select: { slug: true } } } } },
        });
        const expected = {
          hasViableNationalContinuation: nationalTeams.some(
            (team) =>
              team.id !== player.teamId &&
              team.tier <= peakTier &&
              team.players.some((starter) => starter.xp <= player.xp - 5),
          ),
          careerTrophyPoints: trophies.reduce(
            (sum, trophy) =>
              sum +
              (trophy.competition.tier.slug === Constants.TierSlug.MAJOR_CHAMPIONS_STAGE ? 3 : 1),
            0,
          ),
        };
        oldMs += performance.now() - started;
        const newStarted = performance.now();
        const actual = await readRetirementEvidence(player, peakTier, tiers);
        newMs += performance.now() - newStarted;
        assert.deepEqual(actual, expected, `player=${player.id}, peak=${peakTier}`);
      }
    }
    console.log(
      `Retirement evidence equivalence passed (120 cases): old=${oldMs.toFixed(1)}ms new=${newMs.toFixed(1)}ms`,
    );
  } finally {
    await DatabaseClient.disconnect().catch(() => {});
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
