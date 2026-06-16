/**
 * League match stats concept route.
 *
 * @module
 */
import React from 'react';
import { groupBy } from 'lodash';
import { format, subMonths } from 'date-fns';
import { Constants, Eagers, Util } from '@liga/shared';
import { cx } from '@liga/frontend/lib';
import { AppStateContext } from '@liga/frontend/redux';
import { Pagination } from '@liga/frontend/components';
import { FaChartBar } from 'react-icons/fa';
import { Link } from 'react-router-dom';
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

type WeaponPerformance = {
  weapon: string;
  label: string;
  image?: string;
  kills: number;
  headshots: number;
  hsPercent: number;
};

type CompetitionGroupKey =
  | 'MAJOR'
  | 'ESL_PRO_LEAGUE'
  | 'ESEA_ADVANCED'
  | 'ESEA_MAIN'
  | 'ESEA_INTERMEDIATE'
  | 'ESEA_OPEN'
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

const GlobalPlayerPageSize = 20;

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

function getTierDisplayLabel(tierSlug?: string | null) {
  if (tierSlug === Constants.TierSlug.LEAGUE_PRO) {
    return 'ESL Pro League';
  }

  if (tierSlug === Constants.TierSlug.LEAGUE_PRO_PLAYOFFS) {
    return 'ESL Pro League Playoffs';
  }

  return tierSlug ? Constants.IdiomaticTier[tierSlug] : 'Competition';
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
    return performance;
  }

  const ratings = Object.values(groupBy(eventsForStats, 'gameId'))
    .map((gameEvents: any) => getPlayerPerformanceFromEvents(playerId, gameEvents).rating)
    .filter((rating: number) => Number.isFinite(rating));

  if (!ratings.length) {
    return performance;
  }

  return {
    ...performance,
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
  const [loading, setLoading] = React.useState(true);
  const [activeTab, setActiveTab] = React.useState<StatsTab>(StatsTab.INDIVIDUAL);
  const [activeDetailView, setActiveDetailView] = React.useState<StatsDetailView>(
    StatsDetailView.MATCH_HISTORY,
  );
  const [matches, setMatches] = React.useState<MatchRecord[]>([]);
  const [globalPlayerMatches, setGlobalPlayerMatches] = React.useState<MatchRecord[]>([]);
  const [globalPlayers, setGlobalPlayers] = React.useState<StatsPlayerOption[]>([]);
  const [globalPlayerTeams, setGlobalPlayerTeams] = React.useState<Array<any>>([]);
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
  const [selectedGlobalPlayerTierId, setSelectedGlobalPlayerTierId] = React.useState<string>(
    String(Constants.Prestige.indexOf(Constants.TierSlug.LEAGUE_PRO)),
  );
  const [selectedGlobalPlayerSort, setSelectedGlobalPlayerSort] = React.useState<
    'rating' | 'kills' | 'deaths' | 'maps' | 'name' | 'team'
  >('rating');
  const [matchPage, setMatchPage] = React.useState(1);
  const [tournamentPage, setTournamentPage] = React.useState(1);
  const [globalPlayersLoading, setGlobalPlayersLoading] = React.useState(false);
  const [globalPlayerMatchesLoading, setGlobalPlayerMatchesLoading] = React.useState(false);
  const previousActiveTab = React.useRef<StatsTab>(activeTab);
  const shouldDefaultTeammateTeam = React.useRef(false);
  const canViewGlobalPlayerStats = Boolean(state.profile?.simulateNpcMatchStats);
  const isGlobalPlayerDetailView = activeTab === StatsTab.GLOBAL_PLAYERS && !!selectedGlobalPlayerId;
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
  const setActiveSelectedMap = isGlobalPlayerDetailView ? setSelectedGlobalDetailMap : setSelectedMap;
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
  }, [canViewGlobalPlayerStats]);

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
        federationSlug: selectedGlobalFederationSlug || undefined,
        name: selectedGlobalPlayerName || undefined,
        page: globalPlayerPage,
        pageSize: GlobalPlayerPageSize,
        sort: selectedGlobalPlayerSort,
        teamId: selectedGlobalListTeamId ? Number(selectedGlobalListTeamId) : undefined,
        tierId: selectedGlobalPlayerTierId ? Number(selectedGlobalPlayerTierId) : undefined,
        year: selectedGlobalYear || undefined,
      })
      .then(({ players, total }) => {
        setNumGlobalPlayers(total);
        setGlobalPlayers(players);
      })
      .finally(() => setGlobalPlayersLoading(false));
  }, [
    activeTab,
    canViewGlobalPlayerStats,
    globalPlayerPage,
    selectedGlobalFederationSlug,
    selectedGlobalListTeamId,
    selectedGlobalPlayerName,
    selectedGlobalPlayerSort,
    selectedGlobalPlayerTierId,
    selectedGlobalYear,
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
  }, [
    activeTab,
    canViewGlobalPlayerStats,
    selectedGlobalPlayerId,
  ]);

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
    const map = new Map<number, { id: number; name: string; avatar?: string }>();

    matchesByFilters.forEach((match: any) => {
      const ownTeam = getCareerMatchCompetitor(match, careerStints, activeSelectedCareerTeamId);
      const userTeamStints = careerStints.filter(
        (stint: any) =>
          stint.teamId === ownTeam?.teamId &&
          isWithinStint(match.date, stint.startedAt, stint.endedAt),
      );
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

        if (hasOverlap) {
          map.set(player.id, { id: player.id, name: player.name, avatar: player.avatar });
        }
      });
    });

    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [matchesByFilters, careerStints, activeSelectedCareerTeamId, state.profile?.player?.id]);

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
    setMatchPage(1);
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
  }, [activeTab]);

  React.useEffect(() => {
    const enteredTeammatesTab =
      activeTab === StatsTab.TEAMMATES && previousActiveTab.current !== StatsTab.TEAMMATES;
    previousActiveTab.current = activeTab;

    if (enteredTeammatesTab) {
      shouldDefaultTeammateTeam.current = true;
    }

    if (activeTab !== StatsTab.TEAMMATES) {
      return;
    }

    if (selectedCareerTeamId) {
      shouldDefaultTeammateTeam.current = false;
      return;
    }

    if (!shouldDefaultTeammateTeam.current) {
      return;
    }

    const currentTeamId = state.profile?.teamId;
    if (!currentTeamId) {
      shouldDefaultTeammateTeam.current = false;
      return;
    }

    if (currentTeamId && careerTeamOptions.some((team: any) => team.id === currentTeamId)) {
      shouldDefaultTeammateTeam.current = false;
      setSelectedCareerTeamId(String(currentTeamId));
      return;
    }

    if (careerTeamOptions.length || careerStints.length) {
      shouldDefaultTeammateTeam.current = false;
    }
  }, [activeTab, selectedCareerTeamId, state.profile?.teamId, careerTeamOptions, careerStints]);

  const teammatePerformances = React.useMemo(() => {
    if (!selectedTeammateId) return [] as MatchPerformance[];
    const teammateId = Number(selectedTeammateId);

    return matchesByFilters.flatMap((match: any) => {
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
      number,
      {
        label: string;
        placement: string;
        plusMinus: number;
        ratingSum: number;
        count: number;
        mapsPlayed: number;
        teamBlazon: string;
        href: string;
        tier?: { lan?: boolean | null };
      }
    >();

    ownPlayerPerformances.forEach((item: any) => {
      const compId = item.match.competitionId || 0;
      const ownTeam = getCareerMatchCompetitor(item.match, careerStints);
      const placement = item.match.competition?.competitors?.find(
        (c: any) => c.teamId === ownTeam?.teamId,
      )?.position;
      const existing = grouped.get(compId);
      const playedMaps = getPlayedGames(item.match).length;

      if (!existing) {
        grouped.set(compId, {
          label: getCompetitionLabel(item.match),
          placement: placement ? `#${placement}` : '-',
          plusMinus: item.plusMinus,
          ratingSum: item.rating,
          count: 1,
          mapsPlayed: playedMaps,
          teamBlazon: ownTeam?.team.blazon || 'resources://blazonry/noteam.svg',
          tier: item.match.competition?.tier,
          href: item.match.competition
            ? `/competitions?federationId=${item.match.competition.federationId}&season=${item.match.competition.season}&tierId=${item.match.competition.tierId}`
            : '/competitions',
        });
      } else {
        existing.plusMinus += item.plusMinus;
        existing.ratingSum += item.rating;
        existing.count += 1;
        existing.mapsPlayed += playedMaps;
      }
    });

    return [...grouped.values()].map((row) => ({
      ...row,
      rating: (row.ratingSum / row.count).toFixed(2),
    }));
  }, [ownPlayerPerformances, careerStints]);

  const activeStatsPlayerId =
    activeTab === StatsTab.TEAMMATES
      ? Number(selectedTeammateId)
      : activeTab === StatsTab.GLOBAL_PLAYERS
        ? Number(selectedGlobalPlayerId)
        : state.profile?.player?.id;

  const weaponRows = React.useMemo(() => {
    const playerId = activeStatsPlayerId;
    if (!playerId) return [] as WeaponPerformance[];

    const grouped = new Map<string, { kills: number; headshots: number }>();

    matchesByFilters.forEach((match: any) => {
      if (match.matchType === 'FACEIT_PUG') {
        return;
      }

      const played =
        (match.players || []).some((player: any) => player.id === playerId) ||
        hasPlayerEvents(playerId, match.events || []);
      if (!played) {
        return;
      }

      const gamesForStats = activeSelectedMap
        ? getPlayedGames(match).filter((game: any) => game.map === activeSelectedMap)
        : getPlayedGames(match);
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
  }, [activeStatsPlayerId, matchesByFilters, activeSelectedMap]);

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
        acc.plusMinus += item.plusMinus;
        acc.ratingSum += item.rating;
        return acc;
      },
      { matches: 0, kills: 0, deaths: 0, plusMinus: 0, ratingSum: 0 },
    );

    return {
      ...totals,
      avgRating: totals.matches ? Number((totals.ratingSum / totals.matches).toFixed(2)) : 0,
      kdRatio: totals.deaths ? Number((totals.kills / totals.deaths).toFixed(2)) : totals.kills,
      avgKills: totals.matches ? Math.round(totals.kills / totals.matches) : 0,
      mapsPlayed: activePerformances.reduce((acc: number, item: any) => {
        const playedGames = getPlayedGames(item.match);
        if (activeSelectedMap) {
          return acc + playedGames.filter((game: any) => game.map === activeSelectedMap).length;
        }
        return acc + playedGames.length;
      }, 0),
    };
  }, [activePerformances, activeSelectedMap]);

  const featuredMapSlug =
    activeSelectedMap || getPlayedGames(activePerformances[0]?.match || {})[0]?.map || 'de_mirage';
  const featuredMapImage = Util.convertMapPool(featuredMapSlug, settingsAll.general.game, true);
  const featuredMapLabel = Util.convertMapPool(featuredMapSlug, settingsAll.general.game);
  const hasMapSelected = !!activeSelectedMap;
  const selectedFilterTeam = careerTeamOptions.find(
    (team: any) => String(team.id) === activeSelectedCareerTeamId,
  );
  const headerTeamLabel =
    activeTab === StatsTab.GLOBAL_PLAYERS
      ? selectedFilterTeam?.name || 'Any team'
      : activeTab !== StatsTab.TEAMMATES
        ? selectedFilterTeam?.name || state.profile?.team?.name || 'Free Agent'
        : selectedFilterTeam?.name || 'Any team';
  const headerTeamLogo =
    (activeTab === StatsTab.TEAMMATES || activeTab === StatsTab.GLOBAL_PLAYERS) &&
    !activeSelectedCareerTeamId
      ? null
      : selectedFilterTeam?.blazon ||
        state.profile?.team?.blazon ||
        'resources://blazonry/noteam.svg';
  const selectedGlobalPlayer = globalPlayers.find(
    (player) => String(player.id) === selectedGlobalPlayerId,
  );
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
        };
      });
    });
    const totalPages = Math.max(1, Math.ceil(flattenedRows.length / 15));
    const pagedRows = flattenedRows.slice((matchPage - 1) * 15, matchPage * 15);

    return (
      <article className="border-base-content/10 rounded-none border">
        <header className="border-base-content/10 flex items-center gap-1 border-b px-3 py-2">
          <button
            className={cx(
              'btn btn-ghost btn-sm rounded-none px-3 text-sm font-semibold',
              activeDetailView === StatsDetailView.MATCH_HISTORY && 'btn-active!',
            )}
            onClick={() => setActiveDetailView(StatsDetailView.MATCH_HISTORY)}
          >
            Match History
          </button>
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
          <table className="table-zebra table-sm table">
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
                <th className="text-center">Rating</th>
              </tr>
            </thead>
            <tbody>
              {pagedRows.map((row) => (
                <tr key={row.key}>
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
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={9} className="text-base-content/60 py-8 text-center text-sm">
                    No matches for selected filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {rows.length > 0 && (
          <footer className="border-base-content/10 flex items-center justify-end gap-2 border-t px-3 py-2">
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

  const renderWeaponTable = (rows: WeaponPerformance[]) => (
    <article className="border-base-content/10 flex min-h-0 flex-col rounded-none border">
      <header className="border-base-content/10 flex items-center gap-1 border-b px-3 py-2">
        <button
          className={cx(
            'btn btn-ghost btn-sm rounded-none px-3 text-sm font-semibold',
            activeDetailView === StatsDetailView.MATCH_HISTORY && 'btn-active!',
          )}
          onClick={() => setActiveDetailView(StatsDetailView.MATCH_HISTORY)}
        >
          Match History
        </button>
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
            {rows.map((row) => (
              <tr key={row.weapon}>
                <td>
                  <span className="inline-flex items-center gap-3 font-semibold">
                    <span className="border-base-content/10 bg-base-200/70 flex h-16 w-28 items-center justify-center border">
                      {row.image ? (
                        <img src={row.image} className="max-h-14 max-w-24 object-contain" />
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
    </article>
  );

  const renderGlobalPlayersList = () => (
    <article className="border-base-content/10 flex h-full min-h-0 flex-col border">
      <header className="border-base-content/10 grid grid-cols-1 gap-3 border-b p-3 xl:grid-cols-[1fr_180px_160px_130px_150px_180px]">
        <input
          type="text"
          placeholder="Search players"
          className="input input-sm input-bordered w-full rounded-none"
          value={selectedGlobalPlayerName}
          onChange={(event) => setSelectedGlobalPlayerName(event.target.value)}
        />
        <select
          className="select select-sm select-bordered w-full rounded-none"
          value={selectedGlobalListTeamId}
          onChange={(event) => setSelectedGlobalListTeamId(event.target.value)}
        >
          <option value="">Any team</option>
          {careerTeamOptions.map((team: any) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </select>
        <select
          className="select select-sm select-bordered w-full rounded-none"
          value={selectedGlobalFederationSlug}
          onChange={(event) => setSelectedGlobalFederationSlug(event.target.value)}
        >
          <option value="">Any federation</option>
          <option value={Constants.FederationSlug.ESPORTS_EUROPA}>Europe</option>
          <option value={Constants.FederationSlug.ESPORTS_ASIA}>Asia</option>
          <option value={Constants.FederationSlug.ESPORTS_AMERICAS}>Americas</option>
          <option value={Constants.FederationSlug.ESPORTS_OCE}>Oceania</option>
        </select>
        <select
          className="select select-sm select-bordered w-full rounded-none"
          value={selectedGlobalYear}
          onChange={(event) => setSelectedGlobalYear(event.target.value)}
        >
          <option value="">All years</option>
          {activeCareerYears.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
        <select
          className="select select-sm select-bordered w-full rounded-none"
          value={selectedGlobalPlayerTierId}
          onChange={(event) => setSelectedGlobalPlayerTierId(event.target.value)}
        >
          <option value="">Any tier</option>
          {Constants.Prestige.map((tierSlug, tierId) => (
            <option key={tierSlug} value={tierId}>
              {getTierDisplayLabel(tierSlug)}
            </option>
          ))}
        </select>
        <select
          className="select select-sm select-bordered w-full rounded-none"
          value={selectedGlobalPlayerSort}
          onChange={(event) =>
            setSelectedGlobalPlayerSort(
              event.target.value as 'rating' | 'kills' | 'deaths' | 'maps' | 'name' | 'team',
            )
          }
        >
          <option value="rating">Sort by rating</option>
          <option value="kills">Sort by kills</option>
          <option value="deaths">Sort by deaths</option>
          <option value="maps">Sort by maps</option>
          <option value="name">Sort by name</option>
          <option value="team">Sort by team</option>
        </select>
      </header>
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
            </tr>
          </thead>
          <tbody>
            {globalPlayersLoading && (
              <tr>
                <td colSpan={6} className="py-12 text-center">
                  <span className="loading loading-bars loading-md" />
                </td>
              </tr>
            )}
            {!globalPlayersLoading &&
              globalPlayers.map((player) => (
                <tr
                  key={player.id}
                  data-interaction-hover-sound="none"
                  className="hover:bg-base-content/10 cursor-pointer"
                  onClick={() => {
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
                </tr>
              ))}
            {!globalPlayersLoading && !globalPlayers.length && (
              <tr>
                <td colSpan={6} className="text-base-content/60 py-12 text-center text-sm">
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
    </article>
  );

  return (
    <section className="bg-base-300/40 fixed inset-0 box-border min-h-0 overflow-hidden">
      <header className="stack-x border-base-content/10 bg-base-200 w-full gap-0! border-b">
        {Object.values(StatsTab)
          .filter((tab) => tab !== StatsTab.GLOBAL_PLAYERS || canViewGlobalPlayerStats)
          .map((tab) => (
            <button
              key={tab}
              className={cx(
                'btn btn-wide border-base-content/10 rounded-none border-0 border-r font-normal shadow-none',
                activeTab === tab && 'btn-active!',
              )}
              onClick={() => {
                if (selectedGlobalPlayerId) {
                  closeGlobalPlayerDetail();
                }
                setActiveTab(tab);
              }}
            >
              {tab === StatsTab.INDIVIDUAL
                ? 'Individual'
                : tab === StatsTab.TOURNAMENTS
                  ? 'Tournaments'
                  : tab === StatsTab.TEAMMATES
                    ? 'Teammates'
                    : 'All Players'}
            </button>
          ))}
      </header>

      <div
        className={`grid h-[calc(100%-48px)] min-h-0 grid-cols-1 gap-0 ${activeTab === StatsTab.TOURNAMENTS || isGlobalPlayerListView ? '' : 'xl:grid-cols-[310px_1fr]'}`}
      >
        {activeTab !== StatsTab.TOURNAMENTS && !isGlobalPlayerListView && (
          <aside className="border-base-content/10 bg-base-100 border-r p-4">
            <h2 className="text-2xl font-bold">Filters</h2>
            <p className="text-base-content/60 mt-1 text-xs">
              Timeframe, competition, season, map and team filters.
            </p>

            {activeTab === StatsTab.TEAMMATES && (
              <section className="border-base-content/10 mt-4 border p-2">
                <p className="text-base-content/70 mb-2 text-xs uppercase">Teammates</p>
                <div
                  className={cx(
                    'grid grid-cols-3 gap-2',
                    teammates.length > 6 && 'max-h-36 overflow-y-auto pr-1',
                  )}
                >
                  {teammates.map((teammate) => (
                    <button
                      key={teammate.id}
                      className={`border p-1 ${selectedTeammateId === String(teammate.id) ? 'border-primary' : 'border-base-content/10'}`}
                      onClick={() => setSelectedTeammateId(String(teammate.id))}
                    >
                      <img
                        src={teammate.avatar || 'resources://avatars/empty.png'}
                        className="mx-auto h-14 w-14 object-cover"
                      />
                    </button>
                  ))}
                </div>
              </section>
            )}

            <div className="mt-4 space-y-3">
              <fieldset>
                <label className="label pb-1 text-xs font-semibold uppercase">Competition</label>
                <select
                  className="select select-sm select-bordered w-full rounded-none"
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
                  className="select select-sm select-bordered w-full rounded-none"
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
                  className="select select-sm select-bordered w-full rounded-none"
                  value={activeSelectedTimeframe}
                  onChange={(e) => setActiveSelectedTimeframe(e.target.value as TimeframeOption)}
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
                  className="select select-sm select-bordered w-full rounded-none"
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
                  className="select select-sm select-bordered w-full rounded-none"
                  value={activeSelectedMatchType}
                  onChange={(e) => setActiveSelectedMatchType(e.target.value as MatchTypeOption)}
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
                  className="select select-sm select-bordered w-full rounded-none"
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
                  className="select select-sm select-bordered w-full rounded-none"
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
          </aside>
        )}

        <main
          className={cx(
            'min-h-0 p-3',
            isGlobalPlayerListView
              ? 'overflow-hidden'
              : activeTab !== StatsTab.TOURNAMENTS && activeDetailView === StatsDetailView.WEAPONS
                ? 'overflow-hidden'
                : 'overflow-y-auto',
          )}
        >
          {isGlobalPlayerListView && renderGlobalPlayersList()}

          {currentLoading && (
            <div className="flex h-full items-center justify-center">
              <span className="loading loading-bars loading-md" />
            </div>
          )}

          {!currentLoading && activeTab !== StatsTab.TOURNAMENTS && !isGlobalPlayerListView && (
            <div className={cx(activeDetailView === StatsDetailView.WEAPONS && 'h-full min-h-0')}>
              {activeTab === StatsTab.GLOBAL_PLAYERS && (
                <header className="mb-3 flex items-center justify-between">
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
              <div
                className={cx(
                  'grid grid-cols-1 gap-3 2xl:grid-cols-[500px_1fr]',
                  activeDetailView === StatsDetailView.WEAPONS && 'h-[calc(100%-44px)] min-h-0',
                )}
              >
                <article className="border-base-content/10 relative border">
                  {hasMapSelected ? (
                    <img
                      src={featuredMapImage}
                      className="h-full min-h-[520px] w-full object-cover"
                    />
                  ) : (
                    <div className="bg-base-300/40 h-full min-h-[520px] w-full" />
                  )}
                  <div className="from-base-300/95 via-base-300/80 to-base-300/45 absolute inset-0 bg-gradient-to-t p-4">
                    {headerTeamLogo && (
                      <img
                        src={headerTeamLogo}
                        className="absolute top-4 right-4 h-14 w-14 object-contain"
                      />
                    )}
                    <div className="mb-4 flex items-center gap-3">
                      <img
                        src={
                          (activeTab === StatsTab.TEAMMATES
                            ? teammates.find((t) => String(t.id) === selectedTeammateId)?.avatar
                            : activeTab === StatsTab.GLOBAL_PLAYERS
                              ? selectedGlobalPlayer?.avatar
                              : state.profile?.player?.avatar) || 'resources://avatars/empty.png'
                        }
                        className="border-base-content/20 h-24 w-24 border object-cover"
                      />
                      <div>
                        <p className="text-2xl font-bold">
                          {activeTab === StatsTab.TEAMMATES
                            ? teammates.find((t) => String(t.id) === selectedTeammateId)?.name ||
                              'Teammate'
                            : activeTab === StatsTab.GLOBAL_PLAYERS
                              ? selectedGlobalPlayer?.name || 'Player'
                              : state.profile?.player?.name || 'Player'}
                        </p>
                        <p className="text-base-content/70 text-xs">{headerTeamLabel}</p>
                        <p className="text-primary text-xs">
                          {hasMapSelected ? featuredMapLabel || featuredMapSlug : 'All maps'}
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <article className="bg-base-200/55 p-4">
                        <p className="text-xs uppercase opacity-70">Rating</p>
                        <p className="text-3xl font-black">{summary.avgRating.toFixed(2)}</p>
                      </article>
                      <article className="bg-base-200/55 p-4">
                        <p className="text-xs uppercase opacity-70">Avg Kills</p>
                        <p className="text-3xl font-black">{summary.avgKills}</p>
                      </article>
                      <article className="bg-base-200/55 p-4">
                        <p className="text-xs uppercase opacity-70">Kills</p>
                        <p className="text-3xl font-black">{summary.kills}</p>
                      </article>
                      <article className="bg-base-200/55 p-4">
                        <p className="text-xs uppercase opacity-70">Deaths</p>
                        <p className="text-3xl font-black">{summary.deaths}</p>
                      </article>
                      <article className="bg-base-200/55 p-4">
                        <p className="text-xs uppercase opacity-70">K/D</p>
                        <p className="text-3xl font-black">{summary.kdRatio.toFixed(2)}</p>
                      </article>
                      <article className="bg-base-200/55 p-4">
                        <p className="text-xs uppercase opacity-70">Maps Played</p>
                        <p className="text-3xl font-black">{summary.mapsPlayed}</p>
                      </article>
                    </div>
                  </div>
                </article>

                {activeTab !== StatsTab.GLOBAL_PLAYERS &&
                activeDetailView === StatsDetailView.WEAPONS
                  ? renderWeaponTable(weaponRows)
                  : renderMatchTable(activePerformances)}
              </div>
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
                            className={cx('font-semibold', getRatingColorClass(Number(row.rating)))}
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
                    disabled={tournamentPage >= Math.max(1, Math.ceil(tournamentRows.length / 15))}
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
  );
}
