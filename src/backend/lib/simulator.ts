/**
 * Simulates match scores.
 *
 * @see {score}
 * @module
 */
import type { Prisma } from '@prisma/client';
import log from 'electron-log';
import { Constants, Bot, Util } from '@liga/shared';

/** @constant */
let simScaleFactor: number | null | undefined;

/**
 * Overrides the simulation scaling factor via command-line
 * arguments if they are passed to the app (prod only).
 *
 * Additionally, caches the value in `simScaleFactor`
 * to reduce redundent calls during the game loop.
 *
 * @function
 */
function getSimScaleFactor() {
  if (simScaleFactor !== undefined) {
    return simScaleFactor;
  }

  const argPrefix = '--sim-scale';
  const args = process.argv.slice(1);
  const idx = args.findIndex((arg) => arg === argPrefix);

  if (idx !== -1 && args.length > idx + 1) {
    const value = Number(args[idx + 1]);

    if (!Number.isNaN(value) && Number.isFinite(value)) {
      simScaleFactor = value;
      return simScaleFactor;
    }
  }
}

/** @type {Team} */
type Team = Prisma.TeamGetPayload<{ include: { players: true } }>;

export type MapScore = Record<number, number>;

export interface SeriesScore {
  maps: Array<MapScore>;
  score: MapScore;
}

/** @enum */
enum SimulationResult {
  DRAW = 12,
}

type ScorelineBand = 'overtime' | 'close' | 'medium' | 'stomp';

export interface SimulatedScoreline {
  winner: number;
  loser: number;
  band: ScorelineBand;
}

interface WeightedScoreline extends SimulatedScoreline {
  /** Unconditional HLTV probability for this scoreline at neutral strength. */
  weight: number;
}

/**
 * CS2 scoreline targets derived from the supplied HLTV sample:
 * - overtime: 11.70%
 * - 13-11 through 13-9: 33.85%
 * - 13-8 through 13-5: 37.15%
 * - 13-4 through 13-0: 17.30%
 * - specifically 13-0: 0.6146%
 *
 * The exact-score split within each broader bucket is intentionally smooth;
 * only the bucket totals and 13-0 rate are externally calibrated.
 */
const BASE_SCORELINES: ReadonlyArray<WeightedScoreline> = [
  { winner: 16, loser: 14, band: 'overtime', weight: 0.0702 },
  { winner: 16, loser: 13, band: 'overtime', weight: 0.0234 },
  { winner: 16, loser: 12, band: 'overtime', weight: 0.00936 },
  { winner: 19, loser: 17, band: 'overtime', weight: 0.00819 },
  { winner: 19, loser: 16, band: 'overtime', weight: 0.002925 },
  { winner: 19, loser: 15, band: 'overtime', weight: 0.00117 },
  { winner: 22, loser: 20, band: 'overtime', weight: 0.00117 },
  { winner: 22, loser: 19, band: 'overtime', weight: 0.000351 },
  { winner: 22, loser: 18, band: 'overtime', weight: 0.000234 },
  { winner: 13, loser: 11, band: 'close', weight: 0.12 },
  { winner: 13, loser: 10, band: 'close', weight: 0.114 },
  { winner: 13, loser: 9, band: 'close', weight: 0.1045 },
  { winner: 13, loser: 8, band: 'medium', weight: 0.104 },
  { winner: 13, loser: 7, band: 'medium', weight: 0.098 },
  { winner: 13, loser: 6, band: 'medium', weight: 0.09 },
  { winner: 13, loser: 5, band: 'medium', weight: 0.0795 },
  { winner: 13, loser: 4, band: 'stomp', weight: 0.048 },
  { winner: 13, loser: 3, band: 'stomp', weight: 0.045 },
  { winner: 13, loser: 2, band: 'stomp', weight: 0.04 },
  { winner: 13, loser: 1, band: 'stomp', weight: 0.033854 },
  { winner: 13, loser: 0, band: 'stomp', weight: 0.006146 },
];

const BASE_BAND_WEIGHTS: Record<ScorelineBand, number> = {
  overtime: 0.117,
  close: 0.3385,
  medium: 0.3715,
  stomp: 0.173,
};

/**
 * Produces a calibrated final score in constant time. Score-margin weights are
 * conditioned on whether the result was expected, while their expectation for
 * every matchup remains the HLTV baseline. This prevents the scheduled mix of
 * strong and weak teams from drifting the global target percentages.
 */
export function sampleMapScoreline(
  homeWinProbability: number,
  winnerIsHome: boolean,
  randomValue = Math.random(),
): SimulatedScoreline {
  const homeP = Math.max(0, Math.min(1, homeWinProbability));
  const actualWinnerP = winnerIsHome ? homeP : 1 - homeP;
  const expectedWinnerP = homeP * homeP + (1 - homeP) * (1 - homeP);
  const resultExpectationDelta = actualWinnerP - expectedWinnerP;
  const adjustedBands: Record<ScorelineBand, number> = {
    overtime: BASE_BAND_WEIGHTS.overtime - 0.12 * resultExpectationDelta,
    close: BASE_BAND_WEIGHTS.close - 0.1 * resultExpectationDelta,
    medium: BASE_BAND_WEIGHTS.medium + 0.06 * resultExpectationDelta,
    stomp: BASE_BAND_WEIGHTS.stomp + 0.16 * resultExpectationDelta,
  };
  const roll = Math.max(0, Math.min(1 - Number.EPSILON, randomValue));
  let cumulative = 0;

  for (const scoreline of BASE_SCORELINES) {
    cumulative +=
      scoreline.weight * (adjustedBands[scoreline.band] / BASE_BAND_WEIGHTS[scoreline.band]);
    if (roll < cumulative) {
      return { winner: scoreline.winner, loser: scoreline.loser, band: scoreline.band };
    }
  }

  const fallback = BASE_SCORELINES[BASE_SCORELINES.length - 1];
  return { winner: fallback.winner, loser: fallback.loser, band: fallback.band };
}

/**
 * Gets the match result for the specified competitor id.
 *
 * @param id The id of the team.
 * @param scores The match scores.
 * @function
 */
export function getMatchResult(id: number, scores: Record<number, number>) {
  const competitorScore = scores[id];
  const opponentScore = scores[Number(Object.keys(scores).find((key) => Number(key) !== id))];
  return competitorScore > opponentScore
    ? Constants.MatchResult.WIN
    : competitorScore === opponentScore
      ? Constants.MatchResult.DRAW
      : Constants.MatchResult.LOSS;
}

/**
 * Score simulator.
 *
 * @class
 */
export class Score {
  private log: log.LogFunctions;
  public allowDraw: boolean;
  public mode: Constants.SimulationMode;
  public userPlayerId: number;
  public userTeamId: number;

  /**
   * @param allowDraw Allow draws.
   * @param mode      The simulation mode.
   * @constructor
   */
  constructor(allowDraw = false, mode = Constants.SimulationMode.DEFAULT) {
    this.log = log.scope('simulator');
    this.allowDraw = allowDraw;
    this.mode = mode;
  }

  /**
   * Generates a win probability weight based off of the
   * conditions described in the `simulate` function.
   *
   * @param team  The team.
   * @function
   */
  private getTeamWinProbability(team: Team) {
    // build a profile object for the `getSquad` function
    const profile = {
      teamId: this.userTeamId,
      playerId: this.userPlayerId,
    };

    // only backfill with the user's player if they
    // happen to only have 4 bots + themselves
    const players = Util.getSquad(
      team as Prisma.TeamGetPayload<{ include: { players: { include: { country: true } } } }>,
      profile as Prisma.ProfileGetPayload<unknown>,
      team.id === this.userTeamId && team.players.length <= Constants.Application.SQUAD_MIN_LENGTH,
      Constants.Application.SQUAD_MIN_LENGTH,
    );

    if (this.userPlayerId) {
      this.log.info(
        'Squad for %s (prestige: %d, tier: %d, length: %d)',
        team.name,
        team.prestige,
        team.tier,
        players.length,
      );
    }

    // generate the win probability per player
    const totalXp = players.map((player) => Bot.Exp.getTotalXP(player.xp)).reduce((a, b) => a + b);
    return totalXp + team.prestige + team.tier;
  }

  /**
   * Simulates a best-of series scoreline where each map
   * win is decided by the same weighted probability model
   * used by `generate`.
   *
   * @param teams The home and away teams.
   * @param bestOf The series length (1/3/5).
   * @function
   */
  public generateSeries(teams: Array<Team>, bestOf = 1) {
    return this.generateSeriesDetailed(teams, bestOf).score;
  }

  /**
   * Simulates a best-of series and returns both the aggregate
   * series score and the individual map scorelines that produced it.
   *
   * @param teams The home and away teams.
   * @param bestOf The series length (1/3/5).
   * @function
   */
  public generateSeriesDetailed(teams: Array<Team>, bestOf = 1): SeriesScore {
    const [home, away] = teams;
    const winsToClinch = Math.floor(bestOf / 2) + 1;
    const score = {
      [home.id]: 0,
      [away.id]: 0,
    };
    const maps: Array<MapScore> = [];

    while (score[home.id] < winsToClinch && score[away.id] < winsToClinch) {
      const mapResult = this.generate(teams);
      const winnerId = mapResult[home.id] > mapResult[away.id] ? home.id : away.id;
      score[winnerId] += 1;
      maps.push(mapResult);
    }

    return { maps, score };
  }

  /**
   * Simulates match scores calculated using probability weights
   * determined by a team's prestige/tier and the cumulative
   * skill level of their squad.
   *
   * @param teams The home and away teams.
   * @function
   */
  public generate(teams: Array<Team>) {
    const [home, away] = teams;

    if (this.userTeamId) {
      this.log.info('Simulating match (%s vs %s)...', home.name, away.name);
      this.log.info(
        'Scaling factor: %d',
        getSimScaleFactor() ?? Constants.Application.SIMULATION_SCALING_FACTOR,
      );
    }

    // handle sim mode early since that won't
    // require any probability calculations
    switch (this.mode) {
      case this.userTeamId && Constants.SimulationMode.LOSE: {
        const forcedScore = sampleMapScoreline(0.5, true);
        return {
          [home.id]: home.id === this.userTeamId ? forcedScore.loser : forcedScore.winner,
          [away.id]: away.id === this.userTeamId ? forcedScore.loser : forcedScore.winner,
        };
      }
      case this.userTeamId && Constants.SimulationMode.WIN: {
        const forcedScore = sampleMapScoreline(0.5, true);
        return {
          [home.id]: home.id === this.userTeamId ? forcedScore.winner : forcedScore.loser,
          [away.id]: away.id === this.userTeamId ? forcedScore.winner : forcedScore.loser,
        };
      }
    }

    // calculate probability weight for team
    const homeRating = this.getTeamWinProbability(home);
    const awayRating = this.getTeamWinProbability(away);
    const homeWinPbx = Util.getEloWinProbability(
      homeRating,
      awayRating,
      getSimScaleFactor() ?? Constants.Application.SIMULATION_SCALING_FACTOR,
    );
    let drawWeight = 0;

    // do we allow draws? if so, the chance to draw is
    // equal to the team with the lowest prestige
    if (this.allowDraw) {
      const lowestPrestige = Bot.Templates.find(
        (template) =>
          template.prestige === (home.prestige > away.prestige ? away.prestige : home.prestige),
      );
      drawWeight = lowestPrestige.multiplier * Constants.Application.SQUAD_MIN_LENGTH;
    }

    // Roll against the original floating-point weights. The previous generic
    // probability helper floored them to integer percentages; its uncovered
    // rounding gap could select the zero-weight draw entry.
    const winnerRoll = Math.random() * (1 + drawWeight);
    const winner =
      winnerRoll < homeWinPbx ? home.id : winnerRoll < 1 ? away.id : Constants.SimulationMode.DRAW;

    // was it a draw?
    if (this.allowDraw && winner === Constants.SimulationMode.DRAW) {
      return {
        [home.id]: SimulationResult.DRAW,
        [away.id]: SimulationResult.DRAW,
      };
    }

    if (this.userTeamId) {
      this.log.info(
        '%s win probability: %d% (raw: %d, total xp: %d)',
        home.name,
        homeWinPbx * 100,
        homeWinPbx,
        homeRating,
      );
      this.log.info(
        '%s win probability: %d% (raw: %d, total xp: %d)',
        away.name,
        (1 - homeWinPbx) * 100,
        1 - homeWinPbx,
        awayRating,
      );
      this.log.info('Winner: %s', Number(winner) === home.id ? home.name : away.name);
    }

    const winnerIsHome = Number(winner) === home.id;
    const score = sampleMapScoreline(homeWinPbx, winnerIsHome);

    // return the winner
    return {
      [home.id]: Number(winner) === home.id ? score.winner : score.loser,
      [away.id]: Number(winner) === away.id ? score.winner : score.loser,
    };
  }
}
