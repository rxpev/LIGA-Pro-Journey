/**
 * DB-backed regression coverage for the NPC roster lifecycle.
 *
 * The test copies the packaged root save into a temporary APPDATA directory,
 * then exercises the real Prisma transactions used by worldgen. It never
 * opens or writes a user save.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Constants } from '@liga/shared';
import {
  getNpcTransferTeamIdentity,
  isNpcTransferCompatible,
  serializeNpcTransferRecruitmentPolicy,
} from './npc-transfer-identity';

process.env.NODE_ENV = 'cli';

const ROLE_RIFLER = Constants.PlayerRole.RIFLER;
const ROLE_SNIPER = Constants.PlayerRole.SNIPER;
const DAY_MS = 24 * 60 * 60 * 1000;

function normalizeRole(role: unknown) {
  const normalized = String(role ?? '')
    .trim()
    .toUpperCase()
    .replace(/[\s_-]+/g, '');
  if (normalized === 'AWPER' || normalized === 'AWP' || normalized === 'SNIPERPLAYER') {
    return 'SNIPER';
  }
  if (normalized === 'RIFLE' || normalized === 'RIFLEPLAYER') return 'RIFLER';
  return normalized;
}

function isSniper(role: unknown) {
  return normalizeRole(role) === 'SNIPER';
}

const TEAM_INCLUDE = {
  country: { include: { continent: true } },
  players: {
    include: {
      country: { include: { continent: true } },
    },
  },
};

async function main() {
  const appDataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'liga-npc-transfer-'));
  const rootSavePath = path.resolve('src/backend/prisma/saves/save_0.db');
  const temporarySavePath = path.join(appDataPath, 'LIGA Pro Journey', 'saves', 'save_0.db');
  await fs.mkdir(path.dirname(temporarySavePath), { recursive: true });
  await fs.copyFile(rootSavePath, temporarySavePath);
  process.env.APPDATA = appDataPath;

  // Require database/worldgen only after APPDATA points at the isolated copy.
  const { default: DatabaseClient } = require('./database-client') as typeof import('./database-client');
  const worldgen = require('./worldgen') as typeof import('./worldgen');
  let prisma: any;
  let sequence = 0;
  const createdTeamIds: number[] = [];

  try {
    await DatabaseClient.connect(0);
    prisma = DatabaseClient.prisma;
    const profile = await prisma.profile.findFirst({ select: { date: true } });
    assert.ok(profile?.date, 'temporary save should have a profile date');
    const date = new Date(profile.date);
    const future = new Date(date.getTime() + 365 * DAY_MS);
    const past = new Date(date.getTime() - DAY_MS);

    const ad = await prisma.country.findUnique({
      where: { code: 'AD' },
      select: { id: true, code: true, continent: { select: { code: true } } },
    });
    const germany = await prisma.country.findUnique({
      where: { code: 'DE' },
      select: { id: true, code: true, continent: { select: { code: true } } },
    });
    const azerbaijan = await prisma.country.findUnique({
      where: { code: 'AZ' },
      select: { id: true, code: true, continent: { select: { code: true } } },
    });
    assert.ok(ad, 'fixture must contain Andorra');
    assert.ok(germany, 'fixture must contain Germany');
    assert.ok(azerbaijan, 'fixture must contain Azerbaijan');

    const policy = serializeNpcTransferRecruitmentPolicy({
      version: 1,
      type: 'national-lock',
      countryId: ad.id,
      region: 'Europe',
    });
    const cisPolicy = serializeNpcTransferRecruitmentPolicy({
      version: 1,
      type: 'cis-core',
      region: 'Europe',
    });

    async function loadTeam(id: number) {
      return prisma.team.findUnique({ where: { id }, include: TEAM_INCLUDE });
    }

    async function createTeam(
      label: string,
      options: { countryId?: number; policy?: string; tier?: number; elo?: number } = {},
    ) {
      sequence += 1;
      const team = await prisma.team.create({
        data: {
          name: `NPC lifecycle ${label} ${sequence}`,
          slug: `npc-lifecycle-${label.toLowerCase()}-${sequence}`,
          countryId: options.countryId ?? ad.id,
          tier: options.tier ?? 0,
          elo: options.elo ?? 1000,
          npcRecruitmentPolicy: options.policy ?? policy,
        },
      });
      createdTeamIds.push(team.id);
      return team;
    }

    async function createPlayer(params: {
      label: string;
      role?: string;
      teamId?: number | null;
      starter?: boolean;
      xp?: number;
      elo?: number;
      age?: number;
      contractEnd?: Date | null;
      countryId?: number;
      isRegen?: boolean;
    }) {
      const player = await prisma.player.create({
        data: {
          name: `NPC lifecycle ${params.label} ${sequence}-${Math.random().toString(36).slice(2, 8)}`,
          role: params.role ?? ROLE_RIFLER,
          countryId: params.countryId ?? ad.id,
          teamId: params.teamId ?? null,
          starter: params.starter ?? false,
          userControlled: false,
          transferListed: params.teamId == null,
          xp: params.xp ?? 50,
          elo: params.elo ?? 2500,
          age: params.age ?? 25,
          cost: 1000,
          wages: 100,
          contractEnd: params.contractEnd === undefined ? future : params.contractEnd,
          isRegen: params.isRegen ?? false,
          generatedAt: params.isRegen ? date : null,
        },
      });
      if (params.teamId != null) {
        await prisma.careerStint.create({
          data: {
            playerId: player.id,
            teamId: params.teamId,
            tier: 0,
            starter: params.starter ?? false,
            startedAt: new Date(date.getTime() - DAY_MS),
          },
        });
      }
      return player;
    }

    async function createStarters(
      teamId: number,
      roles: string[],
      label: string,
      xpByIndex: number[] = [],
      contractEnd?: Date,
      countryIds?: number[],
    ) {
      const players = [];
      for (let index = 0; index < roles.length; index += 1) {
        players.push(
          await createPlayer({
            label: `${label}-${index}`,
            role: roles[index],
            teamId,
            starter: true,
            xp: xpByIndex[index] ?? 50,
            contractEnd,
            countryId: countryIds?.[index],
          }),
        );
      }
      return players;
    }

    async function roster(teamId: number) {
      const players = await prisma.player.findMany({
        where: { teamId, starter: true },
        select: { id: true, role: true, countryId: true, starter: true },
        orderBy: { id: 'asc' },
      });
      return {
        players,
        snipers: players.filter((player: any) => isSniper(player.role)),
      };
    }

    // New-save initialization writes a policy for every packaged NPC team.
    const missingPolicies = await prisma.team.count({ where: { npcRecruitmentPolicy: null } });
    assert.equal(missingPolicies, 0, 'new-save initialization should seed every team policy');

    // A national lock survives two simultaneous departures. A CIS/region
    // heuristic must not replace the stored exact-nationality policy.
    const lockTeam = await createTeam('persistent-lock');
    const lockPlayers = await createStarters(
      lockTeam.id,
      [ROLE_SNIPER, ROLE_RIFLER, ROLE_RIFLER, ROLE_RIFLER, ROLE_RIFLER],
      'lock',
    );
    await prisma.player.updateMany({
      where: { id: { in: [lockPlayers[3].id, lockPlayers[4].id] } },
      data: { teamId: null, starter: false },
    });
    const incompleteLock = await loadTeam(lockTeam.id);
    const lockIdentity = getNpcTransferTeamIdentity(incompleteLock);
    assert.equal(lockIdentity.type, 'national-lock');
    assert.equal((lockIdentity as any).countryId, ad.id);
    assert.equal(
      isNpcTransferCompatible(incompleteLock, {
        countryId: germany.id,
        country: germany,
      }),
      false,
      'stored national lock must reject a foreign replacement after vacancies',
    );
    // Restore this fixture before demand planning so it does not add an
    // unrelated vacancy to the later multi-team intake.
    await prisma.player.updateMany({
      where: { id: { in: [lockPlayers[3].id, lockPlayers[4].id] } },
      data: { teamId: lockTeam.id, starter: true },
    });

    // A shortage of two starters is repaired from available riflers first;
    // with no domestic AWP/free-agent supply, the urgent intake creates one
    // role-correct regen and immediately repairs the missing AWP slot.
    const shortageTeam = await createTeam('shortage');
    await createStarters(shortageTeam.id, [ROLE_RIFLER, ROLE_RIFLER, ROLE_RIFLER], 'shortage');
    const shortageRiflers = [
      await createPlayer({ label: 'shortage-free-rifler-1', elo: 2500 }),
      await createPlayer({ label: 'shortage-free-rifler-2', elo: 2500 }),
    ];
    const repairedBeforeRegen = await worldgen.__npcWorldgenTest.repairNpcTeamRoster(
      shortageTeam.id,
      date,
      { maxMoves: 5 },
    );
    assert.equal(repairedBeforeRegen, false, 'rifler supply alone cannot satisfy a missing AWP');
    let shortageRoster = await roster(shortageTeam.id);
    assert.equal(shortageRoster.players.length, 5, 'two vacancy slots should be filled in one repair pass');
    assert.equal(shortageRoster.snipers.length, 0, 'the pass should leave the unresolved AWP visible');
    for (const player of shortageRiflers) {
      const current = await prisma.player.findUnique({ where: { id: player.id }, select: { teamId: true } });
      assert.equal(current?.teamId, shortageTeam.id);
    }
    const domesticAwperSupply = await prisma.player.count({
      where: { countryId: ad.id, teamId: null, retiredAt: null, role: ROLE_SNIPER },
    });
    assert.equal(domesticAwperSupply, 0, 'the shortage must have no eligible domestic free AWP');
    await worldgen.__npcWorldgenTest.generateNpcRegenIntake(true, new Set([shortageTeam.id]));
    shortageRoster = await roster(shortageTeam.id);
    assert.equal(shortageRoster.players.length, 5);
    assert.equal(shortageRoster.snipers.length, 1, 'urgent regen should repair the missing AWP immediately');
    const shortageRegen = await prisma.player.findFirst({
      where: { teamId: shortageTeam.id, starter: true, isRegen: true, role: ROLE_SNIPER },
    });
    assert.ok(shortageRegen, 'urgent supply should be a domestic role-correct regen');

    // Retire the rifler benched by the AWP replacement so the next scenario
    // has genuinely exhausted domestic teamless and benched supply.
    await prisma.player.updateMany({
      where: { teamId: shortageTeam.id, starter: false, userControlled: false },
      data: { teamId: null, retiredAt: date, transferListed: false },
    });

    // Several simultaneous teams exercise demand-sized generation and the
    // shared market snapshot. The planner must create one AWP and one rifler
    // per two-slot shortage, then repair all teams in the same invocation.
    const manyVacancyTeams = [];
    for (let index = 0; index < 3; index += 1) {
      const team = await createTeam(`many-vacancies-${index}`);
      await createStarters(team.id, [ROLE_RIFLER, ROLE_RIFLER, ROLE_RIFLER], `many-${index}`);
      manyVacancyTeams.push(team);
    }
    const domesticMarketCount = await prisma.player.count({
      where: {
        countryId: ad.id,
        userControlled: false,
        retiredAt: null,
        OR: [
          { teamId: null },
          { teamId: { not: null }, starter: false },
        ],
      },
    });
    assert.equal(domesticMarketCount, 0, 'simultaneous shortage starts with no domestic market supply');
    const intakeStartedAt = Date.now();
    await worldgen.__npcWorldgenTest.generateNpcRegenIntake(
      true,
      new Set(manyVacancyTeams.map((team: any) => team.id)),
    );
    const intakeElapsedMs = Date.now() - intakeStartedAt;
    assert.ok(intakeElapsedMs < 20_000, `targeted intake should stay bounded (took ${intakeElapsedMs}ms)`);
    for (const team of manyVacancyTeams) {
      const currentRoster = await roster(team.id);
      assert.equal(currentRoster.players.length, 5);
      assert.equal(currentRoster.snipers.length, 1);
    }

    // Duplicate AWP repair explicitly benches the duplicate before any
    // low-XP rifler, preserving the single-AWP invariant.
    const duplicateTeam = await createTeam('duplicate-awp');
    const duplicatePlayers = await createStarters(
      duplicateTeam.id,
      [ROLE_SNIPER, ROLE_RIFLER, ROLE_RIFLER, ROLE_RIFLER, ROLE_RIFLER, 'AWPER'],
      'duplicate',
      [90, 60, 60, 60, 60, 1],
    );
    const duplicateRepaired = await worldgen.__npcWorldgenTest.repairNpcTeamRoster(
      duplicateTeam.id,
      date,
      { maxMoves: 2 },
    );
    assert.equal(duplicateRepaired, true);
    const duplicateRoster = await roster(duplicateTeam.id);
    assert.equal(duplicateRoster.players.length, 5);
    assert.equal(duplicateRoster.snipers.length, 1);
    const duplicateAwper = await prisma.player.findUnique({
      where: { id: duplicatePlayers[5].id },
      select: { starter: true },
    });
    assert.equal(duplicateAwper?.starter, false, 'duplicate AWP must be benched first');

    // CIS compatibility needs the candidate's full country object during
    // victim selection. This also proves a healthy team can upgrade its
    // existing AWP through the free-agent path instead of banning snipers.
    const cisUpgradeTeam = await createTeam('cis-awp-upgrade', {
      countryId: azerbaijan.id,
      policy: cisPolicy,
    });
    const cisUpgradePlayers = await createStarters(
      cisUpgradeTeam.id,
      [ROLE_SNIPER, ROLE_RIFLER, ROLE_RIFLER, ROLE_RIFLER, ROLE_RIFLER],
      'cis-awp-upgrade',
      [20, 50, 50, 50, 50],
      undefined,
      [azerbaijan.id, azerbaijan.id, azerbaijan.id, azerbaijan.id, azerbaijan.id],
    );
    const cisAwperCandidate = await createPlayer({
      label: 'cis-awp-free-agent',
      role: ROLE_SNIPER,
      countryId: azerbaijan.id,
      xp: 70,
      elo: 2500,
    });
    const originalSignRandom = Math.random;
    Math.random = () => 0.0001;
    let cisSigned = false;
    try {
      cisSigned = await worldgen.__npcWorldgenTest.trySignNPCFreeAgent({
        from: await loadTeam(cisUpgradeTeam.id),
        date,
      });
    } finally {
      Math.random = originalSignRandom;
    }
    assert.equal(cisSigned, true, 'CIS free-agent AWP upgrade should be accepted');
    const cisCandidateAfterSign = await prisma.player.findUnique({
      where: { id: cisAwperCandidate.id },
      select: { teamId: true, starter: true },
    });
    const oldCisAwper = await prisma.player.findUnique({
      where: { id: cisUpgradePlayers[0].id },
      select: { starter: true },
    });
    assert.deepEqual(cisCandidateAfterSign, { teamId: cisUpgradeTeam.id, starter: true });
    assert.equal(oldCisAwper?.starter, false);
    assert.equal((await roster(cisUpgradeTeam.id)).snipers.length, 1);

    // The first elite-placement victim scan receives the same full country
    // context. Use an AZ-only CIS team so no packaged player can satisfy the
    // policy accidentally, and make it the highest-ranked eligible target.
    const cisEliteTeam = await createTeam('cis-elite-placement', {
      countryId: azerbaijan.id,
      policy: cisPolicy,
      tier: 4,
      elo: 999999,
    });
    await createStarters(
      cisEliteTeam.id,
      [ROLE_SNIPER, ROLE_RIFLER, ROLE_RIFLER, ROLE_RIFLER, ROLE_RIFLER],
      'cis-elite-placement',
      [80, 1, 50, 50, 50],
      undefined,
      [azerbaijan.id, azerbaijan.id, azerbaijan.id, azerbaijan.id, azerbaijan.id],
    );
    const cisEliteCandidate = await createPlayer({
      label: 'cis-elite-free-agent',
      role: ROLE_RIFLER,
      countryId: azerbaijan.id,
      xp: 90,
      elo: 3000,
    });
    const cisEliteRecord = await prisma.player.findUnique({
      where: { id: cisEliteCandidate.id },
      include: { country: { include: { continent: true } } },
    });
    // Placement samples the top five, not necessarily the highest-ranked
    // team. Isolate this fixture from packaged teams to avoid random failures.
    const otherTiers = await prisma.team.findMany({
      where: { id: { not: cisEliteTeam.id } },
      select: { id: true, tier: true },
    });
    await prisma.team.updateMany({ where: { id: { not: cisEliteTeam.id } }, data: { tier: 0 } });
    let elitePlaced: boolean;
    try {
      elitePlaced = await worldgen.__npcWorldgenTest.tryPlaceEliteNPCFreeAgent({
        player: cisEliteRecord,
        date,
      });
    } finally {
      await prisma.$transaction(otherTiers.map((team: any) =>
        prisma.team.update({ where: { id: team.id }, data: { tier: team.tier } }),
      ));
    }
    assert.equal(elitePlaced, true, 'CIS elite placement should find a role-compatible victim');
    assert.equal(
      (await prisma.player.findUnique({ where: { id: cisEliteCandidate.id }, select: { teamId: true } }))
        ?.teamId,
      cisEliteTeam.id,
    );

    // A real paid movement checks fresh ownership and records the buyer/seller
    // direction consistently across Player, CareerStint and Transfer.
    const atomicBuyer = await createTeam('atomic-buyer');
    const atomicSeller = await createTeam('atomic-seller');
    const atomicBuyerPlayers = await createStarters(
      atomicBuyer.id,
      [ROLE_SNIPER, ROLE_RIFLER, ROLE_RIFLER, ROLE_RIFLER, ROLE_RIFLER],
      'atomic-buyer',
      [80, 1, 50, 50, 50],
    );
    const atomicSellerPlayers = await createStarters(
      atomicSeller.id,
      [ROLE_SNIPER, ROLE_RIFLER, ROLE_RIFLER, ROLE_RIFLER, ROLE_RIFLER, ROLE_RIFLER],
      'atomic-seller',
      [80, 50, 50, 50, 50, 90],
    );
    const atomicBuyerContext = await loadTeam(atomicBuyer.id);
    const transferCountBeforeAtomicMove = await prisma.transfer.count();
    const atomicMoved = await worldgen.__npcWorldgenTest.moveNpcPlayerAtomic({
      playerId: atomicSellerPlayers[5].id,
      expectedTeamId: atomicSeller.id,
      targetTeam: atomicBuyerContext,
      date,
      victimId: atomicBuyerPlayers[1].id,
      expectedRole: ROLE_RIFLER,
    });
    assert.equal(atomicMoved, true);
    const atomicTarget = await prisma.player.findUnique({
      where: { id: atomicSellerPlayers[5].id },
      select: { teamId: true },
    });
    assert.equal(atomicTarget?.teamId, atomicBuyer.id, 'signed ownership must move to the destination');
    const atomicStint = await prisma.careerStint.findFirst({
      where: { playerId: atomicSellerPlayers[5].id, endedAt: null },
      orderBy: { startedAt: 'desc' },
      select: { teamId: true, starter: true },
    });
    assert.deepEqual(atomicStint, { teamId: atomicBuyer.id, starter: true });
    const atomicTransfer = await prisma.transfer.findFirst({
      where: { playerId: atomicSellerPlayers[5].id },
      orderBy: { id: 'desc' },
      include: { from: true, to: true, offers: true },
    });
    assert.ok(atomicTransfer);
    assert.equal(atomicTransfer.from.id, atomicBuyer.id, 'Transfer.from must be the buyer');
    assert.equal(atomicTransfer.to?.id, atomicSeller.id, 'Transfer.to must be the seller');
    assert.equal(atomicTransfer.offers[0]?.cost, 1000);
    assert.equal(await prisma.transfer.count(), transferCountBeforeAtomicMove + 1);
    assert.equal((await roster(atomicBuyer.id)).snipers.length, 1);
    assert.equal((await roster(atomicSeller.id)).snipers.length, 1);
    assert.equal((await roster(atomicSeller.id)).players.length, 5);

    // User-controlled players can still be the selected bench victim during
    // a normal upgrade; the NPC candidate is the only player whose ownership
    // may move.
    const userVictimTeam = await createTeam('user-victim');
    const userVictimPlayers = await createStarters(
      userVictimTeam.id,
      [ROLE_SNIPER, ROLE_RIFLER, ROLE_RIFLER, ROLE_RIFLER, ROLE_RIFLER],
      'user-victim',
      [80, 1, 50, 50, 50],
    );
    await prisma.player.update({
      where: { id: userVictimPlayers[1].id },
      data: { userControlled: true },
    });
    const userUpgradeCandidate = await createPlayer({ label: 'user-victim-upgrade', xp: 70 });
    const userVictimContext = await loadTeam(userVictimTeam.id);
    const userMove = await worldgen.__npcWorldgenTest.moveNpcPlayerAtomic({
      playerId: userUpgradeCandidate.id,
      expectedTeamId: null,
      targetTeam: userVictimContext,
      date,
      victimId: userVictimPlayers[1].id,
      expectedRole: ROLE_RIFLER,
    });
    assert.equal(userMove, true);
    const userAfter = await prisma.player.findUnique({
      where: { id: userVictimPlayers[1].id },
      select: { teamId: true, starter: true, userControlled: true },
    });
    assert.deepEqual(userAfter, {
      teamId: userVictimTeam.id,
      starter: false,
      userControlled: true,
    });

    // A validation error after the victim is selected must roll back both the
    // victim bench and candidate ownership as one transaction.
    const rollbackBuyer = await createTeam('rollback-buyer');
    const rollbackSeller = await createTeam('rollback-seller');
    const rollbackBuyerPlayers = await createStarters(
      rollbackBuyer.id,
      [ROLE_SNIPER, ROLE_RIFLER, ROLE_RIFLER, ROLE_RIFLER, ROLE_RIFLER],
      'rollback-buyer',
      [80, 1, 50, 50, 50],
    );
    const rollbackSellerPlayers = await createStarters(
      rollbackSeller.id,
      [ROLE_SNIPER, ROLE_RIFLER, ROLE_RIFLER, ROLE_RIFLER, ROLE_RIFLER, ROLE_RIFLER],
      'rollback-seller',
      [80, 50, 50, 50, 50, 90],
    );
    const rollbackBuyerContext = await loadTeam(rollbackBuyer.id);
    const transferCountBeforeRollback = await prisma.transfer.count();
    const rollbackResult = await worldgen.__npcWorldgenTest.moveNpcPlayerAtomic({
      playerId: rollbackSellerPlayers[5].id,
      expectedTeamId: rollbackSeller.id,
      targetTeam: rollbackBuyerContext,
      date,
      victimId: rollbackBuyerPlayers[1].id,
      expectedRole: ROLE_RIFLER,
      contractEnd: new Date(Number.NaN) as any,
    });
    assert.equal(rollbackResult, false);
    const rollbackCandidate = await prisma.player.findUnique({
      where: { id: rollbackSellerPlayers[5].id },
      select: { teamId: true },
    });
    const rollbackVictim = await prisma.player.findUnique({
      where: { id: rollbackBuyerPlayers[1].id },
      select: { starter: true },
    });
    assert.equal(rollbackCandidate?.teamId, rollbackSeller.id);
    assert.equal(rollbackVictim?.starter, true);
    assert.equal(await prisma.transfer.count(), transferCountBeforeRollback);

    // Exercise the actual five-to-five paid acceptance path. The seller is
    // allowed to dip below five only inside the transaction because a planned
    // domestic replacement is committed immediately afterward.
    const paidBuyer = await createTeam('paid-buyer', {
      countryId: azerbaijan.id,
      policy: cisPolicy,
    });
    const paidSeller = await createTeam('paid-seller', {
      countryId: azerbaijan.id,
      policy: cisPolicy,
    });
    const paidBuyerPlayers = await createStarters(
      paidBuyer.id,
      [ROLE_SNIPER, ROLE_RIFLER, ROLE_RIFLER, ROLE_RIFLER, ROLE_RIFLER],
      'paid-buyer',
      [80, 1, 50, 50, 50],
      undefined,
      [azerbaijan.id, azerbaijan.id, azerbaijan.id, azerbaijan.id, azerbaijan.id],
    );
    const paidSellerPlayers = await createStarters(
      paidSeller.id,
      [ROLE_SNIPER, ROLE_RIFLER, ROLE_RIFLER, ROLE_RIFLER, ROLE_RIFLER],
      'paid-seller',
      [80, 50, 50, 50, 90],
      undefined,
      [azerbaijan.id, azerbaijan.id, azerbaijan.id, azerbaijan.id, azerbaijan.id],
    );
    const paidBackfill = await createPlayer({ label: 'paid-backfill', elo: 2500, countryId: azerbaijan.id });
    const paidTransfer = await prisma.transfer.create({
      data: {
        status: Constants.TransferStatus.TEAM_PENDING,
        from: { connect: { id: paidBuyer.id } },
        to: { connect: { id: paidSeller.id } },
        target: { connect: { id: paidSellerPlayers[4].id } },
        offers: {
          create: [
            {
              status: Constants.TransferStatus.TEAM_PENDING,
              cost: 1000,
              wages: 100,
              contractYears: 1,
            },
          ],
        },
      },
    });
    const originalRandom = Math.random;
    Math.random = () => 0.0001;
    try {
      await worldgen.onTransferParse({ payload: String(paidTransfer.id) } as any);
    } finally {
      Math.random = originalRandom;
    }
    const acceptedPaidTransfer = await prisma.transfer.findUnique({
      where: { id: paidTransfer.id },
      include: { offers: true },
    });
    assert.equal(acceptedPaidTransfer?.status, Constants.TransferStatus.PLAYER_ACCEPTED);
    assert.equal(acceptedPaidTransfer?.offers[0]?.status, Constants.TransferStatus.PLAYER_ACCEPTED);
    const paidTarget = await prisma.player.findUnique({
      where: { id: paidSellerPlayers[4].id },
      select: { teamId: true },
    });
    const paidReplacement = await prisma.player.findUnique({
      where: { id: paidBackfill.id },
      select: { teamId: true },
    });
    assert.equal(paidTarget?.teamId, paidBuyer.id);
    assert.equal(paidReplacement?.teamId, paidSeller.id);
    assert.equal((await roster(paidBuyer.id)).players.length, 5);
    assert.equal((await roster(paidBuyer.id)).snipers.length, 1);
    assert.equal((await roster(paidSeller.id)).players.length, 5);
    assert.equal((await roster(paidSeller.id)).snipers.length, 1);

    // A stale pending offer must not move a target that no longer belongs to
    // the recorded seller, and it must remain available for safe reconciliation.
    const staleTransfer = await prisma.transfer.create({
      data: {
        status: Constants.TransferStatus.TEAM_PENDING,
        from: { connect: { id: paidBuyer.id } },
        to: { connect: { id: paidSeller.id } },
        target: { connect: { id: paidSellerPlayers[4].id } },
        offers: {
          create: [{ status: Constants.TransferStatus.TEAM_PENDING, cost: 1000, wages: 100, contractYears: 1 }],
        },
      },
    });
    const staleRandom = Math.random;
    Math.random = () => 0.0001;
    try {
      await worldgen.onTransferParse({ payload: String(staleTransfer.id) } as any);
    } finally {
      Math.random = staleRandom;
    }
    const untouchedStaleTransfer = await prisma.transfer.findUnique({
      where: { id: staleTransfer.id },
      select: { status: true },
    });
    assert.equal(untouchedStaleTransfer?.status, Constants.TransferStatus.TEAM_PENDING);

    // Fresh expiry validation and routine repair: two expired starters leave a
    // team short twice, and each is replaced without touching user players.
    await prisma.player.updateMany({
      where: { userControlled: false, contractEnd: { lte: date } },
      data: { contractEnd: future },
    });
    const expiryTeam = await createTeam('expiry');
    const expiryPlayers = await createStarters(
      expiryTeam.id,
      [ROLE_SNIPER, ROLE_RIFLER, ROLE_RIFLER, ROLE_RIFLER, ROLE_RIFLER],
      'expiry',
      [80, 40, 40, 50, 50],
    );
    await prisma.player.updateMany({
      where: { id: { in: [expiryPlayers[1].id, expiryPlayers[2].id] } },
      data: { contractEnd: past },
    });
    const expirySpare1 = await createPlayer({ label: 'expiry-spare-1', elo: 2500 });
    const expirySpare2 = await createPlayer({ label: 'expiry-spare-2', elo: 2500 });
    await worldgen.__npcWorldgenTest.processNPCContractExtensions();
    const expiryRoster = await roster(expiryTeam.id);
    assert.equal(expiryRoster.players.length, 5);
    assert.equal(expiryRoster.snipers.length, 1);
    for (const expiredPlayer of [expiryPlayers[1], expiryPlayers[2]]) {
      const current = await prisma.player.findUnique({ where: { id: expiredPlayer.id }, select: { teamId: true } });
      assert.equal(current?.teamId, null);
      const expiryTransfer = await prisma.transfer.findFirst({
        where: { playerId: expiredPlayer.id, status: Constants.TransferStatus.EXPIRED },
      });
      assert.ok(expiryTransfer, 'each expired player should have an EXPIRED transfer record');
    }
    const expirySpareTeams = await prisma.player.findMany({
      where: { id: { in: [expirySpare1.id, expirySpare2.id] } },
      select: { teamId: true },
    });
    assert.ok(expirySpareTeams.every((player: any) => player.teamId === expiryTeam.id));

    // A subsequent healthy-world tick should avoid a per-team repair scan.
    const health = await worldgen.__npcWorldgenTest.loadNpcRosterHealth(true);
    assert.deepEqual(health.find((team) => team.id === expiryTeam.id), {
      id: expiryTeam.id, count: 5, snipers: 1,
    }, 'starter-only projections must still count the sniper');
    // The bulk scan must agree with the full roster for every NPC team,
    // including empty teams and legacy role spellings.
    const fullTeams = await prisma.team.findMany({
      where: { profile: null },
      include: { players: true },
    });
    for (const team of fullTeams) {
      const starters = team.players.filter((player: any) => player.starter);
      assert.deepEqual(health.find((entry) => entry.id === team.id), {
        id: team.id, count: starters.length,
        snipers: starters.filter((player: any) => isSniper(player.role)).length,
      });
    }
    const healthyPassStartedAt = Date.now();
    await worldgen.__npcWorldgenTest.processNPCContractExtensions();
    const healthyPassElapsedMs = Date.now() - healthyPassStartedAt;
    assert.ok(healthyPassElapsedMs < 20_000, `healthy tick should stay bounded (took ${healthyPassElapsedMs}ms)`);

    console.log(
      `NPC lifecycle integration passed (targeted intake ${intakeElapsedMs}ms; ` +
        `healthy tick ${healthyPassElapsedMs}ms; ${createdTeamIds.length} temporary teams).`,
    );
  } finally {
    await DatabaseClient.disconnect().catch(() => Promise.resolve());
    await fs.rm(appDataPath, { recursive: true, force: true });
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
