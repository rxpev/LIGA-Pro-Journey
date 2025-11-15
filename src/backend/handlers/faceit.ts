import { ipcMain } from "electron";
import { DatabaseClient } from "@liga/backend/lib";
import log from "electron-log";
import { levelFromElo } from "@liga/backend/lib/levels";
import { FaceitMatchmaker } from "@liga/backend/lib/matchmaker";

export default function registerFaceitHandlers() {
  // ------------------------------------------------------
  // GET FACEIT PROFILE (user)
  // ------------------------------------------------------
  ipcMain.handle("faceit:getProfile", async () => {
    try {
      const prisma = await DatabaseClient.connect();

      const profile = await prisma.profile.findFirst({
        include: { player: true },
      });

      if (!profile) {
        throw new Error("No active profile found");
      }

      return {
        faceitElo: profile.faceitElo,
        faceitLevel: levelFromElo(profile.faceitElo), // ⭐ correct
        recent: [],
      };
    } catch (err) {
      log.error(err);
      throw err;
    }
  });

  // ------------------------------------------------------
  // QUEUE PUG → create matchroom
  // ------------------------------------------------------
  ipcMain.handle("faceit:queuePug", async () => {
    try {
      await DatabaseClient.connect(); // sets correct save DB
      const prisma = DatabaseClient.prisma; // ⬅ REAL PRISMA CLIENT

      const profile = await prisma.profile.findFirst({
        include: {
          player: {
            include: {
              country: {
                include: {
                  continent: {
                    include: {
                      federation: true
                    }
                  }
                }
              }
            }
          }
        }
      });

      if (!profile) throw new Error("No active profile found");
      if (!profile.player) throw new Error("Active profile has no linked player");

      const user = {
        id: profile.player.id,
        name: profile.player.name,
        elo: profile.faceitElo,
      };

      log.info(`Queueing FACEIT PUG for ${user.name} (Elo ${user.elo})…`);

      const matchRoom = await FaceitMatchmaker.createMatchRoom(prisma, user);

      log.info(`Created FACEIT matchroom ${matchRoom.matchId}`);

      return matchRoom;
    } catch (err) {
      log.error(err);
      throw err;
    }
  });
}
