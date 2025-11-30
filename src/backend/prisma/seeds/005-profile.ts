/**
 * Clean PLAYER-ONLY Profile IPC handlers.
 *
 * @module
 */

import fs from "node:fs";
import path from "node:path";
import log from "electron-log";
import { ipcMain } from "electron";
import { glob } from "glob";
import { Prisma } from "@prisma/client";
import { Constants, Util } from "@liga/shared";
import { DatabaseClient, WindowManager, Game } from "@liga/backend/lib";

export default function registerProfileHandlers() {

  // ------------------------------------------------------------------------
  // CREATE PLAYER CAREER
  // ------------------------------------------------------------------------
  ipcMain.handle(
    "profiles:createPlayerCareer",
    async (_, data: { playerName: string; countryId: number; role: string }) => {
      const prisma = await DatabaseClient.connect();
      const { playerName, countryId, role } = data;

      // Always remove existing profile + player
      await prisma.profile.deleteMany();
      await prisma.player.deleteMany();

      // Create player
      const player = await prisma.player.create({
        data: {
          name: playerName,
          countryId,
          role,
          xp: 0,
          prestige: 0,
          userControlled: true,
        },
      });

      // Create profile
      const profile = await prisma.profile.create({
        data: {
          name: "Player Career",
          careerMode: "PLAYER",
          date: new Date().toISOString(),
          settings: JSON.stringify(Constants.Settings),
          faceitElo: 1200,
          player: { connect: { id: player.id } },
        },
        include: { player: true },
      });

      return profile;
    }
  );

  // ------------------------------------------------------------------------
  // GET CURRENT PROFILE
  // ------------------------------------------------------------------------
  ipcMain.handle(Constants.IPCRoute.PROFILES_CURRENT, async () => {
    const prisma = await DatabaseClient.connect();
    return prisma.profile.findFirst({
      include: { player: true },
    });
  });

  // ------------------------------------------------------------------------
  // UPDATE SETTINGS (keep this!)
  // ------------------------------------------------------------------------
  ipcMain.handle(
    Constants.IPCRoute.PROFILES_UPDATE,
    async (_, query: Prisma.ProfileUpdateArgs) => {
      const prisma = await DatabaseClient.connect();

      const profile = await prisma.profile.findFirst({
        include: { player: true },
      });

      const oldSettings = Util.loadSettings(profile.settings);
      const newSettings = JSON.parse(query.data.settings as string);

      // If logLevel changed → update logger
      if (newSettings.general.logLevel !== oldSettings.general.logLevel) {
        log.transports.console.level = newSettings.general.logLevel;
        log.transports.file.level = newSettings.general.logLevel;
      }

      // If game changed → rediscover game path
      if (
        newSettings.general.game !== oldSettings.general.game &&
        oldSettings.general.steamPath
      ) {
        try {
          newSettings.general.gamePath = await Game.discoverGamePath(
            newSettings.general.game,
            oldSettings.general.steamPath
          );
        } catch {
          newSettings.general.gamePath = null;
        }
      }

      const newProfile = await prisma.profile.update({
        ...query,
        data: { ...query.data, settings: JSON.stringify(newSettings) },
        include: { player: true },
      });

      WindowManager.sendAll(Constants.IPCRoute.PROFILES_CURRENT, newProfile);
      return newProfile;
    }
  );

  // ------------------------------------------------------------------------
  // SAVE SYSTEM (KEEP)
  // ------------------------------------------------------------------------

  // List all saves
  ipcMain.handle(Constants.IPCRoute.SAVES_ALL, async () => {
    const saves = [];

    const files = await glob("save_*.db", {
      cwd: path.normalize(DatabaseClient.basePath),
    });

    for (const file of files) {
      const [databaseId] = Array.from(
        file.matchAll(/save_(\d+)\.db/g),
        (g) => g[1]
      );
      if (!databaseId) continue;

      await DatabaseClient.disconnect();
      await DatabaseClient.connect(parseInt(databaseId));

      const profileData = await DatabaseClient.prisma.profile.findFirst({
        include: { player: true },
      });

      if (profileData) {
        profileData.id = parseInt(databaseId);
        saves.push(profileData);
      }
    }

    // Return to root DB
    await DatabaseClient.disconnect();
    await DatabaseClient.connect();

    return saves;
  });

  // Delete a save file
  ipcMain.handle(Constants.IPCRoute.SAVES_DELETE, async (_, id: number) => {
    const dbFileName = Util.getSaveFileName(id);
    const dbPath = path.join(DatabaseClient.basePath, dbFileName);

    if (!fs.existsSync(dbPath)) {
      return Promise.reject("Save file does not exist");
    }

    return fs.promises.unlink(dbPath);
  });
}
