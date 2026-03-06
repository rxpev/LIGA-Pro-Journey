import { ipcMain } from "electron";
import { DatabaseClient, Worldgen } from "@liga/backend/lib";
import log from "electron-log";
import { levelFromElo } from "@liga/backend/lib/levels";
import { FaceitMatchmaker } from "@liga/backend/lib/matchmaker";
import { Server as Game } from "@liga/backend/lib/game";
import { Constants } from "@liga/shared";
import { saveFaceitResult } from "@liga/backend/lib/save-result";
import { computeLifetimeStats, getRecentMatches } from "@liga/backend/lib/faceitstats";
import { Eagers } from "@liga/shared";
import { sample } from "lodash";
import { Engine } from "@liga/backend/lib";
import { Util } from "@liga/shared";

// ------------------------------
// Types sent to frontend
// ------------------------------
type MatchPlayer = {
  id: number;
  name: string;
  elo: number;
  level: number;
  role: string | null;
  personality: string | null;
  userControlled: boolean;
  countryId: number;
  teamId: number | null;
  queueId?: string;
  queueType?: "COUNTRY" | "TEAM" | "BOTH";
};

export type MatchRoom = {
  matchId: string;
  teamA: MatchPlayer[];
  teamB: MatchPlayer[];
  expectedWinA: number;
  expectedWinB: number;
  eloGain: number;
  eloLoss: number;
  selectedMap?: string;
};

function getLocalDayRange(d: Date) {
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  return { start, end };
}

async function getFaceitDailyState(prisma: any, profile: any) {
  const d = profile.date instanceof Date ? profile.date : new Date(profile.date);
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  // Pull matchday entries for today
  const matchdayEntries = profile.teamId
    ? await prisma.calendar.findMany({
      where: {
        date: { gte: start, lt: end },
        type: Constants.CalendarEntry.MATCHDAY_USER,
      },
      select: { id: true, payload: true },
    })
    : [];
  const matchIds = matchdayEntries
    .map((e: any) => Number(e.payload))
    .filter((n: number) => Number.isFinite(n) && n > 0);

  // Is any matchday match still unplayed?
  const hasPendingUserMatchday =
    matchIds.length > 0 &&
    (await prisma.match.count({
      where: {
        id: { in: matchIds },
        status: { not: Constants.MatchStatus.COMPLETED },
      },
    })) > 0;
  const playedToday = await prisma.match.count({
    where: {
      profileId: profile.id,
      matchType: "FACEIT_PUG",
      date: { gte: start, lt: end },
      status: Constants.MatchStatus.COMPLETED,
    },
  });
  const maxToday = hasPendingUserMatchday ? 2 : 3;
  return {
    inGameDateIso: start.toISOString(),
    hasPendingUserMatchday,
    playedToday,
    maxToday,
  };
}

async function advanceOneDayFromFaceit(prisma: any, profileId: number) {
  const profile = await prisma.profile.findFirst({ where: { id: profileId } });
  if (!profile) return;
  const settings = Util.loadSettings(profile.settings);
  await Engine.Runtime.Instance.start(1, settings.calendar.ignoreExits);
}

async function getFaceitLeaderboard(
  prisma: any,
  baseProfile: any,
  options?: {
    federationId?: number;
    countryCode?: string;
    limit?: number;
  }
) {
  const where: any = {};

  if (options?.federationId != null) {
    where.country = {
      continent: {
        federationId: options.federationId,
      },
    };
  }

  if (options?.countryCode) {
    where.country = {
      ...(where.country || {}),
      code: options.countryCode.toUpperCase(),
    };
  }

  const players = await prisma.player.findMany({
    where,
    include: {
      country: {
        include: {
          continent: {
            include: {
              federation: true,
            },
          },
        },
      },
    },
  });

  const rankedEntries = players
    .map((player: any) => {
      const playerElo =
        player.id === baseProfile.playerId
          ? baseProfile.faceitElo
          : player.elo;

      return {
        playerId: player.id,
        nickname: player.name || "Unknown",
        countryCode: player.country?.code?.toLowerCase() || null,
        countryName: player.country?.name || null,
        federationSlug: player.country?.continent?.federation?.slug || null,
        faceitElo: playerElo,
        faceitLevel: levelFromElo(playerElo),
      };
    })
    .sort((a: any, b: any) => b.faceitElo - a.faceitElo);

  const limited = typeof options?.limit === "number" ? rankedEntries.slice(0, options.limit) : rankedEntries;

  return limited.map((entry: any, index: number) => ({
    rank: index + 1,
    ...entry,
  }));
}

// ------------------------------------------------------
// Build minimal pseudo-match for Game(Server)
// ------------------------------------------------------
function getFaceitTeamName(team: MatchPlayer[], fallback: string): string {
  if (!team || team.length === 0) return fallback;
  return `Team_${team[0].name}`;
}
function buildFaceitPseudoMatch(profile: any, room: MatchRoom, dbMatchId: number) {
  const teamAName = getFaceitTeamName(room.teamA, "Team_A");
  const teamBName = getFaceitTeamName(room.teamB, "Team_B");

  const teamA = {
    id: 1,
    name: teamAName,
    slug: teamAName.toLowerCase().replace(/\s+/g, "-"),
    countryId: profile.player?.countryId ?? 0,
    country: profile.player?.country ?? { code: "EU" },
    players: room.teamA,
    blazon: "",
    tier: 1,
  };

  const teamB = {
    id: 2,
    name: teamBName,
    slug: teamBName.toLowerCase().replace(/\s+/g, "-"),
    countryId: profile.player?.countryId ?? 0,
    country: profile.player?.country ?? { code: "EU" },
    players: room.teamB,
    blazon: "",
    tier: 1,
  };

  return {
    isFaceit: true,
    faceitRoom: room,
    id: dbMatchId,

    round: 1,
    totalRounds: 1,
    status: Constants.MatchStatus.READY,

    competition: {
      id: 0,
      name: "FACEIT",
      slug: "faceit",
      federation: { id: 0, name: "FACEIT", slug: "faceit" },
      tier: {
        id: 0,
        name: "FACEIT",
        slug: "faceit",
        groupSize: 0,
        league: { id: 0, name: "FACEIT", slug: "faceit" },
      },
      competitors: [
        { id: 1, teamId: 1, team: teamA },
        { id: 2, teamId: 2, team: teamB },
      ],
    },

    competitors: [
      { id: 1, teamId: 1, team: teamA },
      { id: 2, teamId: 2, team: teamB },
    ],

    games: [
      {
        id: 0,
        matchId: dbMatchId,
        map: null,
        status: Constants.MatchStatus.READY,

        teams: [
          {
            id: 1,
            teamId: 1,
            score: 0,
            result: null,
          },
          {
            id: 2,
            teamId: 2,
            score: 0,
            result: null,
          },
        ],
      },
    ],

    _count: { events: 0 },
  } as any;
}


export default function registerFaceitHandlers() {

  // ------------------------------------------------------
  // GET FACEIT PROFILE
  // ------------------------------------------------------
  ipcMain.handle("faceit:getProfile", async () => {
    try {
      const prisma = await DatabaseClient.connect();
      const profile = await prisma.profile.findFirst();

      if (!profile) throw new Error("No active profile found");

      const fullPlayer = profile.playerId
        ? await prisma.player.findFirst({
          where: { id: profile.playerId },
          include: {
            country: {
              include: {
                continent: true,
              },
            },
          },
        })
        : null;

      const recent = await getRecentMatches(profile.id);
      const lifetime = await computeLifetimeStats(profile.id, profile.playerId);
      const daily = await getFaceitDailyState(prisma, profile);
      const leaderboard = fullPlayer
        ? await getFaceitLeaderboard(prisma, profile, {
          federationId: fullPlayer?.country?.continent?.federationId,
          limit: 10,
        })
        : [];
      return {
        faceitElo: profile.faceitElo,
        faceitLevel: levelFromElo(profile.faceitElo),
        recent,
        lifetime,
        leaderboard,

        daily: {
          playedToday: daily.playedToday,
          maxToday: daily.maxToday,
          hasPendingUserMatchday: daily.hasPendingUserMatchday,
          date: daily.inGameDateIso,
        },
      };
    } catch (err) {
      log.error(err);
      throw err;
    }
  });


  ipcMain.handle("faceit:getLeaderboard", async (_event, args?: {
    page?: number;
    perPage?: number;
    region?: "ALL" | "EUROPE" | "AMERICAS" | "ASIA" | "OCEANIA";
    countryCode?: string;
  }) => {
    const prisma = await DatabaseClient.connect();
    const profile = await prisma.profile.findFirst();
    if (!profile) throw new Error("No active profile found");

    const regionToFederationSlug: Record<string, string | null> = {
      ALL: null,
      EUROPE: Constants.FederationSlug.ESPORTS_EUROPA,
      AMERICAS: Constants.FederationSlug.ESPORTS_AMERICAS,
      ASIA: Constants.FederationSlug.ESPORTS_ASIA,
      OCEANIA: Constants.FederationSlug.ESPORTS_OCE,
    };

    const rawRegion = String(args?.region || "ALL").toUpperCase();
    const region = Object.keys(regionToFederationSlug).includes(rawRegion) ? rawRegion : "ALL";
    const federationSlug = regionToFederationSlug[region];

    let federationId: number | undefined;
    if (federationSlug) {
      const federation = await prisma.federation.findFirst({ where: { slug: federationSlug } });
      federationId = federation?.id;
    }

    const countryCode = args?.countryCode ? String(args.countryCode).toUpperCase() : undefined;
    const page = Math.max(1, Math.floor(Number(args?.page) || 1));
    const perPage = Math.max(1, Math.floor(Number(args?.perPage) || 50));

    const regionEntries = await getFaceitLeaderboard(prisma, profile, {
      federationId,
    });

    const allEntries = countryCode
      ? regionEntries.filter((entry: any) => entry.countryCode?.toUpperCase() === countryCode)
      : regionEntries;

    const countriesByCode = new Map<string, string>();
    regionEntries.forEach((entry: any) => {
      if (entry.countryCode) {
        countriesByCode.set(entry.countryCode.toUpperCase(), entry.countryName || entry.countryCode.toUpperCase());
      }
    });

    const total = allEntries.length;
    const totalPages = total === 0 ? 0 : Math.ceil(total / perPage);
    const offset = (page - 1) * perPage;

    return {
      entries: allEntries.slice(offset, offset + perPage),
      page,
      perPage,
      total,
      totalPages,
      region,
      countryCode: countryCode || null,
      availableCountries: Array.from(countriesByCode.entries())
        .map(([code, name]) => ({ code, name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  });

  // ------------------------------------------------------
  // GET RECENT MATCHES
  // ------------------------------------------------------
  ipcMain.handle("faceit:getRecentMatches", async () => {
    const prisma = await DatabaseClient.connect();
    const profile = await prisma.profile.findFirst({ include: { player: true } });
    if (!profile) throw new Error("No active profile");
    return getRecentMatches(profile.id);
  });

  // ------------------------------------------------------
  // GET LIFETIME STATISTICS
  // ------------------------------------------------------
  ipcMain.handle("faceit:getLifetimeStats", async () => {
    const prisma = await DatabaseClient.connect();
    const profile = await prisma.profile.findFirst({ include: { player: true } });
    if (!profile) throw new Error("No active profile");
    return computeLifetimeStats(profile.id, profile.playerId);
  });

  ipcMain.handle("faceit:getLast20Stats", async () => {
    const prisma = await DatabaseClient.connect();
    const profile = await prisma.profile.findFirst({ include: { player: true } });
    if (!profile) throw new Error("No active profile");

    return computeLifetimeStats(profile.id, profile.playerId, 20);
  });

  // ------------------------------------------------------
  // QUEUE PUG
  // ------------------------------------------------------
  ipcMain.handle("faceit:queuePug", async (_, payload?: { queueElo?: number; maxPartyEloDelta?: number }) => {
    try {
      await DatabaseClient.connect();
      const prisma = DatabaseClient.prisma;

      const profile = await prisma.profile.findFirst({
        include: {
          player: {
            include: {
              country: {
                include: {
                  continent: { include: { federation: true } },
                },
              },
            },
          },
        },
      });

      if (!profile) throw new Error("No active profile found");

      const daily = await getFaceitDailyState(prisma, profile);
      if (daily.playedToday >= daily.maxToday) {
        throw new Error(
          daily.hasPendingUserMatchday
            ? "FACEIT_BLOCKED_MATCHDAY_USER_TODAY"
            : "FACEIT_BLOCKED_DAILY_LIMIT"
        );
      }

      const requestedQueueElo = Number(payload?.queueElo);
      const queueElo = Number.isFinite(requestedQueueElo)
        ? Math.max(100, Math.min(5000, Math.round(requestedQueueElo)))
        : undefined;

      const requestedMaxPartyDelta = Number(payload?.maxPartyEloDelta);
      const maxPartyEloDelta = Number.isFinite(requestedMaxPartyDelta)
        ? Math.max(0, Math.min(5000, Math.round(requestedMaxPartyDelta)))
        : undefined;

      const user = {
        id: profile.player.id,
        name: profile.player.name,
        elo: profile.faceitElo,
        queueElo,
        maxPartyEloDelta,
      };

      const room = await FaceitMatchmaker.createMatchRoom(prisma, user);

      return room;
    } catch (err) {
      log.error(err);
      throw err;
    }
  });

  // ------------------------------------------------------
  // START FACEIT MATCH
  // ------------------------------------------------------
  ipcMain.handle("faceit:startMatch", async (_, room: MatchRoom) => {
    try {
      await DatabaseClient.connect();
      const prisma = DatabaseClient.prisma;

      const profile = await prisma.profile.findFirst({
        include: { player: { include: { country: true } } },
      });

      if (!profile) throw new Error("No active profile found");

      const settings = profile.settings
        ? JSON.parse(profile.settings)
        : Constants.Settings;

      const daily = await getFaceitDailyState(prisma, profile);
      if (daily.playedToday >= daily.maxToday) {
        throw new Error(
          daily.hasPendingUserMatchday
            ? "FACEIT_BLOCKED_MATCHDAY_USER_TODAY"
            : "FACEIT_BLOCKED_DAILY_LIMIT"
        );
      }

      const mapPool = await prisma.mapPool.findMany({
        where: {
          gameVersion: { slug: settings.general.game },
        },
        include: Eagers.mapPool.include,
      });

      const selectedMapFromUi = room.selectedMap;

      const selectedMap =
        selectedMapFromUi ||
        (mapPool.length > 0 ? mapPool[0].gameMap.name : "de_inferno");

      settings.matchRules.mapOverride = selectedMap;
      profile.settings = JSON.stringify(settings);

      const dbMatch = await prisma.match.create({
        data: {
          matchType: "FACEIT_PUG",
          payload: JSON.stringify(room),
          profileId: profile.id,
          date: profile.date.toISOString(),
          status: Constants.MatchStatus.READY,
          competitors: {
            create: [
              { teamId: 1, seed: 0, score: 0, result: null },
              { teamId: 2, seed: 1, score: 0, result: null }
            ]
          },
          games: {
            create: [
              {
                num: 1,
                map: selectedMap,
                status: Constants.MatchStatus.READY,
                teams: {
                  create: [
                    { teamId: 1, seed: 0, score: 0, result: null },
                    { teamId: 2, seed: 1, score: 0, result: null }
                  ]
                }
              }
            ]
          }
        }
      });

      const realMatchId = dbMatch.id;

      const match = buildFaceitPseudoMatch(profile, room, realMatchId);
      match.games[0].map = selectedMap;

      const game = new Game(profile, match, null, false);
      await game.start();

      const sides = game.getFaceitSides();
      await prisma.match.update({
        where: { id: realMatchId },
        data: {
          payload: JSON.stringify({
            ...room,
            sides,
          }),
        },
      });

      await saveFaceitResult(game, realMatchId, profile);

      if (profile.teamId == null) {
        await Worldgen.sendUserFaceitOffer();
      }

      const dailyAfter = await getFaceitDailyState(prisma, profile);

      if (!dailyAfter.hasPendingUserMatchday && dailyAfter.playedToday === 3) {
        await advanceOneDayFromFaceit(prisma, profile.id);
      }

      return { ok: true, matchId: realMatchId };
    } catch (err) {
      log.error(err);
      throw err;
    }
  });

  // ------------------------------------------------------
  // GET MATCH DATA (scoreboard)
  // ------------------------------------------------------
  ipcMain.handle("faceit:getMatchData", async (_, matchId: number | string) => {
    await DatabaseClient.connect();
    const prisma = DatabaseClient.prisma;

    const numericId = Number(matchId);
    const match = await prisma.match.findFirst({
      where: { id: numericId },
      include: {
        players: true,
        events: true,
        competitors: true,
        games: {
          include: { teams: true },
        },
      },
    });

    if (!match) return { match: null, players: [], events: [] };

    return {
      match,
      players: match.players,
      events: match.events.map((e) => ({
        id: e.id,
        type: JSON.parse(e.payload).type,
        payload: JSON.parse(e.payload).payload,
        attackerId: e.attackerId,
        victimId: e.victimId,
        assistId: e.assistId,
        headshot: e.headshot,
      })),
    };
  });
}
