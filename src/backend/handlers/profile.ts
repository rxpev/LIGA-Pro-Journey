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
import { Constants, Eagers, Util } from '@liga/shared';
import { DatabaseClient, DiscordPresence, Game, WindowManager, Worldgen } from '@liga/backend/lib';
import { removeSaveIntegrity } from '@liga/backend/lib/save-integrity';

const FACEIT_OPENING_MESSAGE = `Hey!

I saw you recently joined FACEIT and are interested in taking the game more seriously. I just started playing on FACEIT as well, and I’m looking for people to grind with and improve together. If we build some good chemistry and perform well, maybe we can eventually get noticed by teams.

If you’re interested, we could play a few matches sometime. I sent you a friend request!`;
const FACEIT_OPENING_DELAY_MS = 5_000;
const FACEIT_OPENING_WINDOW_RETRY_MS = 250;
const FACEIT_OPENING_MAX_WINDOW_RETRIES = 120;

/**
 * Adds the opening FACEIT conversation for a new player career.
 *
 * The sender is picked from the same federation as the user's country and is
 * kept close to the 1400-ELO starting bracket. This is called only by the
 * career-creation handler, so opening an existing save does not create it.
 */
async function createFaceitOpeningChat(
  countryId: number,
  sentAt: Date,
  playerRole: string,
  notify = true,
) {
  const country = await DatabaseClient.prisma.country.findUnique({
    where: { id: countryId },
    select: { continent: { select: { federationId: true } } },
  });

  if (!country) return;

  const eligibleRoleWhere: Prisma.PlayerWhereInput =
    playerRole.toUpperCase() === Constants.UserRole.AWPER
      ? { role: { notIn: [Constants.PlayerRole.SNIPER, Constants.UserRole.AWPER] } }
      : {};
  const regionalWhere: Prisma.PlayerWhereInput = {
    ...eligibleRoleWhere,
    userControlled: false,
    retiredAt: null,
    OR: [
      { team: { competitionFederationId: country.continent.federationId } },
      { teamId: null, country: { continent: { federationId: country.continent.federationId } } },
    ],
  };

  const regionalPlayers = await DatabaseClient.prisma.player.findMany({
    where: { ...regionalWhere, elo: { gte: 1300, lte: 1500 } },
    select: { id: true, name: true, elo: true },
  });

  let candidates = regionalPlayers;
  if (!candidates.length) {
    const nearbyPlayers = await DatabaseClient.prisma.player.findMany({
      where: { ...regionalWhere, elo: { gt: 0 } },
      select: { id: true, name: true, elo: true },
    });
    candidates = nearbyPlayers
      .sort((a, b) => Math.abs(a.elo - 1400) - Math.abs(b.elo - 1400))
      .slice(0, 20);
  }

  // World/Other countries may not have a seeded regional pool yet. Keep the
  // opening conversation guaranteed by falling back to the global 1400 bracket.
  if (!candidates.length) {
    candidates = await DatabaseClient.prisma.player.findMany({
      where: {
        ...eligibleRoleWhere,
        userControlled: false,
        retiredAt: null,
        elo: { gte: 1300, lte: 1500 },
      },
      select: { id: true, name: true, elo: true },
    });
  }

  if (!candidates.length) return;

  const player = candidates[Math.floor(Math.random() * candidates.length)];
  const senderRole = `FACEIT Player [player:${player.id}]`;
  const sender = await DatabaseClient.prisma.persona.upsert({
    where: { name: player.name },
    update: { role: senderRole },
    create: { name: player.name, role: senderRole },
  });

  await Worldgen.sendEmail(
    `FACEIT friend request from ${player.name}`,
    FACEIT_OPENING_MESSAGE,
    sender,
    sentAt,
    notify,
  );
}

function scheduleFaceitOpeningChat(countryId: number, sentAt: Date, playerRole: string) {
  let retries = 0;

  const deliver = () => {
    const mainWindow = WindowManager.get(Constants.WindowIdentifier.Main, false);
    const mainWindowReady =
      mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isLoadingMainFrame();

    if (!mainWindowReady && retries < FACEIT_OPENING_MAX_WINDOW_RETRIES) {
      retries += 1;
      setTimeout(deliver, FACEIT_OPENING_WINDOW_RETRY_MS);
      return;
    }

    void createFaceitOpeningChat(countryId, sentAt, playerRole, Boolean(mainWindowReady)).catch(
      (error) => log.error('Could not send the opening FACEIT chat.', error),
    );
  };

  setTimeout(deliver, FACEIT_OPENING_DELAY_MS);
}

async function resolveFaceitOpeningPlayer(sender: { name: string; role: string }) {
  const playerId = Number(sender.role.match(/\[player:(\d+)\]/i)?.[1]);
  const elo = Number(sender.role.match(/(\d+)\s+ELO/i)?.[1]);
  const select = {
    id: true,
    name: true,
    elo: true,
    role: true,
    countryId: true,
    teamId: true,
    team: { select: { countryId: true } },
  } as const;

  if (Number.isInteger(playerId) && playerId > 0) {
    const exactPlayer = await DatabaseClient.prisma.player.findUnique({
      where: { id: playerId },
      select,
    });
    if (exactPlayer) return exactPlayer;
  }

  return DatabaseClient.prisma.player.findFirst({
    where: {
      name: sender.name,
      ...(Number.isFinite(elo) && elo > 0 ? { elo } : {}),
      userControlled: false,
    },
    select,
    orderBy: { id: 'asc' },
  });
}

export default function registerProfileHandlers() {
  ipcMain.handle(
    'profiles:createPlayerCareer',
    async (
      _,
      data: {
        playerName: string;
        age: number;
        countryId: number;
        role: string;
        simulateNpcMatchStats?: boolean;
      },
    ) => {
      const { playerName, age, countryId, role, simulateNpcMatchStats } = data;

      if (!Number.isInteger(age) || age < 14 || age > 60) {
        throw new Error('Player age must be a whole number between 14 and 60.');
      }

      // Always use the single root profile
      const existing = await DatabaseClient.prisma.profile.findFirst();

      // 1. CREATE / UPDATE PROFILE
      const profile = await DatabaseClient.prisma.profile.update({
        where: { id: existing.id },
        data: {
          name: playerName,
          date: Constants.NewSaveSeasonStartDate,
          season: 0,
          faceitElo: 0,
          simulateNpcMatchStats: Boolean(simulateNpcMatchStats),

          player: {
            create: {
              name: playerName,
              age,
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

      // Let the main window finish mounting, then deliver this as a real
      // incoming message so the normal Inbox notification sound plays.
      scheduleFaceitOpeningChat(countryId, profile.date, role);

      return profile;
    },
  );

  ipcMain.handle(
    Constants.IPCRoute.EMAILS_FACEIT_OPENING_REPLY,
    async (_, choice: 'accept' | 'decline') => {
      if (choice !== 'accept' && choice !== 'decline') {
        throw new Error('Invalid FACEIT opening reply.');
      }

      const profile = await DatabaseClient.prisma.profile.findFirst();
      if (!profile) throw new Error('Profile not found.');

      const email = await DatabaseClient.prisma.email.findFirst({
        where: { subject: { startsWith: 'FACEIT friend request from ' } },
        orderBy: { id: 'desc' },
        include: { from: true },
      });
      if (!email) throw new Error('FACEIT opening conversation not found.');

      const playerPersona = await DatabaseClient.prisma.persona.upsert({
        where: { name: `__player_profile_${profile.id}` },
        update: { role: 'Player' },
        create: { name: `__player_profile_${profile.id}`, role: 'Player' },
      });
      const existingReply = await DatabaseClient.prisma.dialogue.findFirst({
        where: { emailId: email.id, fromId: playerPersona.id },
      });

      if (!existingReply) {
        const content =
          choice === 'accept' ? "Sure! I'll add you." : "No thank you, I'll try my luck on my own.";

        await DatabaseClient.prisma.$transaction([
          DatabaseClient.prisma.dialogue.updateMany({
            where: { emailId: email.id },
            data: { completed: true },
          }),
          DatabaseClient.prisma.dialogue.create({
            data: {
              content,
              sentAt: profile.date,
              emailId: email.id,
              fromId: playerPersona.id,
            },
          }),
        ]);
      }

      const [updatedEmail, openingPlayer] = await Promise.all([
        DatabaseClient.prisma.email.findUnique({
          where: { id: email.id },
          include: Eagers.email.include,
        }),
        resolveFaceitOpeningPlayer(email.from),
      ]);

      return {
        email: updatedEmail,
        recommendation:
          choice === 'accept' && openingPlayer
            ? {
                id: openingPlayer.id,
                name: openingPlayer.name,
                elo: openingPlayer.elo,
                role: openingPlayer.role,
                countryId: openingPlayer.countryId,
                teamId: openingPlayer.teamId,
                teamCountryId: openingPlayer.team?.countryId ?? null,
              }
            : null,
      };
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
    await removeSaveIntegrity(dbPath);
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
