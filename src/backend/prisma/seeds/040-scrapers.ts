/**
 * Populates the database with teams and players.
 *
 * @module
 */
import log from 'electron-log';
import { PrismaClient } from '@prisma/client';
import { Constants, Util } from '@liga/shared';
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
  const league = await prisma.league.findFirst({
    where: {
      slug: Constants.LeagueSlug.ESPORTS_LEAGUE,
    },
    include: {
      federations: true,
      tiers: true,
    },
  });

  if (!league) {
    log.warn('League not found. Skipping.');
    return Promise.resolve();
  }

  const totalRequiredTeams = league.federations.reduce((total, federation) => {
    const federationTotal = league.tiers.reduce((tierTotal, tier) => {
      if (
        !Util.isLeagueTierEnabledForFederation(
          tier.slug as Constants.TierSlug,
          federation.slug as Constants.FederationSlug,
        )
      ) {
        return tierTotal;
      }

      const tierSize = Util.getLeagueTierSize(
        tier.slug as Constants.TierSlug,
        federation.slug as Constants.FederationSlug,
        tier.size,
      );
      return tierTotal + tierSize;
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
