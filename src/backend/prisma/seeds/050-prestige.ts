/**
 * Evenly distributes prestige among teams.
 *
 * @module
 */
import log from 'electron-log';
import { flatten, groupBy } from 'lodash';
import { PrismaClient } from '@prisma/client';
import { Constants, Util } from '@liga/shared';

const PRO_SEED_COUNTS: Partial<Record<Constants.FederationSlug, number>> = {
  [Constants.FederationSlug.ESPORTS_EUROPA]: 9,
  [Constants.FederationSlug.ESPORTS_AMERICAS]: 4,
  [Constants.FederationSlug.ESPORTS_ASIA]: 2,
  [Constants.FederationSlug.ESPORTS_OCE]: 1,
};

/**
 * The main seeder.
 *
 * @param prisma The prisma client.
 * @function
 */
export default async function (prisma: PrismaClient) {
  // grab all teams and eager load
  // their federation association
  const teams = await prisma.team.findMany({
    include: {
      players: true,
      country: {
        include: {
          continent: {
            include: {
              federation: true,
            },
          },
        },
      },
    },
  });

  // grab league tiers which define the
  // different levels of prestige
  const tiers = await prisma.tier.findMany({
    where: {
      slug: {
        in: Constants.Prestige,
      },
      league: {
        slug: Constants.LeagueSlug.ESPORTS_LEAGUE,
      },
    },
  });
  const tiersSorted = [...tiers].sort(
    (a, b) =>
      Constants.Prestige.indexOf(a.slug as Constants.TierSlug) -
      Constants.Prestige.indexOf(b.slug as Constants.TierSlug),
  );

  // group the teams by federation
  // and build the transaction
  const groups = groupBy(teams, (team) => team.country.continent.federation.slug);
  const transaction = Object.keys(groups)
    .map((slug) => groups[slug])
    .map((federationTeams) => {
      const federationSlug = federationTeams[0]?.country.continent.federation
        .slug as Constants.FederationSlug;
      const proCount = PRO_SEED_COUNTS[federationSlug] ?? 0;
      const sortedTeams = [...federationTeams].sort((a, b) => (b.elo ?? 0) - (a.elo ?? 0));
      const proTeams = sortedTeams.slice(0, proCount);
      const remainingTeams = sortedTeams.slice(proCount);
      let offset = 0;

      // chunk the teams into the different levels of prestige
      const chunks = [
        {
          prestige: Constants.Prestige.findIndex(
            (prestige) => prestige === Constants.TierSlug.LEAGUE_PRO,
          ),
          teams: proTeams,
        },
        ...tiersSorted.map((tier) => {
          const enabled = Util.isLeagueTierEnabledForFederation(
            tier.slug as Constants.TierSlug,
            federationSlug,
          );
        const tierSize = enabled
          ? Util.getLeagueTierSize(
              tier.slug as Constants.TierSlug,
              federationSlug,
              tier.size,
            )
          : 0;
          const sliceStart = offset;
          const sliceEnd = offset + tierSize;
          offset = sliceEnd;

          return {
            prestige: Constants.Prestige.findIndex((prestige) => prestige === tier.slug),
            teams: remainingTeams.slice(sliceStart, sliceEnd),
          };
        }),
      ];

      log.info(
        chunks.map((chunk) => ({ prestige: chunk.prestige, totalTeams: chunk.teams.length })),
      );

      // run through this chunk's updates
      return flatten(
        chunks.map((chunk) =>
          chunk.teams.map((team) =>
            prisma.team.update({
              where: { id: team.id },
              data: {
                prestige: chunk.prestige,
                tier: chunk.prestige,

                // sync player stats to the team's prestige
                players: {
                  update: team.players.map((player) => ({
                    where: { id: player.id },
                    data: {
                      prestige: chunk.prestige,
                    }
                  })),
                },
              },
            }),
          ),
        ),
      );
    });

  // run the transaction
  return prisma.$transaction(flatten(transaction));
}
