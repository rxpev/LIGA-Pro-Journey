/**
 * Dynamically populates any given competition's series
 * with teams depending on the criteria provided
 * in the autofill protocol schema.
 *
 * @module
 */
import log from 'electron-log';
import DatabaseClient from './database-client';
import { differenceBy, flatten, xorBy } from 'lodash';
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
      // ESL Pro League: retain top 16
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_PRO_LEAGUE,
        target: Constants.TierSlug.LEAGUE_PRO,
        start: 1,
        end: 16,
        season: -1,
      },
      // First-season fallback: seed by top ELO per federation
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
      // EPL: bottom 16 drop back to advanced (by federation)
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_PRO_LEAGUE,
        target: Constants.TierSlug.LEAGUE_PRO,
        federationSlug: Constants.FederationSlug.ESPORTS_EUROPA,
        start: 17,
        end: 32,
        season: -1,
      },
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_PRO_LEAGUE,
        target: Constants.TierSlug.LEAGUE_PRO,
        federationSlug: Constants.FederationSlug.ESPORTS_AMERICAS,
        start: 17,
        end: 32,
        season: -1,
      },
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_PRO_LEAGUE,
        target: Constants.TierSlug.LEAGUE_PRO,
        federationSlug: Constants.FederationSlug.ESPORTS_ASIA,
        start: 17,
        end: 32,
        season: -1,
      },
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_PRO_LEAGUE,
        target: Constants.TierSlug.LEAGUE_PRO,
        federationSlug: Constants.FederationSlug.ESPORTS_OCE,
        start: 17,
        end: 32,
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
    tierSlug: Constants.TierSlug.ESWC_CHALLENGERS,
    on: Constants.CalendarEntry.SEASON_START,
    entries: [
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_ADVANCED,
        federationSlug: Constants.FederationSlug.ESPORTS_AMERICAS,
        start: 9,
        end: 12,
        season: -1,
      },
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_ADVANCED,
        federationSlug: Constants.FederationSlug.ESPORTS_ASIA,
        start: 9,
        end: 12,
        season: -1,
      },
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_ADVANCED,
        federationSlug: Constants.FederationSlug.ESPORTS_EUROPA,
        start: 9,
        end: 12,
        season: -1,
      },
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_ADVANCED,
        federationSlug: Constants.FederationSlug.ESPORTS_OCE,
        start: 9,
        end: 12,
        season: -1,
      },
      {
        action: Action.FALLBACK,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_ADVANCED,
        federationSlug: Constants.FederationSlug.ESPORTS_AMERICAS,
        start: 9,
        end: 12,
      },
      {
        action: Action.FALLBACK,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_ADVANCED,
        federationSlug: Constants.FederationSlug.ESPORTS_ASIA,
        start: 9,
        end: 12,
      },
      {
        action: Action.FALLBACK,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_ADVANCED,
        federationSlug: Constants.FederationSlug.ESPORTS_EUROPA,
        start: 9,
        end: 12,
      },
      {
        action: Action.FALLBACK,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_ADVANCED,
        federationSlug: Constants.FederationSlug.ESPORTS_OCE,
        start: 9,
        end: 12,
      },
    ],
  },
  {
    tierSlug: Constants.TierSlug.ESWC_LEGENDS,
    on: Constants.CalendarEntry.SEASON_START,
    entries: [
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_ADVANCED,
        federationSlug: Constants.FederationSlug.ESPORTS_AMERICAS,
        start: 5,
        end: 8,
        season: -1,
      },
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_ADVANCED,
        federationSlug: Constants.FederationSlug.ESPORTS_ASIA,
        start: 5,
        end: 8,
        season: -1,
      },
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_ADVANCED,
        federationSlug: Constants.FederationSlug.ESPORTS_EUROPA,
        start: 5,
        end: 8,
        season: -1,
      },
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_ADVANCED,
        federationSlug: Constants.FederationSlug.ESPORTS_OCE,
        start: 5,
        end: 8,
        season: -1,
      },
      {
        action: Action.FALLBACK,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_ADVANCED,
        federationSlug: Constants.FederationSlug.ESPORTS_AMERICAS,
        start: 5,
        end: 8,
      },
      {
        action: Action.FALLBACK,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_ADVANCED,
        federationSlug: Constants.FederationSlug.ESPORTS_ASIA,
        start: 5,
        end: 8,
      },
      {
        action: Action.FALLBACK,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_ADVANCED,
        federationSlug: Constants.FederationSlug.ESPORTS_EUROPA,
        start: 5,
        end: 8,
      },
      {
        action: Action.FALLBACK,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_ADVANCED,
        federationSlug: Constants.FederationSlug.ESPORTS_OCE,
        start: 5,
        end: 8,
      },
    ],
  },
  {
    tierSlug: Constants.TierSlug.ESWC_LEGENDS,
    on: Constants.CalendarEntry.COMPETITION_START,
    entries: [
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_WORLD_CUP,
        target: Constants.TierSlug.ESWC_CHALLENGERS,
        start: 0,
        end: 8,
        season: 0,
      },
    ],
  },
  {
    tierSlug: Constants.TierSlug.ESWC_CHAMPIONS,
    on: Constants.CalendarEntry.SEASON_START,
    entries: [
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_ADVANCED,
        federationSlug: Constants.FederationSlug.ESPORTS_AMERICAS,
        start: 0,
        end: 4,
        season: -1,
      },
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_ADVANCED,
        federationSlug: Constants.FederationSlug.ESPORTS_ASIA,
        start: 0,
        end: 4,
        season: -1,
      },
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_ADVANCED,
        federationSlug: Constants.FederationSlug.ESPORTS_EUROPA,
        start: 0,
        end: 4,
        season: -1,
      },
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_ADVANCED,
        federationSlug: Constants.FederationSlug.ESPORTS_OCE,
        start: 0,
        end: 4,
        season: -1,
      },
      {
        action: Action.FALLBACK,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_ADVANCED,
        federationSlug: Constants.FederationSlug.ESPORTS_AMERICAS,
        start: 0,
        end: 4,
      },
      {
        action: Action.FALLBACK,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_ADVANCED,
        federationSlug: Constants.FederationSlug.ESPORTS_ASIA,
        start: 0,
        end: 4,
      },
      {
        action: Action.FALLBACK,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_ADVANCED,
        federationSlug: Constants.FederationSlug.ESPORTS_EUROPA,
        start: 0,
        end: 4,
      },
      {
        action: Action.FALLBACK,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_ADVANCED,
        federationSlug: Constants.FederationSlug.ESPORTS_OCE,
        start: 0,
        end: 4,
      },
    ],
  },
  {
    tierSlug: Constants.TierSlug.ESWC_CHAMPIONS,
    on: Constants.CalendarEntry.COMPETITION_START,
    entries: [
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_WORLD_CUP,
        target: Constants.TierSlug.ESWC_LEGENDS,
        start: 0,
        end: 8,
        season: 0,
      },
    ],
  },
  {
    tierSlug: Constants.TierSlug.ESWC_PLAYOFFS,
    on: Constants.CalendarEntry.SEASON_START,
    entries: [],
  },
  {
    tierSlug: Constants.TierSlug.ESWC_PLAYOFFS,
    on: Constants.CalendarEntry.COMPETITION_START,
    entries: [
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_WORLD_CUP,
        target: Constants.TierSlug.ESWC_CHAMPIONS,
        start: 0,
        end: 8,
        season: 0,
      },
    ],
  },
];

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
  const profile = await DatabaseClient.prisma.profile.findFirst();
  const isWorldLeagueEntry = entry.from === Constants.LeagueSlug.ESPORTS_PRO_LEAGUE;
  const competition = await DatabaseClient.prisma.competition.findFirst({
    where: {
      season: profile.season + entry.season,
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
            slug: entry.federationSlug || federation.slug,
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

  const competitors = competition.competitors.slice(
    entry.start < 0 ? entry.start : Math.max(0, entry.start - 1),
    entry.end || undefined,
  );

  if (isWorldLeagueEntry && entry.federationSlug) {
    const teamIds = competitors.map((competitor) => competitor.teamId);
    const regionTeams = await DatabaseClient.prisma.team.findMany({
      where: {
        id: {
          in: teamIds,
        },
        country: {
          continent: {
            federation: {
              slug: entry.federationSlug,
            },
          },
        },
      },
      select: {
        id: true,
      },
    });
    const regionTeamIds = new Set(regionTeams.map((team) => team.id));
    return Promise.resolve(
      competitors.filter((competitor) => regionTeamIds.has(competitor.teamId)).map((c) => c.team),
    );
  }

  return Promise.resolve(competitors.map((competitor) => competitor.team));
}

/**
 * Do not consider teams that meet the criteria.
 *
 * @param entry The autofill entry.
 * @function
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function handleExcludeAction(entry: Entry) {
  // e.g.: ignore top 3 of last season's major
  return Promise.resolve([]);
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
        id: {
          notIn: [...occupiedIds],
        },
        country: {
          continent: {
            federation: {
              slug: entry.federationSlug || federation.slug,
            },
          },
        },
      },
      orderBy: {
        elo: 'desc',
      },
    });

    return teams.slice(Math.max(0, entry.start - 1), entry.end || undefined);
  }

  const teams = await DatabaseClient.prisma.team.findMany({
    where: {
      prestige: Constants.Prestige.findIndex((prestige) => prestige === entry.target),
      country: {
        continent: {
          federation: {
            slug: entry.federationSlug || federation.slug,
          },
        },
      },
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
  const entryMatchesFederation = (entry: Entry) =>
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
      eligibleEntries.filter((entry) => entry.action === Action.EXCLUDE).map(handleExcludeAction),
    ),
  );

  // create unique list of competitors by
  // filtering out the excludes
  competitors.push(...xorBy(flatten(includeList), flatten(excludeList), 'id'));

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
        competitors: true,
      },
    });

    if (eplCompetition) {
      const eplTeamIds = new Set(eplCompetition.competitors.map((competitor) => competitor.teamId));
      for (let idx = competitors.length - 1; idx >= 0; idx -= 1) {
        if (eplTeamIds.has(competitors[idx].id)) {
          competitors.splice(idx, 1);
        }
      }
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

    competitors.push(...differenceBy(fallbackList, competitors, 'id'));
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
