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

  constructor(private readonly size: number, options: SwissOptions) {
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
      (match) =>
        match.id.s === matchId.s && match.id.r === matchId.r && match.id.m === matchId.m,
    );
  }

  public isDone() {
    const completedRounds = this.rounds().filter((round) => round.every((match) => !!match.m)).length;
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
        ([, record]) => record.wins < this.options.maxWins && record.losses < this.options.maxLosses,
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

      while (seeds.length >= 2) {
        const home = seeds.shift() as number;
        const awayIdx = seeds.findIndex((seed) => !this.records[home].opponents.includes(seed));
        const away = awayIdx > -1 ? (seeds.splice(awayIdx, 1)[0] as number) : (seeds.shift() as number);
        pairings.push([home, away]);
      }

      if (seeds.length === 1) {
        floatSeed = seeds.shift() as number;
      }
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

type TournamentOptions = Clux.GroupStageOptions | Clux.DuelOptions | { swiss: SwissOptions };

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
    return this.swiss || this.groups || this.brackets;
  }

  public get standings() {
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
    return this.groups?.groupFor(seed as number) || BracketIdentifier.UPPER;
  }

  public save() {
    if (this.swiss) {
      return {
        competitors: this.competitors,
        swiss: this.swiss.save(),
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

    if (this.options && 'groupSize' in this.options && this.options.groupSize) {
      this.groups = new GroupStage(this.size, this.options as Clux.GroupStageOptions);
      return;
    }

    this.brackets = new Duel(this.size, this.options as Clux.DuelOptions);
  }
}
