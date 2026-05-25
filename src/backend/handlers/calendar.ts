/**
 * Calendar IPC handlers.
 */

import { dialog, ipcMain } from 'electron';
import { add, addDays, differenceInDays, endOfDay, format, getISODay, startOfDay } from 'date-fns';
import { Prisma, Calendar } from '@prisma/client';
import { DatabaseClient, Engine, WindowManager, Worldgen } from '@liga/backend/lib';
import { Bot, Eagers, Constants, Util } from '@liga/shared';

/**
 * Prevents the main window from closing immediately while the calendar advances.
 */
async function disableClose(event: Electron.Event) {
  event.preventDefault();
  const mainWindow = WindowManager.get(Constants.WindowIdentifier.Main);
  const data = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    message: 'The calendar is still advancing. Exiting now may cause database corruption.',
    detail: 'Are you sure you want to continue and risk potential data loss?',
    buttons: ['Continue', 'Cancel'],
  });
  if (data.response === 0) mainWindow.destroy();
}

/**
 * Recreate missing due competition-start entries.
 *
 * This is a safety net for cases where a competition remains SCHEDULED
 * past its due start date but has no pending COMPETITION_START entry.
 */
async function reconcileDueCompetitionStarts(
  profile: NonNullable<Awaited<ReturnType<typeof DatabaseClient.prisma.profile.findFirst>>>,
) {
  const seasonStart = await DatabaseClient.prisma.calendar.findFirst({
    where: {
      type: Constants.CalendarEntry.SEASON_START,
      date: { lte: profile.date.toISOString() },
    },
    orderBy: { date: 'desc' },
  });

  if (!seasonStart) {
    return;
  }

  const competitions = await DatabaseClient.prisma.competition.findMany({
    where: {
      season: profile.season,
      status: Constants.CompetitionStatus.SCHEDULED,
      tier: {
        triggerOffsetDays: null,
      },
    },
    include: {
      tier: {
        include: {
          league: true,
        },
      },
      federation: true,
    },
  });

  for (const competition of competitions) {
    const dueDate = addDays(seasonStart.date, competition.tier.league.startOffsetDays);
    if (profile.date < dueDate) {
      continue;
    }

    const pendingStart = await DatabaseClient.prisma.calendar.findFirst({
      where: {
        type: Constants.CalendarEntry.COMPETITION_START,
        payload: competition.id.toString(),
        completed: false,
      },
      select: { id: true },
    });

    if (pendingStart) {
      continue;
    }

    await DatabaseClient.prisma.calendar.create({
      data: {
        type: Constants.CalendarEntry.COMPETITION_START,
        date: profile.date.toISOString(),
        payload: competition.id.toString(),
      },
    });
  }
}

/**
 * Requeue stale matchdays that were created for a previous calendar day but
 * never processed. This can happen when a competition creates matchdays during
 * the same tick as its start event.
 */
async function reconcileOverdueMatchdays(
  profile: NonNullable<Awaited<ReturnType<typeof DatabaseClient.prisma.profile.findFirst>>>,
) {
  const today = startOfDay(profile.date);
  const overdueEntries = await DatabaseClient.prisma.calendar.findMany({
    where: {
      completed: false,
      date: { lt: today.toISOString() },
      type: {
        in: [Constants.CalendarEntry.MATCHDAY_NPC, Constants.CalendarEntry.MATCHDAY_USER],
      },
    },
  });

  for (const entry of overdueEntries) {
    const matchId = Number(entry.payload);
    if (!Number.isFinite(matchId)) {
      continue;
    }

    const match = await DatabaseClient.prisma.match.findFirst({
      where: {
        id: matchId,
        matchType: { not: 'FACEIT_PUG' },
        status: { not: Constants.MatchStatus.COMPLETED },
      },
      select: { id: true },
    });

    if (!match) {
      continue;
    }

    await DatabaseClient.prisma.$transaction([
      DatabaseClient.prisma.calendar.update({
        where: { id: entry.id },
        data: { date: profile.date.toISOString() },
      }),
      DatabaseClient.prisma.match.update({
        where: { id: match.id },
        data: { date: profile.date.toISOString() },
      }),
    ]);
  }
}

/**
 * Remove FACEIT match placeholders that were created before the game launched
 * but never reached result persistence. These rows cannot be resumed from the
 * database, and they otherwise block calendar advancement forever.
 */
async function cleanupOrphanedFaceitReadyMatches(profileId: number) {
  const orphanedMatches = await DatabaseClient.prisma.match.findMany({
    where: {
      profileId,
      matchType: 'FACEIT_PUG',
      status: Constants.MatchStatus.READY,
      faceitEloDelta: null,
      faceitRating: null,
      faceitIsWin: null,
    },
    select: { id: true },
  });

  const matchIds = orphanedMatches.map((match) => match.id);
  if (!matchIds.length) {
    return;
  }

  await DatabaseClient.prisma.$transaction([
    DatabaseClient.prisma.$executeRaw`
      DELETE FROM "MatchEvent"
      WHERE "matchId" IN (${Prisma.join(matchIds)})
    `,
    DatabaseClient.prisma.$executeRaw`
      DELETE FROM "MatchVeto"
      WHERE "matchId" IN (${Prisma.join(matchIds)})
    `,
    DatabaseClient.prisma.$executeRaw`
      DELETE FROM "GameToTeam"
      WHERE "gameId" IN (
        SELECT "id" FROM "Game" WHERE "matchId" IN (${Prisma.join(matchIds)})
      )
    `,
    DatabaseClient.prisma.$executeRaw`
      DELETE FROM "Game"
      WHERE "matchId" IN (${Prisma.join(matchIds)})
    `,
    DatabaseClient.prisma.$executeRaw`
      DELETE FROM "MatchToTeam"
      WHERE "matchId" IN (${Prisma.join(matchIds)})
    `,
    DatabaseClient.prisma.$executeRaw`
      DELETE FROM "_MatchToPlayer"
      WHERE "A" IN (${Prisma.join(matchIds)})
    `,
    DatabaseClient.prisma.match.deleteMany({
      where: { id: { in: matchIds } },
    }),
  ]);

  Engine.Runtime.Instance.log.warn(
    'Removed %d orphaned FACEIT READY match rows before calendar advance.',
    matchIds.length,
  );
}

/**
 * Engine middleware: start of each tick.
 */
async function onTickStart() {
  Engine.Runtime.Instance.log.info(
    'Running %s middleware...',
    Engine.MiddlewareType.TICK_START.toUpperCase(),
  );

  const profile = await DatabaseClient.prisma.profile.findFirst();
  if (!profile) return Promise.resolve();

  await reconcileDueCompetitionStarts(profile);
  await reconcileOverdueMatchdays(profile);

  // Fetch global calendar events for today (calendar-day window, not exact timestamp).
  // This avoids missing entries due to timezone/DST/millisecond drift.
  const from = startOfDay(profile.date);
  const to = endOfDay(profile.date);
  Engine.Runtime.Instance.input = await DatabaseClient.prisma.calendar.findMany({
    where: {
      date: {
        gte: from.toISOString(),
        lte: to.toISOString(),
      },
      completed: false,
    },
    orderBy: [{ date: 'asc' }, { id: 'asc' }],
  });

  Engine.Runtime.Instance.log.info(
    "Today's date is: %s",
    format(profile.date, Constants.Settings.calendar.calendarDateFormat),
  );
  Engine.Runtime.Instance.log.info('%d items to run.', Engine.Runtime.Instance.input.length);

  return Promise.resolve();
}

/**
 * Engine middleware: end of each tick.
 */
async function onTickEnd(input: Calendar[], status?: Engine.LoopStatus) {
  // Mark entries completed
  await Promise.all(
    input.map((calendar) =>
      DatabaseClient.prisma.calendar.update({
        where: { id: calendar.id },
        data: { completed: true },
      }),
    ),
  );

  await Worldgen.recordMatchResults();

  // npc transfers
  await Worldgen.sendNPCTransferOffer();

  // keep team country identities synced even for teams that did not pass
  // through a direct roster-change recalculation hook this tick
  await Worldgen.recalculateAllTeamCountryIdentities();

  // If stopped, do not advance day
  if (status === Engine.LoopStatus.TERMINATED) {
    Engine.Runtime.Instance.log.info('Stopping...');
    return Promise.resolve();
  }

  // Advance day
  let profile = await DatabaseClient.prisma.profile.findFirst();
  profile = await DatabaseClient.prisma.profile.update({
    where: { id: profile.id },
    data: { date: addDays(profile.date, 1).toISOString() },
  });

  const isStartOfIsoWeek = getISODay(profile.date) === 1;
  if (isStartOfIsoWeek) {
    await simulateWeeklyNpcFaceitElo(DatabaseClient.prisma, profile.playerId);
  }

  const mainWindow = WindowManager.get(Constants.WindowIdentifier.Main, false)?.webContents;
  if (mainWindow) mainWindow.send(Constants.IPCRoute.PROFILES_CURRENT, profile);

  return Promise.resolve();
}

const WEEKLY_NPC_FACEIT_ELO_SAMPLE_MIN = 300;
const WEEKLY_NPC_FACEIT_ELO_SAMPLE_MAX = 500;

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function randomInt(min: number, max: number) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function randomSample<T>(items: T[], sampleSize: number) {
  const copy = [...items];

  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }

  return copy.slice(0, sampleSize);
}

function highEloPressure(elo = 0) {
  if (elo >= 5000) return 0.55;
  if (elo >= 4750) return 0.48;
  if (elo >= 4500) return 0.4;
  if (elo >= 4250) return 0.34;
  if (elo >= 4000) return 0.28;
  if (elo >= 3750) return 0.21;
  if (elo >= 3500) return 0.15;
  if (elo >= 3250) return 0.1;
  if (elo >= 3000) return 0.06;
  if (elo >= 2750) return 0.03;

  return 0;
}

function highEloGainMultiplier(elo = 0) {
  if (elo >= 5000) return 0;
  if (elo >= 4750) return 0.15;
  if (elo >= 4500) return 0.25;
  if (elo >= 4250) return 0.35;
  if (elo >= 4000) return 0.45;
  if (elo >= 3750) return 0.55;
  if (elo >= 3500) return 0.65;
  if (elo >= 3250) return 0.75;
  if (elo >= 3000) return 0.85;
  if (elo >= 2750) return 0.92;

  return 1;
}

function highEloLossMultiplier(elo = 0, xp = 0) {
  const lowXpMultiplier = xp < 35 ? 1.45 : xp < 50 ? 1.25 : 1;

  if (elo >= 5000) return 2.2 * lowXpMultiplier;
  if (elo >= 4750) return 1.9 * lowXpMultiplier;
  if (elo >= 4500) return 1.65 * lowXpMultiplier;
  if (elo >= 4250) return 1.45 * lowXpMultiplier;
  if (elo >= 4000) return 1.3 * lowXpMultiplier;
  if (elo >= 3750) return 1.18;
  if (elo >= 3500) return 1.1;

  return 1;
}

function randomWeeklyFaceitDelta() {
  // Max weekly movement is +/-50, biased toward +/-25 and +/-30.
  const weightedDeltas: Array<{ delta: number; weight: number }> = [
    { delta: -50, weight: 4 },
    { delta: -40, weight: 6 },
    { delta: -30, weight: 15 },
    { delta: -25, weight: 18 },
    { delta: -20, weight: 8 },
    { delta: -10, weight: 6 },
    { delta: 0, weight: 4 },
    { delta: 10, weight: 6 },
    { delta: 20, weight: 8 },
    { delta: 25, weight: 18 },
    { delta: 30, weight: 15 },
    { delta: 40, weight: 6 },
    { delta: 50, weight: 4 },
  ];

  const totalWeight = weightedDeltas.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = Math.random() * totalWeight;

  for (const entry of weightedDeltas) {
    roll -= entry.weight;
    if (roll <= 0) {
      return entry.delta;
    }
  }

  return 0;
}

function randomWeeklyFaceitDeltaForXp(xp = 0, elo = 0) {
  const rawDelta = randomWeeklyFaceitDelta();

  if (rawDelta === 0) {
    return 0;
  }

  const magnitude = Math.abs(rawDelta);
  const xpGainBias = xp >= 80 ? 0.16 : xp >= 65 ? 0.1 : xp >= 50 ? 0.06 : 0;
  const lowXpHighEloPressure = xp < 50 && elo >= 4000 ? 0.12 : 0;
  const gainChance = clampNumber(
    0.5 + xpGainBias - highEloPressure(elo) - lowXpHighEloPressure,
    0.08,
    0.72,
  );
  const gainRoll = Math.random() < gainChance;

  if (gainRoll) {
    const gainMultiplier = highEloGainMultiplier(elo) * (xp < 50 && elo >= 4000 ? 0.5 : 1);
    return Math.round(magnitude * gainMultiplier);
  }

  return -Math.round(magnitude * highEloLossMultiplier(elo, xp));
}

async function simulateWeeklyNpcFaceitElo(
  prisma: typeof DatabaseClient.prisma,
  userPlayerId?: number | null,
) {
  const eligiblePlayers = await prisma.player.findMany({
    where: userPlayerId ? { id: { not: userPlayerId } } : {},
    select: {
      id: true,
      xp: true,
      elo: true,
    },
  });
  const sampleSize = Math.min(
    eligiblePlayers.length,
    randomInt(WEEKLY_NPC_FACEIT_ELO_SAMPLE_MIN, WEEKLY_NPC_FACEIT_ELO_SAMPLE_MAX),
  );
  const players = randomSample(eligiblePlayers, sampleSize);

  const chunkSize = 500;
  for (let i = 0; i < players.length; i += chunkSize) {
    const chunk = players.slice(i, i + chunkSize);

    await prisma.$transaction(
      chunk.map((player) => {
        const delta = randomWeeklyFaceitDeltaForXp(player.xp, player.elo);

        return prisma.player.update({
          where: { id: player.id },
          data: {
            // Increment from the player's CURRENT Elo in DB at write time.
            elo: { increment: delta },
          },
        });
      }),
    );

    await prisma.player.updateMany({
      where: {
        id: { in: chunk.map((player) => player.id) },
        elo: { gt: 5000 },
      },
      data: { elo: 5000 },
    });

    await prisma.player.updateMany({
      where: {
        id: { in: chunk.map((player) => player.id) },
        elo: { lt: 100 },
      },
      data: { elo: 100 },
    });
  }

  Engine.Runtime.Instance.log.info(
    'Weekly FACEIT Elo simulation applied to %d of %d eligible NPC players.',
    players.length,
    eligiblePlayers.length,
  );
}

/**
 * Engine middleware: end of loop cycle.
 *
 *
 */
async function onLoopFinish() {
  Engine.Runtime.Instance.log.info(
    'Running %s middleware...',
    Engine.MiddlewareType.LOOP_FINISH.toUpperCase(),
  );

  return Promise.resolve();
}

/**
 * Register calendar handlers.
 */
export default function () {
  // Engine middleware registration.
  Engine.Runtime.Instance.register(Engine.MiddlewareType.TICK_START, onTickStart);
  Engine.Runtime.Instance.register(Engine.MiddlewareType.TICK_END, onTickEnd);
  Engine.Runtime.Instance.register(Engine.MiddlewareType.LOOP_FINISH, onLoopFinish);

  // Worldgen handlers (global world events).
  Engine.Runtime.Instance.register(
    Constants.CalendarEntry.COMPETITION_START,
    Worldgen.onCompetitionStart,
  );
  Engine.Runtime.Instance.register(Constants.CalendarEntry.EMAIL_SEND, Worldgen.onEmailSend);
  Engine.Runtime.Instance.register(Constants.CalendarEntry.MATCHDAY_NPC, Worldgen.onMatchdayNPC);

  Engine.Runtime.Instance.register(
    Constants.CalendarEntry.MATCHDAY_USER,
    async (entry: Calendar) => {
      const profile = await DatabaseClient.prisma.profile.findFirst();

      // Fail-safe: if teamless but we encounter a MATCHDAY_USER,
      // demote it and simulate as NPC so matches never get stuck
      if (!profile?.teamId) {
        await DatabaseClient.prisma.calendar.update({
          where: { id: entry.id },
          data: { type: Constants.CalendarEntry.MATCHDAY_NPC },
        });

        return Worldgen.onMatchdayNPC({
          ...(entry as Calendar),
          type: Constants.CalendarEntry.MATCHDAY_NPC,
        });
      }

      return Worldgen.onMatchdayUser(entry as Calendar);
    },
  );

  Engine.Runtime.Instance.register(Constants.CalendarEntry.SEASON_START, Worldgen.onSeasonStart);
  Engine.Runtime.Instance.register(
    Constants.CalendarEntry.PLAYER_CONTRACT_EXPIRE,
    Worldgen.onPlayerContractExpire,
  );
  Engine.Runtime.Instance.register(
    Constants.CalendarEntry.PLAYER_SCOUTING_CHECK,
    Worldgen.onPlayerScoutingCheck,
  );
  Engine.Runtime.Instance.register(
    Constants.CalendarEntry.PLAYER_CONTRACT_REVIEW,
    Worldgen.onPlayerContractReview,
  );
  Engine.Runtime.Instance.register(
    Constants.CalendarEntry.PLAYER_CONTRACT_EXTENSION_EVAL,
    Worldgen.onPlayerContractExtensionEval,
  );
  Engine.Runtime.Instance.register(
    Constants.CalendarEntry.TRANSFER_OFFER_EXPIRY_CHECK,
    Worldgen.onTransferOfferExpiryCheck,
  );
  Engine.Runtime.Instance.register(
    Constants.CalendarEntry.TRANSFER_PARSE,
    Worldgen.onTransferParse,
  );

  // IPC: create calendar entry.
  ipcMain.handle(Constants.IPCRoute.CALENDAR_CREATE, (_, data: Prisma.CalendarCreateInput) =>
    DatabaseClient.prisma.calendar.create({ data }),
  );

  // IPC: find calendar entry.
  ipcMain.handle(Constants.IPCRoute.CALENDAR_FIND, (_, query: Prisma.CalendarFindFirstArgs) =>
    DatabaseClient.prisma.calendar.findFirst(query),
  );

  // IPC: start calendar simulation.
  ipcMain.handle(Constants.IPCRoute.CALENDAR_START, async (_, max?: number) => {
    const profile = await DatabaseClient.prisma.profile.findFirst();
    const settings = Util.loadSettings(profile.settings);

    await cleanupOrphanedFaceitReadyMatches(profile.id);

    const activeFaceitMatch = await DatabaseClient.prisma.match.findFirst({
      where: {
        profileId: profile.id,
        matchType: 'FACEIT_PUG',
        status: {
          in: [Constants.MatchStatus.WAITING, Constants.MatchStatus.PLAYING],
        },
      },
      select: { id: true },
    });

    if (activeFaceitMatch) {
      throw new Error('CALENDAR_BLOCKED_FACEIT_MATCHROOM');
    }

    // First-run logic for competitions remains unchanged.
    if (!(await DatabaseClient.prisma.competition.count())) {
      Engine.Runtime.Instance.log.debug('First run detected. Advancing 1 day...');

      return Engine.Runtime.Instance.start(1, true);
    }

    // Disable window actions during calendar advance.
    WindowManager.get(Constants.WindowIdentifier.Main).on('close', disableClose);
    WindowManager.disableMenu(Constants.WindowIdentifier.Main);

    let days = max;
    if (!max) {
      const from = profile.date;
      const to = add(from, { [settings.calendar.unit]: settings.calendar.maxIterations });
      days = differenceInDays(to, from);
    }

    await Engine.Runtime.Instance.start(days);

    WindowManager.get(Constants.WindowIdentifier.Main).off('close', disableClose);
    WindowManager.enableMenu(Constants.WindowIdentifier.Main);
    return Promise.resolve();
  });

  // IPC: stop calendar.
  ipcMain.handle(Constants.IPCRoute.CALENDAR_STOP, () => {
    Engine.Runtime.Instance.stop();
  });

  // IPC: simulate matchday for the user.
  ipcMain.handle(Constants.IPCRoute.CALENDAR_SIM, async () => {
    const profile = await DatabaseClient.prisma.profile.findFirst(Eagers.profile);

    // No team → no user matchday allowed.
    if (!profile.teamId) return null;

    const entry = await DatabaseClient.prisma.calendar.findFirst({
      where: {
        date: profile.date.toISOString(),
        type: Constants.CalendarEntry.MATCHDAY_USER,
      },
    });

    if (!entry) return null;

    Engine.Runtime.Instance.log.debug(
      'Received request to sim for match(payload=%s) on %s',
      entry.payload,
      format(entry.date, Constants.Settings.calendar.calendarDateFormat),
    );

    // Simulate NPC behavior for user match.
    await Worldgen.onMatchdayNPC(entry);

    // Reward XP if the user's team won.
    const match = await DatabaseClient.prisma.match.findFirst({
      where: { id: Number(entry.payload) },
      include: Eagers.match.include,
    });

    const userTeam = match.competitors.find((c) => c.teamId === profile.teamId);

    if (userTeam && userTeam.result === Constants.MatchResult.WIN) {
      await DatabaseClient.prisma.$transaction(
        profile.team.players.map((player) =>
          DatabaseClient.prisma.player.update({
            where: { id: player.id },
            data: { xp: player.xp },
          }),
        ),
      );
    }

    return match;
  });
}
