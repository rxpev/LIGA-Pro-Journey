/**
 * Match IPC handlers.
 *
 * @module
 */
import Tournament from '@liga/shared/tournament';
import { ipcMain } from 'electron';
import { differenceBy } from 'lodash';
import { Constants, Eagers, Util } from '@liga/shared';
import { DatabaseClient } from '@liga/backend/lib';
import { Prisma } from '@prisma/client';

type MatchVetoInput = {
  type?: string;
  map?: string;
  teamId?: number | null;
};

type GlobalPlayerStatsParams = {
  currentDate?: Date | string;
  federationSlug?: string;
  name?: string;
  page?: number;
  pageSize?: number;
  sort?: 'rating' | 'kills' | 'deaths' | 'maps' | 'name' | 'team';
  teamId?: number;
  tierId?: number;
  year?: string;
};

type GlobalPlayerStatsRow = {
  id: number;
  name: string;
  avatar?: string | null;
  country?: { code: string; name: string } | null;
  team?: { id: number; name: string; blazon?: string | null; tier?: number | null } | null;
  rating: number;
  kills: number;
  deaths: number;
  assists: number;
  maps: number;
};

const GLOBAL_PLAYER_STATS_CACHE_TTL_MS = 60_000;
const globalPlayerStatsCache = new Map<
  string,
  { createdAt: number; players: GlobalPlayerStatsRow[] }
>();

function getGlobalPlayerStatsCacheKey(params: GlobalPlayerStatsParams) {
  return JSON.stringify({
    currentDate: params.currentDate ? new Date(params.currentDate).toISOString() : '',
    federationSlug: params.federationSlug || '',
    name: params.name || '',
    teamId: params.teamId || 0,
    tierId: params.tierId ?? '',
    year: params.year || '',
  });
}

function sortGlobalPlayerStats(
  players: GlobalPlayerStatsRow[],
  sort: NonNullable<GlobalPlayerStatsParams['sort']>,
) {
  const sorted = [...players];

  sorted.sort((a, b) => {
    if (sort === 'name') {
      return a.name.localeCompare(b.name);
    }

    if (sort === 'team') {
      return (
        (a.team?.name || '').localeCompare(b.team?.name || '') || a.name.localeCompare(b.name)
      );
    }

    return (
      Number(b[sort] || 0) - Number(a[sort] || 0) ||
      b.maps - a.maps ||
      a.name.localeCompare(b.name)
    );
  });

  return sorted;
}

async function ensureMatchVetoTable() {
  await DatabaseClient.prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "MatchVeto" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "type" TEXT NOT NULL,
      "map" TEXT NOT NULL,
      "matchId" INTEGER NOT NULL,
      "teamId" INTEGER,
      CONSTRAINT "MatchVeto_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT "MatchVeto_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE
    )
  `);
}

async function ensureMatchPlayerGameStatTable() {
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

async function backfillMissingMatchPlayerGameStats() {
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

/**
 * Register the IPC event handlers.
 *
 * @function
 */
export default function () {
  ipcMain.handle(Constants.IPCRoute.MATCH_FIND, (_, query: Prisma.MatchFindFirstArgs) =>
    DatabaseClient.prisma.match.findFirst(query),
  );
  ipcMain.handle(Constants.IPCRoute.MATCH_FIND_VETO_LIST, async (_, id: number) => {
    await ensureMatchVetoTable();

    return DatabaseClient.prisma.$queryRaw<
      Array<{ id: number; type: string; map: string; teamId: number | null }>
    >`SELECT "id", "type", "map", "teamId" FROM "MatchVeto" WHERE "matchId" = ${id} ORDER BY "id" ASC`;
  });
  ipcMain.handle(
    Constants.IPCRoute.MATCH_UPDATE_MAP_LIST,
    async (_, id: number, maps: Array<string>) => {
      const match = await DatabaseClient.prisma.match.findFirst({
        ...Eagers.match,
        where: { id },
      });

      // update the tourney object metadata with the map list
      const tournament = Tournament.restore(JSON.parse(match.competition.tournament));
      tournament.$base.findMatch(JSON.parse(match.payload)).data['maps'] = maps;

      // update the match database record with the map list
      return DatabaseClient.prisma.match.update({
        where: { id },
        data: {
          status: Constants.MatchStatus.PLAYING,
          competition: {
            update: {
              tournament: JSON.stringify(tournament.save()),
            },
          },
          games: {
            update: match.games.map((game, gameIdx) => ({
              where: { id: game.id },
              data: {
                map: maps[gameIdx],
                status: gameIdx === 0 ? Constants.MatchStatus.PLAYING : game.status,
                // ensure competitors have been added
                // to the current game in the series
                //
                // @todo: remove after beta
                teams: {
                  create: differenceBy(match.competitors, game.teams, 'teamId').map(
                    (competitor) => ({
                      teamId: competitor.teamId,
                      seed: competitor.seed,
                    }),
                  ),
                },
              },
            })),
          },
        },
      });
    },
  );
  ipcMain.handle(
    Constants.IPCRoute.MATCH_UPDATE_VETO_LIST,
    async (_, id: number, data: Array<MatchVetoInput>) => {
      const vetoes = data.filter((item) => !!item.type && !!item.map);
      await ensureMatchVetoTable();

      await DatabaseClient.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`DELETE FROM "MatchVeto" WHERE "matchId" = ${id}`;

        for (const item of vetoes) {
          await tx.$executeRaw`
            INSERT INTO "MatchVeto" ("type", "map", "matchId", "teamId")
            VALUES (${item.type}, ${item.map}, ${id}, ${item.teamId ?? null})
          `;
        }
      });

      return true;
    },
  );
  ipcMain.handle(Constants.IPCRoute.MATCHES_ALL, (_, query: Prisma.MatchFindManyArgs) =>
    DatabaseClient.prisma.match.findMany(query),
  );
  ipcMain.handle(Constants.IPCRoute.MATCHES_COUNT, (_, where?: Prisma.MatchWhereInput) =>
    DatabaseClient.prisma.match.count({ where }),
  );
  ipcMain.handle(
    Constants.IPCRoute.MATCHES_GLOBAL_PLAYER_STATS,
    async (_, params: GlobalPlayerStatsParams) => {
      const page = Math.max(1, Number(params.page || 1));
      const pageSize = Math.max(1, Math.min(100, Number(params.pageSize || 20)));
      const sort = params.sort || 'rating';
      const cacheKey = getGlobalPlayerStatsCacheKey(params);
      const cached = globalPlayerStatsCache.get(cacheKey);
      const basePlayers =
        cached && Date.now() - cached.createdAt < GLOBAL_PLAYER_STATS_CACHE_TTL_MS
          ? cached.players
          : await (async () => {
              await backfillMissingMatchPlayerGameStats();

              const matchWhere = [
                '"Match"."status" = ?',
                '"Match"."competitionId" IS NOT NULL',
                '"Match"."matchType" <> \'FACEIT_PUG\'',
              ];
              const matchParams: unknown[] = [Constants.MatchStatus.COMPLETED];

              if (params.year) {
                const year = Number(params.year);
                if (Number.isFinite(year)) {
                  const start = new Date(year, 0, 1, 0, 0, 0, 0);
                  const end = new Date(year, 11, 31, 23, 59, 59, 999);

                  if (params.currentDate) {
                    const current = new Date(params.currentDate);
                    if (current.getFullYear() === year && current < end) {
                      end.setTime(current.getTime());
                      end.setHours(23, 59, 59, 999);
                    }
                  }

                  matchWhere.push('"Match"."date" >= ?');
                  matchParams.push(start);
                  matchWhere.push('"Match"."date" <= ?');
                  matchParams.push(end);
                }
              }

              const playerWhere = ['1 = 1'];
              const playerParams: unknown[] = [];
              if (params.teamId) {
                playerWhere.push('"Player"."teamId" = ?');
                playerParams.push(params.teamId);
              }
              if (params.tierId !== undefined && params.tierId !== null) {
                playerWhere.push('"Team"."tier" = ?');
                playerParams.push(params.tierId);
              }
              if (params.federationSlug) {
                playerWhere.push('"Federation"."slug" = ?');
                playerParams.push(params.federationSlug);
              }
              if (params.name) {
                playerWhere.push('"Player"."name" LIKE ?');
                playerParams.push(`%${params.name}%`);
              }

              const playerCandidates = await DatabaseClient.prisma.$queryRawUnsafe<
                Array<{
                  id: number;
                  name: string;
                  avatar: string | null;
                  countryCode: string | null;
                  countryName: string | null;
                  teamId: number | null;
                  teamName: string | null;
                  teamBlazon: string | null;
                  teamTier: number | null;
                }>
              >(
                `
                  SELECT
                    "Player"."id" AS "id",
                    "Player"."name" AS "name",
                    "Player"."avatar" AS "avatar",
                    "Country"."code" AS "countryCode",
                    "Country"."name" AS "countryName",
                    "Team"."id" AS "teamId",
                    "Team"."name" AS "teamName",
                    "Team"."blazon" AS "teamBlazon",
                    "Team"."tier" AS "teamTier"
                  FROM "Player"
                  LEFT JOIN "Country" ON "Country"."id" = "Player"."countryId"
                  LEFT JOIN "Team" ON "Team"."id" = "Player"."teamId"
                  LEFT JOIN "Country" AS "TeamCountry" ON "TeamCountry"."id" = "Team"."countryId"
                  LEFT JOIN "Continent" ON "Continent"."id" = "TeamCountry"."continentId"
                  LEFT JOIN "Federation" ON "Federation"."id" = "Continent"."federationId"
                  WHERE ${playerWhere.join(' AND ')}
                  ORDER BY "Player"."id" ASC
                `,
                ...playerParams,
              );

              const byPlayer = new Map<
                number,
                GlobalPlayerStatsRow & {
                  matchRatings: Map<number, { count: number; sum: number }>;
                }
              >();
              const playerById = new Map(playerCandidates.map((player) => [player.id, player]));
              const playerIds = playerCandidates.map((player) => player.id);
              const batchSize = 100;

              for (let index = 0; index < playerIds.length; index += batchSize) {
                const batchIds = playerIds.slice(index, index + batchSize);
                const placeholders = batchIds.map(() => '?').join(',');
                const batchRows = await DatabaseClient.prisma.$queryRawUnsafe<
                  Array<{
                    playerId: number;
                    matchId: number;
                    kills: bigint | number;
                    assists: bigint | number;
                    deaths: bigint | number;
                  }>
                >(
                  `
                    SELECT
                      "MatchPlayerGameStat"."playerId" AS "playerId",
                      "MatchPlayerGameStat"."matchId" AS "matchId",
                      "MatchPlayerGameStat"."kills" AS "kills",
                      "MatchPlayerGameStat"."assists" AS "assists",
                      "MatchPlayerGameStat"."deaths" AS "deaths"
                    FROM "MatchPlayerGameStat"
                    INNER JOIN "Match" ON "Match"."id" = "MatchPlayerGameStat"."matchId"
                    WHERE ${matchWhere.join(' AND ')}
                      AND "MatchPlayerGameStat"."playerId" IN (${placeholders})
                  `,
                  ...matchParams,
                  ...batchIds,
                );

                batchRows.forEach((row) => {
                const candidate = playerById.get(row.playerId);
                if (!candidate) {
                  return;
                }

                const player =
                  byPlayer.get(row.playerId) ||
                  ({
                    id: row.playerId,
                    name: candidate.name,
                    avatar: candidate.avatar,
                    country:
                      candidate.countryCode && candidate.countryName
                        ? { code: candidate.countryCode, name: candidate.countryName }
                        : null,
                    team: candidate.teamId
                      ? {
                          id: candidate.teamId,
                          name: candidate.teamName || '',
                          blazon: candidate.teamBlazon,
                          tier: candidate.teamTier,
                        }
                      : null,
                    rating: 0,
                    kills: 0,
                    deaths: 0,
                    assists: 0,
                    maps: 0,
                    matchRatings: new Map<number, { count: number; sum: number }>(),
                  } as GlobalPlayerStatsRow & {
                    matchRatings: Map<number, { count: number; sum: number }>;
                  });

                const kills = Number(row.kills);
                const assists = Number(row.assists);
                const deaths = Number(row.deaths);
                const rating = Util.getPlayerRating(kills, deaths, assists);

                player.kills += kills;
                player.assists += assists;
                player.deaths += deaths;
                player.maps += 1;

                if (Number.isFinite(rating)) {
                  const matchRating = player.matchRatings.get(row.matchId) || { count: 0, sum: 0 };
                  matchRating.count += 1;
                  matchRating.sum += rating;
                  player.matchRatings.set(row.matchId, matchRating);
                }

                byPlayer.set(row.playerId, player);
              });
              }

              const players = [...byPlayer.values()].map(({ matchRatings, ...player }) => {
                const ratings = [...matchRatings.values()].map((entry) => entry.sum / entry.count);
                return {
                  ...player,
                  rating: ratings.length
                    ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length
                    : 0,
                };
              });

              globalPlayerStatsCache.set(cacheKey, { createdAt: Date.now(), players });
              return players;
            })();

      const sorted = sortGlobalPlayerStats(basePlayers, sort);
      const start = (page - 1) * pageSize;

      return {
        players: sorted.slice(start, start + pageSize),
        total: sorted.length,
      };
    },
  );
  ipcMain.handle(Constants.IPCRoute.MATCHES_PLAYER_RATING_GAMES, async (_, playerId: number) => {
    if (!Number.isFinite(playerId)) {
      return [];
    }

    await backfillMissingMatchPlayerGameStats();

    const rows = await DatabaseClient.prisma.$queryRaw<
      Array<{
        date: Date | string;
        teamIds: string | null;
        kills: bigint | number;
        assists: bigint | number;
        deaths: bigint | number;
      }>
    >`
      SELECT
        "Match"."date" AS "date",
        (
          SELECT GROUP_CONCAT("MatchToTeam"."teamId")
          FROM "MatchToTeam"
          WHERE "MatchToTeam"."matchId" = "MatchPlayerGameStat"."matchId"
            AND "MatchToTeam"."teamId" IS NOT NULL
        ) AS "teamIds",
        "MatchPlayerGameStat"."kills" AS "kills",
        "MatchPlayerGameStat"."assists" AS "assists",
        "MatchPlayerGameStat"."deaths" AS "deaths"
      FROM "MatchPlayerGameStat"
      INNER JOIN "Match" ON "Match"."id" = "MatchPlayerGameStat"."matchId"
      WHERE "Match"."status" = ${Constants.MatchStatus.COMPLETED}
        AND "Match"."competitionId" IS NOT NULL
        AND "Match"."matchType" <> 'FACEIT_PUG'
        AND "MatchPlayerGameStat"."playerId" = ${playerId}
      ORDER BY "Match"."date" DESC
    `;

    return rows
      .map((row) => {
        const rating = Util.getPlayerRating(
          Number(row.kills),
          Number(row.deaths),
          Number(row.assists),
        );

        if (!Number.isFinite(rating)) {
          return null;
        }

        return {
          date: row.date,
          teamIds: String(row.teamIds || '')
            .split(',')
            .map(Number)
            .filter(Number.isFinite),
          rating,
        };
      })
      .filter(Boolean);
  });
  ipcMain.handle(
    Constants.IPCRoute.MATCHES_RECENT_PLAYER_RATINGS,
    async (
      _,
      data: {
        teamIds?: number[];
        from?: Date | string;
        to?: Date | string;
      },
    ) => {
      const teamIds = [...new Set((data.teamIds || []).filter(Number.isFinite))];
      if (!teamIds.length || !data.from || !data.to) {
        return {};
      }

      const rows = await DatabaseClient.prisma.$queryRaw<
        Array<{
          playerId: number;
          gameKey: number;
          kills: bigint | number;
          assists: bigint | number;
          deaths: bigint | number;
        }>
      >`
        WITH "candidateEvents" AS (
          SELECT
            "MatchEvent"."matchId",
            COALESCE("MatchEvent"."gameId", 0 - "MatchEvent"."matchId") AS "gameKey",
            "MatchEvent"."attackerId",
            "MatchEvent"."assistId",
            "MatchEvent"."victimId"
          FROM "MatchEvent"
          INNER JOIN "Match" ON "Match"."id" = "MatchEvent"."matchId"
          WHERE "Match"."status" = ${Constants.MatchStatus.COMPLETED}
            AND "Match"."competitionId" IS NOT NULL
            AND "Match"."matchType" <> 'FACEIT_PUG'
            AND "Match"."date" >= ${new Date(data.from)}
            AND "Match"."date" <= ${new Date(data.to)}
            AND EXISTS (
              SELECT 1 FROM "MatchToTeam"
              WHERE "MatchToTeam"."matchId" = "Match"."id"
                AND "MatchToTeam"."teamId" IN (${Prisma.join(teamIds)})
            )
        ),
        "playerGames" AS (
          SELECT DISTINCT "candidateEvents"."gameKey", "candidateEvents"."attackerId" AS "playerId"
          FROM "candidateEvents"
          INNER JOIN "Player" ON "Player"."id" = "candidateEvents"."attackerId"
          WHERE "candidateEvents"."attackerId" IS NOT NULL
            AND "Player"."teamId" IN (${Prisma.join(teamIds)})
          UNION
          SELECT DISTINCT "candidateEvents"."gameKey", "candidateEvents"."assistId" AS "playerId"
          FROM "candidateEvents"
          INNER JOIN "Player" ON "Player"."id" = "candidateEvents"."assistId"
          WHERE "candidateEvents"."assistId" IS NOT NULL
            AND "Player"."teamId" IN (${Prisma.join(teamIds)})
          UNION
          SELECT DISTINCT "candidateEvents"."gameKey", "candidateEvents"."victimId" AS "playerId"
          FROM "candidateEvents"
          INNER JOIN "Player" ON "Player"."id" = "candidateEvents"."victimId"
          WHERE "candidateEvents"."victimId" IS NOT NULL
            AND "Player"."teamId" IN (${Prisma.join(teamIds)})
        )
        SELECT
          "playerGames"."playerId",
          "playerGames"."gameKey",
          SUM(CASE WHEN "candidateEvents"."attackerId" = "playerGames"."playerId" THEN 1 ELSE 0 END) AS "kills",
          SUM(CASE WHEN "candidateEvents"."assistId" = "playerGames"."playerId" THEN 1 ELSE 0 END) AS "assists",
          SUM(CASE WHEN "candidateEvents"."victimId" = "playerGames"."playerId" AND "candidateEvents"."assistId" IS NULL THEN 1 ELSE 0 END) AS "deaths"
        FROM "playerGames"
        INNER JOIN "candidateEvents" ON "candidateEvents"."gameKey" = "playerGames"."gameKey"
        GROUP BY "playerGames"."playerId", "playerGames"."gameKey"
      `;

      const ratingRows: Record<number, { maps: number; ratingSum: number }> = {};
      rows.forEach((row) => {
        const kills = Number(row.kills);
        const assists = Number(row.assists);
        const deaths = Number(row.deaths);
        const rating = Util.getPlayerRating(kills, deaths, assists);

        if (!Number.isFinite(rating)) {
          return;
        }

        if (!ratingRows[row.playerId]) {
          ratingRows[row.playerId] = { maps: 0, ratingSum: 0 };
        }

        ratingRows[row.playerId].maps += 1;
        ratingRows[row.playerId].ratingSum += rating;
      });

      return Object.fromEntries(
        Object.entries(ratingRows).map(([playerId, row]) => [
          Number(playerId),
          {
            maps: row.maps,
            rating: row.maps ? row.ratingSum / row.maps : 0,
          },
        ]),
      );
    },
  );
  ipcMain.handle(
    Constants.IPCRoute.MATCHES_PREVIOUS,
    async (_, query: Partial<Prisma.MatchFindManyArgs> = {}, id: number, limit = 5) => {
      const profile = await DatabaseClient.prisma.profile.findFirst();
      return DatabaseClient.prisma.match.findMany({
        ...query,
        take: limit,
        where: {
          AND: [
            query.where ?? {},
            {
              competitionId: { not: null }, // <- prevents match.competition === null
              date: { lte: profile.date.toISOString() },
              competitors: { some: { teamId: id } },
              status: Constants.MatchStatus.COMPLETED,
            },
          ],
        },
        orderBy: { date: "desc" },
      });
    },
  );
  ipcMain.handle(
    Constants.IPCRoute.MATCHES_UPCOMING,
    async (_, query: Partial<Prisma.MatchFindManyArgs> = {}, limit = 5) => {
      const profile = await DatabaseClient.prisma.profile.findFirst();
      // Teamless safety: no upcoming team matches.
      if (!profile?.teamId) {
        return [];
      }
      return DatabaseClient.prisma.match.findMany({
        ...query,
        take: limit,
        where: {
          AND: [
            query.where ?? {},
            {
              competitionId: { not: null },
              date: { gte: profile.date.toISOString() },
              competitors: { some: { teamId: profile.teamId } },
              status: { not: Constants.MatchStatus.COMPLETED },
            },
          ],
        },
        orderBy: { date: "asc" },
      });
    },
  );
}
