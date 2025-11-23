import { DatabaseClient } from "@liga/backend/lib";
import { Constants, Util } from "@liga/shared";

type MatchPlayerLite = {
  id: number;
  name: string;
  steamId?: string | null;
  serverId?: string | null;
};

export async function saveFaceitResult(
  gameServer: any,
  dbMatchId: number,
  profile: any
) {
  const prisma = DatabaseClient.prisma;

  const settings = Util.loadSettings(profile.settings);
  const maxRounds = settings.matchRules.maxRounds;
  const maxRoundsOT = settings.matchRules.maxRoundsOvertime;

  // ---------------------------------------------------------------------------
  // SCORE CALCULATION
  // ---------------------------------------------------------------------------

  const roundEvents = (gameServer.scorebotEvents || []).filter(
    (e: any) => e.type === "roundover"
  );

  let scoreA = 0;
  let scoreB = 0;
  let half = 0;
  let rounds = 1;

  const computeWinner = (eventWinner: number, half: number, rounds: number) => {
    let invert = half % 2 === 1;

    if (rounds > maxRounds) {
      const roundsOT = rounds - maxRounds;
      const otIndex = Math.ceil(roundsOT / maxRoundsOT);

      if (otIndex % 2 === 1) invert = half % 2 === 0;

      const otRound = ((roundsOT - 1) % maxRoundsOT) + 1;
      if (otRound === maxRoundsOT / 2 || otRound === maxRoundsOT) half++;
    } else {
      if (rounds === maxRounds / 2 || rounds === maxRounds) half++;
    }

    return invert ? 1 - eventWinner : eventWinner;
  };

  for (const ev of roundEvents) {
    const w = ev.payload?.winner;
    if (typeof w !== "number") continue;

    const mapped = computeWinner(w, half, rounds);

    if (mapped === 0) scoreA++;
    else if (mapped === 1) scoreB++;

    if (rounds > maxRounds) {
      const roundsOT = rounds - maxRounds;
      const otRound = ((roundsOT - 1) % maxRoundsOT) + 1;
      if (otRound === maxRoundsOT / 2 || otRound === maxRoundsOT)
        half++;
    } else {
      if (rounds === maxRounds / 2 || rounds === maxRounds) half++;
    }

    rounds++;
  }

  const isWinA = scoreA > scoreB;

  // ---------------------------------------------------------------------------
  // PLAYER LIST
  // ---------------------------------------------------------------------------

  let teamA: MatchPlayerLite[] =
    (gameServer?.competitors?.[0]?.team?.players ?? []).map((p: any) => ({
      id: p.id,
      name: p.name,
      steamId: p.steamId ?? null,
      serverId: p.serverId ?? null,
    }));

  let teamB: MatchPlayerLite[] =
    (gameServer?.competitors?.[1]?.team?.players ?? []).map((p: any) => ({
      id: p.id,
      name: p.name,
      steamId: p.steamId ?? null,
      serverId: p.serverId ?? null,
    }));

  const userPlayer: MatchPlayerLite = {
    id: profile.player.id,
    name: profile.player.name,
    steamId: profile.player.steamId ?? null,
    serverId: null,
  };

  if (!teamA.find((p) => p.id === userPlayer.id)) teamA.push(userPlayer);

  let players = [...teamA, ...teamB];
  if (!players.find((p) => p.id === userPlayer.id)) players.push(userPlayer);

  // ---------------------------------------------------------------------------
  // PLAYER ID MAPPING
  // ---------------------------------------------------------------------------

  const resolvePlayerId = (
    name: string | null,
    steamId: string | null,
    serverId: string | null
  ): number | null => {
    if (steamId && steamId !== "BOT") {
      const bySteam = players.find((p) => p.steamId === steamId);
      if (bySteam) return bySteam.id;
    }
    if (serverId) {
      const byServer = players.find((p) => p.serverId === serverId);
      if (byServer) return byServer.id;
    }
    if (name) {
      const byName = players.find((p) => p.name === name);
      if (byName) return byName.id;
    }
    return null;
  };

  // ---------------------------------------------------------------------------
  // EVENT MAPPING
  // ---------------------------------------------------------------------------

  const events = Array.isArray(gameServer.scorebotEvents)
    ? gameServer.scorebotEvents
    : [];

  const eventsToCreate = events.map((event: any) => {
    const attacker = event.payload.attacker ?? null;
    const victim = event.payload.victim ?? null;
    const assist = event.payload.assist ?? null;

    const attackerId = resolvePlayerId(
      attacker?.name ?? null,
      attacker?.steamId ?? null,
      attacker?.serverId ?? null
    );

    const victimId = resolvePlayerId(
      victim?.name ?? null,
      victim?.steamId ?? null,
      victim?.serverId ?? null
    );

    const assistId = resolvePlayerId(
      assist?.name ?? null,
      assist?.steamId ?? null,
      assist?.serverId ?? null
    );

    return {
      payload: JSON.stringify({
        type: event.type,
        payload: {
          ...event.payload,
          timestamp: event.payload.timestamp ?? new Date(),
        },
      }),
      timestamp: event.payload.timestamp ?? new Date(),
      half: 0,
      attackerId,
      victimId,
      assistId,
      headshot: event.payload.headshot ?? false,
      weapon: event.payload.weapon ?? null,
    };
  });

  // ---------------------------------------------------------------------------
  // WRITE MATCH DATA
  // ---------------------------------------------------------------------------

  await prisma.match.update({
    where: { id: dbMatchId },
    data: {
      status: Constants.MatchStatus.COMPLETED,

      date: new Date(), // update match finish timestamp

      players: {
        connect: players.map((p) => ({ id: p.id })),
      },

      events: {
        create: eventsToCreate,
      },

      games: {
        updateMany: {
          where: {},
          data: {
            status: Constants.MatchStatus.COMPLETED,
          },
        },
      },

      competitors: {
        updateMany: [
          {
            where: { teamId: 1 },
            data: {
              score: scoreA,
              result:
                scoreA > scoreB
                  ? Constants.MatchResult.WIN
                  : scoreA < scoreB
                    ? Constants.MatchResult.LOSS
                    : Constants.MatchResult.DRAW,
            },
          },
          {
            where: { teamId: 2 },
            data: {
              score: scoreB,
              result:
                scoreB > scoreA
                  ? Constants.MatchResult.WIN
                  : scoreB < scoreA
                    ? Constants.MatchResult.LOSS
                    : Constants.MatchResult.DRAW,
            },
          },
        ],
      },
    },
  });

  // ---------------------------------------------------------------------------
  // APPLY FACEIT ELO
  // ---------------------------------------------------------------------------

  const dbMatch = await prisma.match.findFirst({ where: { id: dbMatchId } });

  let eloGain = 0;
  let eloLoss = 0;

  try {
    const payload = JSON.parse(dbMatch?.payload ?? "{}");
    eloGain = payload.eloGain ?? 0;
    eloLoss = payload.eloLoss ?? 0;
  } catch { }

  const deltaA = isWinA ? eloGain : -eloLoss;
  const deltaB = -deltaA;

  await prisma.profile.update({
    where: { id: profile.id },
    data: { faceitElo: profile.faceitElo + deltaA },
  });

  // ⭐ Update teammates' Elo
  await Promise.all(
    teamA
      .filter((p) => p.id !== profile.player.id)
      .map((bot) =>
        prisma.player.update({
          where: { id: bot.id },
          data: { elo: { increment: deltaA } },
        })
      )
  );

  // ⭐ Update opponents' Elo
  await Promise.all(
    teamB.map((bot) =>
      prisma.player.update({
        where: { id: bot.id },
        data: { elo: { increment: deltaB } },
      })
    )
  );

  // ---------------------------------------------------------------------------
  // FINAL FACEIT METADATA
  // ---------------------------------------------------------------------------

  await prisma.match.update({
    where: { id: dbMatchId },
    data: {
      faceitIsWin: isWinA,
      faceitTeammates: JSON.stringify(teamA),
      faceitOpponents: JSON.stringify(teamB),
      faceitRating: null,
      faceitEloDelta: deltaA,
    },
  });

  return true;
}
