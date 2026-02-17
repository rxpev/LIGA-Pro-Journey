/**
 * Export and import squads.
 *
 * @module
 */
import fs from 'node:fs';
import util from 'node:util';
import log from 'electron-log';
import { Command } from 'commander';
import { PrismaClient } from '@prisma/client';
import { camelCase, upperFirst } from 'lodash';
import { Constants } from '@liga/shared';

/** @interface */
interface CLIArguments {
  federationSlug: string;
  tier: string;
  out: string;
  in: string;
}

/**
 * Initialize the local prisma client.
 *
 * @constant
 */
const prisma = new PrismaClient();

/**
 * Default arguments.
 *
 * @constant
 */
const DEFAULT_ARGS: CLIArguments = {
  federationSlug: Constants.FederationSlug.ESPORTS_AMERICAS,
  tier: Constants.Prestige.findIndex(
    (tier) => tier === Constants.TierSlug.LEAGUE_PRO,
  ).toString(),
  out: null,
  in: null,
};

/**
 * Export squads subcommand.
 *
 * @function
 * @param args CLI args.
 */
async function squadsExport(args: typeof DEFAULT_ARGS) {
  const teams = await prisma.team.findMany({
    where: {
      country: {
        continent: {
          federation: {
            slug: args.federationSlug,
          },
        },
      },
      tier: Number(args.tier),
    },
    include: {
      country: true,
      players: {
        include: {
          country: true,
        },
      },
    },
  });

  return fs.promises.writeFile(args.out, JSON.stringify(teams, null, 4), 'utf8');
}

/**
 * Import squads subcommand.
 *
 * @function
 * @param args CLI args.
 */
async function squadsImport(args: typeof DEFAULT_ARGS) {
  interface ImportedPlayer {
    age: number;
    avatar: string;
    countryId: number;
    elo: number;
    id: number;
    name: string;
    personality: string;
    role: string;
    starter: number | boolean;
    transferListed: number | boolean;
    xp: number;
  }

  const raw = await fs.promises.readFile(args.in, 'utf8');
  const normalized = raw
    .replace(/"avatar"\s*:\s*(resources:\/\/[^,}\]\n\r]+)/g, '"avatar": "$1"')
    .replace(/,\s*([}\]])/g, '$1');
  const data = JSON.parse(normalized) as Array<ImportedPlayer>;

  if (!Array.isArray(data)) {
    return Promise.reject('Import file must be a JSON array of player records.');
  }

  const playersByTeam = new Map<number, Array<ImportedPlayer>>();

  for (const player of data) {
    if (!playersByTeam.has(player.id)) {
      playersByTeam.set(player.id, []);
    }

    const teamPlayers = playersByTeam.get(player.id);

    if (teamPlayers) {
      teamPlayers.push(player);
    }
  }

  return prisma.$transaction(async (tx) => {
    for (const [teamId, players] of playersByTeam.entries()) {
      await tx.player.deleteMany({
        where: {
          teamId,
        },
      });

      for (const player of players) {
        await tx.player.create({
          data: {
            age: player.age,
            avatar: player.avatar,
            countryId: player.countryId,
            elo: player.elo,
            name: player.name,
            personality: player.personality,
            role: player.role,
            starter: Boolean(player.starter),
            teamId,
            transferListed: Boolean(player.transferListed),
            xp: player.xp,
          },
        });
      }
    }
  });
}

/**
 * Import team values subcommand.
 *
 * @function
 * @param args CLI args.
 */
async function squadsImportTeams(args: typeof DEFAULT_ARGS) {
  interface ImportedTeam {
    blazon: string;
    elo: number;
    id: number;
    name: string;
    slug: string;
  }

  const raw = await fs.promises.readFile(args.in, 'utf8');
  const normalized = raw
    .replace(/"blazon"\s*:\s*(resources:\/\/[^,}\]\n\r]+)/g, '"blazon": "$1"')
    .replace(/,\s*([}\]])/g, '$1');
  const data = JSON.parse(normalized) as Array<ImportedTeam>;

  if (!Array.isArray(data)) {
    return Promise.reject('Import file must be a JSON array of team records.');
  }

  return prisma.$transaction(async (tx) => {
    for (const team of data) {
      await tx.team.update({
        where: {
          id: team.id,
        },
        data: {
          blazon: team.blazon,
          elo: team.elo,
          name: team.name,
          slug: team.slug,
        },
      });
    }
  });
}

/**
 * Exports and imports squads.
 *
 * @function
 * @param type The type of function to run.
 * @param args CLI args.
 */
export async function handler(type: string, args: typeof DEFAULT_ARGS) {
  // bail early if provided function type is not supported
  const acceptedFnTypes = ['export', 'import', 'import-teams'];
  const fns: Record<
    string,
    typeof squadsExport | typeof squadsImport | typeof squadsImportTeams
  > = {
    squadsExport,
    squadsImport,
    squadsImportTeams,
  };

  if (!acceptedFnTypes.includes(type)) {
    return Promise.reject('Unknown function type.');
  }

  // dynamically call the scraper function
  try {
    const fn = util.format('squads%s', upperFirst(camelCase(type)));
    await fns[fn]({ ...DEFAULT_ARGS, ...args });
    return prisma.$disconnect();
  } catch (error) {
    log.error(error);
    return prisma.$disconnect();
  }
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
      .command('squads')
      .description('Export and import squads.')
      .argument('<type>', 'The type of action.')
      .option('-f --federation <slug>', 'Federation slug', DEFAULT_ARGS.federationSlug)
      .option('-t --tier <number>', 'Tier/Division number', DEFAULT_ARGS.tier)
      .option('-o --out <string>', 'Where to save exports', DEFAULT_ARGS.out)
      .option('-i --in <string>', 'Where to load data from', DEFAULT_ARGS.in)
      .action(handler);
  },
};
