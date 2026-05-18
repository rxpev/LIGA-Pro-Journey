/**
 * Provides utilities, helpers, and typings necessary
 * to manage a tournament instance.
 *
 * @module
 */
import Duel from 'duel';
import GroupStage from 'groupstage';
import { groupBy, sortBy, uniq } from 'lodash';
import { BracketIdentifier } from './constants';

interface SwissOptions {
  maxLosses: number;
  maxRounds: number;
  maxWins: number;
}

interface SwissMatch extends Clux.Match {
  m: [number, number] | null;
}

interface IemGroupOptions {
  iemGroup: true;
  last: BracketIdentifier.LOWER;
  short: true;
}

interface IemGroupMatch extends Clux.Match {
  m: [number, number] | null;
}

interface IemGroupTournamentState {
  matches: IemGroupMatch[];
  records: Record<number, { losses: number; wins: number }>;
  size: number;
}

interface GroupSwissOptions {
  groupSize: number;
  groupSwiss: true;
  maxLosses: number;
  maxRounds: number;
  maxWins: number;
}

interface GroupSwissMatch extends Clux.Match {
  m: [number, number] | null;
}

interface GroupSwissTournamentState {
  matches: GroupSwissMatch[];
  options: GroupSwissOptions;
  records: Record<number, { group: number; losses: number; opponents: number[]; wins: number }>;
  size: number;
}

interface SwissTournamentState {
  matches: SwissMatch[];
  options: SwissOptions;
  records: Record<number, { losses: number; opponents: number[]; wins: number }>;
  size: number;
}

class SwissTournament {
  public readonly options: SwissOptions;
  private matches: SwissMatch[];
  private readonly records: Record<number, { losses: number; opponents: number[]; wins: number }>;

  constructor(
    private readonly size: number,
    options: SwissOptions,
  ) {
    this.options = options;
    this.matches = [];
    this.records = {};

    for (let seed = 1; seed <= size; seed += 1) {
      this.records[seed] = { losses: 0, opponents: [], wins: 0 };
    }
  }

  public static restore(data: SwissTournamentState) {
    const instance = new SwissTournament(data.size, data.options);
    instance.matches = data.matches;
    Object.keys(data.records).forEach((seed) => {
      instance.records[Number(seed)] = data.records[Number(seed)];
    });
    return instance;
  }

  public currentRound() {
    return this.rounds().find((round) => round.some((match) => !match.m)) || [];
  }

  public findMatch(matchId: Clux.MatchId) {
    return this.matches.find(
      (match) => match.id.s === matchId.s && match.id.r === matchId.r && match.id.m === matchId.m,
    );
  }

  public isDone() {
    const completedRounds = this.rounds().filter((round) =>
      round.every((match) => !!match.m),
    ).length;
    const allSettled = Object.values(this.records).every(
      ({ losses, wins }) => losses >= this.options.maxLosses || wins >= this.options.maxWins,
    );

    return completedRounds >= this.options.maxRounds || allSettled;
  }

  public metadata() {
    return {
      options: this.options,
      records: this.records,
    };
  }

  public results() {
    return sortBy(
      Object.entries(this.records).map(([seed, record]) => ({
        draws: 0,
        losses: record.losses,
        pts: record.wins * 3,
        seed: Number(seed),
        wins: record.wins,
      })),
      [(entry) => -entry.wins, (entry) => entry.losses, (entry) => entry.seed],
    ).map((entry, index) => ({ ...entry, gpos: index + 1, pos: index + 1 }));
  }

  public resultsFor(seed: number) {
    return this.results().find((entry) => entry.seed === seed);
  }

  public rounds() {
    const grouped = groupBy(this.matches, 'id.r');
    return Object.keys(grouped)
      .map((round) => Number(round))
      .sort((a, b) => a - b)
      .map((round) => grouped[round]);
  }

  public score(matchId: Clux.MatchId, mapScore: number[]) {
    const match = this.findMatch(matchId);

    if (!match || !Array.isArray(mapScore) || mapScore.length < 2 || mapScore[0] === mapScore[1]) {
      return false;
    }

    if (match.m) {
      return false;
    }

    const [homeSeed, awaySeed] = match.p;
    match.m = [mapScore[0], mapScore[1]];

    if (homeSeed > 0 && awaySeed > 0) {
      this.records[homeSeed].opponents.push(awaySeed);
      this.records[awaySeed].opponents.push(homeSeed);
    }

    if (awaySeed < 0) {
      this.records[homeSeed].wins += 1;
      return true;
    }

    if (mapScore[0] > mapScore[1]) {
      this.records[homeSeed].wins += 1;
      this.records[awaySeed].losses += 1;
      return true;
    }

    this.records[awaySeed].wins += 1;
    this.records[homeSeed].losses += 1;
    return true;
  }

  public save(): SwissTournamentState {
    return {
      matches: this.matches,
      options: this.options,
      records: this.records,
      size: this.size,
    };
  }

  public start() {
    this.generateNextRound();
  }

  private buildPairings(seeds: number[], allowRematches = false): Array<[number, number]> | null {
    if (seeds.length === 0) {
      return [];
    }

    const [home, ...rest] = seeds;

    for (let idx = 0; idx < rest.length; idx += 1) {
      const away = rest[idx];

      if (!allowRematches && this.records[home].opponents.includes(away)) {
        continue;
      }

      const remainingSeeds = [...rest.slice(0, idx), ...rest.slice(idx + 1)];
      const remainingPairings = this.buildPairings(remainingSeeds, allowRematches);

      if (remainingPairings) {
        return [[home, away], ...remainingPairings];
      }
    }

    return null;
  }

  public generateNextRound() {
    const currentRound = this.currentRound();

    if (currentRound.length > 0 || this.isDone()) {
      return [];
    }

    const nextRound = this.rounds().length + 1;
    if (nextRound > this.options.maxRounds) {
      return [];
    }

    const activeSeeds = Object.entries(this.records)
      .filter(
        ([, record]) =>
          record.wins < this.options.maxWins && record.losses < this.options.maxLosses,
      )
      .map(([seed]) => Number(seed));

    const groupedSeeds = groupBy(activeSeeds, (seed) => {
      const record = this.records[seed];
      return `${record.wins}-${record.losses}`;
    });

    const scoreKeys = Object.keys(groupedSeeds).sort((a, b) => {
      const [aWins, aLosses] = a.split('-').map(Number);
      const [bWins, bLosses] = b.split('-').map(Number);
      if (aWins !== bWins) return bWins - aWins;
      return aLosses - bLosses;
    });

    let floatSeed: number | null = null;
    const pairings: Array<[number, number]> = [];

    scoreKeys.forEach((key) => {
      const seeds = sortBy(groupedSeeds[key], (seed) => seed);

      if (floatSeed != null) {
        seeds.unshift(floatSeed);
        floatSeed = null;
      }

      const floatCandidates =
        seeds.length % 2 === 1
          ? [...seeds.keys()].reverse().map((idx) => seeds[idx] as number)
          : [null];

      let groupPairings: Array<[number, number]> | null = null;
      let nextFloatSeed: number | null = null;

      for (const candidate of floatCandidates) {
        const pairingSeeds =
          candidate == null ? [...seeds] : seeds.filter((seed) => seed !== candidate);
        const candidatePairings = this.buildPairings(pairingSeeds);

        if (candidatePairings) {
          groupPairings = candidatePairings;
          nextFloatSeed = candidate;
          break;
        }
      }

      if (!groupPairings) {
        throw new Error(`Unable to generate non-rematch swiss pairings for record bucket ${key}.`);
      }

      pairings.push(...groupPairings);
      floatSeed = nextFloatSeed;
    });

    if (floatSeed != null) {
      pairings.push([floatSeed, -1]);
    }

    const newMatches: SwissMatch[] = pairings.map(([home, away], idx) => ({
      data: {},
      id: {
        m: idx + 1,
        r: nextRound,
        s: BracketIdentifier.UPPER,
      },
      m: away < 0 ? [1, 0] : null,
      p: [home, away],
    }));

    newMatches.forEach((match) => {
      if (match.p[1] < 0) {
        this.records[match.p[0]].wins += 1;
      }
    });

    this.matches = [...this.matches, ...newMatches];
    return newMatches;
  }
}

class GroupSwissTournament {
  public readonly options: GroupSwissOptions;
  private matches: GroupSwissMatch[];
  private readonly records: Record<
    number,
    { group: number; losses: number; opponents: number[]; wins: number }
  >;

  constructor(
    private readonly size: number,
    options: GroupSwissOptions,
  ) {
    this.options = options;
    this.matches = [];
    this.records = {};

    for (let seed = 1; seed <= size; seed += 1) {
      this.records[seed] = {
        group: Math.ceil(seed / options.groupSize),
        losses: 0,
        opponents: [],
        wins: 0,
      };
    }
  }

  public static restore(data: GroupSwissTournamentState) {
    const instance = new GroupSwissTournament(data.size, data.options);
    instance.matches = data.matches;
    Object.keys(data.records).forEach((seed) => {
      instance.records[Number(seed)] = data.records[Number(seed)];
    });
    return instance;
  }

  public currentRound() {
    return this.rounds().find((round) => round.some((match) => !match.m)) || [];
  }

  public findMatch(matchId: Clux.MatchId) {
    return this.matches.find(
      (match) => match.id.s === matchId.s && match.id.r === matchId.r && match.id.m === matchId.m,
    );
  }

  public groupFor(seed: number) {
    return this.records[seed]?.group || BracketIdentifier.UPPER;
  }

  public isDone() {
    const completedRounds = this.rounds().filter((round) =>
      round.every((match) => !!match.m),
    ).length;
    const allSettled = Object.values(this.records).every(
      ({ losses, wins }) => losses >= this.options.maxLosses || wins >= this.options.maxWins,
    );

    return completedRounds >= this.options.maxRounds || allSettled;
  }

  public metadata() {
    return {
      options: this.options,
      records: this.records,
    };
  }

  public results() {
    return Object.entries(
      groupBy(Object.keys(this.records).map(Number), (seed) => this.records[seed].group),
    ).flatMap(([group, seeds]) =>
      sortBy(
        seeds.map((seed) => {
          const record = this.records[seed];
          return {
            draws: 0,
            grp: Number(group),
            losses: record.losses,
            pts: record.wins * 3,
            seed,
            wins: record.wins,
          };
        }),
        [(entry) => -entry.wins, (entry) => entry.losses, (entry) => entry.seed],
      ).map((entry, index) => ({ ...entry, gpos: index + 1, pos: index + 1 })),
    );
  }

  public resultsFor(seed: number) {
    return this.results().find((entry) => entry.seed === seed);
  }

  public rounds() {
    const grouped = groupBy(this.matches, 'id.r');
    return Object.keys(grouped)
      .map((round) => Number(round))
      .sort((a, b) => a - b)
      .map((round) => grouped[round]);
  }

  public save(): GroupSwissTournamentState {
    return {
      matches: this.matches,
      options: this.options,
      records: this.records,
      size: this.size,
    };
  }

  public score(matchId: Clux.MatchId, mapScore: number[]) {
    const match = this.findMatch(matchId);

    if (!match || !Array.isArray(mapScore) || mapScore.length < 2 || mapScore[0] === mapScore[1]) {
      return false;
    }

    if (match.m) {
      return false;
    }

    const [homeSeed, awaySeed] = match.p;
    if (homeSeed < 1 || awaySeed < 1) {
      return false;
    }

    match.m = [mapScore[0], mapScore[1]];
    this.records[homeSeed].opponents.push(awaySeed);
    this.records[awaySeed].opponents.push(homeSeed);

    if (mapScore[0] > mapScore[1]) {
      this.records[homeSeed].wins += 1;
      this.records[awaySeed].losses += 1;
      return true;
    }

    this.records[awaySeed].wins += 1;
    this.records[homeSeed].losses += 1;
    return true;
  }

  public start() {
    this.generateNextRound();
  }

  private buildPairings(seeds: number[], allowRematches = false): Array<[number, number]> | null {
    if (seeds.length === 0) {
      return [];
    }

    const [home, ...rest] = seeds;

    for (let idx = 0; idx < rest.length; idx += 1) {
      const away = rest[idx];

      if (!allowRematches && this.records[home].opponents.includes(away)) {
        continue;
      }

      const remainingSeeds = [...rest.slice(0, idx), ...rest.slice(idx + 1)];
      const remainingPairings = this.buildPairings(remainingSeeds, allowRematches);

      if (remainingPairings) {
        return [[home, away], ...remainingPairings];
      }
    }

    return null;
  }

  public generateNextRound() {
    const currentRound = this.currentRound();

    if (currentRound.length > 0 || this.isDone()) {
      return [];
    }

    const nextRound = this.rounds().length + 1;
    if (nextRound > this.options.maxRounds) {
      return [];
    }

    const pairings = Object.entries(
      groupBy(Object.keys(this.records).map(Number), (seed) => this.records[seed].group),
    ).flatMap(([group, seeds]) => {
      const activeSeeds = sortBy(
        seeds.filter((seed) => {
          const record = this.records[seed];
          return record.wins < this.options.maxWins && record.losses < this.options.maxLosses;
        }),
        (seed) => seed,
      );

      if (activeSeeds.length < 2) {
        return [];
      }

      const groupPairings =
        nextRound === 1 ? this.pairOpeningRound(activeSeeds) : this.pairByRecord(activeSeeds);

      return groupPairings.map(([home, away], idx) => ({
        group: Number(group),
        match: idx + 1,
        seeds: [home, away] as [number, number],
      }));
    });

    const newMatches: GroupSwissMatch[] = pairings.map(({ group, match, seeds }) => ({
      data: {},
      id: {
        m: match,
        r: nextRound,
        s: group,
      },
      m: null as [number, number] | null,
      p: seeds,
    }));

    this.matches = [...this.matches, ...newMatches];
    return newMatches;
  }

  private pairByRecord(seeds: number[]) {
    return Object.keys(
      groupBy(seeds, (seed) => `${this.records[seed].wins}-${this.records[seed].losses}`),
    )
      .sort((a, b) => {
        const [aWins, aLosses] = a.split('-').map(Number);
        const [bWins, bLosses] = b.split('-').map(Number);
        if (aWins !== bWins) return bWins - aWins;
        return aLosses - bLosses;
      })
      .flatMap((key) => {
        const bucket = sortBy(
          seeds.filter((seed) => `${this.records[seed].wins}-${this.records[seed].losses}` === key),
          (seed) => seed,
        );
        return this.buildPairings(bucket) || this.buildPairings(bucket, true) || [];
      });
  }

  private pairOpeningRound(seeds: number[]) {
    const orderedSeeds = sortBy(seeds, (seed) => seed);
    const pairings: Array<[number, number]> = [];

    while (orderedSeeds.length > 1) {
      pairings.push([orderedSeeds.shift(), orderedSeeds.pop()] as [number, number]);
    }

    return pairings;
  }
}

class IemGroupTournament {
  public readonly options: IemGroupOptions = {
    iemGroup: true,
    last: BracketIdentifier.LOWER,
    short: true,
  };

  private matches: IemGroupMatch[];
  private readonly records: Record<number, { losses: number; wins: number }>;

  constructor(private readonly size: number) {
    this.matches = [];
    this.records = {};

    for (let seed = 1; seed <= size; seed += 1) {
      this.records[seed] = { losses: 0, wins: 0 };
    }
  }

  public static restore(data: IemGroupTournamentState) {
    const instance = new IemGroupTournament(data.size);
    instance.matches = data.matches;
    Object.keys(data.records).forEach((seed) => {
      instance.records[Number(seed)] = data.records[Number(seed)];
    });
    return instance;
  }

  public currentRound(section?: BracketIdentifier) {
    const readyRounds = this.rounds()
      .map((round) =>
        round.filter((match) => (!section || match.id.s === section) && this.isReady(match)),
      )
      .filter((round) => round.length > 0);

    return readyRounds[0] || [];
  }

  public down(id: Clux.MatchId): [Clux.MatchId, number] | null {
    if (id.s !== BracketIdentifier.UPPER) {
      return null;
    }

    const target = this.loserTarget(id);
    return target ? [target, 0] : null;
  }

  public findMatch(matchId: Clux.MatchId) {
    return this.matches.find(
      (match) => match.id.s === matchId.s && match.id.r === matchId.r && match.id.m === matchId.m,
    );
  }

  public generateNextRound() {
    if (this.isDone()) {
      return [];
    }

    const additions: IemGroupMatch[] = [];

    if (
      this.allScored(BracketIdentifier.UPPER, 1) &&
      !this.findByRound(BracketIdentifier.UPPER, 2).length
    ) {
      additions.push(
        this.createMatch(BracketIdentifier.UPPER, 2, 1, [
          this.winner({ s: BracketIdentifier.UPPER, r: 1, m: 1 }),
          this.winner({ s: BracketIdentifier.UPPER, r: 1, m: 2 }),
        ]),
        this.createMatch(BracketIdentifier.UPPER, 2, 2, [
          this.winner({ s: BracketIdentifier.UPPER, r: 1, m: 3 }),
          this.winner({ s: BracketIdentifier.UPPER, r: 1, m: 4 }),
        ]),
        this.createMatch(BracketIdentifier.LOWER, 1, 1, [
          this.loser({ s: BracketIdentifier.UPPER, r: 1, m: 3 }),
          this.loser({ s: BracketIdentifier.UPPER, r: 1, m: 4 }),
        ]),
        this.createMatch(BracketIdentifier.LOWER, 1, 2, [
          this.loser({ s: BracketIdentifier.UPPER, r: 1, m: 1 }),
          this.loser({ s: BracketIdentifier.UPPER, r: 1, m: 2 }),
        ]),
      );
    }

    if (
      this.allScored(BracketIdentifier.UPPER, 2) &&
      this.allScored(BracketIdentifier.LOWER, 1) &&
      !this.findByRound(BracketIdentifier.UPPER, 3).length
    ) {
      additions.push(
        this.createMatch(BracketIdentifier.UPPER, 3, 1, [
          this.winner({ s: BracketIdentifier.UPPER, r: 2, m: 1 }),
          this.winner({ s: BracketIdentifier.UPPER, r: 2, m: 2 }),
        ]),
        this.createMatch(BracketIdentifier.LOWER, 2, 1, [
          this.winner({ s: BracketIdentifier.LOWER, r: 1, m: 1 }),
          this.loser({ s: BracketIdentifier.UPPER, r: 2, m: 2 }),
        ]),
        this.createMatch(BracketIdentifier.LOWER, 2, 2, [
          this.winner({ s: BracketIdentifier.LOWER, r: 1, m: 2 }),
          this.loser({ s: BracketIdentifier.UPPER, r: 2, m: 1 }),
        ]),
      );
    }

    if (
      this.allScored(BracketIdentifier.LOWER, 2) &&
      !this.findByRound(BracketIdentifier.LOWER, 3).length
    ) {
      additions.push(
        this.createMatch(BracketIdentifier.LOWER, 3, 1, [
          this.winner({ s: BracketIdentifier.LOWER, r: 2, m: 1 }),
          this.winner({ s: BracketIdentifier.LOWER, r: 2, m: 2 }),
        ]),
      );
    }

    this.matches = [...this.matches, ...additions];
    return additions;
  }

  public isDone() {
    return this.allScored(BracketIdentifier.UPPER, 3) && this.allScored(BracketIdentifier.LOWER, 3);
  }

  public metadata() {
    return { options: this.options, records: this.records };
  }

  public results() {
    const placed = new Map<number, number>();
    this.matches
      .filter((match) => match.m)
      .forEach((match) => {
        const loser = this.loser(match.id);

        if (match.id.s === BracketIdentifier.LOWER && match.id.r === 1) {
          placed.set(loser, match.id.m === 1 ? 7 : 8);
        }

        if (match.id.s === BracketIdentifier.LOWER && match.id.r === 2) {
          placed.set(loser, match.id.m === 1 ? 5 : 6);
        }

        if (match.id.s === BracketIdentifier.LOWER && match.id.r === 3) {
          placed.set(this.winner(match.id), 3);
          placed.set(loser, 4);
        }

        if (match.id.s === BracketIdentifier.UPPER && match.id.r === 3) {
          placed.set(this.winner(match.id), 1);
          placed.set(loser, 2);
        }
      });

    return sortBy(
      Object.entries(this.records).map(([seed, record]) => {
        const seedNumber = Number(seed);
        const pos = placed.get(seedNumber) || this.size;
        return {
          draws: 0,
          losses: record.losses,
          pts: record.wins * 3,
          seed: seedNumber,
          wins: record.wins,
          gpos: pos,
          pos,
        };
      }),
      [
        (entry) => entry.pos,
        (entry) => -entry.wins,
        (entry) => entry.losses,
        (entry) => entry.seed,
      ],
    );
  }

  public resultsFor(seed: number) {
    return this.results().find((entry) => entry.seed === seed);
  }

  public right(id: Clux.MatchId): [Clux.MatchId, number] | null {
    const target = this.winnerTarget(id);
    return target ? [target, 0] : null;
  }

  public rounds() {
    const grouped = groupBy(this.matches, (match) => `${match.id.s}:${match.id.r}`);
    return Object.keys(grouped)
      .map((round) => {
        const [section, roundNumber] = round.split(':').map(Number);
        return { round, section, roundNumber };
      })
      .sort((a, b) => a.roundNumber - b.roundNumber || a.section - b.section)
      .map(({ round }) => grouped[round]);
  }

  public save(): IemGroupTournamentState {
    return {
      matches: this.matches,
      records: this.records,
      size: this.size,
    };
  }

  public score(matchId: Clux.MatchId, mapScore: number[]) {
    const match = this.findMatch(matchId);

    if (!match || !Array.isArray(mapScore) || mapScore.length < 2 || mapScore[0] === mapScore[1]) {
      return false;
    }

    if (match.m) {
      return false;
    }

    const [homeSeed, awaySeed] = match.p;
    if (homeSeed < 1 || awaySeed < 1) {
      return false;
    }

    match.m = [mapScore[0], mapScore[1]];
    const winningSeed = mapScore[0] > mapScore[1] ? homeSeed : awaySeed;
    const losingSeed = winningSeed === homeSeed ? awaySeed : homeSeed;
    this.records[winningSeed].wins += 1;
    this.records[losingSeed].losses += 1;
    return true;
  }

  public start() {
    if (this.size !== 8) {
      throw new Error('IEM group brackets require exactly 8 teams.');
    }

    this.matches = [
      this.createMatch(BracketIdentifier.UPPER, 1, 1, [1, 8]),
      this.createMatch(BracketIdentifier.UPPER, 1, 2, [4, 5]),
      this.createMatch(BracketIdentifier.UPPER, 1, 3, [3, 6]),
      this.createMatch(BracketIdentifier.UPPER, 1, 4, [2, 7]),
    ];
  }

  private allScored(section: BracketIdentifier, round: number) {
    const matches = this.findByRound(section, round);
    return matches.length > 0 && matches.every((match) => !!match.m);
  }

  private createMatch(
    section: BracketIdentifier,
    round: number,
    match: number,
    seeds: [number, number],
  ): IemGroupMatch {
    return {
      data: {},
      id: {
        m: match,
        r: round,
        s: section,
      },
      m: null,
      p: seeds,
    };
  }

  private findByRound(section: BracketIdentifier, round: number) {
    return this.matches.filter((match) => match.id.s === section && match.id.r === round);
  }

  private isReady(match: IemGroupMatch) {
    return !match.m && match.p.every((seed) => seed > 0);
  }

  private loser(id: Clux.MatchId) {
    const match = this.findMatch(id);
    if (!match?.m) {
      return 0;
    }
    return match.m[0] > match.m[1] ? match.p[1] : match.p[0];
  }

  private loserTarget(id: Clux.MatchId): Clux.MatchId | null {
    if (id.s !== BracketIdentifier.UPPER) {
      return null;
    }

    if (id.r === 1) {
      return {
        s: BracketIdentifier.LOWER,
        r: 1,
        m: id.m > 2 ? 1 : 2,
      };
    }

    if (id.r === 2) {
      return {
        s: BracketIdentifier.LOWER,
        r: 2,
        m: id.m === 2 ? 1 : 2,
      };
    }

    return null;
  }

  private winner(id: Clux.MatchId) {
    const match = this.findMatch(id);
    if (!match?.m) {
      return 0;
    }
    return match.m[0] > match.m[1] ? match.p[0] : match.p[1];
  }

  private winnerTarget(id: Clux.MatchId): Clux.MatchId | null {
    if (id.s === BracketIdentifier.UPPER) {
      if (id.r === 1) {
        return {
          s: BracketIdentifier.UPPER,
          r: 2,
          m: id.m <= 2 ? 1 : 2,
        };
      }

      if (id.r === 2) {
        return {
          s: BracketIdentifier.UPPER,
          r: 3,
          m: 1,
        };
      }
    }

    if (id.s === BracketIdentifier.LOWER) {
      if (id.r === 1) {
        return {
          s: BracketIdentifier.LOWER,
          r: 2,
          m: id.m,
        };
      }

      if (id.r === 2) {
        return {
          s: BracketIdentifier.LOWER,
          r: 3,
          m: 1,
        };
      }
    }

    return null;
  }
}

type TournamentOptions =
  | Clux.GroupStageOptions
  | Clux.DuelOptions
  | GroupSwissOptions
  | IemGroupOptions
  | { swiss: SwissOptions };

/**
 * Tournament class that wraps the group stage and duel modules and
 * provides a mapping between team ids and competitor seed numbers.
 *
 * @class
 */
export default class Tournament {
  public brackets: Duel;
  public competitors: Array<number>;
  public groups: GroupStage;
  public groupSwiss: GroupSwissTournament;
  public iemGroup: IemGroupTournament;
  public options: TournamentOptions;
  public size: number;
  public swiss: SwissTournament;

  constructor(size: number, options?: TournamentOptions) {
    this.size = size;
    this.competitors = [];
    this.options = options as TournamentOptions;
  }

  public static restore(data: ReturnType<Tournament['save']>) {
    let instance: Tournament;

    if ('swiss' in data) {
      instance = new Tournament(data.swiss.size, { swiss: data.swiss.options });
      instance.swiss = SwissTournament.restore(data.swiss);
    } else if ('groupSwiss' in data) {
      instance = new Tournament(data.groupSwiss.size, data.groupSwiss.options);
      instance.groupSwiss = GroupSwissTournament.restore(data.groupSwiss);
    } else if ('iemGroup' in data) {
      instance = new Tournament(data.iemGroup.size, {
        iemGroup: true,
        last: BracketIdentifier.LOWER,
        short: true,
      });
      instance.iemGroup = IemGroupTournament.restore(data.iemGroup);
      instance.brackets = instance.iemGroup as unknown as Duel;
    } else if ('groups' in data) {
      instance = new Tournament(data.groups.size, data.groups.options as Clux.GroupStageOptions);
      instance.groups = GroupStage.restore(
        instance.size,
        data.groups.options as Clux.GroupStageOptions,
        data.groups.state,
        data.groups.metadata,
      );
    } else {
      instance = new Tournament(data.brackets.size, data.brackets.options as Clux.DuelOptions);
      instance.brackets = Duel.restore(
        instance.size,
        data.brackets.options as Clux.DuelOptions,
        data.brackets.state,
        data.brackets.metadata,
      );
    }

    instance.addCompetitors(data.competitors);
    return instance;
  }

  public get $base() {
    return this.swiss || this.groupSwiss || this.iemGroup || this.groups || this.brackets;
  }

  public get standings() {
    if (this.groupSwiss) {
      const standings = groupBy(this.groupSwiss.results(), 'grp');
      return Object.keys(standings).map((groupId) => sortBy(standings[groupId], 'gpos'));
    }

    if (this.groups) {
      const standings = groupBy(this.groups.results(), 'grp');
      return Object.keys(standings).map((groupId) => sortBy(standings[groupId], 'gpos'));
    }

    return sortBy(this.$base.results(), 'pos');
  }

  public addCompetitor(id: number) {
    this.competitors = uniq([...this.competitors, id]);
  }

  public addCompetitors(ids: Array<number>) {
    this.competitors = uniq([...this.competitors, ...ids]);
  }

  public getCompetitorBySeed(seed: number) {
    return this.competitors[seed - 1];
  }

  public getSeedByCompetitorId(id: number) {
    const idx = this.competitors.findIndex((competitor) => competitor === id);
    return idx > -1 ? idx + 1 : null;
  }

  public getGroupByCompetitorId(id: number) {
    const seed = this.getSeedByCompetitorId(id);
    return (
      this.groupSwiss?.groupFor(seed as number) ||
      this.groups?.groupFor(seed as number) ||
      BracketIdentifier.UPPER
    );
  }

  public save() {
    if (this.swiss) {
      return {
        competitors: this.competitors,
        swiss: this.swiss.save(),
      };
    }

    if (this.groupSwiss) {
      return {
        competitors: this.competitors,
        groupSwiss: this.groupSwiss.save(),
      };
    }

    if (this.iemGroup) {
      return {
        competitors: this.competitors,
        iemGroup: this.iemGroup.save(),
      };
    }

    if (this.groups) {
      return {
        competitors: this.competitors,
        groups: {
          metadata: this.groups.metadata(),
          options: this.options,
          size: this.size,
          state: this.groups.state.slice(),
        },
      };
    }

    return {
      competitors: this.competitors,
      brackets: {
        metadata: this.brackets.metadata(),
        options: this.options,
        size: this.size,
        state: this.brackets.state.slice(),
      },
    };
  }

  public start() {
    if (this.options && 'swiss' in this.options) {
      this.swiss = new SwissTournament(this.size, this.options.swiss);
      this.swiss.start();
      return;
    }

    if (this.options && 'groupSwiss' in this.options) {
      this.groupSwiss = new GroupSwissTournament(this.size, this.options);
      this.groupSwiss.start();
      return;
    }

    if (this.options && 'iemGroup' in this.options) {
      this.iemGroup = new IemGroupTournament(this.size);
      this.iemGroup.start();
      this.brackets = this.iemGroup as unknown as Duel;
      return;
    }

    if (this.options && 'groupSize' in this.options && this.options.groupSize) {
      this.groups = new GroupStage(this.size, this.options as Clux.GroupStageOptions);
      return;
    }

    this.brackets = new Duel(this.size, this.options as Clux.DuelOptions);
  }
}
