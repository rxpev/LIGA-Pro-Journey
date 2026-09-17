import { Prisma } from '@prisma/client';

export type ScheduledMatch = {
  status: number; totalRounds: number; round: number; date: Date; payload: string;
  competitionId: number; calendarType: string | null;
  competitors: Array<{ seed: number; teamId: number }>;
  maps: string[];
};

// Database-assigned IDs are returned explicitly; never predict AUTOINCREMENT
// values. Parent rows and all dependent rows commit together.
export async function insertScheduledMatches(tx: Pick<Prisma.TransactionClient, '$queryRaw' | '$executeRaw'>, matches: ScheduledMatch[]) {
  for (let offset = 0; offset < matches.length; offset += 40) {
    const batch = matches.slice(offset, offset + 40);
    const created = await tx.$queryRaw<Array<{ id: number; payload: string; competitionId: number }>>(Prisma.sql`
      INSERT INTO "Match" ("status", "totalRounds", "round", "date", "payload", "competitionId")
      VALUES ${Prisma.join(batch.map((match) => Prisma.sql`(${match.status}, ${match.totalRounds},
        ${match.round}, ${match.date}, ${match.payload}, ${match.competitionId})`))}
      RETURNING "id", "payload", "competitionId"
    `);
    const byKey = new Map(created.map((match) => [`${match.competitionId}:${match.payload}`, match.id]));
    if (byKey.size !== batch.length) throw new Error('Duplicate scheduled match payload');
    const participants: Prisma.Sql[] = [];
    const games: Prisma.Sql[] = [];
    const calendar: Prisma.Sql[] = [];
    const inputsById = new Map<number, ScheduledMatch>();
    for (const match of batch) {
      const id = byKey.get(`${match.competitionId}:${match.payload}`);
      if (id == null) throw new Error('Missing inserted match');
      inputsById.set(id, match);
      participants.push(...match.competitors.map((player) => Prisma.sql`(${id}, ${player.teamId}, ${player.seed})`));
      games.push(...match.maps.map((map, num) => Prisma.sql`(${id}, ${match.status}, ${map}, ${num})`));
      if (match.calendarType != null) calendar.push(Prisma.sql`(${match.date}, ${match.calendarType}, ${String(id)})`);
    }
    if (participants.length) await tx.$executeRaw(Prisma.sql`
      INSERT INTO "MatchToTeam" ("matchId", "teamId", "seed") VALUES ${Prisma.join(participants)}
    `);
    // Slice by rows rather than matches to keep even long series below the
    // legacy SQLite parameter limit.
    for (let start = 0; start < games.length; start += 100) {
      const createdGames = await tx.$queryRaw<Array<{ id: number; matchId: number }>>(Prisma.sql`
        INSERT INTO "Game" ("matchId", "status", "map", "num")
        VALUES ${Prisma.join(games.slice(start, start + 100))} RETURNING "id", "matchId"
      `);
      const gameTeams = createdGames.flatMap((game) => inputsById.get(game.matchId)!.competitors
        .map((team) => Prisma.sql`(${game.id}, ${team.teamId}, ${team.seed})`));
      if (gameTeams.length) await tx.$executeRaw(Prisma.sql`
        INSERT INTO "GameToTeam" ("gameId", "teamId", "seed") VALUES ${Prisma.join(gameTeams)}
      `);
    }
    if (calendar.length) await tx.$executeRaw(Prisma.sql`
      INSERT INTO "Calendar" ("date", "type", "payload") VALUES ${Prisma.join(calendar)}
    `);
  }
}
