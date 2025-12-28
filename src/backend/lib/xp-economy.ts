import { Prisma } from "@prisma/client";
import { Constants, Chance, Util, Bot } from "@liga/shared";
import DatabaseClient from "./database-client";
import { computeLifetimeStats } from "./faceitstats";

const XP_MAX = 100;
const TEAM_DELTA_MAX = 2;
const PLAYER_DELTA_MAX = 2;
const K_FACTOR = 4;           // scales (actual-expected) into small ints

type TeamWithPlayers = Prisma.TeamGetPayload<{ include: { players: true } }>;

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function clampXp(xp: number) {
  return clamp(Math.round(xp), 0, XP_MAX);
}

function pickDistinct<T>(arr: T[], n: number): T[] {
  const copy = [...arr];
  const out: T[] = [];
  const count = Math.min(n, copy.length);

  for (let i = 0; i < count; i++) {
    const idx = Math.floor(Math.random() * copy.length);
    out.push(copy[idx]);
    copy.splice(idx, 1);
  }

  return out;
}

function ageGainMult(age?: number | null) {
  if (age == null) return 1.0;
  if (age <= 19) return 1.25;
  if (age <= 24) return 1.10;
  if (age <= 29) return 1.00;
  if (age <= 32) return 0.90;
  return 0.75;
}

function ageLossMult(age?: number | null) {
  if (age == null) return 1.0;
  if (age <= 19) return 0.90;
  if (age <= 24) return 0.95;
  if (age <= 29) return 1.00;
  if (age <= 32) return 1.10;
  return 1.25;
}

// Strong dampening for gains near the top
function ceilingGainMult(xp: number) {
  if (xp < 85) return 1.0;
  const t = clamp((xp - 85) / 15, 0, 1);
  return 1.0 - 0.6 * t;
}

// Convert expected/actual to a small team delta and add a "not guaranteed" gate.
function computeTeamDelta(params: {
  expectedHome: number;
  actualHome: number;
}) {
  const { expectedHome, actualHome } = params;

  const surprise = actualHome - expectedHome;
  const absSurprise = Math.abs(surprise);

  // Small integer delta
  let base = Math.round(K_FACTOR * surprise);
  base = clamp(base, -TEAM_DELTA_MAX, TEAM_DELTA_MAX);

  if (base === 0) return 0;

  // Gate: low-surprise matches often produce no XP change
  // 0.05 surprise ~ low; 0.80 surprise ~ high
  const pbx = clamp(Math.round(20 + absSurprise * 70), 15, 90);
  if (!Chance.rollD2(pbx)) return 0;

  return base;
}

/**
 * Distribute a small team delta to individual players.
 * - |teamDelta|=1: only 3/5 players get +/-1
 * - |teamDelta|=2: all 5 get +/-1, plus 2 random players get an additional +/-1 (=> max +/-2)
 */
function distributeToSquad(teamDelta: number, squad: Array<{ id: number }>) {
  const sign = Math.sign(teamDelta);
  const mag = Math.abs(teamDelta);

  const deltas: Record<number, number> = {};
  squad.forEach((p) => (deltas[p.id] = 0));

  if (mag === 1) {
    const picked = pickDistinct(squad, 3);
    picked.forEach((p) => (deltas[p.id] += sign * 1));
  } else {
    squad.forEach((p) => (deltas[p.id] += sign * 1));
    const extra = pickDistinct(squad, 2);
    extra.forEach((p) => (deltas[p.id] += sign * 1));
  }

  return deltas; // id -> -2..+2 (pre-mults)
}

function applyFloatDeltaToInt(params: { baseInt: number; mult: number }) {
  const { baseInt, mult } = params;
  if (baseInt === 0) return 0;

  const sign = Math.sign(baseInt);
  const mag = Math.abs(baseInt);

  const floatMag = mag * mult; // e.g. 1 * 1.1
  const whole = Math.floor(floatMag);
  const frac = floatMag - whole;

  let out = whole;
  if (frac > 0 && Chance.rollD2(Math.round(frac * 100))) out += 1;

  return sign * out;
}

function computeTeamStrength(
  team: TeamWithPlayers,
  profile?: { teamId: number | null; playerId: number | null }
) {
  const userTeamId = profile?.teamId ?? null;
  const userPlayerId = profile?.playerId ?? null;

  const isUserTeam = team.id === userTeamId;

  const forceSizeExcludingUser = isUserTeam
    ? Constants.Application.SQUAD_MIN_LENGTH - 1   // 4
    : Constants.Application.SQUAD_MIN_LENGTH;     // 5

  const squad = Util.getSquad(
    team as any,
    { teamId: userTeamId, playerId: userPlayerId } as any,
    isUserTeam, // includeUser
    forceSizeExcludingUser,
  );

  const totalXp = squad.map((p: any) => Bot.Exp.getTotalXP(p.xp)).reduce((a, b) => a + b, 0);
  const rating = totalXp + (team.prestige ?? 0) + (team.tier ?? 0);

  return { rating, squad };
}

export async function applyMatchXpFromSim(params: {
  matchId: number;
  homeTeam: TeamWithPlayers;
  awayTeam: TeamWithPlayers;
  simulationResult: Record<number, number>;
  allowDraw: boolean;
  profile?: { teamId: number | null; playerId: number | null };
}) {
  const prisma = DatabaseClient.prisma;

  const { homeTeam, awayTeam, simulationResult, profile } = params;

  const home = computeTeamStrength(homeTeam, profile);
  const away = computeTeamStrength(awayTeam, profile);

  const expectedHome = Util.getEloWinProbability(
    home.rating,
    away.rating,
    Constants.Application.SIMULATION_SCALING_FACTOR,
  );

  const homeResult = SimulatorResultToMatchResult(homeTeam.id, simulationResult);
  const actualHome = Constants.EloScore[homeResult]; // WIN=1, DRAW=0.5, LOSS=0

  const teamDelta = computeTeamDelta({ expectedHome, actualHome });
  if (teamDelta === 0) return;

  const homeDist = distributeToSquad(teamDelta, home.squad);
  const awayDist = distributeToSquad(-teamDelta, away.squad);

  const allIds = [...new Set([...Object.keys(homeDist), ...Object.keys(awayDist)].map(Number))];
  if (!allIds.length) return;

  // Load current xp/age for just those players
  const players = await prisma.player.findMany({
    where: { id: { in: allIds } },
    select: { id: true, xp: true, age: true },
  });

  const byId = new Map(players.map((p) => [p.id, p]));
  const updates: Array<{ id: number; newXp: number; delta: number }> = [];

  for (const id of allIds) {
    const p = byId.get(id);
    if (!p) continue;

    const base = (homeDist[id] ?? 0) + (awayDist[id] ?? 0);
    if (base === 0) continue;

    const xpNow = p.xp ?? 0;

    // Mults
    let mult = 1.0;
    if (base > 0) {
      mult *= ageGainMult(p.age);
      mult *= ceilingGainMult(xpNow);
    } else {
      mult *= ageLossMult(p.age);
    }

    let delta = applyFloatDeltaToInt({ baseInt: base, mult });
    delta = clamp(delta, -PLAYER_DELTA_MAX, PLAYER_DELTA_MAX);

    const playerGate = base > 0 ? 70 : 60;
    if (delta !== 0 && !Chance.rollD2(playerGate)) delta = 0;

    if (delta === 0) continue;

    const newXp = clampXp(xpNow + delta);
    if (newXp === xpNow) continue;

    updates.push({ id, newXp, delta: newXp - xpNow });
  }

  if (!updates.length) return;

  await prisma.$transaction(
    updates.map((u) =>
      prisma.player.update({
        where: { id: u.id },
        data: { xp: u.newXp },
      }),
    ),
  );
}

export async function applyMatchXpFromCompletedMatch(params: {
  matchId: number;
  profile?: { teamId: number | null; playerId: number | null };
}) {
  const prisma = DatabaseClient.prisma;

  const match = await prisma.match.findFirst({
    where: { id: params.matchId },
    include: {
      competitors: {
        include: {
          team: { include: { players: true } },
        },
      },
      competition: { include: { tier: true } },
    },
  });

  if (!match) return;
  if (match.status !== Constants.MatchStatus.COMPLETED) return;

  // Optional skips (recommended):
  if ((match as any).matchType === "FACEIT_PUG") return;
  if (match.competition?.tier?.slug === Constants.TierSlug.EXHIBITION_FRIENDLY) return;

  const [homeC, awayC] = match.competitors;
  if (!homeC?.team || !awayC?.team) return;

  // Expected based on your XP+prestige+tier rating
  const home = computeTeamStrength(homeC.team as any, params.profile);
  const away = computeTeamStrength(awayC.team as any, params.profile);

  const expectedHome = Util.getEloWinProbability(
    home.rating,
    away.rating,
    Constants.Application.SIMULATION_SCALING_FACTOR,
  );

  const homeResult = homeC.result as keyof typeof Constants.EloScore;
  const actualHome = Constants.EloScore[homeResult]; // 1 / 0.5 / 0

  const teamDelta = computeTeamDelta({ expectedHome, actualHome });
  if (teamDelta === 0) return;

  const homeDist = distributeToSquad(teamDelta, home.squad);
  const awayDist = distributeToSquad(-teamDelta, away.squad);

  const allIds = [...new Set([...Object.keys(homeDist), ...Object.keys(awayDist)].map(Number))];
  if (!allIds.length) return;

  const players = await prisma.player.findMany({
    where: { id: { in: allIds } },
    select: { id: true, xp: true, age: true },
  });

  const byId = new Map(players.map((p) => [p.id, p]));
  const updates: Array<{ id: number; newXp: number }> = [];

  for (const id of allIds) {
    const p = byId.get(id);
    if (!p) continue;

    const base = (homeDist[id] ?? 0) + (awayDist[id] ?? 0);
    if (base === 0) continue;

    const xpNow = p.xp ?? 0;

    let mult = 1.0;
    if (base > 0) {
      mult *= ageGainMult(p.age);
      mult *= ceilingGainMult(xpNow);
    } else {
      mult *= ageLossMult(p.age);
    }

    let delta = applyFloatDeltaToInt({ baseInt: base, mult });
    delta = clamp(delta, -PLAYER_DELTA_MAX, PLAYER_DELTA_MAX);

    const playerGate = base > 0 ? 70 : 60;
    if (delta !== 0 && !Chance.rollD2(playerGate)) delta = 0;

    if (delta === 0) continue;

    const newXp = clampXp(xpNow + delta);
    if (newXp === xpNow) continue;

    updates.push({ id, newXp });
  }

  if (!updates.length) return;

  await prisma.$transaction(
    updates.map((u) =>
      prisma.player.update({
        where: { id: u.id },
        data: { xp: u.newXp },
      }),
    ),
  );
}

function SimulatorResultToMatchResult(teamId: number, simulationResult: Record<number, number>) {
  const opponentId = Number(Object.keys(simulationResult).find((k) => Number(k) !== teamId));
  const teamScore = simulationResult[teamId];
  const oppScore = simulationResult[opponentId];
  return teamScore > oppScore
    ? Constants.MatchResult.WIN
    : teamScore === oppScore
      ? Constants.MatchResult.DRAW
      : Constants.MatchResult.LOSS;
}

type SeedXpRange = { min: number; max: number };

/**
 * KD → initial XP brackets (after 3 FACEIT pugs)
 * - KD >= 3.0  -> 21..28
 * - KD >= 2.0  -> 15..20
 * - KD >= 1.0  -> 11..14
 * - KD <  1.0  -> 10
 */
export function seedXpRangeFromKD(kd: number): SeedXpRange {
  if (!Number.isFinite(kd) || kd <= 0) return { min: 10, max: 10 };
  if (kd >= 3.0) return { min: 30, max: 35 };
  if (kd >= 2.0) return { min: 20, max: 30 };
  if (kd >= 1.0) return { min: 15, max: 20 };
  return { min: 10, max: 10 };
}

function rollIntInclusive(min: number, max: number) {
  const lo = Math.ceil(min);
  const hi = Math.floor(max);
  if (hi <= lo) return lo;
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

export function computeSeedXp(params: { kd: number }) {
  const { kd } = params;

  const { min, max } = seedXpRangeFromKD(kd);
  const rolled = rollIntInclusive(min, max);

  return clampXp(rolled);
}

/**
 * Seeds the USER player's XP exactly after their 3rd completed FACEIT pug,
 * based primarily on KD over the first 3 games.
 */
export async function seedUserXp(params: {
  profileId: number;
  teamlessOnly?: boolean;
}) {
  const prisma = DatabaseClient.prisma;
  const teamlessOnly = params.teamlessOnly ?? true;

  const profile = await prisma.profile.findFirst({
    where: { id: params.profileId },
    select: { id: true, playerId: true, teamId: true },
  });
  if (!profile) return;

  if (teamlessOnly && profile.teamId != null) return;

  const played = await prisma.match.count({
    where: {
      profileId: profile.id,
      matchType: "FACEIT_PUG",
      status: Constants.MatchStatus.COMPLETED,
    },
  });

  if (played !== 3) return;

  const player = await prisma.player.findFirst({
    where: { id: profile.playerId },
    select: { id: true, xp: true },
  });
  if (!player) return;

  // If xp already non-zero, we assume user was seeded or otherwise progressed
  if ((player.xp ?? 0) !== 0) return;

  const stats3 = await computeLifetimeStats(profile.id, profile.playerId, 3);
  const kd = stats3.kdRatio ?? 0;

  const xp = computeSeedXp({ kd });

  await prisma.player.update({
    where: { id: player.id },
    data: { xp },
  });

  return { seededXp: xp, kd };
}
