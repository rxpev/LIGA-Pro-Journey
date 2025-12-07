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

  const roundEvents = (gameServer.scorebotEvents || []).filter(
    (e: any) => e.type === "roundover"
  );

  const dbMatch = await prisma.match.findFirst({ where: { id: dbMatchId } });
  const payload = dbMatch?.payload ? JSON.parse(dbMatch.payload) : {};
  const sides = payload.sides || {};

  const tTeamId = Number(Object.keys(sides).find((k) => sides[k] === "t"));
  const ctTeamId = Number(Object.keys(sides).find((k) => sides[k] === "ct"));

  let scoreA = 0;
  let scoreB = 0;

  let half = 0;
  let roundNumber = 1;

  const flipWinner = (w: number) => (w === 0 ? 1 : 0);

  for (const ev of roundEvents) {
    let w = ev.payload?.winner;
    if (typeof w !== "number") continue;

    if (roundNumber > maxRounds) {
      const roundsOT = roundNumber - maxRounds;

      const overtimeCount = Math.ceil(roundsOT / maxRoundsOT);
      const otRound = ((roundsOT - 1) % maxRoundsOT) + 1;
      const isSideFlip =
        otRound === maxRoundsOT / 2 || otRound === maxRoundsOT;

      if (half % 2 === 1) {
        w = flipWinner(w);
      }

      // OT segment flip (LIGA logic)
      if (overtimeCount % 2 === 1) {
        w = flipWinner(w);
      }

      if (isSideFlip) {
        half++;
      }
    } else {
      const isSideFlip =
        roundNumber === maxRounds / 2 || roundNumber === maxRounds;

      if (half % 2 === 1) {
        w = flipWinner(w);
      }

      if (isSideFlip) {
        half++;
      }
    }

    const winnerTeamId = w === 0 ? tTeamId : ctTeamId;

    if (winnerTeamId === 1) scoreA++;
    else if (winnerTeamId === 2) scoreB++;

    roundNumber++;
  }

  const userId = profile.player.id;
  const isUserTeamA = (payload.teamA || []).some((p: any) => p.id === userId);
  const playerTeamId = isUserTeamA ? 1 : 2;

  const playerWin =
    (playerTeamId === 1 && scoreA > scoreB) ||
    (playerTeamId === 2 && scoreB > scoreA);

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

  const events = Array.isArray(gameServer.scorebotEvents)
    ? gameServer.scorebotEvents
    : [];

  const eventsToCreate = events.map((event: any) => {
    const attacker = event.payload.attacker ?? null;
    const victim = event.payload.victim ?? null;
    const assist = event.payload.assist ?? null;

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
      attackerId: resolvePlayerId(
        attacker?.name ?? null,
        attacker?.steamId ?? null,
        attacker?.serverId ?? null
      ),
      victimId: resolvePlayerId(
        victim?.name ?? null,
        victim?.steamId ?? null,
        victim?.serverId ?? null
      ),
      assistId: resolvePlayerId(
        assist?.name ?? null,
        assist?.steamId ?? null,
        assist?.serverId ?? null
      ),
      headshot: event.payload.headshot ?? false,
      weapon: event.payload.weapon ?? null,
    };
  });

  await prisma.match.update({
    where: { id: dbMatchId },
    data: {
      status: Constants.MatchStatus.COMPLETED,
      date: new Date(),
      players: { connect: players.map((p) => ({ id: p.id })) },
      events: { create: eventsToCreate },
      games: {
        updateMany: {
          where: {},
          data: { status: Constants.MatchStatus.COMPLETED },
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

  let eloGain = 0;
  let eloLoss = 0;

  try {
    const p = JSON.parse(dbMatch?.payload ?? "{}");
    eloGain = p.eloGain ?? 0;
    eloLoss = p.eloLoss ?? 0;
  } catch { }

  const delta = playerWin ? eloGain : -eloLoss;

  await prisma.profile.update({
    where: { id: profile.id },
    data: { faceitElo: profile.faceitElo + delta },
  });

  await Promise.all(
    teamA
      .filter((p) => p.id !== profile.player.id)
      .map((bot) =>
        prisma.player.update({
          where: { id: bot.id },
          data: { elo: { increment: delta } },
        })
      )
  );

  await Promise.all(
    teamB.map((bot) =>
      prisma.player.update({
        where: { id: bot.id },
        data: { elo: { increment: -delta } },
      })
    )
  );

  await prisma.match.update({
    where: { id: dbMatchId },
    data: {
      faceitIsWin: playerWin,
      faceitTeammates: JSON.stringify(teamA),
      faceitOpponents: JSON.stringify(teamB),
      faceitRating: null,
      faceitEloDelta: delta,
    },
  });

  return true;
}
