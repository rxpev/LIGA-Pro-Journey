/**
 * Database IPC handlers.
 *
 * @module
 */
import log from "electron-log";
import { ipcMain } from "electron";
import { Prisma } from "@prisma/client";
import { DatabaseClient, disconnectActiveDatabaseWithIntegrity } from "@liga/backend/lib";
import { Util, Constants, Eagers } from "@liga/shared";
import { verifyFaceitEloIntegrity } from "@liga/backend/lib/faceit-elo-integrity";
import {
  removeLegacySaveIntegrity,
  verifySaveIntegrity,
} from "@liga/backend/lib/save-integrity";

export default function registerDatabaseHandlers() {
  // CONNECT
  ipcMain.handle(Constants.IPCRoute.DATABASE_CONNECT, async (_, id?: string) => {

    await Util.sleep(200);

    const prisma = await DatabaseClient.connect(parseInt(id) || 0);

    const profile = await prisma.profile.findFirst();

    if (!profile) return;

    const faceitEloIntegrity = await verifyFaceitEloIntegrity(prisma, profile);

    if (!faceitEloIntegrity.valid) {
      log.warn(
        'Blocked save load because FACEIT ELO integrity failed: actual=%d expected=%d invalidDeltaMatchIds=%j',
        faceitEloIntegrity.actualElo,
        faceitEloIntegrity.expectedElo,
        faceitEloIntegrity.invalidDeltaMatchIds,
      );

      await DatabaseClient.disconnect();
      await DatabaseClient.connect(0);

      return {
        blocked: true,
        reason: 'FACEIT_ELO_TAMPERED',
      };
    }

    if ((parseInt(id) || 0) !== 0) {
      const saveIntegrity = await verifySaveIntegrity(prisma as any, DatabaseClient.path);

      if (!saveIntegrity.valid) {
        log.warn(
          'Blocked save load because save integrity failed: actual=%s expected=%s',
          saveIntegrity.actualDigest,
          saveIntegrity.expectedDigest,
        );

        await DatabaseClient.disconnect();
        await DatabaseClient.connect(0);

        return {
          blocked: true,
          reason: 'SAVE_TAMPERED',
        };
      }

      if (saveIntegrity.initialized) {
        log.info('Initialized save integrity seal for %s.', DatabaseClient.path);
      }

      await removeLegacySaveIntegrity(DatabaseClient.path);
    }

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
    return disconnectActiveDatabaseWithIntegrity();
  });


  ipcMain.handle(Constants.IPCRoute.DATABASE_CURRENT, async () => {
    const dbPath = DatabaseClient.path || '';
    const match = dbPath.match(/save_(\d+)\.db$/);
    return match ? Number(match[1]) : 0;
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
    Constants.IPCRoute.COMPETITIONS_PARTICIPANT_LINEUP,
    async (_, competitionId: number, teamId: number) => {
      const prisma = await DatabaseClient.connect();
      const competition = await prisma.competition.findFirst({
        where: { id: competitionId },
        select: {
          id: true,
          season: true,
          matches: {
            select: {
              date: true,
            },
            orderBy: {
              date: 'asc',
            },
          },
        },
      });

      if (!competition) {
        return [];
      }

      let competitionStart = competition.matches[0]?.date;
      let competitionEnd = competition.matches[competition.matches.length - 1]?.date ?? competitionStart;

      // Fallback for legacy competitions that have no match rows:
      // infer season window from all matches tied to the same season.
      if (!competitionStart || !competitionEnd) {
        const seasonWindow = await prisma.match.findMany({
          where: {
            competition: {
              season: competition.season,
            },
          },
          select: {
            date: true,
          },
          orderBy: {
            date: 'asc',
          },
        });

        competitionStart = seasonWindow[0]?.date;
        competitionEnd = seasonWindow[seasonWindow.length - 1]?.date ?? competitionStart;
      }

      // If we still can't infer a date window, use historical team stints only
      // (never current roster snapshot) and pick the five most recent players.
      if (!competitionStart || !competitionEnd) {
        const historical = await prisma.careerStint.findMany({
          where: { teamId },
          include: {
            player: {
              select: {
                id: true,
                name: true,
                country: {
                  select: {
                    code: true,
                  },
                },
              },
            },
          },
          orderBy: {
            startedAt: 'desc',
          },
        });

        const deduped = new Map<number, (typeof historical)[number]['player']>();
        for (const stint of historical) {
          if (!deduped.has(stint.playerId)) {
            deduped.set(stint.playerId, stint.player);
          }
          if (deduped.size >= Constants.GameSettings.SQUAD_STARTERS_NUM) {
            break;
          }
        }

        return Array.from(deduped.values());
      }

      const overlappingStints = await prisma.careerStint.findMany({
        where: {
          teamId,
          startedAt: {
            lte: competitionEnd,
          },
          OR: [
            { endedAt: null },
            {
              endedAt: {
                gte: competitionStart,
              },
            },
          ],
        },
        include: {
          player: {
            select: {
              id: true,
              name: true,
              country: {
                select: {
                  code: true,
                },
              },
            },
          },
        },
      });

      if (!overlappingStints.length) {
        // If there's no overlap (data gaps), pick closest stints around that date window.
        const nearbyStints = await prisma.careerStint.findMany({
          where: {
            teamId,
            startedAt: {
              lte: competitionEnd,
            },
          },
          include: {
            player: {
              select: {
                id: true,
                name: true,
                country: {
                  select: {
                    code: true,
                  },
                },
              },
            },
          },
          orderBy: {
            startedAt: 'desc',
          },
        });

        const byPlayer = new Map<number, (typeof nearbyStints)[number]['player']>();
        for (const stint of nearbyStints) {
          if (!byPlayer.has(stint.playerId)) {
            byPlayer.set(stint.playerId, stint.player);
          }
          if (byPlayer.size >= Constants.GameSettings.SQUAD_STARTERS_NUM) {
            break;
          }
        }

        return Array.from(byPlayer.values());
      }

      const byPlayerId = new Map<number, {
        player: {
          id: number;
          name: string;
          country: {
            code: string;
          };
        };
        starterEvidence: number;
        overlapMs: number;
        firstSeen: number;
      }>();

      for (const stint of overlappingStints) {
        const overlapStart = Math.max(stint.startedAt.getTime(), competitionStart.getTime());
        const overlapEnd = Math.min((stint.endedAt ?? competitionEnd).getTime(), competitionEnd.getTime());
        const overlapMs = Math.max(0, overlapEnd - overlapStart);

        const current = byPlayerId.get(stint.playerId);
        if (!current) {
          byPlayerId.set(stint.playerId, {
            player: stint.player,
            starterEvidence: stint.starter ? 1 : 0,
            overlapMs,
            firstSeen: stint.startedAt.getTime(),
          });
          continue;
        }

        current.starterEvidence += stint.starter ? 1 : 0;
        current.overlapMs += overlapMs;
        current.firstSeen = Math.min(current.firstSeen, stint.startedAt.getTime());
      }

      return Array.from(byPlayerId.values())
        .sort((a, b) =>
          b.starterEvidence - a.starterEvidence
          || b.overlapMs - a.overlapMs
          || a.firstSeen - b.firstSeen
          || a.player.name.localeCompare(b.player.name))
        .slice(0, Constants.GameSettings.SQUAD_STARTERS_NUM)
        .map((entry) => entry.player);
    }
  );

  ipcMain.handle(
    Constants.IPCRoute.COMPETITIONS_WINNERS,
    async (_, id: string) => {
      const prisma = await DatabaseClient.connect();

      const competition = await prisma.competition.findFirst({
        where: { id: Number(id) },
      });

      if (!competition) {
        return [];
      }

      const competitions = await prisma.competition.findMany({
        include: Eagers.competition.include,
        orderBy: { season: "desc" },
        where: {
          tierId: competition.tierId,
          federationId: competition.federationId,
          season: { lt: competition.season },
          status: Constants.CompetitionStatus.COMPLETED,
        },
      });

      return competitions
        .map((c) => c.competitors.sort((a, b) => a.position - b.position)[0])
        .filter((winner) => Boolean(winner?.team));
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

  ipcMain.handle(Constants.IPCRoute.TEAM_TRANSFERS, async (_, id: number) => {
    const prisma = await DatabaseClient.connect();

    return prisma.transfer.findMany({
      include: Eagers.transfer.include,
      where: {
        OR: [
          {
            status: Constants.TransferStatus.PLAYER_ACCEPTED,
            OR: [{ from: { id } }, { to: { id } }],
          },
          {
            status: Constants.TransferStatus.TEAM_ACCEPTED,
            teamIdTo: id,
            offers: {
              some: { cost: 0 },
            },
          },
          {
            status: Constants.TransferStatus.EXPIRED,
            teamIdFrom: id,
          },
        ],
      },
      orderBy: { id: 'desc' },
    });
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
