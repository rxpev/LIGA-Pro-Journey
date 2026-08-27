/**
 * Calendar route.
 *
 * @module
 */
import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  addMonths,
  addYears,
  differenceInCalendarMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  getDay,
  isLeapYear,
  isSameDay,
  startOfMonth,
  startOfWeek,
  subMonths,
  subYears,
} from 'date-fns';
import { Constants, Eagers, Util } from '@liga/shared';
import { AppStateContext } from '@liga/frontend/redux';
import { cx } from '@liga/frontend/lib';
import { useTranslation } from '@liga/frontend/hooks';
import { Image } from '@liga/frontend/components';
import swissTeamPlaceholder from '@liga/frontend/assets/swiss/teamplaceholder.svg';
import { getTeamsRoundLabel } from './teams/labels';
import { getStageDatesForYear } from './competitions/competitions';
import {
  FaCalendarAlt,
  FaCalendarDay,
  FaChevronLeft,
  FaChevronRight,
  FaFileContract,
  FaTrophy,
} from 'react-icons/fa';

const CalendarMatchEager = {
  include: {
    ...Eagers.match.include,
    players: {
      select: { id: true },
    },
  },
} as const;

/** @type {MatchesResponse} */
type MatchesResponse = Awaited<ReturnType<typeof api.matches.all<typeof CalendarMatchEager>>>;
type CalendarMatchDetails = Awaited<
  ReturnType<typeof api.matches.all<typeof Eagers.matchEvents>>
>[number];
type CalendarMode = 'mine' | 'global' | 'yearly';
type CalendarMatch = MatchesResponse[number];
type YearlyCompetition = Awaited<
  ReturnType<typeof api.competitions.all<typeof Eagers.competition>>
>[number];
type CareerStint = {
  teamId: number | null;
  startedAt: Date | string;
  endedAt: Date | string | null;
  team?: {
    id: number;
    name: string;
    blazon: string;
  } | null;
};
type CareerCalendarEntry = {
  date: Date | string;
  duration: string | null;
  id: string;
  label: string;
  team: NonNullable<CareerStint['team']>;
  type: 'joined' | 'left' | 'signed';
};
type YearlyCalendarAction = {
  competition?: YearlyCompetition;
  date: Date;
  position: { x: number; y: number };
};

enum Rating {
  LOW = 0.95,
  HIGH = 1.05,
}

const YEARLY_WINNER_EVENT_TYPES: Array<{
  label: string;
  tiers: Constants.TierSlug[];
}> = [
  { label: 'Major', tiers: [Constants.TierSlug.MAJOR_CHAMPIONS_STAGE] },
  { label: 'IEM Cologne', tiers: [Constants.TierSlug.IEM_COLOGNE_PLAYOFFS] },
  { label: 'IEM Krakow', tiers: [Constants.TierSlug.IEM_KRAKOW_PLAYOFFS] },
  { label: 'BLAST Finals', tiers: [Constants.TierSlug.BLAST_FINALS] },
  { label: 'ESL Pro League', tiers: [Constants.TierSlug.LEAGUE_PRO_PLAYOFFS] },
  { label: 'ESL Challenger', tiers: [Constants.TierSlug.ESL_CHALLENGER_PLAYOFFS] },
  { label: 'CCT Global Finals', tiers: [Constants.TierSlug.CCT_GLOBAL_FINALS] },
];

/** @constant */
const DAYS_PER_WEEK = 7;

const TOURNAMENT_COLORS: Partial<Record<Constants.LeagueSlug | string, string>> = {
  [Constants.LeagueSlug.ESPORTS_LEAGUE]: '#8fc37d',
  [Constants.LeagueSlug.ESPORTS_MAJOR]: '#dd1f24',
  [Constants.LeagueSlug.ESPORTS_CCT]: '#f6cf5b',
  [Constants.LeagueSlug.ESPORTS_CCT_GLOBAL]: '#f1c232',
  [Constants.LeagueSlug.ESPORTS_BLAST]: '#a897cb',
  [Constants.LeagueSlug.ESPORTS_IEM_COLOGNE]: '#6797df',
  [Constants.LeagueSlug.ESPORTS_IEM_COLOGNE_QUALIFIER]: '#9db9e7',
  [Constants.LeagueSlug.ESPORTS_IEM_KRAKOW]: '#79aab2',
  [Constants.LeagueSlug.ESPORTS_IEM_KRAKOW_QUALIFIER]: '#a7cdd1',
  [Constants.LeagueSlug.ESPORTS_PRO_LEAGUE]: '#65a64b',
  [Constants.LeagueSlug.ESPORTS_ESL_CHALLENGER]: '#bd78a5',
  [Constants.LeagueSlug.ESPORTS_ESEA_CASH_CUP]: '#b5d5a8',
};

const CALENDAR_TIER_PRIORITY: Partial<Record<Constants.TierSlug | string, number>> = {
  [Constants.TierSlug.MAJOR_CHAMPIONS_STAGE]: 10,
  [Constants.TierSlug.MAJOR_LEGENDS_STAGE]: 20,
  [Constants.TierSlug.MAJOR_CHALLENGERS_STAGE]: 30,
  [Constants.TierSlug.IEM_COLOGNE_PLAYOFFS]: 40,
  [Constants.TierSlug.IEM_KRAKOW_PLAYOFFS]: 40,
  [Constants.TierSlug.BLAST_FINALS]: 50,
  [Constants.TierSlug.LEAGUE_PRO_PLAYOFFS]: 60,
  [Constants.TierSlug.LEAGUE_PRO]: 70,
  [Constants.TierSlug.LEAGUE_ADVANCED_PLAYOFFS]: 80,
  [Constants.TierSlug.LEAGUE_ADVANCED]: 90,
  [Constants.TierSlug.LEAGUE_MAIN_PLAYOFFS]: 100,
  [Constants.TierSlug.LEAGUE_MAIN]: 110,
  [Constants.TierSlug.LEAGUE_INTERMEDIATE_PLAYOFFS]: 120,
  [Constants.TierSlug.LEAGUE_INTERMEDIATE]: 130,
  [Constants.TierSlug.LEAGUE_OPEN_PLAYOFFS]: 140,
  [Constants.TierSlug.LEAGUE_OPEN]: 150,
};

const ESEA_SEASON_TIER_SLUGS = new Set<Constants.TierSlug>([
  Constants.TierSlug.LEAGUE_OPEN,
  Constants.TierSlug.LEAGUE_INTERMEDIATE,
  Constants.TierSlug.LEAGUE_MAIN,
  Constants.TierSlug.LEAGUE_ADVANCED,
  Constants.TierSlug.LEAGUE_OPEN_PLAYOFFS,
  Constants.TierSlug.LEAGUE_INTERMEDIATE_PLAYOFFS,
  Constants.TierSlug.LEAGUE_MAIN_PLAYOFFS,
  Constants.TierSlug.LEAGUE_ADVANCED_PLAYOFFS,
]);

function getTournamentColor(match: CalendarMatch) {
  const leagueSlug = match.competition?.tier?.league?.slug;

  if (leagueSlug && TOURNAMENT_COLORS[leagueSlug]) {
    return TOURNAMENT_COLORS[leagueSlug];
  }

  return '#8aa0b5';
}

function getCompetitionLabel(match: CalendarMatch) {
  return Util.getCompetitionDisplayName(
    match.competition?.tier?.league?.name,
    match.competition?.tier?.slug,
  );
}

function getCalendarCompetitionLabel(match: CalendarMatch) {
  const label = getCompetitionLabel(match).replace(/\s+Division$/i, '');
  const tier = match.competition?.tier?.slug || '';

  if (tier === Constants.TierSlug.LEAGUE_PRO || tier === Constants.TierSlug.LEAGUE_PRO_PLAYOFFS) {
    return 'ESL Pro League';
  }

  if (
    tier === Constants.TierSlug.ESL_CHALLENGER ||
    tier === Constants.TierSlug.ESL_CHALLENGER_PLAYOFFS
  ) {
    return 'ESL Challenger';
  }

  if (tier.includes(':rmr')) {
    return [match.competition?.organizer, 'Major RMR'].filter(Boolean).join(' ');
  }

  if (
    tier === Constants.TierSlug.IEM_COLOGNE_GROUP_A ||
    tier === Constants.TierSlug.IEM_COLOGNE_GROUP_B ||
    tier === Constants.TierSlug.IEM_COLOGNE_PLAYOFFS
  ) {
    return 'IEM Cologne';
  }

  if (
    tier === Constants.TierSlug.IEM_KRAKOW_GROUP_A ||
    tier === Constants.TierSlug.IEM_KRAKOW_GROUP_B ||
    tier === Constants.TierSlug.IEM_KRAKOW_PLAYOFFS
  ) {
    return 'IEM Krakow';
  }

  if (
    tier === Constants.TierSlug.CCT_SERIES ||
    tier === Constants.TierSlug.CCT_SERIES_PLAYOFFS ||
    tier === Constants.TierSlug.CCT_OCE_SERIES ||
    tier === Constants.TierSlug.CCT_OCE_PLAYOFFS
  ) {
    return 'CCT Series';
  }

  if (tier === Constants.TierSlug.IEM_COLOGNE_OPEN_QUALIFIER) {
    return 'IEM Cologne Qualifier';
  }

  if (tier === Constants.TierSlug.IEM_KRAKOW_OPEN_QUALIFIER) {
    return 'IEM Krakow Qualifier';
  }

  const useEventLevelName =
    tier.includes('iem:krakow') ||
    tier.includes('iem:cologne') ||
    tier.includes('esl-challenger') ||
    tier === Constants.TierSlug.LEAGUE_PRO;

  return useEventLevelName ? label.replace(/\s+Group (?:Stage|[A-Z])$/i, '') : label;
}

function getYearlyCompetitionLabel(competition: YearlyCompetition) {
  const tier = competition.tier.slug;

  if (Util.isMajorStageTier(tier)) {
    return Util.getMajorEventDisplayName(competition.location, competition.organizer);
  }

  if (tier.includes(':rmr')) {
    return [competition.organizer, 'Major RMR'].filter(Boolean).join(' ');
  }

  if (tier.startsWith('major:') && tier.includes('open-qualifier')) {
    return 'RMR Qualifiers';
  }

  if (
    tier === Constants.TierSlug.LEAGUE_OPEN ||
    tier === Constants.TierSlug.LEAGUE_INTERMEDIATE ||
    tier === Constants.TierSlug.LEAGUE_MAIN ||
    tier === Constants.TierSlug.LEAGUE_ADVANCED ||
    tier === Constants.TierSlug.LEAGUE_OPEN_PLAYOFFS ||
    tier === Constants.TierSlug.LEAGUE_INTERMEDIATE_PLAYOFFS ||
    tier === Constants.TierSlug.LEAGUE_MAIN_PLAYOFFS ||
    tier === Constants.TierSlug.LEAGUE_ADVANCED_PLAYOFFS
  ) {
    return 'ESEA Season';
  }

  if (tier === Constants.TierSlug.LEAGUE_PRO || tier === Constants.TierSlug.LEAGUE_PRO_PLAYOFFS) {
    return 'ESL Pro League';
  }

  if (
    tier === Constants.TierSlug.ESL_CHALLENGER ||
    tier === Constants.TierSlug.ESL_CHALLENGER_PLAYOFFS
  ) {
    return 'ESL Challenger';
  }

  if (
    tier === Constants.TierSlug.IEM_COLOGNE_GROUP_A ||
    tier === Constants.TierSlug.IEM_COLOGNE_GROUP_B ||
    tier === Constants.TierSlug.IEM_COLOGNE_PLAYOFFS
  ) {
    return 'IEM Cologne';
  }

  if (
    tier === Constants.TierSlug.IEM_KRAKOW_GROUP_A ||
    tier === Constants.TierSlug.IEM_KRAKOW_GROUP_B ||
    tier === Constants.TierSlug.IEM_KRAKOW_PLAYOFFS
  ) {
    return 'IEM Krakow';
  }

  if (
    tier === Constants.TierSlug.CCT_SERIES_PLAYOFFS ||
    tier === Constants.TierSlug.CCT_OCE_PLAYOFFS
  ) {
    return 'CCT Series';
  }

  if (tier === Constants.TierSlug.IEM_COLOGNE_OPEN_QUALIFIER) {
    return 'IEM Cologne Qualifier';
  }

  if (tier === Constants.TierSlug.IEM_KRAKOW_OPEN_QUALIFIER) {
    return 'IEM Krakow Qualifier';
  }

  const label = Util.getCompetitionDisplayName(competition.tier.league.name, tier).replace(
    /\s+Division$/i,
    '',
  );
  const useEventLevelName =
    tier.includes('iem:krakow') || tier.includes('iem:cologne') || tier.includes('esl-challenger');

  return useEventLevelName ? label.replace(/\s+Group (?:Stage|[A-Z])$/i, '') : label;
}

function getCalendarTierPriority(match: CalendarMatch) {
  return CALENDAR_TIER_PRIORITY[match.competition?.tier?.slug] ?? 999;
}

function getStageLabel(match: CalendarMatch, matchdayLabel: string) {
  if (!match.competition?.tier) {
    return 'Match';
  }

  if (match.competition.tier.groupSize) {
    return `${matchdayLabel} ${match.round}`;
  }

  return getTeamsRoundLabel(match);
}

function isWithinCareerStint(date: Date | string, stint: CareerStint) {
  const matchDate = new Date(date);
  const startedAt = new Date(stint.startedAt);
  startedAt.setHours(0, 0, 0, 0);

  const endedAt = stint.endedAt ? new Date(stint.endedAt) : null;
  endedAt?.setHours(23, 59, 59, 999);

  return startedAt <= matchDate && (!endedAt || endedAt >= matchDate);
}

function formatStintDuration(startedAt: Date | string, endedAt?: Date | string | null) {
  if (!endedAt) {
    return null;
  }

  const months = Math.max(1, differenceInCalendarMonths(new Date(endedAt), new Date(startedAt)));
  const years = Math.floor(months / 12);
  const remainingMonths = months % 12;
  const parts = [
    years > 0 && `${years} ${years === 1 ? 'year' : 'years'}`,
    remainingMonths > 0 && `${remainingMonths} ${remainingMonths === 1 ? 'month' : 'months'}`,
  ].filter(Boolean);

  return parts.join(' ') || '1 month';
}

function getCareerCalendarEntries(
  careerStints: CareerStint[],
  currentContractEndsAt?: Date | string | null,
) {
  const orderedStints = [...careerStints].sort(
    (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime(),
  );

  return orderedStints.flatMap((stint) => {
    if (!stint.team) {
      return [];
    }

    const tenure = formatStintDuration(stint.startedAt, stint.endedAt || currentContractEndsAt);
    const entries: CareerCalendarEntry[] = [
      {
        date: stint.startedAt,
        duration: tenure,
        id: `joined_${stint.teamId}_${new Date(stint.startedAt).getTime()}`,
        label: `Signed with ${stint.team.name}`,
        team: stint.team,
        type: 'signed',
      },
    ];

    if (stint.endedAt) {
      entries.push({
        date: stint.endedAt,
        duration: tenure,
        id: `left_${stint.teamId}_${new Date(stint.endedAt).getTime()}`,
        label: `Left ${stint.team.name}${tenure ? ` after ${tenure}` : ''}`,
        team: stint.team,
        type: 'left',
      });
    }

    return entries;
  });
}

function getCareerMatchCompetitor(
  match: CalendarMatch,
  careerStints: CareerStint[],
  playerId?: number | null,
) {
  const competitor = [...careerStints]
    .filter(
      (stint) =>
        stint.teamId !== null &&
        isWithinCareerStint(match.date, stint) &&
        match.competitors.some((competitor) => competitor.teamId === stint.teamId),
    )
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
    .map((stint) => match.competitors.find((competitor) => competitor.teamId === stint.teamId))
    .find(Boolean);

  const hasRecordedLineup = match.players.length > 0;
  const playerWasInLineup = !playerId || match.players.some((player) => player.id === playerId);

  if (match.status === Constants.MatchStatus.COMPLETED && hasRecordedLineup && !playerWasInLineup) {
    return undefined;
  }

  return competitor;
}

function getOpponent(match: CalendarMatch, ownCompetitor?: CalendarMatch['competitors'][number]) {
  return ownCompetitor
    ? match.competitors.find((competitor) => competitor.teamId !== ownCompetitor.teamId)
    : match.competitors[0];
}

function getMatchScore(match: CalendarMatch) {
  return match.competitors.map((competitor) => competitor.score).join('-');
}

function getCompetitorScore(
  match: CalendarMatch,
  competitor: CalendarMatch['competitors'][number],
) {
  if (match.status !== Constants.MatchStatus.COMPLETED) {
    return '-';
  }

  return competitor.score ?? 0;
}

function getCalendarPlayerPerformance(
  player: CalendarMatchDetails['players'][number],
  events: CalendarMatchDetails['events'],
) {
  const kills = events.filter((event) => event.attackerId === player.id);
  const assists = events.filter((event) => event.assistId === player.id);
  const deaths = events.filter((event) => event.victimId === player.id && !event.assistId);
  const headshots = kills.filter((event) => event.headshot);
  const kd = kills.length - deaths.length;

  return {
    assists: assists.length,
    deaths: deaths.length,
    headshots: Math.round((headshots.length / (kills.length || 1)) * 100),
    kd,
    kills: kills.length,
    rating: Util.getPlayerRating(kills.length, deaths.length, assists.length),
  };
}

function getCompetitorScoreTone(
  match: CalendarMatch,
  competitor: CalendarMatch['competitors'][number],
) {
  if (match.status !== Constants.MatchStatus.COMPLETED) {
    return 'text-base-content/65';
  }

  if (competitor.result === Constants.MatchResult.WIN) {
    return 'text-success';
  }

  if (competitor.result === Constants.MatchResult.LOSS) {
    return 'text-error';
  }

  return 'text-base-content/75';
}

function getCalendarDayHue(match: CalendarMatch) {
  return getTournamentColor(match);
}

function isPlayableFixture(match: CalendarMatch) {
  return (
    match.competitors.length >= 2 && match.competitors.every((competitor) => !!competitor.team)
  );
}

function sortMatches(a: CalendarMatch, b: CalendarMatch) {
  const dateDiff = new Date(a.date).getTime() - new Date(b.date).getTime();

  if (dateDiff !== 0) {
    return dateDiff;
  }

  return getCompetitionLabel(a).localeCompare(getCompetitionLabel(b));
}

function getYearlyClickedDate(event: React.MouseEvent<HTMLElement>, start: Date, end: Date) {
  const bounds = event.currentTarget.getBoundingClientRect();
  const dayCount = Math.max(1, end.getDate() - start.getDate() + 1);
  const relativeX = Math.min(Math.max(event.clientX - bounds.left, 0), bounds.width - 1);
  const dayOffset = Math.min(dayCount - 1, Math.floor((relativeX / bounds.width) * dayCount));

  return new Date(start.getFullYear(), start.getMonth(), start.getDate() + dayOffset);
}

function getTournamentMarkers(matches: CalendarMatch[]) {
  return Object.values(
    matches.reduce<
      Record<
        string,
        {
          color: string;
          count: number;
          label: string;
          priority: number;
        }
      >
    >((acc, match) => {
      const label = getCalendarCompetitionLabel(match);
      const color = getTournamentColor(match);
      const key = `${match.competitionId}__${label}__${color}`;
      const priority = getCalendarTierPriority(match);

      acc[key] ||= {
        color,
        count: 0,
        label,
        priority,
      };
      acc[key].count += 1;
      acc[key].priority = Math.min(acc[key].priority, priority);

      return acc;
    }, {}),
  ).sort((a, b) => a.priority - b.priority || b.count - a.count || a.label.localeCompare(b.label));
}

function getCalendarThumbnailMatch(matches: CalendarMatch[]) {
  const federationPriority: Partial<Record<Constants.FederationSlug, number>> = {
    [Constants.FederationSlug.ESPORTS_EUROPA]: 0,
    [Constants.FederationSlug.ESPORTS_AMERICAS]: 1,
    [Constants.FederationSlug.ESPORTS_ASIA]: 2,
  };

  return [...matches]
    .sort((a, b) => {
      const aPriority =
        federationPriority[a.competition.federation.slug as Constants.FederationSlug] ?? 3;
      const bPriority =
        federationPriority[b.competition.federation.slug as Constants.FederationSlug] ?? 3;

      return aPriority - bPriority || getCalendarTierPriority(a) - getCalendarTierPriority(b);
    })
    .find((match) =>
      Boolean(
        Util.getCompetitionHonorThumbnail({
          tierSlug: match.competition.tier.slug,
          federationSlug: match.competition.federation.slug,
          organizer: match.competition.organizer,
        }),
      ),
    );
}

function getFixtureRegion(match: CalendarMatch) {
  const tier = match.competition.tier.slug.toLowerCase();
  const federation = match.competition.federation.slug.toLowerCase();

  if (tier.includes(':china:')) return 'China';
  if (tier.includes(':europe:') || federation.includes('europa')) return 'Europe';
  if (tier.includes(':americas:') || federation.includes('americas')) return 'Americas';
  if (tier.includes(':asia:') || federation.includes('asia')) return 'Asia';
  if (tier.includes(':oce:') || federation.includes('oce')) return 'OCE';

  return null;
}

function isRegionalFixtureTournament(match: CalendarMatch) {
  const tier = match.competition.tier.slug.toLowerCase();
  const isRmrQualifier = tier.startsWith('major:') && tier.includes('open-qualifier');
  const isEsea = tier.startsWith('league:') || tier.includes('cash-cup');
  const isCctSeries = tier.includes('cct') && !tier.includes('global');
  const isIemQualifier =
    (tier.includes('iem:cologne') || tier.includes('iem:krakow')) &&
    tier.includes('open-qualifier');

  return isRmrQualifier || isEsea || isCctSeries || isIemQualifier;
}

function getFixtureRegionPriority(match: CalendarMatch) {
  const tier = match.competition.tier.slug.toLowerCase();
  const isRmrQualifier = tier.startsWith('major:') && tier.includes('open-qualifier');

  if (!isRegionalFixtureTournament(match)) {
    return Number.POSITIVE_INFINITY;
  }

  switch (getFixtureRegion(match)) {
    case 'Europe':
      return 0;
    case 'Americas':
      return 1;
    case 'Asia':
      return 2;
    case 'China':
      return isRmrQualifier ? 3 : 2;
    case 'OCE':
      return isRmrQualifier ? 4 : 3;
    default:
      return Number.POSITIVE_INFINITY;
  }
}

function getFixtureGroupLabel(match: CalendarMatch) {
  const region = isRegionalFixtureTournament(match) ? getFixtureRegion(match) : null;
  return [getCompetitionLabel(match), region].filter(Boolean).join(' ');
}

function getTournamentGroups(matches: CalendarMatch[]) {
  return Object.values(
    matches.filter(isPlayableFixture).reduce<
      Record<
        string,
        {
          color: string;
          key: string;
          label: string;
          logo: string;
          matches: CalendarMatch[];
          regionPriority: number;
          stage: string;
        }
      >
    >((acc, match) => {
      const label = getFixtureGroupLabel(match);
      const key = `${match.competitionId}__${label}`;

      acc[key] ||= {
        color: getTournamentColor(match),
        key,
        label,
        logo: Util.getCompetitionLogo(
          match.competition.tier.slug,
          match.competition.federation.slug,
          {
            location: match.competition.location,
            organizer: match.competition.organizer,
          },
        ),
        matches: [],
        regionPriority: getFixtureRegionPriority(match),
        stage: getStageLabel(match, 'Matchday'),
      };
      acc[key].matches.push(match);
      acc[key].regionPriority = Math.min(acc[key].regionPriority, getFixtureRegionPriority(match));

      return acc;
    }, {}),
  ).sort(
    (a, b) =>
      a.regionPriority - b.regionPriority ||
      getCalendarTierPriority(a.matches[0]) - getCalendarTierPriority(b.matches[0]) ||
      a.label.localeCompare(b.label),
  );
}

/**
 * Exports this module.
 *
 * @exports
 */
export default function () {
  // grab today's date
  const t = useTranslation('windows');
  const navigate = useNavigate();
  const { state } = React.useContext(AppStateContext);
  const playerId = state.profile?.player?.id ?? null;
  const [current, setCurrent] = React.useState(state.profile?.date || new Date());
  const defaultMode = React.useMemo<CalendarMode>(
    () => (state.profile?.teamId ? 'mine' : 'global'),
    [state.profile?.teamId],
  );
  const [mode, setMode] = React.useState<CalendarMode>(defaultMode);
  const [selectedDate, setSelectedDate] = React.useState(state.profile?.date || new Date());
  const [spotlight, setSpotlight] = React.useState<CalendarMatch>();
  const [hoveredYearlyCompetitionId, setHoveredYearlyCompetitionId] = React.useState<number>();
  const [yearlyCalendarAction, setYearlyCalendarAction] = React.useState<YearlyCalendarAction>();
  const [careerStints, setCareerStints] = React.useState<CareerStint[]>([]);
  const today = React.useMemo(() => state.profile?.date || new Date(), [state.profile]);
  const yearlyMaximumYear = today.getFullYear() + 1;
  const game = React.useMemo(
    () =>
      state.profile?.settings
        ? Util.loadSettings(state.profile.settings).general.game
        : Constants.Settings.general.game,
    [state.profile?.settings],
  );

  React.useEffect(() => {
    setMode(defaultMode);
  }, [defaultMode]);

  React.useEffect(() => {
    if (mode !== 'yearly' || current.getFullYear() <= yearlyMaximumYear) {
      return;
    }

    const month = current.getMonth();
    const day = Math.min(
      current.getDate(),
      endOfMonth(new Date(yearlyMaximumYear, month)).getDate(),
    );
    setCurrent(new Date(yearlyMaximumYear, month, day));
  }, [current, mode, yearlyMaximumYear]);

  React.useEffect(() => {
    if (!playerId) {
      setCareerStints([]);
      return;
    }

    let isCurrent = true;

    api.players
      .find<{
        select: {
          careerStints: {
            select: {
              teamId: true;
              startedAt: true;
              endedAt: true;
              team: {
                select: {
                  id: true;
                  name: true;
                  blazon: true;
                };
              };
            };
          };
        };
      }>({
        select: {
          careerStints: {
            select: {
              teamId: true,
              startedAt: true,
              endedAt: true,
              team: {
                select: {
                  id: true,
                  name: true,
                  blazon: true,
                },
              },
            },
          },
        },
        where: { id: playerId },
      })
      .then((player) => {
        if (isCurrent) {
          setCareerStints(player?.careerStints || []);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [playerId]);

  // start and end of the month
  const start = React.useMemo(() => startOfMonth(current), [current]);
  const end = React.useMemo(() => endOfMonth(current), [current]);

  // actual days of the current month
  const days = React.useMemo(() => eachDayOfInterval({ start, end }), [start, end]);

  // Grab the days of the week to render at the top of the calendar, Monday first.
  const weekdays = React.useMemo(
    () =>
      eachDayOfInterval({
        start: startOfWeek(current, { weekStartsOn: 1 }),
        end: endOfWeek(current, { weekStartsOn: 1 }),
      }),
    [current],
  );

  // Padding for beginning and end of the month. date-fns getDay is Sunday-first,
  // so shift it to match the Monday-first header above.
  const paddingStart = React.useMemo(
    () => Array((getDay(start) + 6) % DAYS_PER_WEEK).fill(null),
    [start],
  );
  const weeksInMonth = React.useMemo(
    () => Math.ceil((paddingStart.length + days.length) / DAYS_PER_WEEK),
    [days.length, paddingStart.length],
  );
  const paddingEnd = React.useMemo(
    () => Array(weeksInMonth * DAYS_PER_WEEK - (paddingStart.length + days.length)).fill(null),
    [days.length, paddingStart.length, weeksInMonth],
  );

  // build the calendar data object
  const calendar = React.useMemo(
    () =>
      Array.from({ length: weeksInMonth }).map((_, weekIdx) =>
        [...paddingStart, ...days, ...paddingEnd].slice(
          weekIdx * DAYS_PER_WEEK,
          weekIdx * DAYS_PER_WEEK + DAYS_PER_WEEK,
        ),
      ),
    [paddingStart, days, paddingEnd, weeksInMonth],
  );

  // grab the match data for the current month
  const [matches, setMatches] = React.useState<MatchesResponse>([]);
  const [matchDetails, setMatchDetails] = React.useState<CalendarMatchDetails[]>([]);
  const [yearlyCompetitions, setYearlyCompetitions] = React.useState<YearlyCompetition[]>([]);
  const [yearlyDates, setYearlyDates] = React.useState<Record<number, { end: Date; start: Date }>>(
    {},
  );

  React.useEffect(() => {
    api.matches
      .all<typeof CalendarMatchEager>({
        ...CalendarMatchEager,
        where: {
          date: {
            gte: start.toISOString(),
            lte: end.toISOString(),
          },
          competitionId: { not: null },
        },
        orderBy: [{ date: 'asc' }, { id: 'asc' }],
      })
      .then(setMatches);
  }, [start, end]);

  React.useEffect(() => {
    if (mode !== 'yearly') return;

    api.competitions
      .all<typeof Eagers.competition>({
        ...Eagers.competition,
        where: { season: current.getFullYear() - 2025 },
      })
      .then(setYearlyCompetitions);
  }, [current, mode]);

  React.useEffect(() => {
    if (mode !== 'yearly' || !yearlyCompetitions.length) return;

    Promise.all(
      yearlyCompetitions.map(async (competition) => {
        const [start, end] = await Promise.all([
          api.calendar.find({
            where: {
              type: Constants.CalendarEntry.COMPETITION_START,
              payload: String(competition.id),
            },
          }),
          api.calendar.find({
            where: {
              type: Constants.CalendarEntry.COMPETITION_END,
              payload: String(competition.id),
            },
          }),
        ]);
        return start?.date && end?.date
          ? ([competition.id, { start: new Date(start.date), end: new Date(end.date) }] as const)
          : null;
      }),
    ).then((entries) =>
      setYearlyDates(
        Object.fromEntries(entries.filter(Boolean)) as Record<number, { end: Date; start: Date }>,
      ),
    );
  }, [mode, yearlyCompetitions]);

  const yearlyStages = React.useMemo(() => {
    const stages = yearlyCompetitions
      .map((competition) => {
        const savedDates = yearlyDates[competition.id];
        if (savedDates) return { competition, ...savedDates };
        const dates = getStageDatesForYear(
          competition.federation.slug,
          competition.tier.slug,
          current.getFullYear(),
        );
        if (!dates) return null;

        return { competition, ...dates };
      })
      .filter(Boolean);

    const proLeagueStages = stages.filter(
      (stage) =>
        stage?.competition.tier.slug === Constants.TierSlug.LEAGUE_PRO ||
        stage?.competition.tier.slug === Constants.TierSlug.LEAGUE_PRO_PLAYOFFS,
    );

    const year = current.getFullYear();
    const isLeapYearSeason = isLeapYear(new Date(year, 0, 1));
    const proLeagueCompetition =
      proLeagueStages.find(
        (stage) => stage?.competition.tier.slug === Constants.TierSlug.LEAGUE_PRO_PLAYOFFS,
      )?.competition ??
      proLeagueStages.find(
        (stage) => stage?.competition.tier.slug === Constants.TierSlug.LEAGUE_PRO,
      )?.competition ??
      proLeagueStages[0]?.competition;
    const majorStages = stages.filter((stage) =>
      Util.isMajorStageTier(stage?.competition.tier.slug),
    );
    const majorCompetition =
      majorStages.find(
        (stage) => stage?.competition.tier.slug === Constants.TierSlug.MAJOR_CHAMPIONS_STAGE,
      )?.competition ?? majorStages[0]?.competition;
    const cashCupStages = stages.filter(
      (stage) => stage?.competition.tier.slug === Constants.TierSlug.ESEA_CASH_CUP,
    );
    const cashCupCompetition =
      cashCupStages.find(
        (stage) => stage?.competition.federation.slug === Constants.FederationSlug.ESPORTS_EUROPA,
      )?.competition ?? cashCupStages[0]?.competition;
    const cologneTierSlugs = new Set([
      Constants.TierSlug.IEM_COLOGNE_GROUP_A,
      Constants.TierSlug.IEM_COLOGNE_GROUP_B,
      Constants.TierSlug.IEM_COLOGNE_PLAYOFFS,
    ]);
    const krakowTierSlugs = new Set([
      Constants.TierSlug.IEM_KRAKOW_GROUP_A,
      Constants.TierSlug.IEM_KRAKOW_GROUP_B,
      Constants.TierSlug.IEM_KRAKOW_PLAYOFFS,
    ]);
    const cologneStages = stages.filter((stage) =>
      cologneTierSlugs.has(stage?.competition.tier.slug as Constants.TierSlug),
    );
    const krakowStages = stages.filter((stage) =>
      krakowTierSlugs.has(stage?.competition.tier.slug as Constants.TierSlug),
    );
    const cologneCompetition =
      cologneStages.find(
        (stage) => stage?.competition.tier.slug === Constants.TierSlug.IEM_COLOGNE_PLAYOFFS,
      )?.competition ?? cologneStages[0]?.competition;
    const krakowCompetition =
      krakowStages.find(
        (stage) => stage?.competition.tier.slug === Constants.TierSlug.IEM_KRAKOW_PLAYOFFS,
      )?.competition ?? krakowStages[0]?.competition;
    const cologneQualifierStages = stages.filter(
      (stage) => stage?.competition.tier.slug === Constants.TierSlug.IEM_COLOGNE_OPEN_QUALIFIER,
    );
    const krakowQualifierStages = stages.filter(
      (stage) => stage?.competition.tier.slug === Constants.TierSlug.IEM_KRAKOW_OPEN_QUALIFIER,
    );
    const cologneQualifierCompetition =
      cologneQualifierStages.find(
        (stage) => stage?.competition.federation.slug === Constants.FederationSlug.ESPORTS_EUROPA,
      )?.competition ?? cologneQualifierStages[0]?.competition;
    const krakowQualifierCompetition =
      krakowQualifierStages.find(
        (stage) => stage?.competition.federation.slug === Constants.FederationSlug.ESPORTS_EUROPA,
      )?.competition ?? krakowQualifierStages[0]?.competition;
    const cctSeriesTierSlugs = new Set([
      Constants.TierSlug.CCT_SERIES,
      Constants.TierSlug.CCT_SERIES_PLAYOFFS,
      Constants.TierSlug.CCT_OCE_SERIES,
      Constants.TierSlug.CCT_OCE_PLAYOFFS,
    ]);
    const cctSeriesStages = stages.filter((stage) =>
      cctSeriesTierSlugs.has(stage?.competition.tier.slug as Constants.TierSlug),
    );
    const cctSeriesCompetition =
      cctSeriesStages.find(
        (stage) => stage?.competition.federation.slug === Constants.FederationSlug.ESPORTS_EUROPA,
      )?.competition ?? cctSeriesStages[0]?.competition;
    const cctGlobalCompetition = stages.find(
      (stage) => stage?.competition.tier.slug === Constants.TierSlug.CCT_GLOBAL_FINALS,
    )?.competition;
    const eslChallengerStages = stages.filter(
      (stage) =>
        stage?.competition.tier.slug === Constants.TierSlug.ESL_CHALLENGER ||
        stage?.competition.tier.slug === Constants.TierSlug.ESL_CHALLENGER_PLAYOFFS,
    );
    const eslChallengerCompetition =
      eslChallengerStages.find(
        (stage) => stage?.competition.tier.slug === Constants.TierSlug.ESL_CHALLENGER_PLAYOFFS,
      )?.competition ?? eslChallengerStages[0]?.competition;
    const rmrStages = stages.filter((stage) => stage?.competition.tier.slug.includes(':rmr'));
    const rmrCompetition =
      rmrStages.find(
        (stage) => stage?.competition.federation.slug === Constants.FederationSlug.ESPORTS_AMERICAS,
      )?.competition ?? rmrStages[0]?.competition;
    const rmrQualifierStages = stages.filter((stage) => {
      const tier = stage?.competition.tier.slug || '';
      return tier.startsWith('major:') && tier.includes('open-qualifier');
    });
    const rmrQualifierCompetition =
      rmrQualifierStages.find(
        (stage) => stage?.competition.federation.slug === Constants.FederationSlug.ESPORTS_AMERICAS,
      )?.competition ?? rmrQualifierStages[0]?.competition;
    const eseaSeasonStages = stages.filter((stage) =>
      ESEA_SEASON_TIER_SLUGS.has(stage?.competition.tier.slug as Constants.TierSlug),
    );
    const eseaSeasonCompetition =
      eseaSeasonStages.find(
        (stage) =>
          stage?.competition.federation.slug === Constants.FederationSlug.ESPORTS_EUROPA &&
          stage.competition.tier.slug === Constants.TierSlug.LEAGUE_ADVANCED,
      )?.competition ??
      eseaSeasonStages.find(
        (stage) => stage?.competition.federation.slug === Constants.FederationSlug.ESPORTS_EUROPA,
      )?.competition ??
      eseaSeasonStages[0]?.competition;

    return [
      ...stages.filter(
        (stage) =>
          stage?.competition.tier.slug !== Constants.TierSlug.LEAGUE_PRO &&
          stage?.competition.tier.slug !== Constants.TierSlug.LEAGUE_PRO_PLAYOFFS &&
          stage?.competition.tier.slug !== Constants.TierSlug.ESEA_CASH_CUP &&
          !cologneTierSlugs.has(stage?.competition.tier.slug as Constants.TierSlug) &&
          !krakowTierSlugs.has(stage?.competition.tier.slug as Constants.TierSlug) &&
          stage?.competition.tier.slug !== Constants.TierSlug.IEM_COLOGNE_OPEN_QUALIFIER &&
          stage?.competition.tier.slug !== Constants.TierSlug.IEM_KRAKOW_OPEN_QUALIFIER &&
          stage?.competition.tier.slug !== Constants.TierSlug.CCT_GLOBAL_FINALS &&
          stage?.competition.tier.slug !== Constants.TierSlug.ESL_CHALLENGER &&
          stage?.competition.tier.slug !== Constants.TierSlug.ESL_CHALLENGER_PLAYOFFS &&
          !stage?.competition.tier.slug.includes(':rmr') &&
          !(
            stage?.competition.tier.slug.startsWith('major:') &&
            stage?.competition.tier.slug.includes('open-qualifier')
          ) &&
          !ESEA_SEASON_TIER_SLUGS.has(stage?.competition.tier.slug as Constants.TierSlug) &&
          !cctSeriesTierSlugs.has(stage?.competition.tier.slug as Constants.TierSlug) &&
          !Util.isMajorStageTier(stage?.competition.tier.slug),
      ),
      ...(proLeagueCompetition
        ? [
            {
              competition: proLeagueCompetition,
              end: isLeapYearSeason ? new Date(year, 7, 9) : new Date(year, 7, 10),
              start: isLeapYearSeason ? new Date(year, 6, 31) : new Date(year, 7, 1),
            },
          ]
        : []),
      ...(majorCompetition
        ? [
            {
              competition: majorCompetition,
              end: isLeapYearSeason ? new Date(year, 9, 4) : new Date(year, 9, 5),
              start: isLeapYearSeason ? new Date(year, 8, 13) : new Date(year, 8, 14),
            },
          ]
        : []),
      ...(cashCupCompetition
        ? [
            {
              competition: cashCupCompetition,
              end: isLeapYearSeason ? new Date(year, 9, 20) : new Date(year, 9, 21),
              start: isLeapYearSeason ? new Date(year, 9, 13) : new Date(year, 9, 14),
            },
          ]
        : []),
      ...(cologneCompetition
        ? [
            {
              competition: cologneCompetition,
              end: isLeapYearSeason ? new Date(year, 6, 20) : new Date(year, 6, 21),
              start: isLeapYearSeason ? new Date(year, 6, 11) : new Date(year, 6, 12),
            },
          ]
        : []),
      ...(krakowCompetition
        ? [
            {
              competition: krakowCompetition,
              end: isLeapYearSeason ? new Date(year, 10, 19) : new Date(year, 10, 20),
              start: isLeapYearSeason ? new Date(year, 10, 10) : new Date(year, 10, 11),
            },
          ]
        : []),
      ...(cctSeriesCompetition
        ? [
            {
              competition: cctSeriesCompetition,
              end: isLeapYearSeason ? new Date(year, 5, 6) : new Date(year, 5, 7),
              start: isLeapYearSeason ? new Date(year, 4, 28) : new Date(year, 4, 29),
            },
          ]
        : []),
      ...(cologneQualifierCompetition
        ? [
            {
              competition: cologneQualifierCompetition,
              end: isLeapYearSeason ? new Date(year, 5, 19) : new Date(year, 5, 20),
              start: isLeapYearSeason ? new Date(year, 5, 12) : new Date(year, 5, 13),
            },
          ]
        : []),
      ...(krakowQualifierCompetition
        ? [
            {
              competition: krakowQualifierCompetition,
              end: isLeapYearSeason ? new Date(year, 10, 3) : new Date(year, 10, 4),
              start: isLeapYearSeason ? new Date(year, 9, 27) : new Date(year, 9, 28),
            },
          ]
        : []),
      ...(cctGlobalCompetition
        ? [
            {
              competition: cctGlobalCompetition,
              end: isLeapYearSeason ? new Date(year, 7, 30) : new Date(year, 7, 31),
              start: isLeapYearSeason ? new Date(year, 7, 27) : new Date(year, 7, 28),
            },
          ]
        : []),
      ...(eslChallengerCompetition
        ? [
            {
              competition: eslChallengerCompetition,
              end: isLeapYearSeason ? new Date(year, 6, 2) : new Date(year, 6, 3),
              start: isLeapYearSeason ? new Date(year, 5, 26) : new Date(year, 5, 27),
            },
          ]
        : []),
      ...(rmrCompetition
        ? [
            {
              competition: {
                ...rmrCompetition,
                organizer: majorCompetition?.organizer ?? rmrCompetition.organizer,
              },
              end: isLeapYearSeason ? new Date(year, 4, 21) : new Date(year, 4, 22),
              start: isLeapYearSeason ? new Date(year, 4, 16) : new Date(year, 4, 17),
            },
          ]
        : []),
      ...(rmrQualifierCompetition
        ? [
            {
              competition: rmrQualifierCompetition,
              end: isLeapYearSeason ? new Date(year, 2, 6) : new Date(year, 2, 7),
              start: new Date(year, 1, 1),
            },
          ]
        : []),
      ...(eseaSeasonCompetition
        ? [
            {
              competition: eseaSeasonCompetition,
              end: isLeapYearSeason ? new Date(year, 4, 11) : new Date(year, 4, 12),
              start: isLeapYearSeason ? new Date(year, 2, 14) : new Date(year, 2, 15),
            },
          ]
        : []),
    ];
  }, [current, yearlyCompetitions, yearlyDates]);

  const yearlyStageSegments = React.useMemo(
    () =>
      yearlyStages.flatMap((stage) => {
        const segments: Array<
          typeof stage & { eventEnd: Date; eventStart: Date; isPrimary: boolean }
        > = [];
        let segmentStart = new Date(stage.start);

        while (segmentStart <= stage.end) {
          const monthEnd = endOfMonth(segmentStart);
          const segmentEnd = monthEnd < stage.end ? monthEnd : new Date(stage.end);
          segments.push({
            ...stage,
            end: segmentEnd,
            eventEnd: stage.end,
            eventStart: stage.start,
            isPrimary: false,
            start: segmentStart,
          });
          segmentStart = new Date(segmentStart.getFullYear(), segmentStart.getMonth() + 1, 1);
        }

        const primaryIndex = segments.reduce(
          (widestIndex, segment, index) =>
            segment.end.getDate() - segment.start.getDate() >
            segments[widestIndex].end.getDate() - segments[widestIndex].start.getDate()
              ? index
              : widestIndex,
          0,
        );

        return segments.map((segment, index) => ({
          ...segment,
          isPrimary: index === primaryIndex,
        }));
      }),
    [yearlyStages],
  );

  const yearlyWinnerCompetitions = React.useMemo(
    () =>
      YEARLY_WINNER_EVENT_TYPES.flatMap(({ label, tiers }) => {
        const competition = yearlyCompetitions.find((item) =>
          tiers.includes(item.tier.slug as Constants.TierSlug),
        );
        const winner =
          competition?.status === Constants.CompetitionStatus.COMPLETED
            ? competition.competitors.find(
                (competitor) => competitor.position === 1 && competitor.team,
              )
            : null;

        return competition ? [{ competition, label, team: winner?.team ?? null }] : [];
      }),
    [yearlyCompetitions],
  );

  const yearlyWinners = yearlyWinnerCompetitions;

  const visibleMatches = React.useMemo(
    () =>
      [...matches]
        .filter((match) => {
          if (mode === 'global') {
            return true;
          }

          return !!getCareerMatchCompetitor(match, careerStints, playerId);
        })
        .sort(sortMatches),
    [careerStints, matches, mode, playerId],
  );

  const selectedMatches = React.useMemo(
    () => visibleMatches.filter((match) => isSameDay(match.date, selectedDate)),
    [selectedDate, visibleMatches],
  );
  const selectedFixtures = React.useMemo(
    () => selectedMatches.filter(isPlayableFixture),
    [selectedMatches],
  );
  const selectedFixtureIds = React.useMemo(
    () => selectedFixtures.map((match) => match.id),
    [selectedFixtures],
  );

  React.useEffect(() => {
    if (mode !== 'mine' || !selectedFixtureIds.length) {
      setMatchDetails([]);
      return;
    }

    let isCurrent = true;

    api.matches
      .all<typeof Eagers.matchEvents>({
        ...Eagers.matchEvents,
        where: { id: { in: selectedFixtureIds } },
      })
      .then((details) => isCurrent && setMatchDetails(details));

    return () => {
      isCurrent = false;
    };
  }, [mode, selectedFixtureIds]);
  const matchDetailsById = React.useMemo(
    () => new Map(matchDetails.map((match) => [match.id, match])),
    [matchDetails],
  );
  const selectedTournamentGroups = React.useMemo(
    () => getTournamentGroups(selectedFixtures),
    [selectedFixtures],
  );
  const careerEntries = React.useMemo(
    () =>
      mode === 'mine'
        ? getCareerCalendarEntries(careerStints, state.profile?.player?.contractEnd)
        : [],
    [careerStints, mode, state.profile?.player?.contractEnd],
  );
  const selectedCareerEntries = React.useMemo(
    () => careerEntries.filter((entry) => isSameDay(new Date(entry.date), selectedDate)),
    [careerEntries, selectedDate],
  );

  React.useEffect(() => {
    setSpotlight(undefined);
  }, [selectedDate, mode]);

  React.useEffect(() => {
    if (!start || !end) {
      return;
    }

    if (selectedDate >= start && selectedDate <= end) {
      return;
    }

    setSelectedDate(start);
  }, [start, end, selectedDate]);

  return (
    <div className="calendar-dashboard">
      <header className="calendar-toolbar">
        <nav className="calendar-mode-tabs" aria-label="Calendar view">
          <button className={cx(mode === 'mine' && 'is-active')} onClick={() => setMode('mine')}>
            My Calendar
          </button>
          <button
            className={cx(mode === 'global' && 'is-active')}
            onClick={() => setMode('global')}
          >
            Global Calendar
          </button>
          <button
            className={cx(mode === 'yearly' && 'is-active')}
            onClick={() => setMode('yearly')}
          >
            Yearly Overview
          </button>
        </nav>
        <div className="calendar-month-controls">
          <button
            className="calendar-icon-button"
            aria-label={mode === 'yearly' ? 'Previous year' : 'Previous month'}
            title={mode === 'yearly' ? 'Previous year' : 'Previous month'}
            onClick={() =>
              setCurrent(mode === 'yearly' ? subYears(current, 1) : subMonths(current, 1))
            }
          >
            <FaChevronLeft />
          </button>
          <h2>{mode === 'yearly' ? format(current, 'yyyy') : format(current, 'MMMM yyyy')}</h2>
          <button
            className="calendar-icon-button"
            aria-label={mode === 'yearly' ? 'Next year' : 'Next month'}
            title={mode === 'yearly' ? 'Next year' : 'Next month'}
            disabled={mode === 'yearly' && current.getFullYear() >= yearlyMaximumYear}
            onClick={() => {
              if (mode === 'yearly' && current.getFullYear() >= yearlyMaximumYear) {
                return;
              }

              setCurrent(mode === 'yearly' ? addYears(current, 1) : addMonths(current, 1));
            }}
          >
            <FaChevronRight />
          </button>
          <button
            className="calendar-icon-button"
            aria-label="Go to today"
            title="Go to today"
            disabled={
              mode === 'yearly' ? true : start.toISOString() === startOfMonth(today).toISOString()
            }
            onClick={() => {
              setCurrent(today);
              setSelectedDate(today);
            }}
          >
            <FaCalendarDay />
          </button>
        </div>
      </header>
      {mode === 'yearly' ? (
        <main className="calendar-yearly-layout">
          <aside className="calendar-yearly-sidebar">
            {!!yearlyWinners.length && (
              <section className="calendar-yearly-winners" aria-label="Tournament winners">
                <header className="calendar-yearly-winners-header">
                  <h2>Winners</h2>
                </header>
                <div className="calendar-yearly-winner-list">
                  {yearlyWinners.map((winner) => {
                    const trophyThumbnail = Util.getCompetitionHonorThumbnail({
                      federationSlug: winner.competition.federation.slug,
                      organizer: winner.competition.organizer,
                      tierSlug: winner.competition.tier.slug,
                    });
                    const hasTrophyThumbnail =
                      trophyThumbnail?.includes('-trophy.png') ||
                      winner.competition.tier.slug === Constants.TierSlug.BLAST_FINALS;

                    return (
                      <article
                        key={winner.label}
                        className={cx(
                          'calendar-yearly-winner',
                          winner.competition.id === hoveredYearlyCompetitionId && 'is-hovered',
                        )}
                      >
                        <Image
                          className="calendar-yearly-winner-tournament-logo"
                          src={Util.getCompetitionLogo(
                            winner.competition.tier.slug,
                            winner.competition.federation.slug,
                            {
                              location: winner.competition.location,
                              organizer: winner.competition.organizer,
                            },
                          )}
                        />
                        <div className="calendar-yearly-winner-details">
                          {getYearlyCompetitionLabel(winner.competition)
                            .split(' ')
                            .map((line, index) => (
                              <span key={`${winner.label}-${line}-${index}`}>{line}</span>
                            ))}
                        </div>
                        <span className="calendar-yearly-winner-trophy" title="Winner">
                          {hasTrophyThumbnail ? <Image src={trophyThumbnail} /> : <FaTrophy />}
                        </span>
                        <strong className="calendar-yearly-winner-team-name">
                          {winner.team?.name ?? 'TBD'}
                        </strong>
                        {winner.team ? (
                          <Image
                            className="calendar-yearly-winner-team-logo"
                            src={winner.team.blazon}
                          />
                        ) : (
                          <Image
                            className="calendar-yearly-winner-team-logo calendar-yearly-winner-pending"
                            src={swissTeamPlaceholder}
                          />
                        )}
                      </article>
                    );
                  })}
                </div>
              </section>
            )}
          </aside>
          <section className="calendar-yearly-board">
            <aside className="calendar-yearly-month-rail">
              <header aria-hidden="true" />
              <div>
                {Array.from({ length: 12 }, (_, month) => (
                  <strong key={month}>
                    {format(new Date(current.getFullYear(), month), 'MMM')}
                  </strong>
                ))}
              </div>
            </aside>
            <section className="calendar-yearly-timeline">
              <header>
                {Array.from({ length: 31 }, (_, day) => (
                  <span key={day}>{day + 1}</span>
                ))}
              </header>
              <div className="calendar-yearly-events">
                <div className="calendar-yearly-day-actions" aria-label="Jump to calendar day">
                  {Array.from({ length: 12 }, (_, month) =>
                    Array.from(
                      { length: endOfMonth(new Date(current.getFullYear(), month)).getDate() },
                      (_, index) => {
                        const date = new Date(current.getFullYear(), month, index + 1);

                        return (
                          <button
                            key={date.toISOString()}
                            type="button"
                            aria-label={`Jump to ${format(date, 'MMMM d, yyyy')}`}
                            style={{ gridColumn: index + 1, gridRow: month + 1 }}
                            onClick={(event) =>
                              setYearlyCalendarAction({
                                date,
                                position: { x: event.clientX, y: event.clientY },
                              })
                            }
                          />
                        );
                      },
                    ),
                  )}
                </div>
                {[...yearlyStageSegments]
                  .sort((a, b) => a.start.getTime() - b.start.getTime())
                  .map((stage) => {
                    const thumbnail = Util.isMajorStageTier(stage.competition.tier.slug)
                      ? Util.getCompetitionThumbnail({
                          tierSlug: stage.competition.tier.slug,
                          federationSlug: stage.competition.federation.slug,
                          organizer: stage.competition.organizer,
                        })
                      : Util.getCompetitionHonorThumbnail({
                          tierSlug: stage.competition.tier.slug,
                          federationSlug: stage.competition.federation.slug,
                          organizer: stage.competition.organizer,
                        });
                    const logo = Util.getCompetitionLogo(
                      stage.competition.tier.slug,
                      stage.competition.federation.slug,
                      {
                        location: stage.competition.location,
                        organizer: stage.competition.organizer,
                      },
                    );
                    const isCashCup =
                      stage.competition.tier.slug === Constants.TierSlug.ESEA_CASH_CUP;
                    const isCctSeries = [
                      Constants.TierSlug.CCT_SERIES,
                      Constants.TierSlug.CCT_SERIES_PLAYOFFS,
                      Constants.TierSlug.CCT_OCE_SERIES,
                      Constants.TierSlug.CCT_OCE_PLAYOFFS,
                    ].includes(stage.competition.tier.slug as Constants.TierSlug);
                    const isCctGlobalFinals =
                      stage.competition.tier.slug === Constants.TierSlug.CCT_GLOBAL_FINALS;
                    const isEslChallenger =
                      stage.competition.tier.slug === Constants.TierSlug.ESL_CHALLENGER ||
                      stage.competition.tier.slug === Constants.TierSlug.ESL_CHALLENGER_PLAYOFFS;
                    const isRmr = stage.competition.tier.slug.includes(':rmr');
                    const isRmrQualifier =
                      stage.competition.tier.slug.startsWith('major:') &&
                      stage.competition.tier.slug.includes('open-qualifier');
                    const isEseaSeason = ESEA_SEASON_TIER_SLUGS.has(
                      stage.competition.tier.slug as Constants.TierSlug,
                    );
                    const isIemMainEvent = [
                      Constants.TierSlug.IEM_COLOGNE_GROUP_A,
                      Constants.TierSlug.IEM_COLOGNE_GROUP_B,
                      Constants.TierSlug.IEM_COLOGNE_PLAYOFFS,
                      Constants.TierSlug.IEM_KRAKOW_GROUP_A,
                      Constants.TierSlug.IEM_KRAKOW_GROUP_B,
                      Constants.TierSlug.IEM_KRAKOW_PLAYOFFS,
                      Constants.TierSlug.IEM_COLOGNE_OPEN_QUALIFIER,
                      Constants.TierSlug.IEM_KRAKOW_OPEN_QUALIFIER,
                    ].includes(stage.competition.tier.slug as Constants.TierSlug);
                    const useThumbnailIcon =
                      isCashCup ||
                      isCctSeries ||
                      isRmr ||
                      isRmrQualifier ||
                      isEseaSeason ||
                      Util.isMajorStageTier(stage.competition.tier.slug);
                    const eventIcon =
                      useThumbnailIcon && thumbnail
                        ? thumbnail
                        : isCctGlobalFinals
                          ? 'resources://competitions/thumbnail/cct-global-finals.png'
                          : isIemMainEvent
                            ? 'resources://competitions/thumbnail/iem-cologne-krakow.png'
                            : logo;
                    const column = stage.start.getDate();
                    const row = stage.start.getMonth() + 1;
                    const span = Math.max(1, stage.end.getDate() - stage.start.getDate() + 1);
                    const hue = TOURNAMENT_COLORS[stage.competition.tier.league.slug] ?? '#8aa0b5';
                    const city = Util.getCompetitionHostingLocationCity(stage.competition.location);
                    const title = [
                      getYearlyCompetitionLabel(stage.competition),
                      Util.isMajorStageTier(stage.competition.tier.slug) ||
                      isIemMainEvent ||
                      isEslChallenger ||
                      isRmr ||
                      isRmrQualifier ||
                      isEseaSeason
                        ? null
                        : city,
                    ]
                      .filter(Boolean)
                      .join(' ');
                    const isProLeague =
                      stage.competition.tier.slug === Constants.TierSlug.LEAGUE_PRO ||
                      stage.competition.tier.slug === Constants.TierSlug.LEAGUE_PRO_PLAYOFFS;
                    return (
                      <article
                        key={`${stage.competition.id}:${stage.start.toISOString()}`}
                        className={cx(isProLeague && 'calendar-yearly-pro-league')}
                        onMouseEnter={() => setHoveredYearlyCompetitionId(stage.competition.id)}
                        onMouseLeave={() => setHoveredYearlyCompetitionId(undefined)}
                        onClick={(event) =>
                          setYearlyCalendarAction({
                            competition: stage.competition,
                            date: getYearlyClickedDate(event, stage.start, stage.end),
                            position: { x: event.clientX, y: event.clientY },
                          })
                        }
                        style={{
                          gridColumn: `${column} / span ${span}`,
                          gridRow: row,
                          borderColor: hue,
                          background: `radial-gradient(circle at top right, color-mix(in srgb, ${hue} 22%, transparent), transparent 70%), linear-gradient(145deg, color-mix(in srgb, ${hue} 10%, var(--color-base-100)), var(--color-base-100))`,
                        }}
                      >
                        {!!thumbnail && <Image src={thumbnail} />}
                        <Image src={eventIcon} />
                        <strong className="relative z-10 min-w-0 truncate text-xs font-bold">
                          {isEslChallenger && (!isLeapYear(stage.eventStart) || !stage.isPrimary)
                            ? 'ESLC'
                            : title}
                        </strong>
                        {stage.isPrimary && (
                          <span>
                            {format(stage.eventStart, 'MMM d')} – {format(stage.eventEnd, 'MMM d')}
                          </span>
                        )}
                      </article>
                    );
                  })}
              </div>
            </section>
          </section>
        </main>
      ) : (
        <main className="calendar-content">
          <aside className="calendar-fixtures-panel">
            {(() => {
              if (mode === 'mine') {
                return (
                  <article className="calendar-my-day">
                    <header>
                      <h2>{format(selectedDate, 'MMMM do, yyyy')}</h2>
                    </header>
                    <div className="calendar-my-day-content">
                      {selectedFixtures.map((match) => {
                        const [home, away] = match.competitors;
                        const competitionLogo = Util.getCompetitionLogo(
                          match.competition.tier.slug,
                          match.competition.federation.slug,
                          {
                            location: match.competition.location,
                            organizer: match.competition.organizer,
                          },
                        );
                        const details = matchDetailsById.get(match.id);
                        const mapGame = match.games[0];
                        const homeMapScore = mapGame?.teams.find(
                          (team) => team.teamId === home?.teamId,
                        )?.score;
                        const awayMapScore = mapGame?.teams.find(
                          (team) => team.teamId === away?.teamId,
                        )?.score;
                        const isSwiss = Boolean(
                          Constants.TierSwissConfig[
                            match.competition.tier.slug as Constants.TierSlug
                          ],
                        );

                        return (
                          <section key={match.id} className="calendar-my-match-card">
                            <header className="calendar-my-match-scoreboard">
                              {!!home?.team?.country?.code && (
                                <span
                                  className={cx(
                                    'calendar-my-match-country-bg fp',
                                    home.team.country.code.toLowerCase(),
                                  )}
                                />
                              )}
                              {!!away?.team?.country?.code && (
                                <span
                                  className={cx(
                                    'calendar-my-match-country-bg is-away fp',
                                    away.team.country.code.toLowerCase(),
                                  )}
                                />
                              )}
                              <span className="calendar-my-match-team is-home">
                                {!!home?.team?.blazon && (
                                  <Image
                                    src={home.team.blazon}
                                    className="size-12 object-contain"
                                  />
                                )}
                                <strong>{home?.team?.name || 'TBD'}</strong>
                              </span>
                              <strong
                                className={cx(
                                  'calendar-my-match-score',
                                  home && getCompetitorScoreTone(match, home),
                                )}
                              >
                                {match.status === Constants.MatchStatus.COMPLETED && home
                                  ? getCompetitorScore(match, home)
                                  : null}
                              </strong>
                              <span className="calendar-my-match-competition">
                                <Image src={competitionLogo} className="size-14 object-contain" />
                                <small>{format(match.date, 'do MMMM yyyy')}</small>
                              </span>
                              <strong
                                className={cx(
                                  'calendar-my-match-score',
                                  away && getCompetitorScoreTone(match, away),
                                )}
                              >
                                {match.status === Constants.MatchStatus.COMPLETED && away
                                  ? getCompetitorScore(match, away)
                                  : null}
                              </strong>
                              <span className="calendar-my-match-team is-away">
                                {!!away?.team?.blazon && (
                                  <Image
                                    src={away.team.blazon}
                                    className="size-12 object-contain"
                                  />
                                )}
                                <strong>{away?.team?.name || 'TBD'}</strong>
                              </span>
                            </header>
                            <section className="calendar-my-match-summary">
                              <article className="calendar-my-match-map">
                                <p>Maps</p>
                                {match.status === Constants.MatchStatus.COMPLETED && !!mapGame ? (
                                  <figure>
                                    <Image src={Util.convertMapPool(mapGame.map, game, true)} />
                                    <figcaption>
                                      <strong>{Util.convertMapPool(mapGame.map, game)}</strong>
                                      <span>
                                        {homeMapScore ?? '-'}:{awayMapScore ?? '-'}
                                      </span>
                                    </figcaption>
                                  </figure>
                                ) : (
                                  <figure className="calendar-my-match-map-tba">
                                    <Image src="resources://maps/allmaps.png" />
                                    <div className="calendar-my-match-map-tba-overlay">
                                      <span>TBA</span>
                                    </div>
                                  </figure>
                                )}
                              </article>
                              <article className="calendar-my-match-info">
                                <p>Match</p>
                                <span>
                                  Best of {match.games.length} (
                                  {match.competition.tier.lan ? 'LAN' : 'Online'})
                                </span>
                                <span>{Util.getMatchRoundLabel(match)}</span>
                              </article>
                            </section>
                            {match.status !== Constants.MatchStatus.COMPLETED &&
                              !!state.profile && (
                                <section className="calendar-my-match-lineups">
                                  <div>
                                    {match.competitors.map((competitor) => {
                                      const starters = Util.getSquad(
                                        competitor.team,
                                        state.profile,
                                        true,
                                      );

                                      return (
                                        <table
                                          key={competitor.id}
                                          className="table-xs table table-fixed"
                                        >
                                          <thead>
                                            <tr>
                                              <th>Expected Lineup</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {starters.map((player) => (
                                              <tr key={player.id}>
                                                <td
                                                  title={
                                                    player.id === state.profile.playerId
                                                      ? t('shared.you')
                                                      : undefined
                                                  }
                                                  className={cx(
                                                    'p-0',
                                                    player.id === state.profile.playerId &&
                                                      'bg-base-200/50',
                                                  )}
                                                >
                                                  <article className="calendar-my-match-lineup-player">
                                                    <img
                                                      src={
                                                        player.avatar ||
                                                        'resources://avatars/empty.png'
                                                      }
                                                    />
                                                    <div>
                                                      <h3>{player.name}</h3>
                                                      <p>
                                                        <span
                                                          className={cx(
                                                            'fp',
                                                            player.country.code.toLowerCase(),
                                                          )}
                                                        />
                                                        <span>&nbsp;{player.country.name}</span>
                                                      </p>
                                                    </div>
                                                  </article>
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      );
                                    })}
                                  </div>
                                </section>
                              )}
                            {!!details?.events.length && (
                              <section className="calendar-my-match-statistics">
                                <p>Statistics</p>
                                {match.competitors.map((competitor) => {
                                  const players = details.players
                                    .filter((player) =>
                                      player.careerStints.some(
                                        (stint) =>
                                          stint.teamId === competitor.teamId &&
                                          isWithinCareerStint(match.date, stint),
                                      ),
                                    )
                                    .sort(
                                      (a, b) =>
                                        getCalendarPlayerPerformance(b, details.events).kd -
                                        getCalendarPlayerPerformance(a, details.events).kd,
                                    );

                                  return (
                                    <table key={competitor.id}>
                                      <thead>
                                        <tr>
                                          <th>
                                            {!!competitor.team.blazon && (
                                              <Image
                                                src={competitor.team.blazon}
                                                className="mr-1 inline-block size-3 object-contain align-[-1px]"
                                              />
                                            )}
                                            {competitor.team.name}
                                          </th>
                                          <th>R</th>
                                          <th>K</th>
                                          <th>D</th>
                                          <th>A</th>
                                          <th>HS</th>
                                          <th>+/-</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {players.map((player) => {
                                          const performance = getCalendarPlayerPerformance(
                                            player,
                                            details.events,
                                          );

                                          return (
                                            <tr key={player.id}>
                                              <td>
                                                {!!player.country?.code && (
                                                  <span
                                                    className={cx(
                                                      'fp mr-1 inline-block align-[-1px]',
                                                      player.country.code.toLowerCase(),
                                                    )}
                                                  />
                                                )}
                                                {player.name}
                                              </td>
                                              <td
                                                className={cx(
                                                  performance.rating <= Rating.LOW && 'text-error',
                                                  performance.rating > Rating.LOW &&
                                                    performance.rating < Rating.HIGH &&
                                                    'text-inherit',
                                                  performance.rating >= Rating.HIGH &&
                                                    'text-success',
                                                )}
                                              >
                                                {performance.rating.toFixed(2)}
                                              </td>
                                              <td>{performance.kills}</td>
                                              <td>{performance.deaths}</td>
                                              <td>{performance.assists}</td>
                                              <td>{performance.headshots}%</td>
                                              <td
                                                className={cx(
                                                  performance.kd > 0
                                                    ? 'text-success'
                                                    : 'text-error',
                                                  performance.kd === 0 && 'text-inherit',
                                                )}
                                              >
                                                {performance.kd > 0 ? '+' : ''}
                                                {performance.kd}
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  );
                                })}
                              </section>
                            )}
                            <footer className="calendar-my-match-actions">
                              {!match.competition.tier.groupSize &&
                                (isSwiss ? (
                                  <Link
                                    className="btn btn-sm"
                                    to={`/competitions?federationId=${match.competition.federationId}&season=${match.competition.season}&tierId=${match.competition.tier.id}`}
                                  >
                                    View Standings
                                  </Link>
                                ) : (
                                  <button
                                    className="btn btn-sm"
                                    onClick={() => {
                                      api.window.send<ModalRequest>(
                                        Constants.WindowIdentifier.Modal,
                                        {
                                          target: '/brackets',
                                          payload: match.competitionId,
                                        },
                                      );
                                    }}
                                  >
                                    {t('main.dashboard.viewBracket')}
                                  </button>
                                ))}
                              <button
                                className="btn btn-sm"
                                disabled={!match._count.events}
                                title={
                                  match._count.events > 0
                                    ? t('shared.viewMatchDetails')
                                    : t('shared.noMatchDetails')
                                }
                                onClick={() =>
                                  match._count.events > 0 &&
                                  api.window.send<ModalRequest>(Constants.WindowIdentifier.Modal, {
                                    target: '/postgame',
                                    payload: match.id,
                                  })
                                }
                              >
                                {t('shared.viewMatchDetails')}
                              </button>
                            </footer>
                          </section>
                        );
                      })}
                      {!!selectedCareerEntries.length && (
                        <section className="calendar-career-activity">
                          <h3>Career activity</h3>
                          {selectedCareerEntries.map((entry) => (
                            <div key={entry.id} className={cx('calendar-career-entry', entry.type)}>
                              <Image className="size-7 shrink-0" src={entry.team.blazon} />
                              <span>{entry.label}</span>
                            </div>
                          ))}
                        </section>
                      )}
                      {!selectedFixtures.length && !selectedCareerEntries.length && (
                        <div className="calendar-my-day-empty">
                          <FaCalendarAlt />
                          <p>No calendar activity on this date.</p>
                        </div>
                      )}
                    </div>
                  </article>
                );
              }

              if (!selectedFixtures.length && !selectedCareerEntries.length) {
                return (
                  <article className="calendar-fixtures-empty">
                    <header>
                      <div>
                        <h2>{format(selectedDate, 'MMMM do, yyyy')}</h2>
                        <p>Fixtures on this date</p>
                      </div>
                      <span className="calendar-match-count">
                        <FaTrophy /> 0 matches
                      </span>
                    </header>
                    <div>
                      <FaCalendarAlt />
                      <p>No fixtures on this date.</p>
                      <span>Pick a highlighted day to view its matches.</span>
                    </div>
                  </article>
                );
              }

              return (
                <article className="calendar-fixtures">
                  <header>
                    <div>
                      <h2>{format(selectedDate, 'MMMM do, yyyy')}</h2>
                      <p>Fixtures on this date</p>
                    </div>
                    <span className="calendar-match-count">
                      <FaTrophy /> {selectedFixtures.length}{' '}
                      {selectedFixtures.length === 1 ? 'match' : 'matches'}
                    </span>
                  </header>
                  <div className="calendar-fixture-groups">
                    {!!selectedCareerEntries.length && (
                      <section className="calendar-career-activity">
                        <h3>Career activity</h3>
                        {selectedCareerEntries.map((entry) => (
                          <div key={entry.id} className={cx('calendar-career-entry', entry.type)}>
                            <Image className="size-7 shrink-0" src={entry.team.blazon} />
                            <span>{entry.label}</span>
                          </div>
                        ))}
                      </section>
                    )}
                    {selectedTournamentGroups.map((group) => (
                      <section key={group.key} className="calendar-fixture-group">
                        <header>
                          <Image className="size-9 shrink-0" src={group.logo} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-bold">{group.label}</span>
                            <span className="block truncate text-xs">{group.stage}</span>
                          </span>
                          <span className="calendar-group-count">{group.matches.length}</span>
                        </header>
                        <section>
                          {group.matches.map((match) => {
                            const [home, away] = match.competitors;
                            const isActive = spotlight?.id === match.id;
                            const isSwiss = Boolean(
                              Constants.TierSwissConfig[
                                match.competition.tier.slug as Constants.TierSlug
                              ],
                            );

                            return (
                              <article
                                key={match.id}
                                className={cx('calendar-fixture-match', isActive && 'is-active')}
                              >
                                <button
                                  data-interaction-hover-sound="none"
                                  className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-2 text-left"
                                  onClick={() => setSpotlight(match)}
                                >
                                  <span className="flex min-w-0 items-center gap-2">
                                    {!!home?.team?.blazon && (
                                      <Image className="size-6 shrink-0" src={home.team.blazon} />
                                    )}
                                    <span className="truncate text-sm">
                                      {home?.team?.name || 'TBD'}
                                    </span>
                                  </span>
                                  <span className="calendar-score">
                                    <span
                                      className={cx(home && getCompetitorScoreTone(match, home))}
                                    >
                                      {home ? getCompetitorScore(match, home) : '-'}
                                    </span>
                                    <span className="text-base-content/40">-</span>
                                    <span
                                      className={cx(away && getCompetitorScoreTone(match, away))}
                                    >
                                      {away ? getCompetitorScore(match, away) : '-'}
                                    </span>
                                  </span>
                                  <span className="flex min-w-0 items-center justify-end gap-2 text-right">
                                    <span className="truncate text-sm">
                                      {away?.team?.name || 'TBD'}
                                    </span>
                                    {!!away?.team?.blazon && (
                                      <Image className="size-6 shrink-0" src={away.team.blazon} />
                                    )}
                                  </span>
                                </button>
                                {isActive && (
                                  <aside className="calendar-fixture-actions">
                                    {!match.competition.tier.groupSize &&
                                      (isSwiss ? (
                                        <Link
                                          className="btn btn-sm flex-1"
                                          to={`/competitions?federationId=${match.competition.federationId}&season=${match.competition.season}&tierId=${match.competition.tier.id}`}
                                        >
                                          View Standings
                                        </Link>
                                      ) : (
                                        <button
                                          className="btn btn-sm flex-1"
                                          onClick={() => {
                                            api.window.send<ModalRequest>(
                                              Constants.WindowIdentifier.Modal,
                                              {
                                                target: '/brackets',
                                                payload: match.competitionId,
                                              },
                                            );
                                          }}
                                        >
                                          {t('main.dashboard.viewBracket')}
                                        </button>
                                      ))}
                                    <button
                                      className="btn btn-sm flex-1"
                                      disabled={!match._count.events}
                                      title={
                                        match._count.events > 0
                                          ? t('shared.viewMatchDetails')
                                          : t('shared.noMatchDetails')
                                      }
                                      onClick={() =>
                                        match._count.events > 0 &&
                                        api.window.send<ModalRequest>(
                                          Constants.WindowIdentifier.Modal,
                                          {
                                            target: '/postgame',
                                            payload: match.id,
                                          },
                                        )
                                      }
                                    >
                                      {t('shared.viewMatchDetails')}
                                    </button>
                                  </aside>
                                )}
                              </article>
                            );
                          })}
                        </section>
                      </section>
                    ))}
                  </div>
                </article>
              );
            })()}
          </aside>
          <section className="calendar-grid-panel">
            <header className="calendar-weekdays">
              {weekdays.map((day) => (
                <span key={day.toString()}>{format(day, 'EEE')}</span>
              ))}
            </header>
            <div
              className="calendar-grid"
              style={{ gridTemplateRows: `repeat(${calendar.length}, minmax(0, 1fr))` }}
            >
              {calendar.flatMap((week, weekIdx) =>
                week.map((day: Date | null, dayIdx) => (
                  <div
                    key={day?.toString() || `${weekIdx}__${dayIdx}__empty_day`}
                    className={cx(
                      'calendar-day',
                      !day && 'is-empty',
                      !!day && isSameDay(day, today) && 'is-today',
                      !!day && isSameDay(day, selectedDate) && 'is-selected',
                    )}
                  >
                    {!!day && (
                      <button
                        type="button"
                        className="calendar-day-button"
                        onClick={() => setSelectedDate(day)}
                      >
                        {(() => {
                          const matchday = visibleMatches.filter((match) =>
                            isSameDay(match.date, day),
                          );
                          const dayCareerEntries = careerEntries.filter((entry) =>
                            isSameDay(new Date(entry.date), day),
                          );
                          const daySigningEntry = dayCareerEntries.find(
                            (entry) => entry.type === 'signed',
                          );

                          if (!matchday.length && !daySigningEntry) {
                            return (
                              <time dateTime={format(day, 'yyyy-MM-dd')}>{day.getDate()}</time>
                            );
                          }

                          if (!matchday.length) {
                            return (
                              <div className="calendar-career-day calendar-career-signing">
                                <time dateTime={format(day, 'yyyy-MM-dd')}>{day.getDate()}</time>
                                <Image
                                  className="calendar-career-signing-logo"
                                  src={daySigningEntry.team.blazon}
                                />
                                <span className="calendar-career-signing-label">
                                  Joined {daySigningEntry.team.name}
                                </span>
                                <span className="calendar-career-contract">
                                  <span>{daySigningEntry.duration || 'Contract pending'}</span>
                                  <FaFileContract />
                                </span>
                              </div>
                            );
                          }

                          const primary = matchday[0];
                          const ownCompetitor =
                            mode === 'mine'
                              ? getCareerMatchCompetitor(primary, careerStints, playerId)
                              : undefined;
                          const opponent = getOpponent(primary, ownCompetitor);
                          const tournamentMarkers = getTournamentMarkers(matchday);
                          const firstMarker = tournamentMarkers[0];
                          const thumbnailMatch = getCalendarThumbnailMatch(matchday);
                          const dayHue = getCalendarDayHue(primary);
                          const competitionThumbnail = thumbnailMatch
                            ? Util.getCompetitionHonorThumbnail({
                                tierSlug: thumbnailMatch.competition.tier.slug,
                                federationSlug: thumbnailMatch.competition.federation.slug,
                                organizer: thumbnailMatch.competition.organizer,
                              })
                            : null;
                          const competitionLogo = Util.getCompetitionLogo(
                            (thumbnailMatch ?? primary).competition.tier.slug,
                            (thumbnailMatch ?? primary).competition.federation.slug,
                            {
                              location: (thumbnailMatch ?? primary).competition.location,
                              organizer: (thumbnailMatch ?? primary).competition.organizer,
                            },
                          );

                          return (
                            <div
                              className="calendar-day-summary"
                              style={{
                                background: `radial-gradient(circle at top left, color-mix(in srgb, ${dayHue} 18%, transparent), transparent 70%), linear-gradient(145deg, color-mix(in srgb, ${dayHue} 7%, var(--color-base-100)), var(--color-base-100))`,
                              }}
                            >
                              {!!competitionThumbnail && (
                                <Image
                                  className="calendar-day-competition-logo"
                                  src={competitionThumbnail}
                                />
                              )}
                              <div>
                                <time dateTime={format(day, 'yyyy-MM-dd')}>{day.getDate()}</time>
                                {mode === 'global' && (
                                  <span className="calendar-marker-dots">
                                    {tournamentMarkers.slice(0, 5).map((marker) => (
                                      <span
                                        key={`${marker.label}__${marker.color}`}
                                        className="block size-2 rounded-full"
                                        style={{ backgroundColor: marker.color }}
                                        title={marker.label}
                                      />
                                    ))}
                                  </span>
                                )}
                              </div>
                              {!!firstMarker && (
                                <>
                                  <p className="calendar-event-marker" title={firstMarker.label}>
                                    {firstMarker.label}
                                  </p>
                                  {mode === 'mine' && (
                                    <Image
                                      className="calendar-day-tournament-logo"
                                      src={competitionLogo}
                                    />
                                  )}
                                </>
                              )}
                              {mode === 'global' && (
                                <Image
                                  className="calendar-day-global-tournament-logo"
                                  src={competitionLogo}
                                />
                              )}
                              {mode === 'global' && (
                                <div className="calendar-day-match-count">
                                  <span>
                                    {matchday.length} {matchday.length === 1 ? 'match' : 'matches'}
                                  </span>
                                  {tournamentMarkers.length > 1 && (
                                    <span>+{tournamentMarkers.length - 1} tournaments</span>
                                  )}
                                </div>
                              )}
                              {!opponent && <p>BYE</p>}
                              {mode === 'mine' &&
                                primary.status === Constants.MatchStatus.COMPLETED &&
                                !!ownCompetitor && (
                                  <span
                                    className={cx(
                                      'calendar-day-score',
                                      ['is-win', 'is-draw', 'is-loss'][ownCompetitor.result],
                                    )}
                                  >
                                    {getMatchScore(primary)}
                                  </span>
                                )}
                              {mode === 'mine' && !!opponent?.team?.blazon && (
                                <img
                                  title={opponent.team.name}
                                  className="calendar-day-team-logo"
                                  src={opponent.team.blazon}
                                />
                              )}
                            </div>
                          );
                        })()}
                      </button>
                    )}
                  </div>
                )),
              )}
            </div>
          </section>
        </main>
      )}
      {!!yearlyCalendarAction && (
        <div
          className="fixed inset-0 z-[120]"
          aria-labelledby="calendar-yearly-action-title"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setYearlyCalendarAction(undefined);
            }
          }}
        >
          <section
            className="bg-base-100 border-base-content/10 w-64 overflow-hidden rounded-lg border shadow-2xl"
            role="dialog"
            aria-modal="true"
            style={{
              left: Math.min(
                Math.max(yearlyCalendarAction.position.x + 8, 12),
                Math.max(12, window.innerWidth - 268),
              ),
              position: 'fixed',
              top: Math.min(
                Math.max(yearlyCalendarAction.position.y + 8, 12),
                Math.max(12, window.innerHeight - 180),
              ),
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <header className="border-base-content/10 border-b px-4 py-3">
              <h2 id="calendar-yearly-action-title" className="truncate text-sm font-black">
                {yearlyCalendarAction.competition
                  ? getYearlyCompetitionLabel(yearlyCalendarAction.competition)
                  : format(yearlyCalendarAction.date, 'MMMM d, yyyy')}
              </h2>
              <p className="text-base-content/60 mt-0.5 text-xs">
                {format(yearlyCalendarAction.date, 'EEEE, MMMM d, yyyy')}
              </p>
            </header>
            <div className="grid gap-2 p-3">
              {!!yearlyCalendarAction.competition && (
                <Link
                  className="btn btn-primary btn-sm w-full"
                  to={`/competitions?federationId=${yearlyCalendarAction.competition.federationId}&season=${yearlyCalendarAction.competition.season}&tierId=${yearlyCalendarAction.competition.tier.id}`}
                >
                  View tournament
                </Link>
              )}
              <button
                type="button"
                className="btn btn-outline btn-sm w-full"
                onClick={() => {
                  setCurrent(yearlyCalendarAction.date);
                  setSelectedDate(yearlyCalendarAction.date);
                  setMode('global');
                  setYearlyCalendarAction(undefined);
                }}
              >
                Jump to this day
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
