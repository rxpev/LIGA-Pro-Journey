import { Prisma } from '@prisma/client';
import DatabaseClient from './database-client';
import { Constants } from '@liga/shared';

/** Read retirement evidence without hydrating national rosters or trophy relations. */
export async function readRetirementEvidence(
  player: {
    id: number;
    countryId: number;
    teamId: number | null;
    xp: number;
  },
  peakTier: number,
  completionTiers: readonly string[],
) {
  const [row] = await DatabaseClient.prisma.$queryRaw<
    Array<{ continuation: bigint; trophyPoints: bigint }>
  >(Prisma.sql`
    SELECT EXISTS (
      SELECT 1 FROM "Team" t
      WHERE t."countryId" = ${player.countryId}
        AND (${player.teamId} IS NULL OR t."id" <> ${player.teamId})
        AND COALESCE(t."tier", 0) <= ${peakTier}
        AND NOT EXISTS (SELECT 1 FROM "Profile" pr WHERE pr."teamId" = t."id")
        AND EXISTS (
          SELECT 1 FROM "Player" p
          WHERE p."teamId" = t."id" AND p."starter" = 1
            AND p."xp" <= ${player.xp - 5}
        )
    ) AS "continuation", (
      SELECT COALESCE(SUM(CASE WHEN ti."slug" = ${Constants.TierSlug.MAJOR_CHAMPIONS_STAGE}
        THEN 3 ELSE 1 END), 0)
      FROM "CompetitionToTeam" ct
      JOIN "Competition" c ON c."id" = ct."competitionId"
      JOIN "Tier" ti ON ti."id" = c."tierId"
      JOIN "League" l ON l."id" = ti."leagueId"
      WHERE ct."position" = 1 AND ct."teamId" IS NOT NULL
        AND (ti."slug" IN (${Prisma.join([...completionTiers])})
          OR l."slug" = ${Constants.LeagueSlug.ESPORTS_PRO_LEAGUE})
        AND EXISTS (
          SELECT 1 FROM "_MatchToPlayer" mp
          JOIN "Match" m ON m."id" = mp."A"
          WHERE mp."B" = ${player.id} AND m."competitionId" = c."id"
        )
    ) AS "trophyPoints"
  `);
  return {
    hasViableNationalContinuation: Boolean(row.continuation),
    careerTrophyPoints: Number(row.trophyPoints),
  };
}
