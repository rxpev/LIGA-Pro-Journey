import { Constants, Util } from '@liga/shared';
import { Prisma } from '@prisma/client';
import DatabaseClient from './database-client';
import { backfillMissingMatchPlayerGameStats } from './match-player-game-stats';

export type CompetitionMvpRecord = {
  id: number;
  competitionId: number;
  playerId: number;
  teamId: number | null;
  score: number;
  rating: number;
  maps: number;
  placement: number;
  opponentElo: number | null;
  formulaVersion: number;
  createdAt: Date | string;
  player: {
    id: number;
    name: string;
    avatar: string | null;
    country: { code: string; name: string } | null;
  };
  team: {
    id: number;
    name: string;
    blazon: string | null;
  } | null;
  competition: {
    id: number;
    season: number | null;
    location: string | null;
    organizer: string | null;
    federation: { slug: string; name: string };
    tier: { slug: string; name: string; league: { name: string; slug: string } };
  };
};

type CompetitionCandidate = {
  id: number;
  tierSlug: string;
};

type CompetitionPlayerGameRow = {
  competitionId: number;
  playerId: number;
  teamId: number | null;
  matchId: number;
  gameKey: number;
  kills: bigint | number;
  assists: bigint | number;
  deaths: bigint | number;
  opponentElo: bigint | number | null;
};

type PlacementRow = {
  teamId: number | null;
  placement: number | null;
  elo: number | null;
};

type MvpCandidate = {
  playerId: number;
  teamId: number | null;
  gameRatings: Map<string, number>;
  maps: number;
  ratingSum: number;
  opponentEloSum: number;
  opponentEloMaps: number;
  placement: number;
  score: number;
  weightedMaps: number;
  weightedOpponentEloSum: number;
  weightedOpponentEloMaps: number;
};

type MvpCandidateScore = {
  playerId: number;
  teamId: number | null;
  score: number;
  rating: number;
  maps: number;
  placement: number;
  opponentElo: number | null;
  gameRatings: Map<string, number>;
};

type CompetitionMvpFlatRow = {
  id: number;
  competitionId: number;
  playerId: number;
  teamId: number | null;
  score: number;
  rating: number;
  maps: number;
  placement: number;
  opponentElo: number | null;
  formulaVersion: number;
  createdAt: Date | string;
  playerName: string;
  playerAvatar: string | null;
  playerCountryCode: string | null;
  playerCountryName: string | null;
  teamName: string | null;
  teamBlazon: string | null;
  competitionSeason: number | null;
  competitionLocation: string | null;
  competitionOrganizer: string | null;
  competitionFederationSlug: string;
  competitionFederationName: string;
  competitionTierSlug: string;
  competitionTierName: string;
  competitionLeagueName: string;
  competitionLeagueSlug: string;
};

export const COMPETITION_MVP_FORMULA_VERSION = 8;

export const CompetitionMvpEligibleTierSlugs = [
  Constants.TierSlug.MAJOR_CHAMPIONS_STAGE,
  Constants.TierSlug.BLAST_FINALS,
  Constants.TierSlug.IEM_COLOGNE_PLAYOFFS,
  Constants.TierSlug.IEM_KRAKOW_PLAYOFFS,
  Constants.TierSlug.LEAGUE_PRO_PLAYOFFS,
] as string[];

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function isCompetitionMvpEligibleTier(tierSlug?: string | null) {
  return Boolean(tierSlug && CompetitionMvpEligibleTierSlugs.includes(tierSlug));
}

export function isMajorMvpTier(tierSlug?: string | null) {
  return tierSlug === Constants.TierSlug.MAJOR_CHAMPIONS_STAGE;
}

function getPlacementFactor(placement: number) {
  if (placement <= 1) return 1.17;
  if (placement === 2) return 1.02;
  if (placement <= 4) return 1.02;

  return clamp(1 - (placement - 4) * 0.025, 0.82, 0.98);
}

function getMapFactor(maps: number, maxMaps: number) {
  if (!maxMaps) {
    return 0;
  }

  return 0.85 + 0.15 * clamp(maps / Math.max(1, maxMaps * 0.8), 0, 1);
}

function getOpponentFactor(opponentElo: number | null, tournamentAverageElo: number | null) {
  if (opponentElo == null || tournamentAverageElo == null) {
    return 1;
  }

  return 1 + clamp((opponentElo - tournamentAverageElo) / 800, -0.06, 0.08);
}

function getCompetitionMvpStageWeights(tierSlug: string) {
  const entries: Array<{ slug: string; weight: number }> = [];

  if (tierSlug === Constants.TierSlug.MAJOR_CHAMPIONS_STAGE) {
    entries.push(
      { slug: Constants.TierSlug.MAJOR_CHALLENGERS_STAGE, weight: 0.15 },
      { slug: Constants.TierSlug.MAJOR_LEGENDS_STAGE, weight: 0.4 },
      { slug: Constants.TierSlug.MAJOR_CHAMPIONS_STAGE, weight: 1 },
    );
  } else if (tierSlug === Constants.TierSlug.IEM_COLOGNE_PLAYOFFS) {
    entries.push(
      { slug: Constants.TierSlug.IEM_COLOGNE_GROUP_A, weight: 0.25 },
      { slug: Constants.TierSlug.IEM_COLOGNE_GROUP_B, weight: 0.25 },
      { slug: Constants.TierSlug.IEM_COLOGNE_PLAYOFFS, weight: 1 },
    );
  } else if (tierSlug === Constants.TierSlug.IEM_KRAKOW_PLAYOFFS) {
    entries.push(
      { slug: Constants.TierSlug.IEM_KRAKOW_GROUP_A, weight: 0.25 },
      { slug: Constants.TierSlug.IEM_KRAKOW_GROUP_B, weight: 0.25 },
      { slug: Constants.TierSlug.IEM_KRAKOW_PLAYOFFS, weight: 1 },
    );
  } else if (tierSlug === Constants.TierSlug.LEAGUE_PRO_PLAYOFFS) {
    entries.push(
      { slug: Constants.TierSlug.LEAGUE_PRO, weight: 0.2 },
      { slug: Constants.TierSlug.LEAGUE_PRO_PLAYOFFS, weight: 1 },
    );
  } else {
    entries.push({ slug: tierSlug, weight: 1 });
  }

  return entries;
}

async function getCompetitionMvpStageScope(competition: {
  id: number;
  federationId: number;
  location: string | null;
  organizer: string | null;
  season: number | null;
  tier: { slug: string };
}) {
  const stageWeights = getCompetitionMvpStageWeights(competition.tier.slug);
  const slugs = stageWeights.map((stage) => stage.slug);
  const related = await DatabaseClient.prisma.competition.findMany({
    select: {
      id: true,
      tier: {
        select: {
          slug: true,
        },
      },
    },
    where: {
      federationId: competition.federationId,
      season: competition.season,
      status: Constants.CompetitionStatus.COMPLETED,
      ...(competition.location ? { location: competition.location } : {}),
      ...(competition.organizer ? { organizer: competition.organizer } : {}),
      tier: {
        slug: {
          in: slugs,
        },
      },
    },
  });
  const weightByCompetitionId = new Map<number, number>();

  related.forEach((stage) => {
    const weight = stageWeights.find((item) => item.slug === stage.tier.slug)?.weight ?? 1;
    weightByCompetitionId.set(stage.id, weight);
  });

  if (!weightByCompetitionId.has(competition.id)) {
    weightByCompetitionId.set(competition.id, 1);
  }

  return weightByCompetitionId;
}

export async function getCompetitionMvpStageCompetitionIds(competitionId: number) {
  const competition = await DatabaseClient.prisma.competition.findFirst({
    include: {
      tier: {
        select: {
          slug: true,
        },
      },
    },
    where: { id: competitionId },
  });

  if (!competition) {
    return [competitionId];
  }

  return [...(await getCompetitionMvpStageScope(competition)).keys()];
}

function getHeadToHeadFactor(candidate: MvpCandidateScore, contenders: MvpCandidateScore[]) {
  let ratingDifferenceSum = 0;
  let sharedMaps = 0;

  for (const contender of contenders) {
    if (contender.playerId === candidate.playerId || contender.teamId === candidate.teamId) {
      continue;
    }

    for (const [gameKey, rating] of candidate.gameRatings) {
      const contenderRating = contender.gameRatings.get(gameKey);

      if (contenderRating == null) {
        continue;
      }

      ratingDifferenceSum += rating - contenderRating;
      sharedMaps += 1;
    }
  }

  if (!sharedMaps) {
    return 1;
  }

  const averageRatingDifference = ratingDifferenceSum / sharedMaps;
  const mapConfidence = clamp(sharedMaps / 3, 0.35, 1);

  return 1 + clamp(averageRatingDifference * 0.45 * mapConfidence, -0.1, 0.1);
}

export async function ensureCompetitionMvpTable() {
  await DatabaseClient.prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "CompetitionMvp" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "competitionId" INTEGER NOT NULL,
      "playerId" INTEGER NOT NULL,
      "teamId" INTEGER,
      "score" REAL NOT NULL,
      "rating" REAL NOT NULL,
      "maps" INTEGER NOT NULL,
      "placement" INTEGER NOT NULL,
      "opponentElo" REAL,
      "formulaVersion" INTEGER NOT NULL DEFAULT ${COMPETITION_MVP_FORMULA_VERSION},
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await DatabaseClient.prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "CompetitionMvp_competitionId_key"
    ON "CompetitionMvp"("competitionId")
  `);
  await DatabaseClient.prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "CompetitionMvp_playerId_idx"
    ON "CompetitionMvp"("playerId")
  `);
  await DatabaseClient.prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "CompetitionMvp_teamId_idx"
    ON "CompetitionMvp"("teamId")
  `);
}

export async function calculateCompetitionMvp(competitionId: number) {
  await backfillMissingMatchPlayerGameStats();

  const competition = await DatabaseClient.prisma.competition.findFirst({
    where: { id: competitionId },
    include: {
      competitors: {
        include: {
          team: true,
        },
      },
      tier: true,
    },
  });

  if (
    !competition ||
    competition.status !== Constants.CompetitionStatus.COMPLETED ||
    !isCompetitionMvpEligibleTier(competition.tier.slug)
  ) {
    return null;
  }

  const placements = new Map<number, PlacementRow>();
  const stageWeights = await getCompetitionMvpStageScope(competition);
  const stageCompetitionIds = [...stageWeights.keys()];
  const teamElos = competition.competitors
    .map((competitor) => {
      if (competitor.teamId != null) {
        placements.set(competitor.teamId, {
          teamId: competitor.teamId,
          placement: competitor.position ?? null,
          elo: competitor.team?.elo ?? null,
        });
      }

      return competitor.team?.elo ?? null;
    })
    .filter((elo): elo is number => typeof elo === 'number' && Number.isFinite(elo));
  const tournamentAverageElo = teamElos.length
    ? teamElos.reduce((sum, elo) => sum + elo, 0) / teamElos.length
    : null;

  const rows = await DatabaseClient.prisma.$queryRaw<CompetitionPlayerGameRow[]>`
    SELECT
      "Match"."competitionId" AS "competitionId",
      "MatchPlayerGameStat"."playerId" AS "playerId",
      "OwnTeam"."teamId" AS "teamId",
      "MatchPlayerGameStat"."matchId" AS "matchId",
      "MatchPlayerGameStat"."gameKey" AS "gameKey",
      "MatchPlayerGameStat"."kills" AS "kills",
      "MatchPlayerGameStat"."assists" AS "assists",
      "MatchPlayerGameStat"."deaths" AS "deaths",
      AVG("OpponentTeam"."elo") AS "opponentElo"
    FROM "MatchPlayerGameStat"
    INNER JOIN "Match"
      ON "Match"."id" = "MatchPlayerGameStat"."matchId"
    INNER JOIN "Competition"
      ON "Competition"."id" = "Match"."competitionId"
    INNER JOIN "Player"
      ON "Player"."id" = "MatchPlayerGameStat"."playerId"
    LEFT JOIN "CareerStint"
      ON "CareerStint"."playerId" = "MatchPlayerGameStat"."playerId"
      AND "CareerStint"."startedAt" <= "Match"."date"
      AND (
        "CareerStint"."endedAt" IS NULL
        OR "CareerStint"."endedAt" >= "Match"."date"
      )
      AND "CareerStint"."starter" = true
    INNER JOIN "MatchToTeam" AS "OwnTeam"
      ON "OwnTeam"."matchId" = "Match"."id"
      AND "OwnTeam"."teamId" = COALESCE("CareerStint"."teamId", "Player"."teamId")
    LEFT JOIN "MatchToTeam" AS "Opponent"
      ON "Opponent"."matchId" = "Match"."id"
      AND "Opponent"."teamId" IS NOT NULL
      AND "Opponent"."teamId" <> "OwnTeam"."teamId"
    LEFT JOIN "Team" AS "OpponentTeam"
      ON "OpponentTeam"."id" = "Opponent"."teamId"
    WHERE "Match"."competitionId" IN (${Prisma.join(stageCompetitionIds)})
      AND "Match"."status" = ${Constants.MatchStatus.COMPLETED}
      AND "Match"."matchType" <> 'FACEIT_PUG'
    GROUP BY
      "Match"."competitionId",
      "MatchPlayerGameStat"."playerId",
      "OwnTeam"."teamId",
      "MatchPlayerGameStat"."matchId",
      "MatchPlayerGameStat"."gameKey",
      "MatchPlayerGameStat"."kills",
      "MatchPlayerGameStat"."assists",
      "MatchPlayerGameStat"."deaths"
  `;

  const candidates = new Map<string, MvpCandidate>();

  rows.forEach((row) => {
    const placement = row.teamId == null ? null : placements.get(row.teamId)?.placement;
    if (!placement || placement > 2) {
      return;
    }

    const rating = Util.getPlayerRating(Number(row.kills), Number(row.deaths), Number(row.assists));

    if (!Number.isFinite(rating)) {
      return;
    }

    const key = `${row.playerId}:${row.teamId ?? 0}`;
    const candidate =
      candidates.get(key) ||
      ({
        playerId: row.playerId,
        teamId: row.teamId,
        gameRatings: new Map(),
        maps: 0,
        ratingSum: 0,
        opponentEloSum: 0,
        opponentEloMaps: 0,
        placement,
        score: 0,
        weightedMaps: 0,
        weightedOpponentEloSum: 0,
        weightedOpponentEloMaps: 0,
      } satisfies MvpCandidate);
    const opponentElo = row.opponentElo == null ? null : Number(row.opponentElo);
    const stageWeight = stageWeights.get(row.competitionId) ?? 1;

    candidate.maps += 1;
    candidate.ratingSum += rating;
    candidate.weightedMaps += stageWeight;
    candidate.gameRatings.set(`${row.matchId}:${row.gameKey}`, rating);
    candidate.placement = Math.min(candidate.placement, placement);

    if (opponentElo != null && Number.isFinite(opponentElo)) {
      candidate.opponentEloSum += opponentElo;
      candidate.opponentEloMaps += 1;
      candidate.weightedOpponentEloSum += opponentElo * stageWeight;
      candidate.weightedOpponentEloMaps += stageWeight;
    }

    candidates.set(key, candidate);
  });

  const maxMaps = Math.max(0, ...[...candidates.values()].map((candidate) => candidate.maps));
  const maxWeightedMaps = Math.max(
    0,
    ...[...candidates.values()].map((candidate) => candidate.weightedMaps),
  );
  const scoredCandidates = [...candidates.values()].map((candidate) => {
    const rating = candidate.ratingSum / candidate.maps;
    const weightedOpponentElo = candidate.weightedOpponentEloMaps
      ? candidate.weightedOpponentEloSum / candidate.weightedOpponentEloMaps
      : null;
    const score =
      rating *
      getMapFactor(candidate.weightedMaps, maxWeightedMaps || maxMaps) *
      getPlacementFactor(candidate.placement) *
      getOpponentFactor(weightedOpponentElo, tournamentAverageElo);

    return {
      playerId: candidate.playerId,
      teamId: candidate.teamId,
      score,
      rating,
      maps: candidate.maps,
      placement: candidate.placement,
      opponentElo: weightedOpponentElo,
      gameRatings: candidate.gameRatings,
    } satisfies MvpCandidateScore;
  });
  const directContenders = scoredCandidates
    .slice()
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.rating - a.rating ||
        b.maps - a.maps ||
        a.placement - b.placement ||
        a.playerId - b.playerId,
    )
    .slice(0, 4);

  const finalCandidates = scoredCandidates
    .map((candidate) => {
      const headToHeadFactor = getHeadToHeadFactor(candidate, directContenders);

      return {
        playerId: candidate.playerId,
        teamId: candidate.teamId,
        score: candidate.score * headToHeadFactor,
        rating: candidate.rating,
        maps: candidate.maps,
        placement: candidate.placement,
        opponentElo: candidate.opponentElo,
      };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.rating - a.rating ||
        b.maps - a.maps ||
        a.placement - b.placement ||
        a.playerId - b.playerId,
    );
  const winnerCandidate = finalCandidates.find((candidate) => candidate.placement <= 1) ?? null;
  const topCandidate = finalCandidates[0] ?? null;

  if (
    topCandidate &&
    winnerCandidate &&
    topCandidate.placement > 1 &&
    topCandidate.rating <= winnerCandidate.rating + 0.03
  ) {
    return winnerCandidate;
  }

  return topCandidate;
}

export async function upsertCompetitionMvp(competitionId: number) {
  await ensureCompetitionMvpTable();
  const mvp = await calculateCompetitionMvp(competitionId);

  if (!mvp) {
    return null;
  }

  await DatabaseClient.prisma.$executeRaw`
    INSERT OR REPLACE INTO "CompetitionMvp" (
      "competitionId",
      "playerId",
      "teamId",
      "score",
      "rating",
      "maps",
      "placement",
      "opponentElo",
      "formulaVersion",
      "createdAt"
    )
    VALUES (
      ${competitionId},
      ${mvp.playerId},
      ${mvp.teamId},
      ${mvp.score},
      ${mvp.rating},
      ${mvp.maps},
      ${mvp.placement},
      ${mvp.opponentElo},
      ${COMPETITION_MVP_FORMULA_VERSION},
      CURRENT_TIMESTAMP
    )
  `;

  return mvp;
}

export async function backfillMissingCompetitionMvps(competitionId?: number) {
  await ensureCompetitionMvpTable();

  const candidates = await DatabaseClient.prisma.$queryRawUnsafe<CompetitionCandidate[]>(
    `
      SELECT "Competition"."id" AS "id", "Tier"."slug" AS "tierSlug"
      FROM "Competition"
      INNER JOIN "Tier" ON "Tier"."id" = "Competition"."tierId"
      WHERE "Competition"."status" = ?
        ${competitionId ? 'AND "Competition"."id" = ?' : ''}
        AND "Tier"."slug" IN (${CompetitionMvpEligibleTierSlugs.map(() => '?').join(',')})
        AND NOT EXISTS (
          SELECT 1 FROM "CompetitionMvp"
          WHERE "CompetitionMvp"."competitionId" = "Competition"."id"
            AND "CompetitionMvp"."formulaVersion" = ?
        )
      ORDER BY "Competition"."id" ASC
    `,
    Constants.CompetitionStatus.COMPLETED,
    ...(competitionId ? [competitionId] : []),
    ...CompetitionMvpEligibleTierSlugs,
    COMPETITION_MVP_FORMULA_VERSION,
  );

  for (const candidate of candidates) {
    if (isCompetitionMvpEligibleTier(candidate.tierSlug)) {
      await upsertCompetitionMvp(candidate.id);
    }
  }
}

export async function findCompetitionMvps(options: { competitionId?: number; playerId?: number }) {
  await backfillMissingCompetitionMvps(options.competitionId);

  const where: string[] = [];
  const params: unknown[] = [];

  if (options.competitionId) {
    where.push('"CompetitionMvp"."competitionId" = ?');
    params.push(options.competitionId);
  }

  if (options.playerId) {
    where.push('"CompetitionMvp"."playerId" = ?');
    params.push(options.playerId);
  }

  return DatabaseClient.prisma
    .$queryRawUnsafe<CompetitionMvpFlatRow[]>(
      `
      SELECT
        "CompetitionMvp"."id" AS "id",
        "CompetitionMvp"."competitionId" AS "competitionId",
        "CompetitionMvp"."playerId" AS "playerId",
        "CompetitionMvp"."teamId" AS "teamId",
        "CompetitionMvp"."score" AS "score",
        "CompetitionMvp"."rating" AS "rating",
        "CompetitionMvp"."maps" AS "maps",
        "CompetitionMvp"."placement" AS "placement",
        "CompetitionMvp"."opponentElo" AS "opponentElo",
        "CompetitionMvp"."formulaVersion" AS "formulaVersion",
        "CompetitionMvp"."createdAt" AS "createdAt",
        "Player"."name" AS "playerName",
        "Player"."avatar" AS "playerAvatar",
        "Country"."code" AS "playerCountryCode",
        "Country"."name" AS "playerCountryName",
        "Team"."name" AS "teamName",
        "Team"."blazon" AS "teamBlazon",
        "Competition"."season" AS "competitionSeason",
        "Competition"."location" AS "competitionLocation",
        "Competition"."organizer" AS "competitionOrganizer",
        "Federation"."slug" AS "competitionFederationSlug",
        "Federation"."name" AS "competitionFederationName",
        "Tier"."slug" AS "competitionTierSlug",
        "Tier"."name" AS "competitionTierName",
        "League"."name" AS "competitionLeagueName",
        "League"."slug" AS "competitionLeagueSlug"
      FROM "CompetitionMvp"
      INNER JOIN "Player" ON "Player"."id" = "CompetitionMvp"."playerId"
      LEFT JOIN "Country" ON "Country"."id" = "Player"."countryId"
      LEFT JOIN "Team" ON "Team"."id" = "CompetitionMvp"."teamId"
      INNER JOIN "Competition" ON "Competition"."id" = "CompetitionMvp"."competitionId"
      INNER JOIN "Federation" ON "Federation"."id" = "Competition"."federationId"
      INNER JOIN "Tier" ON "Tier"."id" = "Competition"."tierId"
      INNER JOIN "League" ON "League"."id" = "Tier"."leagueId"
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY "Competition"."season" DESC, "CompetitionMvp"."id" DESC
    `,
      ...params,
    )
    .then((rows) =>
      rows.map((row) => ({
        id: row.id,
        competitionId: row.competitionId,
        playerId: row.playerId,
        teamId: row.teamId,
        score: row.score,
        rating: row.rating,
        maps: row.maps,
        placement: row.placement,
        opponentElo: row.opponentElo,
        formulaVersion: row.formulaVersion,
        createdAt: row.createdAt,
        player: {
          id: row.playerId,
          name: row.playerName,
          avatar: row.playerAvatar,
          country:
            row.playerCountryCode && row.playerCountryName
              ? {
                  code: row.playerCountryCode,
                  name: row.playerCountryName,
                }
              : null,
        },
        team: row.teamId
          ? {
              id: row.teamId,
              name: row.teamName || '',
              blazon: row.teamBlazon,
            }
          : null,
        competition: {
          id: row.competitionId,
          season: row.competitionSeason,
          location: row.competitionLocation,
          organizer: row.competitionOrganizer,
          federation: {
            slug: row.competitionFederationSlug,
            name: row.competitionFederationName,
          },
          tier: {
            slug: row.competitionTierSlug,
            name: row.competitionTierName,
            league: {
              name: row.competitionLeagueName,
              slug: row.competitionLeagueSlug,
            },
          },
        },
      })),
    );
}
