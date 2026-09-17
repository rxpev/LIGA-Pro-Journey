import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Constants } from '@liga/shared';
import Tournament from '@liga/shared/tournament';
import { Prisma } from '@prisma/client';
import { insertScheduledMatches, ScheduledMatch } from './scheduled-match-writes';
import { numericUpdateBatches, rankingSnapshotStatement, matchStatUpsertBatches, matchPlayerLinkBatches, matchEventInsertBatches } from './simulation-bulk-writes';

process.env.NODE_ENV = 'cli';

async function main() {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'liga-bulk-test-'));
  const save = path.join(temporaryRoot, 'LIGA Pro Journey', 'saves', 'save_0.db');
  await fs.mkdir(path.dirname(save), { recursive: true });
  await fs.copyFile(path.resolve('src/backend/prisma/saves/save_0.db'), save);
  process.env.APPDATA = temporaryRoot;
  const { default: DatabaseClient } = require('./database-client') as typeof import('./database-client');
  try {
    await DatabaseClient.connect(0);
    const prisma = DatabaseClient.prisma;
    const federation = await prisma.federation.findFirstOrThrow();
    const tier = await prisma.tier.findFirstOrThrow({ where: { slug: Constants.TierSlug.LEAGUE_ADVANCED } });
    const fixtureCompetition = await prisma.competition.create({ data: {
      federationId: federation.id, tierId: tier.id,
      competitors: { create: Array.from({ length: 110 }, (_, seed) => ({ seed })) },
    } });
    const eventFixture = await prisma.match.create({ data: {
      date: new Date('2050-01-01T00:00:00Z'), payload: '{}', status: 0,
      competitionId: fixtureCompetition.id,
      competitors: { create: Array.from({ length: 110 }, (_, seed) => ({ seed })) },
      games: { create: [{ map: 'test', num: 1, status: 0,
        teams: { create: Array.from({ length: 110 }, (_, seed) => ({ seed })) },
      }] },
    } });
    const eventRows: Prisma.MatchEventUncheckedCreateInput[] = Array.from({ length: 2001 }, (_, index) => ({
      half: index % 2, headshot: index % 3 === 0, payload: JSON.stringify({ text: 'quoted " Unicode é', index }),
      result: index % 2 ? null : 'WIN', timestamp: new Date(1700000000123 + index * 1000),
      weapon: index % 2 ? 'awp' : null, matchId: eventFixture.id,
    }));
    const oldStatements: Prisma.Sql[] = [];
    for (let offset = 0; offset < eventRows.length; offset += 50) {
      oldStatements.push(Prisma.sql`INSERT INTO "MatchEvent" (
        "half", "headshot", "payload", "result", "timestamp", "weapon", "matchId",
        "attackerId", "assistId", "gameId", "victimId", "winnerId"
      ) VALUES ${Prisma.join(eventRows.slice(offset, offset + 50).map((event) => Prisma.sql`(
        ${event.half}, ${event.headshot ?? false}, ${event.payload}, ${event.result ?? null},
        ${event.timestamp}, ${event.weapon ?? null}, ${event.matchId}, ${event.attackerId ?? null},
        ${event.assistId ?? null}, ${event.gameId ?? null}, ${event.victimId ?? null}, ${event.winnerId ?? null}
      )`))}`);
    }
    const oldEventStarted = performance.now();
    await prisma.$transaction(oldStatements.map((sql) => prisma.$executeRaw(sql)));
    const oldEventMs = performance.now() - oldEventStarted;
    const readEvents = async () => (await prisma.matchEvent.findMany({
      where: { matchId: eventFixture.id }, orderBy: { id: 'asc' },
    })).map(({ id, ...event }) => event);
    const expectedEvents = await readEvents();
    await prisma.matchEvent.deleteMany({ where: { matchId: eventFixture.id } });
    const newEventStarted = performance.now();
    await prisma.$transaction(matchEventInsertBatches(eventRows).map((sql) => prisma.$executeRaw(sql)));
    const newEventMs = performance.now() - newEventStarted;
    assert.deepEqual(await readEvents(), expectedEvents, 'transport must preserve all event fields and ordering across batches');
    assert.deepEqual(matchEventInsertBatches([]), []);
    assert.throws(() => matchEventInsertBatches([{ ...eventRows[0], timestamp: new Date(NaN) }]), /timestamp/);
    await assert.rejects(prisma.$transaction(async (tx) => {
      for (const sql of matchEventInsertBatches([eventRows[0]])) await tx.$executeRaw(sql);
      throw new Error('event rollback');
    }), /event rollback/);
    assert.deepEqual(await readEvents(), expectedEvents);
    console.log(`2001 event writes: old ${oldEventMs.toFixed(1)}ms; new ${newEventMs.toFixed(1)}ms`);
    assert.deepEqual(numericUpdateBatches('Player', []), []);
    assert.throws(() => numericUpdateBatches('Player', [{ id: 1, data: { invalid: 2 } }]));
    assert.throws(() => numericUpdateBatches('Player', [{ id: 1, data: {} }, { id: 1, data: {} }]));

    for (const [table, model, fields] of [
      ['Player', 'player', ['xp', 'elo']],
      ['CompetitionToTeam', 'competitionToTeam', ['position', 'win', 'loss', 'draw']],
      ['MatchToTeam', 'matchToTeam', ['score', 'result']],
      ['GameToTeam', 'gameToTeam', ['score', 'result']],
    ] as const) {
      const delegate = prisma[model] as any;
      const select = Object.fromEntries(['id', ...fields].map((field) => [field, true]));
      const original = await delegate.findMany({ take: 110, orderBy: { id: 'asc' }, select });
      assert.ok(original.length, `${table} fixture must not be empty`);
      const updates = original.map((row: any, index: number) => ({
        id: row.id,
        data: Object.fromEntries(fields.map((field, column) => [field,
          index % 7 === 0 ? undefined : table !== 'Player' && index % 11 === 0 ? null : (index + column) % 3,
        ])),
      }));
      const prismaStart = performance.now();
      await prisma.$transaction(updates.map((row: any) => delegate.update({ where: { id: row.id }, data: row.data })));
      const prismaMs = performance.now() - prismaStart;
      const expected = await delegate.findMany({ where: { id: { in: original.map((row: any) => row.id) } }, orderBy: { id: 'asc' }, select });
      await prisma.$transaction(original.map(({ id, ...data }: any) => delegate.update({ where: { id }, data })));
      const bulkStart = performance.now();
      await prisma.$transaction(numericUpdateBatches(table, updates).map((sql) => prisma.$executeRaw(sql)));
      const bulkMs = performance.now() - bulkStart;
      const actual = await delegate.findMany({ where: { id: { in: original.map((row: any) => row.id) } }, orderBy: { id: 'asc' }, select });
      assert.deepEqual(actual, expected, `${table}: bulk writes must equal Prisma including omitted fields`);
      console.log(`${table}: ${original.length} rows; Prisma ${prismaMs.toFixed(1)}ms; bulk ${bulkMs.toFixed(1)}ms`);
    }

    const player = await prisma.player.findFirstOrThrow();
    await prisma.player.update({ where: { id: player.id }, data: { elo: 1000 } });
    const increment = numericUpdateBatches('Player', [{ id: player.id, data: { elo: -25 } }], true)[0];
    await prisma.player.update({ where: { id: player.id }, data: { elo: 1200 } });
    await prisma.$executeRaw(increment);
    assert.equal((await prisma.player.findUniqueOrThrow({ where: { id: player.id } })).elo, 1175);
    await assert.rejects(prisma.$transaction(async (tx) => {
      await tx.$executeRaw(increment);
      throw new Error('test rollback');
    }), /test rollback/);
    assert.equal((await prisma.player.findUniqueOrThrow({ where: { id: player.id } })).elo, 1175);

    const date = new Date('2050-01-31T23:59:59.999Z');
    const ranks = await prisma.$queryRaw<Array<{ id: number; rank: bigint }>>`
      SELECT id, RANK() OVER (ORDER BY elo DESC) AS rank FROM "Team"
    `;
    await prisma.$executeRaw(rankingSnapshotStatement(date));
    await prisma.$executeRaw(rankingSnapshotStatement(date));
    const snapshots = await prisma.teamRankingSnapshot.findMany({ where: { date } });
    assert.equal(snapshots.length, ranks.length, 'Date binding and idempotent upsert');
    for (const rank of ranks) assert.equal(snapshots.find((row) => row.teamId === rank.id)?.rank, Number(rank.rank));

    // Exercise the real match handler with statistics both enabled and off.
    const worldgen = require('./worldgen') as typeof import('./worldgen');
    const roundTeams = await prisma.team.findMany({ take: 4, orderBy: { id: 'asc' } });
    const roundCompetition = await prisma.competition.create({ data: {
      federationId: federation.id, tierId: tier.id,
      competitors: { create: roundTeams.map((team, index) => ({ teamId: team.id, seed: index + 1 })) },
    }, include: { competitors: true, tier: { include: { league: true } } } });
    const tournament = new Tournament(4, { short: true });
    roundCompetition.competitors.forEach((competitor) => tournament.addCompetitor(competitor.id));
    tournament.start();
    const initialRound = tournament.$base.currentRound(Constants.BracketIdentifier.UPPER);
    await worldgen.__npcWorldgenTest.createMatchdays(initialRound, tournament, roundCompetition);
    const readRound = () => prisma.match.findMany({
      where: { competitionId: roundCompetition.id }, orderBy: { id: 'asc' },
      include: { competitors: { orderBy: { id: 'asc' } }, games: { include: { teams: { orderBy: { id: 'asc' } } }, orderBy: { id: 'asc' } } },
    });
    const originalRound = await readRound();
    assert.ok(originalRound.length);
    const calendarBefore = await prisma.calendar.findMany({ where: { payload: { in: originalRound.map((match) => String(match.id)) }, type: { in: [Constants.CalendarEntry.MATCHDAY_NPC, Constants.CalendarEntry.MATCHDAY_USER] } }, orderBy: { id: 'asc' } });
    await worldgen.__npcWorldgenTest.createMatchdays(initialRound, tournament, roundCompetition);
    assert.deepEqual(await readRound(), originalRound, 'replaying a round must not duplicate competitors or games');
    assert.deepEqual(await prisma.calendar.findMany({ where: { id: { in: calendarBefore.map((entry) => entry.id) } }, orderBy: { id: 'asc' } }), calendarBefore, 'replaying must preserve dates and calendar flags');
    for (const match of initialRound) assert.ok(tournament.$base.score(match.id, [13, 5]));
    const nextRound = tournament.$base.currentRound(Constants.BracketIdentifier.UPPER);
    await worldgen.__npcWorldgenTest.createMatchdays(nextRound, tournament, roundCompetition);
    const afterProgression = await readRound();
    assert.ok(afterProgression.length > originalRound.length, 'next round must be scheduled');
    await worldgen.__npcWorldgenTest.createMatchdays(nextRound, tournament, roundCompetition);
    assert.deepEqual(await readRound(), afterProgression);
    const finalMatch = afterProgression.find((match) => !originalRound.some((old) => old.id === match.id))!;
    const missingTeamId = finalMatch.competitors[1].teamId;
    await prisma.matchToTeam.deleteMany({ where: { matchId: finalMatch.id, teamId: missingTeamId } });
    await prisma.gameToTeam.deleteMany({ where: { gameId: { in: finalMatch.games.map((game) => game.id) }, teamId: missingTeamId } });
    await prisma.match.update({ where: { id: finalMatch.id }, data: { status: Constants.MatchStatus.WAITING } });
    await worldgen.__npcWorldgenTest.createMatchdays(nextRound, tournament, roundCompetition);
    const filledFinal = (await readRound()).find((match) => match.id === finalMatch.id)!;
    assert.equal(filledFinal.status, Constants.MatchStatus.READY);
    assert.equal(filledFinal.competitors.length, 2);
    assert.ok(filledFinal.games.every((game) => game.teams.length === 2));
    assert.equal(filledFinal.date.getTime(), finalMatch.date.getTime());
    const teams = await prisma.team.findMany({
      where: { players: { some: { starter: true } } }, take: 2, orderBy: { id: 'asc' },
    });
    assert.equal(teams.length, 2);
    const profile = await prisma.profile.findFirstOrThrow();
    const scheduled: ScheduledMatch[] = Array.from({ length: 41 }, (_, index) => ({
      status: index % 2 ? Constants.MatchStatus.LOCKED : Constants.MatchStatus.COMPLETED,
      totalRounds: 6, round: 2, date, payload: `bulk-fixture-${index}`, competitionId: fixtureCompetition.id,
      calendarType: index % 2 ? Constants.CalendarEntry.MATCHDAY_NPC : null,
      competitors: index % 2 ? [] : [{ teamId: teams[0].id, seed: 1 }],
      maps: ['de_dust2', 'de_nuke', 'de_mirage'],
    }));
    await prisma.$transaction((tx) => insertScheduledMatches(tx, scheduled));
    for (const input of scheduled) {
      const saved = await prisma.match.findFirstOrThrow({ where: { competitionId: input.competitionId, payload: input.payload },
        include: { competitors: true, games: { include: { teams: true }, orderBy: { num: 'asc' } } } });
      assert.equal(saved.status, input.status);
      assert.equal(saved.date.getTime(), input.date.getTime());
      assert.deepEqual(saved.games.map((game) => game.map), input.maps);
      assert.equal(saved.competitors.length, input.competitors.length);
      assert.ok(saved.games.every((game) => game.teams.length === input.competitors.length));
      const entry = await prisma.calendar.findFirst({ where: { payload: String(saved.id), type: Constants.CalendarEntry.MATCHDAY_NPC } });
      assert.equal(Boolean(entry), input.calendarType != null, 'BYEs must not create calendar entries');
    }
    await assert.rejects(prisma.$transaction((tx) => insertScheduledMatches(tx, [
      { ...scheduled[0], payload: 'rollback-parent', competitors: [{ seed: 1, teamId: -99999 }] },
    ])));
    assert.equal(await prisma.match.count({ where: { payload: 'rollback-parent' } }), 0);
    let nextTestMatchId = Math.ceil(((await prisma.match.aggregate({ _max: { id: true } }))._max.id ?? 0) / 100 + 1) * 100;
    const phases = new Map<string, number>();
    for (const enabled of [true, false, ...Array<boolean>(20).fill(true)]) {
      await prisma.profile.update({ where: { id: profile.id }, data: { simulateNpcMatchStats: enabled } });
      const match = await prisma.match.create({ data: {
        id: nextTestMatchId++,
        date, payload: '{}', status: Constants.MatchStatus.READY, competitionId: fixtureCompetition.id,
        competitors: { create: teams.map((team, index) => ({ teamId: team.id, seed: index + 1 })) },
        games: { create: [{ map: 'de_dust2', num: 1, status: Constants.MatchStatus.READY,
          teams: { create: teams.map((team, index) => ({ teamId: team.id, seed: index + 1 })) },
        }] },
      } });
      await worldgen.onMatchdayNPC({ payload: String(match.id), date, type: Constants.CalendarEntry.MATCHDAY_NPC } as any,
        (name, ms) => phases.set(name, (phases.get(name) ?? 0) + ms));
      const result = await prisma.match.findUniqueOrThrow({ where: { id: match.id }, include: {
        competitors: true, games: { include: { teams: true } }, players: true,
      } });
      assert.equal(result.status, Constants.MatchStatus.COMPLETED);
      assert.ok(result.competitors.every((row) => row.score != null && row.result != null));
      if (enabled) {
        assert.equal(result.games[0].status, Constants.MatchStatus.COMPLETED);
        for (const score of result.games[0].teams) {
          const competitor = result.competitors.find((row) => row.teamId === score.teamId)!;
          assert.equal(score.score, competitor.score);
          assert.equal(score.result, competitor.result);
        }
        assert.ok(result.players.length > 0);
        await prisma.$transaction(matchPlayerLinkBatches(match.id, result.players.flatMap((player) => [player.id, player.id]))
          .map((sql) => prisma.$executeRaw(sql)));
        assert.equal((await prisma.match.findUniqueOrThrow({ where: { id: match.id }, include: { players: true } })).players.length, result.players.length);
        assert.ok(await prisma.matchEvent.count({ where: { matchId: match.id } }) > 0);
        assert.ok(await prisma.matchPlayerGameStat.count({ where: { matchId: match.id } }) > 0);
        const stats = await prisma.matchPlayerGameStat.findMany({ where: { matchId: match.id }, orderBy: { playerId: 'asc' } });
        const events = await prisma.matchEvent.findMany({ where: { matchId: match.id } });
        for (const stat of stats) {
          assert.equal(stat.kills, events.filter((event) => event.gameId === stat.gameKey && event.attackerId === stat.playerId).length);
          assert.equal(stat.assists, events.filter((event) => event.gameId === stat.gameKey && event.assistId === stat.playerId).length);
          assert.equal(stat.deaths, events.filter((event) => event.gameId === stat.gameKey && event.victimId === stat.playerId && event.assistId == null).length);
        }
        // Replacing existing aggregates must not increment/double-count them.
        await prisma.$transaction(matchStatUpsertBatches(stats).map((sql) => prisma.$executeRaw(sql)));
        assert.deepEqual(await prisma.matchPlayerGameStat.findMany({ where: { matchId: match.id }, orderBy: { playerId: 'asc' } }), stats);
      } else {
        assert.equal(result.games[0].status, Constants.MatchStatus.READY);
        assert.equal(await prisma.matchEvent.count({ where: { matchId: match.id } }), 0);
      }
    }
    console.log('22-match internal timings (ms):', Object.fromEntries(phases));

    // A contiguous NPC run writes independent matches together, but a team
    // appearing again forces a commit boundary before its next simulation.
    const batchTeams = await prisma.team.findMany({
      where: { players: { some: { starter: true } } }, take: 4, orderBy: { id: 'asc' },
    });
    assert.equal(batchTeams.length, 4);
    await prisma.profile.update({ where: { id: profile.id }, data: { simulateNpcMatchStats: true } });
    const makeBatchMatch = async (home: number, away: number, payload: string) => prisma.match.create({ data: {
      id: nextTestMatchId++, date, payload, status: Constants.MatchStatus.READY, competitionId: fixtureCompetition.id,
      competitors: { create: [{ teamId: home, seed: 1 }, { teamId: away, seed: 2 }] },
      games: { create: [{ map: 'de_dust2', num: 1, status: Constants.MatchStatus.READY,
        teams: { create: [{ teamId: home, seed: 1 }, { teamId: away, seed: 2 }] },
      }] },
    } });
    const first = await makeBatchMatch(batchTeams[0].id, batchTeams[1].id, 'batch-first');
    const independent = await makeBatchMatch(batchTeams[2].id, batchTeams[3].id, 'batch-independent');
    const repeat = await makeBatchMatch(batchTeams[0].id, batchTeams[2].id, 'batch-repeat');
    const batchTimings = new Map<string, { total: number; calls: number }>();
    await worldgen.onMatchdayNPCBatch(
      [first, independent, repeat].map((match) => ({
        payload: String(match.id), date, type: Constants.CalendarEntry.MATCHDAY_NPC,
      })) as any,
      (phase, ms) => {
        const timing = batchTimings.get(phase) ?? { total: 0, calls: 0 };
        timing.total += ms;
        timing.calls += 1;
        batchTimings.set(phase, timing);
      },
    );
    const completedBatch = await prisma.match.findMany({
      where: { id: { in: [first.id, independent.id, repeat.id] } },
      include: { competitors: true, games: { include: { teams: true } }, players: true },
    });
    assert.ok(completedBatch.every((match) => match.status === Constants.MatchStatus.COMPLETED));
    assert.ok(completedBatch.every((match) => match.competitors.every((competitor) => competitor.score != null)));
    assert.ok(completedBatch.every((match) => match.players.length > 0));
    assert.equal(batchTimings.get('match-batch-read')?.calls, 2, 'repeated team splits the read/write batch');
    assert.equal(batchTimings.get('match-batch-persist')?.calls, 2, 'repeated team commits before its next match');

    // Verify the optimized global identity sweep against its former nested
    // roster calculation, including tied countries/continents and short teams.
    const identityTeams = await prisma.team.findMany({ include: {
      players: { where: { starter: true }, include: { country: { include: { continent: true } } } },
    } });
    const identityCountries = await prisma.country.findMany();
    const countryByCode = new Map(identityCountries.map((country) => [country.code.toUpperCase(), country.id]));
    const expectedIdentities = identityTeams.map((team) => {
      if (team.players.length < 3) return { id: team.id, countryId: team.countryId };
      const countries = new Map<number, number>();
      const continents = new Map<string, number>();
      for (const player of team.players) {
        countries.set(player.countryId, (countries.get(player.countryId) ?? 0) + 1);
        const code = player.country.continent.code.toUpperCase();
        continents.set(code, (continents.get(code) ?? 0) + 1);
      }
      const country = [...countries].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
      const continent = [...continents].filter(([code]) => ['EU', 'NA', 'XSA', 'AS'].includes(code))
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
      const next = country?.[1] >= 3 ? country[0] : countryByCode.get(continent?.[0]) ?? countryByCode.get('OTHER');
      return { id: team.id, countryId: next ?? team.countryId };
    }).sort((a, b) => a.id - b.id);
    const identityStart = performance.now();
    await worldgen.recalculateAllTeamCountryIdentities();
    console.log(`Identity sweep: ${(performance.now() - identityStart).toFixed(1)}ms`);
    assert.deepEqual(await prisma.team.findMany({ select: { id: true, countryId: true }, orderBy: { id: 'asc' } }), expectedIdentities);

    // An unpublished MVP is still generated on its due date. Re-running
    // automatic news must preserve the stored article and create no duplicate.
    const news = require('./news') as typeof import('./news');
    const mvpPlayer = await prisma.player.findFirstOrThrow({ where: { teamId: teams[0].id } });
    await prisma.competitionMvp.create({ data: {
      competitionId: fixtureCompetition.id, playerId: mvpPlayer.id, teamId: teams[0].id,
      score: 1.5, rating: 1.3, maps: 10, placement: 1,
    } });
    await news.generateAutomaticItems(date);
    const article = await prisma.newsItem.findUniqueOrThrow({ where: { eventKey: `auto-news:competition-mvp:${fixtureCompetition.id}` } });
    await news.generateAutomaticItems(date);
    assert.deepEqual(await prisma.newsItem.findUniqueOrThrow({ where: { id: article.id } }), article);
    console.log('Simulation bulk-write equivalence tests passed.');
  } finally {
    await DatabaseClient.disconnect().catch((): void => {});
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
