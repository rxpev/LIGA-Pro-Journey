/**
 * Dynamically populates any given competition's series
 * with teams depending on the criteria provided
 * in the autofill protocol schema.
 *
 * @module
 */
import log from 'electron-log';
import DatabaseClient from './database-client';
import { differenceBy, flatten } from 'lodash';
import { Prisma, Team } from '@prisma/client';
import { Constants, Eagers, Util } from '@liga/shared';
import {
  getAcademyIntegrityFieldSize,
  getLeagueTierOrder,
  isRegularLeagueTier,
} from './academy-system';

/**
 * Autofill syntax action types.
 *
 * @enum
 */
export enum Action {
  EXCLUDE = 'exclude',
  FALLBACK = 'fallback',
  INCLUDE = 'include',
}

const IEM_QUALIFIER_SIZE: Partial<Record<Constants.FederationSlug, number>> = {
  [Constants.FederationSlug.ESPORTS_EUROPA]: 111,
  [Constants.FederationSlug.ESPORTS_AMERICAS]: 112,
  [Constants.FederationSlug.ESPORTS_ASIA]: 50,
  [Constants.FederationSlug.ESPORTS_OCE]: 36,
};

// createCompetitions builds league divisions from high to low. When an
// academy's promotion collides with its parent, carry it into the next lower
// division; if the parent also lands there, carry it down once more.
const forcedAcademyDivision = new Map<string, { academyId: number; targetOrder: number }>();

function academyDivisionKey(season: number, federationSlug: string, academyId: number) {
  return `${season}:${federationSlug}:${academyId}`;
}

function getTierSize(
  tier: Prisma.TierGetPayload<typeof Eagers.tier>,
  federationSlug: Constants.FederationSlug,
) {
  if (
    tier.slug === Constants.TierSlug.IEM_COLOGNE_OPEN_QUALIFIER ||
    tier.slug === Constants.TierSlug.IEM_KRAKOW_OPEN_QUALIFIER
  ) {
    return IEM_QUALIFIER_SIZE[federationSlug] || tier.size;
  }

  return tier.league.slug === Constants.LeagueSlug.ESPORTS_LEAGUE
    ? Util.getLeagueTierSize(tier.slug as Constants.TierSlug, federationSlug, tier.size)
    : tier.size;
}

function isMajorOpenQualifier(tierSlug: string) {
  return tierSlug.startsWith('major:') && tierSlug.includes('open-qualifier');
}

/** @interface */
export interface Entry {
  action: Action;
  from: Constants.LeagueSlug;
  target: Constants.TierSlug;
  start: Constants.Zones | number;
  end?: Constants.Zones | number;
  season?: number;
  federationSlug?: Constants.FederationSlug;
  includeCountryCodes?: Array<string>;
  excludeCountryCodes?: Array<string>;
}

/** @interface */
export interface Item {
  tierSlug: Constants.TierSlug;
  on: Constants.CalendarEntry;
  entries: Array<Entry>;
}

/** @constant */
export const Items: Array<Item> = [
  {
    tierSlug: Constants.TierSlug.LEAGUE_PRO,
    on: Constants.CalendarEntry.SEASON_START,
    entries: [
      // ESL Pro League: retain the best-finished teams per federation
      // to preserve the regional slot split (EU 9 / AM 4 / AS 2 / OCE 1).
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_PRO_LEAGUE,
        target: Constants.TierSlug.LEAGUE_PRO,
        federationSlug: Constants.FederationSlug.ESPORTS_EUROPA,
        start: 1,
        end: 9,
        season: -1,
      },
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_PRO_LEAGUE,
        target: Constants.TierSlug.LEAGUE_PRO,
        federationSlug: Constants.FederationSlug.ESPORTS_AMERICAS,
        start: 1,
        end: 4,
        season: -1,
      },
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_PRO_LEAGUE,
        target: Constants.TierSlug.LEAGUE_PRO,
        federationSlug: Constants.FederationSlug.ESPORTS_ASIA,
        start: 1,
        end: 2,
        season: -1,
      },
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_PRO_LEAGUE,
        target: Constants.TierSlug.LEAGUE_PRO,
        federationSlug: Constants.FederationSlug.ESPORTS_OCE,
        start: 1,
        end: 1,
        season: -1,
      },
      // First-season fallback: seed by top prestige per federation
      {
        action: Action.FALLBACK,
        from: Constants.LeagueSlug.ESPORTS_PRO_LEAGUE,
        target: Constants.TierSlug.LEAGUE_PRO,
        federationSlug: Constants.FederationSlug.ESPORTS_EUROPA,
        start: 1,
        end: 9,
      },
      {
        action: Action.FALLBACK,
        from: Constants.LeagueSlug.ESPORTS_PRO_LEAGUE,
        target: Constants.TierSlug.LEAGUE_PRO,
        federationSlug: Constants.FederationSlug.ESPORTS_AMERICAS,
        start: 1,
        end: 4,
      },
      {
        action: Action.FALLBACK,
        from: Constants.LeagueSlug.ESPORTS_PRO_LEAGUE,
        target: Constants.TierSlug.LEAGUE_PRO,
        federationSlug: Constants.FederationSlug.ESPORTS_ASIA,
        start: 1,
        end: 2,
      },
      {
        action: Action.FALLBACK,
        from: Constants.LeagueSlug.ESPORTS_PRO_LEAGUE,
        target: Constants.TierSlug.LEAGUE_PRO,
        federationSlug: Constants.FederationSlug.ESPORTS_OCE,
        start: 1,
        end: 1,
      },
    ],
  },
  {
    tierSlug: Constants.TierSlug.LEAGUE_PRO,
    on: Constants.CalendarEntry.COMPETITION_START,
    entries: [
      // EU/AM/AS/OCE qualifiers from advanced playoffs (same season)
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_ADVANCED_PLAYOFFS,
        federationSlug: Constants.FederationSlug.ESPORTS_EUROPA,
        start: 1,
        end: 8,
        season: 0,
      },
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_ADVANCED_PLAYOFFS,
        federationSlug: Constants.FederationSlug.ESPORTS_AMERICAS,
        start: 1,
        end: 4,
        season: 0,
      },
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_ADVANCED_PLAYOFFS,
        federationSlug: Constants.FederationSlug.ESPORTS_ASIA,
        start: 1,
        end: 3,
        season: 0,
      },
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_ADVANCED_PLAYOFFS,
        federationSlug: Constants.FederationSlug.ESPORTS_OCE,
        start: 1,
        end: 1,
        season: 0,
      },
    ],
  },
  {
    tierSlug: Constants.TierSlug.LEAGUE_PRO_PLAYOFFS,
    on: Constants.CalendarEntry.SEASON_START,
    entries: [],
  },
  {
    tierSlug: Constants.TierSlug.LEAGUE_PRO_PLAYOFFS,
    on: Constants.CalendarEntry.COMPETITION_START,
    entries: [
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_PRO_LEAGUE,
        target: Constants.TierSlug.LEAGUE_PRO,
        start: 0,
        end: 16,
        season: 0,
      },
    ],
  },
  {
    tierSlug: Constants.TierSlug.LEAGUE_OPEN,
    on: Constants.CalendarEntry.SEASON_START,
    entries: [
      // EU/NA: 5th thru 16th open playoffs stay open (12 teams)
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_OPEN_PLAYOFFS,
        federationSlug: Constants.FederationSlug.ESPORTS_EUROPA,
        start: 5,
        end: 16,
        season: -1,
      },
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_OPEN_PLAYOFFS,
        federationSlug: Constants.FederationSlug.ESPORTS_AMERICAS,
        start: 5,
        end: 16,
        season: -1,
      },
      // EU/NA: 17th thru 40th open stay open (24 teams)
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_OPEN,
        federationSlug: Constants.FederationSlug.ESPORTS_EUROPA,
        start: 17,
        end: 40,
        season: -1,
      },
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_OPEN,
        federationSlug: Constants.FederationSlug.ESPORTS_AMERICAS,
        start: 17,
        end: 40,
        season: -1,
      },
      // EU/NA: bottom 4 intermediate relegate to open
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_INTERMEDIATE,
        federationSlug: Constants.FederationSlug.ESPORTS_EUROPA,
        start: 27,
        end: 30,
        season: -1,
      },
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_INTERMEDIATE,
        federationSlug: Constants.FederationSlug.ESPORTS_AMERICAS,
        start: 27,
        end: 30,
        season: -1,
      },
      // Asia: 3rd thru 8th open playoffs stay open (6 teams)
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_OPEN_PLAYOFFS,
        federationSlug: Constants.FederationSlug.ESPORTS_ASIA,
        start: 3,
        end: 8,
        season: -1,
      },
      // Asia: 9th thru 30th open stay open (22 teams)
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_OPEN,
        federationSlug: Constants.FederationSlug.ESPORTS_ASIA,
        start: 9,
        end: 30,
        season: -1,
      },
      // Asia: bottom 2 advanced relegate to open
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_ADVANCED,
        federationSlug: Constants.FederationSlug.ESPORTS_ASIA,
        start: 19,
        end: 20,
        season: -1,
      },
      // OCE: 3rd thru 8th open playoffs stay open (6 teams)
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_OPEN_PLAYOFFS,
        federationSlug: Constants.FederationSlug.ESPORTS_OCE,
        start: 3,
        end: 8,
        season: -1,
      },
      // OCE: 9th thru 20th open stay open (12 teams)
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_OPEN,
        federationSlug: Constants.FederationSlug.ESPORTS_OCE,
        start: 9,
        end: 20,
        season: -1,
      },
      // OCE: bottom 2 advanced relegate to open
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_ADVANCED,
        federationSlug: Constants.FederationSlug.ESPORTS_OCE,
        start: 15,
        end: 16,
        season: -1,
      },
      {
        action: Action.FALLBACK,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_OPEN,
        start: 0,
      },
    ],
  },
  {
    tierSlug: Constants.TierSlug.LEAGUE_OPEN_PLAYOFFS,
    on: Constants.CalendarEntry.SEASON_START,
    entries: [],
  },
  {
    tierSlug: Constants.TierSlug.LEAGUE_OPEN_PLAYOFFS,
    on: Constants.CalendarEntry.COMPETITION_START,
    entries: [
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_OPEN,
        federationSlug: Constants.FederationSlug.ESPORTS_EUROPA,
        start: 0,
        end: 16,
        season: 0,
      },
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_OPEN,
        federationSlug: Constants.FederationSlug.ESPORTS_AMERICAS,
        start: 0,
        end: 16,
        season: 0,
      },
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_OPEN,
        federationSlug: Constants.FederationSlug.ESPORTS_ASIA,
        start: 0,
        end: 8,
        season: 0,
      },
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_OPEN,
        federationSlug: Constants.FederationSlug.ESPORTS_OCE,
        start: 0,
        end: 8,
        season: 0,
      },
    ],
  },
  {
    tierSlug: Constants.TierSlug.LEAGUE_INTERMEDIATE,
    on: Constants.CalendarEntry.SEASON_START,
    entries: [
      // EU/NA: top 4 open playoffs promote to intermediate
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_OPEN_PLAYOFFS,
        federationSlug: Constants.FederationSlug.ESPORTS_EUROPA,
        start: 1,
        end: 4,
        season: -1,
      },
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_OPEN_PLAYOFFS,
        federationSlug: Constants.FederationSlug.ESPORTS_AMERICAS,
        start: 1,
        end: 4,
        season: -1,
      },
      // EU/NA: 5th thru 8th intermediate playoffs stay in intermediate
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_INTERMEDIATE_PLAYOFFS,
        federationSlug: Constants.FederationSlug.ESPORTS_EUROPA,
        start: 5,
        end: 8,
        season: -1,
      },
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_INTERMEDIATE_PLAYOFFS,
        federationSlug: Constants.FederationSlug.ESPORTS_AMERICAS,
        start: 5,
        end: 8,
        season: -1,
      },
      // EU/NA: 9th thru 26th intermediate stay in intermediate
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_INTERMEDIATE,
        federationSlug: Constants.FederationSlug.ESPORTS_EUROPA,
        start: 9,
        end: 26,
        season: -1,
      },
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_INTERMEDIATE,
        federationSlug: Constants.FederationSlug.ESPORTS_AMERICAS,
        start: 9,
        end: 26,
        season: -1,
      },
      // EU/NA: bottom 4 main relegate to intermediate
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_MAIN,
        federationSlug: Constants.FederationSlug.ESPORTS_EUROPA,
        start: 17,
        end: 20,
        season: -1,
      },
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_MAIN,
        federationSlug: Constants.FederationSlug.ESPORTS_AMERICAS,
        start: 17,
        end: 20,
        season: -1,
      },
      {
        action: Action.FALLBACK,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_INTERMEDIATE,
        start: 0,
      },
    ],
  },
  {
    tierSlug: Constants.TierSlug.LEAGUE_INTERMEDIATE_PLAYOFFS,
    on: Constants.CalendarEntry.SEASON_START,
    entries: [],
  },
  {
    tierSlug: Constants.TierSlug.LEAGUE_INTERMEDIATE_PLAYOFFS,
    on: Constants.CalendarEntry.COMPETITION_START,
    entries: [
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_INTERMEDIATE,
        federationSlug: Constants.FederationSlug.ESPORTS_EUROPA,
        start: 0,
        end: 8,
        season: 0,
      },
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_INTERMEDIATE,
        federationSlug: Constants.FederationSlug.ESPORTS_AMERICAS,
        start: 0,
        end: 8,
        season: 0,
      },
    ],
  },
  {
    tierSlug: Constants.TierSlug.LEAGUE_MAIN,
    on: Constants.CalendarEntry.SEASON_START,
    entries: [
      // EU/NA: top 4 intermediate playoffs promote to main
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_INTERMEDIATE_PLAYOFFS,
        federationSlug: Constants.FederationSlug.ESPORTS_EUROPA,
        start: 1,
        end: 4,
        season: -1,
      },
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_INTERMEDIATE_PLAYOFFS,
        federationSlug: Constants.FederationSlug.ESPORTS_AMERICAS,
        start: 1,
        end: 4,
        season: -1,
      },
      // EU/NA: 5th thru 8th main playoffs stay in main
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_MAIN_PLAYOFFS,
        federationSlug: Constants.FederationSlug.ESPORTS_EUROPA,
        start: 5,
        end: 8,
        season: -1,
      },
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_MAIN_PLAYOFFS,
        federationSlug: Constants.FederationSlug.ESPORTS_AMERICAS,
        start: 5,
        end: 8,
        season: -1,
      },
      // EU/NA: 9th thru 16th main stay in main
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_MAIN,
        federationSlug: Constants.FederationSlug.ESPORTS_EUROPA,
        start: 9,
        end: 16,
        season: -1,
      },
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_MAIN,
        federationSlug: Constants.FederationSlug.ESPORTS_AMERICAS,
        start: 9,
        end: 16,
        season: -1,
      },
      // EU/NA: bottom 4 advanced relegate to main
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_ADVANCED,
        federationSlug: Constants.FederationSlug.ESPORTS_EUROPA,
        start: 17,
        end: 20,
        season: -1,
      },
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_ADVANCED,
        federationSlug: Constants.FederationSlug.ESPORTS_AMERICAS,
        start: 17,
        end: 20,
        season: -1,
      },
      {
        action: Action.FALLBACK,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_MAIN,
        start: 0,
      },
    ],
  },
  {
    tierSlug: Constants.TierSlug.LEAGUE_MAIN_PLAYOFFS,
    on: Constants.CalendarEntry.SEASON_START,
    entries: [],
  },
  {
    tierSlug: Constants.TierSlug.LEAGUE_MAIN_PLAYOFFS,
    on: Constants.CalendarEntry.COMPETITION_START,
    entries: [
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_MAIN,
        federationSlug: Constants.FederationSlug.ESPORTS_EUROPA,
        start: 0,
        end: 8,
        season: 0,
      },
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_MAIN,
        federationSlug: Constants.FederationSlug.ESPORTS_AMERICAS,
        start: 0,
        end: 8,
        season: 0,
      },
    ],
  },
  {
    tierSlug: Constants.TierSlug.LEAGUE_ADVANCED,
    on: Constants.CalendarEntry.SEASON_START,
    entries: [
      // EPL: federation-based relegation back to advanced
      // NOTE: world-league entries are federation-filtered before range slicing,
      // so these ranges must be relative to each federation's EPL cohort
      // (EU 17 => keep 9/relegate 8, AM 8 => keep 4/relegate 4,
      // AS 5 => keep 2/relegate 3, OCE 2 => keep 1/relegate 1).
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_PRO_LEAGUE,
        target: Constants.TierSlug.LEAGUE_PRO,
        federationSlug: Constants.FederationSlug.ESPORTS_EUROPA,
        start: 10,
        end: 17,
        season: -1,
      },
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_PRO_LEAGUE,
        target: Constants.TierSlug.LEAGUE_PRO,
        federationSlug: Constants.FederationSlug.ESPORTS_AMERICAS,
        start: 5,
        end: 8,
        season: -1,
      },
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_PRO_LEAGUE,
        target: Constants.TierSlug.LEAGUE_PRO,
        federationSlug: Constants.FederationSlug.ESPORTS_ASIA,
        start: 3,
        end: 5,
        season: -1,
      },
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_PRO_LEAGUE,
        target: Constants.TierSlug.LEAGUE_PRO,
        federationSlug: Constants.FederationSlug.ESPORTS_OCE,
        start: 2,
        end: 2,
        season: -1,
      },
      // EU/NA: top 4 main playoffs promote to advanced
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_MAIN_PLAYOFFS,
        federationSlug: Constants.FederationSlug.ESPORTS_EUROPA,
        start: 1,
        end: 4,
        season: -1,
      },
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_MAIN_PLAYOFFS,
        federationSlug: Constants.FederationSlug.ESPORTS_AMERICAS,
        start: 1,
        end: 4,
        season: -1,
      },
      // EU/NA: keep advanced playoff teams (9th-16th)
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_ADVANCED_PLAYOFFS,
        federationSlug: Constants.FederationSlug.ESPORTS_EUROPA,
        start: 9,
        end: 16,
        season: -1,
      },
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_ADVANCED_PLAYOFFS,
        federationSlug: Constants.FederationSlug.ESPORTS_AMERICAS,
        start: 9,
        end: 16,
        season: -1,
      },
      // Asia: top 2 open playoffs promote to advanced
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_OPEN_PLAYOFFS,
        federationSlug: Constants.FederationSlug.ESPORTS_ASIA,
        start: 1,
        end: 2,
        season: -1,
      },
      // Asia: keep advanced playoff teams (4th-8th)
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_ADVANCED_PLAYOFFS,
        federationSlug: Constants.FederationSlug.ESPORTS_ASIA,
        start: 4,
        end: 8,
        season: -1,
      },
      // Asia: 9th thru 18th advanced stay advanced
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_ADVANCED,
        federationSlug: Constants.FederationSlug.ESPORTS_ASIA,
        start: 9,
        end: 18,
        season: -1,
      },
      // OCE: top 2 open playoffs promote to advanced
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_OPEN_PLAYOFFS,
        federationSlug: Constants.FederationSlug.ESPORTS_OCE,
        start: 1,
        end: 2,
        season: -1,
      },
      // OCE: keep advanced playoff teams (2nd-8th)
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_ADVANCED_PLAYOFFS,
        federationSlug: Constants.FederationSlug.ESPORTS_OCE,
        start: 2,
        end: 8,
        season: -1,
      },
      // OCE: retain every non-playoff team except the relegation-match loser.
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_ADVANCED,
        federationSlug: Constants.FederationSlug.ESPORTS_OCE,
        start: 9,
        end: 14,
        season: -1,
      },
      {
        action: Action.FALLBACK,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_ADVANCED,
        start: 0,
      },
    ],
  },
  {
    tierSlug: Constants.TierSlug.LEAGUE_ADVANCED_PLAYOFFS,
    on: Constants.CalendarEntry.SEASON_START,
    entries: [],
  },
  {
    tierSlug: Constants.TierSlug.LEAGUE_ADVANCED_PLAYOFFS,
    on: Constants.CalendarEntry.COMPETITION_START,
    entries: [
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_ADVANCED,
        federationSlug: Constants.FederationSlug.ESPORTS_EUROPA,
        start: 0,
        end: 16,
        season: 0,
      },
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_ADVANCED,
        federationSlug: Constants.FederationSlug.ESPORTS_AMERICAS,
        start: 0,
        end: 16,
        season: 0,
      },
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_ADVANCED,
        federationSlug: Constants.FederationSlug.ESPORTS_ASIA,
        start: 0,
        end: 8,
        season: 0,
      },
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_ADVANCED,
        federationSlug: Constants.FederationSlug.ESPORTS_OCE,
        start: 0,
        end: 8,
        season: 0,
      },
    ],
  },
  {
    tierSlug: Constants.TierSlug.BLAST_FINALS,
    on: Constants.CalendarEntry.SEASON_START,
    entries: [],
  },
  {
    tierSlug: Constants.TierSlug.BLAST_FINALS,
    on: Constants.CalendarEntry.COMPETITION_START,
    entries: [
      {
        action: Action.FALLBACK,
        from: Constants.LeagueSlug.ESPORTS_BLAST,
        target: Constants.TierSlug.BLAST_FINALS,
        federationSlug: Constants.FederationSlug.ESPORTS_WORLD,
        start: 1,
        end: 8,
      },
    ],
  },
  {
    tierSlug: Constants.TierSlug.CCT_SERIES,
    on: Constants.CalendarEntry.SEASON_START,
    entries: [],
  },
  {
    tierSlug: Constants.TierSlug.CCT_SERIES,
    on: Constants.CalendarEntry.COMPETITION_START,
    entries: [
      ...[
        Constants.FederationSlug.ESPORTS_EUROPA,
        Constants.FederationSlug.ESPORTS_AMERICAS,
      ].flatMap((federationSlug) => [
        {
          action: Action.INCLUDE,
          from: Constants.LeagueSlug.ESPORTS_LEAGUE,
          target: Constants.TierSlug.LEAGUE_MAIN_PLAYOFFS,
          federationSlug,
          start: 5,
          end: 8,
          season: 0,
        },
        {
          action: Action.INCLUDE,
          from: Constants.LeagueSlug.ESPORTS_LEAGUE,
          target: Constants.TierSlug.LEAGUE_INTERMEDIATE_PLAYOFFS,
          federationSlug,
          start: 1,
          end: 8,
          season: 0,
        },
        {
          action: Action.INCLUDE,
          from: Constants.LeagueSlug.ESPORTS_LEAGUE,
          target: Constants.TierSlug.LEAGUE_OPEN_PLAYOFFS,
          federationSlug,
          start: 1,
          // The first four qualify; the remaining playoff teams are ordered
          // alternates when a parent/academy collision frees a CCT slot.
          end: 16,
          season: 0,
        },
      ]),
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_ADVANCED_PLAYOFFS,
        federationSlug: Constants.FederationSlug.ESPORTS_ASIA,
        start: 5,
        end: 8,
        season: 0,
      },
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_OPEN,
        federationSlug: Constants.FederationSlug.ESPORTS_ASIA,
        start: 1,
        end: 12,
        season: 0,
      },
    ],
  },
  {
    tierSlug: Constants.TierSlug.CCT_SERIES_PLAYOFFS,
    on: Constants.CalendarEntry.SEASON_START,
    entries: [],
  },
  {
    tierSlug: Constants.TierSlug.CCT_SERIES_PLAYOFFS,
    on: Constants.CalendarEntry.COMPETITION_START,
    entries: [
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_CCT,
        target: Constants.TierSlug.CCT_SERIES,
        start: 1,
        end: 8,
        season: 0,
      },
    ],
  },
  {
    tierSlug: Constants.TierSlug.CCT_OCE_SERIES,
    on: Constants.CalendarEntry.SEASON_START,
    entries: [],
  },
  {
    tierSlug: Constants.TierSlug.CCT_OCE_SERIES,
    on: Constants.CalendarEntry.COMPETITION_START,
    entries: [
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_OPEN_PLAYOFFS,
        federationSlug: Constants.FederationSlug.ESPORTS_OCE,
        start: 1,
        end: 2,
        season: 0,
      },
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_ADVANCED_PLAYOFFS,
        federationSlug: Constants.FederationSlug.ESPORTS_OCE,
        start: 1,
        end: 6,
        season: 0,
      },
    ],
  },
  {
    tierSlug: Constants.TierSlug.CCT_OCE_PLAYOFFS,
    on: Constants.CalendarEntry.SEASON_START,
    entries: [],
  },
  {
    tierSlug: Constants.TierSlug.CCT_OCE_PLAYOFFS,
    on: Constants.CalendarEntry.COMPETITION_START,
    entries: [
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_CCT,
        target: Constants.TierSlug.CCT_OCE_SERIES,
        federationSlug: Constants.FederationSlug.ESPORTS_OCE,
        start: 1,
        end: 4,
        season: 0,
      },
    ],
  },
  {
    tierSlug: Constants.TierSlug.IEM_COLOGNE_OPEN_QUALIFIER,
    on: Constants.CalendarEntry.SEASON_START,
    entries: [],
  },
  {
    tierSlug: Constants.TierSlug.IEM_COLOGNE_OPEN_QUALIFIER,
    on: Constants.CalendarEntry.COMPETITION_START,
    entries: [
      {
        action: Action.FALLBACK,
        from: Constants.LeagueSlug.ESPORTS_IEM_COLOGNE_QUALIFIER,
        target: Constants.TierSlug.IEM_COLOGNE_OPEN_QUALIFIER,
        start: 1,
      },
    ],
  },
  {
    tierSlug: Constants.TierSlug.IEM_COLOGNE_GROUP_A,
    on: Constants.CalendarEntry.SEASON_START,
    entries: [],
  },
  {
    tierSlug: Constants.TierSlug.IEM_COLOGNE_GROUP_A,
    on: Constants.CalendarEntry.COMPETITION_START,
    entries: [
      {
        action: Action.FALLBACK,
        from: Constants.LeagueSlug.ESPORTS_IEM_COLOGNE,
        target: Constants.TierSlug.IEM_COLOGNE_GROUP_A,
        start: 1,
        end: 8,
      },
    ],
  },
  {
    tierSlug: Constants.TierSlug.IEM_COLOGNE_GROUP_B,
    on: Constants.CalendarEntry.SEASON_START,
    entries: [],
  },
  {
    tierSlug: Constants.TierSlug.IEM_COLOGNE_GROUP_B,
    on: Constants.CalendarEntry.COMPETITION_START,
    entries: [
      {
        action: Action.FALLBACK,
        from: Constants.LeagueSlug.ESPORTS_IEM_COLOGNE,
        target: Constants.TierSlug.IEM_COLOGNE_GROUP_B,
        start: 9,
        end: 16,
      },
    ],
  },
  {
    tierSlug: Constants.TierSlug.IEM_COLOGNE_PLAYOFFS,
    on: Constants.CalendarEntry.SEASON_START,
    entries: [],
  },
  {
    tierSlug: Constants.TierSlug.IEM_COLOGNE_PLAYOFFS,
    on: Constants.CalendarEntry.COMPETITION_START,
    entries: [
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_IEM_COLOGNE,
        target: Constants.TierSlug.IEM_COLOGNE_GROUP_A,
        federationSlug: Constants.FederationSlug.ESPORTS_WORLD,
        start: 1,
        end: 3,
        season: 0,
      },
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_IEM_COLOGNE,
        target: Constants.TierSlug.IEM_COLOGNE_GROUP_B,
        federationSlug: Constants.FederationSlug.ESPORTS_WORLD,
        start: 1,
        end: 3,
        season: 0,
      },
    ],
  },
  {
    tierSlug: Constants.TierSlug.ESL_CHALLENGER,
    on: Constants.CalendarEntry.SEASON_START,
    entries: [],
  },
  {
    tierSlug: Constants.TierSlug.ESL_CHALLENGER,
    on: Constants.CalendarEntry.COMPETITION_START,
    entries: [
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_MAIN_PLAYOFFS,
        federationSlug: Constants.FederationSlug.ESPORTS_EUROPA,
        start: 1,
        end: 4,
        season: 0,
      },
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_ADVANCED_PLAYOFFS,
        federationSlug: Constants.FederationSlug.ESPORTS_AMERICAS,
        start: 1,
        end: 2,
        season: 0,
      },
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_ADVANCED_PLAYOFFS,
        federationSlug: Constants.FederationSlug.ESPORTS_ASIA,
        start: 1,
        end: 1,
        season: 0,
      },
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_ADVANCED_PLAYOFFS,
        federationSlug: Constants.FederationSlug.ESPORTS_OCE,
        start: 1,
        end: 1,
        season: 0,
      },
    ],
  },
  {
    tierSlug: Constants.TierSlug.ESL_CHALLENGER_PLAYOFFS,
    on: Constants.CalendarEntry.SEASON_START,
    entries: [],
  },
  {
    tierSlug: Constants.TierSlug.ESL_CHALLENGER_PLAYOFFS,
    on: Constants.CalendarEntry.COMPETITION_START,
    entries: [
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_ESL_CHALLENGER,
        target: Constants.TierSlug.ESL_CHALLENGER,
        federationSlug: Constants.FederationSlug.ESPORTS_WORLD,
        start: 1,
        end: 4,
        season: 0,
      },
    ],
  },
  {
    tierSlug: Constants.TierSlug.CCT_GLOBAL_FINALS,
    on: Constants.CalendarEntry.SEASON_START,
    entries: [],
  },
  {
    tierSlug: Constants.TierSlug.CCT_GLOBAL_FINALS,
    on: Constants.CalendarEntry.COMPETITION_START,
    entries: [
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_CCT,
        target: Constants.TierSlug.CCT_SERIES_PLAYOFFS,
        federationSlug: Constants.FederationSlug.ESPORTS_EUROPA,
        start: 1,
        end: 4,
        season: 0,
      },
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_CCT,
        target: Constants.TierSlug.CCT_SERIES_PLAYOFFS,
        federationSlug: Constants.FederationSlug.ESPORTS_AMERICAS,
        start: 1,
        end: 2,
        season: 0,
      },
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_CCT,
        target: Constants.TierSlug.CCT_SERIES_PLAYOFFS,
        federationSlug: Constants.FederationSlug.ESPORTS_ASIA,
        start: 1,
        end: 1,
        season: 0,
      },
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_CCT,
        target: Constants.TierSlug.CCT_OCE_PLAYOFFS,
        federationSlug: Constants.FederationSlug.ESPORTS_OCE,
        start: 1,
        end: 1,
        season: 0,
      },
    ],
  },
  {
    tierSlug: Constants.TierSlug.ESEA_CASH_CUP,
    on: Constants.CalendarEntry.SEASON_START,
    entries: [],
  },
  {
    tierSlug: Constants.TierSlug.ESEA_CASH_CUP,
    on: Constants.CalendarEntry.COMPETITION_START,
    entries: [
      ...[
        Constants.FederationSlug.ESPORTS_EUROPA,
        Constants.FederationSlug.ESPORTS_AMERICAS,
      ].flatMap((federationSlug) => [
        {
          action: Action.INCLUDE,
          from: Constants.LeagueSlug.ESPORTS_LEAGUE,
          target: Constants.TierSlug.LEAGUE_OPEN,
          federationSlug,
          start: 1,
          end: 40,
          season: 0,
        },
        {
          action: Action.INCLUDE,
          from: Constants.LeagueSlug.ESPORTS_LEAGUE,
          target: Constants.TierSlug.LEAGUE_INTERMEDIATE,
          federationSlug,
          start: 1,
          end: 30,
          season: 0,
        },
      ]),
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_OPEN,
        federationSlug: Constants.FederationSlug.ESPORTS_ASIA,
        start: 1,
        end: 30,
        season: 0,
      },
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_ADVANCED,
        federationSlug: Constants.FederationSlug.ESPORTS_ASIA,
        start: 9,
        end: 20,
        season: 0,
      },
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_OPEN,
        federationSlug: Constants.FederationSlug.ESPORTS_OCE,
        start: 1,
        end: 20,
        season: 0,
      },
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_ADVANCED,
        federationSlug: Constants.FederationSlug.ESPORTS_OCE,
        start: 9,
        end: 15,
        season: 0,
      },
    ],
  },
  {
    tierSlug: Constants.TierSlug.IEM_KRAKOW_OPEN_QUALIFIER,
    on: Constants.CalendarEntry.SEASON_START,
    entries: [],
  },
  {
    tierSlug: Constants.TierSlug.IEM_KRAKOW_OPEN_QUALIFIER,
    on: Constants.CalendarEntry.COMPETITION_START,
    entries: [
      {
        action: Action.FALLBACK,
        from: Constants.LeagueSlug.ESPORTS_IEM_KRAKOW_QUALIFIER,
        target: Constants.TierSlug.IEM_KRAKOW_OPEN_QUALIFIER,
        start: 1,
      },
    ],
  },
  {
    tierSlug: Constants.TierSlug.IEM_KRAKOW_GROUP_A,
    on: Constants.CalendarEntry.SEASON_START,
    entries: [],
  },
  {
    tierSlug: Constants.TierSlug.IEM_KRAKOW_GROUP_A,
    on: Constants.CalendarEntry.COMPETITION_START,
    entries: [
      {
        action: Action.FALLBACK,
        from: Constants.LeagueSlug.ESPORTS_IEM_KRAKOW,
        target: Constants.TierSlug.IEM_KRAKOW_GROUP_A,
        start: 1,
        end: 8,
      },
    ],
  },
  {
    tierSlug: Constants.TierSlug.IEM_KRAKOW_GROUP_B,
    on: Constants.CalendarEntry.SEASON_START,
    entries: [],
  },
  {
    tierSlug: Constants.TierSlug.IEM_KRAKOW_GROUP_B,
    on: Constants.CalendarEntry.COMPETITION_START,
    entries: [
      {
        action: Action.FALLBACK,
        from: Constants.LeagueSlug.ESPORTS_IEM_KRAKOW,
        target: Constants.TierSlug.IEM_KRAKOW_GROUP_B,
        start: 9,
        end: 16,
      },
    ],
  },
  {
    tierSlug: Constants.TierSlug.IEM_KRAKOW_PLAYOFFS,
    on: Constants.CalendarEntry.SEASON_START,
    entries: [],
  },
  {
    tierSlug: Constants.TierSlug.IEM_KRAKOW_PLAYOFFS,
    on: Constants.CalendarEntry.COMPETITION_START,
    entries: [
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_IEM_KRAKOW,
        target: Constants.TierSlug.IEM_KRAKOW_GROUP_A,
        federationSlug: Constants.FederationSlug.ESPORTS_WORLD,
        start: 1,
        end: 3,
        season: 0,
      },
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_IEM_KRAKOW,
        target: Constants.TierSlug.IEM_KRAKOW_GROUP_B,
        federationSlug: Constants.FederationSlug.ESPORTS_WORLD,
        start: 1,
        end: 3,
        season: 0,
      },
    ],
  },
  {
    tierSlug: Constants.TierSlug.MAJOR_ASIA_OPEN_QUALIFIER_1,
    on: Constants.CalendarEntry.SEASON_START,
    entries: [
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_OPEN,
        federationSlug: Constants.FederationSlug.ESPORTS_ASIA,
        start: 1,
        end: 40,
        season: 0,
        excludeCountryCodes: ['CN'],
      },
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_ADVANCED,
        federationSlug: Constants.FederationSlug.ESPORTS_ASIA,
        start: 1,
        end: 20,
        season: 0,
        excludeCountryCodes: ['CN'],
      },
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_PRO_LEAGUE,
        target: Constants.TierSlug.LEAGUE_PRO,
        federationSlug: Constants.FederationSlug.ESPORTS_ASIA,
        start: 1,
        end: 2,
        season: 0,
        excludeCountryCodes: ['CN'],
      },
      {
        action: Action.FALLBACK,
        from: Constants.LeagueSlug.ESPORTS_MAJOR,
        target: Constants.TierSlug.MAJOR_ASIA_OPEN_QUALIFIER_1,
        federationSlug: Constants.FederationSlug.ESPORTS_ASIA,
        start: 1,
        end: 62,
        season: -1,
        excludeCountryCodes: ['CN'],
      },
    ],
  },
  {
    tierSlug: Constants.TierSlug.MAJOR_ASIA_OPEN_QUALIFIER_2,
    on: Constants.CalendarEntry.SEASON_START,
    entries: [],
  },
  {
    tierSlug: Constants.TierSlug.MAJOR_ASIA_OPEN_QUALIFIER_2,
    on: Constants.CalendarEntry.COMPETITION_START,
    entries: [
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_MAJOR,
        target: Constants.TierSlug.MAJOR_ASIA_OPEN_QUALIFIER_1,
        federationSlug: Constants.FederationSlug.ESPORTS_ASIA,
        start: 3,
        end: 62,
        season: 0,
      },
    ],
  },
  {
    tierSlug: Constants.TierSlug.MAJOR_CHINA_OPEN_QUALIFIER_1,
    on: Constants.CalendarEntry.SEASON_START,
    entries: [
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_OPEN,
        federationSlug: Constants.FederationSlug.ESPORTS_ASIA,
        start: 1,
        end: 40,
        season: 0,
        includeCountryCodes: ['CN'],
      },
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_ADVANCED,
        federationSlug: Constants.FederationSlug.ESPORTS_ASIA,
        start: 1,
        end: 20,
        season: 0,
        includeCountryCodes: ['CN'],
      },
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_PRO_LEAGUE,
        target: Constants.TierSlug.LEAGUE_PRO,
        federationSlug: Constants.FederationSlug.ESPORTS_ASIA,
        start: 1,
        end: 2,
        season: 0,
        includeCountryCodes: ['CN'],
      },
      {
        action: Action.FALLBACK,
        from: Constants.LeagueSlug.ESPORTS_MAJOR,
        target: Constants.TierSlug.MAJOR_CHINA_OPEN_QUALIFIER_1,
        federationSlug: Constants.FederationSlug.ESPORTS_ASIA,
        start: 1,
        end: 32,
        season: -1,
        includeCountryCodes: ['CN'],
      },
    ],
  },
  {
    tierSlug: Constants.TierSlug.MAJOR_CHINA_OPEN_QUALIFIER_2,
    on: Constants.CalendarEntry.SEASON_START,
    entries: [],
  },
  {
    tierSlug: Constants.TierSlug.MAJOR_CHINA_OPEN_QUALIFIER_2,
    on: Constants.CalendarEntry.COMPETITION_START,
    entries: [
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_MAJOR,
        target: Constants.TierSlug.MAJOR_CHINA_OPEN_QUALIFIER_1,
        federationSlug: Constants.FederationSlug.ESPORTS_ASIA,
        start: 2,
        end: 32,
        season: 0,
      },
    ],
  },

  {
    tierSlug: Constants.TierSlug.MAJOR_ASIA_RMR,
    on: Constants.CalendarEntry.SEASON_START,
    entries: [],
  },
  {
    tierSlug: Constants.TierSlug.MAJOR_ASIA_RMR,
    on: Constants.CalendarEntry.COMPETITION_START,
    entries: [
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_MAJOR,
        target: Constants.TierSlug.MAJOR_ASIA_OPEN_QUALIFIER_1,
        federationSlug: Constants.FederationSlug.ESPORTS_ASIA,
        start: 1,
        end: 2,
        season: 0,
      },
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_MAJOR,
        target: Constants.TierSlug.MAJOR_ASIA_OPEN_QUALIFIER_2,
        federationSlug: Constants.FederationSlug.ESPORTS_ASIA,
        start: 1,
        end: 2,
        season: 0,
      },
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_MAJOR,
        target: Constants.TierSlug.MAJOR_CHINA_OPEN_QUALIFIER_1,
        federationSlug: Constants.FederationSlug.ESPORTS_ASIA,
        start: 1,
        end: 1,
        season: 0,
      },
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_MAJOR,
        target: Constants.TierSlug.MAJOR_CHINA_OPEN_QUALIFIER_2,
        federationSlug: Constants.FederationSlug.ESPORTS_ASIA,
        start: 1,
        end: 1,
        season: 0,
      },
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_MAJOR,
        target: Constants.TierSlug.MAJOR_OCE_OPEN_QUALIFIER_1,
        federationSlug: Constants.FederationSlug.ESPORTS_OCE,
        start: 1,
        end: 1,
        season: 0,
      },
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_MAJOR,
        target: Constants.TierSlug.MAJOR_OCE_OPEN_QUALIFIER_2,
        federationSlug: Constants.FederationSlug.ESPORTS_OCE,
        start: 1,
        end: 1,
        season: 0,
      },
    ],
  },
  {
    tierSlug: Constants.TierSlug.MAJOR_AMERICAS_OPEN_QUALIFIER_1,
    on: Constants.CalendarEntry.SEASON_START,
    entries: [
      {
        action: Action.FALLBACK,
        from: Constants.LeagueSlug.ESPORTS_MAJOR,
        target: Constants.TierSlug.MAJOR_AMERICAS_OPEN_QUALIFIER_1,
        federationSlug: Constants.FederationSlug.ESPORTS_AMERICAS,
        start: 1,
      },
    ],
  },
  {
    tierSlug: Constants.TierSlug.MAJOR_AMERICAS_OPEN_QUALIFIER_2,
    on: Constants.CalendarEntry.SEASON_START,
    entries: [],
  },
  {
    tierSlug: Constants.TierSlug.MAJOR_AMERICAS_OPEN_QUALIFIER_2,
    on: Constants.CalendarEntry.COMPETITION_START,
    entries: [
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_MAJOR,
        target: Constants.TierSlug.MAJOR_AMERICAS_OPEN_QUALIFIER_1,
        federationSlug: Constants.FederationSlug.ESPORTS_AMERICAS,
        start: 5,
        season: 0,
      },
    ],
  },

  {
    tierSlug: Constants.TierSlug.MAJOR_AMERICAS_RMR,
    on: Constants.CalendarEntry.SEASON_START,
    entries: [],
  },
  {
    tierSlug: Constants.TierSlug.MAJOR_AMERICAS_RMR,
    on: Constants.CalendarEntry.COMPETITION_START,
    entries: [
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_MAJOR,
        target: Constants.TierSlug.MAJOR_AMERICAS_OPEN_QUALIFIER_1,
        federationSlug: Constants.FederationSlug.ESPORTS_AMERICAS,
        start: 1,
        end: 4,
        season: 0,
      },
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_MAJOR,
        target: Constants.TierSlug.MAJOR_AMERICAS_OPEN_QUALIFIER_2,
        federationSlug: Constants.FederationSlug.ESPORTS_AMERICAS,
        start: 1,
        end: 4,
        season: 0,
      },
      {
        action: Action.FALLBACK,
        from: Constants.LeagueSlug.ESPORTS_MAJOR,
        target: Constants.TierSlug.MAJOR_AMERICAS_RMR,
        federationSlug: Constants.FederationSlug.ESPORTS_AMERICAS,
        start: 1,
      },
    ],
  },

  {
    tierSlug: Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_1,
    on: Constants.CalendarEntry.SEASON_START,
    entries: [
      {
        action: Action.FALLBACK,
        from: Constants.LeagueSlug.ESPORTS_MAJOR,
        target: Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_1,
        federationSlug: Constants.FederationSlug.ESPORTS_EUROPA,
        start: 1,
      },
    ],
  },
  {
    tierSlug: Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_2,
    on: Constants.CalendarEntry.SEASON_START,
    entries: [],
  },
  {
    tierSlug: Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_2,
    on: Constants.CalendarEntry.COMPETITION_START,
    entries: [
      {
        action: Action.EXCLUDE,
        from: Constants.LeagueSlug.ESPORTS_MAJOR,
        target: Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_1,
        federationSlug: Constants.FederationSlug.ESPORTS_EUROPA,
        start: 1,
        end: 4,
        season: 0,
      },
      {
        action: Action.FALLBACK,
        from: Constants.LeagueSlug.ESPORTS_MAJOR,
        target: Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_1,
        federationSlug: Constants.FederationSlug.ESPORTS_EUROPA,
        start: 1,
        season: 0,
      },
    ],
  },
  {
    tierSlug: Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_3,
    on: Constants.CalendarEntry.SEASON_START,
    entries: [],
  },
  {
    tierSlug: Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_3,
    on: Constants.CalendarEntry.COMPETITION_START,
    entries: [
      {
        action: Action.EXCLUDE,
        from: Constants.LeagueSlug.ESPORTS_MAJOR,
        target: Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_1,
        federationSlug: Constants.FederationSlug.ESPORTS_EUROPA,
        start: 1,
        end: 4,
        season: 0,
      },
      {
        action: Action.EXCLUDE,
        from: Constants.LeagueSlug.ESPORTS_MAJOR,
        target: Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_2,
        federationSlug: Constants.FederationSlug.ESPORTS_EUROPA,
        start: 1,
        end: 4,
        season: 0,
      },
      {
        action: Action.FALLBACK,
        from: Constants.LeagueSlug.ESPORTS_MAJOR,
        target: Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_1,
        federationSlug: Constants.FederationSlug.ESPORTS_EUROPA,
        start: 1,
        season: 0,
      },
    ],
  },
  {
    tierSlug: Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_4,
    on: Constants.CalendarEntry.SEASON_START,
    entries: [],
  },
  {
    tierSlug: Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_4,
    on: Constants.CalendarEntry.COMPETITION_START,
    entries: [
      {
        action: Action.EXCLUDE,
        from: Constants.LeagueSlug.ESPORTS_MAJOR,
        target: Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_1,
        federationSlug: Constants.FederationSlug.ESPORTS_EUROPA,
        start: 1,
        end: 4,
        season: 0,
      },
      {
        action: Action.EXCLUDE,
        from: Constants.LeagueSlug.ESPORTS_MAJOR,
        target: Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_2,
        federationSlug: Constants.FederationSlug.ESPORTS_EUROPA,
        start: 1,
        end: 4,
        season: 0,
      },
      {
        action: Action.EXCLUDE,
        from: Constants.LeagueSlug.ESPORTS_MAJOR,
        target: Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_3,
        federationSlug: Constants.FederationSlug.ESPORTS_EUROPA,
        start: 1,
        end: 4,
        season: 0,
      },
      {
        action: Action.FALLBACK,
        from: Constants.LeagueSlug.ESPORTS_MAJOR,
        target: Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_1,
        federationSlug: Constants.FederationSlug.ESPORTS_EUROPA,
        start: 1,
        season: 0,
      },
    ],
  },

  {
    tierSlug: Constants.TierSlug.MAJOR_EUROPE_RMR_A,
    on: Constants.CalendarEntry.SEASON_START,
    entries: [],
  },
  {
    tierSlug: Constants.TierSlug.MAJOR_EUROPE_RMR_A,
    on: Constants.CalendarEntry.COMPETITION_START,
    entries: [
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_MAJOR,
        target: Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_1,
        federationSlug: Constants.FederationSlug.ESPORTS_EUROPA,
        start: 1,
        end: 4,
        season: 0,
      },
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_MAJOR,
        target: Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_3,
        federationSlug: Constants.FederationSlug.ESPORTS_EUROPA,
        start: 1,
        end: 4,
        season: 0,
      },
      {
        action: Action.EXCLUDE,
        from: Constants.LeagueSlug.ESPORTS_MAJOR,
        target: Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_2,
        federationSlug: Constants.FederationSlug.ESPORTS_EUROPA,
        start: 1,
        end: 4,
        season: 0,
      },
      {
        action: Action.EXCLUDE,
        from: Constants.LeagueSlug.ESPORTS_MAJOR,
        target: Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_4,
        federationSlug: Constants.FederationSlug.ESPORTS_EUROPA,
        start: 1,
        end: 4,
        season: 0,
      },
      {
        action: Action.FALLBACK,
        from: Constants.LeagueSlug.ESPORTS_MAJOR,
        target: Constants.TierSlug.MAJOR_EUROPE_RMR_A,
        federationSlug: Constants.FederationSlug.ESPORTS_EUROPA,
        start: 1,
      },
    ],
  },
  {
    tierSlug: Constants.TierSlug.MAJOR_EUROPE_RMR_B,
    on: Constants.CalendarEntry.SEASON_START,
    entries: [],
  },
  {
    tierSlug: Constants.TierSlug.MAJOR_EUROPE_RMR_B,
    on: Constants.CalendarEntry.COMPETITION_START,
    entries: [
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_MAJOR,
        target: Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_2,
        federationSlug: Constants.FederationSlug.ESPORTS_EUROPA,
        start: 1,
        end: 4,
        season: 0,
      },
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_MAJOR,
        target: Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_4,
        federationSlug: Constants.FederationSlug.ESPORTS_EUROPA,
        start: 1,
        end: 4,
        season: 0,
      },
      {
        action: Action.EXCLUDE,
        from: Constants.LeagueSlug.ESPORTS_MAJOR,
        target: Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_1,
        federationSlug: Constants.FederationSlug.ESPORTS_EUROPA,
        start: 1,
        end: 4,
        season: 0,
      },
      {
        action: Action.EXCLUDE,
        from: Constants.LeagueSlug.ESPORTS_MAJOR,
        target: Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_3,
        federationSlug: Constants.FederationSlug.ESPORTS_EUROPA,
        start: 1,
        end: 4,
        season: 0,
      },
      {
        action: Action.FALLBACK,
        from: Constants.LeagueSlug.ESPORTS_MAJOR,
        target: Constants.TierSlug.MAJOR_EUROPE_RMR_B,
        federationSlug: Constants.FederationSlug.ESPORTS_EUROPA,
        start: 1,
      },
    ],
  },

  {
    tierSlug: Constants.TierSlug.MAJOR_CHALLENGERS_STAGE,
    on: Constants.CalendarEntry.SEASON_START,
    entries: [],
  },
  {
    tierSlug: Constants.TierSlug.MAJOR_CHALLENGERS_STAGE,
    on: Constants.CalendarEntry.COMPETITION_START,
    entries: [
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_MAJOR,
        target: Constants.TierSlug.MAJOR_ASIA_RMR,
        federationSlug: Constants.FederationSlug.ESPORTS_ASIA,
        start: 1,
        end: 3,
        season: 0,
      },
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_MAJOR,
        target: Constants.TierSlug.MAJOR_AMERICAS_RMR,
        federationSlug: Constants.FederationSlug.ESPORTS_AMERICAS,
        start: 2,
        end: 5,
        season: 0,
      },
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_MAJOR,
        target: Constants.TierSlug.MAJOR_EUROPE_RMR_A,
        federationSlug: Constants.FederationSlug.ESPORTS_EUROPA,
        start: 5,
        end: 8,
        season: 0,
      },
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_MAJOR,
        target: Constants.TierSlug.MAJOR_EUROPE_RMR_B,
        federationSlug: Constants.FederationSlug.ESPORTS_EUROPA,
        start: 4,
        end: 8,
        season: 0,
      },
    ],
  },
  {
    tierSlug: Constants.TierSlug.MAJOR_LEGENDS_STAGE,
    on: Constants.CalendarEntry.SEASON_START,
    entries: [],
  },
  {
    tierSlug: Constants.TierSlug.MAJOR_LEGENDS_STAGE,
    on: Constants.CalendarEntry.COMPETITION_START,
    entries: [
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_MAJOR,
        target: Constants.TierSlug.MAJOR_CHALLENGERS_STAGE,
        federationSlug: Constants.FederationSlug.ESPORTS_WORLD,
        start: 1,
        end: 8,
        season: 0,
      },
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_MAJOR,
        target: Constants.TierSlug.MAJOR_AMERICAS_RMR,
        federationSlug: Constants.FederationSlug.ESPORTS_AMERICAS,
        start: 1,
        end: 1,
        season: 0,
      },
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_MAJOR,
        target: Constants.TierSlug.MAJOR_EUROPE_RMR_A,
        federationSlug: Constants.FederationSlug.ESPORTS_EUROPA,
        start: 1,
        end: 4,
        season: 0,
      },
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_MAJOR,
        target: Constants.TierSlug.MAJOR_EUROPE_RMR_B,
        federationSlug: Constants.FederationSlug.ESPORTS_EUROPA,
        start: 1,
        end: 3,
        season: 0,
      },
    ],
  },

  {
    tierSlug: Constants.TierSlug.MAJOR_CHAMPIONS_STAGE,
    on: Constants.CalendarEntry.SEASON_START,
    entries: [],
  },
  {
    tierSlug: Constants.TierSlug.MAJOR_CHAMPIONS_STAGE,
    on: Constants.CalendarEntry.COMPETITION_START,
    entries: [
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_MAJOR,
        target: Constants.TierSlug.MAJOR_LEGENDS_STAGE,
        federationSlug: Constants.FederationSlug.ESPORTS_WORLD,
        start: 1,
        end: 8,
        season: 0,
      },
    ],
  },
  {
    tierSlug: Constants.TierSlug.MAJOR_OCE_OPEN_QUALIFIER_1,
    on: Constants.CalendarEntry.SEASON_START,
    entries: [
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_OPEN,
        federationSlug: Constants.FederationSlug.ESPORTS_OCE,
        start: 1,
        end: 20,
        season: 0,
      },
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_ADVANCED,
        federationSlug: Constants.FederationSlug.ESPORTS_OCE,
        start: 1,
        end: 15,
        season: 0,
      },
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_PRO_LEAGUE,
        target: Constants.TierSlug.LEAGUE_PRO,
        federationSlug: Constants.FederationSlug.ESPORTS_OCE,
        start: 1,
        end: 1,
        season: 0,
      },
      {
        action: Action.FALLBACK,
        from: Constants.LeagueSlug.ESPORTS_MAJOR,
        target: Constants.TierSlug.MAJOR_OCE_OPEN_QUALIFIER_1,
        federationSlug: Constants.FederationSlug.ESPORTS_OCE,
        start: 1,
        end: 36,
        season: -1,
      },
    ],
  },
  {
    tierSlug: Constants.TierSlug.MAJOR_OCE_OPEN_QUALIFIER_2,
    on: Constants.CalendarEntry.SEASON_START,
    entries: [],
  },
  {
    tierSlug: Constants.TierSlug.MAJOR_OCE_OPEN_QUALIFIER_2,
    on: Constants.CalendarEntry.COMPETITION_START,
    entries: [
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_MAJOR,
        target: Constants.TierSlug.MAJOR_OCE_OPEN_QUALIFIER_1,
        federationSlug: Constants.FederationSlug.ESPORTS_OCE,
        start: 2,
        end: 36,
        season: 0,
      },
    ],
  },
];

function buildCompetitionFederationWhere(
  federationSlug: Constants.FederationSlug,
  countryFilter?: Prisma.CountryWhereInput | null,
): Prisma.TeamWhereInput {
  if (federationSlug === Constants.FederationSlug.ESPORTS_WORLD) {
    return countryFilter ? { country: countryFilter } : {};
  }

  return {
    OR: [
      {
        competitionFederation: {
          is: {
            slug: federationSlug,
          },
        },
        ...(countryFilter ? { country: countryFilter } : {}),
      },
      {
        competitionFederationId: null,
        country: {
          ...(countryFilter ? countryFilter : {}),
          continent: {
            federation: {
              slug: federationSlug,
            },
          },
        },
      },
    ],
  };
}

function sliceEntry<T>(items: T[], entry: Entry) {
  return items.slice(
    entry.start < 0 ? entry.start : Math.max(0, entry.start - 1),
    entry.end || undefined,
  );
}

function uniqueTeams(teams: Team[]) {
  return [...new Map(teams.map((team) => [team.id, team])).values()];
}

async function getRankedTeamsByFederation(
  federationSlug: Constants.FederationSlug,
  countryFilter?: Prisma.CountryWhereInput | null,
) {
  return DatabaseClient.prisma.team.findMany({
    where: buildCompetitionFederationWhere(federationSlug, countryFilter),
    orderBy: [{ elo: 'desc' }, { id: 'asc' }],
  });
}

async function getMajorDirectInvitePool(
  federationSlug: Constants.FederationSlug,
  firstQualifierTier: Constants.TierSlug,
  count: number,
) {
  const rankedMainTeams = (await getRankedTeamsByFederation(federationSlug)).filter(
    (team) => team.parentTeamId == null,
  );
  const profile = await DatabaseClient.prisma.profile.findFirst({ select: { season: true } });
  const firstQualifier = await DatabaseClient.prisma.competition.findFirst({
    where: {
      season: profile?.season ?? 0,
      tier: { slug: firstQualifierTier },
      federation: { slug: federationSlug },
    },
    select: { competitors: { select: { teamId: true } } },
  });
  if (!firstQualifier?.competitors.length) return rankedMainTeams.slice(0, count);
  const qualifierIds = new Set(firstQualifier.competitors.map((entry) => entry.teamId));
  return rankedMainTeams.filter((team) => !qualifierIds.has(team.id)).slice(0, count);
}

const IEM_AUTO_INVITE_COUNTS: Partial<Record<Constants.FederationSlug, number>> = {
  [Constants.FederationSlug.ESPORTS_EUROPA]: 8,
  [Constants.FederationSlug.ESPORTS_AMERICAS]: 2,
  [Constants.FederationSlug.ESPORTS_ASIA]: 2,
};

const IEM_REGIONAL_QUALIFIER_FEDERATIONS = [
  Constants.FederationSlug.ESPORTS_EUROPA,
  Constants.FederationSlug.ESPORTS_AMERICAS,
  Constants.FederationSlug.ESPORTS_ASIA,
  Constants.FederationSlug.ESPORTS_OCE,
];

async function getIemAutoInviteTeams() {
  const regionalTeams = await Promise.all(
    Object.entries(IEM_AUTO_INVITE_COUNTS).map(async ([federationSlug, count]) => {
      const teams = await getRankedTeamsByFederation(federationSlug as Constants.FederationSlug);
      return teams.filter((team) => team.parentTeamId == null).slice(0, count);
    }),
  );

  return uniqueTeams(flatten(regionalTeams));
}

export async function getOpenQualifierProtectedTeamIds(tierSlug: string) {
  if (
    tierSlug === Constants.TierSlug.IEM_COLOGNE_OPEN_QUALIFIER ||
    tierSlug === Constants.TierSlug.IEM_KRAKOW_OPEN_QUALIFIER
  ) {
    return (await getIemAutoInviteTeams()).map((team) => team.id);
  }
  if (
    [
      Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_1,
      Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_2,
      Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_3,
      Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_4,
    ].includes(tierSlug as Constants.TierSlug)
  ) {
    return (await getRankedTeamsByFederation(Constants.FederationSlug.ESPORTS_EUROPA))
      .filter((team) => team.parentTeamId == null)
      .slice(0, 16)
      .map((team) => team.id);
  }
  if (
    [
      Constants.TierSlug.MAJOR_AMERICAS_OPEN_QUALIFIER_1,
      Constants.TierSlug.MAJOR_AMERICAS_OPEN_QUALIFIER_2,
    ].includes(tierSlug as Constants.TierSlug)
  ) {
    return (await getRankedTeamsByFederation(Constants.FederationSlug.ESPORTS_AMERICAS))
      .filter((team) => team.parentTeamId == null)
      .slice(0, 8)
      .map((team) => team.id);
  }
  return [];
}

async function getIemAutoInviteTeamsFromQualifierField(
  qualifierCompetitions: Array<
    Prisma.CompetitionGetPayload<{
      include: {
        competitors: true;
        federation: true;
      };
    }>
  >,
) {
  const regionalTeams = await Promise.all(
    Object.entries(IEM_AUTO_INVITE_COUNTS).map(async ([federationSlug, count]) => {
      const qualifierCompetition = qualifierCompetitions.find(
        (competition) => competition.federation.slug === federationSlug,
      );
      const qualifierTeamIds = new Set(
        qualifierCompetition?.competitors.map((competitor) => competitor.teamId) ?? [],
      );
      const teams = await getRankedTeamsByFederation(federationSlug as Constants.FederationSlug);
      return teams
        .filter((team) => team.parentTeamId == null && !qualifierTeamIds.has(team.id))
        .slice(0, count);
    }),
  );

  return uniqueTeams(flatten(regionalTeams));
}

function getIemQualifierTierSlug(target: Constants.TierSlug) {
  if (
    target === Constants.TierSlug.IEM_KRAKOW_OPEN_QUALIFIER ||
    target === Constants.TierSlug.IEM_KRAKOW_GROUP_A ||
    target === Constants.TierSlug.IEM_KRAKOW_GROUP_B
  ) {
    return Constants.TierSlug.IEM_KRAKOW_OPEN_QUALIFIER;
  }

  return Constants.TierSlug.IEM_COLOGNE_OPEN_QUALIFIER;
}

async function getIemFinalsPool(target: Constants.TierSlug) {
  const profile = await DatabaseClient.prisma.profile.findFirst();
  const qualifierTierSlug = getIemQualifierTierSlug(target);
  const qualifierCompetitions = await DatabaseClient.prisma.competition.findMany({
    where: {
      season: profile.season,
      tier: {
        slug: qualifierTierSlug,
      },
    },
    include: {
      federation: true,
      competitors: {
        orderBy: { position: 'asc' },
        include: {
          team: true,
        },
      },
    },
  });

  const autoInviteTeams = await getIemAutoInviteTeamsFromQualifierField(qualifierCompetitions);
  const qualifierWinners = IEM_REGIONAL_QUALIFIER_FEDERATIONS.map((federationSlug) =>
    qualifierCompetitions.find((competition) => competition.federation.slug === federationSlug),
  )
    .map((competition) => competition?.competitors[0]?.team)
    .filter((team): team is Team => !!team);

  return uniqueTeams([...autoInviteTeams, ...qualifierWinners]);
}

function getBalancedIemGroupPool(teams: Team[], target: Constants.TierSlug) {
  const groupASeedIndexes = new Set([0, 3, 4, 7, 8, 11, 12, 15]);
  const wantsGroupA =
    target === Constants.TierSlug.IEM_COLOGNE_GROUP_A ||
    target === Constants.TierSlug.IEM_KRAKOW_GROUP_A;

  return teams.filter((_, index) => groupASeedIndexes.has(index) === wantsGroupA);
}

async function getRegionalWorldLeaguePlacements(
  entry: Entry,
  federation: Prisma.FederationGetPayload<unknown>,
): Promise<Array<Team>> {
  const profile = await DatabaseClient.prisma.profile.findFirst();
  const targetFederationSlug = (entry.federationSlug ||
    federation.slug) as Constants.FederationSlug;
  const season = profile.season + (entry.season || 0);

  const [regularSeasonCompetition, playoffsCompetition] = await Promise.all([
    DatabaseClient.prisma.competition.findFirst({
      where: {
        season,
        tier: {
          slug: Constants.TierSlug.LEAGUE_PRO,
          league: {
            slug: Constants.LeagueSlug.ESPORTS_PRO_LEAGUE,
          },
        },
      },
      include: {
        competitors: {
          orderBy: { position: 'asc' },
          include: {
            team: true,
          },
        },
      },
    }),
    DatabaseClient.prisma.competition.findFirst({
      where: {
        season,
        tier: {
          slug: Constants.TierSlug.LEAGUE_PRO_PLAYOFFS,
          league: {
            slug: Constants.LeagueSlug.ESPORTS_PRO_LEAGUE,
          },
        },
      },
      include: {
        competitors: {
          orderBy: { position: 'asc' },
          include: {
            team: true,
          },
        },
      },
    }),
  ]);

  if (!regularSeasonCompetition) {
    return [];
  }

  const playoffCompetitors: typeof regularSeasonCompetition.competitors =
    playoffsCompetition?.competitors ?? [];
  const allCompetitors = [...regularSeasonCompetition.competitors, ...playoffCompetitors];
  const regionalTeams = await DatabaseClient.prisma.team.findMany({
    where: {
      id: {
        in: [...new Set(allCompetitors.map((competitor) => competitor.teamId))],
      },
      ...buildCompetitionFederationWhere(targetFederationSlug),
    },
    select: {
      id: true,
    },
  });
  const regionalTeamIds = new Set(regionalTeams.map((team) => team.id));
  const playoffTeamIds = new Set(
    playoffCompetitors
      .filter((competitor) => regionalTeamIds.has(competitor.teamId))
      .map((competitor) => competitor.teamId),
  );

  const rankedCompetitors = [
    ...playoffCompetitors.filter((competitor) => regionalTeamIds.has(competitor.teamId)),
    ...regularSeasonCompetition.competitors.filter(
      (competitor) =>
        regionalTeamIds.has(competitor.teamId) && !playoffTeamIds.has(competitor.teamId),
    ),
  ];

  return rankedCompetitors
    .slice(entry.start < 0 ? entry.start : Math.max(0, entry.start - 1), entry.end || undefined)
    .map((competitor) => competitor.team);
}

async function getRegionalLeaguePlacements(
  tierSlug: Constants.TierSlug,
  federationSlug: Constants.FederationSlug,
  season: number,
): Promise<Array<Team>> {
  const playoffTierByTier: Partial<Record<Constants.TierSlug, Constants.TierSlug>> = {
    [Constants.TierSlug.LEAGUE_OPEN]: Constants.TierSlug.LEAGUE_OPEN_PLAYOFFS,
    [Constants.TierSlug.LEAGUE_INTERMEDIATE]: Constants.TierSlug.LEAGUE_INTERMEDIATE_PLAYOFFS,
    [Constants.TierSlug.LEAGUE_MAIN]: Constants.TierSlug.LEAGUE_MAIN_PLAYOFFS,
    [Constants.TierSlug.LEAGUE_ADVANCED]: Constants.TierSlug.LEAGUE_ADVANCED_PLAYOFFS,
  };
  const playoffTierSlug = playoffTierByTier[tierSlug];

  const [regularSeasonCompetition, playoffsCompetition] = await Promise.all([
    DatabaseClient.prisma.competition.findFirst({
      where: {
        season,
        federation: {
          slug: federationSlug,
        },
        tier: {
          slug: tierSlug,
          league: {
            slug: Constants.LeagueSlug.ESPORTS_LEAGUE,
          },
        },
      },
      include: {
        competitors: {
          orderBy: { position: 'asc' },
          include: {
            team: true,
          },
        },
      },
    }),
    playoffTierSlug
      ? DatabaseClient.prisma.competition.findFirst({
          where: {
            season,
            federation: {
              slug: federationSlug,
            },
            tier: {
              slug: playoffTierSlug,
              league: {
                slug: Constants.LeagueSlug.ESPORTS_LEAGUE,
              },
            },
          },
          include: {
            competitors: {
              orderBy: { position: 'asc' },
              include: {
                team: true,
              },
            },
          },
        })
      : Promise.resolve(null),
  ]);

  if (!regularSeasonCompetition) {
    return [];
  }

  const playoffCompetitors: typeof regularSeasonCompetition.competitors =
    playoffsCompetition?.competitors ?? [];
  const playoffTeamIds = new Set(playoffCompetitors.map((competitor) => competitor.teamId));
  let regularSeasonCompetitors = regularSeasonCompetition.competitors.filter(
    (competitor) => !playoffTeamIds.has(competitor.teamId),
  );

  if (
    tierSlug === Constants.TierSlug.LEAGUE_ADVANCED &&
    federationSlug === Constants.FederationSlug.ESPORTS_OCE
  ) {
    const relegationMatch = await DatabaseClient.prisma.match.findFirst({
      where: {
        competitionId: regularSeasonCompetition.id,
        payload: JSON.stringify({ type: Constants.ESEA_OCEANIA_RELEGATION_MATCH }),
        status: Constants.MatchStatus.COMPLETED,
      },
      include: { competitors: true },
    });
    const relegatedTeamId = [...(relegationMatch?.competitors || [])].sort(
      (a, b) => (a.score || 0) - (b.score || 0),
    )[0]?.teamId;

    if (relegatedTeamId != null) {
      regularSeasonCompetitors = [...regularSeasonCompetitors].sort(
        (a, b) => Number(a.teamId === relegatedTeamId) - Number(b.teamId === relegatedTeamId),
      );
    }
  }

  return [
    ...playoffCompetitors.map((competitor) => competitor.team),
    ...regularSeasonCompetitors.map((competitor) => competitor.team),
  ];
}

async function getTeamsFromCompetitionEntry(
  entry: Entry,
  federation: Prisma.FederationGetPayload<unknown>,
): Promise<Array<Team>> {
  const excludeCountryCodes = entry.excludeCountryCodes?.length
    ? new Set(entry.excludeCountryCodes)
    : null;
  const includeCountryCodes = entry.includeCountryCodes?.length
    ? new Set(entry.includeCountryCodes)
    : null;
  const countryFilter =
    includeCountryCodes || excludeCountryCodes
      ? {
          code: {
            ...(includeCountryCodes ? { in: [...includeCountryCodes] } : {}),
            ...(excludeCountryCodes ? { notIn: [...excludeCountryCodes] } : {}),
          },
        }
      : null;

  const profile = await DatabaseClient.prisma.profile.findFirst();
  const isWorldLeagueEntry = entry.from === Constants.LeagueSlug.ESPORTS_PRO_LEAGUE;
  const targetFederationSlug = (entry.federationSlug ||
    federation.slug) as Constants.FederationSlug;

  if (
    isWorldLeagueEntry &&
    entry.target === Constants.TierSlug.LEAGUE_PRO &&
    entry.season === -1 &&
    entry.federationSlug
  ) {
    return getRegionalWorldLeaguePlacements(entry, federation);
  }

  const competition = await DatabaseClient.prisma.competition.findFirst({
    where: {
      season: profile.season + (entry.season || 0),
      tier: {
        slug: entry.target,
        league: {
          slug: entry.from,
        },
      },
      ...(isWorldLeagueEntry
        ? {}
        : {
            federation: {
              slug: targetFederationSlug,
            },
          }),
    },
    include: {
      competitors: {
        orderBy: { position: 'asc' },
        include: {
          team: true,
        },
      },
    },
  });

  if (!competition) {
    return Promise.resolve([]);
  }

  if (isWorldLeagueEntry && entry.federationSlug) {
    const teamIds = competition.competitors.map((competitor) => competitor.teamId);
    const regionTeams = await DatabaseClient.prisma.team.findMany({
      where: {
        id: {
          in: teamIds,
        },
        ...buildCompetitionFederationWhere(entry.federationSlug, countryFilter),
      },
      select: {
        id: true,
      },
    });
    const regionTeamIds = new Set(regionTeams.map((team) => team.id));
    const regionCompetitors = competition.competitors.filter((competitor) =>
      regionTeamIds.has(competitor.teamId),
    );
    const slicedCompetitors = regionCompetitors.slice(
      entry.start < 0 ? entry.start : Math.max(0, entry.start - 1),
      entry.end || undefined,
    );
    return Promise.resolve(slicedCompetitors.map((competitor) => competitor.team));
  }

  let competitors = competition.competitors;

  // The selected regional competition is authoritative for federation eligibility.
  // Only world competitions need teams split by their competition federation.
  if (isWorldLeagueEntry || countryFilter) {
    const eligibleTeams = await DatabaseClient.prisma.team.findMany({
      where: {
        id: {
          in: competitors.map((competitor) => competitor.teamId),
        },
        ...(isWorldLeagueEntry
          ? buildCompetitionFederationWhere(targetFederationSlug, countryFilter)
          : { country: countryFilter ?? undefined }),
      },
      select: {
        id: true,
      },
    });
    const eligibleTeamIds = new Set(eligibleTeams.map((team) => team.id));
    competitors = competitors.filter((competitor) => eligibleTeamIds.has(competitor.teamId));
  }

  competitors = competitors.slice(
    entry.start < 0 ? entry.start : Math.max(0, entry.start - 1),
    entry.end || undefined,
  );
  return Promise.resolve(competitors.map((competitor) => competitor.team));
}

/**
 * Include only teams that meet the specific criteria.
 *
 * @param entry       The autofill entry.
 * @param federation  Federation database record.
 * @function
 */
async function handleIncludeAction(
  entry: Entry,
  federation: Prisma.FederationGetPayload<unknown>,
): Promise<Array<Team>> {
  return getTeamsFromCompetitionEntry(entry, federation);
}

/**
 * Do not consider teams that meet the criteria.
 *
 * @param entry The autofill entry.
 * @function
 */
async function handleExcludeAction(entry: Entry, federation: Prisma.FederationGetPayload<unknown>) {
  return getTeamsFromCompetitionEntry(entry, federation);
}

async function collectUniqueIncludeTeams(
  entries: Entry[],
  federation: Prisma.FederationGetPayload<unknown>,
) {
  const selected: Team[] = [];
  const selectedIds = new Set<number>();
  for (const entry of entries) {
    const requested = Math.max(0, Number(entry.end ?? entry.start) - Number(entry.start) + 1);
    if (!requested) continue;
    const pool = await handleIncludeAction({ ...entry, end: undefined }, federation);
    let claimed = 0;
    for (const team of pool) {
      if (selectedIds.has(team.id)) continue;
      selected.push(team);
      selectedIds.add(team.id);
      claimed += 1;
      if (claimed >= requested) break;
    }
  }
  return selected;
}

/**
 * An include action that is used to backfill the teams list.
 *
 * @param entry       The autofill entry.
 * @param tier        Tier database record.
 * @param federation  Federation database record.
 * @function
 */
async function handleFallbackAction(
  entry: Entry,
  tier: Prisma.TierGetPayload<typeof Eagers.tier>,
  federation: Prisma.FederationGetPayload<unknown>,
) {
  const excludeCountryCodes = entry.excludeCountryCodes?.length
    ? new Set(entry.excludeCountryCodes)
    : null;
  const includeCountryCodes = entry.includeCountryCodes?.length
    ? new Set(entry.includeCountryCodes)
    : null;
  const countryFilter =
    includeCountryCodes || excludeCountryCodes
      ? {
          code: {
            ...(includeCountryCodes ? { in: [...includeCountryCodes] } : {}),
            ...(excludeCountryCodes ? { notIn: [...excludeCountryCodes] } : {}),
          },
        }
      : null;
  const targetFederationSlug = (entry.federationSlug ||
    federation.slug) as Constants.FederationSlug;
  const regularLeagueTiers = new Set<Constants.TierSlug>([
    Constants.TierSlug.LEAGUE_OPEN,
    Constants.TierSlug.LEAGUE_INTERMEDIATE,
    Constants.TierSlug.LEAGUE_MAIN,
    Constants.TierSlug.LEAGUE_ADVANCED,
  ]);

  if (entry.target === Constants.TierSlug.BLAST_FINALS) {
    const teams = await getRankedTeamsByFederation(
      Constants.FederationSlug.ESPORTS_WORLD,
      countryFilter,
    );

    return sliceEntry(teams, entry);
  }

  if (
    entry.target === Constants.TierSlug.IEM_COLOGNE_OPEN_QUALIFIER ||
    entry.target === Constants.TierSlug.IEM_KRAKOW_OPEN_QUALIFIER
  ) {
    const autoInviteTeamIds = new Set((await getIemAutoInviteTeams()).map((team) => team.id));
    const teams = await getRankedTeamsByFederation(targetFederationSlug, countryFilter);
    return sliceEntry(
      teams.filter((team) => !autoInviteTeamIds.has(team.id)),
      entry,
    );
  }

  if (
    entry.target === Constants.TierSlug.IEM_COLOGNE_GROUP_A ||
    entry.target === Constants.TierSlug.IEM_COLOGNE_GROUP_B ||
    entry.target === Constants.TierSlug.IEM_KRAKOW_GROUP_A ||
    entry.target === Constants.TierSlug.IEM_KRAKOW_GROUP_B
  ) {
    const teams = await getIemFinalsPool(entry.target);
    return getBalancedIemGroupPool(teams, entry.target);
  }

  if (
    regularLeagueTiers.has(entry.target) &&
    tier.league.slug === Constants.LeagueSlug.ESPORTS_LEAGUE
  ) {
    const profile = await DatabaseClient.prisma.profile.findFirst();
    const previousPlacements = await getRegionalLeaguePlacements(
      entry.target,
      targetFederationSlug,
      profile.season - 1,
    );

    if (previousPlacements.length) {
      const occupiedCompetitions = await DatabaseClient.prisma.competition.findMany({
        where: {
          season: profile.season,
          federation: {
            slug: targetFederationSlug,
          },
          tier: {
            league: {
              slug: Constants.LeagueSlug.ESPORTS_LEAGUE,
            },
            slug: {
              in: [...regularLeagueTiers],
            },
          },
        },
        include: {
          competitors: true,
        },
      });
      const occupiedIds = new Set(
        flatten(
          occupiedCompetitions.map((competition) =>
            competition.competitors.map((competitor) => competitor.teamId),
          ),
        ),
      );

      return previousPlacements
        .filter((team) => !occupiedIds.has(team.id))
        .slice(Math.max(0, entry.start - 1), entry.end || undefined);
    }
  }

  if (entry.target === Constants.TierSlug.MAJOR_AMERICAS_OPEN_QUALIFIER_1) {
    const teams = await DatabaseClient.prisma.team.findMany({
      where: {
        ...buildCompetitionFederationWhere(
          Constants.FederationSlug.ESPORTS_AMERICAS,
          countryFilter,
        ),
      },
      orderBy: {
        elo: 'desc',
      },
    });

    const invitedIds = new Set(
      teams.filter((team) => team.parentTeamId == null).slice(0, 8).map((team) => team.id),
    );
    const qualifierPool = teams.filter((team) => !invitedIds.has(team.id));
    return qualifierPool.slice(Math.max(0, entry.start - 1), entry.end || undefined);
  }

  if (entry.target === Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_1) {
    const teams = await DatabaseClient.prisma.team.findMany({
      where: {
        ...buildCompetitionFederationWhere(Constants.FederationSlug.ESPORTS_EUROPA, countryFilter),
      },
      orderBy: {
        elo: 'desc',
      },
    });

    const invitedIds = new Set(
      teams.filter((team) => team.parentTeamId == null).slice(0, 16).map((team) => team.id),
    );
    const qualifierPool = teams.filter((team) => !invitedIds.has(team.id));
    return qualifierPool.slice(Math.max(0, entry.start - 1), entry.end || undefined);
  }

  if (entry.target === Constants.TierSlug.MAJOR_AMERICAS_RMR) {
    const teams = await getMajorDirectInvitePool(
      Constants.FederationSlug.ESPORTS_AMERICAS,
      Constants.TierSlug.MAJOR_AMERICAS_OPEN_QUALIFIER_1,
      8,
    );
    return teams.slice(Math.max(0, entry.start - 1), entry.end || undefined);
  }

  if (entry.target === Constants.TierSlug.MAJOR_EUROPE_RMR_A) {
    const teams = await getMajorDirectInvitePool(
      Constants.FederationSlug.ESPORTS_EUROPA,
      Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_1,
      16,
    );
    return teams
      .filter((_, idx) => idx % 2 === 0)
      .slice(Math.max(0, entry.start - 1), entry.end || undefined);
  }

  if (entry.target === Constants.TierSlug.MAJOR_EUROPE_RMR_B) {
    const teams = await getMajorDirectInvitePool(
      Constants.FederationSlug.ESPORTS_EUROPA,
      Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_1,
      16,
    );
    return teams
      .filter((_, idx) => idx % 2 === 1)
      .slice(Math.max(0, entry.start - 1), entry.end || undefined);
  }

  if (entry.target === Constants.TierSlug.LEAGUE_PRO) {
    const profile = await DatabaseClient.prisma.profile.findFirst();
    const occupied = await DatabaseClient.prisma.competition.findMany({
      where: {
        season: profile.season,
        tier: {
          league: {
            slug: {
              not: Constants.LeagueSlug.ESPORTS_PRO_LEAGUE,
            },
          },
        },
      },
      include: {
        competitors: true,
      },
    });
    const occupiedIds = new Set(
      flatten(occupied.map((competition) => competition.competitors.map((comp) => comp.teamId))),
    );

    const teams = await DatabaseClient.prisma.team.findMany({
      where: {
        prestige: Constants.Prestige.findIndex(
          (prestige) => prestige === Constants.TierSlug.LEAGUE_PRO,
        ),
        id: {
          notIn: [...occupiedIds],
        },
        ...buildCompetitionFederationWhere(targetFederationSlug, countryFilter),
      },
      orderBy: {
        prestige: 'desc',
      },
    });

    return teams.slice(Math.max(0, entry.start - 1), entry.end || undefined);
  }

  const teams = await DatabaseClient.prisma.team.findMany({
    where: {
      prestige: Constants.Prestige.findIndex((prestige) => prestige === entry.target),
      ...buildCompetitionFederationWhere(targetFederationSlug, countryFilter),
    },
  });

  if (!teams.length) {
    log.warn(
      'Could not backfill %s - %s. Found %d teams.',
      federation.name,
      tier.name,
      teams.length,
    );
  }

  return teams.slice(Math.max(0, entry.start - 1), entry.end || undefined);
}

/**
 * Parses the autofill syntax logic.
 *
 * @param item        The autofill item.
 * @param tier        Tier database record.
 * @param federation  Federation database record.
 * @function
 */
export async function parse(
  item: Item,
  tier: Prisma.TierGetPayload<typeof Eagers.tier>,
  federation: Prisma.FederationGetPayload<unknown>,
) {
  // RMR open qualifiers admit the whole eligible regional pool. Their seeded
  // tier sizes describe the old fixed fields, not a qualification cutoff.
  const tierSize = isMajorOpenQualifier(tier.slug)
    ? await DatabaseClient.prisma.team.count({
        where: buildCompetitionFederationWhere(
          federation.slug as Constants.FederationSlug,
        ),
      })
    : getTierSize(tier, federation.slug as Constants.FederationSlug);

  // fill competitors list using this autofill item's entries
  const competitors = [] as Array<Team>;
  const allowsCrossFederationEntries =
    item.tierSlug === Constants.TierSlug.MAJOR_ASIA_RMR &&
    federation.slug === Constants.FederationSlug.ESPORTS_ASIA;
  const entryMatchesFederation = (entry: Entry) =>
    allowsCrossFederationEntries ||
    federation.slug === Constants.FederationSlug.ESPORTS_WORLD ||
    !entry.federationSlug ||
    entry.federationSlug === federation.slug;
  const eligibleEntries = item.entries.filter(entryMatchesFederation);

  // collect competitors
  const includeEntries = eligibleEntries.filter((entry) => entry.action === Action.INCLUDE);
  const includeList =
    item.tierSlug === Constants.TierSlug.MAJOR_ASIA_RMR &&
    item.on === Constants.CalendarEntry.COMPETITION_START
      ? [await collectUniqueIncludeTeams(includeEntries, federation)]
      : await Promise.all(
          flatten(includeEntries.map((entry) => handleIncludeAction(entry, federation))),
        );

  // exclude undesirables
  const excludeList = await Promise.all(
    flatten(
      eligibleEntries
        .filter((entry) => entry.action === Action.EXCLUDE)
        .map((entry) => handleExcludeAction(entry, federation)),
    ),
  );

  let excludedCompetitors = flatten(excludeList);

  // Guardrail: a team can only be in one regular regional league division
  // (open/intermediate/main/advanced) per season + federation.
  const regularLeagueDivisionTiers = new Set([
    Constants.TierSlug.LEAGUE_OPEN,
    Constants.TierSlug.LEAGUE_INTERMEDIATE,
    Constants.TierSlug.LEAGUE_MAIN,
    Constants.TierSlug.LEAGUE_ADVANCED,
  ]);

  if (
    item.on === Constants.CalendarEntry.SEASON_START &&
    tier.league.slug === Constants.LeagueSlug.ESPORTS_LEAGUE &&
    federation.slug !== Constants.FederationSlug.ESPORTS_WORLD &&
    regularLeagueDivisionTiers.has(item.tierSlug)
  ) {
    const profile = await DatabaseClient.prisma.profile.findFirst();
    const occupied = await DatabaseClient.prisma.competition.findMany({
      where: {
        season: profile.season,
        federation: { slug: federation.slug },
        tier: {
          league: { slug: Constants.LeagueSlug.ESPORTS_LEAGUE },
          slug: {
            in: [...regularLeagueDivisionTiers],
          },
        },
      },
      include: {
        competitors: {
          include: {
            team: true,
          },
        },
      },
    });

    const occupiedTeams = flatten(
      occupied.map((competition) => competition.competitors.map((competitor) => competitor.team)),
    );

    excludedCompetitors = [...excludedCompetitors, ...occupiedTeams];
  }

  // create unique list of competitors by
  // filtering out the excludes
  competitors.push(...differenceBy(flatten(includeList), excludedCompetitors, 'id'));

  if (tier.league.slug === Constants.LeagueSlug.ESPORTS_LEAGUE) {
    const profile = await DatabaseClient.prisma.profile.findFirst();
    const eplCompetition = await DatabaseClient.prisma.competition.findFirst({
      where: {
        season: profile.season,
        tier: {
          league: {
            slug: Constants.LeagueSlug.ESPORTS_PRO_LEAGUE,
          },
        },
      },
      include: {
        competitors: {
          include: {
            team: true,
          },
        },
      },
    });

    // Keep EPL teams out of regional league divisions across the full
    // parse flow (initial includes + fallbacks + reserve backfill).
    if (eplCompetition) {
      excludedCompetitors = [
        ...excludedCompetitors,
        ...eplCompetition.competitors.map((competitor) => competitor.team),
      ];
      competitors.splice(
        0,
        competitors.length,
        ...competitors.filter(
          (team) => !eplCompetition.competitors.some((competitor) => competitor.teamId === team.id),
        ),
      );
    }
  }

  // if the required quota for the current tier is not met then
  // use the fallback entries to backfill the competitors list
  const quota = item.entries
    .filter(entryMatchesFederation)
    .filter((entry) => entry.action === Action.INCLUDE)
    .map((entry) =>
      entry.start < 0
        ? Math.abs(entry.start)
        : (entry.end || tierSize) - Math.max(0, entry.start - 1),
    )
    .reduce((a, b) => a + b, 0);

  const requiredCount =
    item.tierSlug === Constants.TierSlug.LEAGUE_PRO ? quota : Math.max(quota, tierSize);

  if (!requiredCount || competitors.length < requiredCount) {
    let fallbackList: Awaited<ReturnType<typeof handleIncludeAction>>;

    // use the standard include action logic if the
    // fallback entry contains a season property
    fallbackList = flatten(
      await Promise.all(
        eligibleEntries
          .filter((entry) => entry.action === Action.FALLBACK && 'season' in entry)
          .map((entry) => handleIncludeAction(entry, federation)),
      ),
    );

    // A season: 0 fallback is an explicit prior-stage source. Never reinterpret
    // it as a fresh ranking pool when the source has fewer teams than the
    // configured tier size (for example after academy exclusions).
    if (fallbackList.length < requiredCount - competitors.length) {
      const defaultFallback = flatten(
        await Promise.all(
          eligibleEntries
            .filter((entry) => entry.action === Action.FALLBACK && !('season' in entry))
            .map((entry) => handleFallbackAction(entry, tier, federation)),
        ),
      );
      fallbackList = [...fallbackList, ...defaultFallback];
    }

    competitors.push(...differenceBy(fallbackList, [...competitors, ...excludedCompetitors], 'id'));
  }

  // Last-resort anti-shrink backfill for regular league divisions.
  // If configured sources/fallbacks are exhausted, fill remaining slots
  // from any unassigned teams in the federation to preserve division size.
  if (
    item.on === Constants.CalendarEntry.SEASON_START &&
    tier.league.slug === Constants.LeagueSlug.ESPORTS_LEAGUE &&
    federation.slug !== Constants.FederationSlug.ESPORTS_WORLD &&
    regularLeagueDivisionTiers.has(item.tierSlug) &&
    competitors.length < tierSize
  ) {
    const reservePool = await DatabaseClient.prisma.team.findMany({
      where: {
        id: {
          notIn: [...new Set([...competitors, ...excludedCompetitors].map((team) => team.id))],
        },
        ...buildCompetitionFederationWhere(federation.slug as Constants.FederationSlug),
      },
      orderBy: {
        elo: 'desc',
      },
    });

    competitors.push(...reservePool.slice(0, tierSize - competitors.length));
  }

  const integrityField = await applyAcademyCompetitionIntegrity({
    teams: competitors,
    excludedTeams: excludedCompetitors,
    tier,
    federation,
    tierSize,
  });

  log.info('Autofilled %s - %s with %d teams', federation.name, tier.name, integrityField.length);

  // return our payload
  return Promise.resolve(integrityField);
}

/**
 * A parent can be seeded directly into a later stage after its academy was
 * already placed in an open qualifier. Reconcile the complete scheduled
 * tournament family once all season fields exist, always keeping the parent.
 */
export async function reconcileAcademyTournamentIntegrity(season: number) {
  const competitions = await DatabaseClient.prisma.competition.findMany({
    where: {
      season,
      status: Constants.CompetitionStatus.SCHEDULED,
      tier: { league: { slug: { not: Constants.LeagueSlug.ESPORTS_LEAGUE } } },
    },
    include: {
      federation: true,
      tier: { include: { league: true } },
      competitors: { include: { team: true } },
    },
  });
  const byLeague = new Map<number, typeof competitions>();
  for (const competition of competitions) {
    const family = byLeague.get(competition.tier.leagueId) ?? [];
    family.push(competition);
    byLeague.set(competition.tier.leagueId, family);
  }

  for (const family of byLeague.values()) {
    const familyTeamIds = new Set(
      family.flatMap((competition) =>
        competition.competitors.map((competitor) => competitor.teamId),
      ),
    );
    const academyEntries = family.flatMap((competition) =>
      competition.competitors
        .filter(
          (competitor) =>
            competitor.team.parentTeamId != null && familyTeamIds.has(competitor.team.parentTeamId),
        )
        .map((competitor) => ({ competition, competitor })),
    );

    for (const { competition, competitor } of academyEntries) {
      const stillPresent = await DatabaseClient.prisma.competitionToTeam.findUnique({
        where: { id: competitor.id },
        select: { id: true },
      });
      if (!stillPresent) continue;

      // The open qualifier already contains the complete eligible pool. A
      // ranked reserve here can only add a direct invite or an ineligible
      // parent, and was how a club appeared for the first time in OQ #4.
      if (isMajorOpenQualifier(competition.tier.slug)) {
        await DatabaseClient.prisma.competitionToTeam.delete({ where: { id: competitor.id } });
        familyTeamIds.delete(competitor.teamId);
        continue;
      }

      const occupiedIds = new Set(
        (
          await DatabaseClient.prisma.competitionToTeam.findMany({
            where: {
              competition: { season, tier: { leagueId: competition.tier.leagueId } },
            },
            select: { teamId: true },
          })
        ).map((entry) => entry.teamId),
      );
      const reserves = await DatabaseClient.prisma.team.findMany({
        where: {
          id: { notIn: [...occupiedIds] },
          ...buildCompetitionFederationWhere(
            competition.federation.slug as Constants.FederationSlug,
          ),
        },
        include: { parentTeam: true },
        orderBy: [{ elo: 'desc' }, { id: 'asc' }],
      });
      const replacement = reserves.find(
        (team) => !team.parentTeamId || !occupiedIds.has(team.parentTeamId),
      );
      if (!replacement) {
        log.warn(
          'Could not backfill academy integrity vacancy in %s - %s.',
          competition.federation.name,
          competition.tier.name,
        );
        continue;
      }

      await DatabaseClient.prisma.$transaction([
        DatabaseClient.prisma.competitionToTeam.delete({ where: { id: competitor.id } }),
        DatabaseClient.prisma.competitionToTeam.create({
          data: { competitionId: competition.id, teamId: replacement.id },
        }),
      ]);
      familyTeamIds.delete(competitor.teamId);
      familyTeamIds.add(replacement.id);
      log.info(
        'Academy integrity replaced %s with %s in %s.',
        competitor.team.name,
        replacement.name,
        competition.tier.name,
      );
    }
  }
}

async function applyAcademyCompetitionIntegrity(params: {
  teams: Team[];
  excludedTeams?: Team[];
  tier: Prisma.TierGetPayload<typeof Eagers.tier>;
  federation: Prisma.FederationGetPayload<unknown>;
  tierSize: number;
}) {
  const { tier, federation, tierSize } = params;
  // Autofill can intentionally build a tournament in stages (EPL is 16 at
  // season start + 16 at competition start), or return an empty future stage.
  // Integrity may replace an excluded academy one-for-one, but must never
  // expand this individual pass to the tier's full configured size.
  const fieldSize = getAcademyIntegrityFieldSize(tierSize, params.teams.length);
  if (fieldSize === 0) return [];
  const profile = await DatabaseClient.prisma.profile.findFirst({ select: { season: true } });
  const season = profile?.season ?? 0;
  const isRegionalLeague = tier.league.slug === Constants.LeagueSlug.ESPORTS_LEAGUE;
  const targetOrder = getLeagueTierOrder(tier.slug);
  const isOpenPlayoffs = tier.slug === Constants.TierSlug.LEAGUE_OPEN_PLAYOFFS;

  const existingCompetitions = await DatabaseClient.prisma.competition.findMany({
    where: {
      season,
      ...(isRegionalLeague
        ? {
            federation: { slug: federation.slug },
            tier: { league: { slug: Constants.LeagueSlug.ESPORTS_LEAGUE } },
          }
        : { tier: { leagueId: tier.leagueId } }),
    },
    select: {
      tier: { select: { slug: true } },
      competitors: { select: { teamId: true } },
    },
  });
  const occupiedIds = new Set<number>(
    existingCompetitions.flatMap((competition) =>
      competition.competitors.map((competitor) => competitor.teamId),
    ),
  );
  for (const team of params.excludedTeams ?? []) occupiedIds.add(team.id);

  // Tournament-specific invite exclusions must also constrain academy
  // replacements. Otherwise removing an academy can reintroduce a directly
  // invited top team (or a winner excluded from a later open qualifier).
  for (const teamId of await getOpenQualifierProtectedTeamIds(tier.slug)) {
    occupiedIds.add(teamId);
  }

  const parentPlacement = new Map<number, string>();
  for (const competition of existingCompetitions) {
    for (const competitor of competition.competitors) {
      parentPlacement.set(competitor.teamId, competition.tier.slug);
    }
  }

  const hydrate = async (teams: Team[]) => {
    if (!teams.length) return [];
    return DatabaseClient.prisma.team.findMany({
      where: { id: { in: teams.map((team) => team.id) } },
      include: { parentTeam: true },
    });
  };

  let candidateIds = new Set<number>();
  const canEnter = (
    team: Awaited<ReturnType<typeof hydrate>>[number],
    selectedIds: Set<number>,
  ) => {
    if (!team.parentTeamId || !team.parentTeam) return true;
    // EPL is the top division: an academy cannot enter it while its parent
    // remains at EPL or any lower tier.
    if (tier.slug === Constants.TierSlug.LEAGUE_PRO) return false;

    if (!isRegionalLeague) {
      return (
        !selectedIds.has(team.parentTeamId) &&
        !candidateIds.has(team.parentTeamId) &&
        !occupiedIds.has(team.parentTeamId)
      );
    }

    const parentTierSlug = parentPlacement.get(team.parentTeamId);
    if (isOpenPlayoffs) {
      return parentTierSlug !== Constants.TierSlug.LEAGUE_OPEN;
    }

    if (!isRegularLeagueTier(tier.slug)) return true;
    if (
      (selectedIds.has(team.parentTeamId) || candidateIds.has(team.parentTeamId)) &&
      targetOrder !== 0
    ) {
      return false;
    }
    const parentOrder =
      getLeagueTierOrder(parentTierSlug) ?? Number(team.parentTeam.tier ?? Number.MAX_SAFE_INTEGER);

    // Open is the one permitted shared division; its playoff rule above keeps
    // only the parent eligible for advancement.
    if (targetOrder === 0 && parentOrder === 0) return true;
    return parentOrder > Number(targetOrder);
  };

  const forcedIds = [...forcedAcademyDivision.entries()]
    .filter(
      ([key, value]) =>
        key.startsWith(`${season}:${federation.slug}:`) && value.targetOrder === targetOrder,
    )
    .map(([, value]) => value.academyId);
  const forcedTeams = forcedIds.length
    ? await DatabaseClient.prisma.team.findMany({
        where: { id: { in: forcedIds } },
        include: { parentTeam: true },
      })
    : [];
  const hydratedCandidates = await hydrate(params.teams);
  const hydratedById = new Map(hydratedCandidates.map((team) => [team.id, team]));
  // Preserve the autofill qualification/standings order so an excluded
  // academy passes its slot to the next team in line, not an arbitrary club.
  const qualifiedOrder = params.teams.flatMap((team) => {
    const hydrated = hydratedById.get(team.id);
    return hydrated ? [hydrated] : [];
  });
  const ordered = [
    ...forcedTeams,
    ...qualifiedOrder.filter((team) => !forcedIds.includes(team.id)),
  ];
  candidateIds = new Set(ordered.map((team) => team.id));
  const selected: typeof ordered = [];
  const selectedIds = new Set<number>();
  for (const team of ordered) {
    if (selected.length >= fieldSize) break;
    if (selectedIds.has(team.id)) continue;
    if (canEnter(team, selectedIds)) {
      selected.push(team);
      selectedIds.add(team.id);
      forcedAcademyDivision.delete(academyDivisionKey(season, federation.slug, team.id));
    } else {
      log.info('Academy integrity excluded %s from %s', team.name, tier.name);
      if (team.parentTeamId && targetOrder != null && targetOrder > 0) {
        forcedAcademyDivision.set(academyDivisionKey(season, federation.slug, team.id), {
          academyId: team.id,
          targetOrder: targetOrder - 1,
        });
      }
    }
  }

  if (selected.length >= fieldSize || !isRegionalLeague) {
    // A cup's field is defined by its qualifying entries. An arbitrary high
    // Elo reserve can bring an EPL club into Cash Cup or displace a genuine
    // CCT/Challenger qualifier. Keep only qualified teams here.
    return selected.slice(0, fieldSize);
  }

  const reserveCountryFilter = [
    Constants.TierSlug.MAJOR_ASIA_OPEN_QUALIFIER_1,
    Constants.TierSlug.MAJOR_ASIA_OPEN_QUALIFIER_2,
  ].includes(tier.slug as Constants.TierSlug)
    ? { code: { not: 'CN' } }
    : [
          Constants.TierSlug.MAJOR_CHINA_OPEN_QUALIFIER_1,
          Constants.TierSlug.MAJOR_CHINA_OPEN_QUALIFIER_2,
        ].includes(tier.slug as Constants.TierSlug)
      ? { code: 'CN' }
      : undefined;
  const reserves = await DatabaseClient.prisma.team.findMany({
    where: {
      id: { notIn: [...new Set([...selectedIds, ...occupiedIds])] },
      ...buildCompetitionFederationWhere(
        federation.slug as Constants.FederationSlug,
        reserveCountryFilter,
      ),
    },
    orderBy: [{ elo: 'desc' }, { id: 'asc' }],
    include: { parentTeam: true },
  });

  for (const team of reserves) {
    if (selected.length >= fieldSize) break;
    if (!canEnter(team, selectedIds)) continue;
    selected.push(team);
    selectedIds.add(team.id);
  }

  return selected.slice(0, fieldSize);
}
