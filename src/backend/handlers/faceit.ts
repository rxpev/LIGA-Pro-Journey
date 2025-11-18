import { ipcMain } from "electron";
import { DatabaseClient } from "@liga/backend/lib";
import log from "electron-log";
import { levelFromElo } from "@liga/backend/lib/levels";
import { FaceitMatchmaker } from "@liga/backend/lib/matchmaker";
import { Server as Game } from "@liga/backend/lib/game";
import { Constants } from "@liga/shared";
import { saveFaceitResult } from "@liga/backend/lib/save-result";

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
  matchId: string; // temporary string until stored
  teamA: MatchPlayer[];
  teamB: MatchPlayer[];
  expectedWinA: number;
  expectedWinB: number;
  eloGain: number;
  eloLoss: number;
};

// ------------------------------------------------------
// Build minimal pseudo-match for Game(Server)
// ------------------------------------------------------
function buildFaceitPseudoMatch(profile: any, room: MatchRoom, dbMatchId: number) {
  // Helper teams
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

  // ------------------------------------------------------
  // GET FACEIT PROFILE
  // ------------------------------------------------------
  ipcMain.handle("faceit:getProfile", async () => {
    try {
      const prisma = await DatabaseClient.connect();
      const profile = await prisma.profile.findFirst({ include: { player: true } });

      if (!profile) throw new Error("No active profile found");

      return {
        faceitElo: profile.faceitElo,
        faceitLevel: levelFromElo(profile.faceitElo),
        recent: [],
      };
    } catch (err) {
      log.error(err);
      throw err;
    }
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

      // 1) Create real DB match row
      const dbMatch = await prisma.match.create({
        data: {
          matchType: "FACEIT_PUG",
          payload: JSON.stringify(room),
          status: Constants.MatchStatus.READY,
          profileId: profile.id,
        },
      });

      const realMatchId = dbMatch.id;

      // 2) Build pseudo-match with REAL ID
      const match = buildFaceitPseudoMatch(profile, room, realMatchId);

      // 3) Start the game and wait until GAME_OVER
      const game = new Game(profile, match, null, false);
      await game.start();            // <- waits for scorebot GAME_OVER

      // 4) Now result + events are available → persist them
      await saveFaceitResult(game, realMatchId, profile);

      // 5) Reply to renderer (no more "reply was never sent")
      return { ok: true, matchId: realMatchId };
    } catch (err) {
      log.error(err);
      throw err;
    }
  });


  // ------------------------------------------------------
  // GET MATCH DATA (used by scoreboard)
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
      },
    });

    log.info(
      `FACEIT:getMatchData id=${numericId} -> match?=${!!match}, status=${match?.status}, ` +
      `players=${match?.players?.length ?? 0}, events=${match?.events?.length ?? 0}`,
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
