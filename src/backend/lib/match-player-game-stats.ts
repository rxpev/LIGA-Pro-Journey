import { Constants } from '@liga/shared';
import DatabaseClient from './database-client';

export async function ensureMatchPlayerGameStatTable() {
  await DatabaseClient.prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "MatchPlayerGameStat" (
      "playerId" INTEGER NOT NULL,
      "matchId" INTEGER NOT NULL,
      "gameKey" INTEGER NOT NULL,
      "kills" INTEGER NOT NULL DEFAULT 0,
      "assists" INTEGER NOT NULL DEFAULT 0,
      "deaths" INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY ("playerId", "matchId", "gameKey")
    )
  `);
  await DatabaseClient.prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "MatchPlayerGameStat_matchId_idx"
    ON "MatchPlayerGameStat"("matchId")
  `);
  await DatabaseClient.prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "MatchPlayerGameStat_playerId_idx"
    ON "MatchPlayerGameStat"("playerId")
  `);
}

export async function backfillMissingMatchPlayerGameStats() {
  await ensureMatchPlayerGameStatTable();

  while (true) {
    const matches = await DatabaseClient.prisma.$queryRawUnsafe<Array<{ id: number }>>(`
      SELECT "Match"."id" AS "id"
      FROM "Match"
      WHERE "Match"."status" = ${Constants.MatchStatus.COMPLETED}
        AND "Match"."competitionId" IS NOT NULL
        AND "Match"."matchType" <> 'FACEIT_PUG'
        AND EXISTS (
          SELECT 1 FROM "MatchEvent"
          WHERE "MatchEvent"."matchId" = "Match"."id"
        )
        AND NOT EXISTS (
          SELECT 1 FROM "MatchPlayerGameStat"
          WHERE "MatchPlayerGameStat"."matchId" = "Match"."id"
        )
      ORDER BY "Match"."id" ASC
      LIMIT 500
    `);

    if (!matches.length) {
      break;
    }

    const matchIds = matches.map((match) => match.id);

    await DatabaseClient.prisma.$executeRawUnsafe(
      `
        INSERT OR REPLACE INTO "MatchPlayerGameStat" (
          "playerId",
          "matchId",
          "gameKey",
          "kills",
          "assists",
          "deaths"
        )
        WITH "candidateEvents" AS (
          SELECT
            "MatchEvent"."matchId",
            COALESCE("MatchEvent"."gameId", 0 - "MatchEvent"."matchId") AS "gameKey",
            "MatchEvent"."attackerId",
            "MatchEvent"."assistId",
            "MatchEvent"."victimId"
          FROM "MatchEvent"
          WHERE "MatchEvent"."matchId" IN (${matchIds.map(() => '?').join(',')})
        ),
        "playerGames" AS (
          SELECT DISTINCT
            "candidateEvents"."matchId",
            "candidateEvents"."gameKey",
            "candidateEvents"."attackerId" AS "playerId"
          FROM "candidateEvents"
          WHERE "candidateEvents"."attackerId" IS NOT NULL
          UNION
          SELECT DISTINCT
            "candidateEvents"."matchId",
            "candidateEvents"."gameKey",
            "candidateEvents"."assistId" AS "playerId"
          FROM "candidateEvents"
          WHERE "candidateEvents"."assistId" IS NOT NULL
          UNION
          SELECT DISTINCT
            "candidateEvents"."matchId",
            "candidateEvents"."gameKey",
            "candidateEvents"."victimId" AS "playerId"
          FROM "candidateEvents"
          WHERE "candidateEvents"."victimId" IS NOT NULL
        )
        SELECT
          "playerGames"."playerId",
          "playerGames"."matchId",
          "playerGames"."gameKey",
          SUM(CASE WHEN "candidateEvents"."attackerId" = "playerGames"."playerId" THEN 1 ELSE 0 END) AS "kills",
          SUM(CASE WHEN "candidateEvents"."assistId" = "playerGames"."playerId" THEN 1 ELSE 0 END) AS "assists",
          SUM(CASE WHEN "candidateEvents"."victimId" = "playerGames"."playerId" AND "candidateEvents"."assistId" IS NULL THEN 1 ELSE 0 END) AS "deaths"
        FROM "playerGames"
        INNER JOIN "candidateEvents"
          ON "candidateEvents"."matchId" = "playerGames"."matchId"
          AND "candidateEvents"."gameKey" = "playerGames"."gameKey"
        GROUP BY "playerGames"."playerId", "playerGames"."matchId", "playerGames"."gameKey"
      `,
      ...matchIds,
    );
  }
}
