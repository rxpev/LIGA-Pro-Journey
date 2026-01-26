/**
 * Populates the database with teams and players.
 *
 * @module
 */
import log from 'electron-log';
import { PrismaClient } from '@prisma/client';
import { Constants } from '@liga/shared';
import { scrape } from 'cli/scraper';

/**
 * The main seeder.
 *
 * @param prisma  The prisma client.
 * @param args    CLI args.
 * @function
 */
export default async function (prisma: PrismaClient, args: Record<string, string>) {
  // bail if no token was provided
  const token = args.token || process.env.PANDASCORE_TOKEN;

  if (!token) {
    log.warn('Pandascore access token not found. Skipping.');
    return Promise.resolve();
  }

  // figure out the total number of teams to scrape by
  // adding up the size of every federation's tier
  const federations = await prisma.federation.findMany({
    where: {
      leagues: {
        some: {
          slug: Constants.LeagueSlug.ESPORTS_LEAGUE,
        },
      },
    },
  });
  const tiers = await prisma.tier.findMany({
    where: {
      league: {
        slug: Constants.LeagueSlug.ESPORTS_LEAGUE,
      },
    },
  });
  const totalRequiredTeams = federations.reduce((total, federation) => {
    const federationTotal = tiers.reduce((tierTotal, tier) => {
      const sizing = Constants.resolveCompetitionSizing({
        leagueSlug: Constants.LeagueSlug.ESPORTS_LEAGUE,
        federationSlug: federation.slug as Constants.FederationSlug,
        tierSlug: tier.slug as Constants.TierSlug,
        defaultSize: tier.size,
        defaultGroupSize: tier.groupSize,
      });
      return tierTotal + Math.max(0, sizing.size);
    }, 0);
    return total + federationTotal;
  }, 0);

  // run the scrapers
  await scrape('teams', {
    batchLimit: Math.floor(totalRequiredTeams / 4).toString(),
    batchSize: (totalRequiredTeams / 2).toString(),
    num: totalRequiredTeams.toString(),
    token,
  });
  await scrape('free-agents', {
    batchLimit: '50',
    batchSize: '100',
    num: '600',
    token,
  });

  return Promise.resolve();
}
