/**
 * Profile IPC handlers — PLAYER CAREER ONLY
 *
 * All manager-mode logic removed.
 */

import fs from 'node:fs';
import path from 'node:path';
import log from 'electron-log';
import { ipcMain } from 'electron';
import { glob } from 'glob';
import { Prisma, PrismaClient } from '@prisma/client';
import { Constants, Util } from '@liga/shared';
import { DatabaseClient, DiscordPresence, Game, WindowManager, Worldgen } from '@liga/backend/lib';

export default function registerProfileHandlers() {
  ipcMain.handle(
    'profiles:createPlayerCareer',
    async (
      _,
      data: {
        playerName: string;
        countryId: number;
        role: string;
        simulateNpcMatchStats?: boolean;
      },
    ) => {
      const { playerName, countryId, role, simulateNpcMatchStats } = data;

      // Always use the single root profile
      const existing = await DatabaseClient.prisma.profile.findFirst();

      // 1. CREATE / UPDATE PROFILE
      const profile = await DatabaseClient.prisma.profile.update({
        where: { id: existing.id },
        data: {
          name: playerName,
          date: Constants.NewSaveSeasonStartDate,
          season: 0,
          faceitElo: 1200,
          simulateNpcMatchStats: Boolean(simulateNpcMatchStats),

          player: {
            create: {
              name: playerName,
              countryId,
              role,
              xp: 0,
              prestige: 0,
              userControlled: true,
            },
          },
        },
        include: { player: true },
      });

      // Create the season-start calendar entry
      await DatabaseClient.prisma.calendar.create({
        data: {
          type: Constants.CalendarEntry.SEASON_START,
          date: profile.date,
        },
      });

      return profile;
    },
  );

  ipcMain.handle(Constants.IPCRoute.PROFILES_CURRENT, async () => {
    return DatabaseClient.prisma.profile.findFirst({
      include: { player: true },
    });
  });

  ipcMain.handle(Constants.IPCRoute.PROFILES_UPDATE, async (_, query: Prisma.ProfileUpdateArgs) => {
    const profile = await DatabaseClient.prisma.profile.findFirst({
      include: { player: true },
    });

    const settings = Util.loadSettings(profile.settings);
    const newSettings = JSON.parse(query.data.settings as string) as typeof Constants.Settings;

    // Reload logging level
    if (newSettings.general.logLevel !== settings.general.logLevel) {
      log.transports.console.level = newSettings.general.logLevel as log.LogLevel;
      log.transports.file.level = newSettings.general.logLevel as log.LogLevel;
    }

    if (newSettings.general.discordPresence !== settings.general.discordPresence) {
      await DiscordPresence.setEnabled(newSettings.general.discordPresence);
    }

    // Rediscover game path if game mode changed
    if (newSettings.general.game !== settings.general.game && settings.general.steamPath) {
      try {
        newSettings.general.gamePath = await Game.discoverGamePath(
          newSettings.general.game,
          settings.general.steamPath,
        );
      } catch {
        newSettings.general.gamePath = null;
      }
    }

    const updated = await DatabaseClient.prisma.profile.update({
      ...query,
      data: {
        ...query.data,
        settings: JSON.stringify(newSettings),
      },
    });

    WindowManager.sendAll(Constants.IPCRoute.PROFILES_CURRENT, updated);
    return updated;
  });

  ipcMain.handle(Constants.IPCRoute.PROFILES_NPC_MATCH_STATS_BACKFILL, async (event) => {
    const result = await Worldgen.legacyBackfillNpcMatchStats((progress) => {
      event.sender.send(Constants.IPCRoute.PROFILES_NPC_MATCH_STATS_BACKFILL_PROGRESS, progress);
    });
    const updated = await DatabaseClient.prisma.profile.findFirst({
      include: { player: true },
    });

    WindowManager.sendAll(Constants.IPCRoute.PROFILES_CURRENT, updated);
    return { ...result, profile: updated };
  });

  ipcMain.handle(Constants.IPCRoute.SAVES_ALL, async () => {
    const saves = [];
    const files = await glob('save_*.db', {
      cwd: path.normalize(DatabaseClient.basePath),
    });

    for (const file of files) {
      const [databaseIdStr] = Array.from(file.matchAll(/save_(\d+)\.db/g), (groups) => groups[1]);
      if (!databaseIdStr) continue;

      const databaseId = Number(databaseIdStr);
      if (!Number.isFinite(databaseId) || databaseId === 0) continue;

      const dbPath = path.join(DatabaseClient.basePath, file);
      const readProfile = async () => {
        const prisma = new PrismaClient({
          datasources: {
            db: {
              url: `file:${dbPath}?connection_limit=1`,
            },
          },
        });

        return prisma.profile
          .findFirst({
            select: {
              id: true,
              name: true,
              updatedAt: true,
              player: {
                select: {
                  role: true,
                  team: {
                    select: {
                      name: true,
                      blazon: true,
                    },
                  },
                },
              },
              team: {
                select: {
                  name: true,
                  blazon: true,
                },
              },
            },
          })
          .finally(() => prisma.$disconnect());
      };

      const profile = await readProfile().catch(async (error) => {
        log.warn('Could not read save profile for %s. Attempting migration before retry.', dbPath);
        log.warn(error);

        await DatabaseClient.migrate(databaseId);
        return readProfile();
      });

      if (profile) {
        profile.id = databaseId;
        saves.push(profile);
      }
    }

    return saves.filter((save) => !!save && save.id !== 0);
  });

  ipcMain.handle(Constants.IPCRoute.SAVES_DELETE, async (_, id: number) => {
    const dbFileName = Util.getSaveFileName(id);
    const dbPath = path.join(DatabaseClient.basePath, dbFileName);

    if (!fs.existsSync(dbPath)) return Promise.reject();

    await DatabaseClient.forget(id);
    return fs.promises.unlink(dbPath);
  });

  /**
   * SQUAD (Player Career) — used by Squad Hub
   *
   * Returns the current team's players, or [] if teamless.
   */
  ipcMain.handle(Constants.IPCRoute.SQUAD_ALL, async () => {
    const profile = await DatabaseClient.prisma.profile.findFirst({
      include: {
        team: {
          include: {
            players: {
              include: {
                country: true, // needed for flags / names in PlayerCard
              },
            },
          },
        },
      },
    });

    if (!profile || !profile.team) {
      // teamless: Squad Hub will fall back to the "You are teamless" view
      return [];
    }

    return profile.team.players;
  });
}
