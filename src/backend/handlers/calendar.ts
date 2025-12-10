/**
 * Calendar IPC handlers.
 */

import { dialog, ipcMain } from "electron";
import { add, addDays, differenceInDays, format } from "date-fns";
import { Prisma, Calendar } from "@prisma/client";
import { DatabaseClient, Engine, WindowManager, Worldgen } from "@liga/backend/lib";
import { Bot, Eagers, Constants, Util } from "@liga/shared";

/**
 * Prevents the main window from closing immediately while the calendar advances.
 */
async function disableClose(event: Electron.Event) {
  event.preventDefault();
  const mainWindow = WindowManager.get(Constants.WindowIdentifier.Main);
  const data = await dialog.showMessageBox(mainWindow, {
    type: "warning",
    message: "The calendar is still advancing. Exiting now may cause database corruption.",
    detail: "Are you sure you want to continue and risk potential data loss?",
    buttons: ["Continue", "Cancel"],
  });
  if (data.response === 0) mainWindow.destroy();
}

/**
 * Engine middleware: start of each tick.
 */
async function onTickStart() {
  Engine.Runtime.Instance.log.info(
    "Running %s middleware...",
    Engine.MiddlewareType.TICK_START.toUpperCase()
  );

  const profile = await DatabaseClient.prisma.profile.findFirst();

  // Fetch global calendar events for today. These run even if the user has no team.
  Engine.Runtime.Instance.input = await DatabaseClient.prisma.calendar.findMany({
    where: { date: profile.date.toISOString(), completed: false },
  });

  Engine.Runtime.Instance.log.info(
    "Today's date is: %s",
    format(profile.date, Constants.Application.CALENDAR_DATE_FORMAT)
  );

  Engine.Runtime.Instance.log.info("%d items to run.", Engine.Runtime.Instance.input.length);
  return Promise.resolve();
}

/**
 * Engine middleware: end of each tick.
 */
async function onTickEnd(input: Calendar[], status?: Engine.LoopStatus) {
  Engine.Runtime.Instance.log.info(
    "Running %s middleware...",
    Engine.MiddlewareType.TICK_END.toUpperCase()
  );

  // Mark calendar entries as completed.
  await Promise.all(
    input.map((calendar) =>
      DatabaseClient.prisma.calendar.update({
        where: { id: calendar.id },
        data: { completed: true },
      })
    )
  );

  if (status === Engine.LoopStatus.TERMINATED) {
    Engine.Runtime.Instance.log.info("Stopping...");
    return Promise.resolve();
  }

  // Record global match results (affects NPC teams and leagues).
  await Worldgen.recordMatchResults();

  // Advance day.
  let profile = await DatabaseClient.prisma.profile.findFirst();
  profile = await DatabaseClient.prisma.profile.update({
    where: { id: profile.id },
    data: { date: addDays(profile.date, 1).toISOString() },
  });

  // Push profile update to renderer.
  const mainWindow = WindowManager.get(Constants.WindowIdentifier.Main, false)?.webContents;
  if (mainWindow) mainWindow.send(Constants.IPCRoute.PROFILES_CURRENT, profile);

  return Promise.resolve();
}

/**
 * Engine middleware: end of loop cycle.
 *
 *
 */
async function onLoopFinish() {
  Engine.Runtime.Instance.log.info(
    "Running %s middleware...",
    Engine.MiddlewareType.LOOP_FINISH.toUpperCase()
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
    Worldgen.onCompetitionStart
  );
  Engine.Runtime.Instance.register(Constants.CalendarEntry.EMAIL_SEND, Worldgen.onEmailSend);
  Engine.Runtime.Instance.register(Constants.CalendarEntry.MATCHDAY_NPC, Worldgen.onMatchdayNPC);

  Engine.Runtime.Instance.register(Constants.CalendarEntry.MATCHDAY_USER, async (entry) => {
    const profile = await DatabaseClient.prisma.profile.findFirst();

    // Skip user matchdays entirely when teamless.
    if (!profile.teamId) return;

    return Worldgen.onMatchdayUser(entry as Calendar);
  });

  Engine.Runtime.Instance.register(Constants.CalendarEntry.SEASON_START, Worldgen.onSeasonStart);
  Engine.Runtime.Instance.register(
    Constants.CalendarEntry.SPONSORSHIP_PARSE,
    Worldgen.onSponsorshipOffer
  );
  Engine.Runtime.Instance.register(
    Constants.CalendarEntry.SPONSORSHIP_PAYMENT,
    Worldgen.onSponsorshipPayment
  );
  Engine.Runtime.Instance.register(
    Constants.CalendarEntry.PLAYER_CONTRACT_EXPIRE,
    Worldgen.onPlayerContractExpire
  );

  // IPC: create calendar entry.
  ipcMain.handle(Constants.IPCRoute.CALENDAR_CREATE, (_, data: Prisma.CalendarCreateInput) =>
    DatabaseClient.prisma.calendar.create({ data })
  );

  // IPC: find calendar entry.
  ipcMain.handle(Constants.IPCRoute.CALENDAR_FIND, (_, query: Prisma.CalendarFindFirstArgs) =>
    DatabaseClient.prisma.calendar.findFirst(query)
  );

  // IPC: start calendar simulation.
  ipcMain.handle(Constants.IPCRoute.CALENDAR_START, async (_, max?: number) => {
    const profile = await DatabaseClient.prisma.profile.findFirst();
    const settings = Util.loadSettings(profile.settings);

    // First-run logic for competitions remains unchanged.
    if (!(await DatabaseClient.prisma.competition.count())) {
      const circuit = await DatabaseClient.prisma.league.findFirst({
        where: { slug: Constants.LeagueSlug.ESPORTS_CIRCUIT },
      });

      Engine.Runtime.Instance.log.debug(
        "First run detected. Skipping %d days...",
        circuit.startOffsetDays
      );

      return Engine.Runtime.Instance.start(circuit.startOffsetDays + 1, true);
    }

    // Disable window actions during calendar advance.
    WindowManager.get(Constants.WindowIdentifier.Main).on("close", disableClose);
    WindowManager.disableMenu(Constants.WindowIdentifier.Main);

    let days = max;
    if (!max) {
      const from = profile.date;
      const to = add(from, { [settings.calendar.unit]: settings.calendar.maxIterations });
      days = differenceInDays(to, from);
    }

    await Engine.Runtime.Instance.start(days, settings.calendar.ignoreExits);

    WindowManager.get(Constants.WindowIdentifier.Main).off("close", disableClose);
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
      "Received request to sim for match(payload=%s) on %s",
      entry.payload,
      format(entry.date, Constants.Application.CALENDAR_DATE_FORMAT)
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
          })
        )
      );
    }

    return match;
  });

}
