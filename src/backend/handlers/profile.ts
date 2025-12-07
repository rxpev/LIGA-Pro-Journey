/**
 * Profile IPC handlers — PLAYER CAREER ONLY
 *
 * All manager-mode logic removed.
 */

import fs from "node:fs";
import path from "node:path";
import log from "electron-log";
import { ipcMain } from "electron";
import { glob } from "glob";
import { Prisma } from "@prisma/client";
import { Constants, Util } from "@liga/shared";
import { DatabaseClient, Game, WindowManager } from "@liga/backend/lib";

export default function registerProfileHandlers() {
  ipcMain.handle(
    "profiles:createPlayerCareer",
    async (_, data: { playerName: string; countryId: number; role: string }) => {
      const { playerName, countryId, role } = data;

      // Always use the single root profile
      const existing = await DatabaseClient.prisma.profile.findFirst();

      // 1. CREATE / UPDATE PROFILE
      const profile = await DatabaseClient.prisma.profile.update({
        where: { id: existing.id },
        data: {
          name: playerName,
          date: new Date().toISOString(),
          season: 0,
          faceitElo: 1200,

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
    }
  );

  ipcMain.handle(Constants.IPCRoute.PROFILES_CURRENT, async () => {
    return DatabaseClient.prisma.profile.findFirst({
      include: { player: true },
    });
  });

  ipcMain.handle(
    Constants.IPCRoute.PROFILES_UPDATE,
    async (_, query: Prisma.ProfileUpdateArgs) => {
      const profile = await DatabaseClient.prisma.profile.findFirst({
        include: { player: true },
      });

      const settings = Util.loadSettings(profile.settings);
      const newSettings = JSON.parse(
        query.data.settings as string
      ) as typeof Constants.Settings;

      // Reload logging level
      if (newSettings.general.logLevel !== settings.general.logLevel) {
        log.transports.console.level = newSettings.general.logLevel as log.LogLevel;
        log.transports.file.level = newSettings.general.logLevel as log.LogLevel;
      }

      // Rediscover game path if game mode changed
      if (
        newSettings.general.game !== settings.general.game &&
        settings.general.steamPath
      ) {
        try {
          newSettings.general.gamePath = await Game.discoverGamePath(
            newSettings.general.game,
            settings.general.steamPath
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
    }
  );

  ipcMain.handle(Constants.IPCRoute.SAVES_ALL, async () => {
    const saves = [];
    const files = await glob("save_*.db", {
      cwd: path.normalize(DatabaseClient.basePath),
    });

    for (const file of files) {
      const [databaseId] = Array.from(
        file.matchAll(/save_(\d+)\.db/g),
        (groups) => groups[1]
      );
      if (!databaseId) continue;

      await DatabaseClient.disconnect();
      await DatabaseClient.connect(parseInt(databaseId));

      const profile = await DatabaseClient.prisma.profile.findFirst({
        include: { player: true },
      });

      if (profile) {
        profile.id = parseInt(databaseId);
        saves.push(profile);
      }
    }

    await DatabaseClient.disconnect();
    await DatabaseClient.connect();

    return saves.filter(Boolean);
  });

  ipcMain.handle(Constants.IPCRoute.SAVES_DELETE, (_, id: number) => {
    const dbFileName = Util.getSaveFileName(id);
    const dbPath = path.join(DatabaseClient.basePath, dbFileName);

    if (!fs.existsSync(dbPath)) return Promise.reject();
    return fs.promises.unlink(dbPath);
  });
}
