import { ipcMain } from "electron";
import { DatabaseClient } from "@liga/backend/lib";
import log from "electron-log";
import { levelFromElo } from "@liga/backend/lib/levels";
import { FaceitMatchmaker } from "@liga/backend/lib/matchmaker";
import { Server as Game } from "@liga/backend/lib/game";
import { Constants } from "@liga/shared";
import { saveFaceitResult } from "@liga/backend/lib/save-result";
import { Eagers } from "@liga/shared";
import { sample } from "lodash";

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

// ------------------------------------------------------
// Build minimal pseudo-match for Game(Server)
// ------------------------------------------------------
function buildFaceitPseudoMatch(profile: any, room: MatchRoom, dbMatchId: number) {
  const teamA = {
    id: 1,
    name: "FACEIT TEAM A",
    slug: "faceit-a",
    countryId: profile.player?.countryId ?? 0,
    country: profile.player?.country ?? { code: "EU" },
    players: room.teamA,
    blazon: "",
    tier: 1,
  };

  const teamB = {
    id: 2,
    name: "FACEIT TEAM B",
    slug: "faceit-b",
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

  async function computeLifetimeStats(
    profileId: number,
    playerId: number,
    limit?: number
  ) {
    const prisma = DatabaseClient.prisma;

    const matches = await prisma.match.findMany({
      where: {
        profileId,
        matchType: "FACEIT_PUG",
        status: Constants.MatchStatus.COMPLETED,
      },
      include: { events: true },
      orderBy: { date: "desc" },
      take: limit ?? undefined,
    });

    const matchIds = matches.map((m) => m.id);

    const events = await prisma.matchEvent.findMany({
      where: { matchId: { in: matchIds } },
    });

    let kills = 0;
    let deaths = 0;
    let assists = 0;
    let headshots = 0;

    for (const e of events) {
      if (e.attackerId === playerId) {
        kills++;
        if (e.headshot) headshots++;
      }
      if (e.victimId === playerId) {
        deaths++;
      }
      if (e.assistId === playerId) {
        assists++;
      }
    }

    const wins = matches.filter((m) => m.faceitIsWin === true).length;
    const losses = matches.length - wins;

    return {
      matchesPlayed: matches.length,
      wins,
      losses,
      winRate: matches.length ? (wins / matches.length) * 100 : 0,
      kills,
      deaths,
      assists,
      kdRatio: deaths === 0 ? kills : kills / deaths,
      hsPercent: kills ? (headshots / kills) * 100 : 0,
    };
  }


  async function getRecentMatches(profileId: number) {
    const prisma = DatabaseClient.prisma;

    const matches = await prisma.match.findMany({
      where: {
        profileId,
        matchType: "FACEIT_PUG",
        status: 3,
      },
      include: { games: true },
      orderBy: { date: "desc" },
      take: 15,
    });

    return matches.map((m) => ({
      id: m.id,
      map: m.games?.[0]?.map ?? "Unknown",
      yourTeamWon: m.faceitIsWin ?? null,
      eloDelta: m.faceitEloDelta ?? null,
      date: m.date,
    }));
  }

  // ------------------------------------------------------
  // GET FACEIT PROFILE
  // ------------------------------------------------------
  ipcMain.handle("faceit:getProfile", async () => {
    try {
      const prisma = await DatabaseClient.connect();
      const profile = await prisma.profile.findFirst({
        include: { player: true },
      });

      if (!profile) throw new Error("No active profile found");

      const recent = await getRecentMatches(profile.id);
      const lifetime = await computeLifetimeStats(profile.id, profile.playerId);

      return {
        faceitElo: profile.faceitElo,
        faceitLevel: levelFromElo(profile.faceitElo),

        // ⭐ added
        recent,
        lifetime,
      };
    } catch (err) {
      log.error(err);
      throw err;
    }
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
  ipcMain.handle("faceit:queuePug", async () => {
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

      const user = {
        id: profile.player.id,
        name: profile.player.name,
        elo: profile.faceitElo,
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

      // MAP VETO & SETTINGS
      const settings = profile.settings
        ? JSON.parse(profile.settings)
        : Constants.Settings;

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

      // CREATE DB MATCH
      const dbMatch = await prisma.match.create({
        data: {
          matchType: "FACEIT_PUG",
          payload: JSON.stringify(room),
          profileId: profile.id,
          status: Constants.MatchStatus.READY,

          competitors: {
            create: [
              { teamId: 1, seed: 0, score: 0, result: null },
              { teamId: 2, seed: 1, score: 0, result: null },
            ],
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
                    { teamId: 2, seed: 1, score: 0, result: null },
                  ],
                },
              },
            ],
          },
        },
      });

      const realMatchId = dbMatch.id;

      // BUILD PSEUDO MATCH
      const match = buildFaceitPseudoMatch(profile, room, realMatchId);
      match.games[0].map = selectedMap;

      // RUN MATCH
      const game = new Game(profile, match, null, false);
      await game.start();

      // SAVE RESULT
      await saveFaceitResult(game, realMatchId, profile);

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

    log.info(
      `FACEIT:getMatchData id=${numericId} -> match?=${!!match}, status=${match?.status}, ` +
      `players=${match?.players?.length ?? 0}, events=${match?.events?.length ?? 0}`
    );

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
