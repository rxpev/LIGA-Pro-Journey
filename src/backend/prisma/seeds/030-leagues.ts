/**
 * Seeds the database with leagues and tiers.
 *
 * @module
 */
import { Prisma, PrismaClient } from '@prisma/client';
import { startCase } from 'lodash';
import { Constants } from '@liga/shared';

/** @type {LeagueSeedData} */
type LeagueSeedData = Prisma.LeagueCreateInput & {
  tiers: Array<Prisma.TierCreateWithoutLeagueInput>;
  federations: Array<Constants.FederationSlug>;
};

/**
 * The seed data.
 *
 * @constant
 */
export const data: Array<LeagueSeedData> = [
  {
    name: 'ESEA',
    slug: Constants.LeagueSlug.ESPORTS_LEAGUE,
    startOffsetDays: 73,
    federations: [
      Constants.FederationSlug.ESPORTS_AMERICAS,
      Constants.FederationSlug.ESPORTS_ASIA,
      Constants.FederationSlug.ESPORTS_EUROPA,
      Constants.FederationSlug.ESPORTS_OCE,
    ],
    tiers: [
      {
        name: startCase(Constants.TierSlug.LEAGUE_OPEN),
        slug: Constants.TierSlug.LEAGUE_OPEN,
        size: 40,
        groupSize: 20,
        triggerTierSlug: Constants.TierSlug.LEAGUE_OPEN_PLAYOFFS,
      },
      {
        name: startCase(Constants.TierSlug.LEAGUE_OPEN_PLAYOFFS),
        slug: Constants.TierSlug.LEAGUE_OPEN_PLAYOFFS,
        size: 4,
        triggerOffsetDays: 9,
      },
      {
        name: startCase(Constants.TierSlug.LEAGUE_INTERMEDIATE),
        slug: Constants.TierSlug.LEAGUE_INTERMEDIATE,
        size: 30,
        groupSize: 20,
        triggerTierSlug: Constants.TierSlug.LEAGUE_INTERMEDIATE_PLAYOFFS,
      },
      {
        name: startCase(Constants.TierSlug.LEAGUE_INTERMEDIATE_PLAYOFFS),
        slug: Constants.TierSlug.LEAGUE_INTERMEDIATE_PLAYOFFS,
        size: 4,
        triggerOffsetDays: 9,
      },
      {
        name: startCase(Constants.TierSlug.LEAGUE_MAIN),
        slug: Constants.TierSlug.LEAGUE_MAIN,
        size: 20,
        groupSize: 20,
        triggerTierSlug: Constants.TierSlug.LEAGUE_MAIN_PLAYOFFS,
      },
      {
        name: startCase(Constants.TierSlug.LEAGUE_MAIN_PLAYOFFS),
        slug: Constants.TierSlug.LEAGUE_MAIN_PLAYOFFS,
        size: 4,
        triggerOffsetDays: 9,
      },
      {
        name: startCase(Constants.TierSlug.LEAGUE_ADVANCED),
        slug: Constants.TierSlug.LEAGUE_ADVANCED,
        size: 20,
        groupSize: 20,
        triggerTierSlug: Constants.TierSlug.LEAGUE_ADVANCED_PLAYOFFS,
      },
      {
        name: startCase(Constants.TierSlug.LEAGUE_ADVANCED_PLAYOFFS),
        slug: Constants.TierSlug.LEAGUE_ADVANCED_PLAYOFFS,
        size: 4,
        triggerOffsetDays: 9,
      },
    ],
  },
  {
    name: 'ESL Pro League',
    slug: Constants.LeagueSlug.ESPORTS_PRO_LEAGUE,
    startOffsetDays: 212,
    federations: [Constants.FederationSlug.ESPORTS_WORLD],
    tiers: [
      {
        name: 'Group Stage',
        slug: Constants.TierSlug.LEAGUE_PRO,
        size: 32,
        groupSize: 4,
        triggerTierSlug: Constants.TierSlug.LEAGUE_PRO_PLAYOFFS,
        lan: true,
      },
      {
        name: 'Playoffs',
        slug: Constants.TierSlug.LEAGUE_PRO_PLAYOFFS,
        size: 16,
        triggerOffsetDays: 2,
        lan: true,
      },
    ],
  },
  {
    name: '',
    slug: Constants.LeagueSlug.ESPORTS_MAJOR,
    startOffsetDays: 31,
    federations: [
      Constants.FederationSlug.ESPORTS_AMERICAS,
      Constants.FederationSlug.ESPORTS_ASIA,
      Constants.FederationSlug.ESPORTS_EUROPA,
      Constants.FederationSlug.ESPORTS_OCE,
      Constants.FederationSlug.ESPORTS_WORLD,
    ],
    tiers: [
      {
        name: 'RMR Open Qualifier #1 AS',
        slug: Constants.TierSlug.MAJOR_ASIA_OPEN_QUALIFIER_1,
        size: 62,
        triggerTierSlug: Constants.TierSlug.MAJOR_ASIA_OPEN_QUALIFIER_2,
      },
      {
        name: 'RMR Open Qualifier #2 AS',
        slug: Constants.TierSlug.MAJOR_ASIA_OPEN_QUALIFIER_2,
        size: 60,
        triggerOffsetDays: 3,
      },
      {
        name: 'RMR Open Qualifier #1 (CN)',
        slug: Constants.TierSlug.MAJOR_CHINA_OPEN_QUALIFIER_1,
        size: 32,
        triggerTierSlug: Constants.TierSlug.MAJOR_CHINA_OPEN_QUALIFIER_2,
      },
      {
        name: 'RMR Open Qualifier #2 (CN)',
        slug: Constants.TierSlug.MAJOR_CHINA_OPEN_QUALIFIER_2,
        size: 30,
        triggerOffsetDays: 4,
      },
      {
        name: 'RMR Open Qualifier #1 (AM)',
        slug: Constants.TierSlug.MAJOR_AMERICAS_OPEN_QUALIFIER_1,
        size: 102,
        triggerTierSlug: Constants.TierSlug.MAJOR_AMERICAS_OPEN_QUALIFIER_2,
      },
      {
        name: 'RMR Open Qualifier #2 (AM)',
        slug: Constants.TierSlug.MAJOR_AMERICAS_OPEN_QUALIFIER_2,
        size: 98,
        triggerOffsetDays: 2,
        triggerTierSlug: Constants.TierSlug.MAJOR_AMERICAS_RMR,
      },
      {
        name: 'RMR Americas',
        slug: Constants.TierSlug.MAJOR_AMERICAS_RMR,
        size: 16,
        triggerOffsetDays: 89,
        triggerTierSlug: Constants.TierSlug.MAJOR_CHALLENGERS_STAGE,
        lan: true,
      },
      {
        name: 'RMR Open Qualifier #1 (EU)',
        slug: Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_1,
        size: 94,
        triggerTierSlug: Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_2,
      },
      {
        name: 'RMR Open Qualifier #2 (EU)',
        slug: Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_2,
        size: 90,
        triggerOffsetDays: 2,
        triggerTierSlug: Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_3,
      },
      {
        name: 'RMR Open Qualifier #3 (EU)',
        slug: Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_3,
        size: 86,
        triggerOffsetDays: 2,
        triggerTierSlug: Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_4,
      },
      {
        name: 'RMR Open Qualifier #4 (EU)',
        slug: Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_4,
        size: 82,
        triggerOffsetDays: 2,
        triggerTierSlug: Constants.TierSlug.MAJOR_EUROPE_RMR_A,
      },
      {
        name: 'RMR Europe A',
        slug: Constants.TierSlug.MAJOR_EUROPE_RMR_A,
        size: 16,
        triggerOffsetDays: 71,
        triggerTierSlug: Constants.TierSlug.MAJOR_CHALLENGERS_STAGE,
        lan: true,
      },
      {
        name: 'RMR Europe B',
        slug: Constants.TierSlug.MAJOR_EUROPE_RMR_B,
        size: 16,
        triggerOffsetDays: 71,
        triggerTierSlug: Constants.TierSlug.MAJOR_CHALLENGERS_STAGE,
        lan: true,
      },
      {
        name: 'RMR Open Qualifier #1',
        slug: Constants.TierSlug.MAJOR_OCE_OPEN_QUALIFIER_1,
        size: 36,
        triggerTierSlug: Constants.TierSlug.MAJOR_OCE_OPEN_QUALIFIER_2,
      },
      {
        name: 'RMR Open Qualifier #2',
        slug: Constants.TierSlug.MAJOR_OCE_OPEN_QUALIFIER_2,
        size: 35,
        triggerOffsetDays: 3,
        triggerTierSlug: Constants.TierSlug.MAJOR_ASIA_RMR,
      },
      {
        name: 'RMR Asia',
        slug: Constants.TierSlug.MAJOR_ASIA_RMR,
        size: 8,
        triggerOffsetDays: 90,
        triggerTierSlug: Constants.TierSlug.MAJOR_CHALLENGERS_STAGE,
        lan: true,
      },
      {
        name: 'Major Challengers Stage',
        slug: Constants.TierSlug.MAJOR_CHALLENGERS_STAGE,
        size: 16,
        triggerOffsetDays: 116,
        triggerTierSlug: Constants.TierSlug.MAJOR_LEGENDS_STAGE,
        lan: true,
      },
      {
        name: 'Major Legends Stage',
        slug: Constants.TierSlug.MAJOR_LEGENDS_STAGE,
        size: 16,
        triggerOffsetDays: 4,
        triggerTierSlug: Constants.TierSlug.MAJOR_CHAMPIONS_STAGE,
        lan: true,
      },
      {
        name: 'Major Champions Stage',
        slug: Constants.TierSlug.MAJOR_CHAMPIONS_STAGE,
        size: 8,
        triggerOffsetDays: 4,
        lan: true,
      },
    ],
  },
  {
    name: 'BLAST Finals',
    slug: Constants.LeagueSlug.ESPORTS_BLAST,
    startOffsetDays: 66,
    federations: [Constants.FederationSlug.ESPORTS_WORLD],
    tiers: [
      {
        name: 'BLAST Finals',
        slug: Constants.TierSlug.BLAST_FINALS,
        size: 8,
        lan: true,
      },
    ],
  },
  {
    name: 'CCT Series',
    slug: Constants.LeagueSlug.ESPORTS_CCT,
    startOffsetDays: 148,
    federations: [
      Constants.FederationSlug.ESPORTS_AMERICAS,
      Constants.FederationSlug.ESPORTS_ASIA,
      Constants.FederationSlug.ESPORTS_EUROPA,
      Constants.FederationSlug.ESPORTS_OCE,
    ],
    tiers: [
      {
        name: 'CCT Series',
        slug: Constants.TierSlug.CCT_SERIES,
        size: 16,
        triggerTierSlug: Constants.TierSlug.CCT_SERIES_PLAYOFFS,
      },
      {
        name: 'CCT Series Playoffs',
        slug: Constants.TierSlug.CCT_SERIES_PLAYOFFS,
        size: 8,
        triggerOffsetDays: 1,
      },
      {
        name: 'CCT Oceania Series',
        slug: Constants.TierSlug.CCT_OCE_SERIES,
        size: 8,
        triggerTierSlug: Constants.TierSlug.CCT_OCE_PLAYOFFS,
      },
      {
        name: 'CCT Oceania Playoffs',
        slug: Constants.TierSlug.CCT_OCE_PLAYOFFS,
        size: 4,
        triggerOffsetDays: 3,
      },
    ],
  },
  {
    name: 'IEM Cologne Qualifier',
    slug: Constants.LeagueSlug.ESPORTS_IEM_COLOGNE_QUALIFIER,
    startOffsetDays: 163,
    federations: [
      Constants.FederationSlug.ESPORTS_AMERICAS,
      Constants.FederationSlug.ESPORTS_ASIA,
      Constants.FederationSlug.ESPORTS_EUROPA,
      Constants.FederationSlug.ESPORTS_OCE,
    ],
    tiers: [
      {
        name: 'IEM Cologne Qualifier',
        slug: Constants.TierSlug.IEM_COLOGNE_OPEN_QUALIFIER,
        size: 128,
      },
    ],
  },
  {
    name: 'IEM Cologne',
    slug: Constants.LeagueSlug.ESPORTS_IEM_COLOGNE,
    startOffsetDays: 192,
    federations: [Constants.FederationSlug.ESPORTS_WORLD],
    tiers: [
      {
        name: 'IEM Cologne Group A',
        slug: Constants.TierSlug.IEM_COLOGNE_GROUP_A,
        size: 8,
        triggerTierSlug: Constants.TierSlug.IEM_COLOGNE_PLAYOFFS,
        lan: true,
      },
      {
        name: 'IEM Cologne Group B',
        slug: Constants.TierSlug.IEM_COLOGNE_GROUP_B,
        size: 8,
        triggerTierSlug: Constants.TierSlug.IEM_COLOGNE_PLAYOFFS,
        lan: true,
      },
      {
        name: 'IEM Cologne Playoffs',
        slug: Constants.TierSlug.IEM_COLOGNE_PLAYOFFS,
        size: 6,
        triggerOffsetDays: 2,
        lan: true,
      },
    ],
  },
  {
    name: 'ESL Challenger',
    slug: Constants.LeagueSlug.ESPORTS_ESL_CHALLENGER,
    startOffsetDays: 177,
    federations: [Constants.FederationSlug.ESPORTS_WORLD],
    tiers: [
      {
        name: 'ESL Challenger Group Stage',
        slug: Constants.TierSlug.ESL_CHALLENGER,
        size: 8,
        groupSize: 4,
        triggerTierSlug: Constants.TierSlug.ESL_CHALLENGER_PLAYOFFS,
        lan: true,
      },
      {
        name: 'ESL Challenger Playoffs',
        slug: Constants.TierSlug.ESL_CHALLENGER_PLAYOFFS,
        size: 4,
        triggerOffsetDays: 1,
        lan: true,
      },
    ],
  },
  {
    name: 'CCT Global Finals',
    slug: Constants.LeagueSlug.ESPORTS_CCT_GLOBAL,
    startOffsetDays: 239,
    federations: [Constants.FederationSlug.ESPORTS_WORLD],
    tiers: [
      {
        name: 'CCT Global Finals',
        slug: Constants.TierSlug.CCT_GLOBAL_FINALS,
        size: 8,
        lan: true,
      },
    ],
  },
  {
    name: 'ESEA Cash Cup',
    slug: Constants.LeagueSlug.ESPORTS_ESEA_CASH_CUP,
    startOffsetDays: 286,
    federations: [
      Constants.FederationSlug.ESPORTS_AMERICAS,
      Constants.FederationSlug.ESPORTS_ASIA,
      Constants.FederationSlug.ESPORTS_EUROPA,
      Constants.FederationSlug.ESPORTS_OCE,
    ],
    tiers: [
      {
        name: 'ESEA Cash Cup',
        slug: Constants.TierSlug.ESEA_CASH_CUP,
        size: 80,
      },
    ],
  },
  {
    name: 'IEM Krakow Qualifier',
    slug: Constants.LeagueSlug.ESPORTS_IEM_KRAKOW_QUALIFIER,
    startOffsetDays: 300,
    federations: [
      Constants.FederationSlug.ESPORTS_AMERICAS,
      Constants.FederationSlug.ESPORTS_ASIA,
      Constants.FederationSlug.ESPORTS_EUROPA,
      Constants.FederationSlug.ESPORTS_OCE,
    ],
    tiers: [
      {
        name: 'IEM Krakow Qualifier',
        slug: Constants.TierSlug.IEM_KRAKOW_OPEN_QUALIFIER,
        size: 128,
      },
    ],
  },
  {
    name: 'IEM Krakow',
    slug: Constants.LeagueSlug.ESPORTS_IEM_KRAKOW,
    startOffsetDays: 314,
    federations: [Constants.FederationSlug.ESPORTS_WORLD],
    tiers: [
      {
        name: 'IEM Krakow Group A',
        slug: Constants.TierSlug.IEM_KRAKOW_GROUP_A,
        size: 8,
        triggerTierSlug: Constants.TierSlug.IEM_KRAKOW_PLAYOFFS,
        lan: true,
      },
      {
        name: 'IEM Krakow Group B',
        slug: Constants.TierSlug.IEM_KRAKOW_GROUP_B,
        size: 8,
        triggerTierSlug: Constants.TierSlug.IEM_KRAKOW_PLAYOFFS,
        lan: true,
      },
      {
        name: 'IEM Krakow Playoffs',
        slug: Constants.TierSlug.IEM_KRAKOW_PLAYOFFS,
        size: 6,
        triggerOffsetDays: 2,
        lan: true,
      },
    ],
  },
];

/**
 * The main seeder.
 *
 * @param prisma The prisma client.
 * @function
 */
export async function syncLeagueSchedule(prisma: PrismaClient) {
  // grab all federations
  const federations = await prisma.federation.findMany();

  for (const league of data) {
    const leagueFederations = federations
      .filter((federation) =>
        league.federations.includes(federation.slug as Constants.FederationSlug),
      )
      .map((federation) => ({ id: federation.id }));

    const persistedLeague = await prisma.league.upsert({
      where: { slug: league.slug },
      update: {
        name: league.name,
        slug: league.slug,
        startOffsetDays: league.startOffsetDays,
        federations: {
          set: leagueFederations,
        },
      },
      create: {
        name: league.name,
        slug: league.slug,
        startOffsetDays: league.startOffsetDays,
        federations: {
          connect: leagueFederations,
        },
      },
    });

    for (const tier of league.tiers) {
      await prisma.tier.upsert({
        where: { slug: tier.slug },
        update: {
          ...tier,
          league: {
            connect: { id: persistedLeague.id },
          },
        },
        create: {
          ...tier,
          league: {
            connect: { id: persistedLeague.id },
          },
        },
      });
    }
  }

  return Promise.resolve();
}

export default syncLeagueSchedule;
