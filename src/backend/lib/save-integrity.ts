import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { app, safeStorage } from 'electron';
import { PrismaClient, type PrismaClient as PrismaClientType } from '@prisma/client';

const SAVE_INTEGRITY_VERSION = 1;
const SAVE_IDENTITY_KEY = 'saveUuid';
const INSTALL_SECRET_FILE = 'index.bin';
const SAVE_REGISTRY_FILE = 'store.bin';
const SQLITE_PARAMETER_BATCH_SIZE = 500;
const SAVE_INTEGRITY_RESTORE_TRANSACTION_TIMEOUT_MS = 60_000;
const SAVE_INTEGRITY_RESTORE_TRANSACTION_MAX_WAIT_MS = 10_000;
const execFileAsync = promisify(execFile);

type SaveIntegrityRecord = {
  version: number;
  saveUuid: string;
  digest: string;
  sealedAt: string;
  snapshot?: ProtectedSaveSnapshot;
};

type SaveIntegrityResult = {
  valid: boolean;
  initialized: boolean;
  restored: boolean;
  actualDigest: string;
  expectedDigest?: string;
};

type SaveIdentity = {
  uuid: string;
  existed: boolean;
};

type ProtectedSaveSnapshot = Awaited<ReturnType<typeof buildProtectedSaveSnapshot>>;

type SaveRegistry = {
  version: number;
  files: Record<string, {
    saveUuid: string;
    sealedAt: string;
  }>;
};

function getStateCachePath() {
  if (process.env['NODE_ENV'] === 'cli') {
    return path.join(
      process.env.APPDATA || path.dirname(process.cwd()),
      'LIGA Pro Journey',
      '.state',
      'cache',
    );
  }

  return path.join(app.getPath('userData'), '.state', 'cache');
}

function getIntegrityPath(saveUuid: string) {
  return path.join(getStateCachePath(), `${saveUuid}.bin`);
}

function getInstallSecretPath() {
  return path.join(getStateCachePath(), INSTALL_SECRET_FILE);
}

function getSaveRegistryPath() {
  return path.join(getStateCachePath(), SAVE_REGISTRY_FILE);
}

function getLegacyIntegrityBasePath() {
  if (process.env['NODE_ENV'] === 'cli') {
    return path.join(
      process.env.APPDATA || path.dirname(process.cwd()),
      'LIGA Pro Journey',
      'integrity',
    );
  }

  return path.join(app.getPath('userData'), 'integrity');
}

function getLegacyUuidIntegrityPath(saveUuid: string) {
  return path.join(getLegacyIntegrityBasePath(), `${saveUuid}.json`);
}

async function hideWindowsPath(targetPath: string) {
  if (process.platform !== 'win32') return;

  await execFileAsync('attrib', ['+h', '+s', targetPath]).catch(() => Promise.resolve());
}

async function unhideWindowsPath(targetPath: string) {
  if (process.platform !== 'win32') return;

  await execFileAsync('attrib', ['-h', '-s', targetPath]).catch(() => Promise.resolve());
}

async function ensureStateCachePath() {
  const basePath = getStateCachePath();
  await fs.promises.mkdir(basePath, { recursive: true });
  await hideWindowsPath(path.dirname(basePath));
  await hideWindowsPath(basePath);
  return basePath;
}

function encryptString(value: string) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Safe storage encryption is not available.');
  }

  return safeStorage.encryptString(value);
}

function decryptString(value: Buffer) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Safe storage encryption is not available.');
  }

  return safeStorage.decryptString(value);
}

async function readEncryptedString(filePath: string) {
  return decryptString(await fs.promises.readFile(filePath));
}

async function writeEncryptedString(filePath: string, value: string) {
  await ensureStateCachePath();
  await unhideWindowsPath(filePath);
  await fs.promises.writeFile(filePath, encryptString(value));
  await hideWindowsPath(filePath);
}

async function unlinkProtectedFile(filePath: string) {
  await unhideWindowsPath(filePath);
  await fs.promises.unlink(filePath).catch(() => Promise.resolve());
}

async function getSaveFileKey(savePath: string) {
  const stat = await fs.promises.stat(savePath);
  return `${stat.dev}:${stat.ino}:${stat.birthtimeMs}`;
}

async function readSaveRegistry() {
  try {
    const raw = await readEncryptedString(getSaveRegistryPath());
    const registry = JSON.parse(raw) as SaveRegistry;

    if (registry.version === SAVE_INTEGRITY_VERSION && registry.files) {
      return registry;
    }

    throw new Error('Invalid save registry.');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }

  return {
    version: SAVE_INTEGRITY_VERSION,
    files: {},
  };
}

async function rememberSaveFile(savePath: string, saveUuid: string) {
  const registry = await readSaveRegistry();
  registry.files[await getSaveFileKey(savePath)] = {
    saveUuid,
    sealedAt: new Date().toISOString(),
  };
  await writeEncryptedString(getSaveRegistryPath(), JSON.stringify(registry));
}

async function forgetSaveFile(savePath: string) {
  const registry = await readSaveRegistry();
  delete registry.files[await getSaveFileKey(savePath)];
  await writeEncryptedString(getSaveRegistryPath(), JSON.stringify(registry));
}

async function getKnownSaveUuidForFile(savePath: string) {
  const registry = await readSaveRegistry();
  return registry.files[await getSaveFileKey(savePath)]?.saveUuid ?? null;
}

function normalizeDate(value: Date | string | null | undefined) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  }

  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
    .join(',')}}`;
}

function chunkArray<T>(values: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}

async function buildProtectedSaveSnapshot(prisma: PrismaClientType) {
  const [profiles, players, careerStints, teammateSeasonXp, faceitMatches] = await Promise.all([
    prisma.profile.findMany({
      orderBy: { id: 'asc' },
      select: {
        id: true,
        date: true,
        faceitElo: true,
        name: true,
        player: {
          select: {
            countryId: true,
          },
        },
        playerId: true,
        season: true,
        simulateNpcMatchStats: true,
        teamId: true,
      },
    }),
    prisma.player.findMany({
      orderBy: { id: 'asc' },
      select: {
        id: true,
        age: true,
        avatar: true,
        contractEnd: true,
        cost: true,
        countryId: true,
        elo: true,
        lastOfferAt: true,
        name: true,
        personality: true,
        prestige: true,
        role: true,
        starter: true,
        teamId: true,
        transferListed: true,
        userControlled: true,
        wages: true,
        xp: true,
      },
    }),
    prisma.careerStint.findMany({
      orderBy: { id: 'asc' },
      select: {
        id: true,
        endedAt: true,
        playerId: true,
        startedAt: true,
        starter: true,
        teamId: true,
        tier: true,
      },
    }),
    prisma.userTeammateSeasonXp.findMany({
      orderBy: { id: 'asc' },
      select: {
        id: true,
        baselineXp: true,
        playerId: true,
        profileId: true,
        season: true,
      },
    }),
    prisma.match.findMany({
      where: { matchType: 'FACEIT_PUG' },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        faceitEloDelta: true,
        faceitIsWin: true,
        faceitOpponents: true,
        faceitRating: true,
        faceitTeammates: true,
        status: true,
      },
    }),
  ]);

  return {
    version: SAVE_INTEGRITY_VERSION,
    profiles: profiles.map((profile) => ({
      ...profile,
      date: normalizeDate(profile.date),
    })),
    players: players.map((player) => ({
      ...player,
      contractEnd: normalizeDate(player.contractEnd),
      lastOfferAt: normalizeDate(player.lastOfferAt),
    })),
    careerStints: careerStints.map((stint) => ({
      ...stint,
      endedAt: normalizeDate(stint.endedAt),
      startedAt: normalizeDate(stint.startedAt),
    })),
    teammateSeasonXp,
    faceitMatches,
  };
}

async function ensureSaveIdentity(prisma: PrismaClientType): Promise<SaveIdentity> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "SaveIntegrityIdentity" (
      "key" TEXT NOT NULL PRIMARY KEY,
      "value" TEXT NOT NULL
    )
  `);

  const [existing] = await prisma.$queryRawUnsafe<Array<{ value: string }>>(
    `SELECT "value" FROM "SaveIntegrityIdentity" WHERE "key" = ? LIMIT 1`,
    SAVE_IDENTITY_KEY,
  );

  if (existing?.value) {
    return {
      uuid: existing.value,
      existed: true,
    };
  }

  const uuid = crypto.randomUUID();
  await prisma.$executeRawUnsafe(
    `INSERT INTO "SaveIntegrityIdentity" ("key", "value") VALUES (?, ?)`,
    SAVE_IDENTITY_KEY,
    uuid,
  );

  return {
    uuid,
    existed: false,
  };
}

async function getInstallSecret(allowCreate: boolean) {
  const secretPath = getInstallSecretPath();

  try {
    return await readEncryptedString(secretPath);
  } catch (error) {
    if (!allowCreate) {
      throw error;
    }
  }

  const secret = crypto.randomBytes(32).toString('base64');
  await writeEncryptedString(secretPath, secret);
  return secret;
}

async function createSaveDigest(prisma: PrismaClientType, allowCreateSecret: boolean) {
  const snapshot = await buildProtectedSaveSnapshot(prisma);
  return createSnapshotDigest(snapshot, allowCreateSecret);
}

async function createSnapshotDigest(snapshot: ProtectedSaveSnapshot, allowCreateSecret: boolean) {
  const secret = await getInstallSecret(allowCreateSecret);

  return crypto
    .createHmac('sha256', secret)
    .update(stableStringify(snapshot))
    .digest('hex');
}

async function restoreProtectedSaveSnapshot(
  prisma: PrismaClientType,
  snapshot: ProtectedSaveSnapshot,
) {
  await prisma.$transaction(
    async (tx) => {
      for (const player of snapshot.players) {
        const data = {
          age: player.age,
          avatar: player.avatar,
          contractEnd: player.contractEnd ? new Date(player.contractEnd) : null,
          cost: player.cost,
          countryId: player.countryId,
          elo: player.elo,
          lastOfferAt: player.lastOfferAt ? new Date(player.lastOfferAt) : null,
          name: player.name,
          personality: player.personality,
          prestige: player.prestige,
          role: player.role,
          starter: player.starter,
          teamId: player.teamId,
          transferListed: player.transferListed,
          userControlled: player.userControlled,
          wages: player.wages,
          xp: player.xp,
        };

        await tx.player.upsert({
          where: { id: player.id },
          create: {
            id: player.id,
            ...data,
          },
          update: data,
        }).catch(() => Promise.resolve());
      }

      for (const profile of snapshot.profiles) {
        await tx.profile.update({
          where: { id: profile.id },
          data: {
            date: new Date(profile.date),
            faceitElo: profile.faceitElo,
            name: profile.name,
            playerId: profile.playerId,
            season: profile.season,
            simulateNpcMatchStats: profile.simulateNpcMatchStats,
            teamId: profile.teamId,
          },
        }).catch(() => Promise.resolve());
      }

      for (const stint of snapshot.careerStints) {
        await tx.careerStint.upsert({
          where: { id: stint.id },
          create: {
            id: stint.id,
            endedAt: stint.endedAt ? new Date(stint.endedAt) : null,
            playerId: stint.playerId,
            startedAt: stint.startedAt ? new Date(stint.startedAt) : new Date(),
            starter: stint.starter,
            teamId: stint.teamId,
            tier: stint.tier,
          },
          update: {
            endedAt: stint.endedAt ? new Date(stint.endedAt) : null,
            playerId: stint.playerId,
            startedAt: stint.startedAt ? new Date(stint.startedAt) : new Date(),
            starter: stint.starter,
            teamId: stint.teamId,
            tier: stint.tier,
          },
        });
      }

      const protectedStintIds = new Set(snapshot.careerStints.map((stint) => stint.id));
      const currentStintIds = await tx.careerStint.findMany({
        select: { id: true },
      });
      const extraStintIds = currentStintIds
        .map((stint) => stint.id)
        .filter((id) => !protectedStintIds.has(id));

      for (const ids of chunkArray(extraStintIds, SQLITE_PARAMETER_BATCH_SIZE)) {
        await tx.careerStint.deleteMany({
          where: { id: { in: ids } },
        });
      }

      for (const entry of snapshot.teammateSeasonXp) {
        await tx.userTeammateSeasonXp.upsert({
          where: { id: entry.id },
          create: entry,
          update: {
            baselineXp: entry.baselineXp,
            playerId: entry.playerId,
            profileId: entry.profileId,
            season: entry.season,
          },
        });
      }

      const protectedTeammateXpIds = new Set(snapshot.teammateSeasonXp.map((entry) => entry.id));
      const currentTeammateXpIds = await tx.userTeammateSeasonXp.findMany({
        select: { id: true },
      });
      const extraTeammateXpIds = currentTeammateXpIds
        .map((entry) => entry.id)
        .filter((id) => !protectedTeammateXpIds.has(id));

      for (const ids of chunkArray(extraTeammateXpIds, SQLITE_PARAMETER_BATCH_SIZE)) {
        await tx.userTeammateSeasonXp.deleteMany({
          where: { id: { in: ids } },
        });
      }

      for (const match of snapshot.faceitMatches) {
        await tx.match.update({
          where: { id: match.id },
          data: {
            faceitEloDelta: match.faceitEloDelta,
            faceitIsWin: match.faceitIsWin,
            faceitOpponents: match.faceitOpponents,
            faceitRating: match.faceitRating,
            faceitTeammates: match.faceitTeammates,
            status: match.status,
          },
        }).catch(() => Promise.resolve());
      }

      const protectedFaceitMatchIds = new Set(snapshot.faceitMatches.map((match) => match.id));
      const currentFaceitMatchIds = await tx.match.findMany({
        where: { matchType: 'FACEIT_PUG' },
        select: { id: true },
      });
      const extraFaceitMatchIds = currentFaceitMatchIds
        .map((match) => match.id)
        .filter((id) => !protectedFaceitMatchIds.has(id));

      for (const ids of chunkArray(extraFaceitMatchIds, SQLITE_PARAMETER_BATCH_SIZE)) {
        await tx.match.updateMany({
          where: { id: { in: ids } },
          data: {
            faceitEloDelta: null,
            faceitIsWin: null,
            faceitOpponents: null,
            faceitRating: null,
            faceitTeammates: null,
          },
        });
      }
    },
    {
      maxWait: SAVE_INTEGRITY_RESTORE_TRANSACTION_MAX_WAIT_MS,
      timeout: SAVE_INTEGRITY_RESTORE_TRANSACTION_TIMEOUT_MS,
    },
  );
}

async function readIntegrityRecord(saveUuid: string) {
  const recordPath = getIntegrityPath(saveUuid);
  const raw = await readEncryptedString(recordPath);
  return JSON.parse(raw) as SaveIntegrityRecord;
}

export async function sealSaveIntegrity(prisma: PrismaClientType, savePath: string) {
  const identity = await ensureSaveIdentity(prisma);

  const record: SaveIntegrityRecord = {
    version: SAVE_INTEGRITY_VERSION,
    saveUuid: identity.uuid,
    digest: '',
    sealedAt: new Date().toISOString(),
  };
  record.snapshot = await buildProtectedSaveSnapshot(prisma);
  record.digest = await createSnapshotDigest(record.snapshot, true);
  const recordPath = getIntegrityPath(identity.uuid);

  await writeEncryptedString(recordPath, JSON.stringify(record));
  await rememberSaveFile(savePath, identity.uuid);
  await unlinkProtectedFile(getLegacyUuidIntegrityPath(identity.uuid));
}

export async function verifySaveIntegrity(
  prisma: PrismaClientType,
  savePath: string,
): Promise<SaveIntegrityResult> {
  const identity = await ensureSaveIdentity(prisma);
  let record: SaveIntegrityRecord;

  try {
    record = await readIntegrityRecord(identity.uuid);
  } catch (_) {
    await sealSaveIntegrity(prisma, savePath);
    return {
      valid: true,
      initialized: true,
      restored: false,
      actualDigest: '',
    };
  }

  let actualDigest: string;

  try {
    actualDigest = await createSaveDigest(prisma, false);
  } catch (_) {
    return {
      valid: false,
      initialized: false,
      restored: false,
      actualDigest: '',
      expectedDigest: record.digest,
    };
  }

  const valid = record.version === SAVE_INTEGRITY_VERSION
      && record.saveUuid === identity.uuid
      && record.digest === actualDigest;

  if (valid) {
    await rememberSaveFile(savePath, identity.uuid);
    await unlinkProtectedFile(getLegacyUuidIntegrityPath(identity.uuid));

    if (!record.snapshot) {
      await sealSaveIntegrity(prisma, savePath);
    }
  }

  if (!valid && record.snapshot) {
    await restoreProtectedSaveSnapshot(prisma, record.snapshot);
    await sealSaveIntegrity(prisma, savePath);

    return {
      valid: true,
      initialized: false,
      restored: true,
      actualDigest,
      expectedDigest: record.digest,
    };
  }

  return {
    valid,
    initialized: false,
    restored: false,
    actualDigest,
    expectedDigest: record.digest,
  };
}

export async function removeLegacySaveIntegrity(savePath: string) {
  await unlinkProtectedFile(path.join(path.dirname(savePath), `.${path.basename(savePath)}.integrity`));
}

export async function removeSaveIntegrity(savePath: string) {
  await removeLegacySaveIntegrity(savePath);

  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: `file:${savePath}?connection_limit=1`,
      },
    },
  });

  try {
    const [existing] = await prisma.$queryRawUnsafe<Array<{ value: string }>>(
      `SELECT "value" FROM "SaveIntegrityIdentity" WHERE "key" = ? LIMIT 1`,
      SAVE_IDENTITY_KEY,
    ).catch((): Array<{ value: string }> => []);

    if (existing?.value) {
      await unlinkProtectedFile(getIntegrityPath(existing.value));
      await unlinkProtectedFile(getLegacyUuidIntegrityPath(existing.value));
    }
    await forgetSaveFile(savePath);
  } finally {
    await prisma.$disconnect();
  }
}
