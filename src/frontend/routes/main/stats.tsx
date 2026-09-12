/**
 * League match stats concept route.
 *
 * @module
 */
import React from 'react';
import { createPortal } from 'react-dom';
import { groupBy } from 'lodash';
import { differenceInCalendarDays, format, subMonths } from 'date-fns';
import { Constants, Eagers, Util } from '@liga/shared';
import { cx } from '@liga/frontend/lib';
import { AppStateContext } from '@liga/frontend/redux';
import { Pagination } from '@liga/frontend/components';
import { useFormatAppDate } from '@liga/frontend/hooks/use-FormatAppDate';
import {
  FaChartBar,
  FaChevronLeft,
  FaChevronRight,
  FaCrosshairs,
  FaExternalLinkAlt,
  FaMap,
  FaSkull,
  FaTrophy,
} from 'react-icons/fa';
import { GiCrossedSwords } from 'react-icons/gi';
import { Link, useLocation } from 'react-router-dom';
import CompetitionLocationTag from './competitions/competition-location-tag';

declare const require: {
  context: (
    path: string,
    recursive: boolean,
    regExp: RegExp,
  ) => {
    (id: string): string;
    keys(): string[];
  };
};

type MatchRecord = any;

const weaponAssetContext = require.context('@liga/frontend/assets/weapons/3D', false, /\.png$/);

type CareerStintRecord = {
  teamId: number;
  startedAt: Date | string;
  endedAt: Date | string | null;
  team: {
    id: number;
    name: string;
    blazon?: string;
  };
};

type MatchPerformance = {
  match: MatchRecord;
  kills: number;
  deaths: number;
  maps: number;
  plusMinus: number;
  rating: number;
};

type StatsPlayerOption = {
  id: number;
  name: string;
  avatar?: string;
  country?: {
    code: string;
    name: string;
  };
  team?: {
    id: number;
    name: string;
    blazon?: string;
    tier?: number | null;
  } | null;
  rating?: number;
  kills?: number;
  deaths?: number;
  assists?: number;
  maps?: number;
};

type StatsRouteState = {
  playerId?: number;
  tab?: 'GLOBAL_PLAYERS';
};

type WeaponPerformance = {
  weapon: string;
  label: string;
  image?: string;
  kills: number;
  headshots: number;
  hsPercent: number;
};

type CareerHonor = {
  competitionId: number;
  federationId: number;
  tierId: number;
  season: number;
  key: string;
  title: string;
  tierSlug: string;
  federationSlug: string;
  location: string | null;
  organizer: string | null;
};

type CareerHonorsTooltip = {
  content: string;
  left: number;
  top: number;
};

type CompetitionGroupKey =
  | 'MAJOR'
  | 'ESL_PRO_LEAGUE'
  | 'ESEA_ADVANCED'
  | 'ESEA_MAIN'
  | 'ESEA_INTERMEDIATE'
  | 'ESEA_OPEN'
  | 'CCT_SERIES'
  | 'CCT_OCEANIA_SERIES'
  | 'ESL_CHALLENGER'
  | 'CCT_GLOBAL_FINALS'
  | 'BLAST_FINALS'
  | 'IEM_COLOGNE'
  | 'IEM_COLOGNE_QUALIFIERS'
  | 'IEM_KRAKOW'
  | 'IEM_KRAKOW_QUALIFIERS'
  | 'RMR_EUROPE'
  | 'RMR_QUALIFIERS_EUROPE'
  | 'RMR_QUALIFIERS_AMERICAS'
  | 'RMR_QUALIFIERS_ASIA'
  | 'RMR_QUALIFIERS_CHINA'
  | 'RMR_QUALIFIERS_OCEANIA';

type TimeframeOption = '' | '6' | '3' | '1';
type MatchTypeOption = '' | 'LAN' | 'ONLINE';
type CompetitionStageOption = '' | 'GROUP_STAGE' | 'PLAYOFFS';

const CompetitionGroupLabels: Record<CompetitionGroupKey, string> = {
  MAJOR: 'Major (Challengers + Legends + Champions)',
  ESL_PRO_LEAGUE: 'ESL Pro League (Groups + Playoffs)',
  ESEA_ADVANCED: 'ESEA Advanced (Groups + Playoffs)',
  ESEA_MAIN: 'ESEA Main (Groups + Playoffs)',
  ESEA_INTERMEDIATE: 'ESEA Intermediate (Groups + Playoffs)',
  ESEA_OPEN: 'ESEA Open (Groups + Playoffs)',
  CCT_SERIES: 'CCT Series (Groups + Playoffs)',
  CCT_OCEANIA_SERIES: 'CCT Oceania Series (Groups + Playoffs)',
  ESL_CHALLENGER: 'ESL Challenger (Groups + Playoffs)',
  CCT_GLOBAL_FINALS: 'CCT Global Finals',
  BLAST_FINALS: 'BLAST Finals',
  IEM_COLOGNE: 'IEM Cologne (Groups + Playoffs)',
  IEM_COLOGNE_QUALIFIERS: 'IEM Cologne Qualifiers',
  IEM_KRAKOW: 'IEM Krakow (Groups + Playoffs)',
  IEM_KRAKOW_QUALIFIERS: 'IEM Krakow Qualifiers',
  RMR_EUROPE: 'RMR (Europe A + B)',
  RMR_QUALIFIERS_EUROPE: 'RMR Qualifiers (Europe)',
  RMR_QUALIFIERS_AMERICAS: 'RMR Qualifiers (Americas)',
  RMR_QUALIFIERS_ASIA: 'RMR Qualifiers (Asia)',
  RMR_QUALIFIERS_CHINA: 'RMR Qualifiers (China)',
  RMR_QUALIFIERS_OCEANIA: 'RMR Qualifiers (Oceania)',
};

const CompetitionGroupOrder: CompetitionGroupKey[] = [
  'MAJOR',
  'ESL_PRO_LEAGUE',
  'ESEA_ADVANCED',
  'ESEA_MAIN',
  'ESEA_INTERMEDIATE',
  'ESEA_OPEN',
  'CCT_SERIES',
  'CCT_OCEANIA_SERIES',
  'ESL_CHALLENGER',
  'CCT_GLOBAL_FINALS',
  'BLAST_FINALS',
  'IEM_COLOGNE',
  'IEM_COLOGNE_QUALIFIERS',
  'IEM_KRAKOW',
  'IEM_KRAKOW_QUALIFIERS',
  'RMR_EUROPE',
  'RMR_QUALIFIERS_EUROPE',
  'RMR_QUALIFIERS_AMERICAS',
  'RMR_QUALIFIERS_ASIA',
  'RMR_QUALIFIERS_CHINA',
  'RMR_QUALIFIERS_OCEANIA',
];

const TimeframeLabels: Record<TimeframeOption, string> = {
  '': 'All time',
  '6': 'Last 6 months',
  '3': 'Last 3 months',
  '1': 'Last month',
};

const TimeframeOptions: TimeframeOption[] = ['', '6', '3', '1'];

const MatchTypeLabels: Record<MatchTypeOption, string> = {
  '': 'Any',
  LAN: 'LAN',
  ONLINE: 'Online',
};

const MatchTypeOptions: MatchTypeOption[] = ['', 'LAN', 'ONLINE'];

const CompetitionStageLabels: Record<CompetitionStageOption, string> = {
  '': 'Any',
  GROUP_STAGE: 'Group Stage',
  PLAYOFFS: 'Playoffs',
};

const CompetitionStageOptions: CompetitionStageOption[] = ['', 'GROUP_STAGE', 'PLAYOFFS'];

const GlobalPlayerPageSize = 19;
const MatchHistoryPageSize = 9;
const IndividualMatchHistoryPageSize = 10;
const TeammateMatchHistoryPageSize = 5;
const TeammatePageSize = 6;
const WeaponPageSize = 5;
const TeammateWeaponPageSize = 3;

enum Rating {
  LOW = 0.95,
  HIGH = 1.05,
}

const PlayoffStageTierSlugs = new Set<string>([
  Constants.TierSlug.MAJOR_CHAMPIONS_STAGE,
  Constants.TierSlug.IEM_COLOGNE_PLAYOFFS,
  Constants.TierSlug.IEM_KRAKOW_PLAYOFFS,
  Constants.TierSlug.LEAGUE_OPEN_PLAYOFFS,
  Constants.TierSlug.LEAGUE_INTERMEDIATE_PLAYOFFS,
  Constants.TierSlug.LEAGUE_MAIN_PLAYOFFS,
  Constants.TierSlug.LEAGUE_ADVANCED_PLAYOFFS,
  Constants.TierSlug.CCT_SERIES_PLAYOFFS,
  Constants.TierSlug.CCT_OCE_PLAYOFFS,
  Constants.TierSlug.CCT_GLOBAL_FINALS,
  Constants.TierSlug.LEAGUE_PRO_PLAYOFFS,
  Constants.TierSlug.BLAST_FINALS,
  Constants.TierSlug.ESL_CHALLENGER_PLAYOFFS,
]);

const GroupStageTierSlugs = new Set<string>([
  Constants.TierSlug.MAJOR_CHALLENGERS_STAGE,
  Constants.TierSlug.MAJOR_LEGENDS_STAGE,
  Constants.TierSlug.IEM_COLOGNE_GROUP_A,
  Constants.TierSlug.IEM_COLOGNE_GROUP_B,
  Constants.TierSlug.IEM_KRAKOW_GROUP_A,
  Constants.TierSlug.IEM_KRAKOW_GROUP_B,
  Constants.TierSlug.LEAGUE_OPEN,
  Constants.TierSlug.LEAGUE_INTERMEDIATE,
  Constants.TierSlug.LEAGUE_MAIN,
  Constants.TierSlug.LEAGUE_ADVANCED,
  Constants.TierSlug.CCT_SERIES,
  Constants.TierSlug.CCT_OCE_SERIES,
  Constants.TierSlug.LEAGUE_PRO,
  Constants.TierSlug.ESL_CHALLENGER,
]);

enum StatsTab {
  INDIVIDUAL = 'INDIVIDUAL',
  TOURNAMENTS = 'TOURNAMENTS',
  TEAMMATES = 'TEAMMATES',
  GLOBAL_PLAYERS = 'GLOBAL_PLAYERS',
}

enum StatsDetailView {
  MATCH_HISTORY = 'MATCH_HISTORY',
  EVENTS = 'EVENTS',
  WEAPONS = 'WEAPONS',
}

function getRatingColorClass(rating: number) {
  if (rating <= Rating.LOW) {
    return 'text-error';
  }

  if (rating >= Rating.HIGH) {
    return 'text-success';
  }

  return 'text-inherit';
}

function isLeagueMatch(match: MatchRecord) {
  return match.matchType !== 'FACEIT_PUG' && !!match.competition?.tier;
}

function isWithinStint(date: Date, startedAt: Date | string, endedAt: Date | string | null) {
  const start = new Date(startedAt);
  start.setHours(0, 0, 0, 0);

  const end = endedAt ? new Date(endedAt) : null;
  if (end) {
    end.setHours(23, 59, 59, 999);
  }

  return start <= date && (!end || end >= date);
}

function stintsOverlap(
  leftStart: Date | string,
  leftEnd: Date | string | null,
  rightStart: Date | string,
  rightEnd: Date | string | null,
) {
  const startA = new Date(leftStart).getTime();
  const endA = leftEnd ? new Date(leftEnd).getTime() : Number.MAX_SAFE_INTEGER;
  const startB = new Date(rightStart).getTime();
  const endB = rightEnd ? new Date(rightEnd).getTime() : Number.MAX_SAFE_INTEGER;
  return startA <= endB && startB <= endA;
}

function getCompetitionLabel(match: MatchRecord) {
  const tierSlug = match.competition?.tier?.slug;
  const hostedEventLabel = Util.getHostedEventDisplayName(tierSlug, match.competition?.location);

  if (hostedEventLabel) {
    return hostedEventLabel;
  }

  if (Util.isMajorStageTier(tierSlug)) {
    return Util.getMajorMatchDisplayName(
      tierSlug,
      match.competition?.location,
      match.competition?.organizer,
    );
  }

  const federation = match.competition?.federation?.name || 'Unknown';
  const tier = tierSlug ? Constants.IdiomaticTier[tierSlug] : 'Competition';

  return `${federation} ${tier}`.trim();
}

function getEventPlacementLabel(position?: number | null, tierSlug?: Constants.TierSlug): string {
  if (!position) return '-';
  const distribution = tierSlug ? Constants.PrizePool[tierSlug]?.distribution || [] : [];
  const prizeShare = distribution[position - 1];
  if (prizeShare !== undefined) {
    let start = position;
    let end = position;
    while (start > 1 && distribution[start - 2] === prizeShare) start -= 1;
    while (end < distribution.length && distribution[end] === prizeShare) end += 1;
    if (start !== end) return `${Util.toOrdinalSuffix(start)}-${Util.toOrdinalSuffix(end)}`;
  }
  return Util.toOrdinalSuffix(position);
}

function formatPlacementRange(start: number, end: number) {
  return start === end
    ? Util.toOrdinalSuffix(start)
    : `${Util.toOrdinalSuffix(start)}-${Util.toOrdinalSuffix(end)}`;
}

function getTierDisplayLabel(tierSlug?: string | null) {
  if (tierSlug === Constants.TierSlug.LEAGUE_PRO) {
    return 'ESL Pro League';
  }

  if (tierSlug === Constants.TierSlug.LEAGUE_PRO_PLAYOFFS) {
    return 'ESL Pro League Playoffs';
  }

  return tierSlug ? Constants.IdiomaticTier[tierSlug] : 'Competition';
}

function getOfficialCompetitionTitle(competition: any) {
  const year = competition.season ? 2025 + competition.season : null;
  const city = Util.getCompetitionHostingLocationCity(competition.location);

  if (Util.isMajorStageTier(competition.tier.slug)) {
    return [Util.getMajorEventDisplayName(competition.location, competition.organizer), year]
      .filter(Boolean)
      .join(' ');
  }

  if (competition.tier.slug === Constants.TierSlug.BLAST_FINALS) {
    return ['BLAST Finals', city, year].filter(Boolean).join(' ');
  }

  if (competition.tier.slug === Constants.TierSlug.IEM_COLOGNE_PLAYOFFS) {
    return ['IEM Cologne', year].filter(Boolean).join(' ');
  }

  if (competition.tier.slug === Constants.TierSlug.IEM_KRAKOW_PLAYOFFS) {
    return ['IEM Krakow', year].filter(Boolean).join(' ');
  }

  if (competition.tier.slug === Constants.TierSlug.LEAGUE_PRO_PLAYOFFS) {
    return ['ESL Pro League', city, year].filter(Boolean).join(' ');
  }

  const displayName = Util.getCompetitionDisplayName(
    competition.tier.league.name,
    competition.tier.slug,
  ).replace(/\s+Playoffs$/i, '');
  const federationSlug = competition.federation.slug;
  const region =
    federationSlug === Constants.FederationSlug.ESPORTS_OCE
      ? 'Oceania'
      : federationSlug === Constants.FederationSlug.ESPORTS_ASIA
        ? 'Asia'
        : federationSlug === Constants.FederationSlug.ESPORTS_AMERICAS
          ? 'Americas'
          : federationSlug === Constants.FederationSlug.ESPORTS_EUROPA
            ? 'Europe'
            : city;

  return [displayName, region, year].filter(Boolean).join(' ');
}

function getStatisticsEventGroup(competition: any) {
  const tierSlug = competition?.tier?.slug as Constants.TierSlug | undefined;
  const majorStage = tierSlug && Util.isMajorStageTier(tierSlug);
  const group = tierSlug ? getCompetitionGroup({ competition } as MatchRecord) : 'COMPETITION';
  const majorStageGroup =
    tierSlug === Constants.TierSlug.MAJOR_CHALLENGERS_STAGE ? 'CHALLENGERS' : 'MAIN_EVENT';
  const regionalEventGroup = group === 'RMR_EUROPE' ? tierSlug : '';

  return [
    majorStage ? 'MAJOR' : group,
    majorStage ? majorStageGroup : '',
    regionalEventGroup,
    competition?.federationId,
    competition?.season,
    competition?.location || '',
  ].join(':');
}

function getStatisticsEventTitle(competition: any) {
  const tierSlug = competition?.tier?.slug as Constants.TierSlug | undefined;
  const year = competition?.season ? 2025 + competition.season : null;
  const city = Util.getCompetitionHostingLocationCity(competition?.location);

  if (tierSlug && Util.isMajorStageTier(tierSlug)) {
    const title = [Util.getMajorEventDisplayName(competition.location, competition.organizer), year]
      .filter(Boolean)
      .join(' ');
    return tierSlug === Constants.TierSlug.MAJOR_CHALLENGERS_STAGE
      ? `${title} Challengers Stage`
      : title;
  }

  if (getCompetitionGroup({ competition } as MatchRecord) === 'IEM_KRAKOW') {
    return ['IEM Krakow', year].filter(Boolean).join(' ');
  }

  if (getCompetitionGroup({ competition } as MatchRecord) === 'IEM_COLOGNE') {
    return ['IEM Cologne', year].filter(Boolean).join(' ');
  }

  if (getCompetitionGroup({ competition } as MatchRecord) === 'ESL_PRO_LEAGUE') {
    return ['ESL Pro League', city, year].filter(Boolean).join(' ');
  }

  return getOfficialCompetitionTitle(competition);
}

function getHonorNotability(tierSlug: string) {
  if (tierSlug === Constants.TierSlug.MAJOR_CHAMPIONS_STAGE) return 0;
  if (
    tierSlug === Constants.TierSlug.IEM_COLOGNE_PLAYOFFS ||
    tierSlug === Constants.TierSlug.IEM_KRAKOW_PLAYOFFS
  ) {
    return 1;
  }
  if (tierSlug === Constants.TierSlug.BLAST_FINALS) return 2;
  if (tierSlug === Constants.TierSlug.LEAGUE_PRO_PLAYOFFS) return 3;
  if (tierSlug === Constants.TierSlug.ESL_CHALLENGER_PLAYOFFS) return 4;
  if (tierSlug === Constants.TierSlug.CCT_GLOBAL_FINALS) return 5;
  if (tierSlug === Constants.TierSlug.LEAGUE_ADVANCED_PLAYOFFS) return 6;
  if (
    tierSlug === Constants.TierSlug.CCT_SERIES_PLAYOFFS ||
    tierSlug === Constants.TierSlug.CCT_OCE_PLAYOFFS
  ) {
    return 7;
  }
  if (
    tierSlug === Constants.TierSlug.LEAGUE_MAIN_PLAYOFFS ||
    tierSlug === Constants.TierSlug.LEAGUE_INTERMEDIATE_PLAYOFFS ||
    tierSlug === Constants.TierSlug.LEAGUE_OPEN_PLAYOFFS
  ) {
    return 8;
  }
  if (tierSlug === Constants.TierSlug.ESEA_CASH_CUP) return 9;
  return 10;
}

function getCompetitionGroup(match: MatchRecord): CompetitionGroupKey | null {
  const tierSlug = String(match.competition?.tier?.slug || '').toLowerCase();

  if (
    tierSlug.includes('major:challengers-stage') ||
    tierSlug.includes('major:legends-stage') ||
    tierSlug.includes('major:champions-stage')
  ) {
    return 'MAJOR';
  }

  if (tierSlug === 'league:pro' || tierSlug === 'league:pro:playoffs') {
    return 'ESL_PRO_LEAGUE';
  }

  if (tierSlug === 'league:advanced' || tierSlug === 'league:advanced:playoffs') {
    return 'ESEA_ADVANCED';
  }

  if (tierSlug === 'league:main' || tierSlug === 'league:main:playoffs') {
    return 'ESEA_MAIN';
  }

  if (tierSlug === 'league:intermediate' || tierSlug === 'league:intermediate:playoffs') {
    return 'ESEA_INTERMEDIATE';
  }

  if (tierSlug === 'league:open' || tierSlug === 'league:open:playoffs') {
    return 'ESEA_OPEN';
  }

  if (tierSlug === 'cct:series' || tierSlug === 'cct:series:playoffs') {
    return 'CCT_SERIES';
  }

  if (tierSlug === 'cct:oceania:series' || tierSlug === 'cct:oceania:playoffs') {
    return 'CCT_OCEANIA_SERIES';
  }

  if (tierSlug === 'esl-challenger:group-stage' || tierSlug === 'esl-challenger:playoffs') {
    return 'ESL_CHALLENGER';
  }

  if (tierSlug === 'cct:global-finals') {
    return 'CCT_GLOBAL_FINALS';
  }

  if (tierSlug === Constants.TierSlug.BLAST_FINALS) {
    return 'BLAST_FINALS';
  }

  if (
    tierSlug === 'iem:cologne:group-a' ||
    tierSlug === 'iem:cologne:group-b' ||
    tierSlug === 'iem:cologne:playoffs'
  ) {
    return 'IEM_COLOGNE';
  }

  if (tierSlug === 'iem:cologne:open-qualifier') {
    return 'IEM_COLOGNE_QUALIFIERS';
  }

  if (
    tierSlug === 'iem:krakow:group-a' ||
    tierSlug === 'iem:krakow:group-b' ||
    tierSlug === 'iem:krakow:playoffs'
  ) {
    return 'IEM_KRAKOW';
  }

  if (tierSlug === 'iem:krakow:open-qualifier') {
    return 'IEM_KRAKOW_QUALIFIERS';
  }

  if (tierSlug.includes('major:europe:rmr:a') || tierSlug.includes('major:europe:rmr:b')) {
    return 'RMR_EUROPE';
  }

  if (tierSlug.includes('major:europe:open-qualifier')) return 'RMR_QUALIFIERS_EUROPE';
  if (tierSlug.includes('major:americas:open-qualifier')) return 'RMR_QUALIFIERS_AMERICAS';
  if (tierSlug.includes('major:asia:open-qualifier')) return 'RMR_QUALIFIERS_ASIA';
  if (tierSlug.includes('major:china:open-qualifier')) return 'RMR_QUALIFIERS_CHINA';
  if (tierSlug.includes('major:oce:open-qualifier')) return 'RMR_QUALIFIERS_OCEANIA';

  return null;
}

function getCompetitionStage(match: MatchRecord): Exclude<CompetitionStageOption, ''> | null {
  const tierSlug = String(match.competition?.tier?.slug || '');

  if (PlayoffStageTierSlugs.has(tierSlug)) {
    return 'PLAYOFFS';
  }

  if (GroupStageTierSlugs.has(tierSlug)) {
    return 'GROUP_STAGE';
  }

  return null;
}

function getCompetitionGroupTierWhere(group: string) {
  const tierSlugs: string[] = [];

  switch (group) {
    case 'MAJOR':
      tierSlugs.push(
        Constants.TierSlug.MAJOR_CHALLENGERS_STAGE,
        Constants.TierSlug.MAJOR_LEGENDS_STAGE,
        Constants.TierSlug.MAJOR_CHAMPIONS_STAGE,
      );
      break;
    case 'ESL_PRO_LEAGUE':
      tierSlugs.push(Constants.TierSlug.LEAGUE_PRO, Constants.TierSlug.LEAGUE_PRO_PLAYOFFS);
      break;
    case 'ESEA_ADVANCED':
      tierSlugs.push(
        Constants.TierSlug.LEAGUE_ADVANCED,
        Constants.TierSlug.LEAGUE_ADVANCED_PLAYOFFS,
      );
      break;
    case 'ESEA_MAIN':
      tierSlugs.push(Constants.TierSlug.LEAGUE_MAIN, Constants.TierSlug.LEAGUE_MAIN_PLAYOFFS);
      break;
    case 'ESEA_INTERMEDIATE':
      tierSlugs.push(
        Constants.TierSlug.LEAGUE_INTERMEDIATE,
        Constants.TierSlug.LEAGUE_INTERMEDIATE_PLAYOFFS,
      );
      break;
    case 'ESEA_OPEN':
      tierSlugs.push(Constants.TierSlug.LEAGUE_OPEN, Constants.TierSlug.LEAGUE_OPEN_PLAYOFFS);
      break;
    case 'CCT_SERIES':
      tierSlugs.push(Constants.TierSlug.CCT_SERIES, Constants.TierSlug.CCT_SERIES_PLAYOFFS);
      break;
    case 'CCT_OCEANIA_SERIES':
      tierSlugs.push(Constants.TierSlug.CCT_OCE_SERIES, Constants.TierSlug.CCT_OCE_PLAYOFFS);
      break;
    case 'ESL_CHALLENGER':
      tierSlugs.push(Constants.TierSlug.ESL_CHALLENGER, Constants.TierSlug.ESL_CHALLENGER_PLAYOFFS);
      break;
    case 'CCT_GLOBAL_FINALS':
      tierSlugs.push(Constants.TierSlug.CCT_GLOBAL_FINALS);
      break;
    case 'BLAST_FINALS':
      tierSlugs.push(Constants.TierSlug.BLAST_FINALS);
      break;
    case 'IEM_COLOGNE':
      tierSlugs.push(
        Constants.TierSlug.IEM_COLOGNE_GROUP_A,
        Constants.TierSlug.IEM_COLOGNE_GROUP_B,
        Constants.TierSlug.IEM_COLOGNE_PLAYOFFS,
      );
      break;
    case 'IEM_COLOGNE_QUALIFIERS':
      tierSlugs.push(Constants.TierSlug.IEM_COLOGNE_OPEN_QUALIFIER);
      break;
    case 'IEM_KRAKOW':
      tierSlugs.push(
        Constants.TierSlug.IEM_KRAKOW_GROUP_A,
        Constants.TierSlug.IEM_KRAKOW_GROUP_B,
        Constants.TierSlug.IEM_KRAKOW_PLAYOFFS,
      );
      break;
    case 'IEM_KRAKOW_QUALIFIERS':
      tierSlugs.push(Constants.TierSlug.IEM_KRAKOW_OPEN_QUALIFIER);
      break;
    default:
      break;
  }

  if (tierSlugs.length) {
    return { slug: { in: tierSlugs } };
  }

  const containsByGroup: Record<string, string[]> = {
    RMR_EUROPE: ['major:europe:rmr:a', 'major:europe:rmr:b'],
    RMR_QUALIFIERS_EUROPE: ['major:europe:open-qualifier'],
    RMR_QUALIFIERS_AMERICAS: ['major:americas:open-qualifier'],
    RMR_QUALIFIERS_ASIA: ['major:asia:open-qualifier'],
    RMR_QUALIFIERS_CHINA: ['major:china:open-qualifier'],
    RMR_QUALIFIERS_OCEANIA: ['major:oce:open-qualifier'],
  };
  const contains = containsByGroup[group];

  return contains?.length ? { OR: contains.map((value) => ({ slug: { contains: value } })) } : {};
}

function buildOfficialMatchWhere(params: {
  selectedCareerTeamId?: string;
  selectedCompetitionGroup?: string;
  selectedCompetitionStage?: CompetitionStageOption;
  selectedMap?: string;
  selectedMatchType?: MatchTypeOption;
  selectedSeason?: string;
  selectedTimeframe?: TimeframeOption;
  selectedYear?: string;
  currentDate?: Date | string;
}) {
  const where: any = {
    status: Constants.MatchStatus.COMPLETED,
    competitionId: {
      not: null as null,
    },
    matchType: {
      not: 'FACEIT_PUG',
    },
  };

  if (params.selectedCareerTeamId) {
    where.competitors = {
      some: {
        teamId: Number(params.selectedCareerTeamId),
      },
    };
  }

  if (params.selectedMap) {
    where.games = {
      some: {
        map: params.selectedMap,
      },
    };
  }

  if (params.selectedYear) {
    const year = Number(params.selectedYear);
    if (Number.isFinite(year)) {
      const start = new Date(year, 0, 1, 0, 0, 0, 0);
      const end = new Date(year, 11, 31, 23, 59, 59, 999);
      if (params.currentDate) {
        const current = new Date(params.currentDate);
        if (current.getFullYear() === year && current < end) {
          end.setTime(current.getTime());
          end.setHours(23, 59, 59, 999);
        }
      }
      where.date = { gte: start, lte: end };
    }
  } else if (params.selectedTimeframe && params.currentDate) {
    const end = new Date(params.currentDate);
    end.setHours(23, 59, 59, 999);
    const start = subMonths(end, Number(params.selectedTimeframe));
    start.setHours(0, 0, 0, 0);
    where.date = { gte: start, lte: end };
  }

  const competitionWhere: any = {};
  if (params.selectedSeason) {
    competitionWhere.season = Number(params.selectedSeason);
  }
  if (params.selectedMatchType) {
    competitionWhere.tier = {
      ...(competitionWhere.tier || {}),
      lan: params.selectedMatchType === 'LAN',
    };
  }
  if (params.selectedCompetitionGroup) {
    competitionWhere.tier = {
      ...(competitionWhere.tier || {}),
      ...getCompetitionGroupTierWhere(params.selectedCompetitionGroup),
    };
  }
  if (params.selectedCompetitionStage) {
    const slugs =
      params.selectedCompetitionStage === 'PLAYOFFS'
        ? [...PlayoffStageTierSlugs]
        : [...GroupStageTierSlugs];
    competitionWhere.tier = {
      ...(competitionWhere.tier || {}),
      slug: { in: slugs },
    };
  }
  if (Object.keys(competitionWhere).length) {
    where.competition = competitionWhere;
  }

  return where;
}

function getPlayerEventWhere(playerId: number) {
  return {
    OR: [{ attackerId: playerId }, { assistId: playerId }, { victimId: playerId }],
  };
}

function getPlayerScopedMatchEventsEager(playerId: number) {
  return {
    include: {
      ...Eagers.match.include,
      events: {
        where: getPlayerEventWhere(playerId),
        orderBy: {
          timestamp: 'asc' as unknown as 'asc',
        },
        select: {
          id: true,
          attackerId: true,
          assistId: true,
          victimId: true,
          gameId: true,
          weapon: true,
          headshot: true,
          timestamp: true,
        },
      },
      players: {
        where: {
          id: playerId,
        },
        include: {
          country: true,
          careerStints: true,
        },
      },
    },
  };
}

function getPlayerPerformanceFromEvents(playerId: number, events: any[]) {
  const killOrAssistEvents = events.filter((event: any) => !!event.attackerId || !!event.assistId);
  const kills = killOrAssistEvents.filter((event: any) => event.attackerId === playerId).length;
  const assists = killOrAssistEvents.filter((event: any) => event.assistId === playerId).length;
  const deaths = killOrAssistEvents.filter(
    (event: any) => event.victimId === playerId && !event.assistId,
  ).length;
  const plusMinus = kills - deaths;
  const rating = Util.getPlayerRating(kills, deaths, assists);
  return { kills, deaths, plusMinus, rating };
}

function hasPlayerEvents(playerId: number, events: any[]) {
  return events.some(
    (event: any) =>
      event.attackerId === playerId || event.assistId === playerId || event.victimId === playerId,
  );
}

function getSeriesAwarePerformance(
  playerId: number,
  eventsForStats: any[],
  useSeriesAverageRating: boolean,
) {
  const performance = getPlayerPerformanceFromEvents(playerId, eventsForStats);

  if (!useSeriesAverageRating) {
    return { ...performance, maps: 1 };
  }

  const ratings = Object.values(groupBy(eventsForStats, 'gameId'))
    .map((gameEvents: any) => getPlayerPerformanceFromEvents(playerId, gameEvents).rating)
    .filter((rating: number) => Number.isFinite(rating));

  if (!ratings.length) {
    return { ...performance, maps: 1 };
  }

  return {
    ...performance,
    maps: ratings.length,
    rating: ratings.reduce((sum: number, rating: number) => sum + rating, 0) / ratings.length,
  };
}

function isPlayedGame(game: any) {
  const scores = (game?.teams || []).map((team: any) => Number(team.score || 0));
  if (!scores.length) return false;
  return scores.some((score: number) => score > 0);
}

function isWithinTimeframe(matchDate: Date | string, currentDate: Date | string, months: string) {
  const parsedMonths = Number(months);
  if (!Number.isFinite(parsedMonths) || parsedMonths <= 0) {
    return true;
  }

  const date = new Date(matchDate);
  const end = new Date(currentDate);
  end.setHours(23, 59, 59, 999);

  const start = subMonths(end, parsedMonths);
  start.setHours(0, 0, 0, 0);

  return date >= start && date <= end;
}

function getPlayedGames(match: MatchRecord) {
  return [...(match.games || [])]
    .filter((game: any) => isPlayedGame(game))
    .sort((a: any, b: any) => Number(b.num ?? 0) - Number(a.num ?? 0));
}

function getEventsForGames(match: MatchRecord, games: any[], forceGameScope = false) {
  const allEvents = match.events || [];
  if (
    !forceGameScope &&
    games.length === getPlayedGames(match).length &&
    (match.games || []).length <= 1
  ) {
    return allEvents;
  }

  const gameIds = new Set(games.map((game: any) => game.id));
  return allEvents.filter(
    (event: any) => gameIds.has(event.gameId) || (gameIds.size === 1 && !event.gameId),
  );
}

function getWeaponKey(weapon: string) {
  const normalized = weapon.replace(/^weapon_/, '').toLowerCase();

  if (['incgrenade', 'inferno', 'molotov'].includes(normalized)) {
    return 'incgrenade';
  }

  return normalized;
}

function getWeaponImage(weapon: string) {
  const weaponKey = getWeaponKey(weapon);
  const assetKey = `./weapon_${weaponKey}.png`;

  if (weaponAssetContext.keys().includes(assetKey)) {
    return weaponAssetContext(assetKey);
  }

  if (weaponKey.startsWith('knife')) {
    return weaponAssetContext('./weapon_knife.png');
  }

  return undefined;
}

function formatWeaponName(weapon: string) {
  const normalized = getWeaponKey(weapon);
  const labels: Record<string, string> = {
    ak47: 'AK-47',
    aug: 'AUG',
    awp: 'AWP',
    bizon: 'PP-Bizon',
    cz75a: 'CZ75-Auto',
    deagle: 'Desert Eagle',
    elite: 'Dual Berettas',
    famas: 'FAMAS',
    fiveseven: 'Five-SeveN',
    g3sg1: 'G3SG1',
    galilar: 'Galil AR',
    glock: 'Glock-18',
    hegrenade: 'HE Grenade',
    hkp2000: 'P2000',
    incgrenade: 'Fire Grenade',
    m249: 'M249',
    m4a1: 'M4A4',
    m4a1_silencer: 'M4A1-S',
    mac10: 'MAC-10',
    mag7: 'MAG-7',
    mp5sd: 'MP5-SD',
    mp7: 'MP7',
    mp9: 'MP9',
    negev: 'Negev',
    nova: 'Nova',
    p250: 'P250',
    p90: 'P90',
    revolver: 'R8 Revolver',
    sawedoff: 'Sawed-Off',
    scar20: 'SCAR-20',
    sg556: 'SG 553',
    ssg08: 'SSG 08',
    tec9: 'Tec-9',
    ump45: 'UMP-45',
    usp_silencer: 'USP-S',
    xm1014: 'XM1014',
  };

  return (
    labels[normalized] ||
    normalized
      .split('_')
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ')
  );
}

function getCareerMatchCompetitor(
  match: MatchRecord,
  careerStints: CareerStintRecord[],
  selectedCareerTeamId = '',
) {
  const matchingStints = careerStints
    .filter((stint: any) => {
      if (selectedCareerTeamId && String(stint.teamId) !== selectedCareerTeamId) {
        return false;
      }

      return isWithinStint(match.date, stint.startedAt, stint.endedAt);
    })
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());

  return matchingStints
    .map((stint) => match.competitors.find((competitor: any) => competitor.teamId === stint.teamId))
    .find(Boolean);
}

function getPlayerMatchCompetitor(match: MatchRecord, playerId: number, selectedCareerTeamId = '') {
  const player = (match.players || []).find((matchPlayer: any) => matchPlayer.id === playerId);
  const stints = (player?.careerStints || [])
    .filter((stint: any) => {
      if (selectedCareerTeamId && String(stint.teamId) !== selectedCareerTeamId) {
        return false;
      }

      return isWithinStint(match.date, stint.startedAt, stint.endedAt);
    })
    .sort((a: any, b: any) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());

  const stintCompetitor = stints
    .map((stint: any) =>
      match.competitors.find((competitor: any) => competitor.teamId === stint.teamId),
    )
    .find(Boolean);

  if (stintCompetitor) {
    return stintCompetitor;
  }

  if (selectedCareerTeamId) {
    return undefined;
  }

  return match.competitors[0];
}

export default function LeagueStatsConcept(): JSX.Element {
  const { state } = React.useContext(AppStateContext);
  const location = useLocation();
  const formatAppDate = useFormatAppDate();
  const [loading, setLoading] = React.useState(true);
  const [activeTab, setActiveTab] = React.useState<StatsTab>(StatsTab.INDIVIDUAL);
  const [activeDetailView, setActiveDetailView] = React.useState<StatsDetailView>(
    StatsDetailView.MATCH_HISTORY,
  );
  const [matches, setMatches] = React.useState<MatchRecord[]>([]);
  const [globalPlayerMatches, setGlobalPlayerMatches] = React.useState<MatchRecord[]>([]);
  const [globalPlayers, setGlobalPlayers] = React.useState<StatsPlayerOption[]>([]);
  const [selectedGlobalPlayerProfile, setSelectedGlobalPlayerProfile] =
    React.useState<StatsPlayerOption | null>(null);
  const [activePlayerProfile, setActivePlayerProfile] = React.useState<any>(null);
  const [majorAwardCounts, setMajorAwardCounts] = React.useState({ wins: 0, mvps: 0 });
  const [careerHonors, setCareerHonors] = React.useState<CareerHonor[]>([]);
  const [careerMvps, setCareerMvps] = React.useState<any[]>([]);
  const [eventFinalPlacements, setEventFinalPlacements] = React.useState<Record<string, string>>(
    {},
  );
  const [careerHonorsTooltip, setCareerHonorsTooltip] = React.useState<CareerHonorsTooltip | null>(
    null,
  );
  const [visibleHonorCount, setVisibleHonorCount] = React.useState(0);
  const honorsRowRef = React.useRef<HTMLDivElement>(null);
  const honorsMeasureRef = React.useRef<HTMLDivElement>(null);
  const [globalPlayerTeams, setGlobalPlayerTeams] = React.useState<Array<any>>([]);
  const [globalPlayerCountries, setGlobalPlayerCountries] = React.useState<Array<any>>([]);
  const [numGlobalPlayers, setNumGlobalPlayers] = React.useState(0);
  const [globalPlayerPage, setGlobalPlayerPage] = React.useState(1);
  const [careerStints, setCareerStints] = React.useState<CareerStintRecord[]>([]);
  const [selectedCompetitionGroup, setSelectedCompetitionGroup] = React.useState<string>('');
  const [selectedMap, setSelectedMap] = React.useState<string>('');
  const [selectedSeason, setSelectedSeason] = React.useState<string>('');
  const [selectedTimeframe, setSelectedTimeframe] = React.useState<TimeframeOption>('');
  const [selectedMatchType, setSelectedMatchType] = React.useState<MatchTypeOption>('');
  const [selectedCompetitionStage, setSelectedCompetitionStage] =
    React.useState<CompetitionStageOption>('');
  const [selectedCareerTeamId, setSelectedCareerTeamId] = React.useState<string>('');
  const [selectedTeammateId, setSelectedTeammateId] = React.useState<string>('');
  const [selectedGlobalPlayerId, setSelectedGlobalPlayerId] = React.useState<string>('');
  const [selectedGlobalPlayerPreviewId, setSelectedGlobalPlayerPreviewId] =
    React.useState<string>('');
  const [globalPlayerPreviewProfile, setGlobalPlayerPreviewProfile] = React.useState<any>(null);
  const [globalPlayerPreviewAwards, setGlobalPlayerPreviewAwards] = React.useState({
    wins: 0,
    mvps: 0,
  });
  const [selectedGlobalDetailCompetitionGroup, setSelectedGlobalDetailCompetitionGroup] =
    React.useState<string>('');
  const [selectedGlobalDetailMap, setSelectedGlobalDetailMap] = React.useState<string>('');
  const [selectedGlobalDetailSeason, setSelectedGlobalDetailSeason] = React.useState<string>('');
  const [selectedGlobalDetailTimeframe, setSelectedGlobalDetailTimeframe] =
    React.useState<TimeframeOption>('');
  const [selectedGlobalDetailMatchType, setSelectedGlobalDetailMatchType] =
    React.useState<MatchTypeOption>('');
  const [selectedGlobalDetailCompetitionStage, setSelectedGlobalDetailCompetitionStage] =
    React.useState<CompetitionStageOption>('');
  const [selectedGlobalDetailCareerTeamId, setSelectedGlobalDetailCareerTeamId] =
    React.useState<string>('');
  const [selectedGlobalListTeamId, setSelectedGlobalListTeamId] = React.useState<string>('');
  const [selectedGlobalYear, setSelectedGlobalYear] = React.useState<string>('');
  const [selectedGlobalPlayerName, setSelectedGlobalPlayerName] = React.useState('');
  const [selectedGlobalFederationSlug, setSelectedGlobalFederationSlug] =
    React.useState<string>('');
  const [selectedGlobalCountryCode, setSelectedGlobalCountryCode] = React.useState('');
  const [selectedGlobalPlayerRole, setSelectedGlobalPlayerRole] = React.useState('');
  const [selectedGlobalTransferStatus, setSelectedGlobalTransferStatus] = React.useState<
    '' | 'listed' | 'retired'
  >('');
  const [selectedGlobalPlayerTierId, setSelectedGlobalPlayerTierId] = React.useState<string>(
    String(Constants.Prestige.indexOf(Constants.TierSlug.LEAGUE_PRO)),
  );
  const [selectedGlobalPlayerSort, setSelectedGlobalPlayerSort] = React.useState<
    'rating' | 'kills' | 'deaths' | 'maps' | 'name' | 'team'
  >('rating');
  const [matchPage, setMatchPage] = React.useState(1);
  const [teammatePage, setTeammatePage] = React.useState(1);
  const [tournamentPage, setTournamentPage] = React.useState(1);
  const [weaponPage, setWeaponPage] = React.useState(1);
  const [globalPlayersLoading, setGlobalPlayersLoading] = React.useState(false);
  const [globalPlayerFilterRevision, setGlobalPlayerFilterRevision] = React.useState(0);
  const [globalPlayerMatchesLoading, setGlobalPlayerMatchesLoading] = React.useState(false);
  const canViewGlobalPlayerStats = Boolean(state.profile?.simulateNpcMatchStats);
  const isGlobalPlayerDetailView =
    activeTab === StatsTab.GLOBAL_PLAYERS && !!selectedGlobalPlayerId;
  const activeSelectedCompetitionGroup = isGlobalPlayerDetailView
    ? selectedGlobalDetailCompetitionGroup
    : selectedCompetitionGroup;
  const activeSelectedMap = isGlobalPlayerDetailView ? selectedGlobalDetailMap : selectedMap;
  const activeSelectedSeason = isGlobalPlayerDetailView
    ? selectedGlobalDetailSeason
    : selectedSeason;
  const activeSelectedTimeframe = isGlobalPlayerDetailView
    ? selectedGlobalDetailTimeframe
    : selectedTimeframe;
  const activeSelectedMatchType = isGlobalPlayerDetailView
    ? selectedGlobalDetailMatchType
    : selectedMatchType;
  const activeSelectedCompetitionStage = isGlobalPlayerDetailView
    ? selectedGlobalDetailCompetitionStage
    : selectedCompetitionStage;
  const activeSelectedCareerTeamId = isGlobalPlayerDetailView
    ? selectedGlobalDetailCareerTeamId
    : selectedCareerTeamId;
  const setActiveSelectedCompetitionGroup = isGlobalPlayerDetailView
    ? setSelectedGlobalDetailCompetitionGroup
    : setSelectedCompetitionGroup;
  const setActiveSelectedMap = isGlobalPlayerDetailView
    ? setSelectedGlobalDetailMap
    : setSelectedMap;
  const setActiveSelectedSeason = isGlobalPlayerDetailView
    ? setSelectedGlobalDetailSeason
    : setSelectedSeason;
  const setActiveSelectedTimeframe = isGlobalPlayerDetailView
    ? setSelectedGlobalDetailTimeframe
    : setSelectedTimeframe;
  const setActiveSelectedMatchType = isGlobalPlayerDetailView
    ? setSelectedGlobalDetailMatchType
    : setSelectedMatchType;
  const setActiveSelectedCompetitionStage = isGlobalPlayerDetailView
    ? setSelectedGlobalDetailCompetitionStage
    : setSelectedCompetitionStage;
  const setActiveSelectedCareerTeamId = isGlobalPlayerDetailView
    ? setSelectedGlobalDetailCareerTeamId
    : setSelectedCareerTeamId;
  const closeGlobalPlayerDetail = React.useCallback(() => {
    setSelectedGlobalPlayerId('');
    setGlobalPlayerMatches([]);
    setActiveDetailView(StatsDetailView.MATCH_HISTORY);
  }, []);

  const settingsAll = React.useMemo(() => {
    if (!state.profile) {
      return Constants.Settings;
    }

    return Util.loadSettings(state.profile.settings);
  }, [state.profile]);

  const activeCareerYears = React.useMemo(() => {
    const startYear = new Date(Constants.NewSaveSeasonStartDate).getFullYear();
    const currentYear = state.profile?.date
      ? new Date(state.profile.date).getFullYear()
      : startYear;

    return Array.from(
      { length: Math.max(1, currentYear - startYear + 1) },
      (_, idx) => currentYear - idx,
    );
  }, [state.profile?.date]);

  React.useEffect(() => {
    if (!state.profile?.player?.id) {
      setCareerStints([]);
      return;
    }

    api.players
      .find({
        include: {
          careerStints: {
            include: {
              team: true,
            },
          },
        },
        where: {
          id: state.profile.player.id,
        },
      })
      .then((player: any) => setCareerStints((player?.careerStints || []) as CareerStintRecord[]));
  }, [state.profile?.player?.id]);

  React.useEffect(() => {
    if (!canViewGlobalPlayerStats) {
      setGlobalPlayerTeams([]);
      return;
    }

    api.teams
      .all({
        orderBy: { name: 'asc' },
      })
      .then((teams: any[]) => setGlobalPlayerTeams(teams));
    api.players
      .all({
        distinct: ['countryId'],
        include: { country: true },
        orderBy: { country: { name: 'asc' } },
      })
      .then((players: any[]) =>
        setGlobalPlayerCountries(players.map((player) => player.country).filter(Boolean)),
      );
  }, [canViewGlobalPlayerStats]);

  React.useEffect(() => {
    const routeState = location.state as StatsRouteState | null;
    const playerId = Number(routeState?.playerId);

    if (
      !canViewGlobalPlayerStats ||
      routeState?.tab !== 'GLOBAL_PLAYERS' ||
      !Number.isFinite(playerId)
    ) {
      return;
    }

    setSelectedGlobalDetailCompetitionGroup('');
    setSelectedGlobalDetailMap('');
    setSelectedGlobalDetailSeason('');
    setSelectedGlobalDetailTimeframe('');
    setSelectedGlobalDetailMatchType('');
    setSelectedGlobalDetailCompetitionStage('');
    setSelectedGlobalDetailCareerTeamId('');
    setActiveTab(StatsTab.GLOBAL_PLAYERS);
    setSelectedGlobalPlayerId(String(playerId));
    setActiveDetailView(StatsDetailView.MATCH_HISTORY);
  }, [canViewGlobalPlayerStats, location.state]);

  const careerTeamIds = React.useMemo(
    () => [...new Set(careerStints.map((stint) => stint.teamId))],
    [careerStints],
  );

  React.useEffect(() => {
    const playerId = state.profile?.player?.id;
    if (activeTab === StatsTab.GLOBAL_PLAYERS) {
      setMatches([]);
      setLoading(false);
      return;
    }

    if (activeTab !== StatsTab.TEAMMATES && !playerId) {
      setMatches([]);
      setLoading(false);
      return;
    }

    if (activeTab === StatsTab.TEAMMATES && !careerTeamIds.length) {
      setMatches([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const where =
      activeTab === StatsTab.TEAMMATES
        ? {
            status: Constants.MatchStatus.COMPLETED,
            competitors: {
              some: {
                teamId: {
                  in: careerTeamIds,
                },
              },
            },
            competitionId: {
              not: null as null,
            },
            matchType: {
              not: 'FACEIT_PUG',
            },
          }
        : {
            status: Constants.MatchStatus.COMPLETED,
            events: {
              some: getPlayerEventWhere(Number(playerId)),
            },
            competitionId: {
              not: null as null,
            },
            matchType: {
              not: 'FACEIT_PUG',
            },
          };

    api.matches
      .all({
        ...(activeTab === StatsTab.TEAMMATES
          ? Eagers.matchEvents
          : getPlayerScopedMatchEventsEager(Number(playerId))),
        where,
        orderBy: {
          date: 'desc',
        },
      })
      .then((result: any[]) => setMatches(result.filter(isLeagueMatch)))
      .finally(() => setLoading(false));
  }, [activeTab, careerTeamIds, state.profile?.player?.id]);

  React.useEffect(() => {
    if (!canViewGlobalPlayerStats || activeTab !== StatsTab.GLOBAL_PLAYERS) {
      setGlobalPlayers([]);
      setNumGlobalPlayers(0);
      setGlobalPlayersLoading(false);
      return;
    }

    setGlobalPlayersLoading(true);
    api.matches
      .globalPlayerStats({
        currentDate: state.profile?.date,
        countryCode: selectedGlobalCountryCode || undefined,
        federationSlug: selectedGlobalFederationSlug || undefined,
        name: selectedGlobalPlayerName || undefined,
        page: globalPlayerPage,
        pageSize: GlobalPlayerPageSize,
        sort: selectedGlobalPlayerSort,
        role: selectedGlobalPlayerRole || undefined,
        teamId: selectedGlobalListTeamId ? Number(selectedGlobalListTeamId) : undefined,
        tierId: selectedGlobalPlayerTierId ? Number(selectedGlobalPlayerTierId) : undefined,
        transferStatus: selectedGlobalTransferStatus || undefined,
        year: selectedGlobalYear || undefined,
      })
      .then(({ players, total }) => {
        setNumGlobalPlayers(total);
        setGlobalPlayers(players);
        setSelectedGlobalPlayerPreviewId((current) =>
          players.some((player) => String(player.id) === current)
            ? current
            : String(players[0]?.id || ''),
        );
      })
      .finally(() => setGlobalPlayersLoading(false));
  }, [
    activeTab,
    canViewGlobalPlayerStats,
    globalPlayerFilterRevision,
    globalPlayerPage,
    state.profile?.date,
  ]);

  React.useEffect(() => {
    if (
      !canViewGlobalPlayerStats ||
      activeTab !== StatsTab.GLOBAL_PLAYERS ||
      !selectedGlobalPlayerId
    ) {
      setGlobalPlayerMatches([]);
      setGlobalPlayerMatchesLoading(false);
      return;
    }

    setGlobalPlayerMatchesLoading(true);
    api.matches
      .all({
        ...getPlayerScopedMatchEventsEager(Number(selectedGlobalPlayerId)),
        where: {
          ...buildOfficialMatchWhere({}),
          events: {
            some: getPlayerEventWhere(Number(selectedGlobalPlayerId)),
          },
        },
        orderBy: {
          date: 'desc',
        },
      })
      .then((result: any[]) => setGlobalPlayerMatches(result.filter(isLeagueMatch)))
      .finally(() => setGlobalPlayerMatchesLoading(false));
  }, [activeTab, canViewGlobalPlayerStats, selectedGlobalPlayerId]);

  React.useEffect(() => {
    if (
      !canViewGlobalPlayerStats ||
      activeTab !== StatsTab.GLOBAL_PLAYERS ||
      !selectedGlobalPlayerPreviewId
    ) {
      setGlobalPlayerPreviewProfile(null);
      setGlobalPlayerPreviewAwards({ wins: 0, mvps: 0 });
      return;
    }

    let cancelled = false;
    api.players
      .find({
        include: { country: true, team: true, careerStints: { include: { team: true } } },
        where: { id: Number(selectedGlobalPlayerPreviewId) },
      })
      .then((player: any) => {
        if (!cancelled) setGlobalPlayerPreviewProfile(player || null);
      });

    return () => {
      cancelled = true;
    };
  }, [activeTab, canViewGlobalPlayerStats, selectedGlobalPlayerPreviewId]);

  React.useEffect(() => {
    if (!globalPlayerPreviewProfile) return;

    let cancelled = false;
    const championAwards = [
      ...Constants.Awards.filter((award) => award.type === Constants.AwardType.CHAMPION).map(
        (award) => award.target,
      ),
      Constants.TierSlug.MAJOR_CHAMPIONS_STAGE,
    ];

    Promise.all([
      api.competitions.mvps({ playerId: globalPlayerPreviewProfile.id }),
      api.competitions.all({
        where: {
          status: Constants.CompetitionStatus.COMPLETED,
          tier: { slug: { in: championAwards } },
        },
        include: { competitors: true, tier: true, matches: { include: { competitors: true } } },
      }),
    ]).then(([mvps, competitions]: [any[], any[]]) => {
      if (cancelled) return;

      const wins = competitions.filter((competition) => {
        const finalMatch = competition.matches.reduce(
          (latest: any, match: any) =>
            !latest || new Date(match.date) > new Date(latest.date) ? match : latest,
          null,
        );
        const winnerTeamId = competition.competitors.find(
          (competitor: any) => competitor.position === 1,
        )?.teamId;
        return (
          competition.tier.slug === Constants.TierSlug.MAJOR_CHAMPIONS_STAGE &&
          winnerTeamId &&
          finalMatch &&
          globalPlayerPreviewProfile.careerStints.some(
            (stint: any) =>
              stint.teamId === winnerTeamId &&
              stint.starter &&
              isWithinStint(finalMatch.date, stint.startedAt, stint.endedAt),
          )
        );
      }).length;

      setGlobalPlayerPreviewAwards({
        wins,
        mvps: mvps.filter(
          (mvp) => mvp.competition.tier.slug === Constants.TierSlug.MAJOR_CHAMPIONS_STAGE,
        ).length,
      });
    });

    return () => {
      cancelled = true;
    };
  }, [globalPlayerPreviewProfile]);

  React.useEffect(() => {
    if (
      !canViewGlobalPlayerStats ||
      activeTab !== StatsTab.GLOBAL_PLAYERS ||
      !selectedGlobalPlayerId
    ) {
      setSelectedGlobalPlayerProfile(null);
      return;
    }

    api.players
      .find({
        include: {
          country: true,
          team: true,
        },
        where: {
          id: Number(selectedGlobalPlayerId),
        },
      })
      .then((player: any) => {
        setSelectedGlobalPlayerProfile(
          player
            ? {
                id: player.id,
                name: player.name,
                avatar: player.avatar,
                country: player.country,
                team: player.team,
              }
            : null,
        );
      });
  }, [activeTab, canViewGlobalPlayerStats, selectedGlobalPlayerId]);

  React.useEffect(() => {
    if (!canViewGlobalPlayerStats && activeTab === StatsTab.GLOBAL_PLAYERS) {
      setActiveTab(StatsTab.INDIVIDUAL);
    }
  }, [activeTab, canViewGlobalPlayerStats]);

  React.useEffect(() => {
    if (activeTab !== StatsTab.GLOBAL_PLAYERS && selectedGlobalPlayerId) {
      closeGlobalPlayerDetail();
    }
  }, [activeTab, closeGlobalPlayerDetail, selectedGlobalPlayerId]);

  const matchesForCurrentTab =
    activeTab === StatsTab.GLOBAL_PLAYERS ? globalPlayerMatches : matches;

  const mapOptions = React.useMemo(() => {
    const options = new Set<string>();
    matchesForCurrentTab.forEach((match: any) =>
      getPlayedGames(match).forEach((game: any) => game.map && options.add(game.map)),
    );

    return [...options].sort((a, b) =>
      Util.convertMapPool(a, settingsAll.general.game).localeCompare(
        Util.convertMapPool(b, settingsAll.general.game),
      ),
    );
  }, [matchesForCurrentTab, settingsAll.general.game]);

  const seasonOptions = React.useMemo(() => {
    const seasons = new Set<number>();
    matchesForCurrentTab.forEach((match: any) => {
      if (match.competition?.season !== undefined && match.competition?.season !== null) {
        seasons.add(match.competition.season);
      }
    });

    return [...seasons].sort((a, b) => b - a);
  }, [matchesForCurrentTab]);

  const competitionOptions = React.useMemo(() => {
    const available = new Set<CompetitionGroupKey>();
    matchesForCurrentTab.forEach((match: any) => {
      const group = getCompetitionGroup(match);
      if (group) {
        available.add(group);
      }
    });

    return CompetitionGroupOrder.filter((group) => available.has(group)).map((group) => ({
      id: group,
      label: CompetitionGroupLabels[group],
    }));
  }, [matchesForCurrentTab]);

  const careerTeamOptions = React.useMemo(() => {
    const map = new Map<number, { id: number; name: string; blazon?: string }>();
    if (activeTab === StatsTab.GLOBAL_PLAYERS && selectedGlobalPlayerId) {
      const playerId = Number(selectedGlobalPlayerId);
      globalPlayerMatches.forEach((match: any) => {
        const competitor = getPlayerMatchCompetitor(match, playerId);
        if (competitor?.team) {
          map.set(competitor.team.id, {
            id: competitor.team.id,
            name: competitor.team.name,
            blazon: competitor.team.blazon,
          });
        }
      });
    } else if (activeTab === StatsTab.GLOBAL_PLAYERS) {
      globalPlayerTeams.forEach((team: any) =>
        map.set(team.id, {
          id: team.id,
          name: team.name,
          blazon: team.blazon,
        }),
      );
    } else {
      careerStints.forEach((stint: any) =>
        map.set(stint.team.id, {
          id: stint.team.id,
          name: stint.team.name,
          blazon: stint.team.blazon,
        }),
      );
    }

    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [activeTab, selectedGlobalPlayerId, globalPlayerMatches, globalPlayerTeams, careerStints]);

  React.useEffect(() => {
    if (
      isGlobalPlayerDetailView &&
      selectedGlobalDetailCareerTeamId &&
      !careerTeamOptions.some((team) => String(team.id) === selectedGlobalDetailCareerTeamId)
    ) {
      setSelectedGlobalDetailCareerTeamId('');
    }
  }, [careerTeamOptions, isGlobalPlayerDetailView, selectedGlobalDetailCareerTeamId]);

  const matchesByFilters = React.useMemo(() => {
    if (activeTab === StatsTab.TOURNAMENTS) {
      return matches;
    }

    return matchesForCurrentTab.filter((match: any) => {
      const byCompetition = activeSelectedCompetitionGroup
        ? getCompetitionGroup(match) === activeSelectedCompetitionGroup
        : true;
      const byMap = activeSelectedMap
        ? getPlayedGames(match).some((game: any) => game.map === activeSelectedMap)
        : true;
      const byMatchType = activeSelectedMatchType
        ? activeSelectedMatchType === 'LAN'
          ? Boolean(match.competition?.tier?.lan)
          : !Boolean(match.competition?.tier?.lan)
        : true;
      const byCompetitionStage = activeSelectedCompetitionStage
        ? getCompetitionStage(match) === activeSelectedCompetitionStage
        : true;
      const bySeason = activeSelectedSeason
        ? String(match.competition?.season) === activeSelectedSeason
        : true;
      const byTimeframe = state.profile?.date
        ? isWithinTimeframe(match.date, state.profile.date, activeSelectedTimeframe)
        : true;
      const byCareerTeam =
        activeTab === StatsTab.GLOBAL_PLAYERS
          ? activeSelectedCareerTeamId
            ? getPlayerMatchCompetitor(
                match,
                Number(selectedGlobalPlayerId),
                activeSelectedCareerTeamId,
              )?.teamId === Number(activeSelectedCareerTeamId)
            : true
          : careerStints
              .filter((stint: any) => {
                if (
                  activeSelectedCareerTeamId &&
                  String(stint.teamId) !== activeSelectedCareerTeamId
                ) {
                  return false;
                }

                return isWithinStint(match.date, stint.startedAt, stint.endedAt);
              })
              .some((stint: any) =>
                match.competitors.some((competitor: any) => competitor.teamId === stint.teamId),
              );

      return (
        byCompetition &&
        byMap &&
        byMatchType &&
        byCompetitionStage &&
        bySeason &&
        byTimeframe &&
        byCareerTeam
      );
    });
  }, [
    matches,
    matchesForCurrentTab,
    activeSelectedCompetitionGroup,
    activeSelectedMap,
    activeSelectedMatchType,
    activeSelectedCompetitionStage,
    activeSelectedSeason,
    activeSelectedTimeframe,
    activeSelectedCareerTeamId,
    careerStints,
    activeTab,
    state.profile?.date,
  ]);

  const ownPlayerPerformances = React.useMemo(() => {
    const playerId = state.profile?.player?.id;
    if (!playerId) return [] as MatchPerformance[];
    const scopedSelectedMap = activeTab === StatsTab.TOURNAMENTS ? '' : activeSelectedMap;

    return matchesByFilters.flatMap((match: any) => {
      const played =
        (match.players || []).some((player: any) => player.id === playerId) ||
        hasPlayerEvents(playerId, match.events || []);
      if (!played) {
        return [];
      }

      const gamesForStats = scopedSelectedMap
        ? getPlayedGames(match).filter((game: any) => game.map === scopedSelectedMap)
        : getPlayedGames(match);
      if (!gamesForStats.length) {
        return [];
      }

      const eventsForStats = getEventsForGames(
        match,
        gamesForStats,
        Boolean(scopedSelectedMap) || (match.games || []).length > 1,
      );

      const performance = getSeriesAwarePerformance(
        playerId,
        eventsForStats,
        !scopedSelectedMap && (match.games || []).length > 1,
      );
      return [{ match, ...performance }];
    });
  }, [matchesByFilters, state.profile?.player?.id, activeSelectedMap, activeTab]);

  const teammates = React.useMemo(() => {
    const selfId = state.profile?.player?.id;
    const map = new Map<
      number,
      {
        id: number;
        name: string;
        avatar?: string;
        country?: { code: string; name: string };
      }
    >();

    if (!selfId) return [];

    matchesByFilters.forEach((match: any) => {
      const userPlayed =
        (match.players || []).some((player: any) => player.id === selfId) ||
        hasPlayerEvents(Number(selfId), match.events || []);
      if (!userPlayed) return;

      const ownTeam = getCareerMatchCompetitor(match, careerStints, activeSelectedCareerTeamId);
      const userTeamStints = careerStints.filter(
        (stint: any) =>
          stint.teamId === ownTeam?.teamId &&
          isWithinStint(match.date, stint.startedAt, stint.endedAt),
      );
      const sharedMapEvents = getPlayedGames(match)
        .filter((game: any) => !activeSelectedMap || game.map === activeSelectedMap)
        .map((game: any) => getEventsForGames(match, [game], true))
        .filter((events: any[]) => hasPlayerEvents(selfId, events));
      if (!sharedMapEvents.length) return;

      (match.players || []).forEach((player: any) => {
        if (player.id === selfId) {
          return;
        }

        const teammateStints = (player.careerStints || []).filter(
          (stint: any) =>
            stint.teamId === ownTeam?.teamId &&
            isWithinStint(match.date, stint.startedAt, stint.endedAt),
        );
        const hasOverlap = teammateStints.some((teammateStint: any) =>
          userTeamStints.some((userStint: any) =>
            stintsOverlap(
              teammateStint.startedAt,
              teammateStint.endedAt,
              userStint.startedAt,
              userStint.endedAt,
            ),
          ),
        );

        if (hasOverlap && sharedMapEvents.some((events) => hasPlayerEvents(player.id, events))) {
          map.set(player.id, {
            id: player.id,
            name: player.name,
            avatar: player.avatar,
            country: player.country,
          });
        }
      });
    });

    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [
    matchesByFilters,
    careerStints,
    activeSelectedCareerTeamId,
    activeSelectedMap,
    state.profile?.player?.id,
  ]);

  React.useEffect(() => {
    if (!teammates.length) {
      setSelectedTeammateId('');
      return;
    }

    if (
      !selectedTeammateId ||
      !teammates.some((teammate) => String(teammate.id) === selectedTeammateId)
    ) {
      setSelectedTeammateId(String(teammates[0].id));
    }
  }, [teammates, selectedTeammateId]);

  React.useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(teammates.length / TeammatePageSize));
    setTeammatePage((page) => Math.min(page, totalPages));
  }, [teammates.length]);

  React.useEffect(() => {
    setMatchPage(1);
    setWeaponPage(1);
  }, [
    activeTab,
    selectedCompetitionGroup,
    selectedSeason,
    selectedTimeframe,
    selectedMap,
    selectedMatchType,
    selectedCompetitionStage,
    selectedCareerTeamId,
    selectedGlobalDetailCompetitionGroup,
    selectedGlobalDetailSeason,
    selectedGlobalDetailTimeframe,
    selectedGlobalDetailMap,
    selectedGlobalDetailMatchType,
    selectedGlobalDetailCompetitionStage,
    selectedGlobalDetailCareerTeamId,
    selectedTeammateId,
    selectedGlobalPlayerId,
  ]);

  React.useEffect(() => {
    setGlobalPlayerPage(1);
  }, [
    selectedGlobalListTeamId,
    selectedGlobalFederationSlug,
    selectedGlobalPlayerName,
    selectedGlobalPlayerSort,
    selectedGlobalPlayerTierId,
    selectedGlobalYear,
  ]);

  React.useEffect(() => {
    setTournamentPage(1);
  }, [
    activeTab,
    selectedTeammateId,
    activeSelectedCompetitionGroup,
    activeSelectedSeason,
    activeSelectedTimeframe,
    activeSelectedMap,
    activeSelectedMatchType,
    activeSelectedCompetitionStage,
    activeSelectedCareerTeamId,
  ]);

  const teammatePerformances = React.useMemo(() => {
    if (!selectedTeammateId) return [] as MatchPerformance[];
    const teammateId = Number(selectedTeammateId);
    const selfId = state.profile?.player?.id;
    if (!selfId) return [] as MatchPerformance[];

    return matchesByFilters.flatMap((match: any) => {
      const userPlayed =
        (match.players || []).some((player: any) => player.id === selfId) ||
        hasPlayerEvents(selfId, match.events || []);
      if (!userPlayed) return [];

      const ownTeam = getCareerMatchCompetitor(match, careerStints, selectedCareerTeamId);
      const userTeamStints = careerStints.filter(
        (stint: any) =>
          stint.teamId === ownTeam?.teamId &&
          isWithinStint(match.date, stint.startedAt, stint.endedAt),
      );
      const teammate = (match.players || []).find((player: any) => player.id === teammateId);
      if (!teammate) {
        return [];
      }

      const teammateStints = (teammate.careerStints || []).filter(
        (stint: any) =>
          stint.teamId === ownTeam?.teamId &&
          isWithinStint(match.date, stint.startedAt, stint.endedAt),
      );
      const playedAsTeammate = teammateStints.some((teammateStint: any) =>
        userTeamStints.some((userStint: any) =>
          stintsOverlap(
            teammateStint.startedAt,
            teammateStint.endedAt,
            userStint.startedAt,
            userStint.endedAt,
          ),
        ),
      );

      if (!playedAsTeammate) {
        return [];
      }

      const candidateGames = activeSelectedMap
        ? getPlayedGames(match).filter((game: any) => game.map === activeSelectedMap)
        : getPlayedGames(match);
      const gamesForStats = candidateGames.filter((game: any) => {
        const gameEvents = getEventsForGames(match, [game], true);
        return hasPlayerEvents(selfId, gameEvents) && hasPlayerEvents(teammateId, gameEvents);
      });
      if (!gamesForStats.length) {
        return [];
      }

      const eventsForStats = getEventsForGames(
        match,
        gamesForStats,
        Boolean(activeSelectedMap) || (match.games || []).length > 1,
      );

      const performance = getSeriesAwarePerformance(
        teammateId,
        eventsForStats,
        !activeSelectedMap && (match.games || []).length > 1,
      );
      return [{ match, ...performance }];
    });
  }, [
    matchesByFilters,
    selectedTeammateId,
    activeSelectedMap,
    careerStints,
    selectedCareerTeamId,
    state.profile?.player?.id,
  ]);

  const globalPlayerPerformances = React.useMemo(() => {
    if (!selectedGlobalPlayerId) return [] as MatchPerformance[];
    const playerId = Number(selectedGlobalPlayerId);

    return matchesByFilters.flatMap((match: any) => {
      const played =
        (match.players || []).some((player: any) => player.id === playerId) ||
        hasPlayerEvents(playerId, match.events || []);
      if (!played) {
        return [];
      }

      const gamesForStats = activeSelectedMap
        ? getPlayedGames(match).filter((game: any) => game.map === activeSelectedMap)
        : getPlayedGames(match);
      if (!gamesForStats.length) {
        return [];
      }

      const eventsForStats = getEventsForGames(
        match,
        gamesForStats,
        Boolean(activeSelectedMap) || (match.games || []).length > 1,
      );

      const hasRecordedStats = hasPlayerEvents(playerId, eventsForStats);
      if (!hasRecordedStats) {
        return [];
      }

      const performance = getSeriesAwarePerformance(
        playerId,
        eventsForStats,
        !activeSelectedMap && (match.games || []).length > 1,
      );
      return [{ match, ...performance }];
    });
  }, [matchesByFilters, selectedGlobalPlayerId, activeSelectedMap]);

  const tournamentRows = React.useMemo(() => {
    const grouped = new Map<
      string,
      {
        label: string;
        placement: number | null;
        placementPriority: number;
        placementKey: string;
        placementTierSlug?: Constants.TierSlug;
        plusMinus: number;
        ratingSum: number;
        count: number;
        mapsPlayed: number;
        teamBlazon: string;
        eventThumbnail: string;
        href: string;
        tier?: { lan?: boolean | null };
      }
    >();

    const sharedTeammateEvents = new Set(
      teammatePerformances.map((item) => {
        const ownTeam = getCareerMatchCompetitor(
          item.match,
          careerStints,
          activeSelectedCareerTeamId,
        );
        return `${getStatisticsEventGroup(item.match.competition)}:${ownTeam?.teamId || 0}`;
      }),
    );
    const teammateId = Number(selectedTeammateId);
    const teammateEventPerformances =
      activeTab === StatsTab.TEAMMATES && teammateId
        ? matchesByFilters.flatMap((match: any) => {
            const ownTeam = getCareerMatchCompetitor(
              match,
              careerStints,
              activeSelectedCareerTeamId,
            );
            const eventTeamKey = `${getStatisticsEventGroup(match.competition)}:${ownTeam?.teamId || 0}`;
            if (
              !ownTeam ||
              !sharedTeammateEvents.has(eventTeamKey) ||
              getPlayerMatchCompetitor(match, teammateId, String(ownTeam.teamId))?.teamId !==
                ownTeam.teamId
            ) {
              return [];
            }

            const games = getPlayedGames(match).filter((game: any) => {
              if (activeSelectedMap && game.map !== activeSelectedMap) return false;
              return hasPlayerEvents(teammateId, getEventsForGames(match, [game], true));
            });
            if (!games.length) return [];

            const mapPerformances = games.map((game: any) =>
              getPlayerPerformanceFromEvents(teammateId, getEventsForGames(match, [game], true)),
            );
            return [
              {
                match,
                maps: games.length,
                plusMinus: mapPerformances.reduce((sum, map) => sum + map.plusMinus, 0),
                rating: mapPerformances.reduce((sum, map) => sum + map.rating, 0) / games.length,
              },
            ];
          })
        : [];
    const eventPerformances =
      activeTab === StatsTab.TEAMMATES
        ? teammateEventPerformances
        : activeTab === StatsTab.GLOBAL_PLAYERS
          ? globalPlayerPerformances
          : ownPlayerPerformances;
    const eventPlayerId =
      activeTab === StatsTab.GLOBAL_PLAYERS
        ? Number(selectedGlobalPlayerId)
        : state.profile?.player?.id;

    eventPerformances.forEach((item: any) => {
      const competition = item.match.competition;
      const eventKey = getStatisticsEventGroup(competition);
      const ownTeam =
        activeTab === StatsTab.GLOBAL_PLAYERS && eventPlayerId
          ? getPlayerMatchCompetitor(item.match, eventPlayerId, activeSelectedCareerTeamId)
          : getCareerMatchCompetitor(item.match, careerStints, activeSelectedCareerTeamId);
      const placement = item.match.competition?.competitors?.find(
        (c: any) => c.teamId === ownTeam?.teamId,
      )?.position;
      const placementPriority =
        Constants.PrizePool[competition?.tier?.slug as Constants.TierSlug]?.total || 0;
      const existing = grouped.get(eventKey);
      const playedMaps =
        activeTab === StatsTab.TEAMMATES ? item.maps : getPlayedGames(item.match).length;

      if (!existing) {
        grouped.set(eventKey, {
          label: competition
            ? getStatisticsEventTitle(competition)
            : getCompetitionLabel(item.match),
          placement: placement || null,
          placementPriority,
          placementKey: `${eventKey}:${ownTeam?.teamId || 0}`,
          placementTierSlug: competition?.tier?.slug as Constants.TierSlug | undefined,
          plusMinus: item.plusMinus,
          ratingSum: item.rating * item.maps,
          count: item.maps,
          mapsPlayed: playedMaps,
          teamBlazon: ownTeam?.team.blazon || 'resources://blazonry/noteam.svg',
          eventThumbnail:
            Util.getCompetitionThumbnail({
              federationSlug: competition?.federation?.slug,
              organizer: competition?.organizer,
              tierSlug: competition?.tier?.slug,
            }) ||
            Util.getCompetitionLogo(competition?.tier?.slug, competition?.federation?.slug, {
              location: competition?.location,
              organizer: competition?.organizer,
            }),
          tier: item.match.competition?.tier,
          href: item.match.competition
            ? `/competitions?federationId=${item.match.competition.federationId}&season=${item.match.competition.season}&tierId=${item.match.competition.tierId}`
            : '/competitions',
        });
      } else {
        if (
          placement &&
          (placementPriority > existing.placementPriority ||
            (placementPriority === existing.placementPriority &&
              (!existing.placement || placement < existing.placement)))
        ) {
          existing.placement = placement;
          existing.placementPriority = placementPriority;
        }
        existing.plusMinus += item.plusMinus;
        existing.ratingSum += item.rating * item.maps;
        existing.count += item.maps;
        existing.mapsPlayed += playedMaps;
      }
    });

    return [...grouped.values()].map((row) => ({
      ...row,
      placement:
        eventFinalPlacements[row.placementKey] ||
        getEventPlacementLabel(row.placement, row.placementTierSlug),
      rating: (row.ratingSum / row.count).toFixed(2),
    }));
  }, [
    activeSelectedCareerTeamId,
    activeTab,
    careerStints,
    eventFinalPlacements,
    globalPlayerPerformances,
    matchesByFilters,
    ownPlayerPerformances,
    selectedGlobalPlayerId,
    selectedTeammateId,
    state.profile?.player?.id,
    teammatePerformances,
  ]);

  const eventPlacementKeys = React.useMemo(
    () =>
      tournamentRows
        .map((row) => row.placementKey)
        .sort()
        .join('|'),
    [tournamentRows],
  );

  React.useEffect(() => {
    const requestedKeys = new Set(eventPlacementKeys.split('|').filter(Boolean));
    if (!requestedKeys.size) {
      setEventFinalPlacements({});
      return;
    }

    let cancelled = false;
    api.competitions
      .all({
        where: { status: Constants.CompetitionStatus.COMPLETED },
        include: { competitors: true, federation: true, tier: true },
      })
      .then((competitions: any[]) => {
        if (cancelled) return;

        const finalPlacements: Record<string, string> = {};
        const competitionsByEvent = groupBy(competitions, getStatisticsEventGroup);

        Object.entries(competitionsByEvent).forEach(([eventKey, eventCompetitions]: any) => {
          const rankedStages = [...eventCompetitions].sort((left: any, right: any) => {
            const leftPrize =
              Constants.PrizePool[left.tier?.slug as Constants.TierSlug]?.total || 0;
            const rightPrize =
              Constants.PrizePool[right.tier?.slug as Constants.TierSlug]?.total || 0;
            return rightPrize - leftPrize;
          });
          const seenTeams = new Set<number>();
          const standings: Array<{
            teamId: number;
            stage: number;
            position: number;
            tierSlug: Constants.TierSlug;
          }> = [];
          rankedStages
            .flatMap((competition: any) => {
              const tierSlug = competition.tier?.slug as Constants.TierSlug;
              const stage = Constants.PrizePool[tierSlug]?.total || 0;
              return competition.competitors.map((competitor: any) => ({
                ...competitor,
                stage,
                tierSlug,
              }));
            })
            .filter((competitor: any) => competitor.teamId && competitor.position)
            .sort(
              (left: any, right: any) => right.stage - left.stage || left.position - right.position,
            )
            .forEach((competitor: any) => {
              if (seenTeams.has(competitor.teamId)) return;
              seenTeams.add(competitor.teamId);
              standings.push({
                teamId: competitor.teamId,
                stage: competitor.stage,
                position: competitor.position,
                tierSlug: competitor.tierSlug,
              });
            });

          standings.forEach((standing, index) => {
            const placementKey = `${eventKey}:${standing.teamId}`;
            if (!requestedKeys.has(placementKey)) return;

            let start = index;
            let end = index;
            while (
              start > 0 &&
              standings[start - 1].stage === standing.stage &&
              standings[start - 1].position === standing.position
            ) {
              start -= 1;
            }
            while (
              end + 1 < standings.length &&
              standings[end + 1].stage === standing.stage &&
              standings[end + 1].position === standing.position
            ) {
              end += 1;
            }

            const placement = index + 1;
            const isIemEvent =
              eventKey.startsWith('IEM_KRAKOW:') || eventKey.startsWith('IEM_COLOGNE:');
            const iemRanges = [
              [1, 1],
              [2, 2],
              [3, 4],
              [5, 6],
              [7, 8],
              [9, 12],
              [13, 16],
            ];
            const eplRanges = [
              [1, 1],
              [2, 2],
              [3, 4],
              [5, 8],
              [9, 16],
              [17, 24],
              [25, 32],
            ];
            const europeRmrRanges = eventKey.includes(Constants.TierSlug.MAJOR_EUROPE_RMR_A)
              ? [
                  [1, 1],
                  [2, 2],
                  [3, 4],
                  [5, 5],
                  [6, 8],
                  [9, 11],
                  [12, 14],
                  [15, 16],
                ]
              : eventKey.includes(Constants.TierSlug.MAJOR_EUROPE_RMR_B)
                ? [
                    [1, 1],
                    [2, 2],
                    [3, 3],
                    [4, 5],
                    [6, 8],
                    [9, 11],
                    [12, 14],
                    [15, 16],
                  ]
                : undefined;
            const configuredRanges = isIemEvent
              ? iemRanges
              : eventKey.startsWith('ESL_PRO_LEAGUE:')
                ? eplRanges
                : europeRmrRanges;
            const placementRange = configuredRanges?.find(
              ([rangeStart, rangeEnd]) => placement >= rangeStart && placement <= rangeEnd,
            );

            finalPlacements[placementKey] = placementRange
              ? formatPlacementRange(placementRange[0], placementRange[1])
              : formatPlacementRange(start + 1, end + 1);
          });
        });
        setEventFinalPlacements(finalPlacements);
      });

    return () => {
      cancelled = true;
    };
  }, [eventPlacementKeys]);

  const activeStatsPlayerId =
    activeTab === StatsTab.TEAMMATES
      ? Number(selectedTeammateId)
      : activeTab === StatsTab.GLOBAL_PLAYERS
        ? Number(selectedGlobalPlayerId)
        : state.profile?.player?.id;

  React.useEffect(() => {
    if (!activeStatsPlayerId) {
      setActivePlayerProfile(null);
      return;
    }

    let cancelled = false;
    setActivePlayerProfile(null);

    api.players
      .find({
        include: {
          country: true,
          team: true,
          careerStints: {
            include: {
              team: true,
            },
          },
        },
        where: { id: activeStatsPlayerId },
      })
      .then((player: any) => {
        if (!cancelled) {
          setActivePlayerProfile(player || null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeStatsPlayerId]);

  React.useEffect(() => {
    if (!activePlayerProfile) {
      setMajorAwardCounts({ wins: 0, mvps: 0 });
      setCareerHonors([]);
      setCareerMvps([]);
      return;
    }

    let cancelled = false;
    const playerId = activePlayerProfile.id;

    const championAwards = [
      ...Constants.Awards.filter((award) => award.type === Constants.AwardType.CHAMPION).map(
        (award) => award.target,
      ),
      Constants.TierSlug.MAJOR_CHAMPIONS_STAGE,
    ];

    Promise.all([
      api.competitions.mvps({ playerId }),
      api.competitions.all({
        where: {
          status: Constants.CompetitionStatus.COMPLETED,
          tier: { slug: { in: championAwards } },
        },
        include: {
          competitors: true,
          federation: true,
          tier: {
            include: {
              league: true,
            },
          },
          matches: {
            include: {
              competitors: true,
            },
          },
        },
        orderBy: { season: 'desc' },
      }),
    ]).then(([mvps, competitions]: [any[], any[]]) => {
      if (cancelled) return;

      const honors = competitions.reduce<CareerHonor[]>((entries, competition) => {
        const championshipMatch = competition.matches.reduce((latest: any, match: any) => {
          if (!latest || new Date(match.date) > new Date(latest.date)) return match;
          return latest;
        }, null);
        if (!championshipMatch) return entries;

        const winnerTeamId =
          competition.competitors.find((competitor: any) => competitor.position === 1)?.teamId ||
          [...championshipMatch.competitors].sort(
            (left: any, right: any) => (right.score || 0) - (left.score || 0),
          )[0]?.teamId;

        const wonTitle = (activePlayerProfile.careerStints || []).some(
          (stint: any) =>
            stint.teamId === winnerTeamId &&
            stint.starter &&
            isWithinStint(new Date(championshipMatch.date), stint.startedAt, stint.endedAt),
        );
        if (!wonTitle) return entries;

        entries.push({
          competitionId: competition.id,
          federationId: competition.federationId,
          tierId: competition.tier.id,
          season: competition.season,
          key: `${competition.tier.slug}__${competition.federation.slug}__${competition.location || ''}__${competition.organizer || ''}`,
          title: getOfficialCompetitionTitle(competition),
          tierSlug: competition.tier.slug,
          federationSlug: competition.federation.slug,
          location: competition.location,
          organizer: competition.organizer,
        });
        return entries;
      }, []);

      const wins = honors.filter(
        (honor) => honor.tierSlug === Constants.TierSlug.MAJOR_CHAMPIONS_STAGE,
      ).length;

      setMajorAwardCounts({
        wins,
        mvps: mvps.filter(
          (mvp) => mvp.competition.tier.slug === Constants.TierSlug.MAJOR_CHAMPIONS_STAGE,
        ).length,
      });
      setCareerHonors(honors);
      setCareerMvps(mvps);
    });

    return () => {
      cancelled = true;
    };
  }, [activePlayerProfile]);

  const careerHonorGroups = React.useMemo(() => {
    const groups = new Map<string, CareerHonor & { count: number }>();
    careerHonors.forEach((honor) => {
      const existing = groups.get(honor.key);
      if (existing) {
        existing.count += 1;
      } else {
        groups.set(honor.key, { ...honor, count: 1 });
      }
    });
    return [...groups.values()];
  }, [careerHonors]);
  const notableHonors = React.useMemo(() => {
    const majorHonors = careerHonors.filter(
      (honor) => honor.tierSlug === Constants.TierSlug.MAJOR_CHAMPIONS_STAGE,
    );
    const groupedNonMajorHonors = careerHonorGroups.filter(
      (honor) => honor.tierSlug !== Constants.TierSlug.MAJOR_CHAMPIONS_STAGE,
    );

    return [...majorHonors, ...groupedNonMajorHonors].sort(
      (left, right) => getHonorNotability(left.tierSlug) - getHonorNotability(right.tierSlug),
    );
  }, [careerHonors, careerHonorGroups]);
  const showcaseHonors = notableHonors.slice(0, visibleHonorCount);
  const mvpTooltip = React.useMemo(() => {
    if (!careerMvps.length) return '';
    return [
      'MVP winner at:',
      ...careerMvps.map((mvp) => getOfficialCompetitionTitle(mvp.competition)),
    ].join('\n');
  }, [careerMvps]);
  const showCareerHonorsTooltip = React.useCallback(
    (event: React.MouseEvent<HTMLElement>, content: string) => {
      const rect = event.currentTarget.getBoundingClientRect();
      const tooltipWidth = 280;
      const tooltipHeight = Math.min(320, 32 + content.split('\n').length * 20);
      const top =
        rect.bottom + 8 + tooltipHeight <= window.innerHeight
          ? rect.bottom + 8
          : Math.max(12, rect.top - tooltipHeight - 8);

      setCareerHonorsTooltip({
        content,
        left: Math.max(12, Math.min(rect.left, window.innerWidth - tooltipWidth - 12)),
        top,
      });
    },
    [],
  );
  React.useLayoutEffect(() => {
    const row = honorsRowRef.current;
    const measure = honorsMeasureRef.current;
    if (!row || !measure) return;

    const updateVisibleHonors = () => {
      const mvpWidth = careerMvps.length > 0 ? 144 : 0;
      let usedWidth = mvpWidth;
      let count = 0;

      for (const card of measure.children) {
        const gap = usedWidth > 0 ? 8 : 0;
        const width = card.getBoundingClientRect().width;
        if (usedWidth + gap + width > row.clientWidth) break;
        usedWidth += gap + width;
        count += 1;
      }

      setVisibleHonorCount(count);
    };

    updateVisibleHonors();
    const observer = new ResizeObserver(updateVisibleHonors);
    observer.observe(row);
    return () => observer.disconnect();
  }, [careerMvps.length, notableHonors]);

  const weaponRows = React.useMemo(() => {
    const playerId = activeStatsPlayerId;
    if (!playerId) return [] as WeaponPerformance[];

    const grouped = new Map<string, { kills: number; headshots: number }>();

    const matchesForWeaponStats =
      activeTab === StatsTab.TEAMMATES
        ? teammatePerformances.map((performance: any) => performance.match)
        : matchesByFilters;

    matchesForWeaponStats.forEach((match: any) => {
      if (match.matchType === 'FACEIT_PUG') {
        return;
      }

      const played =
        (match.players || []).some((player: any) => player.id === playerId) ||
        hasPlayerEvents(playerId, match.events || []);
      if (!played) {
        return;
      }

      const candidateGames = activeSelectedMap
        ? getPlayedGames(match).filter((game: any) => game.map === activeSelectedMap)
        : getPlayedGames(match);
      const gamesForStats = candidateGames.filter((game: any) => {
        if (activeTab !== StatsTab.TEAMMATES || !state.profile?.player?.id) {
          return true;
        }

        const gameEvents = getEventsForGames(match, [game], true);
        return (
          hasPlayerEvents(state.profile.player.id, gameEvents) &&
          hasPlayerEvents(playerId, gameEvents)
        );
      });
      if (!gamesForStats.length) {
        return;
      }

      const eventsForStats = getEventsForGames(
        match,
        gamesForStats,
        Boolean(activeSelectedMap) || (match.games || []).length > 1,
      );

      eventsForStats.forEach((event: any) => {
        if (event.attackerId !== playerId || !event.weapon) {
          return;
        }

        const weapon = getWeaponKey(String(event.weapon));
        const entry = grouped.get(weapon) || { kills: 0, headshots: 0 };
        entry.kills += 1;
        if (event.headshot) {
          entry.headshots += 1;
        }
        grouped.set(weapon, entry);
      });
    });

    return [...grouped.entries()]
      .map(([weapon, entry]) => ({
        weapon,
        label: formatWeaponName(weapon),
        image: getWeaponImage(weapon),
        kills: entry.kills,
        headshots: entry.headshots,
        hsPercent: entry.kills ? Math.round((entry.headshots / entry.kills) * 100) : 0,
      }))
      .sort(
        (a, b) => b.kills - a.kills || b.hsPercent - a.hsPercent || a.label.localeCompare(b.label),
      );
  }, [
    activeStatsPlayerId,
    activeTab,
    teammatePerformances,
    matchesByFilters,
    activeSelectedMap,
    state.profile?.player?.id,
  ]);

  const activePerformances =
    activeTab === StatsTab.TEAMMATES
      ? teammatePerformances
      : activeTab === StatsTab.GLOBAL_PLAYERS
        ? globalPlayerPerformances
        : ownPlayerPerformances;
  const summary = React.useMemo(() => {
    const totals = activePerformances.reduce(
      (acc: any, item: any) => {
        acc.matches += 1;
        acc.kills += item.kills;
        acc.deaths += item.deaths;
        acc.maps += item.maps;
        acc.plusMinus += item.plusMinus;
        acc.ratingMaps += item.maps;
        acc.ratingSum += item.rating * item.maps;
        return acc;
      },
      { matches: 0, kills: 0, deaths: 0, maps: 0, plusMinus: 0, ratingMaps: 0, ratingSum: 0 },
    );

    return {
      ...totals,
      avgRating: totals.ratingMaps ? Number((totals.ratingSum / totals.ratingMaps).toFixed(2)) : 0,
      kdRatio: totals.deaths ? Number((totals.kills / totals.deaths).toFixed(2)) : totals.kills,
      avgKills: totals.maps ? Math.round(totals.kills / totals.maps) : 0,
      mapsPlayed: totals.maps,
    };
  }, [activePerformances]);
  const togetherRecord = React.useMemo(() => {
    if (activeTab !== StatsTab.TEAMMATES) return { maps: 0, wins: 0, winRate: 0 };

    const record = teammatePerformances.reduce(
      (totals, item: any) => {
        const ownTeam = getCareerMatchCompetitor(
          item.match,
          careerStints,
          activeSelectedCareerTeamId,
        );
        getPlayedGames(item.match).forEach((game: any) => {
          if (activeSelectedMap && game.map !== activeSelectedMap) return;
          const own = game.teams?.find((team: any) => team.teamId === ownTeam?.teamId);
          const opponent = game.teams?.find((team: any) => team.teamId !== ownTeam?.teamId);
          if (!own || !opponent) return;
          totals.maps += 1;
          if ((own.score || 0) >= (opponent.score || 0)) totals.wins += 1;
        });
        return totals;
      },
      { maps: 0, wins: 0 },
    );

    return {
      ...record,
      winRate: record.maps ? Math.round((record.wins / record.maps) * 100) : 0,
    };
  }, [
    activeSelectedCareerTeamId,
    activeSelectedMap,
    activeTab,
    careerStints,
    teammatePerformances,
  ]);
  const recentForm = React.useMemo(() => {
    return activePerformances
      .flatMap((item: any) => {
        const ownTeam =
          activeTab === StatsTab.GLOBAL_PLAYERS
            ? getPlayerMatchCompetitor(item.match, activeStatsPlayerId, activeSelectedCareerTeamId)
            : getCareerMatchCompetitor(item.match, careerStints, activeSelectedCareerTeamId);
        const games = activeSelectedMap
          ? getPlayedGames(item.match).filter((game: any) => game.map === activeSelectedMap)
          : getPlayedGames(item.match);

        return games.map((game: any) => {
          const events = getEventsForGames(item.match, [game], true);
          const { rating } = getPlayerPerformanceFromEvents(activeStatsPlayerId, events);
          const ownGameTeam = game.teams?.find((team: any) => team.teamId === ownTeam?.teamId);
          const opponentGameTeam = game.teams?.find((team: any) => team.teamId !== ownTeam?.teamId);

          return {
            date: item.match.date,
            rating,
            didWin:
              ownGameTeam && opponentGameTeam
                ? (ownGameTeam.score || 0) >= (opponentGameTeam.score || 0)
                : item.plusMinus >= 0,
          };
        });
      })
      .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime())
      .slice(0, 10)
      .reverse();
  }, [
    activePerformances,
    activeSelectedCareerTeamId,
    activeSelectedMap,
    activeStatsPlayerId,
    activeTab,
    careerStints,
  ]);
  const recentFormAverage = React.useMemo(
    () =>
      recentForm.length
        ? recentForm.reduce((total, match) => total + match.rating, 0) / recentForm.length
        : 0,
    [recentForm],
  );
  const recentFormChange = React.useMemo(() => {
    if (recentForm.length < 2) return 0;
    const splitAt = Math.ceil(recentForm.length / 2);
    const previous = recentForm.slice(0, splitAt);
    const latest = recentForm.slice(splitAt);
    const previousAverage =
      previous.reduce((total, match) => total + match.rating, 0) / previous.length;
    const latestAverage = latest.reduce((total, match) => total + match.rating, 0) / latest.length;
    return previousAverage ? ((latestAverage - previousAverage) / previousAverage) * 100 : 0;
  }, [recentForm]);
  const recentFormChart = React.useMemo(() => {
    if (!recentForm.length) return { coordinates: [], points: '', areaPoints: '' };

    const min = 0.5;
    const range = 1.5;
    const coordinates = recentForm.map((match, index) => {
      const x = recentForm.length === 1 ? 300 : 16 + (index * 568) / (recentForm.length - 1);
      const y = Math.max(4, Math.min(96, 96 - ((match.rating - min) / range) * 92));
      return { x, y };
    });
    const points = coordinates.map((point) => `${point.x},${point.y}`).join(' ');
    const areaPoints = `${coordinates[0].x},96 ${points} ${coordinates.at(-1)?.x},96`;
    return { coordinates, points, areaPoints };
  }, [recentForm]);

  const featuredMapSlug =
    activeSelectedMap || getPlayedGames(activePerformances[0]?.match || {})[0]?.map || 'de_mirage';
  const featuredMapImage = Util.convertMapPool(featuredMapSlug, settingsAll.general.game, true);
  const hasMapSelected = !!activeSelectedMap;
  const selectedGlobalPlayer =
    globalPlayers.find((player) => String(player.id) === selectedGlobalPlayerId) ||
    selectedGlobalPlayerProfile;
  const sharedTeammateStints = React.useMemo(() => {
    if (activeTab !== StatsTab.TEAMMATES || !activePlayerProfile) return [];

    const currentDate = new Date(state.profile?.date || Date.now());
    const overlaps = new Map<
      string,
      {
        team: CareerStintRecord['team'];
        startedAt: Date;
        endedAt: Date;
      }
    >();

    (activePlayerProfile.careerStints || []).forEach((teammateStint: CareerStintRecord) => {
      careerStints.forEach((ownStint) => {
        if (
          teammateStint.teamId !== ownStint.teamId ||
          (activeSelectedCareerTeamId &&
            String(teammateStint.teamId) !== activeSelectedCareerTeamId) ||
          !stintsOverlap(
            teammateStint.startedAt,
            teammateStint.endedAt,
            ownStint.startedAt,
            ownStint.endedAt,
          )
        ) {
          return;
        }

        const startedAt = new Date(
          Math.max(
            new Date(teammateStint.startedAt).getTime(),
            new Date(ownStint.startedAt).getTime(),
          ),
        );
        const endedAt = new Date(
          Math.min(
            teammateStint.endedAt
              ? new Date(teammateStint.endedAt).getTime()
              : currentDate.getTime(),
            ownStint.endedAt ? new Date(ownStint.endedAt).getTime() : currentDate.getTime(),
          ),
        );
        const key = `${teammateStint.teamId}_${startedAt.toISOString()}_${endedAt.toISOString()}`;
        overlaps.set(key, {
          team: teammateStint.team || ownStint.team,
          startedAt,
          endedAt,
        });
      });
    });

    return [...overlaps.values()].sort(
      (left, right) => left.startedAt.getTime() - right.startedAt.getTime(),
    );
  }, [
    activePlayerProfile,
    activeSelectedCareerTeamId,
    activeTab,
    careerStints,
    state.profile?.date,
  ]);
  const teammatePageCount = Math.max(1, Math.ceil(teammates.length / TeammatePageSize));
  const pagedTeammates = teammates.slice(
    (teammatePage - 1) * TeammatePageSize,
    teammatePage * TeammatePageSize,
  );
  const headerPlayer =
    activePlayerProfile ||
    (activeTab === StatsTab.GLOBAL_PLAYERS
      ? selectedGlobalPlayer
      : activeTab === StatsTab.TEAMMATES
        ? teammates.find((teammate) => String(teammate.id) === selectedTeammateId)
        : state.profile?.player);
  const headerPlayerTeam =
    activeTab === StatsTab.TEAMMATES
      ? sharedTeammateStints[0]?.team || null
      : activePlayerProfile?.team ||
        (activeTab === StatsTab.INDIVIDUAL ? state.profile?.team : null);
  const headerPlayerIsAwper =
    String(headerPlayer?.role).toUpperCase() === Constants.PlayerRole.SNIPER ||
    String(headerPlayer?.role).toUpperCase() === Constants.UserRole.AWPER;
  const currentLoading =
    activeTab === StatsTab.GLOBAL_PLAYERS ? globalPlayerMatchesLoading : loading;
  const globalPlayerTotalPages = Math.max(1, Math.ceil(numGlobalPlayers / GlobalPlayerPageSize));
  const isGlobalPlayerListView = activeTab === StatsTab.GLOBAL_PLAYERS && !selectedGlobalPlayerId;

  const renderMatchTable = (rows: MatchPerformance[]) => {
    const flattenedRows = rows.flatMap((item: any) => {
      const playerId = activeStatsPlayerId;
      const ownTeam =
        activeTab === StatsTab.GLOBAL_PLAYERS && playerId
          ? getPlayerMatchCompetitor(item.match, playerId, activeSelectedCareerTeamId)
          : getCareerMatchCompetitor(item.match, careerStints, activeSelectedCareerTeamId);
      const opponent = item.match.competitors.find(
        (competitor: any) => competitor.teamId !== ownTeam?.teamId,
      );
      const games = activeSelectedMap
        ? getPlayedGames(item.match).filter((game: any) => game.map === activeSelectedMap)
        : getPlayedGames(item.match);

      return games.map((game: any) => {
        const gameEvents = getEventsForGames(item.match, [game], true);
        const { plusMinus, rating } = getPlayerPerformanceFromEvents(playerId, gameEvents);
        const yourRating =
          activeTab === StatsTab.TEAMMATES && state.profile?.player?.id
            ? getPlayerPerformanceFromEvents(state.profile.player.id, gameEvents).rating
            : null;

        const ownGameTeam = game.teams?.find(
          (gameTeam: any) => gameTeam.teamId === ownTeam?.teamId,
        );
        const oppGameTeam = game.teams?.find(
          (gameTeam: any) => gameTeam.teamId !== ownTeam?.teamId,
        );
        const didWin = (ownGameTeam?.score || 0) >= (oppGameTeam?.score || 0);

        return {
          key: `${item.match.id}_${game.id}`,
          matchId: item.match.id,
          date: item.match.date,
          mapSlug: game.map || 'de_mirage',
          ownTeam,
          opponent,
          didWin,
          ownScore: ownGameTeam?.score ?? 0,
          oppScore: oppGameTeam?.score ?? 0,
          plusMinus,
          rating,
          yourRating,
        };
      });
    });
    const matchHistoryPageSize =
      activeTab === StatsTab.TEAMMATES
        ? TeammateMatchHistoryPageSize
        : activeTab === StatsTab.INDIVIDUAL
          ? IndividualMatchHistoryPageSize
          : MatchHistoryPageSize;
    const totalPages = Math.max(1, Math.ceil(flattenedRows.length / matchHistoryPageSize));
    const pagedRows = flattenedRows.slice(
      (matchPage - 1) * matchHistoryPageSize,
      matchPage * matchHistoryPageSize,
    );

    return (
      <article className="border-base-content/10 rounded-lg border">
        <header className="border-base-content/10 flex items-center gap-1 border-b px-3 py-2">
          <button
            className={cx(
              'btn btn-ghost btn-sm rounded-none px-3 text-sm font-semibold',
              activeDetailView === StatsDetailView.MATCH_HISTORY && 'btn-active!',
            )}
            onClick={() => setActiveDetailView(StatsDetailView.MATCH_HISTORY)}
          >
            {activeTab === StatsTab.TEAMMATES ? 'Match History (Together)' : 'Match History'}
          </button>
          {(activeTab === StatsTab.INDIVIDUAL ||
            activeTab === StatsTab.GLOBAL_PLAYERS ||
            activeTab === StatsTab.TEAMMATES) && (
            <button
              className={cx(
                'btn btn-ghost btn-sm rounded-none px-3 text-sm font-semibold',
                activeDetailView === StatsDetailView.EVENTS && 'btn-active!',
              )}
              onClick={() => setActiveDetailView(StatsDetailView.EVENTS)}
            >
              Events
            </button>
          )}
          {activeTab !== StatsTab.GLOBAL_PLAYERS && (
            <button
              className={cx(
                'btn btn-ghost btn-sm rounded-none px-3 text-sm font-semibold',
                activeDetailView === StatsDetailView.WEAPONS && 'btn-active!',
              )}
              onClick={() => setActiveDetailView(StatsDetailView.WEAPONS)}
            >
              Weapons
            </button>
          )}
        </header>
        <div className="overflow-x-auto">
          <table className="table-sm table">
            <thead>
              <tr>
                <th>Team</th>
                <th className="text-center">Match Details</th>
                <th>Date</th>
                <th>Map</th>
                <th>Opponent</th>
                <th className="text-center">Result</th>
                <th className="text-center">Score</th>
                <th className="text-center">+ / -</th>
                <th className="text-center">
                  {activeTab === StatsTab.TEAMMATES ? 'Teammate Rating' : 'Rating'}
                </th>
                {activeTab === StatsTab.TEAMMATES && <th className="text-center">Your Rating</th>}
              </tr>
            </thead>
            <tbody>
              {pagedRows.map((row, rowIndex) => (
                <tr key={row.key} className={rowIndex % 2 ? 'bg-base-200/50' : 'bg-base-100'}>
                  <td>
                    <span className="inline-flex items-center gap-2">
                      <img
                        src={row.ownTeam?.team?.blazon || 'resources://blazonry/noteam.svg'}
                        className="h-5 w-5 object-contain"
                      />
                      <span>{row.ownTeam?.team?.name || 'Unknown'}</span>
                    </span>
                  </td>
                  <td className="text-center">
                    <button
                      onClick={() =>
                        api.window.send<ModalRequest>(Constants.WindowIdentifier.Modal, {
                          target: '/postgame',
                          payload: row.matchId,
                        })
                      }
                      className="hover:text-primary cursor-pointer"
                      title="View match details"
                    >
                      <FaChartBar className="mx-auto" />
                    </button>
                  </td>
                  <td>{format(row.date, 'PP')}</td>
                  <td>{Util.convertMapPool(row.mapSlug, settingsAll.general.game)}</td>
                  <td>
                    <span className="inline-flex items-center gap-2">
                      <img
                        src={row.opponent?.team?.blazon || 'resources://blazonry/noteam.svg'}
                        className="h-5 w-5 object-contain"
                      />
                      <span>{row.opponent?.team?.name || 'TBD'}</span>
                    </span>
                  </td>
                  <td className="text-center">
                    <span
                      className={`badge badge-sm border-0 text-white ${
                        row.didWin ? 'bg-success/80' : 'bg-error/80'
                      }`}
                    >
                      {row.didWin ? 'Win' : 'Loss'}
                    </span>
                  </td>
                  <td className="text-base-content/80 text-center">
                    {row.ownScore}-{row.oppScore}
                  </td>
                  <td
                    className={
                      row.plusMinus > 0
                        ? 'text-success text-center font-semibold'
                        : row.plusMinus < 0
                          ? 'text-error text-center font-semibold'
                          : 'text-center font-semibold text-inherit'
                    }
                  >
                    {new Intl.NumberFormat('en-US', { signDisplay: 'exceptZero' }).format(
                      row.plusMinus,
                    )}
                  </td>
                  <td className={cx('text-center font-semibold', getRatingColorClass(row.rating))}>
                    {row.rating.toFixed(2)}
                  </td>
                  {activeTab === StatsTab.TEAMMATES && (
                    <td
                      className={cx(
                        'text-center font-semibold',
                        getRatingColorClass(row.yourRating || 0),
                      )}
                    >
                      {(row.yourRating || 0).toFixed(2)}
                    </td>
                  )}
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td
                    colSpan={activeTab === StatsTab.TEAMMATES ? 10 : 9}
                    className="text-base-content/60 py-8 text-center text-sm"
                  >
                    No matches for selected filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {rows.length > 0 && (
          <footer className="border-base-content/10 bg-base-100 relative z-10 flex shrink-0 items-center justify-end gap-2 border-t px-3 py-2">
            <button
              className="btn btn-ghost btn-xs rounded-none"
              disabled={matchPage <= 1}
              onClick={() => setMatchPage((page) => Math.max(1, page - 1))}
            >
              Prev
            </button>
            <span className="text-xs">
              Page {matchPage} / {totalPages}
            </span>
            <button
              className="btn btn-ghost btn-xs rounded-none"
              disabled={matchPage >= totalPages}
              onClick={() => setMatchPage((page) => Math.min(totalPages, page + 1))}
            >
              Next
            </button>
          </footer>
        )}
      </article>
    );
  };

  const renderWeaponTable = (rows: WeaponPerformance[]) => {
    const weaponPageSize =
      activeTab === StatsTab.TEAMMATES ? TeammateWeaponPageSize : WeaponPageSize;
    const totalPages = Math.max(1, Math.ceil(rows.length / weaponPageSize));
    const pagedRows = rows.slice((weaponPage - 1) * weaponPageSize, weaponPage * weaponPageSize);

    return (
      <article className="border-base-content/10 flex min-h-0 flex-col rounded-lg border">
        <header className="border-base-content/10 flex items-center gap-1 border-b px-3 py-2">
          <button
            className={cx(
              'btn btn-ghost btn-sm rounded-none px-3 text-sm font-semibold',
              activeDetailView === StatsDetailView.MATCH_HISTORY && 'btn-active!',
            )}
            onClick={() => setActiveDetailView(StatsDetailView.MATCH_HISTORY)}
          >
            {activeTab === StatsTab.TEAMMATES ? 'Match History (Together)' : 'Match History'}
          </button>
          {(activeTab === StatsTab.INDIVIDUAL || activeTab === StatsTab.TEAMMATES) && (
            <button
              className={cx(
                'btn btn-ghost btn-sm rounded-none px-3 text-sm font-semibold',
                activeDetailView === StatsDetailView.EVENTS && 'btn-active!',
              )}
              onClick={() => setActiveDetailView(StatsDetailView.EVENTS)}
            >
              Events
            </button>
          )}
          <button
            className={cx(
              'btn btn-ghost btn-sm rounded-none px-3 text-sm font-semibold',
              activeDetailView === StatsDetailView.WEAPONS && 'btn-active!',
            )}
            onClick={() => setActiveDetailView(StatsDetailView.WEAPONS)}
          >
            Weapons
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-x-auto overflow-y-auto">
          <table className="table-zebra table-sm table">
            <thead>
              <tr>
                <th>Weapon</th>
                <th className="text-center">Kills</th>
                <th className="text-center">HS Kills</th>
                <th className="text-center">HS %</th>
              </tr>
            </thead>
            <tbody>
              {pagedRows.map((row) => (
                <tr
                  key={row.weapon}
                  className={activeTab === StatsTab.TEAMMATES ? '[&>td]:py-1' : undefined}
                >
                  <td>
                    <span className="inline-flex items-center gap-3 font-semibold">
                      <span
                        className={cx(
                          'border-base-content/10 bg-base-200/70 flex items-center justify-center border',
                          activeTab === StatsTab.TEAMMATES ? 'h-15 w-27' : 'h-16 w-28',
                        )}
                      >
                        {row.image ? (
                          <img
                            src={row.image}
                            className={cx(
                              'object-contain',
                              activeTab === StatsTab.TEAMMATES
                                ? 'max-h-13 max-w-23'
                                : 'max-h-14 max-w-24',
                            )}
                          />
                        ) : (
                          <span className="text-base-content/40 text-xs">-</span>
                        )}
                      </span>
                      <span>{row.label}</span>
                    </span>
                  </td>
                  <td className="text-center">{row.kills}</td>
                  <td className="text-center">{row.headshots}</td>
                  <td
                    className={cx(
                      'text-center font-semibold',
                      row.hsPercent >= 50
                        ? 'text-success'
                        : row.hsPercent <= 20
                          ? 'text-error'
                          : 'text-inherit',
                    )}
                  >
                    {row.hsPercent}%
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={4} className="text-base-content/60 py-8 text-center text-sm">
                    No weapon stats for selected filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {rows.length > 0 && (
          <footer className="border-base-content/10 bg-base-100 relative z-10 flex shrink-0 items-center justify-end gap-2 border-t px-3 py-2">
            <button
              className="btn btn-ghost btn-xs rounded-none"
              disabled={weaponPage <= 1}
              onClick={() => setWeaponPage((page) => Math.max(1, page - 1))}
            >
              Prev
            </button>
            <span className="text-xs">
              Page {weaponPage} / {totalPages}
            </span>
            <button
              className="btn btn-ghost btn-xs rounded-none"
              disabled={weaponPage >= totalPages}
              onClick={() => setWeaponPage((page) => Math.min(totalPages, page + 1))}
            >
              Next
            </button>
          </footer>
        )}
      </article>
    );
  };

  const renderEventTable = () => {
    const eventPageSize =
      activeTab === StatsTab.TEAMMATES ? TeammateMatchHistoryPageSize : MatchHistoryPageSize;
    const totalPages = Math.max(1, Math.ceil(tournamentRows.length / eventPageSize));
    const pagedRows = tournamentRows.slice(
      (tournamentPage - 1) * eventPageSize,
      tournamentPage * eventPageSize,
    );

    return (
      <article className="border-base-content/10 rounded-lg border">
        <header className="border-base-content/10 flex items-center gap-1 border-b px-3 py-2">
          <button
            className={cx(
              'btn btn-ghost btn-sm rounded-none px-3 text-sm font-semibold',
              activeDetailView === StatsDetailView.MATCH_HISTORY && 'btn-active!',
            )}
            onClick={() => setActiveDetailView(StatsDetailView.MATCH_HISTORY)}
          >
            {activeTab === StatsTab.TEAMMATES ? 'Match History (Together)' : 'Match History'}
          </button>
          <button
            className={cx(
              'btn btn-ghost btn-sm rounded-none px-3 text-sm font-semibold',
              activeDetailView === StatsDetailView.EVENTS && 'btn-active!',
            )}
            onClick={() => setActiveDetailView(StatsDetailView.EVENTS)}
          >
            Events
          </button>
          {(activeTab === StatsTab.INDIVIDUAL || activeTab === StatsTab.TEAMMATES) && (
            <button
              className={cx(
                'btn btn-ghost btn-sm rounded-none px-3 text-sm font-semibold',
                activeDetailView === StatsDetailView.WEAPONS && 'btn-active!',
              )}
              onClick={() => setActiveDetailView(StatsDetailView.WEAPONS)}
            >
              Weapons
            </button>
          )}
        </header>
        <div className="overflow-x-auto">
          <table className="table-sm table">
            <thead>
              <tr>
                <th>#</th>
                <th>Event</th>
                <th>Team</th>
                <th className="text-center">Maps</th>
                <th className="text-center">+ / -</th>
                <th className="text-center">Rating</th>
              </tr>
            </thead>
            <tbody>
              {pagedRows.map((row, rowIndex) => (
                <tr
                  key={`${row.label}-${rowIndex}`}
                  className={rowIndex % 2 ? 'bg-base-200/50' : 'bg-base-100'}
                >
                  <td className={cx('font-semibold', row.placement === '1st' && 'text-warning')}>
                    {row.placement}
                  </td>
                  <td>
                    <span className="inline-flex items-center gap-2">
                      <img src={row.eventThumbnail} className="size-5 object-contain" />
                      <Link to={row.href} className="link link-hover font-semibold">
                        {row.label}
                      </Link>
                    </span>
                  </td>
                  <td>
                    <img src={row.teamBlazon} className="h-5 w-5 object-contain" />
                  </td>
                  <td className="text-center">{row.mapsPlayed}</td>
                  <td
                    className={cx(
                      'text-center font-semibold',
                      row.plusMinus > 0
                        ? 'text-success'
                        : row.plusMinus < 0
                          ? 'text-error'
                          : 'text-inherit',
                    )}
                  >
                    {new Intl.NumberFormat('en-US', { signDisplay: 'exceptZero' }).format(
                      row.plusMinus,
                    )}
                  </td>
                  <td
                    className={cx(
                      'text-center font-semibold',
                      getRatingColorClass(Number(row.rating)),
                    )}
                  >
                    {row.rating}
                  </td>
                </tr>
              ))}
              {!tournamentRows.length && (
                <tr>
                  <td colSpan={6} className="text-base-content/60 py-8 text-center text-sm">
                    No events for selected filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {tournamentRows.length > 0 && (
          <footer className="border-base-content/10 flex items-center justify-end gap-2 border-t px-3 py-2">
            <button
              className="btn btn-ghost btn-xs rounded-none"
              disabled={tournamentPage <= 1}
              onClick={() => setTournamentPage((page) => Math.max(1, page - 1))}
            >
              Prev
            </button>
            <span className="text-xs">
              Page {tournamentPage} / {totalPages}
            </span>
            <button
              className="btn btn-ghost btn-xs rounded-none"
              disabled={tournamentPage >= totalPages}
              onClick={() => setTournamentPage((page) => Math.min(totalPages, page + 1))}
            >
              Next
            </button>
          </footer>
        )}
      </article>
    );
  };

  const featuredGlobalPlayer =
    globalPlayers.find((player) => String(player.id) === selectedGlobalPlayerPreviewId) ||
    globalPlayers[0];
  const miniPreviewPlayer = globalPlayerPreviewProfile || featuredGlobalPlayer;
  const miniPreviewTeam = globalPlayerPreviewProfile?.team || featuredGlobalPlayer?.team;
  const miniPreviewIsAwper =
    String(miniPreviewPlayer?.role).toUpperCase() === Constants.PlayerRole.SNIPER ||
    String(miniPreviewPlayer?.role).toUpperCase() === Constants.UserRole.AWPER;
  const globalActiveFilterLabels = [
    selectedGlobalFederationSlug
      ? selectedGlobalFederationSlug.replace('esports-', '').replace(/-/g, ' ')
      : '',
    selectedGlobalCountryCode,
    selectedGlobalPlayerTierId
      ? getTierDisplayLabel(Constants.Prestige[Number(selectedGlobalPlayerTierId)])
      : '',
    selectedGlobalPlayerRole === Constants.PlayerRole.SNIPER
      ? 'AWPer'
      : selectedGlobalPlayerRole === Constants.PlayerRole.RIFLER
        ? 'Rifler'
        : '',
    selectedGlobalYear,
  ].filter(Boolean);

  const renderGlobalPlayersList = () => (
    <article className="flex h-full min-h-0 flex-col gap-3">
      <header className="border-base-content/10 grid min-h-28 shrink-0 grid-cols-[180px_260px_minmax(0,1fr)] overflow-hidden rounded-lg border">
        <section className="border-base-content/10 flex flex-col justify-center border-r px-5">
          <p className="text-base-content/60 text-xs">Players</p>
          <p className="text-success mt-1 text-3xl font-black">
            {numGlobalPlayers.toLocaleString()}
          </p>
          <p className="text-base-content/60 text-xs">total players</p>
        </section>
        <section className="border-base-content/10 flex flex-col justify-center border-r px-5">
          <p className="text-base-content/60 text-xs">Active Filters</p>
          <p className="mt-1 text-sm font-semibold">
            {globalActiveFilterLabels.length ? globalActiveFilterLabels.join(' · ') : 'None'}
          </p>
          <p className="text-base-content/60 text-xs">
            {globalActiveFilterLabels.length ? 'Showing filtered players' : 'Showing all players'}
          </p>
        </section>
        {featuredGlobalPlayer ? (
          <section className="relative flex min-w-0 items-center px-5">
            <div className="pointer-events-none absolute inset-y-0 left-0 w-42 overflow-hidden">
              {miniPreviewTeam?.blazon && (
                <img
                  src={miniPreviewTeam.blazon}
                  className="absolute inset-0 h-full w-full scale-110 object-contain object-center opacity-20"
                />
              )}
              <img
                src={miniPreviewPlayer?.avatar || 'resources://avatars/empty.png'}
                className="absolute top-0 left-1/2 h-auto max-w-none -translate-x-1/2"
                style={{ width: 180, maxWidth: 'none' }}
              />
            </div>
            <div className="relative ml-40 min-w-0 px-2">
              <div className="flex items-center gap-2">
                {miniPreviewPlayer?.country?.code && (
                  <span className={cx('fp', miniPreviewPlayer.country.code.toLowerCase())} />
                )}
                <p className="truncate text-xl font-bold">{miniPreviewPlayer?.name}</p>
                {miniPreviewIsAwper && (
                  <span
                    className="bg-success text-success-content inline-flex size-6 items-center justify-center rounded-lg"
                    title="Main AWPer"
                  >
                    <FaCrosshairs className="size-3" />
                  </span>
                )}
              </div>
              {miniPreviewTeam && (
                <p className="text-base-content/80 mt-1 flex items-center gap-2 text-sm">
                  {miniPreviewTeam.blazon && (
                    <img src={miniPreviewTeam.blazon} className="size-5 object-contain" />
                  )}
                  {miniPreviewTeam.name}
                </p>
              )}
              {(globalPlayerPreviewAwards.wins > 0 || globalPlayerPreviewAwards.mvps > 0) && (
                <div className="mt-2 flex gap-2">
                  {globalPlayerPreviewAwards.wins > 0 && (
                    <span className="badge border-yellow-300 bg-yellow-500/20 text-xs font-semibold text-yellow-200">
                      {globalPlayerPreviewAwards.wins}x Major winner
                    </span>
                  )}
                  {globalPlayerPreviewAwards.mvps > 0 && (
                    <span className="badge border-slate-300 bg-slate-500/30 text-xs font-semibold text-slate-100">
                      {globalPlayerPreviewAwards.mvps}x Major MVP
                    </span>
                  )}
                </div>
              )}
            </div>
            <div className="ml-auto grid grid-cols-3 gap-2">
              <div className="border-base-content/10 bg-base-200/40 min-w-24 rounded-lg border px-3 py-2">
                <p
                  className={cx(
                    'text-xl font-black',
                    getRatingColorClass(featuredGlobalPlayer.rating || 0),
                  )}
                >
                  {(featuredGlobalPlayer.rating || 0).toFixed(2)}
                </p>
                <p className="text-base-content/60 text-xs">Rating</p>
              </div>
              <div className="border-base-content/10 bg-base-200/40 min-w-24 rounded-lg border px-3 py-2">
                <p className="text-xl font-black">{featuredGlobalPlayer.maps || 0}</p>
                <p className="text-base-content/60 text-xs">Maps played</p>
              </div>
              <div className="border-base-content/10 bg-base-200/40 min-w-36 rounded-lg border px-3 py-2">
                <p className="text-lg font-black">
                  {featuredGlobalPlayer.kills || 0} / {featuredGlobalPlayer.deaths || 0} /{' '}
                  {featuredGlobalPlayer.assists || 0}
                </p>
                <p className="text-base-content/60 text-xs">K / D / A</p>
              </div>
            </div>
          </section>
        ) : (
          <section className="text-base-content/50 flex items-center justify-center text-sm">
            No player preview available
          </section>
        )}
      </header>
      <div className="border-base-content/10 flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border">
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="table-pin-rows table-sm table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Team</th>
                <th className="text-center">Tier</th>
                <th className="text-center">Rating</th>
                <th className="text-center">Maps</th>
                <th className="text-center">K / D / A</th>
                <th className="w-12" aria-label="Open player statistics" />
              </tr>
            </thead>
            <tbody>
              {globalPlayersLoading && (
                <tr>
                  <td colSpan={7} className="py-12 text-center">
                    <span className="loading loading-bars loading-md" />
                  </td>
                </tr>
              )}
              {!globalPlayersLoading &&
                globalPlayers.map((player, index) => (
                  <tr
                    key={player.id}
                    data-interaction-hover-sound="none"
                    className={cx(
                      'hover:bg-base-content/10 cursor-pointer',
                      String(player.id) === selectedGlobalPlayerPreviewId
                        ? 'bg-primary/10'
                        : index % 2
                          ? 'bg-base-200/50'
                          : 'bg-base-100',
                    )}
                    onClick={() => setSelectedGlobalPlayerPreviewId(String(player.id))}
                  >
                    <td>
                      <span className="flex min-w-0 items-center gap-2">
                        {player.country?.code && (
                          <span className={cx('fp', player.country.code.toLowerCase())} />
                        )}
                        <span className="truncate font-semibold">{player.name}</span>
                      </span>
                    </td>
                    <td>
                      {player.team ? (
                        <span className="inline-flex min-w-0 items-center gap-2">
                          {player.team.blazon && (
                            <img src={player.team.blazon} className="size-5 object-contain" />
                          )}
                          <span className="truncate">{player.team.name}</span>
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="text-center">
                      {player.team?.tier !== undefined && player.team?.tier !== null
                        ? getTierDisplayLabel(Constants.Prestige[player.team.tier])
                        : '-'}
                    </td>
                    <td
                      className={cx(
                        'text-center font-semibold',
                        getRatingColorClass(player.rating || 0),
                      )}
                    >
                      {(player.rating || 0).toFixed(2)}
                    </td>
                    <td className="text-center">{player.maps || 0}</td>
                    <td className="text-center">
                      {player.kills || 0} / {player.deaths || 0} / {player.assists || 0}
                    </td>
                    <td className="w-12 text-center">
                      <button
                        type="button"
                        className="btn btn-ghost btn-xs rounded-lg"
                        title={`View ${player.name}'s statistics`}
                        aria-label={`View ${player.name}'s statistics`}
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedGlobalDetailCompetitionGroup('');
                          setSelectedGlobalDetailMap('');
                          setSelectedGlobalDetailSeason('');
                          setSelectedGlobalDetailTimeframe('');
                          setSelectedGlobalDetailMatchType('');
                          setSelectedGlobalDetailCompetitionStage('');
                          setSelectedGlobalDetailCareerTeamId('');
                          setSelectedGlobalPlayerId(String(player.id));
                          setActiveDetailView(StatsDetailView.MATCH_HISTORY);
                        }}
                      >
                        <FaChevronRight />
                      </button>
                    </td>
                  </tr>
                ))}
              {!globalPlayersLoading && !globalPlayers.length && (
                <tr>
                  <td colSpan={7} className="text-base-content/60 py-12 text-center text-sm">
                    No players found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <footer className="border-base-content/10 flex items-center justify-between border-t px-3 py-2">
          <Pagination
            numPage={globalPlayerPage}
            totalPages={globalPlayerTotalPages}
            onChange={setGlobalPlayerPage}
            onClick={setGlobalPlayerPage}
          />
          <span className="font-mono text-xs">{numGlobalPlayers} Results</span>
        </footer>
      </div>
    </article>
  );

  return (
    <>
      <section className="bg-base-100 fixed inset-x-0 top-16 bottom-0 box-border min-h-0 overflow-hidden">
        <div className="grid h-full min-h-0 grid-cols-1 gap-0 xl:grid-cols-[310px_1fr]">
          <aside className="border-base-content/10 bg-base-100 min-h-0 border-r">
            <header className="border-base-content/10 flex h-22 items-center border-b px-4">
              <nav className="mode-tabs mode-tabs-compact" aria-label="Statistics view">
                {Object.values(StatsTab)
                  .filter(
                    (tab) =>
                      tab !== StatsTab.TOURNAMENTS &&
                      (tab !== StatsTab.GLOBAL_PLAYERS || canViewGlobalPlayerStats),
                  )
                  .map((tab) => (
                    <button
                      key={tab}
                      className={cx(activeTab === tab && 'is-active')}
                      onClick={() => {
                        if (selectedGlobalPlayerId) {
                          closeGlobalPlayerDetail();
                        }
                        setActiveDetailView(StatsDetailView.MATCH_HISTORY);
                        setActiveTab(tab);
                      }}
                    >
                      {tab === StatsTab.INDIVIDUAL
                        ? 'Individual'
                        : tab === StatsTab.TOURNAMENTS
                          ? 'Events'
                          : tab === StatsTab.TEAMMATES
                            ? 'Teammates'
                            : 'Players'}
                    </button>
                  ))}
              </nav>
            </header>

            {isGlobalPlayerListView && (
              <div className="min-h-0 overflow-y-auto p-4">
                <h2 className="text-2xl font-bold">Filters</h2>
                <p className="text-base-content/60 mt-1 text-xs">Find and filter players</p>
                <div className="mt-4 space-y-3">
                  <input
                    type="text"
                    placeholder="Search players..."
                    className="input input-bordered border-base-content/10 bg-base-200 h-10 w-full rounded-lg"
                    value={selectedGlobalPlayerName}
                    onChange={(event) => {
                      setSelectedGlobalPlayerName(event.target.value);
                      setGlobalPlayerPage(1);
                    }}
                  />
                  <fieldset>
                    <label className="label pb-1 text-xs font-semibold uppercase">Federation</label>
                    <select
                      className="select select-bordered border-base-content/10 bg-base-200 h-10 w-full rounded-lg font-semibold shadow-none"
                      value={selectedGlobalFederationSlug}
                      onChange={(event) => {
                        setSelectedGlobalFederationSlug(event.target.value);
                        setGlobalPlayerPage(1);
                      }}
                    >
                      <option value="">Any federation</option>
                      <option value={Constants.FederationSlug.ESPORTS_EUROPA}>Europe</option>
                      <option value={Constants.FederationSlug.ESPORTS_ASIA}>Asia</option>
                      <option value={Constants.FederationSlug.ESPORTS_AMERICAS}>Americas</option>
                      <option value={Constants.FederationSlug.ESPORTS_OCE}>Oceania</option>
                    </select>
                  </fieldset>
                  <fieldset>
                    <label className="label pb-1 text-xs font-semibold uppercase">Country</label>
                    <select
                      className="select select-bordered border-base-content/10 bg-base-200 h-10 w-full rounded-lg font-semibold shadow-none"
                      value={selectedGlobalCountryCode}
                      onChange={(event) => {
                        setSelectedGlobalCountryCode(event.target.value);
                        setGlobalPlayerPage(1);
                      }}
                    >
                      <option value="">Any country</option>
                      {globalPlayerCountries.map((country) => (
                        <option key={country.code} value={country.code}>
                          {country.name}
                        </option>
                      ))}
                    </select>
                  </fieldset>
                  <fieldset>
                    <label className="label pb-1 text-xs font-semibold uppercase">Tier</label>
                    <select
                      className="select select-bordered border-base-content/10 bg-base-200 h-10 w-full rounded-lg font-semibold shadow-none"
                      value={selectedGlobalPlayerTierId}
                      onChange={(event) => {
                        setSelectedGlobalPlayerTierId(event.target.value);
                        setGlobalPlayerPage(1);
                      }}
                    >
                      <option value="">Any tier</option>
                      {Constants.Prestige.map((tierSlug, tierId) => (
                        <option key={tierSlug} value={tierId}>
                          {getTierDisplayLabel(tierSlug)}
                        </option>
                      ))}
                    </select>
                  </fieldset>
                  <fieldset>
                    <label className="label pb-1 text-xs font-semibold uppercase">Role</label>
                    <select
                      className="select select-bordered border-base-content/10 bg-base-200 h-10 w-full rounded-lg font-semibold shadow-none"
                      value={selectedGlobalPlayerRole}
                      onChange={(event) => {
                        setSelectedGlobalPlayerRole(event.target.value);
                        setGlobalPlayerPage(1);
                      }}
                    >
                      <option value="">Any role</option>
                      <option value={Constants.PlayerRole.RIFLER}>Rifler</option>
                      <option value={Constants.PlayerRole.SNIPER}>AWPer</option>
                    </select>
                  </fieldset>
                  <fieldset>
                    <label className="label pb-1 text-xs font-semibold uppercase">Team</label>
                    <select
                      className="select select-bordered border-base-content/10 bg-base-200 h-10 w-full rounded-lg font-semibold shadow-none"
                      value={selectedGlobalListTeamId}
                      onChange={(event) => {
                        setSelectedGlobalListTeamId(event.target.value);
                        setGlobalPlayerPage(1);
                      }}
                    >
                      <option value="">Any team</option>
                      {globalPlayerTeams.map((team) => (
                        <option key={team.id} value={team.id}>
                          {team.name}
                        </option>
                      ))}
                    </select>
                  </fieldset>
                  <fieldset>
                    <label className="label pb-1 text-xs font-semibold uppercase">Season</label>
                    <select
                      className="select select-bordered border-base-content/10 bg-base-200 h-10 w-full rounded-lg font-semibold shadow-none"
                      value={selectedGlobalYear}
                      onChange={(event) => {
                        setSelectedGlobalYear(event.target.value);
                        setGlobalPlayerPage(1);
                      }}
                    >
                      <option value="">All seasons</option>
                      {activeCareerYears.map((year) => (
                        <option key={year} value={year}>
                          {year}
                        </option>
                      ))}
                    </select>
                  </fieldset>
                  <fieldset>
                    <label className="label pb-1 text-xs font-semibold uppercase">
                      Transfer status
                    </label>
                    <select
                      className="select select-bordered border-base-content/10 bg-base-200 h-10 w-full rounded-lg font-semibold shadow-none"
                      value={selectedGlobalTransferStatus}
                      onChange={(event) => {
                        setSelectedGlobalTransferStatus(
                          event.target.value as '' | 'listed' | 'retired',
                        );
                        setGlobalPlayerPage(1);
                      }}
                    >
                      <option value="">Any status</option>
                      <option value="listed">Transfer listed</option>
                      <option value="retired">Retired</option>
                    </select>
                  </fieldset>
                  <fieldset>
                    <label className="label pb-1 text-xs font-semibold uppercase">Sort by</label>
                    <select
                      className="select select-bordered border-base-content/10 bg-base-200 h-10 w-full rounded-lg font-semibold shadow-none"
                      value={selectedGlobalPlayerSort}
                      onChange={(event) => {
                        setSelectedGlobalPlayerSort(
                          event.target.value as
                            | 'rating'
                            | 'kills'
                            | 'deaths'
                            | 'maps'
                            | 'name'
                            | 'team',
                        );
                        setGlobalPlayerPage(1);
                      }}
                    >
                      <option value="rating">Rating</option>
                      <option value="kills">Kills</option>
                      <option value="deaths">Deaths</option>
                      <option value="maps">Maps</option>
                      <option value="name">Name</option>
                      <option value="team">Team</option>
                    </select>
                  </fieldset>
                  <button
                    type="button"
                    className="btn btn-primary w-full rounded-lg"
                    onClick={() => {
                      setGlobalPlayerPage(1);
                      setGlobalPlayerFilterRevision((revision) => revision + 1);
                    }}
                  >
                    Apply filters
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline border-base-content/15 w-full rounded-lg"
                    onClick={() => {
                      setSelectedGlobalPlayerName('');
                      setSelectedGlobalFederationSlug('');
                      setSelectedGlobalCountryCode('');
                      setSelectedGlobalPlayerTierId(
                        String(Constants.Prestige.indexOf(Constants.TierSlug.LEAGUE_PRO)),
                      );
                      setSelectedGlobalPlayerRole('');
                      setSelectedGlobalListTeamId('');
                      setSelectedGlobalYear('');
                      setSelectedGlobalTransferStatus('');
                      setSelectedGlobalPlayerSort('rating');
                      setGlobalPlayerPage(1);
                      setGlobalPlayerFilterRevision((revision) => revision + 1);
                    }}
                  >
                    Reset filters
                  </button>
                </div>
              </div>
            )}

            {activeTab !== StatsTab.TOURNAMENTS && !isGlobalPlayerListView && (
              <div className="p-4">
                <h2 className="text-2xl font-bold">Filters</h2>

                <div className="mt-4 space-y-3">
                  <fieldset>
                    <label className="label pb-1 text-xs font-semibold uppercase">
                      Competition
                    </label>
                    <select
                      className="select select-bordered border-base-content/10 bg-base-200 h-10 w-full rounded-lg font-semibold shadow-none"
                      value={activeSelectedCompetitionGroup}
                      onChange={(e) => setActiveSelectedCompetitionGroup(e.target.value)}
                    >
                      <option value="">Any competition</option>
                      {competitionOptions.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </fieldset>
                  <fieldset>
                    <label className="label pb-1 text-xs font-semibold uppercase">Season</label>
                    <select
                      className="select select-bordered border-base-content/10 bg-base-200 h-10 w-full rounded-lg font-semibold shadow-none"
                      value={activeSelectedSeason}
                      onChange={(e) => setActiveSelectedSeason(e.target.value)}
                    >
                      <option value="">All seasons</option>
                      {seasonOptions.map((season) => (
                        <option key={season} value={season}>{`Season ${season}`}</option>
                      ))}
                    </select>
                  </fieldset>
                  <fieldset>
                    <label className="label pb-1 text-xs font-semibold uppercase">Timeframe</label>
                    <select
                      className="select select-bordered border-base-content/10 bg-base-200 h-10 w-full rounded-lg font-semibold shadow-none"
                      value={activeSelectedTimeframe}
                      onChange={(e) =>
                        setActiveSelectedTimeframe(e.target.value as TimeframeOption)
                      }
                    >
                      {TimeframeOptions.map((option) => (
                        <option key={option || 'all'} value={option}>
                          {TimeframeLabels[option]}
                        </option>
                      ))}
                    </select>
                  </fieldset>
                  <fieldset>
                    <label className="label pb-1 text-xs font-semibold uppercase">Map</label>
                    <select
                      className="select select-bordered border-base-content/10 bg-base-200 h-10 w-full rounded-lg font-semibold shadow-none"
                      value={activeSelectedMap}
                      onChange={(e) => setActiveSelectedMap(e.target.value)}
                    >
                      <option value="">Any map</option>
                      {mapOptions.map((m) => (
                        <option key={m} value={m}>
                          {Util.convertMapPool(m, settingsAll.general.game)}
                        </option>
                      ))}
                    </select>
                  </fieldset>
                  <fieldset>
                    <label className="label pb-1 text-xs font-semibold uppercase">Match type</label>
                    <select
                      className="select select-bordered border-base-content/10 bg-base-200 h-10 w-full rounded-lg font-semibold shadow-none"
                      value={activeSelectedMatchType}
                      onChange={(e) =>
                        setActiveSelectedMatchType(e.target.value as MatchTypeOption)
                      }
                    >
                      {MatchTypeOptions.map((option) => (
                        <option key={option || 'any'} value={option}>
                          {MatchTypeLabels[option]}
                        </option>
                      ))}
                    </select>
                  </fieldset>
                  <fieldset>
                    <label className="label pb-1 text-xs font-semibold uppercase">
                      Competition stage
                    </label>
                    <select
                      className="select select-bordered border-base-content/10 bg-base-200 h-10 w-full rounded-lg font-semibold shadow-none"
                      value={activeSelectedCompetitionStage}
                      onChange={(e) =>
                        setActiveSelectedCompetitionStage(e.target.value as CompetitionStageOption)
                      }
                    >
                      {CompetitionStageOptions.map((option) => (
                        <option key={option || 'any'} value={option}>
                          {CompetitionStageLabels[option]}
                        </option>
                      ))}
                    </select>
                  </fieldset>
                  <fieldset>
                    <label className="label pb-1 text-xs font-semibold uppercase">Team</label>
                    <select
                      className="select select-bordered border-base-content/10 bg-base-200 h-10 w-full rounded-lg font-semibold shadow-none"
                      value={activeSelectedCareerTeamId}
                      onChange={(e) => setActiveSelectedCareerTeamId(e.target.value)}
                    >
                      <option value="">Any team</option>
                      {careerTeamOptions.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </fieldset>
                </div>
              </div>
            )}
          </aside>

          <main
            className={cx(
              'min-h-0 p-3',
              activeTab === StatsTab.GLOBAL_PLAYERS
                ? 'overflow-hidden'
                : 'overflow-x-hidden overflow-y-auto',
            )}
          >
            {isGlobalPlayerListView && renderGlobalPlayersList()}

            {currentLoading && (
              <div className="flex h-full items-center justify-center">
                <span className="loading loading-bars loading-md" />
              </div>
            )}

            {!currentLoading && activeTab !== StatsTab.TOURNAMENTS && !isGlobalPlayerListView && (
              <div className="space-y-3">
                {activeTab === StatsTab.GLOBAL_PLAYERS && (
                  <header className="flex items-center justify-between">
                    <button
                      className="btn btn-ghost btn-sm rounded-none"
                      onClick={closeGlobalPlayerDetail}
                    >
                      Back to players
                    </button>
                    <span className="text-base-content/60 text-xs">
                      Viewing individual statistics
                    </span>
                  </header>
                )}
                {activeTab === StatsTab.TEAMMATES && (
                  <section className="border-base-content/10 flex h-32 gap-2 overflow-hidden rounded-lg border p-2">
                    {pagedTeammates.map((teammate) => (
                      <button
                        key={teammate.id}
                        type="button"
                        className={cx(
                          'border-base-content/10 bg-base-200/35 hover:border-primary/60 relative min-w-0 flex-1 overflow-hidden rounded-lg border transition-colors',
                          selectedTeammateId === String(teammate.id) &&
                            'border-primary ring-primary/30 ring-1',
                        )}
                        onClick={() => {
                          setSelectedTeammateId(String(teammate.id));
                          setActiveDetailView(StatsDetailView.MATCH_HISTORY);
                        }}
                      >
                        <img
                          src={teammate.avatar || 'resources://avatars/empty.png'}
                          className="absolute top-0 left-1/2 h-[112px] w-auto max-w-none -translate-x-1/2 object-contain"
                        />
                        <span className="from-base-300/95 absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 bg-gradient-to-t to-transparent px-2 pt-5 pb-1.5 text-sm font-bold">
                          {teammate.country?.code && (
                            <span className={cx('fp', teammate.country.code.toLowerCase())} />
                          )}
                          <span className="truncate">{teammate.name}</span>
                        </span>
                      </button>
                    ))}
                    {!teammates.length && (
                      <div className="text-base-content/60 flex flex-1 items-center justify-center text-sm">
                        No teammates match the selected filters.
                      </div>
                    )}
                    {teammates.length > TeammatePageSize && (
                      <div className="border-base-content/10 bg-base-200/35 flex w-16 shrink-0 flex-col items-center justify-center gap-2 rounded-lg border">
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm rounded-lg"
                          aria-label="Previous teammates"
                          title="Previous teammates"
                          disabled={teammatePage <= 1}
                          onClick={() => {
                            const nextPage = Math.max(1, teammatePage - 1);
                            setTeammatePage(nextPage);
                            const teammate = teammates[(nextPage - 1) * TeammatePageSize];
                            if (teammate) setSelectedTeammateId(String(teammate.id));
                          }}
                        >
                          <FaChevronLeft />
                        </button>
                        <span className="text-base-content/60 text-[10px]">
                          {teammatePage}/{teammatePageCount}
                        </span>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm rounded-lg"
                          aria-label="Next teammates"
                          title="Next teammates"
                          disabled={teammatePage >= teammatePageCount}
                          onClick={() => {
                            const nextPage = Math.min(teammatePageCount, teammatePage + 1);
                            setTeammatePage(nextPage);
                            const teammate = teammates[(nextPage - 1) * TeammatePageSize];
                            if (teammate) setSelectedTeammateId(String(teammate.id));
                          }}
                        >
                          <FaChevronRight />
                        </button>
                      </div>
                    )}
                  </section>
                )}
                <article className="border-base-content/10 relative min-h-44 overflow-hidden rounded-lg border">
                  {hasMapSelected ? (
                    <img
                      src={featuredMapImage}
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  ) : (
                    <div className="bg-base-300/40 absolute inset-0" />
                  )}
                  <div className="from-base-300/95 via-base-300/85 to-base-300/60 relative flex min-h-44 items-center bg-gradient-to-r p-5">
                    <div className="border-base-content/10 pointer-events-none absolute inset-y-0 left-0 w-42 overflow-hidden border-r">
                      {headerPlayerTeam?.blazon && (
                        <img
                          src={headerPlayerTeam.blazon}
                          className="absolute inset-0 h-full w-full scale-110 object-contain object-center opacity-20"
                        />
                      )}
                      <img
                        src={headerPlayer?.avatar || 'resources://avatars/empty.png'}
                        className="absolute top-0 left-1/2 h-auto max-w-none -translate-x-1/2"
                        style={{ width: 240, maxWidth: 'none' }}
                      />
                    </div>
                    {headerPlayer?.id && (
                      <button
                        type="button"
                        title="View team history"
                        aria-label="View team history"
                        className="border-base-content/15 bg-base-200/65 hover:border-primary/70 hover:bg-base-300 absolute top-2 left-[178px] flex size-7 items-center justify-center rounded-lg border"
                        onClick={() =>
                          api.window.send<ModalRequest>(Constants.WindowIdentifier.Modal, {
                            target: '/transfer',
                            payload: headerPlayer.id,
                          })
                        }
                      >
                        <FaExternalLinkAlt className="size-2.5" />
                      </button>
                    )}
                    {headerPlayerIsAwper && (
                      <span
                        className="bg-success text-success-content absolute top-2 left-[218px] z-10 flex size-7 items-center justify-center rounded-lg"
                        title="Main AWPer"
                      >
                        <FaCrosshairs className="size-3.5" />
                      </span>
                    )}
                    <div className="ml-40 min-w-0">
                      <div className="flex items-center gap-2">
                        {headerPlayer?.country?.code && (
                          <span
                            className={cx('fp', headerPlayer.country.code.toLowerCase())}
                            title={headerPlayer.country.name}
                          />
                        )}
                        <p className="truncate text-2xl font-bold">
                          {headerPlayer?.name || 'Player'}
                        </p>
                      </div>
                      <div className="text-base-content/80 mt-1 flex items-center gap-2 text-sm">
                        {!headerPlayer?.retiredAt && headerPlayerTeam?.blazon && (
                          <img
                            src={headerPlayerTeam.blazon}
                            className="size-8 shrink-0 object-contain"
                          />
                        )}
                        <div className="min-w-0">
                          {activeTab === StatsTab.TEAMMATES ? (
                            <>
                              <p className="truncate">
                                {headerPlayerTeam?.name || 'Former teammate'}
                              </p>
                              <p className="text-base-content/60 text-xs">
                                {sharedTeammateStints.length
                                  ? sharedTeammateStints
                                      .map((stint) => {
                                        const days = Math.max(
                                          1,
                                          differenceInCalendarDays(stint.endedAt, stint.startedAt) +
                                            1,
                                        );
                                        return `${formatAppDate(stint.startedAt)} – ${formatAppDate(stint.endedAt)} (${days} ${days === 1 ? 'day' : 'days'})`;
                                      })
                                      .join(' · ')
                                  : 'Shared stint unavailable'}
                              </p>
                            </>
                          ) : headerPlayer?.retiredAt ? (
                            <p>
                              Retired{' '}
                              <span
                                className="text-base-content/50 inline-flex cursor-help"
                                aria-label={`Retired on ${formatAppDate(headerPlayer.retiredAt)}`}
                                onMouseEnter={(event) =>
                                  showCareerHonorsTooltip(
                                    event,
                                    `Retired on ${formatAppDate(headerPlayer.retiredAt)}`,
                                  )
                                }
                                onMouseLeave={() => setCareerHonorsTooltip(null)}
                              >
                                (?)
                              </span>
                            </p>
                          ) : (
                            <p className="truncate">{headerPlayerTeam?.name || 'Free Agent'}</p>
                          )}
                          <p className="text-base-content/60 text-xs">
                            {headerPlayer?.age
                              ? `${headerPlayer.age} years old`
                              : 'Age unavailable'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                  {activeTab !== StatsTab.TEAMMATES &&
                    (majorAwardCounts.wins > 0 || majorAwardCounts.mvps > 0) && (
                      <div className="absolute bottom-1 left-[182px] flex flex-wrap gap-2">
                        {majorAwardCounts.wins > 0 && (
                          <span className="badge border-yellow-300 bg-yellow-500/20 px-3 py-2 font-semibold text-yellow-200">
                            {majorAwardCounts.wins}x Major winner
                          </span>
                        )}
                        {majorAwardCounts.mvps > 0 && (
                          <span className="badge border-slate-300 bg-slate-500/30 px-3 py-2 font-semibold text-slate-100">
                            {majorAwardCounts.mvps}x Major MVP
                          </span>
                        )}
                      </div>
                    )}
                  {activeTab !== StatsTab.TEAMMATES &&
                    (notableHonors.length > 0 || careerMvps.length > 0) && (
                      <section className="border-base-content/10 absolute top-3 right-4 bottom-3 left-[455px] min-w-0 overflow-hidden border-l pl-4">
                        <header className="flex h-7 items-center gap-2">
                          <FaTrophy className="text-base-content/70 size-4" />
                          <h2 className="text-sm font-bold">Notable Trophies</h2>
                          <span className="bg-base-content/15 h-px flex-1" />
                          {headerPlayer?.id && showcaseHonors.length < notableHonors.length && (
                            <button
                              type="button"
                              className="text-primary hover:text-primary/80 text-xs font-semibold"
                              onClick={() =>
                                api.window.send<ModalRequest>(Constants.WindowIdentifier.Modal, {
                                  target: '/transfer',
                                  payload: headerPlayer.id,
                                })
                              }
                            >
                              View all notable trophies <span aria-hidden="true">›</span>
                            </button>
                          )}
                        </header>
                        <div ref={honorsRowRef} className="mt-2 flex min-w-0 gap-2 overflow-hidden">
                          {careerMvps.length > 0 && (
                            <article
                              className="border-base-content/10 bg-base-200/45 flex h-27 min-w-36 shrink-0 cursor-help flex-col items-center justify-center rounded-lg border px-3 text-center"
                              aria-label={mvpTooltip}
                              onMouseEnter={(event) => showCareerHonorsTooltip(event, mvpTooltip)}
                              onMouseLeave={() => setCareerHonorsTooltip(null)}
                            >
                              <img
                                src="resources://competitions/mvp.png"
                                className="h-12 w-12 object-contain"
                              />
                              <p className="text-sm font-bold">MVP x{careerMvps.length}</p>
                            </article>
                          )}
                          {showcaseHonors.map((honor, index) => (
                            <Link
                              key={`${honor.key}__${index}`}
                              to={`/competitions?competitionId=${honor.competitionId}`}
                              aria-label={`View ${honor.title}`}
                              className={cx(
                                'border-base-content/10 bg-base-200/45 hover:border-primary/60 flex h-27 min-w-36 shrink-0 flex-col items-center justify-center rounded-lg border px-3 text-center transition-colors',
                                honor.tierSlug === Constants.TierSlug.MAJOR_CHAMPIONS_STAGE &&
                                  'border-warning/60 bg-warning/10',
                              )}
                            >
                              <img
                                src={
                                  Util.getCompetitionHonorThumbnail(honor) ||
                                  Util.getCompetitionLogo(honor.tierSlug, honor.federationSlug, {
                                    location: honor.location,
                                    organizer: honor.organizer,
                                  })
                                }
                                className="h-12 w-12 object-contain"
                              />
                              <p className="max-w-56 text-center text-sm leading-tight font-bold">
                                {honor.title}
                              </p>
                            </Link>
                          ))}
                        </div>
                        <div
                          ref={honorsMeasureRef}
                          aria-hidden="true"
                          className="pointer-events-none invisible fixed top-0 left-0 flex gap-2"
                        >
                          {notableHonors.map((honor, index) => (
                            <div
                              key={`${honor.key}__measure__${index}`}
                              className="border-base-content/10 bg-base-200/45 flex h-27 min-w-36 shrink-0 flex-col items-center justify-center rounded-lg border px-3 text-center"
                            >
                              <img
                                src={
                                  Util.getCompetitionHonorThumbnail(honor) ||
                                  Util.getCompetitionLogo(honor.tierSlug, honor.federationSlug, {
                                    location: honor.location,
                                    organizer: honor.organizer,
                                  })
                                }
                                className="h-12 w-12 object-contain"
                              />
                              <p className="max-w-56 text-center text-sm leading-tight font-bold">
                                {honor.title}
                              </p>
                            </div>
                          ))}
                        </div>
                      </section>
                    )}
                </article>

                <div
                  className={cx(
                    'grid gap-3',
                    activeTab === StatsTab.TEAMMATES
                      ? '2xl:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)]'
                      : '2xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]',
                  )}
                >
                  <section className="border-base-content/10 flex min-h-0 flex-col rounded-lg border">
                    <header className="border-base-content/10 border-b px-4 py-3">
                      <h2 className="text-base font-bold">
                        {activeTab === StatsTab.TEAMMATES
                          ? 'Teammate Statistics (Together)'
                          : 'Career Statistics'}
                      </h2>
                    </header>
                    <div
                      className={cx(
                        'grid grid-cols-2 gap-3 p-3 xl:grid-cols-3',
                        activeTab === StatsTab.TEAMMATES && 'flex-1 grid-rows-2',
                      )}
                    >
                      <article className="bg-base-200/55 border-base-content/10 rounded border p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs uppercase opacity-70">Rating</p>
                            <p
                              className={cx(
                                'text-3xl font-black',
                                getRatingColorClass(summary.avgRating),
                              )}
                            >
                              {summary.avgRating.toFixed(2)}
                            </p>
                          </div>
                          <FaChartBar className="text-base-content/60 mt-1 size-5" />
                        </div>
                      </article>
                      <article className="bg-base-200/55 border-base-content/10 rounded border p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs uppercase opacity-70">Kills</p>
                            <p className="text-3xl font-black">{summary.kills}</p>
                          </div>
                          <FaCrosshairs className="text-base-content/60 mt-1 size-5" />
                        </div>
                      </article>
                      <article className="bg-base-200/55 border-base-content/10 rounded border p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs uppercase opacity-70">Deaths</p>
                            <p className="text-3xl font-black">{summary.deaths}</p>
                          </div>
                          <FaSkull className="text-base-content/60 mt-1 size-5" />
                        </div>
                      </article>
                      <article className="bg-base-200/55 border-base-content/10 rounded border p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs uppercase opacity-70">Avg Kills</p>
                            <p className="text-3xl font-black">{summary.avgKills}</p>
                          </div>
                          <FaCrosshairs className="text-base-content/60 mt-1 size-5" />
                        </div>
                      </article>
                      <article className="bg-base-200/55 border-base-content/10 rounded border p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs uppercase opacity-70">K/D</p>
                            <p className="text-3xl font-black">{summary.kdRatio.toFixed(2)}</p>
                          </div>
                          <GiCrossedSwords className="text-base-content/60 mt-1 size-5" />
                        </div>
                      </article>
                      <article className="bg-base-200/55 border-base-content/10 rounded border p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs uppercase opacity-70">Maps Played</p>
                            <p className="text-3xl font-black">{summary.mapsPlayed}</p>
                          </div>
                          <FaMap className="text-base-content/60 mt-1 size-5" />
                        </div>
                      </article>
                    </div>
                  </section>

                  <section className="border-base-content/10 flex min-h-0 flex-col rounded-lg border">
                    <header className="border-base-content/10 flex items-center justify-between border-b px-4 py-3">
                      <h2 className="text-sm font-bold">
                        {activeTab === StatsTab.TEAMMATES
                          ? 'Performance (Together)'
                          : 'Recent Form'}
                      </h2>
                      <span className="text-base-content/60 text-xs">Last 10 Maps</span>
                    </header>
                    {activeTab === StatsTab.TEAMMATES && (
                      <div className="grid grid-cols-3 gap-2 px-3 pt-3">
                        <div className="border-base-content/10 bg-base-200/35 rounded border px-3 py-2">
                          <p className="text-xl font-black">{togetherRecord.maps}</p>
                          <p className="text-base-content/60 text-xs">Maps together</p>
                        </div>
                        <div className="border-base-content/10 bg-base-200/35 rounded border px-3 py-2">
                          <p className="text-xl font-black">{togetherRecord.wins}</p>
                          <p className="text-base-content/60 text-xs">Wins together</p>
                        </div>
                        <div className="border-base-content/10 bg-base-200/35 rounded border px-3 py-2">
                          <p
                            className={cx(
                              'text-xl font-black',
                              togetherRecord.winRate > 50
                                ? 'text-success'
                                : togetherRecord.winRate < 50
                                  ? 'text-error'
                                  : 'text-base-content',
                            )}
                          >
                            {togetherRecord.winRate}%
                          </p>
                          <p className="text-base-content/60 text-xs">Win rate together</p>
                        </div>
                      </div>
                    )}
                    {recentForm.length ? (
                      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_8.25rem] items-stretch gap-3 p-3">
                        <div className="grid min-h-0 min-w-0 grid-cols-[2rem_minmax(0,1fr)] gap-2">
                          <div className="text-base-content/60 flex h-full min-h-28 flex-col justify-between py-0.5 text-right text-[10px]">
                            <span>2.00</span>
                            <span>1.50</span>
                            <span>1.00</span>
                            <span>0.50</span>
                          </div>
                          <div className="relative h-full min-h-0 min-w-0">
                            <svg
                              viewBox="0 0 600 100"
                              preserveAspectRatio="none"
                              className="border-base-content/10 h-full min-h-28 w-full overflow-visible border-b bg-[#07161c]"
                              aria-label="Rating across the last 10 maps"
                              role="img"
                            >
                              <defs>
                                <linearGradient id="recent-form-fill" x1="0" x2="0" y1="0" y2="1">
                                  <stop offset="0%" stopColor="#39d98a" stopOpacity="0.22" />
                                  <stop offset="100%" stopColor="#39d98a" stopOpacity="0.01" />
                                </linearGradient>
                              </defs>
                              {[4, 26, 48, 70, 92].map((line) => (
                                <line
                                  key={line}
                                  x1="16"
                                  x2="584"
                                  y1={line}
                                  y2={line}
                                  stroke="#31505a"
                                  strokeOpacity="0.36"
                                  strokeWidth="0.45"
                                />
                              ))}
                              {recentFormChart.coordinates.map((point) => (
                                <line
                                  key={`vertical-${point.x}`}
                                  x1={point.x}
                                  x2={point.x}
                                  y1="4"
                                  y2="96"
                                  stroke="#31505a"
                                  strokeOpacity="0.24"
                                  strokeWidth="0.45"
                                />
                              ))}
                              <polygon
                                points={recentFormChart.areaPoints}
                                fill="url(#recent-form-fill)"
                              />
                              {recentFormChart.coordinates.slice(1).map((point, index) => {
                                const previous = recentFormChart.coordinates[index];
                                const isLowSegment =
                                  recentForm[index].rating <= Rating.LOW &&
                                  recentForm[index + 1].rating <= Rating.LOW;
                                return (
                                  <line
                                    key={`rating-segment-${index}`}
                                    x1={previous.x}
                                    y1={previous.y}
                                    x2={point.x}
                                    y2={point.y}
                                    stroke={isLowSegment ? '#fb7165' : '#67e8a4'}
                                    strokeWidth="1.5"
                                    strokeLinecap="round"
                                    vectorEffect="non-scaling-stroke"
                                  />
                                );
                              })}
                            </svg>
                            {recentForm.map((match, index) => {
                              const point = recentFormChart.coordinates[index];
                              return (
                                <span
                                  key={`${index}-${match.rating}`}
                                  className={cx(
                                    'pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full',
                                    match.rating >= Rating.HIGH
                                      ? 'bg-success'
                                      : match.rating <= Rating.LOW
                                        ? 'bg-[#fb7165]'
                                        : 'bg-base-content',
                                  )}
                                  style={{ left: `${(point.x / 600) * 100}%`, top: `${point.y}%` }}
                                />
                              );
                            })}
                          </div>
                        </div>
                        <aside className="flex flex-col justify-center gap-2">
                          <div className="border-base-content/10 bg-base-200/35 rounded border p-3 text-center">
                            <p
                              className={cx(
                                'text-xl font-black',
                                getRatingColorClass(recentFormAverage),
                              )}
                            >
                              {recentFormAverage.toFixed(2)}
                            </p>
                            <p className="text-base-content/60 text-xs">Average rating</p>
                          </div>
                          <div className="border-base-content/10 bg-base-200/35 rounded border p-3 text-center">
                            <p
                              className={cx(
                                'text-lg font-black',
                                recentFormChange >= 0 ? 'text-success' : 'text-error',
                              )}
                            >
                              {recentFormChange >= 0 ? '↑' : '↓'}{' '}
                              {Math.abs(recentFormChange).toFixed(0)}%
                            </p>
                            <p className="text-base-content/60 text-xs">vs. previous 10</p>
                          </div>
                        </aside>
                      </div>
                    ) : (
                      <p className="text-base-content/60 px-4 py-16 text-center text-sm">
                        No recent matches available.
                      </p>
                    )}
                  </section>
                </div>

                {activeDetailView === StatsDetailView.EVENTS &&
                (activeTab === StatsTab.INDIVIDUAL ||
                  activeTab === StatsTab.GLOBAL_PLAYERS ||
                  activeTab === StatsTab.TEAMMATES)
                  ? renderEventTable()
                  : activeTab !== StatsTab.GLOBAL_PLAYERS &&
                      activeDetailView === StatsDetailView.WEAPONS
                    ? renderWeaponTable(weaponRows)
                    : renderMatchTable(activePerformances)}
              </div>
            )}

            {!loading && activeTab === StatsTab.TOURNAMENTS && (
              <article className="border-base-content/10 border">
                <header className="border-base-content/10 border-b px-4 py-3 text-sm font-semibold">
                  Participated tournaments
                </header>
                <div className="overflow-x-auto">
                  <table className="table-zebra table-sm table">
                    <thead>
                      <tr>
                        <th>Team</th>
                        <th>
                          <span className="grid grid-cols-[2.75rem_minmax(0,1fr)] items-center gap-2">
                            <span />
                            <span>Tournament</span>
                          </span>
                        </th>
                        <th>Placement</th>
                        <th className="text-center">+ / -</th>
                        <th>Rating</th>
                        <th>Maps</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tournamentRows
                        .slice((tournamentPage - 1) * 15, tournamentPage * 15)
                        .map((row, idx) => (
                          <tr key={row.label + idx}>
                            <td>
                              <img src={row.teamBlazon} className="h-8 w-8 object-contain" />
                            </td>
                            <td>
                              <span className="grid grid-cols-[2.75rem_minmax(0,1fr)] items-center gap-2">
                                <span className="inline-flex justify-start">
                                  {row.tier?.lan && <CompetitionLocationTag tier={row.tier} />}
                                </span>
                                <Link to={row.href} className="link link-hover">
                                  {row.label}
                                </Link>
                              </span>
                            </td>
                            <td
                              className={cx(
                                'font-semibold',
                                row.placement === '#1' ? 'text-warning' : 'text-inherit',
                              )}
                            >
                              {row.placement}
                            </td>
                            <td
                              className={
                                row.plusMinus > 0
                                  ? 'text-success text-center font-semibold'
                                  : row.plusMinus < 0
                                    ? 'text-error text-center font-semibold'
                                    : 'text-center font-semibold text-inherit'
                              }
                            >
                              {new Intl.NumberFormat('en-US', { signDisplay: 'exceptZero' }).format(
                                row.plusMinus,
                              )}
                            </td>
                            <td
                              className={cx(
                                'font-semibold',
                                getRatingColorClass(Number(row.rating)),
                              )}
                            >
                              {row.rating}
                            </td>
                            <td>{row.mapsPlayed}</td>
                          </tr>
                        ))}
                      {!tournamentRows.length && (
                        <tr>
                          <td colSpan={6} className="text-base-content/60 py-8 text-center text-sm">
                            No tournament records for selected filters.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {tournamentRows.length > 0 && (
                  <footer className="border-base-content/10 flex items-center justify-end gap-2 border-t px-3 py-2">
                    <button
                      className="btn btn-ghost btn-xs rounded-none"
                      disabled={tournamentPage <= 1}
                      onClick={() => setTournamentPage((page) => Math.max(1, page - 1))}
                    >
                      Prev
                    </button>
                    <span className="text-xs">
                      Page {tournamentPage} / {Math.max(1, Math.ceil(tournamentRows.length / 15))}
                    </span>
                    <button
                      className="btn btn-ghost btn-xs rounded-none"
                      disabled={
                        tournamentPage >= Math.max(1, Math.ceil(tournamentRows.length / 15))
                      }
                      onClick={() =>
                        setTournamentPage((page) =>
                          Math.min(Math.max(1, Math.ceil(tournamentRows.length / 15)), page + 1),
                        )
                      }
                    >
                      Next
                    </button>
                  </footer>
                )}
              </article>
            )}
          </main>
        </div>
      </section>
      {careerHonorsTooltip &&
        createPortal(
          <div
            className="bg-neutral text-neutral-content pointer-events-none fixed z-[9999] max-w-[280px] rounded px-3 py-2 text-left text-xs leading-relaxed whitespace-pre-line shadow-lg"
            style={careerHonorsTooltip}
          >
            {careerHonorsTooltip.content}
          </div>,
          document.body,
        )}
    </>
  );
}
