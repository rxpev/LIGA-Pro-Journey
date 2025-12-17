import DatabaseClient from "./database-client";
import { Constants } from "@liga/shared";

export async function computeLifetimeStats(
  profileId: number,
  playerId: number,
  limit?: number,
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
    if (e.victimId === playerId) deaths++;
    if (e.assistId === playerId) assists++;
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

export async function getRecentMatches(profileId: number) {
  const prisma = DatabaseClient.prisma;

  const matches = await prisma.match.findMany({
    where: {
      profileId,
      matchType: "FACEIT_PUG",
      status: Constants.MatchStatus.COMPLETED,
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
