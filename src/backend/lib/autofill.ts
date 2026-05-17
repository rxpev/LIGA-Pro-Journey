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
      // OCE: 9th thru 13th advanced stay advanced
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_ADVANCED,
        federationSlug: Constants.FederationSlug.ESPORTS_OCE,
        start: 9,
        end: 13,
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
          end: 4,
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
        end: 102,
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
        end: 102,
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
    entries: [],
  },
  {
    tierSlug: Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_1,
    on: Constants.CalendarEntry.COMPETITION_START,
    entries: [
      {
        action: Action.FALLBACK,
        from: Constants.LeagueSlug.ESPORTS_MAJOR,
        target: Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_1,
        federationSlug: Constants.FederationSlug.ESPORTS_EUROPA,
        start: 1,
        end: 94,
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
        end: 94,
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
        end: 94,
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
        end: 94,
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
      return teams.slice(0, count);
    }),
  );

  return uniqueTeams(flatten(regionalTeams));
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
      return teams.filter((team) => !qualifierTeamIds.has(team.id)).slice(0, count);
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

  return [
    ...playoffCompetitors.map((competitor) => competitor.team),
    ...regularSeasonCompetition.competitors
      .filter((competitor) => !playoffTeamIds.has(competitor.teamId))
      .map((competitor) => competitor.team),
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
  const federationFilteredTeams = await DatabaseClient.prisma.team.findMany({
    where: {
      id: {
        in: competitors.map((competitor) => competitor.teamId),
      },
      ...buildCompetitionFederationWhere(targetFederationSlug, countryFilter),
    },
    select: {
      id: true,
    },
  });
  const federationIncludedIds = new Set(federationFilteredTeams.map((team) => team.id));
  competitors = competitors.filter((competitor) => federationIncludedIds.has(competitor.teamId));

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

    const qualifierPool = teams.slice(8);
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

    const qualifierPool = teams.slice(16);
    return qualifierPool.slice(Math.max(0, entry.start - 1), entry.end || undefined);
  }

  if (entry.target === Constants.TierSlug.MAJOR_AMERICAS_RMR) {
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

    return teams.slice(Math.max(0, entry.start - 1), entry.end || undefined);
  }

  if (entry.target === Constants.TierSlug.MAJOR_EUROPE_RMR_A) {
    const teams = await DatabaseClient.prisma.team.findMany({
      where: {
        ...buildCompetitionFederationWhere(Constants.FederationSlug.ESPORTS_EUROPA, countryFilter),
      },
      orderBy: {
        elo: 'desc',
      },
    });

    return teams
      .filter((_, idx) => idx % 2 === 0)
      .slice(Math.max(0, entry.start - 1), entry.end || undefined);
  }

  if (entry.target === Constants.TierSlug.MAJOR_EUROPE_RMR_B) {
    const teams = await DatabaseClient.prisma.team.findMany({
      where: {
        ...buildCompetitionFederationWhere(Constants.FederationSlug.ESPORTS_EUROPA, countryFilter),
      },
      orderBy: {
        elo: 'desc',
      },
    });

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
  const tierSize =
    tier.league.slug === Constants.LeagueSlug.ESPORTS_LEAGUE
      ? Util.getLeagueTierSize(
          tier.slug as Constants.TierSlug,
          federation.slug as Constants.FederationSlug,
          tier.size,
        )
      : tier.size;

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
  const includeList = await Promise.all(
    flatten(
      eligibleEntries
        .filter((entry) => entry.action === Action.INCLUDE)
        .map((entry) => handleIncludeAction(entry, federation)),
    ),
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

    // if that still doesn't meet the quota, then use the default fallback
    if (!fallbackList.length || fallbackList.length < requiredCount - competitors.length) {
      fallbackList = flatten(
        await Promise.all(
          eligibleEntries
            .filter((entry) => entry.action === Action.FALLBACK && !entry.season)
            .map((entry) => handleFallbackAction(entry, tier, federation)),
        ),
      );
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

  log.info(
    'Autofilled %s - %s with %d teams',
    federation.name,
    tier.name,
    competitors.slice(0, tierSize).length,
  );

  // return our payload
  return Promise.resolve(competitors.slice(0, tierSize));
}
