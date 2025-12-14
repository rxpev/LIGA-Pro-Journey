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
import { Bot } from '@liga/shared';
import { playerOverrides } from '@liga/backend/handlers/playeroverrides';
import { PlayerRole, PersonalityTemplate } from '@liga/shared';
import { levelFromElo } from "@liga/backend/lib/levels";

function getFaceitEloForXp(xp: number): { elo: number; level: number } {
  // XP → Elo tier logic

  let min = 300;
  let max = 800;

  if (xp <= 10) {
    min = 300;
    max = 800; // FACEIT lvl 1 range
  } else if (xp <= 15) {
    min = 800;
    max = 950; // Level 1–2 transitional
  } else if (xp <= 20) {
    min = 900;
    max = 1250; // Level 2–4
  } else if (xp <= 27) {
    min = 1250;
    max = 1700; // Level 4–7
  } else if (xp <= 40) {
    min = 1800;
    max = 2100; // Level 8–10
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

  // Make high XP players weighted toward the top
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

/**
 * Initialize the local prisma client.
 *
 * @constant
 */
const prisma = new PrismaClient();

/**
 * Default scraper arguments.
 *
 * @constant
 */
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
  const mergedArgs = { ...DEFAULT_ARGS, ...args };

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
  for (const [teamId, teamPlayers] of Object.entries(playersByTeam)) {
    // Apply overrides
    for (const player of teamPlayers) {
      const override = playerOverrides[player.name];
      if (override) {
        player.role = override.role;
        player.personality = override.personality;
      }
    }

    // Ensure 1 sniper per team
    let snipers = teamPlayers.filter((p) => p.role === PlayerRole.SNIPER);
    if (snipers.length === 0) {
      const eligible = teamPlayers.filter(
        (p) => !playerOverrides[p.name] || playerOverrides[p.name].role !== PlayerRole.SNIPER,
      );
      const chosen =
        eligible.length > 0
          ? eligible[random(0, eligible.length - 1)]
          : teamPlayers[random(0, teamPlayers.length - 1)];
      chosen.role = PlayerRole.SNIPER;
      chosen.personality = getRandomSniperPersonality();
    }

    // Handle multiple snipers
    snipers = teamPlayers.filter((p) => p.role === PlayerRole.SNIPER);
    if (snipers.length > 1) {
      for (let i = 1; i < snipers.length; i++) {
        snipers[i].role = PlayerRole.RIFLER;
        snipers[i].personality = getRandomRiflePersonality();
      }
    }

    // Assign defaults
    for (const player of teamPlayers) {
      if (!player.role) player.role = PlayerRole.RIFLER;
      if (!player.personality) {
        player.personality =
          player.role === PlayerRole.SNIPER
            ? getRandomSniperPersonality()
            : getRandomRiflePersonality();
      }
    }

    const xpOf = (p: Player) => (p.xp ?? 0);
    const byXpDesc = (a: Player, b: Player) => xpOf(b) - xpOf(a);
    snipers = teamPlayers.filter((p) => p.role === PlayerRole.SNIPER).sort(byXpDesc);

    if (snipers.length === 0 && teamPlayers.length > 0) {
      const chosen = [...teamPlayers].sort(byXpDesc)[0];
      chosen.role = PlayerRole.SNIPER;
      chosen.personality = getRandomSniperPersonality();
      snipers = [chosen];
    }

    const awperStarter = snipers[0];

    let riflers = teamPlayers
      .filter((p) => p.id !== awperStarter.id && p.role === PlayerRole.RIFLER)
      .sort(byXpDesc);

    //if there still aren’t 4 riflers, convert best remaining players
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

    const transferListIds = new Set<number>(
      teamPlayers.filter((p) => !starterIds.has(p.id)).map((p) => p.id),
    );

    // Generate XP & stats
    for (const player of teamPlayers) {
      if (args.initial) {
        player.xp = getInitialXpForPrestige(player.prestige ?? 0);
      }

      let newXp = player.xp;

      const { elo: faceitElo, level: faceitLevel } = getFaceitEloForXp(newXp);

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
      // Assign random role with 20% sniper chance
      const isSniper = Math.random() < 0.2;
      player.role = isSniper ? PlayerRole.SNIPER : PlayerRole.RIFLER;
      player.personality = isSniper
        ? getRandomSniperPersonality()
        : getRandomRiflePersonality();

      if (args.initial) {
        player.xp = getInitialXpForPrestige(player.prestige ?? 0);
      }

      let newXp = player.xp;

      const { elo } = getFaceitEloForXp(newXp);

      return prisma.player.update({
        where: { id: player.id },
        data: {
          xp: newXp,
          role: player.role,
          personality: player.personality,
          elo,
        },
      });
    });

    await prisma.$transaction(freeAgentUpdates);
    log.info(' Assigned roles and trained all free agents successfully.');
  }

  // Apply all player stat updates for team players
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
