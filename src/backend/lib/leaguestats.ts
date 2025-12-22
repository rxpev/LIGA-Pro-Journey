import DatabaseClient from "./database-client";
import { Constants } from "@liga/shared";

/**
 * Computes league/tournament stats for a player based on match events.
 *
 * Key filters to avoid mixing FACEIT:
 * - match.status === COMPLETED
 * - match.competitionId != null
 * - match.matchType !== "FACEIT_PUG" (or matchType is null)
 * - match involves the provided teamId
 */
export async function computeLeagueLifetimeStats(
  teamId: number,
  playerId: number,
  limit?: number,
) {
  const prisma = DatabaseClient.prisma;

  if (!teamId || !playerId) {
    return {
      matchesPlayed: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      winRate: 0,
      kills: 0,
      deaths: 0,
      assists: 0,
      kdRatio: 0,
      hsPercent: 0,
    };
  }

  const matches = await prisma.match.findMany({
    where: {
      status: Constants.MatchStatus.COMPLETED,
      competitionId: { not: null },
      competitors: {
        some: { teamId },
      },
    },
    include: {
      competitors: true,
    },
    orderBy: { date: "desc" },
    take: limit ?? undefined,
  });

  if (!matches.length) {
    return {
      matchesPlayed: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      winRate: 0,
      kills: 0,
      deaths: 0,
      assists: 0,
      kdRatio: 0,
      hsPercent: 0,
    };
  }

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
    if (e.victimId === playerId) deaths++;
    if (e.assistId === playerId) assists++;
  }

  let wins = 0;
  let losses = 0;
  let draws = 0;

  for (const m of matches) {
    const me = m.competitors.find((c) => c.teamId === teamId);
    if (!me) continue;

    if (me.result === Constants.MatchResult.WIN) wins++;
    else if (me.result === Constants.MatchResult.LOSS) losses++;
    else if (me.result === Constants.MatchResult.DRAW) draws++;
  }

  const matchesPlayed = matches.length;
  const winRate = matchesPlayed
    ? ((wins + draws * 0.5) / matchesPlayed) * 100
    : 0;

  return {
    matchesPlayed,
    wins,
    losses,
    draws,
    winRate,
    kills,
    deaths,
    assists,
    kdRatio: deaths === 0 ? kills : kills / deaths,
    hsPercent: kills ? (headshots / kills) * 100 : 0,
  };
}

/**
 * Recent league matches list for UI/debugging.
 */
export async function getRecentLeagueMatches(teamId: number, take = 15) {
  const prisma = DatabaseClient.prisma;

  if (!teamId) return [];

  const matches = await prisma.match.findMany({
    where: {
      status: Constants.MatchStatus.COMPLETED,
      competitionId: { not: null },
      competitors: { some: { teamId } },
    },
    include: {
      games: true,
      competitors: { include: { team: true } },
      competition: {
        include: {
          tier: true,
          federation: true,
        },
      },
    },
    orderBy: { date: "desc" },
    take,
  });

  return matches.map((m) => {
    const me = m.competitors.find((c) => c.teamId === teamId);
    const opp = m.competitors.find((c) => c.teamId !== teamId);

    return {
      id: m.id,
      date: m.date,
      map: m.games?.[0]?.map ?? "Unknown",
      result: me?.result ?? null,
      yourScore: me?.score ?? null,
      opponent: opp?.team?.name ?? "Unknown",
      opponentScore: opp?.score ?? null,
      tierSlug: m.competition?.tier?.slug ?? null,
      federationSlug: m.competition?.federation?.slug ?? null,
    };
  });
}
