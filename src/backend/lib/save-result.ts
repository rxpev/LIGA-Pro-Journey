// save-result.ts
import { DatabaseClient } from "@liga/backend/lib";
import { Constants } from "@liga/shared";

type MatchPlayerLite = {
  id: number;
  name: string;
};

/**
 * Saves all FACEIT post-match data after GAME_OVER.
 *
 * Called ONLY after game.start() resolves (so scorebot populated result & events).
 */
export async function saveFaceitResult(
  gameServer: any,
  dbMatchId: number,
  profile: any
) {
  const prisma = DatabaseClient.prisma;

  // ---------------------------------------------------------------------------
  // 1) SAFE SCORE EXTRACTION
  // ---------------------------------------------------------------------------
  let scoreCT = 0;
  let scoreT = 0;

  if (gameServer?.result && Array.isArray(gameServer.result.score)) {
    [scoreCT, scoreT] = gameServer.result.score as [number, number];
  } else {
    gameServer?.log?.warn?.(
      `FACEIT: saveFaceitResult called without gameServer.result. ` +
      `Events=${gameServer?.scorebotEvents?.length ?? 0}`
    );
  }

  // ---------------------------------------------------------------------------
  // 2) EXTRACT PLAYERS FROM COMPETITORS (CONVERT TO LITE STRUCTURE)
  // ---------------------------------------------------------------------------

  let teamA: MatchPlayerLite[] =
    (gameServer?.competitors?.[0]?.team?.players ?? []).map((p: any) => ({
      id: p.id,
      name: p.name,
    }));

  let teamB: MatchPlayerLite[] =
    (gameServer?.competitors?.[1]?.team?.players ?? []).map((p: any) => ({
      id: p.id,
      name: p.name,
    }));

  const userPlayer: MatchPlayerLite = {
    id: profile.player.id,
    name: profile.player.name,
  };

  // Ensure user is in Team A
  if (!teamA.find((p) => p.id === userPlayer.id)) {
    teamA.push(userPlayer);
  }

  // Build final unified player list (no duplicates)
  let players: MatchPlayerLite[] = [...teamA, ...teamB];

  if (!players.find((p) => p.id === userPlayer.id)) {
    players.push(userPlayer);
  }

  // ---------------------------------------------------------------------------
  // 3) EVENT MAPPING (Scorebot → MatchEvent rows)
  // ---------------------------------------------------------------------------

  const events = Array.isArray(gameServer.scorebotEvents)
    ? gameServer.scorebotEvents
    : [];

  const eventsToCreate = events.map((event: any) => {
    const attackerName = event.payload.attacker?.name;
    const victimName = event.payload.victim?.name;
    const assistName = event.payload.assist?.name;

    return {
      payload: JSON.stringify(event),
      timestamp: event.payload.timestamp,
      half: 0, // no halves in FACEIT PUGs

      attackerId: players.find((p) => p.name === attackerName)?.id ?? null,
      victimId: players.find((p) => p.name === victimName)?.id ?? null,
      assistId: players.find((p) => p.name === assistName)?.id ?? null,

      headshot: event.payload.headshot ?? false,
    };
  });

  gameServer?.log?.info?.(
    `FACEIT: Persisting match ${dbMatchId} — events=${eventsToCreate.length}, ` +
    `scoreCT=${scoreCT}, scoreT=${scoreT}`
  );

  // ---------------------------------------------------------------------------
  // 4) UPDATE MATCH IN DATABASE
  // ---------------------------------------------------------------------------
  await prisma.match.update({
    where: { id: dbMatchId },
    data: {
      status: Constants.MatchStatus.COMPLETED,

      // connect all players
      players: {
        connect: players.map((p) => ({ id: p.id })),
      },

      // insert scorebot events
      events: {
        create: eventsToCreate,
      },

      // mark pseudo-game as completed
      games: {
        updateMany: {
          where: {},
          data: { status: Constants.MatchStatus.COMPLETED },
        },
      },

      // update scores (teamId 1 = CT, 2 = T)
      competitors: {
        updateMany: [
          {
            where: { teamId: 1 },
            data: {
              score: scoreCT,
              result:
                scoreCT > scoreT
                  ? Constants.MatchResult.WIN
                  : scoreCT < scoreT
                    ? Constants.MatchResult.LOSS
                    : Constants.MatchResult.DRAW,
            },
          },
          {
            where: { teamId: 2 },
            data: {
              score: scoreT,
              result:
                scoreT > scoreCT
                  ? Constants.MatchResult.WIN
                  : scoreT < scoreCT
                    ? Constants.MatchResult.LOSS
                    : Constants.MatchResult.DRAW,
            },
          },
        ],
      },

      // FACEIT metadata
      faceitIsWin: scoreCT > scoreT,
      faceitTeammates: JSON.stringify(teamA),
      faceitOpponents: JSON.stringify(teamB),
      faceitRating: null,
      faceitEloDelta: 0,
    },
  });

  // ---------------------------------------------------------------------------
  // 5) APPLY FACEIT ELO CHANGES (USER + BOTS)
  // ---------------------------------------------------------------------------

  // Load original match room payload to get eloGain / eloLoss
  const dbMatch = await prisma.match.findFirst({
    where: { id: dbMatchId }
  });

  let eloGain = 0;
  let eloLoss = 0;

  try {
    const payload = JSON.parse(dbMatch?.payload ?? "{}");
    eloGain = payload.eloGain ?? 0;
    eloLoss = payload.eloLoss ?? 0;
  } catch (err) {
    console.error("Failed to parse FACEIT match payload:", err);
  }

  const isWin = scoreCT > scoreT;   // Team A = CT in your system
  const deltaTeamA = isWin ? eloGain : -eloLoss;
  const deltaTeamB = isWin ? -eloLoss : eloGain; // enemies get opposite result

  // ---- Update USER first ----
  const newUserElo = profile.faceitElo + deltaTeamA;
  await prisma.profile.update({
    where: { id: profile.id },
    data: { faceitElo: newUserElo }
  });

  // ---- Update TEAM A bots ----
  await Promise.all(
    teamA
      .filter(p => p.id !== profile.player.id)
      .map(async (bot) => {
        await prisma.player.update({
          where: { id: bot.id },
          data: { elo: { increment: deltaTeamA } }
        });
      })
  );

  // ---- Update TEAM B bots ----
  await Promise.all(
    teamB.map(async (bot) => {
      await prisma.player.update({
        where: { id: bot.id },
        data: { elo: { increment: deltaTeamB } }
      });
    })
  );

  // Optionally store it in match
  await prisma.match.update({
    where: { id: dbMatchId },
    data: {
      faceitEloDelta: deltaTeamA
    }
  });

  return true;
}
