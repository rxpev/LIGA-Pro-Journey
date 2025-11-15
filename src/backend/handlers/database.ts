/**
 * Database IPC handlers.
 *
 * @module
 */
import log from "electron-log";
import { ipcMain } from "electron";
import { Prisma } from "@prisma/client";
import { DatabaseClient } from "@liga/backend/lib";
import { Util, Constants, Eagers } from "@liga/shared";

export default function registerDatabaseHandlers() {
  // CONNECT
  ipcMain.handle(Constants.IPCRoute.DATABASE_CONNECT, async (_, id?: string) => {

    await Util.sleep(200);

    const prisma = await DatabaseClient.connect(parseInt(id) || 0);

    const profile = await prisma.profile.findFirst();

    if (!profile) return;

    // Load profile settings
    const settings = Util.loadSettings(profile.settings);
    log.transports.console.level = settings.general.logLevel as log.LogLevel;
    log.transports.file.level = settings.general.logLevel as log.LogLevel;

    return prisma.profile.update({
      where: { id: profile.id },
      data: { updatedAt: new Date().toISOString() },
    });
  });

  // DISCONNECT
  ipcMain.handle(Constants.IPCRoute.DATABASE_DISCONNECT, async () => {
    await Util.sleep(2000);
    return DatabaseClient.disconnect();
  });

  // GENERIC QUERIES
  ipcMain.handle(
    Constants.IPCRoute.COMPETITIONS_ALL,
    async (_, query: Prisma.CompetitionFindManyArgs) => {
      const prisma = await DatabaseClient.connect();
      return prisma.competition.findMany(query);
    }
  );

  ipcMain.handle(
    Constants.IPCRoute.COMPETITIONS_FIND,
    async (_, query: Prisma.CompetitionFindFirstArgs) => {
      const prisma = await DatabaseClient.connect();
      return prisma.competition.findFirst(query);
    }
  );

  ipcMain.handle(
    Constants.IPCRoute.COMPETITIONS_WINNERS,
    async (_, id: string) => {
      const prisma = await DatabaseClient.connect();

      const competition = await prisma.competition.findFirst({
        where: { id: Number(id) },
      });

      const competitions = await prisma.competition.findMany({
        include: Eagers.competition.include,
        orderBy: { season: "desc" },
        where: {
          tierId: competition.tierId,
          federationId: competition.federationId,
          season: { lt: competition.season },
        },
      });

      return competitions.map(c =>
        c.competitors.sort((a, b) => a.position - b.position)[0]
      );
    }
  );

  ipcMain.handle(Constants.IPCRoute.CONTINENTS_ALL, async (_, query) => {
    const prisma = await DatabaseClient.connect();
    return prisma.continent.findMany(query);
  });

  ipcMain.handle(Constants.IPCRoute.EMAILS_ALL, async (_, query) => {
    const prisma = await DatabaseClient.connect();
    return prisma.email.findMany(query);
  });

  ipcMain.handle(Constants.IPCRoute.EMAILS_DELETE, async (_, ids) => {
    const prisma = await DatabaseClient.connect();
    return prisma.email.deleteMany({ where: { id: { in: ids } } });
  });

  ipcMain.handle(Constants.IPCRoute.EMAILS_UPDATE_DIALOGUE, async (_, query) => {
    const prisma = await DatabaseClient.connect();
    const dialogue = await prisma.dialogue.update(query);

    return prisma.email.findFirst({
      where: { id: dialogue.emailId },
      include: Eagers.email.include,
    });
  });

  ipcMain.handle(Constants.IPCRoute.EMAILS_UPDATE_MANY, async (_, query) => {
    const prisma = await DatabaseClient.connect();

    await prisma.email.updateMany(query);

    return prisma.email.findMany({
      where: { id: { in: (query.where.id as Prisma.IntFilter).in } },
      include: Eagers.email.include,
    });
  });

  ipcMain.handle(Constants.IPCRoute.FEDERATIONS_ALL, async () => {
    const prisma = await DatabaseClient.connect();
    return prisma.federation.findMany();
  });

  ipcMain.handle(Constants.IPCRoute.PLAYERS_ALL, async (_, query) => {
    const prisma = await DatabaseClient.connect();
    return prisma.player.findMany(query);
  });

  ipcMain.handle(Constants.IPCRoute.PLAYERS_COUNT, async (_, where) => {
    const prisma = await DatabaseClient.connect();
    return prisma.player.count({ where });
  });

  ipcMain.handle(Constants.IPCRoute.PLAYERS_FIND, async (_, query) => {
    const prisma = await DatabaseClient.connect();
    return prisma.player.findFirst(query);
  });

  ipcMain.handle(Constants.IPCRoute.TEAM_RANKING, async (_, id) => {
    const prisma = await DatabaseClient.connect();
    return prisma.team.getWorldRanking(id);
  });

  ipcMain.handle(Constants.IPCRoute.TEAMS_ALL, async (_, query) => {
    const prisma = await DatabaseClient.connect();
    return prisma.team.findMany(query);
  });

  ipcMain.handle(Constants.IPCRoute.TEAMS_CREATE, async (_, data) => {
    const prisma = await DatabaseClient.connect();
    return prisma.team.create({ data });
  });

  ipcMain.handle(Constants.IPCRoute.TEAMS_UPDATE, async (_, query) => {
    const prisma = await DatabaseClient.connect();
    return prisma.team.update(query);
  });

  ipcMain.handle(Constants.IPCRoute.TIERS_ALL, async (_, query) => {
    const prisma = await DatabaseClient.connect();
    return prisma.tier.findMany(query);
  });
}
