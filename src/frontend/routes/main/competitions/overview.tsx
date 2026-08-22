/**
 * Competition overview route.
 *
 * @module
 */
import React from 'react';
import { format } from 'date-fns';
import { groupBy } from 'lodash';
import { Link, useLocation, useNavigate, useOutletContext } from 'react-router-dom';
import { Constants, Eagers, Util } from '@liga/shared';
import Tournament from '@liga/shared/tournament';
import { cx } from '@liga/frontend/lib';
import { AppStateContext } from '@liga/frontend/redux';
import { useFormatAppShortDate, useTranslation } from '@liga/frontend/hooks';
import {
  Brackets,
  Image,
  MatchPreviewModal,
  Standings,
  TeamBlazon,
} from '@liga/frontend/components';
import {
  FaArrowRight,
  FaArrowLeft,
  FaCalendarAlt,
  FaChartBar,
  FaChevronDown,
  FaExternalLinkAlt,
  FaMapMarkerAlt,
  FaRandom,
  FaSitemap,
  FaTrophy,
  FaUsers,
} from 'react-icons/fa';
import CompetitionLocationTag from './competition-location-tag';
import CompetitionNews from './news';
import Participants from './participants';
import Statistics from './statistics';
import { SwissDetailedStandings } from './standings';

enum TabIdentifier {
  OVERVIEW = '/competitions',
  RESULTS = '/competitions/results',
  STATISTICS = '/competitions/statistics',
  PARTICIPANTS = '/competitions/participants',
  NEWS = '/competitions/news',
}

/** @constant */
const NUM_PREVIOUS = 5;

/** @constant */
const NUM_RECENT_LOOKBACK = NUM_PREVIOUS * 2;

/** @constant */
const NUM_PRIZE_POOL_VISIBLE = 4;

/** @constant */
const WINNER_HISTORY_TIER_SLUGS = new Set<Constants.TierSlug>([
  Constants.TierSlug.LEAGUE_ADVANCED_PLAYOFFS,
  Constants.TierSlug.LEAGUE_MAIN_PLAYOFFS,
  Constants.TierSlug.LEAGUE_INTERMEDIATE_PLAYOFFS,
  Constants.TierSlug.LEAGUE_OPEN_PLAYOFFS,
  Constants.TierSlug.CCT_SERIES_PLAYOFFS,
  Constants.TierSlug.MAJOR_CHAMPIONS_STAGE,
  Constants.TierSlug.IEM_COLOGNE_PLAYOFFS,
  Constants.TierSlug.IEM_KRAKOW_PLAYOFFS,
  Constants.TierSlug.LEAGUE_PRO_PLAYOFFS,
  Constants.TierSlug.ESL_CHALLENGER_PLAYOFFS,
]);

const ESEA_FORMATS: Partial<Record<Constants.TierSlug, { playoffTier: Constants.TierSlug }>> = {
  [Constants.TierSlug.LEAGUE_OPEN]: {
    playoffTier: Constants.TierSlug.LEAGUE_OPEN_PLAYOFFS,
  },
  [Constants.TierSlug.LEAGUE_INTERMEDIATE]: {
    playoffTier: Constants.TierSlug.LEAGUE_INTERMEDIATE_PLAYOFFS,
  },
  [Constants.TierSlug.LEAGUE_MAIN]: {
    playoffTier: Constants.TierSlug.LEAGUE_MAIN_PLAYOFFS,
  },
  [Constants.TierSlug.LEAGUE_ADVANCED]: {
    playoffTier: Constants.TierSlug.LEAGUE_ADVANCED_PLAYOFFS,
  },
};

const isEseaCashCupTier = (tier: Constants.TierSlug) => tier === Constants.TierSlug.ESEA_CASH_CUP;
const IEM_QUALIFIER_TIER_SLUGS = new Set<Constants.TierSlug>([
  Constants.TierSlug.IEM_COLOGNE_OPEN_QUALIFIER,
  Constants.TierSlug.IEM_KRAKOW_OPEN_QUALIFIER,
]);
const IEM_GROUP_STAGE_TIER_SLUGS = new Set<Constants.TierSlug>([
  Constants.TierSlug.IEM_COLOGNE_GROUP_A,
  Constants.TierSlug.IEM_COLOGNE_GROUP_B,
  Constants.TierSlug.IEM_KRAKOW_GROUP_A,
  Constants.TierSlug.IEM_KRAKOW_GROUP_B,
]);
const IEM_PLAYOFF_TIER_SLUGS = new Set<Constants.TierSlug>([
  Constants.TierSlug.IEM_COLOGNE_PLAYOFFS,
  Constants.TierSlug.IEM_KRAKOW_PLAYOFFS,
]);
const IEM_PRIZE_PLACEMENT_RANGES: Array<[number, number]> = [
  [1, 1],
  [2, 2],
  [3, 4],
  [5, 6],
  [7, 8],
  [9, 12],
  [13, 16],
];
const ESEA_CASH_CUP_SIZE: Record<string, number> = {
  [Constants.FederationSlug.ESPORTS_EUROPA]: 70,
  [Constants.FederationSlug.ESPORTS_AMERICAS]: 70,
  [Constants.FederationSlug.ESPORTS_ASIA]: 42,
  [Constants.FederationSlug.ESPORTS_OCE]: 27,
};
const IEM_QUALIFIER_SIZE: Record<string, number> = {
  [Constants.FederationSlug.ESPORTS_EUROPA]: 111,
  [Constants.FederationSlug.ESPORTS_AMERICAS]: 112,
  [Constants.FederationSlug.ESPORTS_ASIA]: 50,
  [Constants.FederationSlug.ESPORTS_OCE]: 36,
};
const ASIA_RMR_OPEN_QUALIFIERS: Partial<
  Record<
    Constants.TierSlug,
    {
      size: number;
      qualifiers: number;
      openingRound: number;
      openingThrough: string;
      finalFrom: string;
      destination: string;
    }
  >
> = {
  [Constants.TierSlug.MAJOR_ASIA_OPEN_QUALIFIER_1]: {
    size: 62,
    qualifiers: 2,
    openingRound: 64,
    openingThrough: 'Quarterfinals',
    finalFrom: 'Semifinals',
    destination: 'Asia RMR',
  },
  [Constants.TierSlug.MAJOR_ASIA_OPEN_QUALIFIER_2]: {
    size: 60,
    qualifiers: 2,
    openingRound: 64,
    openingThrough: 'Quarterfinals',
    finalFrom: 'Semifinals',
    destination: 'Asia RMR',
  },
  [Constants.TierSlug.MAJOR_CHINA_OPEN_QUALIFIER_1]: {
    size: 32,
    qualifiers: 1,
    openingRound: 32,
    openingThrough: 'Quarterfinals',
    finalFrom: 'Semifinals',
    destination: 'Asia RMR',
  },
  [Constants.TierSlug.MAJOR_CHINA_OPEN_QUALIFIER_2]: {
    size: 30,
    qualifiers: 1,
    openingRound: 32,
    openingThrough: 'Quarterfinals',
    finalFrom: 'Semifinals',
    destination: 'Asia RMR',
  },
  [Constants.TierSlug.MAJOR_OCE_OPEN_QUALIFIER_1]: {
    size: 36,
    qualifiers: 1,
    openingRound: 64,
    openingThrough: 'Quarterfinals',
    finalFrom: 'Semifinals',
    destination: 'Asia RMR',
  },
  [Constants.TierSlug.MAJOR_OCE_OPEN_QUALIFIER_2]: {
    size: 35,
    qualifiers: 1,
    openingRound: 64,
    openingThrough: 'Quarterfinals',
    finalFrom: 'Semifinals',
    destination: 'Asia RMR',
  },
  [Constants.TierSlug.MAJOR_AMERICAS_OPEN_QUALIFIER_1]: {
    size: 102,
    qualifiers: 4,
    openingRound: 128,
    openingThrough: 'Round of 32',
    finalFrom: 'Round of 16',
    destination: 'Americas RMR',
  },
  [Constants.TierSlug.MAJOR_AMERICAS_OPEN_QUALIFIER_2]: {
    size: 98,
    qualifiers: 4,
    openingRound: 128,
    openingThrough: 'Round of 32',
    finalFrom: 'Round of 16',
    destination: 'Americas RMR',
  },
  [Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_1]: {
    size: 94,
    qualifiers: 4,
    openingRound: 128,
    openingThrough: 'Round of 32',
    finalFrom: 'Round of 16',
    destination: 'Europe RMR',
  },
  [Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_2]: {
    size: 90,
    qualifiers: 4,
    openingRound: 128,
    openingThrough: 'Round of 32',
    finalFrom: 'Round of 16',
    destination: 'Europe RMR',
  },
  [Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_3]: {
    size: 86,
    qualifiers: 4,
    openingRound: 128,
    openingThrough: 'Round of 32',
    finalFrom: 'Round of 16',
    destination: 'Europe RMR',
  },
  [Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_4]: {
    size: 82,
    qualifiers: 4,
    openingRound: 128,
    openingThrough: 'Round of 32',
    finalFrom: 'Round of 16',
    destination: 'Europe RMR',
  },
};
const CCT_SERIES_SIZE = 16;
const MAJOR_CHALLENGERS_PLACEHOLDER_SOURCES = [
  ...Array.from({ length: 4 }, () => 'Europe RMR A'),
  ...Array.from({ length: 5 }, () => 'Europe RMR B'),
  ...Array.from({ length: 4 }, () => 'Americas RMR'),
  ...Array.from({ length: 3 }, () => 'Asia RMR'),
];
const MAJOR_LEGENDS_PLACEHOLDER_SOURCES = [
  ...Array.from({ length: 4 }, () => 'Europe RMR A'),
  ...Array.from({ length: 3 }, () => 'Europe RMR B'),
  'Americas RMR',
  ...Array.from({ length: 8 }, () => 'Challengers Stage'),
];
const CCT_OCE_SERIES_SIZE = 8;

const EPL_RETAINED_SLOTS_BY_FEDERATION_ID = {
  1: 4, // Americas
  2: 9, // Europe
  3: 2, // Asia
  4: 1, // Oceania
} as const;

const ESEA_DIVISION_ORDER: Array<{ label: string; tier: Constants.TierSlug }> = [
  { label: 'ESEA Open', tier: Constants.TierSlug.LEAGUE_OPEN },
  { label: 'ESEA Intermediate', tier: Constants.TierSlug.LEAGUE_INTERMEDIATE },
  { label: 'ESEA Main', tier: Constants.TierSlug.LEAGUE_MAIN },
  { label: 'ESEA Advanced', tier: Constants.TierSlug.LEAGUE_ADVANCED },
];

type CompetitionCompetitor = NonNullable<
  RouteContextCompetitions['competition']
>['competitors'][number];
type OutcomeCard = {
  competitor?: CompetitionCompetitor;
  detail: string;
  label: string;
};
type MajorPrizePoolCard = {
  amount?: number;
  competitor?: CompetitionCompetitor;
  label: string;
  placement: number;
};

function getPlacementLabel(start: number, end: number) {
  return start === end
    ? Util.toOrdinalSuffix(start)
    : `${Util.toOrdinalSuffix(start)}–${Util.toOrdinalSuffix(end)}`;
}

function getKnockoutPlacementRanges(size: number, hasDistinctThirdPlace = false) {
  const ranges: Array<[number, number]> = [];
  let start = 1;
  let count = 1;

  if (hasDistinctThirdPlace && size >= 4) {
    ranges.push([1, 1], [2, 2], [3, 3], [4, 4]);
    start = 5;
    count = 2;
  }

  while (start <= size) {
    const end = Math.min(size, start + count - 1);
    ranges.push([start, end]);
    start = end + 1;
    if (start > 2) {
      count *= 2;
    }
  }

  return ranges;
}

function getEseaAdvancement(
  tierSlug: Constants.TierSlug,
  federationSlug: Constants.FederationSlug,
) {
  const currentIndex = ESEA_DIVISION_ORDER.findIndex((division) => division.tier === tierSlug);
  const disabledTiers = Constants.LeagueTierDisabledByFederation[federationSlug] || [];
  const nextDivision = ESEA_DIVISION_ORDER.slice(currentIndex + 1).find(
    (division) => !disabledTiers.includes(division.tier),
  );

  return nextDivision?.label || 'ESL Pro League';
}

/**
 * @param match The match database record.
 * @function
 */
function hasOpponent(
  match: Awaited<ReturnType<typeof api.matches.all<typeof Eagers.match>>>[number],
) {
  return match.competitors.filter((competitor) => competitor.teamId != null).length > 1;
}

function getDateTime(value: Date | string | number | null | undefined) {
  if (!value) {
    return 0;
  }

  const date = value instanceof Date ? value : new Date(value);
  return date.getTime();
}

/**
 * Exports this module.
 *
 * @exports
 */
export default function () {
  const t = useTranslation('windows');
  const fmtShortDate = useFormatAppShortDate();
  const { state } = React.useContext(AppStateContext);
  const {
    competition,
    competitionTitle,
    competitionLocationCountryCode,
    competitionLocationDisplay,
    canViewStatistics,
    tournamentStartDate,
    tournamentEndDate,
  } = useOutletContext<RouteContextCompetitions>();
  const location = useLocation();
  const navigate = useNavigate();
  const isResultsView = location.pathname === TabIdentifier.RESULTS;
  const isStatisticsView = location.pathname === TabIdentifier.STATISTICS;
  const isParticipantsView = location.pathname === TabIdentifier.PARTICIPANTS;
  const isNewsView = location.pathname === TabIdentifier.NEWS;
  const [competitionDates, setCompetitionDates] = React.useState<
    Array<Awaited<ReturnType<typeof api.calendar.find>>>
  >([]);
  const [matches, setMatches] = React.useState<
    Awaited<ReturnType<typeof api.matches.all<typeof Eagers.match>>>
  >([]);
  const [resultMatches, setResultMatches] = React.useState<
    Awaited<ReturnType<typeof api.matches.all<typeof Eagers.match>>>
  >([]);
  const [standingMatches, setStandingMatches] = React.useState<
    Awaited<ReturnType<typeof api.matches.all<typeof Eagers.match>>>
  >([]);
  const [latestScheduledMatchDate, setLatestScheduledMatchDate] = React.useState<Date | null>(null);
  const [winners, setWinners] = React.useState<
    Awaited<ReturnType<typeof api.competitions.winners>>
  >([]);
  const [showAllPrizePool, setShowAllPrizePool] = React.useState(false);
  const [selectedStandingGroup, setSelectedStandingGroup] = React.useState<string | null>(null);
  const [eseaPlayoffCompetition, setEseaPlayoffCompetition] =
    React.useState<Awaited<ReturnType<typeof api.competitions.find<typeof Eagers.competition>>>>();
  const [eseaPlayoffMatches, setEseaPlayoffMatches] = React.useState<
    Awaited<ReturnType<typeof api.matches.all<typeof Eagers.match>>>
  >([]);
  const [majorChampionsCompetition, setMajorChampionsCompetition] =
    React.useState<Awaited<ReturnType<typeof api.competitions.find<typeof Eagers.competition>>>>();
  const [majorChampionsMatches, setMajorChampionsMatches] = React.useState<
    Awaited<ReturnType<typeof api.matches.all<typeof Eagers.match>>>
  >([]);
  const [iemEventCompetitions, setIemEventCompetitions] = React.useState<
    Array<Awaited<ReturnType<typeof api.competitions.find<typeof Eagers.competition>>>>
  >([]);
  const [iemGroupStageMatches, setIemGroupStageMatches] = React.useState<
    Awaited<ReturnType<typeof api.matches.all<typeof Eagers.match>>>
  >([]);
  const [isPlayoffsOpen, setIsPlayoffsOpen] = React.useState(false);
  const [isCashCupBracketModalOpen, setIsCashCupBracketModalOpen] = React.useState(false);
  const [previewMatchId, setPreviewMatchId] = React.useState<number>();
  const [previewPosition, setPreviewPosition] = React.useState({ x: 0, y: 0 });
  const [isCctDetailedStandingsOpen, setIsCctDetailedStandingsOpen] = React.useState(true);
  const [majorEventName, setMajorEventName] = React.useState('Major');
  const tierSlug = competition.tier.slug as Constants.TierSlug;
  const hasTournamentStarted = [
    Constants.CompetitionStatus.STARTED,
    Constants.CompetitionStatus.COMPLETED,
  ].includes(competition.status);
  const showWinnerHistory = WINNER_HISTORY_TIER_SLUGS.has(tierSlug);
  const eseaFormat =
    competition.tier.league.slug === Constants.LeagueSlug.ESPORTS_LEAGUE
      ? ESEA_FORMATS[tierSlug]
      : undefined;
  const isEseaCashCup = isEseaCashCupTier(tierSlug);
  const isIemQualifier = IEM_QUALIFIER_TIER_SLUGS.has(tierSlug);
  const isIemGroupStage = IEM_GROUP_STAGE_TIER_SLUGS.has(tierSlug);
  const isIemPlayoffStage = IEM_PLAYOFF_TIER_SLUGS.has(tierSlug);
  const isIemEvent = isIemGroupStage || isIemPlayoffStage;
  const iemEventTierSlugs = React.useMemo(
    () =>
      isIemEvent
        ? tierSlug === Constants.TierSlug.IEM_COLOGNE_GROUP_A ||
          tierSlug === Constants.TierSlug.IEM_COLOGNE_GROUP_B ||
          tierSlug === Constants.TierSlug.IEM_COLOGNE_PLAYOFFS
          ? [
              Constants.TierSlug.IEM_COLOGNE_GROUP_A,
              Constants.TierSlug.IEM_COLOGNE_GROUP_B,
              Constants.TierSlug.IEM_COLOGNE_PLAYOFFS,
            ]
          : [
              Constants.TierSlug.IEM_KRAKOW_GROUP_A,
              Constants.TierSlug.IEM_KRAKOW_GROUP_B,
              Constants.TierSlug.IEM_KRAKOW_PLAYOFFS,
            ]
        : [],
    [isIemEvent, tierSlug],
  );
  const rmrOpenQualifier = ASIA_RMR_OPEN_QUALIFIERS[tierSlug];
  const isAsiaRmrOpenQualifier = Boolean(rmrOpenQualifier);
  const isChinaRmrOpenQualifier = [
    Constants.TierSlug.MAJOR_CHINA_OPEN_QUALIFIER_1,
    Constants.TierSlug.MAJOR_CHINA_OPEN_QUALIFIER_2,
  ].includes(tierSlug);
  const isAsiaRmr = tierSlug === Constants.TierSlug.MAJOR_ASIA_RMR;
  const isAmericasRmr = tierSlug === Constants.TierSlug.MAJOR_AMERICAS_RMR;
  const isEuropeRmrA = tierSlug === Constants.TierSlug.MAJOR_EUROPE_RMR_A;
  const isEuropeRmrB = tierSlug === Constants.TierSlug.MAJOR_EUROPE_RMR_B;
  const isEuropeRmr = isEuropeRmrA || isEuropeRmrB;
  const isMajorChallengersStage = tierSlug === Constants.TierSlug.MAJOR_CHALLENGERS_STAGE;
  const isMajorLegendsStage = tierSlug === Constants.TierSlug.MAJOR_LEGENDS_STAGE;
  const isMajorSwissStage = isMajorChallengersStage || isMajorLegendsStage;
  const hasMajorChampionsCompleted =
    isMajorLegendsStage &&
    majorChampionsCompetition?.status === Constants.CompetitionStatus.COMPLETED;
  const isMajorRmr = isAsiaRmr || isAmericasRmr || isEuropeRmr;
  const rmrQualificationLabel = rmrOpenQualifier
    ? rmrOpenQualifier.qualifiers === 1
      ? `Winner to ${rmrOpenQualifier.destination}`
      : `Top ${rmrOpenQualifier.qualifiers} to ${rmrOpenQualifier.destination}`
    : '';
  const rmrBracketDescription = rmrOpenQualifier
    ? `Single elimination · Bo1 through ${rmrOpenQualifier.openingThrough} · Bo3 from ${rmrOpenQualifier.finalFrom}`
    : '';
  const isCctGlobalFinals = tierSlug === Constants.TierSlug.CCT_GLOBAL_FINALS;
  const isBlastFinals = tierSlug === Constants.TierSlug.BLAST_FINALS;
  const federationLabel =
    competition.federation.slug === Constants.FederationSlug.ESPORTS_WORLD
      ? 'International'
      : competition.federation.name;
  const isCctRegionalSeries =
    tierSlug === Constants.TierSlug.CCT_SERIES &&
    [
      Constants.FederationSlug.ESPORTS_AMERICAS,
      Constants.FederationSlug.ESPORTS_ASIA,
      Constants.FederationSlug.ESPORTS_EUROPA,
    ].includes(competition.federation.slug as Constants.FederationSlug);
  const isCctOceSeries =
    tierSlug === Constants.TierSlug.CCT_OCE_SERIES &&
    competition.federation.slug === Constants.FederationSlug.ESPORTS_OCE;
  const isEslChallengerGroupStage = tierSlug === Constants.TierSlug.ESL_CHALLENGER;
  const isEslProLeagueGroupStage = tierSlug === Constants.TierSlug.LEAGUE_PRO;
  // ESL Challenger shares CCT Oceania's two four-team group stage and four-team playoff shape.
  const isCctOceaniaStyleGroupStage = isCctOceSeries || isEslChallengerGroupStage;
  const isCctSeries = isCctRegionalSeries || isCctOceSeries;
  const isSwissDetailedStandings =
    isCctRegionalSeries || isAmericasRmr || isEuropeRmr || isMajorSwissStage;
  const cctSeriesSize = isCctOceaniaStyleGroupStage ? CCT_OCE_SERIES_SIZE : CCT_SERIES_SIZE;
  const cctPlayoffTier = isCctOceSeries
    ? Constants.TierSlug.CCT_OCE_PLAYOFFS
    : Constants.TierSlug.CCT_SERIES_PLAYOFFS;
  const cctGlobalFinalsQualifiers =
    competition.federation.slug === Constants.FederationSlug.ESPORTS_EUROPA
      ? 4
      : competition.federation.slug === Constants.FederationSlug.ESPORTS_AMERICAS
        ? 2
        : 1;
  const cctQualificationLabel =
    cctGlobalFinalsQualifiers === 1
      ? 'Winner to CCT Global Finals'
      : `Top ${cctGlobalFinalsQualifiers} to CCT Global Finals`;
  const isFixedBracketQualifier = isEseaCashCup || isIemQualifier || isAsiaRmrOpenQualifier;
  const eseaCashCupSize = ESEA_CASH_CUP_SIZE[competition.federation.slug] || 70;
  const fixedBracketSize = isAsiaRmrOpenQualifier
    ? rmrOpenQualifier.size
    : isIemQualifier
      ? IEM_QUALIFIER_SIZE[competition.federation.slug] || 112
      : eseaCashCupSize;
  const displayedCompetitorCount = isFixedBracketQualifier
    ? fixedBracketSize
    : isIemEvent
      ? 16
      : isBlastFinals || isCctGlobalFinals
        ? 8
        : isMajorSwissStage || isAmericasRmr
          ? 16
          : isEuropeRmr
            ? 16
            : isEslProLeagueGroupStage
              ? 32
              : isCctSeries || isEslChallengerGroupStage
                ? cctSeriesSize
                : competition.competitors.length;
  const qualifierDestination =
    tierSlug === Constants.TierSlug.IEM_COLOGNE_OPEN_QUALIFIER
      ? 'IEM Cologne'
      : tierSlug === Constants.TierSlug.IEM_KRAKOW_OPEN_QUALIFIER
        ? 'IEM Krakow'
        : null;
  const linkedPlayoffTier =
    eseaFormat?.playoffTier ||
    (isIemGroupStage
      ? tierSlug === Constants.TierSlug.IEM_COLOGNE_GROUP_A ||
        tierSlug === Constants.TierSlug.IEM_COLOGNE_GROUP_B
        ? Constants.TierSlug.IEM_COLOGNE_PLAYOFFS
        : Constants.TierSlug.IEM_KRAKOW_PLAYOFFS
      : isEslChallengerGroupStage
        ? Constants.TierSlug.ESL_CHALLENGER_PLAYOFFS
        : isEslProLeagueGroupStage
          ? Constants.TierSlug.LEAGUE_PRO_PLAYOFFS
          : isCctSeries
            ? cctPlayoffTier
            : undefined);
  const iemEventCompetitionIds = React.useMemo(
    () =>
      Array.from(
        new Set([competition.id, ...iemEventCompetitions.map((item) => item?.id).filter(Boolean)]),
      ),
    [competition.id, iemEventCompetitions],
  );
  const majorEventCompetitionIds = React.useMemo(
    () =>
      isMajorLegendsStage && majorChampionsCompetition
        ? [competition.id, majorChampionsCompetition.id]
        : [competition.id],
    [competition.id, isMajorLegendsStage, majorChampionsCompetition],
  );
  const iemGroupBrackets = React.useMemo(
    () =>
      isIemEvent
        ? iemEventTierSlugs.slice(0, 2).map((slug, index) => ({
            competition:
              iemEventCompetitions.find((item) => item?.tier.slug === slug) ||
              (competition.tier.slug === slug ? competition : undefined),
            label: `Group ${index === 0 ? 'A' : 'B'}`,
            slug,
          }))
        : [],
    [competition, iemEventCompetitions, iemEventTierSlugs, isIemEvent],
  );
  const iemOpeningRound = fixedBracketSize > 64 ? 128 : 64;
  const eseaPlayoffQualifiers = eseaFormat
    ? Util.getTierAdvancementEnd(
        eseaFormat.playoffTier,
        competition.federation.slug as Constants.FederationSlug,
      )
    : undefined;
  const eseaFormatAdvancement = getEseaAdvancement(
    tierSlug,
    competition.federation.slug as Constants.FederationSlug,
  );
  const eseaPlayoffFormat =
    eseaFormat?.playoffTier === Constants.TierSlug.LEAGUE_ADVANCED_PLAYOFFS &&
    competition.federation.slug === Constants.FederationSlug.ESPORTS_ASIA
      ? 'Double elimination'
      : 'Single elimination';
  const isDoubleEseaPlayoffs = eseaPlayoffFormat === 'Double elimination';
  const eseaPlayoffSize =
    eseaPlayoffCompetition?.tier.size ||
    (eseaFormat
      ? Util.getLeagueTierSize(
          eseaFormat.playoffTier,
          competition.federation.slug as Constants.FederationSlug,
          4,
        )
      : 4);
  const eseaPlayoffEntrants = React.useMemo(() => {
    const [, playoffZone] = Util.getTierZones(
      tierSlug,
      competition.federation.slug as Constants.FederationSlug,
    );
    const [start, end] = playoffZone || [];

    return start && end && end >= start ? end - start + 1 : eseaPlayoffSize;
  }, [competition.federation.slug, eseaPlayoffSize, tierSlug]);
  const eseaBracketSize = React.useMemo(() => {
    const firstRoundMatches = eseaPlayoffMatches.filter((match) => {
      try {
        const payload = JSON.parse(match.payload) as { r?: number; s?: number };
        return payload.r === 1 && payload.s === Constants.BracketIdentifier.UPPER;
      } catch {
        return false;
      }
    }).length;

    if (firstRoundMatches) {
      return firstRoundMatches * 2;
    }

    return eseaPlayoffEntrants;
  }, [eseaPlayoffEntrants, eseaPlayoffMatches]);
  const linkedBracketSize = isEslProLeagueGroupStage
    ? eseaPlayoffCompetition?.tier.size || 16
    : isCctSeries || isEslChallengerGroupStage
      ? eseaPlayoffCompetition?.tier.size || (isCctOceaniaStyleGroupStage ? 4 : 8)
      : eseaBracketSize;
  const hasEseaPlayoffsStarted = Boolean(
    eseaPlayoffCompetition &&
      [Constants.CompetitionStatus.STARTED, Constants.CompetitionStatus.COMPLETED].includes(
        eseaPlayoffCompetition.status,
      ),
  );
  const shouldPreviewCctPlayoffs = Boolean(
    isCctSeries &&
      (!eseaPlayoffCompetition ||
        eseaPlayoffCompetition.status === Constants.CompetitionStatus.SCHEDULED),
  );
  const shouldPreviewEseaPlayoffs = Boolean(
    (eseaFormat || isEslChallengerGroupStage || isEslProLeagueGroupStage) &&
      !eseaPlayoffMatches.length,
  );
  const shouldPreviewIemPlayoffs =
    (isIemGroupStage &&
      (!eseaPlayoffCompetition ||
        eseaPlayoffCompetition.status === Constants.CompetitionStatus.SCHEDULED)) ||
    (isIemPlayoffStage && competition.status === Constants.CompetitionStatus.SCHEDULED);
  // The RMR can enter its started state before its match list reaches this view.
  // Use its dedicated preview until the first bracket match is available.
  const shouldPreviewAsiaRmr = isAsiaRmr && !standingMatches.length;
  const locationDisplay = isChinaRmrOpenQualifier
    ? 'China (Online)'
    : Util.getCompetitionDisplayLocation({
        federationName: competition.federation.name,
        federationSlug: competition.federation.slug,
        lan: competition.tier.lan,
        location: competition.location,
      });
  const locationCountryCode = isChinaRmrOpenQualifier
    ? 'cn'
    : Util.getCompetitionDisplayLocationCountryCode({
        federationSlug: competition.federation.slug,
        lan: competition.tier.lan,
        location: competition.location,
      });

  React.useEffect(() => {
    setIemEventCompetitions([]);

    if (!isIemEvent) {
      return;
    }

    let isCurrent = true;

    Promise.all(
      iemEventTierSlugs.map((slug) =>
        api.competitions.all({
          ...Eagers.competition,
          orderBy: { id: 'desc' },
          where: { tier: { slug } },
        }),
      ),
    ).then((resultSets) => {
      if (isCurrent) {
        const result = resultSets
          .map(
            (candidates) =>
              candidates.find((candidate) => candidate.season === competition.season) ||
              candidates[0],
          )
          .filter(Boolean);
        setIemEventCompetitions(result);
      }
    });

    return () => {
      isCurrent = false;
    };
  }, [competition.federationId, competition.season, iemEventTierSlugs, isIemEvent]);

  React.useEffect(() => {
    setIemGroupStageMatches([]);

    const groupCompetitionIds = iemGroupBrackets.flatMap((group) =>
      group.competition ? [group.competition.id] : [],
    );

    if (!groupCompetitionIds.length) {
      return;
    }

    let isCurrent = true;

    api.matches
      .all({
        include: Eagers.match.include,
        orderBy: [{ round: 'asc' }, { date: 'asc' }, { id: 'asc' }],
        where: { competitionId: { in: groupCompetitionIds } },
      })
      .then((result) => {
        if (isCurrent) {
          setIemGroupStageMatches(result);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [iemGroupBrackets]);

  React.useEffect(() => {
    setEseaPlayoffCompetition(undefined);
    setEseaPlayoffMatches([]);

    if (!linkedPlayoffTier) {
      return;
    }

    let isCurrent = true;

    api.competitions
      .find({
        ...Eagers.competition,
        where: {
          federationId: competition.federationId,
          season: competition.season,
          tier: {
            slug: linkedPlayoffTier,
          },
        },
      })
      .then((result) => {
        if (isCurrent) {
          setEseaPlayoffCompetition(result);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [competition.federationId, competition.season, linkedPlayoffTier]);

  React.useEffect(() => {
    setMajorChampionsCompetition(undefined);
    setMajorChampionsMatches([]);

    if (!isMajorLegendsStage) {
      return;
    }

    let isCurrent = true;
    api.competitions
      .find({
        ...Eagers.competition,
        where: {
          federationId: competition.federationId,
          season: competition.season,
          tier: { slug: Constants.TierSlug.MAJOR_CHAMPIONS_STAGE },
        },
      })
      .then((result) => {
        if (isCurrent) {
          setMajorChampionsCompetition(result);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [competition.federationId, competition.season, isMajorLegendsStage]);

  React.useEffect(() => {
    setMajorChampionsMatches([]);

    if (!majorChampionsCompetition) {
      return;
    }

    let isCurrent = true;
    api.matches
      .all({
        include: Eagers.match.include,
        orderBy: [{ round: 'asc' }, { date: 'asc' }, { id: 'asc' }],
        where: { competitionId: majorChampionsCompetition.id },
      })
      .then((result) => {
        if (isCurrent) {
          setMajorChampionsMatches(result);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [majorChampionsCompetition]);

  React.useEffect(() => {
    setMajorEventName('Major');

    if (!isMajorRmr && !isMajorSwissStage) {
      return;
    }

    let isCurrent = true;
    api.competitions
      .find({
        ...Eagers.competition,
        where: {
          season: competition.season,
          tier: { slug: Constants.TierSlug.MAJOR_CHALLENGERS_STAGE },
        },
      })
      .then((major) => {
        if (isCurrent && major) {
          setMajorEventName(
            `${Util.getMajorEventDisplayName(major.location, major.organizer)} ${2025 + (major.season || 0)}`,
          );
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [competition.season, isMajorRmr, isMajorSwissStage]);

  React.useEffect(() => {
    setEseaPlayoffMatches([]);

    if (!eseaPlayoffCompetition) {
      return;
    }

    let isCurrent = true;

    api.matches
      .all({
        include: Eagers.match.include,
        orderBy: [{ round: 'asc' }, { date: 'asc' }, { id: 'asc' }],
        where: {
          competitionId: eseaPlayoffCompetition.id,
        },
      })
      .then((result) => {
        if (isCurrent) {
          setEseaPlayoffMatches(result);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [eseaPlayoffCompetition]);

  React.useEffect(() => {
    setIsPlayoffsOpen(
      isAsiaRmr ||
        (isFixedBracketQualifier && !isAsiaRmrOpenQualifier) ||
        (isAsiaRmrOpenQualifier && hasTournamentStarted) ||
        isCctSeries ||
        isCctGlobalFinals ||
        isBlastFinals ||
        isEslChallengerGroupStage ||
        (isIemPlayoffStage && hasTournamentStarted) ||
        hasEseaPlayoffsStarted,
    );
  }, [
    competition.id,
    eseaPlayoffCompetition?.id,
    hasEseaPlayoffsStarted,
    isCctSeries,
    isCctGlobalFinals,
    isBlastFinals,
    isEslChallengerGroupStage,
    isIemPlayoffStage,
    isAsiaRmr,
    isFixedBracketQualifier,
    isAsiaRmrOpenQualifier,
    hasTournamentStarted,
  ]);

  // fetch competition start and end
  // dates when the data comes in
  React.useEffect(() => {
    Promise.all([
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
    ]).then(setCompetitionDates);
  }, [competition]);

  React.useEffect(() => {
    setLatestScheduledMatchDate(null);

    api.matches
      .all<{ select: { date: true } }>({
        select: {
          date: true,
        },
        take: 1,
        orderBy: {
          date: 'desc',
        },
        where: {
          competitionId: isIemEvent
            ? { in: iemEventCompetitionIds }
            : isMajorLegendsStage
              ? { in: majorEventCompetitionIds }
              : linkedPlayoffTier && eseaPlayoffCompetition
                ? { in: [competition.id, eseaPlayoffCompetition.id] }
                : competition.id,
        },
      })
      .then(([match]) => setLatestScheduledMatchDate(match?.date ?? null));
  }, [
    competition.id,
    eseaPlayoffCompetition?.id,
    iemEventCompetitionIds,
    isIemEvent,
    isMajorLegendsStage,
    linkedPlayoffTier,
    majorEventCompetitionIds,
  ]);

  // fetch recent match results
  React.useEffect(() => {
    if (!state.profile) {
      return;
    }

    api.matches
      .all({
        include: Eagers.match.include,
        take: NUM_RECENT_LOOKBACK,
        orderBy: {
          date: 'desc',
        },
        where: {
          status: Constants.MatchStatus.COMPLETED,
          competitionId: isIemEvent
            ? { in: iemEventCompetitionIds }
            : isMajorLegendsStage
              ? { in: majorEventCompetitionIds }
              : linkedPlayoffTier && eseaPlayoffCompetition
                ? { in: [competition.id, eseaPlayoffCompetition.id] }
                : competition.id,
          date: {
            lte: state.profile.date.toISOString(),
          },
        },
      })
      .then((result) => setMatches(result.filter(hasOpponent).slice(0, NUM_PREVIOUS)));
  }, [
    competition.id,
    eseaPlayoffCompetition?.id,
    iemEventCompetitionIds,
    isIemEvent,
    isMajorLegendsStage,
    linkedPlayoffTier,
    majorEventCompetitionIds,
    state.profile,
  ]);

  React.useEffect(() => {
    setResultMatches([]);

    if (!isResultsView) {
      return;
    }

    api.matches
      .all({
        include: Eagers.match.include,
        orderBy: [{ date: 'desc' }, { id: 'desc' }],
        where: {
          competitionId: isIemEvent
            ? { in: iemEventCompetitionIds }
            : isMajorLegendsStage
              ? { in: majorEventCompetitionIds }
              : linkedPlayoffTier && eseaPlayoffCompetition
                ? { in: [competition.id, eseaPlayoffCompetition.id] }
                : competition.id,
          status: Constants.MatchStatus.COMPLETED,
        },
      })
      .then((result) => setResultMatches(result.filter(hasOpponent)));
  }, [
    competition.id,
    eseaPlayoffCompetition?.id,
    iemEventCompetitionIds,
    isIemEvent,
    isResultsView,
    isMajorLegendsStage,
    linkedPlayoffTier,
    majorEventCompetitionIds,
  ]);

  // fetch stage matches for expandable standings rows
  React.useEffect(() => {
    setStandingMatches([]);

    if (
      !competition.tier.groupSize &&
      !isCctOceSeries &&
      !isCctGlobalFinals &&
      !isBlastFinals &&
      !Constants.TierSwissConfig[tierSlug] &&
      !isFixedBracketQualifier &&
      !isAsiaRmr &&
      !isIemEvent
    ) {
      return;
    }

    api.matches
      .all({
        include: Eagers.match.include,
        orderBy: [{ round: 'asc' }, { date: 'asc' }, { id: 'asc' }],
        where: {
          competitionId: competition.id,
        },
      })
      .then(setStandingMatches);
  }, [
    competition,
    isAsiaRmr,
    isBlastFinals,
    isCctGlobalFinals,
    isCctOceSeries,
    isFixedBracketQualifier,
    isIemEvent,
    tierSlug,
  ]);

  // fetch previous winners
  React.useEffect(() => {
    setWinners([]);

    if (!showWinnerHistory) {
      return;
    }

    let isCurrent = true;

    api.competitions.winners(competition.id).then((result) => {
      if (isCurrent) {
        setWinners(result);
      }
    });

    return () => {
      isCurrent = false;
    };
  }, [competition, showWinnerHistory]);

  // reset group selection when competition changes
  React.useEffect(() => {
    setShowAllPrizePool(false);
  }, [competition]);

  // group standings tables
  const effectiveGroupSize =
    competition.tier.groupSize || (isCctOceaniaStyleGroupStage ? 4 : undefined);
  const groups = React.useMemo(() => {
    if (isEslProLeagueGroupStage && competition.status === Constants.CompetitionStatus.SCHEDULED) {
      return Object.fromEntries(
        Array.from({ length: 8 }, (_, index): [string, CompetitionCompetitor[]] => [
          String(index + 1),
          [],
        ]),
      ) as Record<string, CompetitionCompetitor[]>;
    }

    const persistedGroups = groupBy(competition.competitors, 'group');

    if (!isCctOceaniaStyleGroupStage || Object.keys(persistedGroups).length > 1) {
      return persistedGroups;
    }

    if (!competition.competitors.length) {
      return { 1: [], 2: [] };
    }

    // Older saves can contain a CCT OCE event created before it became a group stage.
    // Keep the view useful by applying the same 1/4/5/8 and 2/3/6/7 snake split as new events.
    return [...competition.competitors]
      .sort((a, b) => a.seed - b.seed)
      .reduce<Record<string, CompetitionCompetitor[]>>((result, competitor, index) => {
        const group =
          Math.floor(index / 2) % 2 === 0
            ? index % 2 === 0
              ? '1'
              : '2'
            : index % 2 === 0
              ? '2'
              : '1';
        (result[group] ||= []).push(competitor);
        return result;
      }, {});
  }, [
    competition.competitors,
    competition.status,
    isCctOceaniaStyleGroupStage,
    isEslProLeagueGroupStage,
  ]);
  const groupKeys = React.useMemo(() => Object.keys(groups), [groups]);
  const isLeagueStandings = competition.tier.league.slug === Constants.LeagueSlug.ESPORTS_LEAGUE;
  const isCashCupStyleStandings = isFixedBracketQualifier || isAsiaRmr;
  const isStandaloneStandings =
    isLeagueStandings ||
    isCashCupStyleStandings ||
    isCctSeries ||
    isEslChallengerGroupStage ||
    isEslProLeagueGroupStage ||
    isCctGlobalFinals ||
    isBlastFinals ||
    isIemEvent ||
    isAmericasRmr ||
    isEuropeRmr ||
    isMajorSwissStage;
  const visibleStandingGroupKeys = React.useMemo(() => {
    if (!isLeagueStandings || groupKeys.length <= 1) {
      return groupKeys;
    }

    const selectedGroup =
      selectedStandingGroup && groupKeys.includes(selectedStandingGroup)
        ? selectedStandingGroup
        : groupKeys[0];
    return [selectedGroup];
  }, [groupKeys, isLeagueStandings, selectedStandingGroup]);

  React.useEffect(() => {
    setSelectedStandingGroup((current) =>
      current && groupKeys.includes(current) ? current : groupKeys[0] || null,
    );
  }, [competition.id, groupKeys]);
  const groupZones = React.useMemo(() => {
    if (
      !(
        isLeagueStandings ||
        isCctOceaniaStyleGroupStage ||
        isEslProLeagueGroupStage ||
        Util.shouldShowStandingsZones(competition.status)
      ) ||
      !effectiveGroupSize
    ) {
      return undefined;
    }

    const zones = isEslProLeagueGroupStage
      ? [
          [1, 2],
          [0, 0],
          [3, effectiveGroupSize],
        ]
      : Util.getTierZonesByGroup(
          tierSlug,
          competition.federation.slug as Constants.FederationSlug,
          groupKeys.length,
          effectiveGroupSize,
        );

    return zones;
  }, [
    competition.status,
    effectiveGroupSize,
    competition.federation.slug,
    groupKeys.length,
    isCctOceaniaStyleGroupStage,
    isEslProLeagueGroupStage,
    isLeagueStandings,
    tierSlug,
  ]);

  // filler for previous matches
  const previousFiller = React.useMemo(
    () => [...Array(Math.max(0, NUM_PREVIOUS - matches.length))],
    [matches.length],
  );

  // competition prize pool
  const prizePoolTier = isIemGroupStage
    ? linkedPlayoffTier || tierSlug
    : isMajorLegendsStage
      ? Constants.TierSlug.MAJOR_CHAMPIONS_STAGE
      : tierSlug;
  const prizePoolCompetition = isMajorLegendsStage
    ? majorChampionsCompetition || competition
    : competition;
  const prizePool = React.useMemo(() => Constants.PrizePool[prizePoolTier], [prizePoolTier]);
  const displayedPrizePool = isEslProLeagueGroupStage
    ? Constants.PrizePool[Constants.TierSlug.LEAGUE_PRO_PLAYOFFS]
    : prizePool;
  const prizePoolRows = React.useMemo(
    () =>
      prizePoolCompetition.competitors
        .filter(
          (competitor) =>
            Boolean(competitor.team) &&
            Boolean(prizePool?.distribution?.[(competitor.position || 1) - 1]),
        )
        .sort((a, b) => a.position - b.position)
        .map((competitor, idx) => ({
          competitor,
          placement: idx + 1,
          percentage: prizePool?.distribution?.[idx],
        })),
    [prizePoolCompetition.competitors, prizePool],
  );
  const visiblePrizePoolRows = showAllPrizePool
    ? prizePoolRows
    : prizePoolRows.slice(0, NUM_PRIZE_POOL_VISIBLE);
  const displayedEndDate = React.useMemo(() => {
    const calendarEndDate = competitionDates[1]?.date;
    const projectedEndDate = tournamentEndDate ? new Date(tournamentEndDate) : undefined;

    // While Swiss/bracket rounds are generated, the backend keeps the end
    // calendar entry in sync with the latest scheduled round. That is a
    // provisional date, not the tournament's advertised finish.
    if (competition.status !== Constants.CompetitionStatus.COMPLETED && projectedEndDate) {
      return projectedEndDate;
    }

    if (!latestScheduledMatchDate) {
      return calendarEndDate || projectedEndDate;
    }

    if (!calendarEndDate) {
      return latestScheduledMatchDate;
    }

    return getDateTime(latestScheduledMatchDate) > getDateTime(calendarEndDate)
      ? latestScheduledMatchDate
      : calendarEndDate;
  }, [competition.status, competitionDates, latestScheduledMatchDate, tournamentEndDate]);
  const displayedStartDate =
    competitionDates[0]?.date || (tournamentStartDate ? new Date(tournamentStartDate) : undefined);
  const cashCupYear = format(
    competitionDates[0]?.date || state.profile?.date || new Date(),
    'yyyy',
  );
  const showPrizePool =
    prizePoolCompetition.status === Constants.CompetitionStatus.COMPLETED &&
    Boolean(prizePool?.total) &&
    prizePoolRows.length > 0;
  const canExpandPrizePool = prizePoolRows.length > NUM_PRIZE_POOL_VISIBLE;
  const prizePoolCards = React.useMemo(() => {
    const completedPlacements = new Map<number, CompetitionCompetitor>();

    if (prizePoolCompetition.status === Constants.CompetitionStatus.COMPLETED) {
      try {
        const tournament = Tournament.restore(JSON.parse(prizePoolCompetition.tournament));
        tournament.standings.flat().forEach((standing) => {
          const placement = standing.gpos || standing.pos;
          const competitor = prizePoolCompetition.competitors.find(
            (entry) => entry.seed === standing.seed && Boolean(entry.team),
          );

          if (placement && competitor) {
            completedPlacements.set(placement, competitor);
          }
        });
      } catch {
        // The persisted competition positions below remain a safe fallback for older saves.
      }
    }

    const placementCompetitors = (prizePool?.distribution || []).map((_, index) => {
      const placement = index + 1;
      return (
        completedPlacements.get(placement) ||
        prizePoolCompetition.competitors.find(
          (entry) => entry.position === placement && Boolean(entry.team),
        )
      );
    });
    const assignedCompetitorIds = new Set(
      placementCompetitors.flatMap((competitor) => (competitor ? [competitor.id] : [])),
    );
    const remainingCompetitors = [...prizePoolCompetition.competitors]
      .filter((competitor) => Boolean(competitor.team) && !assignedCompetitorIds.has(competitor.id))
      .sort((a, b) => a.position - b.position || a.seed - b.seed);

    return (prizePool?.distribution || []).map((percentage, index) => {
      const placement = index + 1;
      return {
        amount: prizePool.total * (percentage / 100),
        competitor: placementCompetitors[index] || remainingCompetitors.shift(),
        placement,
      };
    });
  }, [prizePoolCompetition, prizePool]);
  const majorPrizePoolCards = React.useMemo<MajorPrizePoolCard[]>(() => {
    if (!isMajorLegendsStage) {
      return [];
    }

    const championsRanges = [
      [1, 1],
      [2, 2],
      [3, 4],
      [5, 8],
    ];
    const legendsRanges = [
      [9, 11],
      [12, 14],
      [15, 16],
    ];

    return [
      ...championsRanges.flatMap(([start, end]) =>
        Array.from({ length: end - start + 1 }, (_, index) => {
          const placement = start + index;
          const card = prizePoolCards[placement - 1];

          return {
            amount: card?.amount,
            competitor: card?.competitor,
            label: getPlacementLabel(start, end),
            placement,
          };
        }),
      ),
      ...legendsRanges.flatMap(([start, end]) =>
        Array.from({ length: end - start + 1 }, (_, index) => {
          const placement = start + index;

          return {
            amount: undefined as number | undefined,
            competitor: competition.competitors.find(
              (competitor) => competitor.position === placement,
            ),
            label: getPlacementLabel(start, end),
            placement,
          };
        }),
      ),
    ];
  }, [competition.competitors, isMajorLegendsStage, prizePoolCards]);
  const displayedMajorPrizePoolCards = React.useMemo(
    () =>
      hasMajorChampionsCompleted
        ? majorPrizePoolCards
        : prizePoolCards.map(({ amount, competitor, placement }) => ({
            amount,
            competitor,
            label: getPlacementLabel(placement, placement),
            placement,
          })),
    [hasMajorChampionsCompleted, majorPrizePoolCards, prizePoolCards],
  );
  const iemPrizePoolCards = React.useMemo(() => {
    if (!isIemEvent) {
      return [];
    }

    const eventCompetitions = [competition, ...iemEventCompetitions].filter(
      (item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index,
    );
    const playoffTeams = eventCompetitions
      .filter((item) => IEM_PLAYOFF_TIER_SLUGS.has(item.tier.slug as Constants.TierSlug))
      .flatMap((item) => item.competitors)
      .filter((competitor) => Boolean(competitor.team))
      .sort((a, b) => a.position - b.position || a.seed - b.seed)
      .filter(
        (competitor, index, all) =>
          all.findIndex((candidate) => candidate.team.id === competitor.team.id) === index,
      )
      .slice(0, 6);
    const playoffTeamIds = new Set(playoffTeams.map((competitor) => competitor.team.id));
    const groupTeams = eventCompetitions
      .filter((item) => IEM_GROUP_STAGE_TIER_SLUGS.has(item.tier.slug as Constants.TierSlug))
      .flatMap((item) => item.competitors)
      .filter((competitor) => Boolean(competitor.team) && !playoffTeamIds.has(competitor.team.id))
      .sort((a, b) => a.position - b.position || a.seed - b.seed);
    const teams = [...playoffTeams, ...groupTeams]
      .filter(
        (competitor, index, all) =>
          all.findIndex((candidate) => candidate.team.id === competitor.team.id) === index,
      )
      .slice(0, 16);

    return Array.from({ length: 16 }, (_, index) => {
      const percentage = prizePool?.distribution?.[index];

      return {
        amount: percentage == null ? null : prizePool.total * (percentage / 100),
        competitor: teams[index],
        placement: index + 1,
      };
    });
  }, [competition, iemEventCompetitions, isIemEvent, prizePool]);
  const displayedPrizePoolCards = isIemEvent ? iemPrizePoolCards : prizePoolCards;
  const iemStandingsCompetitors = React.useMemo(
    () =>
      isIemEvent
        ? iemPrizePoolCards.flatMap(({ competitor, placement }) =>
            competitor ? [{ ...competitor, position: placement }] : [],
          )
        : competition.competitors,
    [competition.competitors, iemPrizePoolCards, isIemEvent],
  );
  const placementCards = React.useMemo(() => {
    if (prizePoolCards.length) {
      return prizePoolCards;
    }

    if (!eseaFormat) {
      return [];
    }

    return Array.from({ length: eseaPlayoffQualifiers || 1 }, (_, index) => ({
      amount: null as number | null,
      competitor: undefined as (typeof prizePoolCards)[number]['competitor'],
      placement: index + 1,
    }));
  }, [eseaFormat, eseaPlayoffQualifiers, prizePoolCards]);
  const activeBracketSeeds = React.useMemo(() => {
    if (competition.status === Constants.CompetitionStatus.COMPLETED) {
      return new Set<number>();
    }

    try {
      const tournament = Tournament.restore(JSON.parse(competition.tournament));
      if (!tournament.brackets) {
        return undefined;
      }

      return new Set(
        tournament.brackets
          .rounds()
          .flat()
          .filter((match) => !match.m)
          .flatMap((match) => match.p.filter((seed) => seed > 0)),
      );
    } catch {
      return undefined;
    }
  }, [competition.status, competition.tournament]);
  const activePlayoffBracketSeeds = React.useMemo(() => {
    if (!eseaPlayoffCompetition) {
      return undefined;
    }

    if (eseaPlayoffCompetition.status === Constants.CompetitionStatus.COMPLETED) {
      return new Set<number>();
    }

    try {
      const tournament = Tournament.restore(JSON.parse(eseaPlayoffCompetition.tournament));
      if (!tournament.brackets) {
        return undefined;
      }

      return new Set(
        tournament.brackets
          .rounds()
          .flat()
          .filter((match) => !match.m)
          .flatMap((match) => match.p.filter((seed) => seed > 0)),
      );
    } catch {
      return undefined;
    }
  }, [eseaPlayoffCompetition]);
  const eplRelegatedTeamIds = React.useMemo(() => {
    if (
      !isEslProLeagueGroupStage ||
      eseaPlayoffCompetition?.status !== Constants.CompetitionStatus.COMPLETED
    ) {
      return new Set<number>();
    }

    const sortByPosition = (competitors: CompetitionCompetitor[]) =>
      [...competitors].sort((a, b) => a.position - b.position);
    const playoffCompetitors = sortByPosition(eseaPlayoffCompetition.competitors);
    const playoffTeamIds = new Set(playoffCompetitors.map((competitor) => competitor.teamId));
    const finalStandings = [
      ...playoffCompetitors,
      ...sortByPosition(competition.competitors).filter(
        (competitor) => !playoffTeamIds.has(competitor.teamId),
      ),
    ];
    const regionalRanks = new Map<number, number>();

    return new Set(
      finalStandings.flatMap((competitor) => {
        const federationId = competitor.team.competitionFederationId;
        const retainedSlots = federationId
          ? EPL_RETAINED_SLOTS_BY_FEDERATION_ID[
              federationId as keyof typeof EPL_RETAINED_SLOTS_BY_FEDERATION_ID
            ]
          : undefined;

        if (!retainedSlots) {
          return [];
        }

        const regionalRank = regionalRanks.get(federationId) || 0;
        regionalRanks.set(federationId, regionalRank + 1);

        return regionalRank >= retainedSlots ? [competitor.teamId] : [];
      }),
    );
  }, [competition.competitors, eseaPlayoffCompetition, isEslProLeagueGroupStage]);
  const outcomeCards = React.useMemo<OutcomeCard[]>(() => {
    const isFinalizedCompetitor = (competitor: CompetitionCompetitor) => {
      if (competition.status === Constants.CompetitionStatus.COMPLETED) {
        return true;
      }

      if (activeBracketSeeds) {
        return !activeBracketSeeds.has(competitor.seed);
      }

      return competitor.loss > 0;
    };
    const isFinalizedPlayoffCompetitor = (competitor: CompetitionCompetitor) => {
      if (!eseaPlayoffCompetition) {
        return false;
      }

      if (eseaPlayoffCompetition.status === Constants.CompetitionStatus.COMPLETED) {
        return true;
      }

      if (activePlayoffBracketSeeds) {
        return !activePlayoffBracketSeeds.has(competitor.seed);
      }

      return competitor.loss > 0;
    };

    if (isEseaCashCup) {
      return [...competition.competitors]
        .filter((competitor) => Boolean(competitor.team))
        .sort((a, b) => a.position - b.position)
        .map((competitor, index) => ({
          competitor: isFinalizedCompetitor(competitor) ? competitor : undefined,
          detail:
            isFinalizedCompetitor(competitor) && prizePool?.distribution?.[index]
              ? Util.formatCurrency(
                  (prizePool.total * (prizePool.distribution?.[index] || 0)) / 100,
                )
              : '',
          label: getPlacementLabel(index + 1, index + 1),
        }));
    }
    if (isIemQualifier) {
      const positionedCompetitors = [...competition.competitors]
        .filter((competitor) => Boolean(competitor.team))
        .sort((a, b) => a.position - b.position);
      const placementCounts = positionedCompetitors.reduce((counts, competitor) => {
        counts.set(competitor.position, (counts.get(competitor.position) || 0) + 1);
        return counts;
      }, new Map<number, number>());

      return positionedCompetitors.map((competitor, index) => {
        const placement = competitor.position || index + 1;
        const count = placementCounts.get(competitor.position) || 1;

        return {
          competitor: isFinalizedCompetitor(competitor) ? competitor : undefined,
          detail: placement === 1 ? qualifierDestination || '' : '',
          label: getPlacementLabel(placement, placement + count - 1),
        };
      });
    }
    if (isAsiaRmrOpenQualifier && rmrOpenQualifier) {
      const positionedCompetitors = [...competition.competitors]
        .filter((competitor) => Boolean(competitor.team))
        .sort((a, b) => a.position - b.position || a.seed - b.seed);
      const claimedCompetitorIds = new Set<number>();

      return getKnockoutPlacementRanges(rmrOpenQualifier.size).flatMap(([start, end]) =>
        Array.from({ length: end - start + 1 }, () => {
          const competitor = positionedCompetitors.find(
            (entry) =>
              !claimedCompetitorIds.has(entry.id) &&
              entry.position >= start &&
              entry.position <= end &&
              isFinalizedCompetitor(entry),
          );

          if (competitor) {
            claimedCompetitorIds.add(competitor.id);
          }

          return {
            competitor: competitor && isFinalizedCompetitor(competitor) ? competitor : undefined,
            detail: start <= rmrOpenQualifier.qualifiers ? rmrOpenQualifier.destination : '',
            label: getPlacementLabel(start, end),
          };
        }),
      );
    }
    if (isCctSeries || isEslChallengerGroupStage || isEslProLeagueGroupStage) {
      const playoffPrizePool =
        Constants.PrizePool[
          isEslChallengerGroupStage
            ? Constants.TierSlug.ESL_CHALLENGER_PLAYOFFS
            : isEslProLeagueGroupStage
              ? Constants.TierSlug.LEAGUE_PRO_PLAYOFFS
              : cctPlayoffTier
        ];
      const positionedCompetitors = [...(eseaPlayoffCompetition?.competitors || [])]
        .filter((competitor) => Boolean(competitor.team))
        .sort((a, b) => a.position - b.position);
      const playoffPlacements = new Map<number, CompetitionCompetitor>();

      if (eseaPlayoffMatches[0]?.competition.tournament) {
        try {
          const tournament = Tournament.restore(
            JSON.parse(eseaPlayoffMatches[0].competition.tournament),
          );
          tournament.standings.flat().forEach((standing) => {
            const placement = standing.gpos || standing.pos;
            const competitor = positionedCompetitors.find((entry) => entry.seed === standing.seed);
            if (placement && competitor) {
              playoffPlacements.set(placement, competitor);
            }
          });
        } catch {
          // Persisted placements below are used if the bracket snapshot is unavailable.
        }
      }
      const claimedPlayoffCompetitorIds = new Set<number>();
      const getPlayoffCompetitor = (placement: number) => {
        const positioned =
          playoffPlacements.get(placement) ||
          positionedCompetitors.find(
            (competitor) =>
              competitor.position === placement && !claimedPlayoffCompetitorIds.has(competitor.id),
          );

        if (
          positioned &&
          !claimedPlayoffCompetitorIds.has(positioned.id) &&
          isFinalizedPlayoffCompetitor(positioned)
        ) {
          claimedPlayoffCompetitorIds.add(positioned.id);
          return positioned;
        }

        if (eseaPlayoffCompetition?.status !== Constants.CompetitionStatus.COMPLETED) {
          return undefined;
        }

        const fallback = positionedCompetitors.find(
          (competitor) => !claimedPlayoffCompetitorIds.has(competitor.id),
        );

        if (fallback) {
          claimedPlayoffCompetitorIds.add(fallback.id);
        }
        return fallback;
      };
      const swissRoundDifferenceByTeamId = new Map<number, number>();
      standingMatches.forEach((match) => {
        if (match.status !== Constants.MatchStatus.COMPLETED) return;
        const [home, away] = match.competitors.filter((competitor) => competitor.teamId != null);
        if (!home || !away || home.teamId == null || away.teamId == null) return;
        const difference = (home.score || 0) - (away.score || 0);
        swissRoundDifferenceByTeamId.set(
          home.teamId,
          (swissRoundDifferenceByTeamId.get(home.teamId) || 0) + difference,
        );
        swissRoundDifferenceByTeamId.set(
          away.teamId,
          (swissRoundDifferenceByTeamId.get(away.teamId) || 0) - difference,
        );
      });

      const playoffCards = getKnockoutPlacementRanges(linkedBracketSize).flatMap(([start, end]) =>
        Array.from({ length: end - start + 1 }, (_, index) => {
          const placement = start + index;
          const competitor = getPlayoffCompetitor(placement);
          const prize = playoffPrizePool?.distribution?.[placement - 1]
            ? Util.formatCurrency(
                playoffPrizePool.total *
                  ((playoffPrizePool.distribution?.[placement - 1] || 0) / 100),
              )
            : '';

          return {
            competitor,
            detail: [
              isCctSeries && placement <= cctGlobalFinalsQualifiers ? 'CCT Global Finals' : '',
              prize,
              isEslProLeagueGroupStage && competitor && eplRelegatedTeamIds.has(competitor.teamId)
                ? 'Relegation'
                : '',
            ]
              .filter(Boolean)
              .join(' + '),
            label: getPlacementLabel(start, end),
          };
        }),
      );

      if (isCctOceSeries || isEslChallengerGroupStage) {
        const sortByGroupStanding = (a: CompetitionCompetitor, b: CompetitionCompetitor) =>
          b.win - a.win ||
          a.loss - b.loss ||
          (swissRoundDifferenceByTeamId.get(b.team.id) || 0) -
            (swissRoundDifferenceByTeamId.get(a.team.id) || 0) ||
          a.position - b.position;

        const groupPlacementCards = [3, 4].flatMap((groupPlacement) => {
          const [start, end] = groupPlacement === 3 ? [5, 6] : [7, 8];

          return groupKeys.map((groupKey) => ({
            competitor: hasEseaPlayoffsStarted
              ? [...(groups[groupKey] || [])]
                  .filter((competitor) => Boolean(competitor.team))
                  .sort(sortByGroupStanding)[groupPlacement - 1]
              : undefined,
            detail: '',
            label: getPlacementLabel(start, end),
          }));
        });

        return [...playoffCards, ...groupPlacementCards];
      }

      if (isEslProLeagueGroupStage) {
        const sortByGroupStanding = (a: CompetitionCompetitor, b: CompetitionCompetitor) =>
          b.win - a.win ||
          a.loss - b.loss ||
          (swissRoundDifferenceByTeamId.get(b.team.id) || 0) -
            (swissRoundDifferenceByTeamId.get(a.team.id) || 0) ||
          a.position - b.position;

        const relegationCards = [3, 4].flatMap((groupPlacement) => {
          const [start, end] = groupPlacement === 3 ? [17, 24] : [25, 32];

          return groupKeys.map((groupKey) => {
            const competitor = hasEseaPlayoffsStarted
              ? [...(groups[groupKey] || [])]
                  .filter((competitor) => Boolean(competitor.team))
                  .sort(sortByGroupStanding)[groupPlacement - 1]
              : undefined;

            return {
              competitor,
              detail: competitor && eplRelegatedTeamIds.has(competitor.teamId) ? 'Relegation' : '',
              label: getPlacementLabel(start, end),
            };
          });
        });

        return [...playoffCards, ...relegationCards];
      }

      const swissCompetitors = [...competition.competitors]
        .filter((competitor) => Boolean(competitor.team))
        .sort(
          (a, b) =>
            b.win - a.win ||
            a.loss - b.loss ||
            (swissRoundDifferenceByTeamId.get(b.team.id) || 0) -
              (swissRoundDifferenceByTeamId.get(a.team.id) || 0) ||
            a.position - b.position,
        );

      const terminalSwissPlacementCards = [
        { losses: 3, start: 9, end: 11, wins: 2 },
        { losses: 3, start: 12, end: 14, wins: 1 },
        { losses: 3, start: 15, end: 16, wins: 0 },
      ].flatMap(({ end, losses, start, wins }) =>
        swissCompetitors
          .filter((competitor) => competitor.win === wins && competitor.loss === losses)
          .map((competitor) => ({
            competitor:
              competition.status === Constants.CompetitionStatus.COMPLETED ? competitor : undefined,
            detail: '',
            label: getPlacementLabel(start, end),
          })),
      );

      return [...playoffCards, ...terminalSwissPlacementCards];
    }
    if (eseaFormat) {
      const playoffPrizePool = Constants.PrizePool[eseaFormat.playoffTier];
      const showPlayoffPlacements = hasEseaPlayoffsStarted;
      const playoffCompetitors = showPlayoffPlacements
        ? eseaPlayoffCompetition?.competitors || []
        : [];
      const playoffPlacements = new Map<number, CompetitionCompetitor>();

      if (showPlayoffPlacements && eseaPlayoffMatches[0]?.competition.tournament) {
        try {
          const tournament = Tournament.restore(
            JSON.parse(eseaPlayoffMatches[0].competition.tournament),
          );

          tournament.standings.flat().forEach((standing) => {
            const placement = standing.gpos || standing.pos;
            const competitor = playoffCompetitors.find((entry) => entry.seed === standing.seed);

            if (placement && competitor) {
              playoffPlacements.set(placement, competitor);
            }
          });
        } catch {
          // Fall back to persisted competition positions below.
        }
      }
      const claimedPlayoffCompetitorIds = new Set<number>();
      const getPlayoffCompetitor = (placement: number) => {
        const positionedCompetitor =
          playoffPlacements.get(placement) ||
          playoffCompetitors.find((competitor) => competitor.position === placement);

        if (
          positionedCompetitor &&
          !claimedPlayoffCompetitorIds.has(positionedCompetitor.id) &&
          isFinalizedPlayoffCompetitor(positionedCompetitor)
        ) {
          claimedPlayoffCompetitorIds.add(positionedCompetitor.id);
          return positionedCompetitor;
        }

        if (eseaPlayoffCompetition?.status !== Constants.CompetitionStatus.COMPLETED) {
          return undefined;
        }

        const fallbackCompetitor = playoffCompetitors
          .filter((competitor) => !claimedPlayoffCompetitorIds.has(competitor.id))
          .sort((a, b) => a.seed - b.seed)[0];

        if (fallbackCompetitor) {
          claimedPlayoffCompetitorIds.add(fallbackCompetitor.id);
        }

        return fallbackCompetitor;
      };
      const [, , relegationZone] = Util.getTierZones(
        tierSlug,
        competition.federation.slug as Constants.FederationSlug,
      );
      const playoffCards = getKnockoutPlacementRanges(
        eseaBracketSize,
        isDoubleEseaPlayoffs,
      ).flatMap(([start, end]) => {
        const amount = playoffPrizePool?.distribution?.[start - 1]
          ? Util.formatCurrency(
              playoffPrizePool.total * ((playoffPrizePool.distribution?.[start - 1] || 0) / 100),
            )
          : null;
        const qualification = end <= (eseaPlayoffQualifiers || 0) ? eseaFormatAdvancement : null;

        return Array.from({ length: end - start + 1 }, (_, index) => {
          const placement = start + index;
          return {
            competitor: getPlayoffCompetitor(placement),
            detail: [qualification, amount].filter(Boolean).join(' + '),
            label: getPlacementLabel(start, end),
          };
        });
      });
      const leagueStageStart = eseaBracketSize + 1;
      const leagueStageEnd = competition.competitors.length;
      const hasSingleLeagueGroup =
        new Set(competition.competitors.map((competitor) => competitor.group)).size <= 1;
      const leagueRoundDifferenceByTeamId = new Map<number, number>();

      standingMatches.forEach((match) => {
        if (match.status !== Constants.MatchStatus.COMPLETED) {
          return;
        }

        const matchCompetitors = match.competitors.filter(
          (competitor) => competitor.teamId != null,
        );
        const [home, away] = matchCompetitors;

        if (!home || !away || home.teamId == null || away.teamId == null) {
          return;
        }

        const difference = (home.score || 0) - (away.score || 0);
        leagueRoundDifferenceByTeamId.set(
          home.teamId,
          (leagueRoundDifferenceByTeamId.get(home.teamId) || 0) + difference,
        );
        leagueRoundDifferenceByTeamId.set(
          away.teamId,
          (leagueRoundDifferenceByTeamId.get(away.teamId) || 0) - difference,
        );
      });
      const sortByLeagueStanding = (a: CompetitionCompetitor, b: CompetitionCompetitor) =>
        b.win - a.win ||
        a.loss - b.loss ||
        (leagueRoundDifferenceByTeamId.get(b.team.id) || 0) -
          (leagueRoundDifferenceByTeamId.get(a.team.id) || 0) ||
        a.position - b.position ||
        a.team.name.localeCompare(b.team.name);
      // Use the same ordered competitor list as the league standings. Looking up a
      // placement independently can leave holes when persisted placement values are
      // duplicated or temporarily out of sync after the playoff field is created.
      const leagueStandingCompetitors = [...competition.competitors]
        .filter((competitor) => Boolean(competitor.team))
        .sort(sortByLeagueStanding);

      if (leagueStageStart <= leagueStageEnd) {
        if (hasSingleLeagueGroup) {
          playoffCards.push(
            ...Array.from({ length: leagueStageEnd - leagueStageStart + 1 }, (_, index) => {
              const placement = leagueStageStart + index;
              const isRelegated =
                Boolean(relegationZone?.[0]) &&
                placement >= relegationZone[0] &&
                placement <= relegationZone[1];

              return {
                competitor: hasEseaPlayoffsStarted
                  ? leagueStandingCompetitors[placement - 1]
                  : undefined,
                detail: isRelegated ? 'Relegation' : '',
                label: getPlacementLabel(placement, placement),
              };
            }),
          );
        } else {
          const groupStandings = groupKeys.map((groupKey) =>
            (groups[groupKey] || [])
              .filter((competitor) => Boolean(competitor.team))
              .sort(sortByLeagueStanding),
          );
          const groupCount = groupStandings.length;
          const playoffSlotsPerGroup = Math.ceil(eseaBracketSize / groupCount);
          const lastGroupPlacement = Math.max(...groupStandings.map((standing) => standing.length));
          const [, , groupRelegationZone] = Util.getTierZonesByGroup(
            tierSlug,
            competition.federation.slug as Constants.FederationSlug,
            groupCount,
            competition.tier.groupSize,
          );

          for (
            let groupPlacement = playoffSlotsPerGroup + 1;
            groupPlacement <= lastGroupPlacement;
            groupPlacement += 1
          ) {
            const overallStart =
              eseaBracketSize + (groupPlacement - playoffSlotsPerGroup - 1) * groupCount + 1;
            const overallEnd = overallStart + groupCount - 1;
            const isRelegated =
              Boolean(groupRelegationZone?.[0]) &&
              groupPlacement >= groupRelegationZone[0] &&
              groupPlacement <= groupRelegationZone[1];

            groupStandings.forEach((standing) => {
              playoffCards.push({
                competitor: hasEseaPlayoffsStarted ? standing[groupPlacement - 1] : undefined,
                detail: isRelegated ? 'Relegation' : '',
                label: getPlacementLabel(overallStart, overallEnd),
              });
            });
          }
        }
      }

      return playoffCards;
    }

    if (isCctGlobalFinals) {
      const positionedCompetitors = [...competition.competitors]
        .filter((competitor) => Boolean(competitor.team))
        .sort((a, b) => a.position - b.position || a.seed - b.seed);

      return getKnockoutPlacementRanges(8).flatMap(([start, end]) => {
        const distribution = prizePool?.distribution || [];
        const amount = distribution[start - 1]
          ? Util.formatCurrency((prizePool?.total || 0) * (distribution[start - 1] / 100))
          : '';

        return Array.from({ length: end - start + 1 }, (_, index) => ({
          competitor:
            competition.status === Constants.CompetitionStatus.COMPLETED
              ? positionedCompetitors[start + index - 1]
              : undefined,
          detail: amount,
          label: getPlacementLabel(start, end),
        }));
      });
    }

    if (isMajorSwissStage) {
      const positionedCompetitors = [...competition.competitors]
        .filter((competitor) => Boolean(competitor.team))
        .sort((a, b) => a.position - b.position || a.seed - b.seed);

      const placementRanges = [
        [1, 2],
        [3, 5],
        [6, 8],
        [9, 11],
        [12, 14],
        [15, 16],
      ];

      return placementRanges.flatMap(([start, end]) =>
        Array.from({ length: end - start + 1 }, (_, index) => {
          const placement = start + index;

          return {
            competitor:
              competition.status === Constants.CompetitionStatus.COMPLETED
                ? positionedCompetitors.find((competitor) => competitor.position === placement)
                : undefined,
            detail: end <= 8 ? (isMajorLegendsStage ? 'Champions Stage' : majorEventName) : '',
            label: getPlacementLabel(start, end),
          };
        }),
      );
    }

    if (isAsiaRmr || isAmericasRmr || isEuropeRmr) {
      const placementRanges = isAmericasRmr
        ? [
            [1, 1],
            [2, 2],
            [3, 5],
            [6, 8],
            [9, 12],
            [13, 16],
          ]
        : isEuropeRmr
          ? isEuropeRmrA
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
            : [
                [1, 1],
                [2, 2],
                [3, 3],
                [4, 5],
                [6, 8],
                [9, 11],
                [12, 14],
                [15, 16],
              ]
          : getKnockoutPlacementRanges(8, true);

      return placementRanges.flatMap((range) => {
        if (!range) {
          return [];
        }
        const start = range[0];
        const end = range[1];

        return Array.from({ length: end - start + 1 }, (_, index) => {
          const placement = start + index;
          const detail = isAmericasRmr
            ? placement === 1
              ? majorEventName
              : placement <= 5
                ? `${majorEventName} Challengers Stage`
                : ''
            : isEuropeRmr
              ? placement <= (isEuropeRmrA ? 4 : 3)
                ? majorEventName
                : placement <= 8
                  ? `${majorEventName} Challengers Stage`
                  : ''
              : placement <= 3
                ? `${majorEventName} Challengers Stage`
                : '';
          return {
            competitor:
              competition.status === Constants.CompetitionStatus.COMPLETED
                ? competition.competitors.find((competitor) => competitor.position === placement)
                : undefined,
            detail,
            label: getPlacementLabel(start, end),
          };
        });
      });
    }

    if (!displayedPrizePoolCards.length) {
      return [];
    }

    const prizePlacementRanges = isIemEvent
      ? IEM_PRIZE_PLACEMENT_RANGES
      : isBlastFinals
        ? [
            [1, 1],
            [2, 2],
            [3, 3],
            [4, 4],
            [5, 6],
            [7, 8],
          ]
        : getKnockoutPlacementRanges(displayedPrizePoolCards.length);

    return prizePlacementRanges.flatMap((range) => {
      if (!range) {
        return [];
      }
      const [start, end] = range;
      const distribution = prizePool?.distribution || [];
      const amount = distribution[start - 1]
        ? Util.formatCurrency((prizePool?.total || 0) * (distribution[start - 1] / 100))
        : '';

      return Array.from({ length: end - start + 1 }, (_, index) => {
        const placement = start + index;
        return {
          competitor:
            competition.status === Constants.CompetitionStatus.COMPLETED
              ? displayedPrizePoolCards[placement - 1]?.competitor
              : undefined,
          detail: amount,
          label: getPlacementLabel(start, end),
        };
      });
    });
  }, [
    competition.competitors,
    competition.status,
    competition.federation.slug,
    eseaBracketSize,
    eseaFormat,
    eseaFormatAdvancement,
    isDoubleEseaPlayoffs,
    eseaPlayoffCompetition?.competitors,
    eseaPlayoffMatches,
    eseaPlayoffQualifiers,
    groupKeys,
    groups,
    hasEseaPlayoffsStarted,
    prizePool,
    displayedPrizePoolCards,
    standingMatches,
    tierSlug,
    isEseaCashCup,
    isIemQualifier,
    isAsiaRmrOpenQualifier,
    rmrOpenQualifier,
    qualifierDestination,
    isCctSeries,
    isCctOceSeries,
    isEslChallengerGroupStage,
    isEslProLeagueGroupStage,
    isCctGlobalFinals,
    isBlastFinals,
    isMajorLegendsStage,
    isMajorSwissStage,
    isAsiaRmr,
    isAmericasRmr,
    isEuropeRmr,
    isEuropeRmrA,
    majorEventName,
    cctPlayoffTier,
    cctGlobalFinalsQualifiers,
    linkedBracketSize,
    activeBracketSeeds,
    activePlayoffBracketSeeds,
    eplRelegatedTeamIds,
    eseaPlayoffCompetition?.competitors,
    eseaPlayoffCompetition?.status,
    eseaPlayoffMatches,
    standingMatches,
  ]);
  const resultMatchGroups = React.useMemo(
    () =>
      Object.values(groupBy(resultMatches, (match) => format(match.date, 'yyyy-MM-dd'))).map(
        (group) => ({
          label: format(group[0].date, 'MMMM do, yyyy'),
          matches: group,
        }),
      ),
    [resultMatches],
  );
  const validWinners = React.useMemo(
    () => winners.filter((winner) => Boolean(winner?.team)),
    [winners],
  );
  const showWinners = showWinnerHistory && validWinners.length > 0;

  const isSwiss = Boolean(Constants.TierSwissConfig[tierSlug]);
  const isBracketStandings = !effectiveGroupSize && !isSwiss;
  const advancementZones = React.useMemo(
    () =>
      Util.shouldShowStandingsZones(competition.status) &&
      Util.getTierAdvancementZones(
        tierSlug,
        competition.federation.slug as Constants.FederationSlug,
        competition.competitors.length,
      ),
    [competition.competitors.length, competition.federation.slug, competition.status, tierSlug],
  );
  const hideSmallGroupPoints = Boolean(effectiveGroupSize && effectiveGroupSize <= 4);
  const navigateTab = React.useCallback(
    (pathname: TabIdentifier) => navigate({ pathname, search: location.search }),
    [location.search, navigate],
  );

  React.useEffect(() => {
    if (!isCashCupBracketModalOpen) {
      return;
    }

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsCashCupBracketModalOpen(false);
      }
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [isCashCupBracketModalOpen]);

  return (
    <section className="divide-base-content/10 grid grid-cols-[minmax(0,9fr)_minmax(26rem,7fr)] divide-x pt-4">
      <article className="px-4">
        <section className="border-base-content/10 bg-base-200/45 overflow-hidden rounded-lg border shadow-lg">
          <aside className="flex gap-4 p-4">
            <figure
              className="border-base-content/10 center size-44 shrink-0 place-content-evenly! rounded-lg border shadow-lg"
              style={{
                backgroundImage:
                  'radial-gradient(circle at 15% 0%, rgba(255, 255, 255, 0.05), transparent 38%), radial-gradient(circle at 85% 100%, rgba(126, 177, 219, 0.06), transparent 42%), linear-gradient(to bottom, color-mix(in srgb, var(--color-base-200) 72%, black), var(--color-base-200), color-mix(in srgb, var(--color-base-100) 76%, black))',
              }}
            >
              <Image
                className="size-32 object-contain"
                src={Util.getCompetitionLogo(competition.tier.slug, competition.federation.slug, {
                  location: competition.location,
                  organizer: competition.organizer,
                })}
              />
            </figure>
            <section className="min-w-0 flex-1">
              <article className="min-w-0 py-1">
                <p className="flex items-center gap-2 text-xs font-bold uppercase">
                  <span className="text-base-content/50 truncate">
                    {isChinaRmrOpenQualifier ? 'China' : federationLabel}
                  </span>
                  <CompetitionLocationTag tier={competition.tier} />
                </p>
                <h2 className="truncate text-xl leading-tight font-black">
                  {isMajorChallengersStage
                    ? `${competitionTitle} Challengers Stage`
                    : competitionTitle}
                </h2>
              </article>
              <dl className="text-base-content/70 flex flex-wrap items-center gap-x-5 gap-y-2 py-3 text-xs font-semibold">
                <div className="flex items-center gap-2">
                  <FaCalendarAlt className="text-base-content/50 shrink-0" />
                  <dd>
                    {displayedStartDate
                      ? `${format(displayedStartDate, 'MMM d, yyyy')}${displayedEndDate ? ` – ${format(displayedEndDate, 'MMM d, yyyy')}` : ''}`
                      : 'Dates TBD'}
                  </dd>
                </div>
                {locationDisplay && (
                  <div className="flex items-center gap-2">
                    <FaMapMarkerAlt className="text-base-content/50 shrink-0" />
                    <dd className="inline-flex items-center gap-2">
                      {locationCountryCode && <span className={cx('fp', locationCountryCode)} />}
                      <span>{locationDisplay}</span>
                    </dd>
                  </div>
                )}
                {displayedPrizePool?.total && (!isMajorLegendsStage || hasTournamentStarted) ? (
                  <div className="flex items-center gap-2">
                    <FaTrophy className="text-base-content/50 shrink-0" />
                    <dt>Prize pool</dt>
                    <dd className="text-base-content">
                      {Util.formatCurrency(displayedPrizePool.total)}
                    </dd>
                  </div>
                ) : null}
                <div className="flex items-center gap-2">
                  <FaUsers className="text-base-content/50 shrink-0" />
                  <dd>
                    {displayedCompetitorCount} {displayedCompetitorCount === 1 ? 'team' : 'teams'}
                  </dd>
                </div>
              </dl>
              {(eseaFormat ||
                isFixedBracketQualifier ||
                isCctSeries ||
                isEslChallengerGroupStage ||
                isEslProLeagueGroupStage ||
                isCctGlobalFinals ||
                isBlastFinals ||
                isIemEvent ||
                isAsiaRmr ||
                isAmericasRmr ||
                isEuropeRmr ||
                isMajorSwissStage) && (
                <section className="border-base-content/10 mt-2 border-t pt-3">
                  <p className="text-base-content/70 mb-1 text-xs font-bold">Format</p>
                  {isIemEvent ? (
                    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-1.5">
                      <article className="flex min-w-0 items-start gap-2">
                        <span className="bg-base-200 text-info flex size-9 shrink-0 items-center justify-center rounded-full">
                          <FaRandom />
                        </span>
                        <span className="min-w-0">
                          <strong className="block truncate text-xs">Group Stage</strong>
                          <small className="text-base-content/60 block leading-tight">
                            Double elimination bracket · Best of 3
                          </small>
                        </span>
                      </article>
                      <FaArrowRight className="text-base-content/35 mt-2.5" />
                      <article className="flex min-w-0 items-start gap-2">
                        <span className="bg-base-200 text-info flex size-9 shrink-0 items-center justify-center rounded-full">
                          <FaSitemap />
                        </span>
                        <span className="min-w-0">
                          <strong className="block truncate text-xs">Playoffs</strong>
                          <small className="text-base-content/60 block leading-tight">
                            Single elimination bracket · Best of 3
                          </small>
                        </span>
                      </article>
                      <FaArrowRight className="text-base-content/35 mt-2.5" />
                      <article className="flex min-w-0 items-start gap-2">
                        <span className="bg-base-200 text-info flex size-9 shrink-0 items-center justify-center rounded-full">
                          <FaTrophy />
                        </span>
                        <span className="min-w-0">
                          <strong className="block truncate text-xs">Final</strong>
                          <small className="text-base-content/60 block leading-tight">
                            Best of 5
                          </small>
                        </span>
                      </article>
                    </div>
                  ) : isCctSeries || isEslChallengerGroupStage || isEslProLeagueGroupStage ? (
                    <div
                      className={cx(
                        'items-start gap-1.5',
                        isEslChallengerGroupStage || isEslProLeagueGroupStage
                          ? 'flex gap-3'
                          : 'grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)]',
                      )}
                    >
                      <article className="flex min-w-0 items-start gap-2">
                        <span className="bg-base-200 text-info flex size-9 shrink-0 items-center justify-center rounded-full">
                          <FaRandom />
                        </span>
                        <span className="min-w-0">
                          <strong className="block truncate text-xs">Group Stage</strong>
                          <small className="text-base-content/60 block leading-tight">
                            {isCctOceaniaStyleGroupStage || isEslProLeagueGroupStage
                              ? 'Swiss groups · Best of 3'
                              : '16-team Swiss · Bo1 (advancement / elimination Bo3)'}
                          </small>
                        </span>
                      </article>
                      <FaArrowRight className="text-base-content/35 mt-2.5" />
                      <article className="flex min-w-0 items-start gap-2">
                        <span className="bg-base-200 text-info flex size-9 shrink-0 items-center justify-center rounded-full">
                          <FaSitemap />
                        </span>
                        <span className="min-w-0">
                          <strong className="block truncate text-xs">Playoffs</strong>
                          <small className="text-base-content/60 block leading-tight">
                            Single elimination · Best of 3
                          </small>
                        </span>
                      </article>
                      {isCctSeries && (
                        <>
                          <FaArrowRight className="text-base-content/35 mt-2.5" />
                          <article className="flex min-w-0 items-start gap-2">
                            <span className="bg-base-200 text-info flex size-9 shrink-0 items-center justify-center rounded-full">
                              <FaTrophy />
                            </span>
                            <span className="min-w-0">
                              <strong className="block truncate text-xs">Qualification</strong>
                              <small className="text-base-content/60 block leading-tight">
                                {cctQualificationLabel}
                              </small>
                            </span>
                          </article>
                        </>
                      )}
                    </div>
                  ) : isBlastFinals ? (
                    <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-1.5">
                      <article className="flex min-w-0 items-start gap-2">
                        <span className="bg-base-200 text-info flex size-9 shrink-0 items-center justify-center rounded-full">
                          <FaSitemap />
                        </span>
                        <span className="min-w-0">
                          <strong className="block truncate text-xs">Double elimination</strong>
                          <small className="text-base-content/60 block leading-tight">
                            Best of 3
                          </small>
                        </span>
                      </article>
                    </div>
                  ) : isCctGlobalFinals ? (
                    <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-1.5">
                      <article className="flex min-w-0 items-start gap-2">
                        <span className="bg-base-200 text-info flex size-9 shrink-0 items-center justify-center rounded-full">
                          <FaSitemap />
                        </span>
                        <span className="min-w-0">
                          <strong className="block truncate text-xs">Single elimination</strong>
                          <small className="text-base-content/60 block leading-tight">
                            Best of 3
                          </small>
                        </span>
                      </article>
                    </div>
                  ) : isMajorSwissStage || isAmericasRmr || isEuropeRmr ? (
                    <div
                      className={cx(
                        'grid items-start gap-3',
                        isMajorLegendsStage
                          ? 'grid-cols-[minmax(11rem,1.5fr)_auto_minmax(8rem,1fr)_auto_minmax(8rem,1fr)]'
                          : 'grid-cols-[minmax(12rem,auto)_auto_minmax(0,1fr)]',
                      )}
                    >
                      <article className="flex min-w-0 items-start gap-2">
                        <span className="bg-base-200 text-info flex size-9 shrink-0 items-center justify-center rounded-full">
                          <FaRandom />
                        </span>
                        <span className="min-w-0">
                          <strong className="block truncate text-xs">Swiss Stage</strong>
                          <small className="text-base-content/60 block leading-tight">
                            16-team Swiss · Bo1 (advancement / elimination Bo3)
                          </small>
                        </span>
                      </article>
                      <FaArrowRight className="text-base-content/35 mt-2.5" />
                      <article className="flex min-w-0 items-start gap-2">
                        <span className="bg-base-200 text-info flex size-9 shrink-0 items-center justify-center rounded-full">
                          <FaTrophy />
                        </span>
                        <span className="min-w-0">
                          <strong className="block truncate text-xs">Qualification</strong>
                          <small className="text-base-content/60 block leading-tight">
                            {isMajorLegendsStage
                              ? 'Top 8 to Champions Stage'
                              : isMajorChallengersStage || isEuropeRmr
                                ? `Top 8 to ${majorEventName}`
                                : `Top 5 to ${majorEventName}`}
                          </small>
                        </span>
                      </article>
                      {isMajorLegendsStage && (
                        <>
                          <FaArrowRight className="text-base-content/35 mt-2.5" />
                          <article className="flex min-w-0 items-start gap-2">
                            <span className="bg-base-200 text-info flex size-9 shrink-0 items-center justify-center rounded-full">
                              <FaSitemap />
                            </span>
                            <span className="min-w-0">
                              <strong className="block truncate text-xs">Playoffs</strong>
                              <small className="text-base-content/60 block leading-tight">
                                Single elimination · Bo3 / Bo5 Final
                              </small>
                            </span>
                          </article>
                        </>
                      )}
                    </div>
                  ) : isAsiaRmr ? (
                    <div className="grid grid-cols-[minmax(12rem,auto)_auto_minmax(0,1fr)] items-start gap-3">
                      <article className="flex min-w-0 items-start gap-2">
                        <span className="bg-base-200 text-info flex size-9 shrink-0 items-center justify-center rounded-full">
                          <FaSitemap />
                        </span>
                        <span className="min-w-0">
                          <strong className="block truncate text-xs">Double elimination</strong>
                          <small className="text-base-content/60 block leading-tight">
                            Bo3 (opening round · Bo1)
                          </small>
                        </span>
                      </article>
                      <FaArrowRight className="text-base-content/35 mt-2.5" />
                      <article className="flex min-w-0 items-start gap-2">
                        <span className="bg-base-200 text-info flex size-9 shrink-0 items-center justify-center rounded-full">
                          <FaTrophy />
                        </span>
                        <span className="min-w-0">
                          <strong className="block truncate text-xs">Qualification</strong>
                          <small className="text-base-content/60 block leading-tight">
                            Top 3 to {majorEventName}
                          </small>
                        </span>
                      </article>
                    </div>
                  ) : isIemQualifier || isAsiaRmrOpenQualifier ? (
                    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-1.5">
                      <article className="flex min-w-0 items-start gap-2">
                        <span className="bg-base-200 text-info flex size-9 shrink-0 items-center justify-center rounded-full">
                          <FaSitemap />
                        </span>
                        <span className="min-w-0">
                          <strong className="block truncate text-xs">Opening bracket</strong>
                          <small className="text-base-content/60 block leading-tight">
                            {isAsiaRmrOpenQualifier
                              ? `Round of ${rmrOpenQualifier?.openingRound} to ${rmrOpenQualifier?.openingThrough} · Bo1`
                              : `Round of ${iemOpeningRound} to Round of 32 · Best of 1`}
                          </small>
                        </span>
                      </article>
                      <FaArrowRight className="text-base-content/35 mt-2.5" />
                      <article className="flex min-w-0 items-start gap-2">
                        <span className="bg-base-200 text-info flex size-9 shrink-0 items-center justify-center rounded-full">
                          <FaSitemap />
                        </span>
                        <span className="min-w-0">
                          <strong className="block truncate text-xs">Final bracket</strong>
                          <small className="text-base-content/60 block leading-tight">
                            {isAsiaRmrOpenQualifier
                              ? `${rmrOpenQualifier?.finalFrom} to Final · Bo3`
                              : 'Round of 16 to Final · Best of 3'}
                          </small>
                        </span>
                      </article>
                      <FaArrowRight className="text-base-content/35 mt-2.5" />
                      <article className="flex min-w-0 items-start gap-2">
                        <span className="bg-base-200 text-info flex size-9 shrink-0 items-center justify-center rounded-full">
                          <FaTrophy />
                        </span>
                        <span className="min-w-0">
                          <strong className="block truncate text-xs">Qualification</strong>
                          <small className="text-base-content/60 block leading-tight">
                            {isAsiaRmrOpenQualifier
                              ? rmrQualificationLabel
                              : `Winner to ${qualifierDestination}`}
                          </small>
                        </span>
                      </article>
                    </div>
                  ) : (
                    <div
                      className={cx(
                        'grid items-start gap-1.5',
                        isFixedBracketQualifier
                          ? 'grid-cols-[minmax(0,1fr)]'
                          : 'grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)]',
                      )}
                    >
                      <article className="flex min-w-0 items-start gap-2">
                        <span className="bg-base-200 text-info flex size-9 shrink-0 items-center justify-center rounded-full">
                          {isFixedBracketQualifier ? <FaSitemap /> : <FaRandom />}
                        </span>
                        <span className="min-w-0">
                          <strong className="block truncate text-xs">
                            {isFixedBracketQualifier ? 'Single elimination' : 'Group Stage'}
                          </strong>
                          <small className="text-base-content/60 block leading-tight whitespace-normal">
                            {isAsiaRmrOpenQualifier
                              ? `${rmrBracketDescription.replace('Single elimination · ', '')} · ${rmrQualificationLabel}`
                              : isIemQualifier
                                ? `Best of 1 through Round of 32 · Best of 3 from Round of 16 · Winner to ${qualifierDestination}`
                                : isEseaCashCup
                                  ? 'Best of 1'
                                  : 'Round robin · Best of 1'}
                          </small>
                        </span>
                      </article>
                      {!isFixedBracketQualifier && (
                        <FaArrowRight className="text-base-content/35 mt-2.5" />
                      )}
                      {!isFixedBracketQualifier && (
                        <article className="flex min-w-0 items-start gap-2">
                          <span className="bg-base-200 text-info flex size-9 shrink-0 items-center justify-center rounded-full">
                            <FaSitemap />
                          </span>
                          <span className="min-w-0">
                            <strong className="block truncate text-xs">Playoffs</strong>
                            <small className="text-base-content/60 block leading-tight whitespace-normal">
                              {eseaPlayoffFormat} · Best of{' '}
                              {Constants.TierMatchConfig[eseaFormat.playoffTier]?.[0] || 3}
                            </small>
                          </span>
                        </article>
                      )}
                      {!isFixedBracketQualifier && (
                        <FaArrowRight className="text-base-content/35 mt-2.5" />
                      )}
                      {!isFixedBracketQualifier && (
                        <article className="flex min-w-0 items-start gap-2">
                          <span className="bg-base-200 text-info flex size-9 shrink-0 items-center justify-center rounded-full">
                            <FaTrophy />
                          </span>
                          <span className="min-w-0">
                            <strong className="block truncate text-xs">Qualification</strong>
                            <small className="text-base-content/60 block leading-tight whitespace-normal">
                              {(eseaPlayoffQualifiers || 1) === 1
                                ? `Winner to ${eseaFormatAdvancement}`
                                : `Top ${eseaPlayoffQualifiers} to ${eseaFormatAdvancement}`}
                            </small>
                          </span>
                        </article>
                      )}
                    </div>
                  )}
                </section>
              )}
            </section>
          </aside>
          <nav className="flex justify-start gap-1 px-4">
            {[
              [TabIdentifier.OVERVIEW, t('shared.overview')],
              [TabIdentifier.RESULTS, t('shared.results')],
              ...(canViewStatistics ? [[TabIdentifier.STATISTICS, 'Statistics']] : []),
              ...(hasTournamentStarted ? [[TabIdentifier.PARTICIPANTS, 'Participants']] : []),
              ...(canViewStatistics ? [[TabIdentifier.NEWS, 'News']] : []),
            ].map(([pathname, label]) => (
              <button
                key={pathname}
                className={cx(
                  'btn btn-ghost h-10 min-w-20 rounded-none border-0 border-b-2 border-transparent px-3 text-xs font-bold shadow-none',
                  location.pathname === pathname && 'border-primary! text-primary! bg-transparent!',
                )}
                onClick={() => navigateTab(pathname as TabIdentifier)}
              >
                {label}
              </button>
            ))}
          </nav>
        </section>
        {isResultsView ? (
          <section className="border-base-content/10 bg-base-200/45 mt-4 overflow-hidden rounded-lg border shadow-lg">
            <div className="m-3 mt-5">
              <header className="mb-3 grid grid-cols-[86px_minmax(0,1fr)] px-2 text-xs font-bold text-[#75899d]">
                <span>Date</span>
                <span aria-hidden="true" />
              </header>
              {resultMatchGroups.map((group) => (
                <section key={group.label} className="mb-6 last:mb-0">
                  <h3 className="border-base-content/10 bg-base-content/10 border-y py-3 text-center text-lg font-black text-[#9aa8b5]">
                    {group.label}
                  </h3>
                  <div>
                    {group.matches.map((match) => {
                      const [home, away] = [...match.competitors].sort((a, b) => a.seed - b.seed);
                      const onClick =
                        match._count.events > 0
                          ? () =>
                              api.window.send<ModalRequest>(Constants.WindowIdentifier.Modal, {
                                target: '/postgame',
                                payload: match.id,
                              })
                          : null;

                      return (
                        <article
                          key={`${match.id}__competition_result`}
                          data-interaction-hover-sound="none"
                          className={cx(
                            'border-base-content/10 grid min-h-12 grid-cols-[78px_minmax(74px,1fr)_30px_58px_30px_minmax(74px,1fr)_66px] items-center gap-1 border-b px-3 text-sm',
                            onClick && 'hover:bg-base-content/10 cursor-pointer',
                          )}
                          onClick={onClick || undefined}
                        >
                          <time className="text-[#8392a1]">{format(match.date, 'dd/MM')}</time>
                          <span
                            className={cx(
                              'truncate text-right text-[#8392a1]',
                              home.result === Constants.MatchResult.LOSS && 'opacity-45',
                            )}
                            title={home.team.name}
                          >
                            <Link
                              to={`/teams?teamId=${home.team.id}`}
                              className="link-hover"
                              onClick={(event) => event.stopPropagation()}
                            >
                              {home.team.name}
                            </Link>
                          </span>
                          <TeamBlazon
                            src={home.team.blazon}
                            title={home.team.name}
                            className={cx(
                              'mx-auto size-6',
                              home.result === Constants.MatchResult.LOSS && 'opacity-45',
                            )}
                            blur="blur-xs"
                          />
                          <span className="text-base-content/70 text-center font-bold tracking-wide">
                            {home.score ?? '-'} : {away.score ?? '-'}
                          </span>
                          <TeamBlazon
                            src={away.team.blazon}
                            title={away.team.name}
                            className={cx(
                              'mx-auto size-6',
                              away.result === Constants.MatchResult.LOSS && 'opacity-45',
                            )}
                            blur="blur-xs"
                          />
                          <span
                            className={cx(
                              'truncate text-[#8392a1]',
                              away.result === Constants.MatchResult.LOSS && 'opacity-45',
                            )}
                            title={away.team.name}
                          >
                            <Link
                              to={`/teams?teamId=${away.team.id}`}
                              className="link-hover"
                              onClick={(event) => event.stopPropagation()}
                            >
                              {away.team.name}
                            </Link>
                          </span>
                          <button
                            className="btn btn-xs bg-[#4d6783] text-[#d8e5f1]"
                            disabled={!onClick}
                            onClick={(event) => {
                              event.stopPropagation();
                              onClick?.();
                            }}
                          >
                            Match
                          </button>
                        </article>
                      );
                    })}
                  </div>
                </section>
              ))}
              {!resultMatchGroups.length && (
                <p className="text-base-content/60 py-8 text-center text-sm">
                  No match results yet.
                </p>
              )}
            </div>
          </section>
        ) : isStatisticsView ? (
          <Statistics />
        ) : isParticipantsView ? (
          <Participants />
        ) : isNewsView ? (
          <CompetitionNews />
        ) : (
          <>
            {(eseaFormat ||
              isFixedBracketQualifier ||
              isCctSeries ||
              isEslChallengerGroupStage ||
              isEslProLeagueGroupStage ||
              isCctGlobalFinals ||
              isBlastFinals ||
              isIemEvent ||
              isAsiaRmr) && (
              <section className="border-base-content/10 bg-base-200/45 mt-4 overflow-hidden rounded-lg border shadow-lg">
                <button
                  type="button"
                  className="hover:bg-base-content/5 flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition-colors"
                  onClick={() => setIsPlayoffsOpen((value) => !value)}
                  aria-expanded={isPlayoffsOpen}
                >
                  <span>
                    <strong className="block text-xl leading-none font-black">
                      {isFixedBracketQualifier || isCctGlobalFinals || isBlastFinals || isAsiaRmr
                        ? 'Bracket'
                        : 'Playoffs'}
                    </strong>
                    <span className="text-base-content/60 block pt-0.5 text-xs">
                      {isBlastFinals
                        ? 'Double elimination · Best of 3'
                        : isIemEvent
                          ? 'Single elimination · Best of 3 · Final Best of 5'
                          : isAsiaRmr
                            ? 'Double elimination · Bo3 (opening round · Bo1)'
                            : isCctGlobalFinals ||
                                isCctSeries ||
                                isEslChallengerGroupStage ||
                                isEslProLeagueGroupStage
                              ? 'Single elimination · Best of 3'
                              : isAsiaRmrOpenQualifier
                                ? rmrBracketDescription
                                : isIemQualifier
                                  ? `Single elimination · Bo1 through Round of 32 · Bo3 from Round of 16`
                                  : isEseaCashCup
                                    ? 'Single elimination · Best of 1'
                                    : `${eseaPlayoffFormat} Bracket`}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {isFixedBracketQualifier && (
                      <button
                        type="button"
                        aria-label="View full bracket"
                        title="View full bracket"
                        className="btn btn-ghost btn-sm btn-square border-base-content/10 bg-base-100/60 rounded border shadow-none"
                        onClick={(event) => {
                          event.stopPropagation();
                          setIsCashCupBracketModalOpen(true);
                        }}
                      >
                        <FaExternalLinkAlt />
                      </button>
                    )}
                    <FaChevronDown
                      className={cx(
                        'text-base-content/55 shrink-0 transition-transform',
                        isPlayoffsOpen && 'rotate-180',
                      )}
                    />
                  </span>
                </button>
                {(isPlayoffsOpen || isAsiaRmr) && (
                  <div
                    className={cx(
                      'border-base-content/10 border-t',
                      isAsiaRmr
                        ? 'h-[31rem]'
                        : isBlastFinals
                          ? 'h-[32rem]'
                          : isIemEvent
                            ? 'h-[31rem]'
                            : isFixedBracketQualifier
                              ? eseaBracketSize >= 16
                                ? 'h-[43rem]'
                                : eseaBracketSize >= 8
                                  ? 'h-[31rem]'
                                  : 'h-[30rem]'
                              : isCctGlobalFinals
                                ? 'h-[31rem]'
                                : isEslProLeagueGroupStage
                                  ? 'h-[43rem]'
                                  : isCctSeries || isEslChallengerGroupStage
                                    ? isCctOceaniaStyleGroupStage
                                      ? 'h-[22rem]'
                                      : linkedBracketSize >= 8
                                        ? 'h-[31rem]'
                                        : 'h-[30rem]'
                                    : isDoubleEseaPlayoffs
                                      ? 'h-[32rem]'
                                      : eseaBracketSize >= 16
                                        ? 'h-[43rem]'
                                        : eseaBracketSize >= 8
                                          ? 'h-[31rem]'
                                          : 'h-[30rem]',
                    )}
                  >
                    <Brackets
                      fitToContainer={!isFixedBracketQualifier}
                      hideByeMatches={isIemEvent}
                      fitZoomMultiplier={isAsiaRmr ? 1.07 : undefined}
                      maxFitZoom={isCctOceaniaStyleGroupStage ? 1.1 : undefined}
                      minFitZoom={isAsiaRmr ? 0.45 : undefined}
                      matches={
                        shouldPreviewAsiaRmr ||
                        (isFixedBracketQualifier &&
                          competition.status === Constants.CompetitionStatus.SCHEDULED) ||
                        (isCctGlobalFinals &&
                          competition.status === Constants.CompetitionStatus.SCHEDULED) ||
                        (isBlastFinals &&
                          competition.status === Constants.CompetitionStatus.SCHEDULED) ||
                        shouldPreviewIemPlayoffs ||
                        shouldPreviewCctPlayoffs ||
                        shouldPreviewEseaPlayoffs
                          ? []
                          : isFixedBracketQualifier ||
                              isCctGlobalFinals ||
                              isBlastFinals ||
                              isIemPlayoffStage ||
                              isAsiaRmr
                            ? standingMatches
                            : eseaPlayoffMatches
                      }
                      preview={
                        shouldPreviewAsiaRmr ||
                        (isFixedBracketQualifier &&
                          competition.status === Constants.CompetitionStatus.SCHEDULED) ||
                        (isCctGlobalFinals &&
                          competition.status === Constants.CompetitionStatus.SCHEDULED) ||
                        (isBlastFinals &&
                          competition.status === Constants.CompetitionStatus.SCHEDULED) ||
                        shouldPreviewIemPlayoffs ||
                        shouldPreviewCctPlayoffs ||
                        shouldPreviewEseaPlayoffs
                          ? {
                              doubleElimination: isAsiaRmr
                                ? true
                                : isBlastFinals
                                  ? true
                                  : isFixedBracketQualifier || isCctGlobalFinals || isIemEvent
                                    ? false
                                    : isDoubleEseaPlayoffs,
                              iemPlayoffs: isIemEvent,
                              iemGroup: isAsiaRmr,
                              skipUpperFinal: isAsiaRmr,
                              size: isAsiaRmr
                                ? 8
                                : isFixedBracketQualifier
                                  ? fixedBracketSize
                                  : isCctGlobalFinals
                                    ? 8
                                    : isBlastFinals
                                      ? 8
                                      : isIemEvent
                                        ? 6
                                        : isCctSeries ||
                                            isEslChallengerGroupStage ||
                                            isEslProLeagueGroupStage
                                          ? linkedBracketSize
                                          : eseaBracketSize,
                            }
                          : undefined
                      }
                      onMatchClick={(match, position) => {
                        setPreviewMatchId(match.id);
                        setPreviewPosition(position);
                      }}
                      onPartyClick={(party) => navigate(`/teams?teamId=${party.id}`)}
                    />
                  </div>
                )}
              </section>
            )}
            {isIemEvent && (
              <section className="mt-4 grid grid-cols-1 gap-4">
                {iemGroupBrackets.map((group) => {
                  const groupMatches = group.competition
                    ? iemGroupStageMatches.filter(
                        (match) => match.competitionId === group.competition?.id,
                      )
                    : [];

                  return (
                    <article
                      key={group.slug}
                      className="border-base-content/10 bg-base-200/45 overflow-hidden rounded-lg border shadow-lg"
                    >
                      <header className="border-base-content/10 border-b px-4 py-3">
                        <h2 className="text-xl leading-none font-black">{group.label}</h2>
                        <p className="text-base-content/60 mt-1 text-xs">
                          Double elimination bracket · Best of 3
                        </p>
                      </header>
                      <div className="h-[32rem]">
                        <Brackets
                          fitToContainer
                          matches={groupMatches}
                          preview={groupMatches.length ? undefined : { iemGroup: true, size: 8 }}
                          onMatchClick={(match, position) => {
                            setPreviewMatchId(match.id);
                            setPreviewPosition(position);
                          }}
                          onPartyClick={(party) => navigate(`/teams?teamId=${party.id}`)}
                        />
                      </div>
                    </article>
                  );
                })}
              </section>
            )}
            {isMajorLegendsStage && (
              <section className="border-base-content/10 bg-base-200/45 mt-4 overflow-hidden rounded-lg border shadow-lg">
                <header className="border-base-content/10 border-b px-4 py-3">
                  <h2 className="text-xl leading-none font-black">Champions Stage</h2>
                  <p className="text-base-content/60 mt-1 text-xs">
                    Single elimination · Best of 3 · Final Best of 5
                  </p>
                </header>
                <div className="h-[31rem]">
                  <Brackets
                    fitToContainer
                    matches={majorChampionsMatches}
                    preview={majorChampionsMatches.length ? undefined : { size: 8 }}
                    onMatchClick={(match, position) => {
                      setPreviewMatchId(match.id);
                      setPreviewPosition(position);
                    }}
                    onPartyClick={(party) => navigate(`/teams?teamId=${party.id}`)}
                  />
                </div>
              </section>
            )}
            {!hasTournamentStarted && <Participants />}
            {((hasTournamentStarted &&
              (!(isAsiaRmr || isAmericasRmr || isEuropeRmr) ||
                competition.status === Constants.CompetitionStatus.COMPLETED)) ||
              isIemQualifier) &&
              !hasMajorChampionsCompleted &&
              outcomeCards.length > 0 && (
                <section className="border-base-content/10 bg-base-200/45 mt-4 rounded-lg border p-4 shadow-lg">
                  <header className="mb-4 flex items-center justify-between gap-4">
                    <h2 className="text-xl font-black">
                      {isIemQualifier ||
                      isAsiaRmrOpenQualifier ||
                      isCctSeries ||
                      isAsiaRmr ||
                      isAmericasRmr ||
                      isEuropeRmr ||
                      isMajorSwissStage
                        ? 'Qualification'
                        : eseaFormat
                          ? 'Qualification & Prize Pool'
                          : t('main.competitions.prizePool')}
                    </h2>
                    {!eseaFormat &&
                      (displayedPrizePoolCards.length > 0 ||
                        isEslChallengerGroupStage ||
                        isEslProLeagueGroupStage) && (
                        <span className="text-base-content/60 text-sm">
                          {Util.formatCurrency(
                            isEslChallengerGroupStage
                              ? Constants.PrizePool[Constants.TierSlug.ESL_CHALLENGER_PLAYOFFS]
                                  .total
                              : displayedPrizePool.total,
                          )}{' '}
                          total
                        </span>
                      )}
                  </header>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                    {outcomeCards.map(({ competitor, detail, label }, index) => (
                      <article
                        key={`${label}__outcome_${index}`}
                        className="border-base-content/10 bg-base-100/60 relative flex min-h-24 overflow-hidden rounded border px-3 py-2 text-center"
                      >
                        {competitor?.team?.blazon && (
                          <img
                            alt=""
                            aria-hidden="true"
                            className="pointer-events-none absolute inset-0 m-auto size-20 object-contain opacity-10"
                            src={competitor.team.blazon}
                          />
                        )}
                        <div className="relative z-10 flex w-full flex-col items-center justify-center">
                          {competitor?.team ? (
                            <Link
                              to={`/teams?teamId=${competitor.team.id}`}
                              className="link-hover inline-flex max-w-full items-center justify-center gap-1.5 truncate text-xs font-bold"
                              title={competitor.team.name}
                            >
                              {competitor.team.country?.code && (
                                <span
                                  className={cx(
                                    'fp shrink-0',
                                    competitor.team.country.code.toLowerCase(),
                                  )}
                                />
                              )}
                              <span className="truncate">{competitor.team.name}</span>
                            </Link>
                          ) : null}
                          <strong className="text-base-content/75 mt-1 text-sm">{label}</strong>
                          {detail && <small className="text-base-content/55 mt-2">{detail}</small>}
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              )}
            {isMajorLegendsStage &&
              hasTournamentStarted &&
              displayedMajorPrizePoolCards.length > 0 && (
                <section className="border-base-content/10 bg-base-200/45 mt-4 rounded-lg border p-4 shadow-lg">
                  <header className="mb-4 flex items-center justify-between gap-4">
                    <h2 className="text-xl font-black">{t('main.competitions.prizePool')}</h2>
                    <span className="text-base-content/60 text-sm">
                      {Util.formatCurrency(prizePool.total)} total
                    </span>
                  </header>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                    {displayedMajorPrizePoolCards.map(
                      ({ amount, competitor, label, placement }) => (
                        <article
                          key={`major-champions-prize-${placement}`}
                          className="border-base-content/10 bg-base-100/60 relative flex min-h-24 overflow-hidden rounded border px-3 py-2 text-center"
                        >
                          {competitor?.team?.blazon && (
                            <img
                              alt=""
                              aria-hidden="true"
                              className="pointer-events-none absolute inset-0 m-auto size-20 object-contain opacity-10"
                              src={competitor.team.blazon}
                            />
                          )}
                          <div className="relative z-10 flex w-full flex-col items-center justify-center">
                            {competitor?.team && (
                              <Link
                                to={`/teams?teamId=${competitor.team.id}`}
                                className="link-hover inline-flex max-w-full items-center justify-center gap-1.5 truncate text-xs font-bold"
                                title={competitor.team.name}
                              >
                                {competitor.team.country?.code && (
                                  <span
                                    className={cx(
                                      'fp shrink-0',
                                      competitor.team.country.code.toLowerCase(),
                                    )}
                                  />
                                )}
                                <span className="truncate">{competitor.team.name}</span>
                              </Link>
                            )}
                            <strong className="text-base-content/75 mt-1 text-sm">{label}</strong>
                            {amount != null && (
                              <small className="text-base-content/55 mt-2">
                                {Util.formatCurrency(amount)}
                              </small>
                            )}
                          </div>
                        </article>
                      ),
                    )}
                  </div>
                </section>
              )}
            {showWinners && !isEseaCashCup && (
              <aside>
                <header className="heading prose max-w-none">
                  <h2>{t('main.competitions.pastWinners')}</h2>
                </header>
                <table className="table table-fixed">
                  <thead>
                    <tr>
                      <th>{t('shared.name')}</th>
                      <th>{t('shared.season')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validWinners.map((winner, idx) => (
                      <tr key={winner.id + '__winner'}>
                        <td>
                          <span className="inline-flex items-center gap-2">
                            <img
                              alt={`${winner.team.name} logo`}
                              src={winner.team.blazon}
                              className="size-4"
                            />
                            <Link to={`/teams?teamId=${winner.team.id}`} className="link-hover">
                              {winner.team.name}
                            </Link>
                          </span>
                        </td>
                        <td>
                          {t('shared.season')} {competition.season - (idx + 1)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </aside>
            )}
          </>
        )}
      </article>
      <article
        className={cx(
          isStandaloneStandings &&
            'border-base-content/10 bg-base-200/45 mx-3 mb-3 overflow-hidden rounded-lg border shadow-lg',
          isMajorSwissStage && 'h-full',
        )}
      >
        <header
          className={cx(
            'heading max-w-none border-t-0!',
            isStandaloneStandings && 'relative flex h-12 items-center px-4 py-0',
          )}
        >
          <h2 className="m-0 text-xl leading-none font-black">
            {isCctRegionalSeries || isAmericasRmr || isEuropeRmr || isMajorSwissStage
              ? 'Swiss Stage'
              : isCctOceaniaStyleGroupStage || isEslProLeagueGroupStage
                ? 'Group Stage'
                : t('shared.standings')}
          </h2>
          {(isCctRegionalSeries || isAmericasRmr || isEuropeRmr || isMajorSwissStage) && (
            <button
              type="button"
              className={cx(
                'btn btn-ghost btn-sm border-base-content/10 bg-base-100/60 absolute top-1.5 right-3 rounded border text-xs font-semibold shadow-none',
                !isCctDetailedStandingsOpen &&
                  'btn-primary border-primary bg-primary text-primary-content',
              )}
              onClick={() => setIsCctDetailedStandingsOpen((value) => !value)}
            >
              Detailed view
            </button>
          )}
          {isLeagueStandings && groupKeys.length > 1 && (
            <nav className="absolute top-1.5 right-3 flex gap-1" aria-label="Standings group">
              {groupKeys.map((groupKey) => (
                <button
                  key={groupKey}
                  type="button"
                  className={cx(
                    'btn btn-ghost h-6 min-h-0 rounded-none border-0 border-b-2 border-transparent bg-transparent px-2 text-[0.65rem] font-semibold shadow-none',
                    visibleStandingGroupKeys[0] === groupKey &&
                      'border-primary! text-primary! bg-transparent!',
                  )}
                  onClick={() => setSelectedStandingGroup(groupKey)}
                >
                  Group {Util.toAlpha(groupKey)}
                </button>
              ))}
            </nav>
          )}
        </header>
        {isSwissDetailedStandings && isCctDetailedStandingsOpen && (
          <>
            <div className="h-[36rem] overflow-hidden">
              <SwissDetailedStandings
                compact
                competition={competition}
                highlight={state.profile.teamId}
                matches={standingMatches}
                onMatchClick={(match, position) => {
                  setPreviewMatchId(match.id);
                  setPreviewPosition(position);
                }}
                onTeamClick={(team) => navigate(`/teams?teamId=${team.id}`)}
              />
            </div>
            <footer className="border-base-content/10 flex gap-4 border-t px-4 py-3 text-xs">
              <span className="inline-flex items-center gap-2">
                <span className="h-4 w-1 rounded bg-green-500" />
                {isMajorLegendsStage
                  ? 'Qualified to Champions Stage'
                  : isMajorChallengersStage || isAmericasRmr || isEuropeRmr
                    ? `Qualified to ${majorEventName}`
                    : 'Qualified to Playoffs'}
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="h-4 w-1 rounded bg-red-500" />
                Eliminated
              </span>
            </footer>
          </>
        )}
        {(!isSwissDetailedStandings || !isCctDetailedStandingsOpen) &&
          !!effectiveGroupSize &&
          visibleStandingGroupKeys.map((groupKey) => (
            <Standings
              key={groupKey + '__overview_standings'}
              highlight={state.profile.teamId}
              hidePoints={isLeagueStandings || hideSmallGroupPoints}
              dense={isStandaloneStandings}
              competitors={groups[groupKey]}
              placeholderCount={
                (isCctOceaniaStyleGroupStage || isEslProLeagueGroupStage) &&
                competition.status === Constants.CompetitionStatus.SCHEDULED
                  ? 4
                  : undefined
              }
              matches={standingMatches}
              teamLink={(team) => `/teams?teamId=${team.id}`}
              title={
                isLeagueStandings ? undefined : `${t('shared.group')} ${Util.toAlpha(groupKey)}`
              }
              zones={groupZones}
              separateZones={isLeagueStandings}
              showRoundDifference={Boolean(state.profile?.simulateNpcMatchStats)}
              sortByWorldRanking={isLeagueStandings}
              zoneColors={
                isLeagueStandings
                  ? [
                      'border-l-4 border-l-green-500',
                      'border-l-4 border-l-green-500',
                      'border-l-4 border-l-red-500 bg-red-800/10',
                    ]
                  : isCctOceaniaStyleGroupStage || isEslProLeagueGroupStage
                    ? [
                        'border-l-4 border-l-green-500',
                        '',
                        'border-l-4 border-l-red-500 bg-red-800/10',
                      ]
                    : undefined
              }
            />
          ))}
        {(!isSwissDetailedStandings || !isCctDetailedStandingsOpen) &&
        !effectiveGroupSize &&
        isCashCupStyleStandings &&
        !isAsiaRmr &&
        competition.competitors.length === 0 &&
        competition.status === Constants.CompetitionStatus.SCHEDULED ? (
          <p className="text-base-content/60 px-4 py-8 text-center text-sm">
            No teams registered yet.
          </p>
        ) : (
          (!isSwissDetailedStandings || !isCctDetailedStandingsOpen) &&
          !effectiveGroupSize && (
            <Standings
              highlight={state.profile.teamId}
              dense={isStandaloneStandings}
              competitors={isIemEvent ? iemStandingsCompetitors : competition.competitors}
              placeholderCount={
                (isBlastFinals || isCctGlobalFinals || isIemEvent || isMajorSwissStage) &&
                competition.status === Constants.CompetitionStatus.SCHEDULED &&
                iemStandingsCompetitors.length === 0
                  ? isMajorSwissStage
                    ? 16
                    : isIemEvent
                      ? 16
                      : 8
                  : (isCctRegionalSeries || isAsiaRmr || isAmericasRmr || isEuropeRmr) &&
                      competition.status === Constants.CompetitionStatus.SCHEDULED
                    ? isAsiaRmr
                      ? 8
                      : CCT_SERIES_SIZE
                    : undefined
              }
              matches={isSwiss ? standingMatches : undefined}
              placeholderLabels={
                isMajorSwissStage &&
                isCctDetailedStandingsOpen &&
                competition.status === Constants.CompetitionStatus.SCHEDULED
                  ? isMajorLegendsStage
                    ? MAJOR_LEGENDS_PLACEHOLDER_SOURCES
                    : MAJOR_CHALLENGERS_PLACEHOLDER_SOURCES
                  : undefined
              }
              mode={isBracketStandings ? 'ranking' : isSwiss ? 'swiss' : undefined}
              placementRanges={
                isIemEvent
                  ? [
                      [1, 1],
                      [2, 2],
                      [3, 4],
                      [5, 6],
                      [7, 8],
                      [9, 12],
                      [13, 16],
                    ]
                  : isAsiaRmr || isAmericasRmr
                    ? getKnockoutPlacementRanges(isAmericasRmr ? 16 : 8, true)
                    : undefined
              }
              hidePoints={isCashCupStyleStandings || isBracketStandings}
              teamLink={(team) => `/teams?teamId=${team.id}`}
              zones={
                isCctGlobalFinals || isBlastFinals || isIemEvent
                  ? [
                      ...(isIemEvent
                        ? [
                            [1, 1],
                            [2, 16],
                          ]
                        : [
                            [1, 1],
                            [2, Math.max(8, competition.competitors.length)],
                          ]),
                    ]
                  : isCctRegionalSeries
                    ? [
                        [1, 8],
                        [9, 16],
                      ]
                    : isAsiaRmr
                      ? [
                          [1, 3],
                          [4, 8],
                        ]
                      : isAmericasRmr
                        ? [
                            [1, 5],
                            [6, 16],
                          ]
                        : isEuropeRmr
                          ? [
                              [1, 8],
                              [9, 16],
                            ]
                          : isMajorSwissStage
                            ? [
                                [1, 8],
                                [9, 16],
                              ]
                            : isCashCupStyleStandings &&
                                competition.status !== Constants.CompetitionStatus.SCHEDULED
                              ? [
                                  [1, isAsiaRmr ? 3 : rmrOpenQualifier?.qualifiers || 1],
                                  [
                                    (isAsiaRmr ? 3 : rmrOpenQualifier?.qualifiers || 1) + 1,
                                    Math.max(2, competition.competitors.length),
                                  ],
                                ]
                              : isBracketStandings || isSwiss
                                ? advancementZones
                                : undefined
              }
              zoneColors={
                isCctGlobalFinals ||
                isBlastFinals ||
                isIemEvent ||
                isCctRegionalSeries ||
                isAmericasRmr ||
                isEuropeRmr ||
                isMajorSwissStage
                  ? ['border-l-4 border-l-green-500', 'border-l-4 border-l-red-500 bg-red-800/10']
                  : isCashCupStyleStandings
                    ? ['border-l-4 border-l-green-500', 'border-l-4 border-l-red-500 bg-red-800/10']
                    : undefined
              }
            />
          )
        )}
        {!isMajorSwissStage &&
          !isAmericasRmr &&
          !isEuropeRmr &&
          (!isSwissDetailedStandings || !isCctDetailedStandingsOpen) &&
          isStandaloneStandings && (
            <footer className="border-base-content/10 flex flex-wrap gap-x-4 gap-y-1 border-t px-4 py-3 text-xs">
              {isCashCupStyleStandings ||
              isCctSeries ||
              isEslChallengerGroupStage ||
              isEslProLeagueGroupStage ||
              isCctGlobalFinals ||
              isBlastFinals ||
              isIemEvent ? (
                <>
                  <span className="inline-flex items-center gap-2">
                    <span className="h-4 w-1 rounded bg-green-500" />
                    {isCctSeries || isEslChallengerGroupStage || isEslProLeagueGroupStage
                      ? 'Qualified to Playoffs'
                      : isAsiaRmr
                        ? `Qualified to ${majorEventName}`
                        : isAsiaRmrOpenQualifier
                          ? `Qualified to ${rmrOpenQualifier?.destination}`
                          : isIemQualifier
                            ? `Qualified to ${qualifierDestination}`
                            : 'Winner'}
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <span className="h-4 w-1 rounded bg-red-500" />
                    Eliminated
                  </span>
                </>
              ) : (
                groupZones?.[0]?.[0] > 0 &&
                groupZones[0][1] >= groupZones[0][0] && (
                  <span className="inline-flex items-center gap-2">
                    <span className="h-4 w-1 rounded bg-green-500" />
                    Advanced
                  </span>
                )
              )}
              {!isCashCupStyleStandings &&
                !isCctSeries &&
                !isCctGlobalFinals &&
                !isBlastFinals &&
                groupZones?.[1]?.[0] > 0 &&
                groupZones[1][1] >= groupZones[1][0] && (
                  <span className="inline-flex items-center gap-2">
                    <span className="h-4 w-1 rounded bg-green-500" />
                    Qualified to Playoffs
                  </span>
                )}
              {!isCashCupStyleStandings &&
                !isCctSeries &&
                !isEslChallengerGroupStage &&
                !isEslProLeagueGroupStage &&
                !isCctGlobalFinals &&
                !isBlastFinals &&
                groupZones?.[2]?.[0] > 0 &&
                groupZones[2][1] >= groupZones[2][0] && (
                  <span className="inline-flex items-center gap-2">
                    <span className="h-4 w-1 rounded bg-red-500" />
                    Relegated
                  </span>
                )}
            </footer>
          )}
        {(isMajorSwissStage || isAmericasRmr || isEuropeRmr) && !isCctDetailedStandingsOpen && (
          <footer className="border-base-content/10 flex flex-wrap gap-x-4 gap-y-1 border-t px-4 py-3 text-xs">
            <span className="inline-flex items-center gap-2">
              <span className="h-4 w-1 rounded bg-green-500" />
              {isMajorLegendsStage
                ? 'Qualified to Champions Stage'
                : isMajorChallengersStage
                  ? 'Qualified to Playoffs'
                  : `Qualified to ${majorEventName}`}
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-4 w-1 rounded bg-red-500" />
              Eliminated
            </span>
          </footer>
        )}
      </article>
      {isCashCupBracketModalOpen && (
        <div
          className="bg-base-300/70 fixed inset-0 z-50 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={`${competitionTitle} bracket`}
        >
          <FaArrowLeft
            aria-label="Back"
            data-interaction-sound="back"
            className="fixed z-[110] size-5 cursor-pointer"
            style={{ right: '2rem', top: '1.8rem' }}
            onClick={() => setIsCashCupBracketModalOpen(false)}
          />
          <section className="border-base-content/10 bg-base-100 grid h-full w-full grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-lg border shadow-2xl">
            <header className="border-base-content/10 relative border-b px-5 py-4">
              <div>
                <h2 className="text-lg font-black">
                  {competitionTitle} {cashCupYear} Bracket
                </h2>
                <p className="text-base-content/60 text-xs">
                  {isAsiaRmrOpenQualifier
                    ? rmrBracketDescription
                    : isIemQualifier
                      ? 'Single elimination · Bo1 through Round of 32 · Bo3 from Round of 16'
                      : 'Single elimination · Best of 1'}
                </p>
              </div>
            </header>
            <div className="min-h-0">
              <Brackets
                matches={
                  competition.status === Constants.CompetitionStatus.SCHEDULED
                    ? []
                    : standingMatches
                }
                preview={
                  competition.status === Constants.CompetitionStatus.SCHEDULED
                    ? { doubleElimination: false, size: fixedBracketSize }
                    : undefined
                }
                onMatchClick={(match, position) => {
                  setPreviewMatchId(match.id);
                  setPreviewPosition(position);
                }}
                onPartyClick={(party) => navigate(`/teams?teamId=${party.id}`)}
              />
            </div>
          </section>
        </div>
      )}
      {previewMatchId != null && (
        <MatchPreviewModal
          matchId={previewMatchId}
          position={previewPosition}
          onClose={() => setPreviewMatchId(undefined)}
          onTeamClick={(teamId) => {
            setPreviewMatchId(undefined);
            navigate(`/teams?teamId=${teamId}`);
          }}
          onPlayerClick={(playerId) => {
            setPreviewMatchId(undefined);
            api.window.send<ModalRequest>(Constants.WindowIdentifier.Modal, {
              target: '/transfer',
              payload: playerId,
            });
          }}
          onOpenMatch={() => {
            api.window.send<ModalRequest>(Constants.WindowIdentifier.Modal, {
              target: '/postgame',
              payload: previewMatchId,
            });
            setPreviewMatchId(undefined);
          }}
        />
      )}
    </section>
  );
}
