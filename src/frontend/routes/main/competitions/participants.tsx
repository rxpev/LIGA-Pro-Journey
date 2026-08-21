/**
 * Competition participants route.
 *
 * @module
 */
import React from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { cx } from '@liga/frontend/lib';
import { Constants, Eagers, Util } from '@liga/shared';
import swissTeamPlaceholder from '@liga/frontend/assets/swiss/teamplaceholder.svg';

type Competition = RouteContextCompetitions['competition'];
type ParticipantSlot = {
  source: string;
  team?: Competition['competitors'][number]['team'];
};

const FEDERATION_LABELS: Partial<Record<Constants.FederationSlug, string>> = {
  [Constants.FederationSlug.ESPORTS_AMERICAS]: 'Americas',
  [Constants.FederationSlug.ESPORTS_ASIA]: 'Asia',
  [Constants.FederationSlug.ESPORTS_EUROPA]: 'Europe',
  [Constants.FederationSlug.ESPORTS_OCE]: 'Oceania',
  [Constants.FederationSlug.ESPORTS_WORLD]: 'Global',
};

const DIRECT_INVITE_LABELS: Partial<Record<string, string>> = {
  [Constants.TierSlug.BLAST_FINALS]: 'World Ranking',
  [Constants.TierSlug.IEM_COLOGNE_GROUP_A]: 'World Ranking',
  [Constants.TierSlug.IEM_COLOGNE_GROUP_B]: 'World Ranking',
  [Constants.TierSlug.IEM_KRAKOW_GROUP_A]: 'World Ranking',
  [Constants.TierSlug.IEM_KRAKOW_GROUP_B]: 'World Ranking',
};

const CCT_GLOBAL_FINALS_PLACEHOLDER_SOURCES = [
  'CCT Series Europe',
  'CCT Series Europe',
  'CCT Series Europe',
  'CCT Series Europe',
  'CCT Series Americas',
  'CCT Series Americas',
  'CCT Series Asia',
  'CCT Series Oceania',
];

const CCT_GLOBAL_FINALS_FEEDER_RULES = [
  {
    source: Constants.TierSlug.CCT_SERIES_PLAYOFFS,
    federation: Constants.FederationSlug.ESPORTS_EUROPA,
    start: 1,
    end: 4,
  },
  {
    source: Constants.TierSlug.CCT_SERIES_PLAYOFFS,
    federation: Constants.FederationSlug.ESPORTS_AMERICAS,
    start: 1,
    end: 2,
  },
  {
    source: Constants.TierSlug.CCT_SERIES_PLAYOFFS,
    federation: Constants.FederationSlug.ESPORTS_ASIA,
    start: 1,
    end: 1,
  },
  {
    source: Constants.TierSlug.CCT_OCE_PLAYOFFS,
    federation: Constants.FederationSlug.ESPORTS_OCE,
    start: 1,
    end: 1,
  },
] as const;

const BLAST_FINALS_PLACEHOLDER_SOURCES = Array.from({ length: 8 }, () => 'World Ranking');

const IEM_PLACEHOLDER_SOURCES = [
  ...Array.from({ length: 8 }, () => 'Europe Ranking'),
  ...Array.from({ length: 2 }, () => 'Americas Ranking'),
  ...Array.from({ length: 2 }, () => 'Asia Ranking'),
  'Europe Qualifier',
  'Americas Qualifier',
  'Asia Qualifier',
  'Oceania Qualifier',
];

const EPL_RETAINED_SLOTS_BY_FEDERATION_ID = {
  1: 4, // Americas
  2: 9, // Europe
  3: 2, // Asia
  4: 1, // Oceania
} as const;

type SourceRule = {
  target: Constants.TierSlug;
  source: Constants.TierSlug;
  federation?: Constants.FederationSlug;
  seasonOffset?: number;
  start?: number;
  end?: number;
};

const REGIONAL_EU_AM = [
  Constants.FederationSlug.ESPORTS_EUROPA,
  Constants.FederationSlug.ESPORTS_AMERICAS,
];

const QUALIFICATION_SOURCE_RULES: SourceRule[] = [
  ...REGIONAL_EU_AM.flatMap((federation) => [
    {
      target: Constants.TierSlug.LEAGUE_OPEN,
      source: Constants.TierSlug.LEAGUE_OPEN_PLAYOFFS,
      federation,
      seasonOffset: -1,
      start: 5,
      end: 16,
    },
    {
      target: Constants.TierSlug.LEAGUE_OPEN,
      source: Constants.TierSlug.LEAGUE_OPEN,
      federation,
      seasonOffset: -1,
      start: 17,
      end: 40,
    },
    {
      target: Constants.TierSlug.LEAGUE_OPEN,
      source: Constants.TierSlug.LEAGUE_INTERMEDIATE,
      federation,
      seasonOffset: -1,
      start: 27,
      end: 30,
    },
    {
      target: Constants.TierSlug.LEAGUE_INTERMEDIATE,
      source: Constants.TierSlug.LEAGUE_OPEN_PLAYOFFS,
      federation,
      seasonOffset: -1,
      start: 1,
      end: 4,
    },
    {
      target: Constants.TierSlug.LEAGUE_INTERMEDIATE,
      source: Constants.TierSlug.LEAGUE_INTERMEDIATE_PLAYOFFS,
      federation,
      seasonOffset: -1,
      start: 5,
      end: 8,
    },
    {
      target: Constants.TierSlug.LEAGUE_INTERMEDIATE,
      source: Constants.TierSlug.LEAGUE_INTERMEDIATE,
      federation,
      seasonOffset: -1,
      start: 9,
      end: 26,
    },
    {
      target: Constants.TierSlug.LEAGUE_INTERMEDIATE,
      source: Constants.TierSlug.LEAGUE_MAIN,
      federation,
      seasonOffset: -1,
      start: 17,
      end: 20,
    },
    {
      target: Constants.TierSlug.LEAGUE_MAIN,
      source: Constants.TierSlug.LEAGUE_INTERMEDIATE_PLAYOFFS,
      federation,
      seasonOffset: -1,
      start: 1,
      end: 4,
    },
    {
      target: Constants.TierSlug.LEAGUE_MAIN,
      source: Constants.TierSlug.LEAGUE_MAIN_PLAYOFFS,
      federation,
      seasonOffset: -1,
      start: 5,
      end: 8,
    },
    {
      target: Constants.TierSlug.LEAGUE_MAIN,
      source: Constants.TierSlug.LEAGUE_MAIN,
      federation,
      seasonOffset: -1,
      start: 9,
      end: 16,
    },
    {
      target: Constants.TierSlug.LEAGUE_MAIN,
      source: Constants.TierSlug.LEAGUE_ADVANCED,
      federation,
      seasonOffset: -1,
      start: 17,
      end: 20,
    },
    {
      target: Constants.TierSlug.LEAGUE_ADVANCED,
      source: Constants.TierSlug.LEAGUE_MAIN_PLAYOFFS,
      federation,
      seasonOffset: -1,
      start: 1,
      end: 4,
    },
    {
      target: Constants.TierSlug.LEAGUE_ADVANCED,
      source: Constants.TierSlug.LEAGUE_ADVANCED_PLAYOFFS,
      federation,
      seasonOffset: -1,
      start: 9,
      end: 16,
    },
    {
      target: Constants.TierSlug.CCT_SERIES,
      source: Constants.TierSlug.LEAGUE_MAIN_PLAYOFFS,
      federation,
      start: 5,
      end: 8,
    },
    {
      target: Constants.TierSlug.CCT_SERIES,
      source: Constants.TierSlug.LEAGUE_INTERMEDIATE_PLAYOFFS,
      federation,
      start: 1,
      end: 8,
    },
    {
      target: Constants.TierSlug.CCT_SERIES,
      source: Constants.TierSlug.LEAGUE_OPEN_PLAYOFFS,
      federation,
      start: 1,
      end: 4,
    },
    {
      target: Constants.TierSlug.ESEA_CASH_CUP,
      source: Constants.TierSlug.LEAGUE_OPEN,
      federation,
      start: 1,
      end: 40,
    },
    {
      target: Constants.TierSlug.ESEA_CASH_CUP,
      source: Constants.TierSlug.LEAGUE_INTERMEDIATE,
      federation,
      start: 1,
      end: 30,
    },
  ]),
  ...[
    { federation: Constants.FederationSlug.ESPORTS_EUROPA, start: 10, end: 17 },
    { federation: Constants.FederationSlug.ESPORTS_AMERICAS, start: 5, end: 8 },
    { federation: Constants.FederationSlug.ESPORTS_ASIA, start: 3, end: 5 },
    { federation: Constants.FederationSlug.ESPORTS_OCE, start: 2, end: 2 },
  ].map(({ federation, start, end }) => ({
    target: Constants.TierSlug.LEAGUE_ADVANCED,
    source: Constants.TierSlug.LEAGUE_PRO,
    federation,
    seasonOffset: -1,
    start,
    end,
  })),
  ...[
    { federation: Constants.FederationSlug.ESPORTS_EUROPA, end: 8 },
    { federation: Constants.FederationSlug.ESPORTS_AMERICAS, end: 4 },
    { federation: Constants.FederationSlug.ESPORTS_ASIA, end: 3 },
    { federation: Constants.FederationSlug.ESPORTS_OCE, end: 1 },
  ].map(({ federation, end }) => ({
    target: Constants.TierSlug.LEAGUE_PRO,
    source: Constants.TierSlug.LEAGUE_ADVANCED_PLAYOFFS,
    federation,
    start: 1,
    end,
  })),
  {
    target: Constants.TierSlug.MAJOR_LEGENDS_STAGE,
    source: Constants.TierSlug.MAJOR_CHALLENGERS_STAGE,
    federation: Constants.FederationSlug.ESPORTS_WORLD,
    start: 1,
    end: 8,
  },
  {
    target: Constants.TierSlug.MAJOR_LEGENDS_STAGE,
    source: Constants.TierSlug.MAJOR_AMERICAS_RMR,
    federation: Constants.FederationSlug.ESPORTS_AMERICAS,
    start: 1,
    end: 1,
  },
  {
    target: Constants.TierSlug.MAJOR_LEGENDS_STAGE,
    source: Constants.TierSlug.MAJOR_EUROPE_RMR_A,
    federation: Constants.FederationSlug.ESPORTS_EUROPA,
    start: 1,
    end: 4,
  },
  {
    target: Constants.TierSlug.MAJOR_LEGENDS_STAGE,
    source: Constants.TierSlug.MAJOR_EUROPE_RMR_B,
    federation: Constants.FederationSlug.ESPORTS_EUROPA,
    start: 1,
    end: 3,
  },
  {
    target: Constants.TierSlug.MAJOR_CHAMPIONS_STAGE,
    source: Constants.TierSlug.MAJOR_LEGENDS_STAGE,
    federation: Constants.FederationSlug.ESPORTS_WORLD,
    start: 1,
    end: 8,
  },
  {
    target: Constants.TierSlug.MAJOR_ASIA_RMR,
    source: Constants.TierSlug.MAJOR_ASIA_OPEN_QUALIFIER_1,
    federation: Constants.FederationSlug.ESPORTS_ASIA,
    start: 1,
    end: 2,
  },
  {
    target: Constants.TierSlug.MAJOR_ASIA_RMR,
    source: Constants.TierSlug.MAJOR_ASIA_OPEN_QUALIFIER_2,
    federation: Constants.FederationSlug.ESPORTS_ASIA,
    start: 1,
    end: 2,
  },
  {
    target: Constants.TierSlug.MAJOR_ASIA_RMR,
    source: Constants.TierSlug.MAJOR_CHINA_OPEN_QUALIFIER_1,
    federation: Constants.FederationSlug.ESPORTS_ASIA,
    start: 1,
    end: 1,
  },
  {
    target: Constants.TierSlug.MAJOR_ASIA_RMR,
    source: Constants.TierSlug.MAJOR_CHINA_OPEN_QUALIFIER_2,
    federation: Constants.FederationSlug.ESPORTS_ASIA,
    start: 1,
    end: 1,
  },
  {
    target: Constants.TierSlug.MAJOR_ASIA_RMR,
    source: Constants.TierSlug.MAJOR_OCE_OPEN_QUALIFIER_1,
    federation: Constants.FederationSlug.ESPORTS_OCE,
    start: 1,
    end: 1,
  },
  {
    target: Constants.TierSlug.MAJOR_ASIA_RMR,
    source: Constants.TierSlug.MAJOR_OCE_OPEN_QUALIFIER_2,
    federation: Constants.FederationSlug.ESPORTS_OCE,
    start: 1,
    end: 1,
  },
  {
    target: Constants.TierSlug.MAJOR_AMERICAS_RMR,
    source: Constants.TierSlug.MAJOR_AMERICAS_OPEN_QUALIFIER_1,
    federation: Constants.FederationSlug.ESPORTS_AMERICAS,
    start: 1,
    end: 4,
  },
  {
    target: Constants.TierSlug.MAJOR_AMERICAS_RMR,
    source: Constants.TierSlug.MAJOR_AMERICAS_OPEN_QUALIFIER_2,
    federation: Constants.FederationSlug.ESPORTS_AMERICAS,
    start: 1,
    end: 4,
  },
  {
    target: Constants.TierSlug.MAJOR_EUROPE_RMR_A,
    source: Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_1,
    federation: Constants.FederationSlug.ESPORTS_EUROPA,
    start: 1,
    end: 4,
  },
  {
    target: Constants.TierSlug.MAJOR_EUROPE_RMR_A,
    source: Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_3,
    federation: Constants.FederationSlug.ESPORTS_EUROPA,
    start: 1,
    end: 4,
  },
  {
    target: Constants.TierSlug.MAJOR_EUROPE_RMR_B,
    source: Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_2,
    federation: Constants.FederationSlug.ESPORTS_EUROPA,
    start: 1,
    end: 4,
  },
  {
    target: Constants.TierSlug.MAJOR_EUROPE_RMR_B,
    source: Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_4,
    federation: Constants.FederationSlug.ESPORTS_EUROPA,
    start: 1,
    end: 4,
  },
  {
    target: Constants.TierSlug.LEAGUE_ADVANCED,
    source: Constants.TierSlug.LEAGUE_OPEN_PLAYOFFS,
    federation: Constants.FederationSlug.ESPORTS_ASIA,
    seasonOffset: -1,
    start: 1,
    end: 2,
  },
  {
    target: Constants.TierSlug.LEAGUE_ADVANCED,
    source: Constants.TierSlug.LEAGUE_ADVANCED_PLAYOFFS,
    federation: Constants.FederationSlug.ESPORTS_ASIA,
    seasonOffset: -1,
    start: 4,
    end: 8,
  },
  {
    target: Constants.TierSlug.LEAGUE_ADVANCED,
    source: Constants.TierSlug.LEAGUE_ADVANCED,
    federation: Constants.FederationSlug.ESPORTS_ASIA,
    seasonOffset: -1,
    start: 9,
    end: 18,
  },
  {
    target: Constants.TierSlug.LEAGUE_ADVANCED,
    source: Constants.TierSlug.LEAGUE_OPEN_PLAYOFFS,
    federation: Constants.FederationSlug.ESPORTS_OCE,
    seasonOffset: -1,
    start: 1,
    end: 2,
  },
  {
    target: Constants.TierSlug.LEAGUE_ADVANCED,
    source: Constants.TierSlug.LEAGUE_ADVANCED_PLAYOFFS,
    federation: Constants.FederationSlug.ESPORTS_OCE,
    seasonOffset: -1,
    start: 2,
    end: 8,
  },
  {
    target: Constants.TierSlug.LEAGUE_ADVANCED,
    source: Constants.TierSlug.LEAGUE_ADVANCED,
    federation: Constants.FederationSlug.ESPORTS_OCE,
    seasonOffset: -1,
    start: 9,
    end: 13,
  },
  {
    target: Constants.TierSlug.LEAGUE_OPEN,
    source: Constants.TierSlug.LEAGUE_OPEN_PLAYOFFS,
    federation: Constants.FederationSlug.ESPORTS_ASIA,
    seasonOffset: -1,
    start: 3,
    end: 8,
  },
  {
    target: Constants.TierSlug.LEAGUE_OPEN,
    source: Constants.TierSlug.LEAGUE_OPEN,
    federation: Constants.FederationSlug.ESPORTS_ASIA,
    seasonOffset: -1,
    start: 9,
    end: 30,
  },
  {
    target: Constants.TierSlug.LEAGUE_OPEN,
    source: Constants.TierSlug.LEAGUE_ADVANCED,
    federation: Constants.FederationSlug.ESPORTS_ASIA,
    seasonOffset: -1,
    start: 19,
    end: 20,
  },
  {
    target: Constants.TierSlug.LEAGUE_OPEN,
    source: Constants.TierSlug.LEAGUE_OPEN_PLAYOFFS,
    federation: Constants.FederationSlug.ESPORTS_OCE,
    seasonOffset: -1,
    start: 3,
    end: 8,
  },
  {
    target: Constants.TierSlug.LEAGUE_OPEN,
    source: Constants.TierSlug.LEAGUE_OPEN,
    federation: Constants.FederationSlug.ESPORTS_OCE,
    seasonOffset: -1,
    start: 9,
    end: 20,
  },
  {
    target: Constants.TierSlug.LEAGUE_OPEN,
    source: Constants.TierSlug.LEAGUE_ADVANCED,
    federation: Constants.FederationSlug.ESPORTS_OCE,
    seasonOffset: -1,
    start: 15,
    end: 16,
  },
  {
    target: Constants.TierSlug.CCT_SERIES,
    source: Constants.TierSlug.LEAGUE_ADVANCED_PLAYOFFS,
    federation: Constants.FederationSlug.ESPORTS_ASIA,
    start: 5,
    end: 8,
  },
  {
    target: Constants.TierSlug.CCT_SERIES,
    source: Constants.TierSlug.LEAGUE_OPEN,
    federation: Constants.FederationSlug.ESPORTS_ASIA,
    start: 1,
    end: 12,
  },
  {
    target: Constants.TierSlug.CCT_OCE_SERIES,
    source: Constants.TierSlug.LEAGUE_OPEN_PLAYOFFS,
    federation: Constants.FederationSlug.ESPORTS_OCE,
    start: 1,
    end: 2,
  },
  {
    target: Constants.TierSlug.CCT_OCE_SERIES,
    source: Constants.TierSlug.LEAGUE_ADVANCED_PLAYOFFS,
    federation: Constants.FederationSlug.ESPORTS_OCE,
    start: 1,
    end: 6,
  },
  {
    target: Constants.TierSlug.ESL_CHALLENGER,
    source: Constants.TierSlug.LEAGUE_MAIN_PLAYOFFS,
    federation: Constants.FederationSlug.ESPORTS_EUROPA,
    start: 1,
    end: 4,
  },
  {
    target: Constants.TierSlug.ESL_CHALLENGER,
    source: Constants.TierSlug.LEAGUE_ADVANCED_PLAYOFFS,
    federation: Constants.FederationSlug.ESPORTS_AMERICAS,
    start: 1,
    end: 2,
  },
  {
    target: Constants.TierSlug.ESL_CHALLENGER,
    source: Constants.TierSlug.LEAGUE_ADVANCED_PLAYOFFS,
    federation: Constants.FederationSlug.ESPORTS_ASIA,
    start: 1,
    end: 1,
  },
  {
    target: Constants.TierSlug.ESL_CHALLENGER,
    source: Constants.TierSlug.LEAGUE_ADVANCED_PLAYOFFS,
    federation: Constants.FederationSlug.ESPORTS_OCE,
    start: 1,
    end: 1,
  },
  ...[
    {
      source: Constants.TierSlug.CCT_SERIES_PLAYOFFS,
      federation: Constants.FederationSlug.ESPORTS_EUROPA,
      end: 4,
    },
    {
      source: Constants.TierSlug.CCT_SERIES_PLAYOFFS,
      federation: Constants.FederationSlug.ESPORTS_AMERICAS,
      end: 2,
    },
    {
      source: Constants.TierSlug.CCT_SERIES_PLAYOFFS,
      federation: Constants.FederationSlug.ESPORTS_ASIA,
      end: 1,
    },
    {
      source: Constants.TierSlug.CCT_OCE_PLAYOFFS,
      federation: Constants.FederationSlug.ESPORTS_OCE,
      end: 1,
    },
  ].map(({ source, federation, end }) => ({
    target: Constants.TierSlug.CCT_GLOBAL_FINALS,
    source,
    federation,
    start: 1,
    end,
  })),
  {
    target: Constants.TierSlug.ESEA_CASH_CUP,
    source: Constants.TierSlug.LEAGUE_OPEN,
    federation: Constants.FederationSlug.ESPORTS_ASIA,
    start: 1,
    end: 30,
  },
  {
    target: Constants.TierSlug.ESEA_CASH_CUP,
    source: Constants.TierSlug.LEAGUE_ADVANCED,
    federation: Constants.FederationSlug.ESPORTS_ASIA,
    start: 9,
    end: 20,
  },
  {
    target: Constants.TierSlug.ESEA_CASH_CUP,
    source: Constants.TierSlug.LEAGUE_OPEN,
    federation: Constants.FederationSlug.ESPORTS_OCE,
    start: 1,
    end: 20,
  },
  {
    target: Constants.TierSlug.ESEA_CASH_CUP,
    source: Constants.TierSlug.LEAGUE_ADVANCED,
    federation: Constants.FederationSlug.ESPORTS_OCE,
    start: 9,
    end: 15,
  },
];

const RMR_SLOT_SOURCE_RULES: Partial<Record<Constants.TierSlug, SourceRule[]>> = {
  [Constants.TierSlug.MAJOR_ASIA_RMR]: [
    {
      target: Constants.TierSlug.MAJOR_ASIA_RMR,
      source: Constants.TierSlug.MAJOR_ASIA_OPEN_QUALIFIER_1,
      federation: Constants.FederationSlug.ESPORTS_ASIA,
    },
    {
      target: Constants.TierSlug.MAJOR_ASIA_RMR,
      source: Constants.TierSlug.MAJOR_ASIA_OPEN_QUALIFIER_1,
      federation: Constants.FederationSlug.ESPORTS_ASIA,
    },
    {
      target: Constants.TierSlug.MAJOR_ASIA_RMR,
      source: Constants.TierSlug.MAJOR_ASIA_OPEN_QUALIFIER_2,
      federation: Constants.FederationSlug.ESPORTS_ASIA,
    },
    {
      target: Constants.TierSlug.MAJOR_ASIA_RMR,
      source: Constants.TierSlug.MAJOR_ASIA_OPEN_QUALIFIER_2,
      federation: Constants.FederationSlug.ESPORTS_ASIA,
    },
    {
      target: Constants.TierSlug.MAJOR_ASIA_RMR,
      source: Constants.TierSlug.MAJOR_CHINA_OPEN_QUALIFIER_1,
      federation: Constants.FederationSlug.ESPORTS_ASIA,
    },
    {
      target: Constants.TierSlug.MAJOR_ASIA_RMR,
      source: Constants.TierSlug.MAJOR_CHINA_OPEN_QUALIFIER_2,
      federation: Constants.FederationSlug.ESPORTS_ASIA,
    },
    {
      target: Constants.TierSlug.MAJOR_ASIA_RMR,
      source: Constants.TierSlug.MAJOR_OCE_OPEN_QUALIFIER_1,
      federation: Constants.FederationSlug.ESPORTS_OCE,
    },
    {
      target: Constants.TierSlug.MAJOR_ASIA_RMR,
      source: Constants.TierSlug.MAJOR_OCE_OPEN_QUALIFIER_2,
      federation: Constants.FederationSlug.ESPORTS_OCE,
    },
  ],
  [Constants.TierSlug.MAJOR_AMERICAS_RMR]: [
    ...Array.from({ length: 4 }, () => ({
      target: Constants.TierSlug.MAJOR_AMERICAS_RMR,
      source: Constants.TierSlug.MAJOR_AMERICAS_OPEN_QUALIFIER_1,
      federation: Constants.FederationSlug.ESPORTS_AMERICAS,
    })),
    ...Array.from({ length: 4 }, () => ({
      target: Constants.TierSlug.MAJOR_AMERICAS_RMR,
      source: Constants.TierSlug.MAJOR_AMERICAS_OPEN_QUALIFIER_2,
      federation: Constants.FederationSlug.ESPORTS_AMERICAS,
    })),
  ],
  [Constants.TierSlug.MAJOR_EUROPE_RMR_A]: [
    ...Array.from({ length: 4 }, () => ({
      target: Constants.TierSlug.MAJOR_EUROPE_RMR_A,
      source: Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_1,
      federation: Constants.FederationSlug.ESPORTS_EUROPA,
    })),
    ...Array.from({ length: 4 }, () => ({
      target: Constants.TierSlug.MAJOR_EUROPE_RMR_A,
      source: Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_3,
      federation: Constants.FederationSlug.ESPORTS_EUROPA,
    })),
  ],
  [Constants.TierSlug.MAJOR_EUROPE_RMR_B]: [
    ...Array.from({ length: 4 }, () => ({
      target: Constants.TierSlug.MAJOR_EUROPE_RMR_B,
      source: Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_2,
      federation: Constants.FederationSlug.ESPORTS_EUROPA,
    })),
    ...Array.from({ length: 4 }, () => ({
      target: Constants.TierSlug.MAJOR_EUROPE_RMR_B,
      source: Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_4,
      federation: Constants.FederationSlug.ESPORTS_EUROPA,
    })),
  ],
};

const EXPLICIT_FEEDER_TIER_SLUGS: Partial<Record<string, string[]>> = {
  [Constants.TierSlug.IEM_COLOGNE_GROUP_A]: [Constants.TierSlug.IEM_COLOGNE_OPEN_QUALIFIER],
  [Constants.TierSlug.IEM_COLOGNE_GROUP_B]: [Constants.TierSlug.IEM_COLOGNE_OPEN_QUALIFIER],
  [Constants.TierSlug.IEM_KRAKOW_GROUP_A]: [Constants.TierSlug.IEM_KRAKOW_OPEN_QUALIFIER],
  [Constants.TierSlug.IEM_KRAKOW_GROUP_B]: [Constants.TierSlug.IEM_KRAKOW_OPEN_QUALIFIER],
  [Constants.TierSlug.MAJOR_EUROPE_RMR_A]: [
    Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_1,
    Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_3,
  ],
  [Constants.TierSlug.MAJOR_EUROPE_RMR_B]: [
    Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_2,
    Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_4,
  ],
};

const IEM_GROUP_TIER_SLUGS = new Set<string>([
  Constants.TierSlug.IEM_COLOGNE_GROUP_A,
  Constants.TierSlug.IEM_COLOGNE_GROUP_B,
  Constants.TierSlug.IEM_KRAKOW_GROUP_A,
  Constants.TierSlug.IEM_KRAKOW_GROUP_B,
]);

function getFederationLabel(federationSlug?: string | null) {
  return (
    FEDERATION_LABELS[federationSlug as Constants.FederationSlug] ||
    federationSlug?.replace(/\b\w/g, (char) => char.toLocaleUpperCase()) ||
    'Global'
  );
}

function getRankingFallbackLabel(competition: Competition) {
  const federationSlug = competition.federation.slug as Constants.FederationSlug;

  if (DIRECT_INVITE_LABELS[competition.tier.slug]) {
    return DIRECT_INVITE_LABELS[competition.tier.slug];
  }

  if (federationSlug === Constants.FederationSlug.ESPORTS_WORLD) {
    return 'World Ranking';
  }

  return `${getFederationLabel(federationSlug)} Ranking`;
}

function getShortLeagueSourceLabel(
  current: Competition,
  source: Competition,
  rule?: SourceRule | null,
) {
  const tierSlug = source.tier.slug as Constants.TierSlug;

  if (source.tier.league.slug === Constants.LeagueSlug.ESPORTS_PRO_LEAGUE) {
    return source.tier.league.name;
  }

  if (source.tier.league.slug === Constants.LeagueSlug.ESPORTS_LEAGUE) {
    const sourceFederationLabel = getFederationLabel(
      (rule?.federation ?? source.federation.slug) as Constants.FederationSlug,
    );
    const division = Constants.IdiomaticTier[tierSlug].replace(' Division', '');
    const shouldHidePlayoffs =
      current.tier.slug === Constants.TierSlug.LEAGUE_PRO &&
      tierSlug === Constants.TierSlug.LEAGUE_ADVANCED_PLAYOFFS;
    const label = shouldHidePlayoffs ? division.replace(' Playoffs', '') : division;

    if (current.federation.slug === Constants.FederationSlug.ESPORTS_WORLD) {
      return `ESEA ${label} ${sourceFederationLabel}`;
    }

    return `ESEA ${label}`;
  }

  return null;
}

function getCompetitionSourceLabel(
  current: Competition,
  source: Competition,
  rule?: SourceRule | null,
) {
  const tierSlug = source.tier.slug as Constants.TierSlug;
  const federationSlug = source.federation.slug as Constants.FederationSlug;
  const federationLabel = getFederationLabel(federationSlug);
  const shortLeagueLabel = getShortLeagueSourceLabel(current, source, rule);

  if (shortLeagueLabel) {
    return shortLeagueLabel;
  }

  if (
    [
      Constants.TierSlug.MAJOR_ASIA_RMR,
      Constants.TierSlug.MAJOR_AMERICAS_RMR,
      Constants.TierSlug.MAJOR_EUROPE_RMR_A,
      Constants.TierSlug.MAJOR_EUROPE_RMR_B,
    ].includes(tierSlug)
  ) {
    return `${federationLabel} ${Constants.IdiomaticTier[tierSlug]}`;
  }

  const displayName = Util.getCompetitionDisplayName(source.tier.league.name, source.tier.slug);

  if (federationSlug === Constants.FederationSlug.ESPORTS_WORLD) {
    return displayName;
  }

  return `${displayName} ${federationLabel}`;
}

function getTierSourceLabel(
  tierSlug: Constants.TierSlug,
  federationSlug: Constants.FederationSlug,
) {
  return `${Constants.IdiomaticTier[tierSlug]} ${getFederationLabel(federationSlug)}`;
}

function isExplicitFeeder(currentTierSlug: string, sourceTierSlug: string) {
  return EXPLICIT_FEEDER_TIER_SLUGS[currentTierSlug]?.includes(sourceTierSlug) === true;
}

function isPositionInRange(position: number | null | undefined, rule: SourceRule) {
  const start = rule.start == null || rule.start <= 0 ? 1 : rule.start;
  const end = rule.end ?? Number.POSITIVE_INFINITY;

  return position != null && position >= start && position <= end;
}

function getRulePosition(current: Competition, source: Competition, teamId: number) {
  const sourceTierSlug = source.tier.slug as Constants.TierSlug;
  const sourceCompetitor = source.competitors.find((competitor) => competitor.teamId === teamId);

  if (!sourceCompetitor) {
    return null;
  }

  if (
    sourceTierSlug === Constants.TierSlug.LEAGUE_PRO &&
    current.federation.slug !== Constants.FederationSlug.ESPORTS_WORLD
  ) {
    const regionalCompetitors = source.competitors
      .filter((competitor) => competitor.team.competitionFederationId === current.federationId)
      .sort(
        (a, b) =>
          (a.position ?? Number.POSITIVE_INFINITY) - (b.position ?? Number.POSITIVE_INFINITY),
      );

    const regionalIndex = regionalCompetitors.findIndex(
      (competitor) => competitor.teamId === teamId,
    );
    return regionalIndex >= 0 ? regionalIndex + 1 : null;
  }

  return sourceCompetitor.position;
}

function getRuleSource(current: Competition, source: Competition, teamId: number) {
  const currentTierSlug = current.tier.slug as Constants.TierSlug;
  const sourceTierSlug = source.tier.slug as Constants.TierSlug;
  const sourceFederationSlug = source.federation.slug as Constants.FederationSlug;
  const currentFederationSlug = current.federation.slug as Constants.FederationSlug;
  const sourceCompetitor = source.competitors.find((competitor) => competitor.teamId === teamId);

  if (!sourceCompetitor) {
    return null;
  }

  return QUALIFICATION_SOURCE_RULES.find((rule) => {
    const seasonOffset = rule.seasonOffset ?? 0;
    const federationMatches =
      !rule.federation ||
      rule.federation === sourceFederationSlug ||
      (sourceFederationSlug === Constants.FederationSlug.ESPORTS_WORLD &&
        rule.federation === currentFederationSlug);

    return (
      rule.target === currentTierSlug &&
      rule.source === sourceTierSlug &&
      federationMatches &&
      source.season === current.season + seasonOffset &&
      isPositionInRange(getRulePosition(current, source, teamId), rule)
    );
  });
}

function getRuleSourceIndex(current: Competition, source: Competition, teamId: number) {
  const rule = getRuleSource(current, source, teamId);

  return rule ? QUALIFICATION_SOURCE_RULES.indexOf(rule) : Number.POSITIVE_INFINITY;
}

function getRmrSlotSourceLabel(competition: Competition, teamId: number) {
  const slotRules = RMR_SLOT_SOURCE_RULES[competition.tier.slug as Constants.TierSlug];

  if (!slotRules) {
    return null;
  }

  const competitorIndex = [...competition.competitors]
    .sort((a, b) => a.id - b.id)
    .findIndex((competitor) => competitor.teamId === teamId);
  const rule = competitorIndex >= 0 ? slotRules[competitorIndex] : null;

  if (!rule) {
    return getRankingFallbackLabel(competition);
  }

  if (competition.tier.slug === Constants.TierSlug.MAJOR_ASIA_RMR) {
    if (
      [
        Constants.TierSlug.MAJOR_ASIA_OPEN_QUALIFIER_1,
        Constants.TierSlug.MAJOR_ASIA_OPEN_QUALIFIER_2,
      ].includes(rule.source)
    ) {
      return 'Asia Open Qualifier';
    }

    if (
      [
        Constants.TierSlug.MAJOR_CHINA_OPEN_QUALIFIER_1,
        Constants.TierSlug.MAJOR_CHINA_OPEN_QUALIFIER_2,
      ].includes(rule.source)
    ) {
      return 'China Open Qualifier';
    }

    return 'Oceania Open Qualifier';
  }

  return getTierSourceLabel(
    rule.source,
    (rule.federation ?? competition.federation.slug) as Constants.FederationSlug,
  );
}

function getEplRetentionSourceLabel(
  competition: Competition,
  seasonCompetitions: Competition[],
  teamId: number,
) {
  if (competition.tier.slug !== Constants.TierSlug.LEAGUE_PRO || competition.season <= 1) {
    return null;
  }

  const previousEpl = seasonCompetitions.find(
    (candidate) =>
      candidate.season === competition.season - 1 &&
      candidate.tier.slug === Constants.TierSlug.LEAGUE_PRO,
  );
  const previousPlayoffs = seasonCompetitions.find(
    (candidate) =>
      candidate.season === competition.season - 1 &&
      candidate.tier.slug === Constants.TierSlug.LEAGUE_PRO_PLAYOFFS,
  );

  if (!previousEpl) {
    return null;
  }

  const sortByPosition = <T extends { position: number | null }>(competitors: T[]) =>
    [...competitors].sort(
      (a, b) => (a.position ?? Number.POSITIVE_INFINITY) - (b.position ?? Number.POSITIVE_INFINITY),
    );
  const previousPlayoffCompetitors = sortByPosition(previousPlayoffs?.competitors ?? []);
  const previousCompetitors = [
    ...previousPlayoffCompetitors,
    ...sortByPosition(previousEpl.competitors).filter(
      (competitor) =>
        !previousPlayoffCompetitors.some((playoff) => playoff.teamId === competitor.teamId),
    ),
  ];
  const retainedTeam = previousCompetitors.find((competitor) => competitor.teamId === teamId);
  const federationId = retainedTeam?.team.competitionFederationId;
  const retainedSlots = federationId
    ? EPL_RETAINED_SLOTS_BY_FEDERATION_ID[
        federationId as keyof typeof EPL_RETAINED_SLOTS_BY_FEDERATION_ID
      ]
    : undefined;

  if (!retainedTeam || !retainedSlots) {
    return null;
  }

  const regionalRank = previousCompetitors
    .filter((competitor) => competitor.team.competitionFederationId === federationId)
    .findIndex((competitor) => competitor.teamId === teamId);

  return regionalRank >= 0 && regionalRank < retainedSlots
    ? `${previousEpl.tier.league.name} S${previousEpl.season}`
    : null;
}

function isLikelyQualificationSource(current: Competition, source: Competition, teamId: number) {
  if (source.id === current.id) {
    return false;
  }

  const currentTierSlug = current.tier.slug;
  const sourceTierSlug = source.tier.slug;
  const sourceCompetitor = source.competitors.find((competitor) => competitor.teamId === teamId);

  if (!sourceCompetitor) {
    return false;
  }

  if (getRuleSource(current, source, teamId)) {
    return true;
  }

  if (
    IEM_GROUP_TIER_SLUGS.has(currentTierSlug) &&
    isExplicitFeeder(currentTierSlug, sourceTierSlug)
  ) {
    return sourceCompetitor.position === 1;
  }

  return (
    source.tier.triggerTierSlug === currentTierSlug ||
    isExplicitFeeder(currentTierSlug, sourceTierSlug)
  );
}

function getQualificationSourceLabel(
  competition: Competition,
  seasonCompetitions: Competition[],
  teamId: number,
) {
  const eplRetentionSourceLabel = getEplRetentionSourceLabel(
    competition,
    seasonCompetitions,
    teamId,
  );

  if (eplRetentionSourceLabel) {
    return eplRetentionSourceLabel;
  }

  const rmrSlotSourceLabel = getRmrSlotSourceLabel(competition, teamId);

  if (rmrSlotSourceLabel) {
    return rmrSlotSourceLabel;
  }

  const source = seasonCompetitions
    .filter((candidate) => isLikelyQualificationSource(competition, candidate, teamId))
    .sort((a, b) => {
      const aRule = getRuleSource(competition, a, teamId);
      const bRule = getRuleSource(competition, b, teamId);

      if (Boolean(aRule) !== Boolean(bRule)) {
        return aRule ? -1 : 1;
      }

      const ruleIndexDelta =
        getRuleSourceIndex(competition, a, teamId) - getRuleSourceIndex(competition, b, teamId);

      if (ruleIndexDelta !== 0) {
        return ruleIndexDelta;
      }

      const aPosition =
        a.competitors.find((competitor) => competitor.teamId === teamId)?.position ??
        Number.POSITIVE_INFINITY;
      const bPosition =
        b.competitors.find((competitor) => competitor.teamId === teamId)?.position ??
        Number.POSITIVE_INFINITY;

      if (aPosition !== bPosition) {
        return aPosition - bPosition;
      }

      return a.id - b.id;
    })[0];

  if (source) {
    return getCompetitionSourceLabel(
      competition,
      source,
      getRuleSource(competition, source, teamId),
    );
  }

  return getRankingFallbackLabel(competition);
}

/**
 * Maximum starters shown per team card.
 *
 * @constant
 */
const STARTERS_PREVIEW_LIMIT = 5;

const ASIA_RMR_PLACEHOLDER_SOURCES = [
  'Asia Open Qualifier #1',
  'Asia Open Qualifier #1',
  'Asia Open Qualifier #2',
  'Asia Open Qualifier #2',
  'China Open Qualifier #1',
  'China Open Qualifier #2',
  'Oceania Open Qualifier #1',
  'Oceania Open Qualifier #2',
];

const AMERICAS_RMR_PLACEHOLDER_SOURCES = [
  ...Array.from({ length: 8 }, () => 'Americas Ranking'),
  ...Array.from({ length: 4 }, () => 'Americas Open Qualifier #1'),
  ...Array.from({ length: 4 }, () => 'Americas Open Qualifier #2'),
];

const EUROPE_RMR_PLACEHOLDER_SOURCES: Record<
  Constants.TierSlug.MAJOR_EUROPE_RMR_A | Constants.TierSlug.MAJOR_EUROPE_RMR_B,
  string[]
> = {
  [Constants.TierSlug.MAJOR_EUROPE_RMR_A]: [
    ...Array.from({ length: 8 }, () => 'Europe Ranking'),
    ...Array.from({ length: 4 }, () => 'Europe Open Qualifier #1'),
    ...Array.from({ length: 4 }, () => 'Europe Open Qualifier #3'),
  ],
  [Constants.TierSlug.MAJOR_EUROPE_RMR_B]: [
    ...Array.from({ length: 8 }, () => 'Europe Ranking'),
    ...Array.from({ length: 4 }, () => 'Europe Open Qualifier #2'),
    ...Array.from({ length: 4 }, () => 'Europe Open Qualifier #4'),
  ],
};

const ESL_CHALLENGER_PLACEHOLDER_SOURCES = [
  'ESEA Main Playoffs Europe #1',
  'ESEA Main Playoffs Europe #2',
  'ESEA Main Playoffs Europe #3',
  'ESEA Main Playoffs Europe #4',
  'ESEA Advanced Playoffs Americas #1',
  'ESEA Advanced Playoffs Americas #2',
  'ESEA Advanced Playoffs Asia #1',
  'ESEA Advanced Playoffs Oceania #1',
];

const ESL_CHALLENGER_FEEDER_RULES = [
  {
    source: Constants.TierSlug.LEAGUE_MAIN_PLAYOFFS,
    federation: Constants.FederationSlug.ESPORTS_EUROPA,
    start: 1,
    end: 4,
  },
  {
    source: Constants.TierSlug.LEAGUE_ADVANCED_PLAYOFFS,
    federation: Constants.FederationSlug.ESPORTS_AMERICAS,
    start: 1,
    end: 2,
  },
  {
    source: Constants.TierSlug.LEAGUE_ADVANCED_PLAYOFFS,
    federation: Constants.FederationSlug.ESPORTS_ASIA,
    start: 1,
    end: 1,
  },
  {
    source: Constants.TierSlug.LEAGUE_ADVANCED_PLAYOFFS,
    federation: Constants.FederationSlug.ESPORTS_OCE,
    start: 1,
    end: 1,
  },
] as const;

/**
 * EPL's remaining 16 slots are filled immediately before the group stage by the
 * current season's regional ESEA Advanced Playoffs.
 */
const EPL_QUALIFIER_PLACEHOLDER_SOURCES = [
  ...Array.from({ length: 8 }, () => 'ESEA Advanced Europe'),
  ...Array.from({ length: 4 }, () => 'ESEA Advanced Americas'),
  ...Array.from({ length: 3 }, () => 'ESEA Advanced Asia'),
  'ESEA Advanced Oceania',
];

const EPL_QUALIFIER_FEEDER_RULES = [
  {
    federation: Constants.FederationSlug.ESPORTS_EUROPA,
    start: 1,
    end: 8,
  },
  {
    federation: Constants.FederationSlug.ESPORTS_AMERICAS,
    start: 1,
    end: 4,
  },
  {
    federation: Constants.FederationSlug.ESPORTS_ASIA,
    start: 1,
    end: 3,
  },
  {
    federation: Constants.FederationSlug.ESPORTS_OCE,
    start: 1,
    end: 1,
  },
] as const;

/**
 * Slot height for the card header area (logo/lineup). Must be fixed to avoid layout shift.
 *
 * @constant
 */
const CARD_SLOT_HEIGHT_CLASS = 'h-32';

/**
 * Exports this module.
 *
 * @exports
 */
export default function () {
  const { competition } = useOutletContext<RouteContextCompetitions>();
  const isPreTournamentFixedBracketQualifier =
    [
      Constants.TierSlug.ESEA_CASH_CUP,
      Constants.TierSlug.IEM_COLOGNE_OPEN_QUALIFIER,
      Constants.TierSlug.IEM_KRAKOW_OPEN_QUALIFIER,
      Constants.TierSlug.MAJOR_OCE_OPEN_QUALIFIER_1,
      Constants.TierSlug.MAJOR_OCE_OPEN_QUALIFIER_2,
      Constants.TierSlug.MAJOR_ASIA_OPEN_QUALIFIER_1,
      Constants.TierSlug.MAJOR_ASIA_OPEN_QUALIFIER_2,
      Constants.TierSlug.MAJOR_CHINA_OPEN_QUALIFIER_1,
      Constants.TierSlug.MAJOR_CHINA_OPEN_QUALIFIER_2,
      Constants.TierSlug.MAJOR_AMERICAS_OPEN_QUALIFIER_1,
      Constants.TierSlug.MAJOR_AMERICAS_OPEN_QUALIFIER_2,
      Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_1,
      Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_2,
      Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_3,
      Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_4,
    ].includes(competition.tier.slug as Constants.TierSlug) &&
    competition.status === Constants.CompetitionStatus.SCHEDULED &&
    competition.competitors.length === 0;
  const isPreTournamentCctSeries =
    [Constants.TierSlug.CCT_SERIES, Constants.TierSlug.CCT_OCE_SERIES].includes(
      competition.tier.slug as Constants.TierSlug,
    ) && competition.status === Constants.CompetitionStatus.SCHEDULED;
  const isPreTournamentEslChallenger =
    competition.tier.slug === Constants.TierSlug.ESL_CHALLENGER &&
    competition.status === Constants.CompetitionStatus.SCHEDULED;
  const isPreTournamentCctGlobalFinals =
    competition.tier.slug === Constants.TierSlug.CCT_GLOBAL_FINALS &&
    competition.status === Constants.CompetitionStatus.SCHEDULED;
  const isPreTournamentMajorChallengers =
    competition.tier.slug === Constants.TierSlug.MAJOR_CHALLENGERS_STAGE &&
    competition.status === Constants.CompetitionStatus.SCHEDULED &&
    competition.competitors.length === 0;
  const isPreTournamentMajorLegends =
    competition.tier.slug === Constants.TierSlug.MAJOR_LEGENDS_STAGE &&
    competition.status === Constants.CompetitionStatus.SCHEDULED &&
    competition.competitors.length === 0;
  const isPreTournamentEpl =
    competition.tier.slug === Constants.TierSlug.LEAGUE_PRO &&
    competition.status === Constants.CompetitionStatus.SCHEDULED;
  const isPreTournamentIemGroupStage =
    [
      Constants.TierSlug.IEM_COLOGNE_GROUP_A,
      Constants.TierSlug.IEM_COLOGNE_GROUP_B,
      Constants.TierSlug.IEM_KRAKOW_GROUP_A,
      Constants.TierSlug.IEM_KRAKOW_GROUP_B,
    ].includes(competition.tier.slug as Constants.TierSlug) &&
    competition.status === Constants.CompetitionStatus.SCHEDULED &&
    competition.competitors.length === 0;
  const preTournamentFinalsPlaceholderSources =
    competition.tier.slug === Constants.TierSlug.BLAST_FINALS
      ? BLAST_FINALS_PLACEHOLDER_SOURCES
      : competition.tier.slug === Constants.TierSlug.CCT_GLOBAL_FINALS
        ? CCT_GLOBAL_FINALS_PLACEHOLDER_SOURCES
        : null;
  const isPreTournamentFinals =
    competition.tier.slug === Constants.TierSlug.BLAST_FINALS &&
    competition.status === Constants.CompetitionStatus.SCHEDULED;
  const preTournamentRmrPlaceholderSources =
    competition.tier.slug === Constants.TierSlug.MAJOR_ASIA_RMR
      ? ASIA_RMR_PLACEHOLDER_SOURCES
      : competition.tier.slug === Constants.TierSlug.MAJOR_AMERICAS_RMR
        ? AMERICAS_RMR_PLACEHOLDER_SOURCES
        : EUROPE_RMR_PLACEHOLDER_SOURCES[
            competition.tier.slug as
              | Constants.TierSlug.MAJOR_EUROPE_RMR_A
              | Constants.TierSlug.MAJOR_EUROPE_RMR_B
          ] || null;
  const isPreTournamentRmr =
    Boolean(preTournamentRmrPlaceholderSources) &&
    competition.status === Constants.CompetitionStatus.SCHEDULED &&
    competition.competitors.length === 0;
  const preTournamentCctPlaceholderCount =
    competition.tier.slug === Constants.TierSlug.CCT_OCE_SERIES ? 8 : 16;

  const [hoveredTeamId, setHoveredTeamId] = React.useState<number | null>(null);
  const [isLineupsVisible, setIsLineupsVisible] = React.useState(false);

  const [startersByTeamId, setStartersByTeamId] = React.useState<
    Record<number, Awaited<ReturnType<typeof api.competitions.participantLineup>>>
  >({});
  const [loadingByTeamId, setLoadingByTeamId] = React.useState<Record<number, boolean>>({});

  const [worldRankingByTeamId, setWorldRankingByTeamId] = React.useState<Record<number, number>>(
    {},
  );
  const [worldRankingLoadingByTeamId, setWorldRankingLoadingByTeamId] = React.useState<
    Record<number, boolean>
  >({});
  const [seasonCompetitions, setSeasonCompetitions] = React.useState<Competition[]>([]);

  /**
   * Competition context can change (season/federation/tier filter switch) while this component
   * instance remains mounted. Reset cached lineup/ranking maps so we don't show stale team data
   * from the previously viewed competition.
   */
  React.useEffect(() => {
    setStartersByTeamId({});
    setLoadingByTeamId({});
    setWorldRankingByTeamId({});
    setWorldRankingLoadingByTeamId({});
    setSeasonCompetitions([]);
    setHoveredTeamId(null);
  }, [competition.id]);

  React.useEffect(() => {
    let isCurrent = true;

    api.competitions
      .all<typeof Eagers.competition>({
        ...Eagers.competition,
        where: {
          season: {
            in: [competition.season, competition.season - 1],
          },
        },
      })
      .then((competitions) => {
        if (isCurrent) {
          setSeasonCompetitions(competitions);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [competition.id, competition.season]);

  const baseParticipants = React.useMemo(() => {
    const teamMap = new Map<number, (typeof competition.competitors)[number]['team']>();
    const isIemGroupStage = IEM_GROUP_TIER_SLUGS.has(competition.tier.slug);
    const participantCompetitions = isIemGroupStage
      ? [
          competition,
          ...seasonCompetitions.filter(
            (item) =>
              item.season === competition.season &&
              IEM_GROUP_TIER_SLUGS.has(item.tier.slug) &&
              item.id !== competition.id,
          ),
        ]
      : [competition];

    participantCompetitions.forEach((item) => {
      item.competitors.forEach((competitor) => {
        teamMap.set(competitor.team.id, competitor.team);
      });
    });

    return Array.from(teamMap.values());
  }, [competition, seasonCompetitions]);
  const majorLegendsParticipantSlots = React.useMemo<ParticipantSlot[]>(() => {
    if (!isPreTournamentMajorLegends) {
      return [];
    }

    const feederRules = [
      { source: Constants.TierSlug.MAJOR_EUROPE_RMR_A, count: 4, label: 'Europe RMR A' },
      { source: Constants.TierSlug.MAJOR_EUROPE_RMR_B, count: 3, label: 'Europe RMR B' },
      { source: Constants.TierSlug.MAJOR_AMERICAS_RMR, count: 1, label: 'Americas RMR' },
    ];
    const rmrSlots = feederRules.flatMap(({ count, label, source }) => {
      const qualifiedTeams = (
        seasonCompetitions.find(
          (candidate) =>
            candidate.season === competition.season &&
            candidate.tier.slug === source &&
            candidate.status === Constants.CompetitionStatus.COMPLETED,
        )?.competitors || []
      )
        .filter((competitor) => Boolean(competitor.team))
        .sort((a, b) => a.position - b.position || a.seed - b.seed)
        .slice(0, count);

      return Array.from({ length: count }, (_, index) => ({
        source: label,
        team: qualifiedTeams[index]?.team,
      }));
    });

    return [
      ...rmrSlots,
      ...Array.from(
        { length: 8 },
        (): ParticipantSlot => ({
          source: 'Challengers Stage',
          team: undefined,
        }),
      ),
    ];
  }, [competition.season, isPreTournamentMajorLegends, seasonCompetitions]);
  const majorChallengersParticipantSlots = React.useMemo<ParticipantSlot[]>(() => {
    if (!isPreTournamentMajorChallengers) {
      return [];
    }

    const feederRules = [
      {
        source: Constants.TierSlug.MAJOR_EUROPE_RMR_A,
        start: 5,
        end: 8,
        label: 'Europe RMR A',
      },
      {
        source: Constants.TierSlug.MAJOR_EUROPE_RMR_B,
        start: 4,
        end: 8,
        label: 'Europe RMR B',
      },
      {
        source: Constants.TierSlug.MAJOR_AMERICAS_RMR,
        start: 2,
        end: 5,
        label: 'Americas RMR',
      },
      { source: Constants.TierSlug.MAJOR_ASIA_RMR, start: 1, end: 3, label: 'Asia RMR' },
    ];

    return feederRules.flatMap(({ end, label, source, start }) => {
      const qualifiedTeams = (
        seasonCompetitions.find(
          (candidate) =>
            candidate.season === competition.season &&
            candidate.tier.slug === source &&
            candidate.status === Constants.CompetitionStatus.COMPLETED,
        )?.competitors || []
      )
        .filter((competitor) => Boolean(competitor.team))
        .sort((a, b) => a.position - b.position || a.seed - b.seed)
        .filter((competitor) => competitor.position >= start && competitor.position <= end);

      return Array.from({ length: end - start + 1 }, (_, index) => ({
        source: label,
        team: qualifiedTeams[index]?.team,
      }));
    });
  }, [competition.season, isPreTournamentMajorChallengers, seasonCompetitions]);
  const eslChallengerParticipantSlots = React.useMemo<ParticipantSlot[]>(() => {
    if (!isPreTournamentEslChallenger) {
      return [];
    }

    return ESL_CHALLENGER_FEEDER_RULES.flatMap(({ end, federation, source, start }, ruleIndex) => {
      const feeder = seasonCompetitions.find(
        (candidate) =>
          candidate.season === competition.season &&
          candidate.tier.slug === source &&
          candidate.federation.slug === federation &&
          candidate.status === Constants.CompetitionStatus.COMPLETED,
      );
      const qualifiedTeams = [...(feeder?.competitors || [])]
        .filter((competitor) => competitor.position >= start && competitor.position <= end)
        .sort((a, b) => a.position - b.position || a.seed - b.seed);

      return Array.from({ length: end - start + 1 }, (_, index) => ({
        source: ESL_CHALLENGER_PLACEHOLDER_SOURCES[
          ESL_CHALLENGER_FEEDER_RULES.slice(0, ruleIndex).reduce(
            (count, rule) => count + rule.end - rule.start + 1,
            0,
          ) + index
        ],
        team: qualifiedTeams[index]?.team,
      }));
    });
  }, [competition.season, isPreTournamentEslChallenger, seasonCompetitions]);
  const eplQualifierParticipantSlots = React.useMemo<ParticipantSlot[]>(() => {
    if (!isPreTournamentEpl) {
      return [];
    }

    return EPL_QUALIFIER_FEEDER_RULES.flatMap(({ end, federation, start }, ruleIndex) => {
      const feeder = seasonCompetitions.find(
        (candidate) =>
          candidate.season === competition.season &&
          candidate.tier.slug === Constants.TierSlug.LEAGUE_ADVANCED_PLAYOFFS &&
          candidate.federation.slug === federation &&
          candidate.status === Constants.CompetitionStatus.COMPLETED,
      );
      const qualifiedTeams = [...(feeder?.competitors || [])]
        .filter((competitor) => competitor.position >= start && competitor.position <= end)
        .sort((a, b) => a.position - b.position || a.seed - b.seed);

      return Array.from({ length: end - start + 1 }, (_, index) => ({
        source: EPL_QUALIFIER_PLACEHOLDER_SOURCES[
          EPL_QUALIFIER_FEEDER_RULES.slice(0, ruleIndex).reduce(
            (count, rule) => count + rule.end - rule.start + 1,
            0,
          ) + index
        ],
        team: qualifiedTeams[index]?.team,
      }));
    });
  }, [competition.season, isPreTournamentEpl, seasonCompetitions]);
  const cctGlobalFinalsParticipantSlots = React.useMemo<ParticipantSlot[]>(() => {
    if (!isPreTournamentCctGlobalFinals) {
      return [];
    }

    return CCT_GLOBAL_FINALS_FEEDER_RULES.flatMap(
      ({ end, federation, source, start }, ruleIndex) => {
        const feeder = seasonCompetitions.find(
          (candidate) =>
            candidate.season === competition.season &&
            candidate.tier.slug === source &&
            candidate.federation.slug === federation &&
            candidate.status === Constants.CompetitionStatus.COMPLETED,
        );
        const qualifiedTeams = [...(feeder?.competitors || [])]
          .filter((competitor) => competitor.position >= start && competitor.position <= end)
          .sort((a, b) => a.position - b.position || a.seed - b.seed);

        return Array.from({ length: end - start + 1 }, (_, index) => ({
          source: CCT_GLOBAL_FINALS_PLACEHOLDER_SOURCES[
            CCT_GLOBAL_FINALS_FEEDER_RULES.slice(0, ruleIndex).reduce(
              (count, rule) => count + rule.end - rule.start + 1,
              0,
            ) + index
          ],
          team: qualifiedTeams[index]?.team,
        }));
      },
    );
  }, [competition.season, isPreTournamentCctGlobalFinals, seasonCompetitions]);
  const rankingParticipants = React.useMemo(
    () => [
      ...baseParticipants,
      ...cctGlobalFinalsParticipantSlots.flatMap((slot) => (slot.team ? [slot.team] : [])),
      ...eslChallengerParticipantSlots.flatMap((slot) => (slot.team ? [slot.team] : [])),
      ...eplQualifierParticipantSlots.flatMap((slot) => (slot.team ? [slot.team] : [])),
      ...majorLegendsParticipantSlots.flatMap((slot) => (slot.team ? [slot.team] : [])),
      ...majorChallengersParticipantSlots.flatMap((slot) => (slot.team ? [slot.team] : [])),
    ],
    [
      baseParticipants,
      cctGlobalFinalsParticipantSlots,
      eslChallengerParticipantSlots,
      eplQualifierParticipantSlots,
      majorChallengersParticipantSlots,
      majorLegendsParticipantSlots,
    ],
  );

  const fetchStarters = React.useCallback(
    (teamId: number) => {
      if (startersByTeamId[teamId] || loadingByTeamId[teamId]) {
        return;
      }

      setLoadingByTeamId((prev) => ({ ...prev, [teamId]: true }));

      api.competitions
        .participantLineup(competition.id, teamId)
        .then((players) => setStartersByTeamId((prev) => ({ ...prev, [teamId]: players })))
        .finally(() => setLoadingByTeamId((prev) => ({ ...prev, [teamId]: false })));
    },
    [startersByTeamId, loadingByTeamId, competition.id],
  );

  const fetchWorldRanking = React.useCallback(
    (teamId: number) => {
      if (worldRankingByTeamId[teamId] != null || worldRankingLoadingByTeamId[teamId]) {
        return;
      }

      setWorldRankingLoadingByTeamId((prev) => ({ ...prev, [teamId]: true }));

      api.team
        .worldRanking(teamId)
        .then((rank) => setWorldRankingByTeamId((prev) => ({ ...prev, [teamId]: rank })))
        .finally(() => setWorldRankingLoadingByTeamId((prev) => ({ ...prev, [teamId]: false })));
    },
    [worldRankingByTeamId, worldRankingLoadingByTeamId],
  );

  /**
   * When lineups are visible, eager-load all starters to prevent “pop-in” while browsing.
   */
  React.useEffect(() => {
    if (!isLineupsVisible) return;
    rankingParticipants.forEach((team) => fetchStarters(team.id));
  }, [fetchStarters, isLineupsVisible, rankingParticipants]);

  /**
   * Eager-load world ranking for all teams so the grid can be ordered by ranking.
   */
  React.useEffect(() => {
    rankingParticipants.forEach((team) => fetchWorldRanking(team.id));
  }, [fetchWorldRanking, rankingParticipants]);

  const onToggleLineups = React.useCallback(() => {
    setIsLineupsVisible((prev) => !prev);
  }, []);
  const sortPreConfirmedMajorSlots = React.useCallback(
    (slots: ParticipantSlot[]) =>
      [...slots].sort((a, b) => {
        if (a.team && b.team) {
          const aRank = worldRankingByTeamId[a.team.id] ?? Number.POSITIVE_INFINITY;
          const bRank = worldRankingByTeamId[b.team.id] ?? Number.POSITIVE_INFINITY;
          return aRank - bRank || a.team.name.localeCompare(b.team.name);
        }

        if (a.team) return -1;
        if (b.team) return 1;
        return 0;
      }),
    [worldRankingByTeamId],
  );
  const renderPreConfirmedMajorCard = React.useCallback(
    ({ source, team }: ParticipantSlot, index: number) => {
      const isLoading = team ? loadingByTeamId[team.id] === true : false;
      const starters = team ? startersByTeamId[team.id] || [] : [];
      const ranking = team ? worldRankingByTeamId[team.id] : undefined;
      const isExpanded = Boolean(team && isLineupsVisible);

      return (
        <article
          key={`${source}:${team?.id || 'tbd'}:${index}`}
          className="bg-base-200/40 relative flex flex-col rounded-2xl p-4"
        >
          {!isExpanded && ranking != null && (
            <span className="badge badge-sm border-base-content/10 bg-base-300/70 absolute top-3 left-3">
              #{ranking}
            </span>
          )}
          <div className={cx('flex w-full items-center justify-center', CARD_SLOT_HEIGHT_CLASS)}>
            {isExpanded ? (
              <div className="flex h-full w-full flex-col justify-center overflow-hidden">
                <div className="flex items-center justify-between">
                  <p className="text-base-content/60 text-[10px] font-semibold tracking-wide uppercase">
                    Starters
                  </p>
                  <img alt="" src={team.blazon} className="h-5 w-5 opacity-70" aria-hidden="true" />
                </div>
                {isLoading ? (
                  <p className="text-base-content/60 mt-2 text-sm leading-tight">Loading…</p>
                ) : (
                  <ul className="mt-2 space-y-1 text-sm leading-tight">
                    {starters.slice(0, STARTERS_PREVIEW_LIMIT).map((player) => (
                      <li key={player.id} className="flex items-center gap-2">
                        <span className={`fp ${player.country.code.toLowerCase()}`} />
                        <span className="truncate">{player.name}</span>
                      </li>
                    ))}
                    {!starters.length && (
                      <li className="text-base-content/60">No starters listed.</li>
                    )}
                  </ul>
                )}
              </div>
            ) : (
              <figure className="flex h-16 w-16 items-center justify-center">
                <img
                  src={team?.blazon || swissTeamPlaceholder}
                  alt={team ? `${team.name} logo` : 'TBD'}
                  className="max-h-16 max-w-16 object-contain"
                />
              </figure>
            )}
          </div>
          <strong className="mt-3 text-center">{team?.name || 'TBD'}</strong>
          <p className="text-base-content/60 mt-2 min-h-8 text-center text-xs leading-4">
            {source}
          </p>
          {isExpanded && ranking != null && (
            <span className="badge badge-sm border-base-content/10 bg-base-300/70 absolute bottom-3 left-3">
              #{ranking}
            </span>
          )}
        </article>
      );
    },
    [isLineupsVisible, loadingByTeamId, startersByTeamId, worldRankingByTeamId],
  );

  const participants = React.useMemo(() => {
    const getRankKey = (teamId: number) => {
      const rank = worldRankingByTeamId[teamId];

      // Treat missing/invalid ranks as "unranked" and push them to the bottom.
      if (rank == null || !Number.isFinite(rank) || rank <= 0) {
        return Number.POSITIVE_INFINITY;
      }

      return rank;
    };

    return [...baseParticipants].sort((a, b) => {
      const aRank = getRankKey(a.id);
      const bRank = getRankKey(b.id);

      if (aRank !== bRank) {
        return aRank - bRank; // lower rank number = better, goes first
      }

      // Stable fallback ordering.
      return a.name.localeCompare(b.name);
    });
  }, [baseParticipants, worldRankingByTeamId]);

  if (isPreTournamentFinals && preTournamentFinalsPlaceholderSources) {
    return (
      <section className="border-base-content/10 bg-base-200/45 mt-4 rounded-lg border p-4 shadow-lg">
        <h2 className="mb-4 text-xl font-black">Participants</h2>
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          {preTournamentFinalsPlaceholderSources.map((source, index) => (
            <article
              key={`${source}:${index}`}
              className="bg-base-200/40 flex min-h-48 flex-col items-center justify-center rounded-2xl p-4"
            >
              <img src={swissTeamPlaceholder} alt="TBD" className="size-16 object-contain" />
              <strong className="mt-3">TBD</strong>
              <p className="text-base-content/60 mt-2 text-center text-xs leading-4">{source}</p>
            </article>
          ))}
        </div>
      </section>
    );
  }

  if (isPreTournamentCctGlobalFinals) {
    const sortedSlots = sortPreConfirmedMajorSlots(cctGlobalFinalsParticipantSlots);
    const hasConfirmedTeams = sortedSlots.some((slot) => slot.team);

    return (
      <section className="border-base-content/10 bg-base-200/45 mt-4 rounded-lg border p-4 shadow-lg">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-xl font-black">Participants</h2>
          {hasConfirmedTeams && (
            <button
              type="button"
              onClick={onToggleLineups}
              className="btn btn-ghost btn-sm border-base-content/10 bg-base-100/60 rounded border text-xs font-semibold shadow-none"
            >
              {isLineupsVisible ? 'Hide lineups' : 'Show lineups'}
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          {sortedSlots.map(renderPreConfirmedMajorCard)}
        </div>
      </section>
    );
  }

  if (isPreTournamentIemGroupStage) {
    return (
      <section className="border-base-content/10 bg-base-200/45 mt-4 rounded-lg border p-4 shadow-lg">
        <h2 className="mb-4 text-xl font-black">Participants</h2>
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          {IEM_PLACEHOLDER_SOURCES.map((source, index) => (
            <article
              key={`${source}:${index}`}
              className="bg-base-200/40 flex min-h-48 flex-col items-center justify-center rounded-2xl p-4"
            >
              <img src={swissTeamPlaceholder} alt="TBD" className="size-16 object-contain" />
              <strong className="mt-3">TBD</strong>
              <p className="text-base-content/60 mt-2 text-center text-xs leading-4">{source}</p>
            </article>
          ))}
        </div>
      </section>
    );
  }

  if (isPreTournamentRmr && preTournamentRmrPlaceholderSources) {
    return (
      <section className="border-base-content/10 bg-base-200/45 mt-4 rounded-lg border p-4 shadow-lg">
        <h2 className="mb-4 text-xl font-black">Participants</h2>
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          {preTournamentRmrPlaceholderSources.map((source, index) => (
            <article
              key={`${source}:${index}`}
              className="bg-base-200/40 flex min-h-48 flex-col items-center justify-center rounded-2xl p-4"
            >
              <img src={swissTeamPlaceholder} alt="TBD" className="size-16 object-contain" />
              <strong className="mt-3">TBD</strong>
              <p className="text-base-content/60 mt-2 text-center text-xs leading-4">{source}</p>
            </article>
          ))}
        </div>
      </section>
    );
  }

  if (isPreTournamentCctSeries) {
    return (
      <section className="border-base-content/10 bg-base-200/45 mt-4 rounded-lg border p-4 shadow-lg">
        <h2 className="mb-4 text-xl font-black">Participants</h2>
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          {Array.from({ length: preTournamentCctPlaceholderCount }, (_, index) => (
            <article
              key={`cct-participant-placeholder:${index}`}
              className="bg-base-200/40 flex min-h-40 flex-col items-center justify-center rounded-2xl p-4"
            >
              <img src={swissTeamPlaceholder} alt="TBD" className="size-14 object-contain" />
              <strong className="text-base-content/65 mt-3">TBD</strong>
            </article>
          ))}
        </div>
      </section>
    );
  }

  if (isPreTournamentEslChallenger) {
    const sortedSlots = sortPreConfirmedMajorSlots(eslChallengerParticipantSlots);
    const hasConfirmedTeams = sortedSlots.some((slot) => slot.team);

    return (
      <section className="border-base-content/10 bg-base-200/45 mt-4 rounded-lg border p-4 shadow-lg">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-xl font-black">Participants</h2>
          {hasConfirmedTeams && (
            <button
              type="button"
              onClick={onToggleLineups}
              className="btn btn-ghost btn-sm border-base-content/10 bg-base-100/60 rounded border text-xs font-semibold shadow-none"
            >
              {isLineupsVisible ? 'Hide lineups' : 'Show lineups'}
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          {sortedSlots.map(renderPreConfirmedMajorCard)}
        </div>
      </section>
    );
  }

  if (isPreTournamentMajorChallengers) {
    const sortedSlots = sortPreConfirmedMajorSlots(majorChallengersParticipantSlots);
    const hasConfirmedTeams = sortedSlots.some((slot) => slot.team);

    return (
      <section className="border-base-content/10 bg-base-200/45 mt-4 rounded-lg border p-4 shadow-lg">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-xl font-black">Participants</h2>
          {hasConfirmedTeams && (
            <button
              type="button"
              onClick={onToggleLineups}
              className="btn btn-ghost btn-sm border-base-content/10 bg-base-100/60 rounded border text-xs font-semibold shadow-none"
            >
              {isLineupsVisible ? 'Hide lineups' : 'Show lineups'}
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          {sortedSlots.map(renderPreConfirmedMajorCard)}
        </div>
      </section>
    );
  }

  if (isPreTournamentMajorLegends) {
    const sortedSlots = sortPreConfirmedMajorSlots(majorLegendsParticipantSlots);
    const hasConfirmedTeams = sortedSlots.some((slot) => slot.team);

    return (
      <section className="border-base-content/10 bg-base-200/45 mt-4 rounded-lg border p-4 shadow-lg">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-xl font-black">Participants</h2>
          {hasConfirmedTeams && (
            <button
              type="button"
              onClick={onToggleLineups}
              className="btn btn-ghost btn-sm border-base-content/10 bg-base-100/60 rounded border text-xs font-semibold shadow-none"
            >
              {isLineupsVisible ? 'Hide lineups' : 'Show lineups'}
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          {sortedSlots.map(renderPreConfirmedMajorCard)}
        </div>
      </section>
    );
  }

  if (isPreTournamentFixedBracketQualifier) {
    return (
      <section className="border-base-content/10 bg-base-200/45 mt-4 rounded-lg border p-8 text-center shadow-lg">
        <h2 className="text-xl font-black">Participants</h2>
        <p className="text-base-content/60 mt-2 text-sm">No teams registered yet.</p>
      </section>
    );
  }

  return (
    <section className="border-base-content/10 bg-base-200/45 mt-4 rounded-lg border p-4 shadow-lg">
      <header className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-xl font-black">Participants</h2>
        <button
          type="button"
          className="btn btn-ghost btn-sm border-base-content/10 bg-base-100/60 rounded border text-xs font-semibold shadow-none"
          onClick={onToggleLineups}
        >
          {isLineupsVisible ? 'Hide lineups' : 'Show lineups'}
        </button>
      </header>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {participants.map((team) => {
          const isExpanded = isLineupsVisible || hoveredTeamId === team.id;
          const isLoading = loadingByTeamId[team.id] === true;
          const starters = startersByTeamId[team.id] || [];

          const ranking = worldRankingByTeamId[team.id];
          const rankingLoading = worldRankingLoadingByTeamId[team.id] === true;
          const qualificationSource = getQualificationSourceLabel(
            competition,
            seasonCompetitions,
            team.id,
          );

          const showTopLeftRanking = !isExpanded;
          const showBottomLeftRanking = isExpanded;

          return (
            <Link
              key={team.id}
              to={`/teams?teamId=${team.id}`}
              data-interaction-hover-sound="none"
              className={cx(
                'card relative flex flex-col rounded-2xl p-4 shadow-sm transition-colors',
                'bg-base-200/40 hover:bg-base-200/70',
              )}
              onMouseEnter={() => {
                setHoveredTeamId(team.id);

                // When lineups are not globally shown, we prefetch on hover for responsiveness.
                if (!isLineupsVisible) {
                  fetchStarters(team.id);
                }

                // If a ranking hasn't been loaded yet (rare), fetch it on-demand.
                fetchWorldRanking(team.id);
              }}
              onMouseLeave={() => setHoveredTeamId(null)}
            >
              {showTopLeftRanking && (rankingLoading || ranking != null) && (
                <span className="badge badge-sm border-base-content/10 bg-base-300/70 absolute top-3 left-3">
                  {rankingLoading ? '…' : `#${ranking}`}
                </span>
              )}

              <div
                className={cx('flex w-full items-center justify-center', CARD_SLOT_HEIGHT_CLASS)}
              >
                {!isExpanded && (
                  <figure className="flex h-16 w-16 items-center justify-center">
                    <img
                      alt={`${team.name} logo`}
                      src={team.blazon}
                      className="max-h-16 max-w-16 object-contain"
                    />
                  </figure>
                )}

                {isExpanded && (
                  <div className="flex h-full w-full flex-col justify-center overflow-hidden">
                    <div className="flex items-center justify-between">
                      <p className="text-base-content/60 text-[10px] font-semibold tracking-wide uppercase">
                        Starters
                      </p>
                      <img
                        alt=""
                        src={team.blazon}
                        className="h-5 w-5 opacity-70"
                        aria-hidden="true"
                      />
                    </div>

                    {isLoading && (
                      <p className="text-base-content/60 mt-2 text-sm leading-tight">Loading…</p>
                    )}

                    {!isLoading && (
                      <ul className="mt-2 space-y-1 text-sm leading-tight">
                        {starters.slice(0, STARTERS_PREVIEW_LIMIT).map((player) => (
                          <li key={player.id} className="flex items-center gap-2">
                            <span className={`fp ${player.country.code.toLowerCase()}`} />
                            <span className="truncate">{player.name}</span>
                          </li>
                        ))}
                        {!starters.length && (
                          <li className="text-base-content/60">No starters listed.</li>
                        )}
                      </ul>
                    )}
                  </div>
                )}
              </div>

              <div className="mt-3 flex items-center justify-center">
                <span className="link link-hover block truncate text-center font-semibold">
                  {team.name}
                </span>
              </div>

              <p className="text-base-content/60 mt-2 min-h-8 text-center text-xs leading-4">
                {qualificationSource}
              </p>

              {showBottomLeftRanking && (rankingLoading || ranking != null) && (
                <span className="badge badge-sm border-base-content/10 bg-base-300/70 absolute bottom-3 left-3">
                  {rankingLoading ? '…' : `#${ranking}`}
                </span>
              )}
            </Link>
          );
        })}
        {isPreTournamentEpl &&
          sortPreConfirmedMajorSlots(eplQualifierParticipantSlots).map(
            renderPreConfirmedMajorCard,
          )}
      </div>
    </section>
  );
}
