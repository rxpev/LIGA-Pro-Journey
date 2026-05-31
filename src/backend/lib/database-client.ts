/**
 * Exposes a cached version of the Prisma Client
 * via a getter defined in the default export.
 *
 * # Usage
 *
 * Assuming the following directory structure:
 *
 * ```
 * %APPDATA%/
 * └── Roaming/
 *     └── <app>/
 *         └── saves/
 *             └── save_1.db    // DatabaseClient.connect(1)
 * ```
 *
 * If the provided database identifier is not found, then
 * the module will create it as a copy of a modded
 * `save_0.db` or fallback to the default one
 * in the application's resources folder.
 *
 * # Example
 *
 * ```js
 * // connect and do some work
 * const db1 = await DatabaseClient.connect(1);
 *
 * // disconnect and connect to another SQLite3 database
 * await DatabaseClient.disconnect();
 * const db2 = await DatabaseClient.connect(2);
 * ```
 *
 * @module
 */
import * as sqlite3 from 'sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import util from 'node:util';
import log from 'electron-log';
import { app } from 'electron';
import { Prisma, PrismaClient } from '@prisma/client';
import { glob } from 'glob';
import { Constants, Eagers, Util, is } from '@liga/shared';
import { syncLeagueSchedule } from '@liga/backend/prisma/seeds/030-leagues';
import { backfillCompetitionLocations } from './competition-locations';

/** @interface */
interface PrismaMigration {
  id: string;
  checksum: string;
  finished_at: Date;
  migration_name: string;
  started_at: Date;
}

/** @interface */
interface InitSaveResult {
  path: string;
  created: boolean;
}

interface SaveSchemaProbe {
  hasCompetitionFederationColumn: boolean;
  hasMigrationsTable: boolean;
  hasProfileTable: boolean;
}

/** @type {PrismaClientExtended} */
type PrismaClientExtended = ReturnType<(typeof DatabaseClient)['clientExtensions']>;

/**
 * Contains the pool of cached prisma clients and records.
 *
 * @constant
 */
const pool = [] as Array<{
  client: PrismaClientExtended;
  path: string;
  records: Record<string, unknown>;
}>;

/**
 * Unique identifier for the active database.
 *
 * @constant
 */
let activeId = 0;

const mixedRegionCountries = [
  { code: 'eu', name: 'Europe', continentCode: 'EU' },
  { code: 'na', name: 'North America', continentCode: 'NA' },
  { code: 'xsa', name: 'South America', continentCode: 'SA' },
  { code: 'as', name: 'Asia', continentCode: 'AS' },
] as const;

const mixedRegionCodes = new Set(['EU', 'NA', 'XSA', 'AS']);
const exhibitionSaveFileRegex = /^save_9\d{13}\.db(?:-(?:shm|wal))?$/i;

/** @class */
export default class DatabaseClient {
  /** @constant */
  private static log = log.scope('database');

  /**
   * Configure client extensions.
   *
   * @param prisma The prisma client instance.
   * @function
   */
  private static clientExtensions(prisma: PrismaClient) {
    return prisma.$extends({
      model: {
        team: {
          /**
           * Leverages SQLite's window functions to
           * get the world Elo ranking for a team.
           *
           * @param id The team id.
           */
          async getWorldRanking(id: number) {
            const [result] = await prisma.$queryRaw<Array<{ worldRanking: number }>>`
              SELECT worldRanking
              FROM (
                SELECT
                  id,
                  RANK() OVER (ORDER BY elo DESC) as worldRanking
                FROM "Team"
              )
              WHERE id = ${id}
            `;
            return Number(result.worldRanking ?? 0);
          },
        },
      },
      query: {
        profile: {
          // @todo: fix typings for eager loaded relations
          async findFirst({ args, query }) {
            const cache = pool[activeId]?.records;

            if (cache?.profile) {
              DatabaseClient.log.silly('cache hit for profile.');
              return cache.profile;
            }

            DatabaseClient.log.silly('cache miss for profile.');
            const profile = await query({
              ...args,
              ...Eagers.profile,
            });

            if (cache) {
              cache.profile = profile;
            }

            return profile;
          },
          async update({ args, query }) {
            DatabaseClient.log.silly('hydrating profile cache...');
            const profile = await query({
              ...args,
              ...Eagers.profile,
            });

            if (pool[activeId]?.records) {
              pool[activeId].records.profile = profile;
            }

            return profile;
          },
        },
      },
    });
  }

  private static async repairCountryMetadata(prisma: PrismaClientExtended) {
    const continents = await prisma.continent.findMany({
      select: { id: true, code: true },
    });
    const continentIdByCode = new Map(continents.map((continent) => [continent.code.toUpperCase(), continent.id]));

    // Legacy fix: older builds used "SA"/"XSA" for the mixed South America row.
    // Canonicalize to lowercase "xsa" without violating unique(code|name) constraints.
    const canonicalSouthAmerica = await prisma.country.findUnique({
      where: { code: 'xsa' },
      select: { id: true },
    });
    const legacySouthAmerica = await prisma.country.findUnique({
      where: { name: 'South America' },
      select: { id: true, code: true },
    });

    if (legacySouthAmerica && legacySouthAmerica.code !== 'xsa') {
      if (canonicalSouthAmerica && canonicalSouthAmerica.id !== legacySouthAmerica.id) {
        await prisma.player.updateMany({
          where: { countryId: legacySouthAmerica.id },
          data: { countryId: canonicalSouthAmerica.id },
        });
        await prisma.team.updateMany({
          where: { countryId: legacySouthAmerica.id },
          data: { countryId: canonicalSouthAmerica.id },
        });
        await prisma.country.delete({ where: { id: legacySouthAmerica.id } }).catch(() => Promise.resolve());
      } else {
        await prisma.country.update({
          where: { id: legacySouthAmerica.id },
          data: { code: 'xsa' },
        }).catch(() => Promise.resolve());
      }
    }

    await prisma.country.update({
      where: { code: 'XSA' },
      data: { code: 'xsa' },
    }).catch(() => Promise.resolve());

    for (const country of mixedRegionCountries) {
      const continentId = continentIdByCode.get(country.continentCode);
      if (!continentId) continue;

      await prisma.country.upsert({
        where: { code: country.code },
        update: {
          name: country.name,
          continentId,
        },
        create: {
          code: country.code,
          name: country.name,
          continentId,
        },
      });
    }

    const europeContinentId = continentIdByCode.get('EU');
    if (europeContinentId) {
      await prisma.country.update({
        where: { code: 'TR' },
        data: { continentId: europeContinentId },
      }).catch(() => Promise.resolve());
    }
  }

  private static async getRootSaveCompetitionFederationIds(saveId: number) {
    if (saveId === 0) {
      return new Map<string, number>();
    }

    const rootSavePath = path.join(DatabaseClient.basePath, Util.getSaveFileName(0));
    if (!fs.existsSync(rootSavePath)) {
      return new Map<string, number>();
    }

    const schema = await DatabaseClient.probeSaveSchema(rootSavePath);
    if (!schema.hasCompetitionFederationColumn) {
      return new Map<string, number>();
    }

    const rootPrisma = new PrismaClient({
      datasources: {
        db: {
          url: `file:${rootSavePath}?connection_limit=1`,
        },
      },
    });

    try {
      const teams = await rootPrisma.team.findMany({
        where: {
          competitionFederationId: {
            not: null,
          },
        },
        select: {
          slug: true,
          competitionFederationId: true,
        },
      });

      return new Map(
        teams
          .filter((team) => team.competitionFederationId != null)
          .map((team) => [team.slug, team.competitionFederationId as number]),
      );
    } finally {
      await rootPrisma.$disconnect();
    }
  }

  private static async syncTeamCompetitionFederations(
    prisma: PrismaClientExtended,
    saveId: number,
  ) {
    const rootSaveCompetitionFederationIds = await DatabaseClient.getRootSaveCompetitionFederationIds(
      saveId,
    );
    const teams = await prisma.team.findMany({
      select: {
        id: true,
        slug: true,
        competitionFederationId: true,
        country: {
          select: {
            continent: {
              select: {
                federationId: true,
              },
            },
          },
        },
      },
    });

    for (const team of teams) {
      // Do not overwrite explicit per-save assignments.
      // This sync only backfills missing values.
      if (team.competitionFederationId != null) {
        continue;
      }

      const rootSaveCompetitionFederationId = rootSaveCompetitionFederationIds.get(team.slug);
      const nextCompetitionFederationId = rootSaveCompetitionFederationId
        ?? team.country?.continent?.federationId
        ?? null;

      if (
        !nextCompetitionFederationId
      ) {
        continue;
      }

      await prisma.team.update({
        where: { id: team.id },
        data: { competitionFederationId: nextCompetitionFederationId },
      });
    }
  }

  private static async recalculateAllTeamCountryIdentities(prisma: PrismaClientExtended) {
    const teams = await prisma.team.findMany({
      select: {
        id: true,
        countryId: true,
        players: {
          where: { starter: true },
          select: {
            countryId: true,
            country: {
              select: {
                continent: {
                  select: {
                    code: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    const regionCountryIds = new Map<string, number>();
    for (const regionCode of mixedRegionCountries.map((country) => country.code)) {
      const regionCountry = await prisma.country.findUnique({
        where: { code: regionCode },
        select: { id: true },
      });
      if (regionCountry) {
        regionCountryIds.set(regionCode.toUpperCase(), regionCountry.id);
      }
    }

    for (const team of teams) {
      if (team.players.length < 3) {
        continue;
      }

      const countryCounts = new Map<number, number>();
      const continentCounts = new Map<string, number>();

      for (const player of team.players) {
        countryCounts.set(player.countryId, (countryCounts.get(player.countryId) ?? 0) + 1);
        const continentCode = player.country?.continent?.code?.toUpperCase();
        if (continentCode) {
          continentCounts.set(continentCode, (continentCounts.get(continentCode) ?? 0) + 1);
        }
      }

      const dominantCountry = [...countryCounts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
      let nextCountryId = dominantCountry?.[1] >= 3 ? dominantCountry[0] : null;

      if (!nextCountryId) {
        const dominantContinent = [...continentCounts.entries()]
          .filter(([code]) => mixedRegionCodes.has(code))
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];

        if (dominantContinent?.[1] >= 3) {
          nextCountryId = regionCountryIds.get(dominantContinent[0]) ?? null;
        }
      }

      if (!nextCountryId || nextCountryId === team.countryId) {
        continue;
      }

      await prisma.team.update({
        where: { id: team.id },
        data: { countryId: nextCountryId },
      });
    }
  }

  /**
   * Sets up the application database files
   * and initializes the Prisma client.
   *
   * @param id The database to connect with.
   * @method
   */
  public static async connect(id = activeId) {
    // return cached client if already connected to provided
    // db and the underlying save still exists
    if (pool[id] && activeId === id) {
      try {
        await fs.promises.access(pool[id].path, fs.constants.F_OK);
        return pool[id].client;
      } catch (_) {
        await DatabaseClient.forget(id);
      }
    } else if (pool[activeId]) {
      await DatabaseClient.disconnect();
    }

    // initialize the save file
    let saveMeta: InitSaveResult;

    try {
      saveMeta = await this.initSave(id);
    } catch (error) {
      this.log.error(error);
      return Promise.reject();
    }

    // run database migrations
    await DatabaseClient.migrate(id);

    // initialize the new client
    const prisma = new PrismaClient({
      datasources: {
        db: {
          url: `file:${saveMeta.path}?connection_limit=1`,
        },
      },
    });
    pool[id] = {
      client: DatabaseClient.clientExtensions(prisma),
      path: saveMeta.path,
      records: {},
    };

    // update the active db id
    activeId = id;

    await DatabaseClient.repairCountryMetadata(pool[id].client);
    await syncLeagueSchedule(pool[id].client as unknown as PrismaClient);
    await backfillCompetitionLocations(pool[id].client as unknown as PrismaClient);
    await DatabaseClient.syncTeamCompetitionFederations(pool[id].client, id);
    await DatabaseClient.recalculateAllTeamCountryIdentities(pool[id].client);
    await DatabaseClient.normalizeCareerStintStarterValues(pool[id].client);

    if (saveMeta.created && id !== 0) {
      await DatabaseClient.ensureInitialCareerStints(pool[id].client);
    }
    await DatabaseClient.reconcileActiveCareerStints(pool[id].client);

    return pool[id].client;
  }

  /**
   * Ensures players have at least one career stint in newly created saves.
   *
   * @param prisma The prisma client instance.
   * @method
   */
  private static async ensureInitialCareerStints(prisma: PrismaClientExtended) {
    const [players, existingStints] = await Promise.all([
      prisma.player.findMany({
        select: {
          id: true,
          teamId: true,
          starter: true,
          team: {
            select: {
              tier: true,
            },
          },
        },
      }),
      prisma.careerStint.findMany({
        distinct: ['playerId'],
        select: {
          playerId: true,
        },
      }),
    ]);

    if (players.length === 0) {
      return;
    }

    const existing = new Set(existingStints.map((stint) => stint.playerId));
    const startedAt = new Date(Constants.NewSaveSeasonStartDate);

    const missingStints: Array<{
      playerId: number;
      teamId: number | null;
      tier: number | null;
      starter: boolean;
      startedAt: Date;
      endedAt: Date | null;
    }> = players
      .filter((player) => !existing.has(player.id))
      .map((player) => ({
        playerId: player.id,
        teamId: player.teamId,
        tier: player.team?.tier ?? null,
        starter: player.starter,
        startedAt,
        endedAt: null as Date | null,
      }));

    if (missingStints.length === 0) {
      return;
    }

    await prisma.$transaction(
      missingStints.map((stint) =>
        prisma.careerStint.create({
          data: stint,
        }),
      ),
    );

    DatabaseClient.log.info('Initialized %d player career stints for save bootstrap.', missingStints.length);
  }

  private static async normalizeCareerStintStarterValues(prisma: PrismaClientExtended) {
    await prisma.$executeRaw`
      UPDATE "CareerStint"
      SET "starter" = 1
      WHERE "starter" IS NULL
    `;
  }

  private static async reconcileActiveCareerStints(prisma: PrismaClientExtended) {
    const profile = await prisma.profile.findFirst();
    const splitDate = profile?.date ?? new Date();

    const [players, activeStints, recentStints, futureFreeAgentStints] = await Promise.all([
      prisma.player.findMany({
        select: {
          id: true,
          teamId: true,
          starter: true,
          team: {
            select: {
              tier: true,
            },
          },
        },
      }),
      prisma.careerStint.findMany({
        where: { endedAt: null },
        select: {
          id: true,
          playerId: true,
          teamId: true,
          tier: true,
          starter: true,
          startedAt: true,
        },
      }),
      prisma.careerStint.findMany({
        where: {
          OR: [
            { endedAt: null },
            { endedAt: splitDate },
          ],
        },
        select: {
          id: true,
          playerId: true,
          teamId: true,
          tier: true,
          starter: true,
          startedAt: true,
          endedAt: true,
        },
        orderBy: { startedAt: 'asc' },
      }),
      prisma.careerStint.findMany({
        where: {
          teamId: null,
          startedAt: {
            gt: splitDate,
          },
        },
        select: {
          id: true,
          startedAt: true,
          endedAt: true,
        },
      }),
    ]);

    type ActiveStintSnapshot = {
      id: number;
      playerId: number;
      teamId: number | null;
      tier: number | null;
      starter: boolean;
      startedAt: Date;
    };
    const activeByPlayer = new Map<number, ActiveStintSnapshot>(
      activeStints.map((stint) => [stint.playerId, stint as ActiveStintSnapshot]),
    );
    const stintsByPlayer = new Map<number, typeof recentStints>();
    for (const stint of recentStints) {
      const list = stintsByPlayer.get(stint.playerId) ?? [];
      list.push(stint);
      stintsByPlayer.set(stint.playerId, list);
    }
    const tx: Prisma.PrismaPromise<unknown>[] = [];
    const intendedInitialStart = new Date(Constants.NewSaveSeasonStartDate);

    futureFreeAgentStints.forEach((stint) => {
      tx.push(prisma.careerStint.update({
        where: { id: stint.id },
        data: {
          startedAt: intendedInitialStart,
          ...(stint.endedAt != null && stint.endedAt < intendedInitialStart
            ? { endedAt: intendedInitialStart }
            : {}),
        },
      }));
    });

    // Legacy cleanup: collapse artificial split created at load time by older reconciliation.
    // Pattern:
    //   previous stint ended exactly at profile.date
    //   active stint started exactly at profile.date
    //   same team
    // Keep one continuous stint and apply active snapshot (starter/tier) to it.
    for (const [playerId, stints] of stintsByPlayer.entries()) {
      const active = stints.find((stint) => stint.endedAt == null);
      if (!active) continue;

      const hasPreviousStint = stints.some((stint) => stint.id !== active.id);
      const previous = stints
        .filter((stint) => stint.id !== active.id && stint.endedAt != null)
        .sort((a, b) => new Date(b.endedAt as Date).getTime() - new Date(a.endedAt as Date).getTime())[0];

      if (!previous?.endedAt) continue;
      if (previous.teamId !== active.teamId) continue;
      if (new Date(previous.endedAt).getTime() !== splitDate.getTime()) continue;
      if (new Date(active.startedAt).getTime() !== splitDate.getTime()) continue;

      tx.push(prisma.careerStint.update({
        where: { id: previous.id },
        data: {
          endedAt: null,
          starter: active.starter,
          tier: active.tier,
          teamId: active.teamId,
        },
      }));
      tx.push(prisma.careerStint.delete({
        where: { id: active.id },
      }));
      activeByPlayer.set(playerId, {
        ...active,
        id: previous.id,
        startedAt: previous.startedAt,
      } as ActiveStintSnapshot);
    }

    for (const player of players) {
      const active = activeByPlayer.get(player.id);
      const targetTier = player.team?.tier ?? null;

      if (!player.teamId) {
        if (active && active.teamId != null) {
          tx.push(prisma.careerStint.updateMany({
            where: { playerId: player.id, endedAt: null },
            data: { endedAt: splitDate },
          }));
        }
        continue;
      }

      if (!active) {
        tx.push(prisma.careerStint.create({
          data: {
            playerId: player.id,
            teamId: player.teamId,
            tier: targetTier,
            starter: player.starter,
            startedAt: splitDate,
          },
        }));
        continue;
      }

      const sameSnapshot = active.teamId === player.teamId
        && active.tier === targetTier
        && active.starter === player.starter;

      if (sameSnapshot) continue;

      if (active.startedAt >= splitDate && active.teamId === player.teamId) {
        tx.push(prisma.careerStint.update({
          where: { id: active.id },
          data: {
            teamId: player.teamId,
            tier: targetTier,
            starter: player.starter,
            startedAt: splitDate,
          },
        }));
        continue;
      }

      tx.push(prisma.careerStint.update({
        where: { id: active.id },
        data: { endedAt: splitDate },
      }));
      tx.push(prisma.careerStint.create({
        data: {
          playerId: player.id,
          teamId: player.teamId,
          tier: targetTier,
          starter: player.starter,
          startedAt: splitDate,
        },
      }));
    }

    if (tx.length > 0) {
      await prisma.$transaction(tx);
      DatabaseClient.log.info('Reconciled %d active career stint snapshot operation(s).', tx.length);
    }
  }

  /**
   * Disconnects from the database and cleans
   * up the client from the cache.
   *
   * @method
   */
  public static async disconnect() {
    if (!pool[activeId]) {
      return;
    }

    await pool[activeId].client.$disconnect();
    delete pool[activeId];
  }

  /**
   * Removes a cached client for a save id and disconnects it if needed.
   *
   * @param id The database id.
   * @method
   */
  public static async forget(id: number) {
    if (!pool[id]) {
      return;
    }

    await pool[id].client.$disconnect();
    delete pool[id];

    if (activeId === id) {
      activeId = 0;
    }
  }

  /**
   * Checks if there is a modded database and validates that it
   * is compatible with the current version of the application.
   *
   * If so, it creates a copy of it to be used as the new save.
   *
   * @param newSavePath Where to copy the modded database to.
   * @method
   */
  public static async initModdedDatabase(newSavePath: string) {
    // bail early if we're in cli mode
    if (process.env['NODE_ENV'] === 'cli') {
      return Promise.reject('Modding not supported while in CLI mode.');
    }

    // create the file tree if it doesn't already exist
    const customSavePath = path.join(
      app.getPath('userData'),
      Constants.Application.CUSTOM_DIR,
      Constants.Application.DATABASES_DIR,
      Util.getSaveFileName(0),
    );

    try {
      await fs.promises.access(path.dirname(customSavePath), fs.constants.F_OK);
    } catch (_) {
      await fs.promises.mkdir(path.dirname(customSavePath), { recursive: true });
    }

    // do we have a modded database?
    try {
      await fs.promises.access(customSavePath, fs.constants.F_OK);
    } catch (_) {
      return Promise.reject('No modded database found.');
    }

    // make sure the save is compatible
    const cnx = new sqlite3.Database(customSavePath);
    const [applicationId] = await new Promise<Array<{ application_id: number }>>((resolve) =>
      cnx.all('PRAGMA application_id;', (_, rows: Array<{ application_id: number }>) =>
        resolve(rows),
      ),
    );
    await new Promise((resolve) => cnx.close(resolve));

    if (applicationId.application_id < 0) {
      return Promise.reject(util.format('Database "%s" is not compatible!', customSavePath));
    }

    // make a copy of the modded save
    try {
      await fs.promises.copyFile(customSavePath, newSavePath);
      return Promise.resolve();
    } catch (_) {
      return Promise.reject(util.format('Could not copy modded database to: %s', newSavePath));
    }
  }

  /**
   * If the provided database path does not exist then
   * a new one will be created from the root save.
   *
   * The root save can be a modded save if compatible
   * with the current version of the application.
   *
   * @param id The database id.
   * @method
   */
  public static async initSave(id = activeId): Promise<InitSaveResult> {
    const rootSaveName = Util.getSaveFileName(0);
    const rootSavePath = path.join(DatabaseClient.localBasePath, rootSaveName);
    const newSaveName = Util.getSaveFileName(id);
    const newSavePath = path.join(DatabaseClient.basePath, newSaveName);

    // bail early if the file exists, otherwise
    // we build the file tree to the save file
    try {
      await fs.promises.access(newSavePath, fs.constants.F_OK);

      // Defensive guard: if a stale/corrupted save file exists (e.g. empty sqlite file),
      // rebuild it from the root save to avoid runtime prisma errors on connect.
      const schema = await DatabaseClient.probeSaveSchema(newSavePath);

      if (schema.hasMigrationsTable && schema.hasProfileTable) {
        return Promise.resolve({ path: newSavePath, created: false });
      }

      DatabaseClient.log.warn(
        'Save %s is missing expected schema (migrations=%s, profile=%s). Rebuilding file...',
        newSavePath,
        schema.hasMigrationsTable,
        schema.hasProfileTable,
      );

      await fs.promises.unlink(newSavePath);
    } catch (_) {
      await fs.promises.mkdir(path.dirname(newSavePath), { recursive: true });
    }

    // bail early if we're using a modded save
    try {
      await DatabaseClient.initModdedDatabase(newSavePath);
      return Promise.resolve({ path: newSavePath, created: true });
    } catch (error) {
      this.log.info(error);
    }

    // make a copy of the root save
    try {
      await fs.promises.copyFile(rootSavePath, newSavePath);
      return Promise.resolve({ path: newSavePath, created: true });
    } catch (error) {
      return Promise.reject(error);
    }
  }

  /**
   * Migrate the specified database.
   *
   * @param id The database to connect with.
   * @function
   */
  public static async migrate(id = activeId) {
    // set up db paths
    const targetDBName = Util.getSaveFileName(id);
    const targetDBPath = path.join(DatabaseClient.basePath, targetDBName);

    // bail if target db doesn't exist
    try {
      await fs.promises.access(targetDBPath, fs.constants.F_OK);
    } catch (_) {
      DatabaseClient.log.warn('Database %s does not exist. Skipping migration.', targetDBPath);
      return Promise.resolve(false);
    }

    // connect to the database directly through sqlite3 in order
    // to get the list of migrations that have been executed
    const cnx = new sqlite3.Database(targetDBPath, () =>
      DatabaseClient.log.debug('Migrating database %s...', targetDBPath),
    );
    const migrationsExisting = await new Promise<Array<PrismaMigration>>((resolve) =>
      cnx.all('SELECT * FROM _prisma_migrations', (error, rows: Array<PrismaMigration>) => {
        if (error) {
          DatabaseClient.log.warn(
            'Failed to read _prisma_migrations for %s. Treating as no applied migrations.',
            targetDBPath,
          );
          return resolve([]);
        }

        resolve(rows ?? []);
      }),
    );

    // load up migration files
    const migrationsBasePath = path.join(path.dirname(DatabaseClient.localBasePath), 'migrations');
    const migrationsAll: Array<{ name: string; isDirectory: () => boolean; relative: () => string }> =
      await glob('*_*', {
        cwd: path.normalize(migrationsBasePath),
        withFileTypes: true,
        stat: true,
      }).catch((err): Array<{ name: string; isDirectory: () => boolean; relative: () => string }> => {
        DatabaseClient.log.error('Failed to read migrations directory:', err);
        return [];
      });

    // defensive guard: ensure we have an array
    if (!migrationsAll || migrationsAll.length === 0) {
      DatabaseClient.log.warn(
        'No migration files found in %s. Skipping migration.',
        migrationsBasePath,
      );
      cnx.close();
      return Promise.resolve(false);
    }

    // filter out anything that isn’t a folder named like "20241109123456_some_migration"
    const validMigrations = migrationsAll.filter((entry) => {
      const match = entry.name.match(/^\d+_.+/);
      return match && entry.isDirectory();
    });

    if (validMigrations.length === 0) {
      DatabaseClient.log.warn(
        'No valid migration folders found in %s. Skipping migration.',
        migrationsBasePath,
      );
      cnx.close();
      return Promise.resolve(false);
    }

    // sort only valid folders
    const migrationsNew = validMigrations.sort((a, b) => {
      const re = /^(\d+)_/;
      const matchA = a.name.match(re);
      const matchB = b.name.match(re);
      const timestampA = matchA ? Number(matchA[1]) : 0;
      const timestampB = matchB ? Number(matchB[1]) : 0;
      return timestampA - timestampB;
    });

    // run through the migrations
    for (const migration of migrationsNew) {
      if (migrationsExisting.some((existing) => existing.migration_name === migration.name)) {
        DatabaseClient.log.debug('Migration %s already applied. Skipping.', migration.name);
        continue;
      }

      // split the migration file contents by `;` and
      // sanitize comments and empty new lines
      const file = await fs.promises.readFile(
        path.join(migrationsBasePath, migration.relative(), 'migration.sql'),
        'utf8',
      );
      const queries = file
        .replace(/^--.+$/gm, '')
        .split(';')
        .filter((query) => query.trim());

      // run this migration
      DatabaseClient.log.debug('Applying migration `%s`...', migration.name);

      await new Promise((resolve) => {
        cnx.serialize(() => {
          cnx.run('BEGIN TRANSACTION');
          queries.forEach((query) => cnx.run(query));
          cnx.run(
            `
            INSERT INTO _prisma_migrations (id,checksum,finished_at,migration_name,started_at)
            VALUES (?,?,?,?,?)
            `,
            [
              crypto.randomUUID(),
              crypto.createHash('sha256').update(file, 'utf8').digest('hex'),
              Date.now(),
              migration.name,
              Date.now(),
            ],
          );
          cnx.run('COMMIT');
          resolve(true);
        });
      });
    }

    // close the connection
    return new Promise((resolve) => cnx.close(resolve));
  }

  /**
   * A getter for the Prisma client that returns
   * a cached version, if applicable.
   *
   * @method
   */
  public static get prisma() {
    return pool[activeId].client;
  }

  /**
   * Force sets the Prisma client.
   *
   * @method
   */
  public static set prisma(client: PrismaClientExtended) {
    pool[activeId].client = client;
  }

  /**
   * Gets the absolute base path to the databases
   * directory found within %APPDATA%.
   *
   * @method
   */
  public static get basePath() {
    return process.env['NODE_ENV'] === 'cli'
      ? path.join(process.env.APPDATA, 'LIGA Pro Journey', Constants.Application.DATABASES_DIR)
      : path.join(app.getPath('userData'), Constants.Application.DATABASES_DIR);
  }

  /**
   * Gets the absolute base path to the local databases directory
   * found within the application resources folder.
   *
   * @function
   */
  public static get localBasePath() {
    if (process.env['NODE_ENV'] === 'cli') {
      return path.join(
        __dirname,
        '../../../src/backend/prisma',
        Constants.Application.DATABASES_DIR,
      );
    }

    return is.dev()
      ? path.join(__dirname, '../../src/backend/prisma', Constants.Application.DATABASES_DIR)
      : path.join(process.resourcesPath, Constants.Application.DATABASES_DIR);
  }

  /**
   * Gets the path to the currently
   * connected database file.
   *
   * @function
   */
  public static get path() {
    return pool[activeId].path;
  }

  /**
   * Renames the old `databases` folder to `saves` in
   * order to resolve a naming collision with Chromium.
   *
   * @todo remove after beta
   * @function
   */
  public static async patchForChromium() {
    const oldPath = DatabaseClient.basePath.replace(
      Constants.Application.DATABASES_DIR,
      'databases',
    );
    const newPath = DatabaseClient.basePath;

    // first check if the old path exists
    // and if it doesn't we bail early
    try {
      await fs.promises.access(oldPath, fs.constants.F_OK);
    } catch (_) {
      return;
    }

    this.log.info('Moving "%s" to "%s"', oldPath, newPath);
    return fs.promises.rename(oldPath, newPath);
  }

  /**
   * Removes stale exhibition save files that may remain
   * after an ungraceful app shutdown.
   *
   * @method
   */
  public static async cleanupOrphanedExhibitionSaves() {
    const files = await glob('save_9*.db*', {
      cwd: DatabaseClient.basePath,
      nodir: true,
    }).catch((error): string[] => {
      DatabaseClient.log.warn('Failed to scan for orphaned exhibition saves: %s', error);
      return [];
    });

    if (!files.length) {
      return;
    }

    const deletions = files
      .filter((file) => exhibitionSaveFileRegex.test(path.basename(file)))
      .map(async (file) => {
        const filePath = path.join(DatabaseClient.basePath, file);
        await fs.promises.unlink(filePath).catch(() => Promise.resolve());
      });

    await Promise.all(deletions);

    if (deletions.length) {
      DatabaseClient.log.info('Cleaned up %d orphaned exhibition save file(s).', deletions.length);
    }
  }

  /**
   * Checks whether a save file contains core tables expected by the game.
   *
   * @param savePath The absolute path to the sqlite save file.
   * @method
   */
  private static async probeSaveSchema(savePath: string): Promise<SaveSchemaProbe> {
    const cnx = await new Promise<sqlite3.Database>((resolve) => {
      const db = new sqlite3.Database(savePath, () => resolve(db));
    });

    try {
      const tables = await new Promise<string[]>((resolve) =>
        cnx.all(
          `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('_prisma_migrations', 'Profile', 'Team')`,
          (error, rows: Array<{ name: string }>) => {
            if (error) {
              DatabaseClient.log.warn('Failed probing save schema for %s: %s', savePath, error);
              return resolve([]);
            }

            resolve((rows ?? []).map((row) => row.name));
          },
        ),
      );
      const hasCompetitionFederationColumn = tables.includes('Team')
        ? await new Promise<boolean>((resolve) =>
          cnx.all(
            `PRAGMA table_info("Team")`,
            (error, rows: Array<{ name: string }>) => {
              if (error) {
                DatabaseClient.log.warn(
                  'Failed probing Team columns for %s: %s',
                  savePath,
                  error,
                );
                return resolve(false);
              }

              resolve((rows ?? []).some((row) => row.name === 'competitionFederationId'));
            },
          ),
        )
        : false;

      return {
        hasCompetitionFederationColumn,
        hasMigrationsTable: tables.includes('_prisma_migrations'),
        hasProfileTable: tables.includes('Profile'),
      };
    } finally {
      await new Promise<void>((resolve) => cnx.close(() => resolve()));
    }
  }
}
