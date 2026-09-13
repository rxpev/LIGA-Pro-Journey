import { Constants } from '@liga/shared';
import { isFaceitKillEvent } from './faceitstats';

export const FACEIT_PLACEMENT_MATCHES = 3;
export const FACEIT_FIRST_LOBBY_ELO = 1500;

type PlacementMatch = {
  faceitIsWin: boolean | null;
  payload: string;
  events: Array<{ payload?: string | null; attackerId?: number | null; victimId?: number | null }>;
};

export function eloForPlacementKd(kd: number): number {
  if (kd >= 2.5) return 2001;
  if (kd >= 2) return 1900;
  if (kd >= 1.75) return 1800;
  if (kd >= 1.5) return 1600;
  if (kd >= 1.3) return 1400;
  if (kd >= 1.2) return 1300;
  if (kd >= 1.1) return 1200;
  if (kd >= 1) return 1100;
  return 1000;
}

export function getPlacementLobbyElo(payload: string): number {
  try {
    const room = JSON.parse(payload);
    const elos = [...(room.teamA || []), ...(room.teamB || [])]
      .map((player: { elo?: number }) => Number(player.elo))
      .filter((elo: number) => Number.isFinite(elo) && elo > 0);
    return elos.length ? Math.round(elos.reduce((sum: number, elo: number) => sum + elo, 0) / elos.length) : FACEIT_FIRST_LOBBY_ELO;
  } catch {
    return FACEIT_FIRST_LOBBY_ELO;
  }
}

export function calculatePlacement(matches: PlacementMatch[], playerId: number): number {
  if (!matches.length) return FACEIT_FIRST_LOBBY_ELO;

  let weightedRating = 0;
  let totalWeight = 0;
  const kds: number[] = [];
  for (const match of matches.slice(0, FACEIT_PLACEMENT_MATCHES)) {
    let kills = 0;
    let deaths = 0;
    for (const event of match.events) {
      if (!isFaceitKillEvent(event)) continue;
      if (event.attackerId === playerId) kills++;
      if (event.victimId === playerId) deaths++;
    }
    const kd = deaths ? kills / deaths : kills;
    kds.push(kd);
    const lobbyElo = getPlacementLobbyElo(match.payload);
    const chartElo = eloForPlacementKd(kd);
    // A good K/D in a stronger lobby carries more evidence. A poor match in a
    // much harder lobby lowers the estimate without erasing earlier results.
    const evidence = Math.max(chartElo + (lobbyElo - FACEIT_FIRST_LOBBY_ELO) * 0.5,
      kd < 1 ? lobbyElo - 200 : 0);
    const weight = Math.max(0.7, Math.min(1.5, lobbyElo / FACEIT_FIRST_LOBBY_ELO));
    weightedRating += evidence * weight;
    totalWeight += weight;
  }

  const losses = matches.slice(0, FACEIT_PLACEMENT_MATCHES).filter((match) => match.faceitIsWin !== true).length;
  let estimate = weightedRating / totalWeight;
  if (kds.length === 2 && kds[0] >= 2.5 && kds[1] < 1) {
    estimate = Math.min(estimate, 1800);
  }
  return Math.max(100, Math.round(estimate) - (matches.length >= FACEIT_PLACEMENT_MATCHES ? losses * 50 : 0));
}

export async function getCompletedPlacementMatches(prisma: any, profileId: number) {
  return prisma.match.findMany({
    where: { profileId, matchType: 'FACEIT_PUG', status: Constants.MatchStatus.COMPLETED },
    include: { events: true },
    orderBy: { id: 'asc' },
    take: FACEIT_PLACEMENT_MATCHES,
  });
}
