import { Prisma } from '@prisma/client';

const columns = {
  Player: ['xp', 'elo'],
  CompetitionToTeam: ['position', 'win', 'loss', 'draw', 'seed', 'group'],
  GameToTeam: ['score', 'result'],
  MatchToTeam: ['score', 'result'],
} as const;

// Keep batches below SQLite's legacy 999-parameter limit, even with four
// different fields per row (including seed/group). Identifiers are an explicit internal allowlist;
// all values are bound parameters. Undefined retains Prisma's omit semantics.
export function numericUpdateBatches(
  table: keyof typeof columns,
  rows: Array<{ id: number; data: Record<string, number | null | undefined> }>,
  increment = false,
): Prisma.Sql[] {
  if (new Set(rows.map((row) => row.id)).size !== rows.length) {
    throw new Error('Duplicate IDs in simulation update batch');
  }
  for (const row of rows) {
    for (const field of Object.keys(row.data)) {
      if (!(columns[table] as readonly string[]).includes(field)) {
        throw new Error(`Unsupported simulation update column: ${field}`);
      }
    }
  }
  const statements: Prisma.Sql[] = [];
  for (let offset = 0; offset < rows.length; offset += 50) {
    const batch = rows.slice(offset, offset + 50);
    const assignments = columns[table].flatMap((field) => {
      const changes = batch.filter((row) => row.data[field] !== undefined);
      if (!changes.length) return [];
      const column = Prisma.raw(`"${field}"`);
      const value = Prisma.sql`CASE "id" ${Prisma.join(changes.map((row) =>
        Prisma.sql`WHEN ${row.id} THEN ${row.data[field]}`,
      ), ' ')} ELSE ${increment ? Prisma.sql`0` : column} END`;
      return [Prisma.sql`${column} = ${increment ? Prisma.sql`${column} + ${value}` : value}`];
    });
    if (assignments.length) statements.push(Prisma.sql`
      UPDATE ${Prisma.raw(`"${table}"`)} SET ${Prisma.join(assignments)}
      WHERE "id" IN (${Prisma.join(batch.map((row) => row.id))})
    `);
  }
  return statements;
}

export function rankingSnapshotStatement(date: Date) {
  return Prisma.sql`
    INSERT INTO "TeamRankingSnapshot" ("teamId", "date", "rank")
    SELECT "id", ${date}, RANK() OVER (ORDER BY "elo" DESC) FROM "Team" WHERE true
    ON CONFLICT ("teamId", "date") DO UPDATE SET "rank" = excluded."rank"
  `;
}

export function matchStatUpsertBatches(rows: Array<{
  playerId: number; matchId: number; gameKey: number;
  kills: number; assists: number; deaths: number;
}>): Prisma.Sql[] {
  const statements: Prisma.Sql[] = [];
  for (let offset = 0; offset < rows.length; offset += 100) {
    const batch = rows.slice(offset, offset + 100);
    statements.push(Prisma.sql`
      INSERT INTO "MatchPlayerGameStat" ("playerId", "matchId", "gameKey", "kills", "assists", "deaths")
      VALUES ${Prisma.join(batch.map((row) => Prisma.sql`(
        ${row.playerId}, ${row.matchId}, ${row.gameKey}, ${row.kills}, ${row.assists}, ${row.deaths}
      )`))}
      ON CONFLICT ("playerId", "matchId", "gameKey") DO UPDATE SET
        "kills" = excluded."kills", "assists" = excluded."assists", "deaths" = excluded."deaths"
    `);
  }
  return statements;
}

export function matchPlayerLinkBatches(matchId: number, playerIds: number[]): Prisma.Sql[] {
  const ids = [...new Set(playerIds)];
  const statements: Prisma.Sql[] = [];
  for (let offset = 0; offset < ids.length; offset += 400) {
    statements.push(Prisma.sql`
      INSERT INTO "_MatchToPlayer" ("A", "B")
      VALUES ${Prisma.join(ids.slice(offset, offset + 400).map((id) => Prisma.sql`(${matchId}, ${id})`))}
      ON CONFLICT ("A", "B") DO NOTHING
    `);
  }
  return statements;
}

// JSON is only a transport envelope, not a new save format. SQLite expands it
// directly into the existing event rows, preserving their order and indexes.
// One parameter per batch avoids hundreds of bound values and SQL parsing
// repeated for each 50-event fragment of a match.
export function matchEventInsertBatches(events: Prisma.MatchEventUncheckedCreateInput[]): Prisma.Sql[] {
  const statements: Prisma.Sql[] = [];
  for (let offset = 0; offset < events.length; offset += 1000) {
    const rows = events.slice(offset, offset + 1000).map((event) => {
      const timestamp = new Date(event.timestamp).getTime();
      if (!Number.isFinite(timestamp)) throw new Error('Invalid simulated event timestamp');
      return [event.half, event.headshot ? 1 : 0, event.payload, event.result ?? null,
        timestamp, event.weapon ?? null, event.matchId, event.attackerId ?? null,
        event.assistId ?? null, event.gameId ?? null, event.victimId ?? null, event.winnerId ?? null];
    });
    statements.push(Prisma.sql`
      INSERT INTO "MatchEvent" (
        "half", "headshot", "payload", "result", "timestamp", "weapon",
        "matchId", "attackerId", "assistId", "gameId", "victimId", "winnerId"
      ) SELECT
        json_extract(value, '$[0]'), json_extract(value, '$[1]'),
        json_extract(value, '$[2]'), json_extract(value, '$[3]'),
        json_extract(value, '$[4]'), json_extract(value, '$[5]'),
        json_extract(value, '$[6]'), json_extract(value, '$[7]'),
        json_extract(value, '$[8]'), json_extract(value, '$[9]'),
        json_extract(value, '$[10]'), json_extract(value, '$[11]')
      FROM json_each(${JSON.stringify(rows)}) ORDER BY CAST(key AS INTEGER)
    `);
  }
  return statements;
}
