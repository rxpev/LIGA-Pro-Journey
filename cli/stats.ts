/**
 * Player Stats Generator.
 *
 * @module
 */
import log from 'electron-log';
import { Command } from 'commander';
import { random } from 'lodash';
import { PrismaClient } from '@prisma/client';
import type { Player } from '@prisma/client';
import { playerOverrides } from '@liga/backend/handlers/playeroverrides';
import { PlayerRole, PersonalityTemplate } from '@liga/shared';
import { levelFromElo } from '@liga/backend/lib/levels';

function getFaceitEloForXp(xp: number): { elo: number; level: number } {
  let min = 300;
  let max = 800;

  if (xp <= 10) {
    min = 300;
    max = 800;
  } else if (xp <= 15) {
    min = 800;
    max = 950;
  } else if (xp <= 20) {
    min = 900;
    max = 1250;
  } else if (xp <= 27) {
    min = 1250;
    max = 1700;
  } else if (xp <= 40) {
    min = 1800;
    max = 2100;
  } else if (xp <= 45) {
    min = 2100;
    max = 2300;
  } else if (xp <= 60) {
    min = 2300;
    max = 2400;
  } else if (xp <= 67) {
    min = 2400;
    max = 2500;
  } else {
    min = 2500;
    max = 4000;
  }

  let elo = random(min, max);

  if (xp >= 68) {
    const bias = (xp - 68) / 40;
    const weighted = elo + bias * (max - elo) * Math.random();
    elo = Math.round(weighted);
  }

  const level = levelFromElo(elo);
  return { elo, level };
}

function getInitialXpForPrestige(prestige: number): number {
  let minXp = 0;
  let maxXp = 0;

  switch (prestige) {
    case 0:
      minXp = 10;
      maxXp = 30;
      break;
    case 1:
      minXp = 25;
      maxXp = 50;
      break;
    case 2:
      minXp = 40;
      maxXp = 70;
      break;
    case 3:
      minXp = 40;
      maxXp = 80;
      break;
    case 4:
      minXp = 50;
      maxXp = 100;
      break;
    default:
      minXp = 10;
      maxXp = 30;
      break;
  }

  return random(minXp, maxXp);
}

function getRandomRiflePersonality(): PersonalityTemplate {
  const pool = [
    PersonalityTemplate.LURK,
    PersonalityTemplate.ALURK,
    PersonalityTemplate.PLURK,
    PersonalityTemplate.ARIFLE,
    PersonalityTemplate.RIFLE,
    PersonalityTemplate.PRIFLE,
    PersonalityTemplate.ENTRY,
  ];
  return pool[random(0, pool.length - 1)];
}

function getRandomSniperPersonality(): PersonalityTemplate {
  const pool = [
    PersonalityTemplate.ASNIPER,
    PersonalityTemplate.SNIPER,
    PersonalityTemplate.PSNIPER,
  ];
  return pool[random(0, pool.length - 1)];
}

/** @interface */
interface CLIArguments {
  min?: string;
  max?: string;
}

/** @constant */
const prisma = new PrismaClient();

/** @constant */
const DEFAULT_ARGS: CLIArguments = {
  min: '1',
  max: '5',
};

/**
 * Generates XP for all players in the database.
 *
 * @function
 * @param args CLI args.
 */
export async function generateStats(args: any = {}) {
  const players = await prisma.player.findMany({
    include: { team: true },
  });

  log.info('Generating Stats for %s Players...', players.length);

  // Group players by team
  const playersByTeam: Record<number, typeof players> = {};
  for (const p of players) {
    if (!p.teamId) continue;
    if (!playersByTeam[p.teamId]) playersByTeam[p.teamId] = [];
    playersByTeam[p.teamId].push(p);
  }

  const updates: any[] = [];

  // Process all teams
  for (const [, teamPlayers] of Object.entries(playersByTeam)) {
    // Apply overrides first (role/personality may be overwritten later if required to enforce the starter AWPer invariant)
    for (const player of teamPlayers) {
      const override = playerOverrides[player.name];
      if (override) {
        player.role = override.role;
        player.personality = override.personality;
      }
    }

    // If this is an initial generation pass, assign XP up-front so starter selection uses the final XP values
    if (args.initial) {
      for (const player of teamPlayers) {
        player.xp = getInitialXpForPrestige(player.prestige ?? 0);
      }
    }

    const xpOf = (p: Player) => (p.xp ?? 0);
    const byXpDesc = (a: Player, b: Player) => xpOf(b) - xpOf(a);

    // Enforce: exactly one SNIPER on the roster, and that SNIPER is the AWPer starter
    // If no SNIPER exists, promote the highest-XP player to SNIPER.
    let snipers = teamPlayers.filter((p) => p.role === PlayerRole.SNIPER).sort(byXpDesc);

    if (snipers.length === 0 && teamPlayers.length > 0) {
      const chosen = [...teamPlayers].sort(byXpDesc)[0];
      chosen.role = PlayerRole.SNIPER;
      chosen.personality = getRandomSniperPersonality();
      snipers = [chosen];
    } else if (snipers.length > 1) {
      const keep = snipers[0]; // highest-XP sniper
      for (const extra of snipers.slice(1)) {
        extra.role = PlayerRole.RIFLER;
        extra.personality = getRandomRiflePersonality();
      }
      snipers = [keep];
    }

    const awperStarter = snipers[0];

    // Hard guarantee: the starter AWPer is always SNIPER with a sniper personality
    if (awperStarter) {
      awperStarter.role = PlayerRole.SNIPER;
      awperStarter.personality = getRandomSniperPersonality();
    }

    // Assign defaults for any remaining missing values.
    for (const player of teamPlayers) {
      if (!player.role) player.role = PlayerRole.RIFLER;
      if (!player.personality) {
        player.personality =
          player.role === PlayerRole.SNIPER
            ? getRandomSniperPersonality()
            : getRandomRiflePersonality();
      }
    }

    // Select starters: 1x SNIPER (AWPer) + 4x highest-XP RIFLERs
    let riflers = teamPlayers
      .filter((p) => p.id !== awperStarter.id && p.role === PlayerRole.RIFLER)
      .sort(byXpDesc);

    // If fewer than 4 riflers exist, convert best remaining non-AWPer players into riflers until we reach 4
    if (riflers.length < 4) {
      const fillCandidates = teamPlayers
        .filter((p) => p.id !== awperStarter.id && p.role !== PlayerRole.RIFLER)
        .sort(byXpDesc);

      for (const p of fillCandidates) {
        p.role = PlayerRole.RIFLER;
        p.personality = getRandomRiflePersonality();
        riflers.push(p);
        if (riflers.length >= 4) break;
      }

      riflers.sort(byXpDesc);
    }

    const riflerStarters = riflers.slice(0, 4);

    const starterIds = new Set<number>([
      awperStarter.id,
      ...riflerStarters.map((p) => p.id),
    ]);

    // Everyone not in the starting five is transfer-listed (regardless of role)
    const transferListIds = new Set<number>(
      teamPlayers.filter((p) => !starterIds.has(p.id)).map((p) => p.id),
    );

    // Persist roles, personalities, XP, Elo, and roster flags
    for (const player of teamPlayers) {
      const newXp = player.xp ?? 0;
      const { elo: faceitElo } = getFaceitEloForXp(newXp);

      updates.push(
        prisma.player.update({
          where: { id: player.id },
          data: {
            xp: newXp,
            role: player.role,
            personality: player.personality,
            elo: faceitElo,
            starter: starterIds.has(player.id),
            transferListed: transferListIds.has(player.id),
          },
        }),
      );
    }
  }

  // Handle free agents (players without a team)
  const freeAgents = players.filter((p) => !p.teamId);

  if (freeAgents.length > 0) {
    log.info(`Assigning roles/personalities & training ${freeAgents.length} free agents...`);

    const freeAgentUpdates = freeAgents.map((player) => {
      const isSniper = Math.random() < 0.2;
      player.role = isSniper ? PlayerRole.SNIPER : PlayerRole.RIFLER;
      player.personality = isSniper
        ? getRandomSniperPersonality()
        : getRandomRiflePersonality();

      if (args.initial) {
        player.xp = getInitialXpForPrestige(player.prestige ?? 0);
      }

      const newXp = player.xp ?? 0;
      const { elo } = getFaceitEloForXp(newXp);

      return prisma.player.update({
        where: { id: player.id },
        data: {
          xp: newXp,
          role: player.role,
          personality: player.personality,
          elo,
          starter: false,
          transferListed: true,
        },
      });
    });

    await prisma.$transaction(freeAgentUpdates);
    log.info('Assigned roles and trained all free agents successfully.');
  }

  await prisma.$transaction(updates);
  log.info('Stats generation complete.');
  return Promise.resolve();
}

/**
 * Exports this module.
 *
 * @exports
 */
export default {
  /**
   * Registers this module's CLI.
   *
   * @function
   * @param program CLI parser.
   */
  register: (program: Command) => {
    program
      .command('stats')
      .option('--min <num>', 'Min sets training sessions per iteration', DEFAULT_ARGS.min)
      .option('--max <num>', 'Max sets training sessions per iteration', DEFAULT_ARGS.max)
      .option('--initial', 'Reset XP based on prestige (initial generation only)')
      .description('Generates XP for all players in the database.')
      .action(generateStats);
  },
};
