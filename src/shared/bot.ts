/**
 * Bot experience and difficulty progression system.
 * This version removes stat-based XP (skill/aggression/etc.)
 * and replaces it with a pure XP → Template mapping system.
 *
 * @module
 */
import * as Chance from './chance';
import * as Constants from './constants';
import log from 'electron-log';
import type { Prisma } from '@prisma/client';
import type { Player } from '@prisma/client';

/**
 * Bot difficulty template definition.
 *
 * @interface
 */
interface Template {
  difficulty: number;
  name: string;
  prestige: number;
  multiplier: number;
  baseXP: number;
}

/**
 * Bot difficulty progression table (XP tiers).
 *
 * @constant
 */
export const Templates: Array<Template> = [
  { name: Constants.BotDifficulty.ABYSMAL, prestige: 0, multiplier: 1, difficulty: 0, baseXP: 5 },
  { name: Constants.BotDifficulty.NOTGOOD, prestige: 0, multiplier: 1, difficulty: 0, baseXP: 13 },
  { name: Constants.BotDifficulty.WORSE, prestige: 0, multiplier: 1, difficulty: 0, baseXP: 18 },
  { name: Constants.BotDifficulty.REALLYBAD, prestige: 0, multiplier: 1, difficulty: 0, baseXP: 24 },
  { name: Constants.BotDifficulty.POOR, prestige: 0, multiplier: 1, difficulty: 0, baseXP: 32 },
  { name: Constants.BotDifficulty.BAD, prestige: 1, multiplier: 2, difficulty: 1, baseXP: 38 },
  { name: Constants.BotDifficulty.LOW, prestige: 1, multiplier: 2, difficulty: 1, baseXP: 43 },
  { name: Constants.BotDifficulty.AVG, prestige: 2, multiplier: 4, difficulty: 2, baseXP: 53 },
  { name: Constants.BotDifficulty.MEDIUM, prestige: 2, multiplier: 5, difficulty: 2, baseXP: 64 },
  { name: Constants.BotDifficulty.SOLID, prestige: 3, multiplier: 10, difficulty: 3, baseXP: 75 },
  { name: Constants.BotDifficulty.FRAGGER, prestige: 4, multiplier: 18, difficulty: 3, baseXP: 87 },
  { name: Constants.BotDifficulty.STAR, prestige: 4, multiplier: 20, difficulty: 3, baseXP: 100 },
];

/**
 * Defines how much XP a bot can gain/loss and with what probability.
 * (Pure XP model — no per-stat values)
 */
const XP_GAIN_PROB: Record<string, number> = {
  '1': 80,
  '2': 15,
  '3': 5,
};

const XP_LOSS_PROB: Record<string, number> = {
  '-1': 90,
  '-2': 8,
  '-3': 2,
};

/**
 * Bot experience management class.
 */
export class Exp {
  private log: log.LogFunctions;
  private player: Player;

  constructor(player: typeof Exp.prototype.player) {
    this.log = log.scope('training');
    this.player = player;
  }

  /**
 * Public wrapper to simulate XP change for external callers.
 */
  public simulateXpChangeForExternal(): number {
    return this.simulateXpChange();
  }

  /**
   * Returns total XP value for a player.
   */
  public static getTotalXP(playerXP?: number) {
    return Math.max(0, playerXP || 0);
  }

  /**
   * Gets the current bot template based on XP.
   */
  public static getTemplateByXP(totalXp: number): Template {
    const thresholds = [
      { max: 10, name: Constants.BotDifficulty.ABYSMAL },
      { max: 15, name: Constants.BotDifficulty.NOTGOOD },
      { max: 20, name: Constants.BotDifficulty.WORSE },
      { max: 27, name: Constants.BotDifficulty.REALLYBAD },
      { max: 35, name: Constants.BotDifficulty.POOR },
      { max: 40, name: Constants.BotDifficulty.BAD },
      { max: 45, name: Constants.BotDifficulty.LOW },
      { max: 60, name: Constants.BotDifficulty.AVG },
      { max: 66, name: Constants.BotDifficulty.MEDIUM },
      { max: 80, name: Constants.BotDifficulty.SOLID },
      { max: 92, name: Constants.BotDifficulty.FRAGGER },
      { max: Infinity, name: Constants.BotDifficulty.STAR },
    ];

    const found = thresholds.find(t => totalXp <= t.max);
    return Templates.find(t => t.name === found?.name)!;
  }

  /**
   * Returns this bot's current difficulty template.
   */
  public getBotTemplate() {
    const totalXp = this.player.xp ?? 0;
    return Exp.getTemplateByXP(totalXp);
  }

  /**
   * Trains XP for all players (simple XP gain/loss system).
   * You can expand this to depend on match performance.
   */
  public static trainAll(players: Array<Player>) {
    return players.map(player => {
      const xp = new Exp(player);
      const delta = xp.simulateXpChange();
      const newXp = Math.max(0, (player.xp || 0) + delta);

      xp.log.debug('[%s] XP change: %+d → %d', player.name, delta, newXp);

      return {
        ...player,
        xp: newXp,
      };
    });
  }

  /**
   * Simulates a random XP gain/loss event.
   */
  private simulateXpChange(): number {
    // 85% chance to gain XP, 15% chance to lose XP
    const gain = Chance.roll({ true: 85, false: 15 });

    let result: string | number | undefined;

    if (gain) {
      result = Chance.roll(XP_GAIN_PROB);
    } else {
      result = Chance.roll(XP_LOSS_PROB);
    }

    // fallback if Chance.roll returns undefined or invalid
    const safeNumber = Number(result);
    if (isNaN(safeNumber)) {
      this.log.warn('Chance.roll returned invalid value, defaulting to 0');
      return 0;
    }

    return safeNumber;
  }
}
