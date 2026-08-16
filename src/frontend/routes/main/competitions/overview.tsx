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
import { Brackets, Standings, Image, TeamBlazon } from '@liga/frontend/components';
import {
  FaArrowRight,
  FaCalendarAlt,
  FaChartBar,
  FaChevronDown,
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
  Constants.TierSlug.ESEA_CASH_CUP,
  Constants.TierSlug.CCT_SERIES_PLAYOFFS,
  Constants.TierSlug.MAJOR_CHAMPIONS_STAGE,
  Constants.TierSlug.BLAST_FINALS,
  Constants.TierSlug.IEM_COLOGNE_PLAYOFFS,
  Constants.TierSlug.IEM_KRAKOW_PLAYOFFS,
  Constants.TierSlug.LEAGUE_PRO_PLAYOFFS,
  Constants.TierSlug.ESL_CHALLENGER_PLAYOFFS,
  Constants.TierSlug.CCT_GLOBAL_FINALS,
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
  const [isPlayoffsOpen, setIsPlayoffsOpen] = React.useState(false);
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
  const hasEseaPlayoffsStarted = Boolean(
    eseaPlayoffCompetition &&
      [Constants.CompetitionStatus.STARTED, Constants.CompetitionStatus.COMPLETED].includes(
        eseaPlayoffCompetition.status,
      ),
  );
  const locationDisplay = Util.getCompetitionDisplayLocation({
    federationName: competition.federation.name,
    federationSlug: competition.federation.slug,
    lan: competition.tier.lan,
    location: competition.location,
  });
  const locationCountryCode = Util.getCompetitionDisplayLocationCountryCode({
    federationSlug: competition.federation.slug,
    lan: competition.tier.lan,
    location: competition.location,
  });

  React.useEffect(() => {
    setEseaPlayoffCompetition(undefined);
    setEseaPlayoffMatches([]);

    if (!eseaFormat) {
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
            slug: eseaFormat.playoffTier,
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
  }, [competition.federationId, competition.season, eseaFormat]);

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
    setIsPlayoffsOpen(hasEseaPlayoffsStarted);
  }, [competition.id, eseaPlayoffCompetition?.id, hasEseaPlayoffsStarted]);

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
          competition: {
            id: competition.id,
          },
        },
      })
      .then(([match]) => setLatestScheduledMatchDate(match?.date ?? null));
  }, [competition]);

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
          competition: {
            id: competition.id,
          },
          date: {
            lte: state.profile.date.toISOString(),
          },
        },
      })
      .then((result) => setMatches(result.filter(hasOpponent).slice(0, NUM_PREVIOUS)));
  }, [competition, state.profile]);

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
          competitionId: competition.id,
          status: Constants.MatchStatus.COMPLETED,
        },
      })
      .then((result) => setResultMatches(result.filter(hasOpponent)));
  }, [competition.id, isResultsView]);

  // fetch stage matches for expandable standings rows
  React.useEffect(() => {
    setStandingMatches([]);

    if (!competition.tier.groupSize && !Constants.TierSwissConfig[tierSlug]) {
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
  }, [competition, tierSlug]);

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
  const groups = React.useMemo(
    () => groupBy(competition.competitors, 'group'),
    [competition.competitors],
  );
  const groupKeys = React.useMemo(() => Object.keys(groups), [groups]);
  const isLeagueStandings = competition.tier.league.slug === Constants.LeagueSlug.ESPORTS_LEAGUE;
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
      !(isLeagueStandings || Util.shouldShowStandingsZones(competition.status)) ||
      !competition.tier.groupSize
    ) {
      return undefined;
    }

    const zones = Util.getTierZonesByGroup(
      tierSlug,
      competition.federation.slug as Constants.FederationSlug,
      groupKeys.length,
      competition.tier.groupSize,
    );

    return zones;
  }, [
    competition.status,
    competition.tier.groupSize,
    competition.federation.slug,
    groupKeys.length,
    isLeagueStandings,
    tierSlug,
  ]);

  // filler for previous matches
  const previousFiller = React.useMemo(
    () => [...Array(Math.max(0, NUM_PREVIOUS - matches.length))],
    [matches.length],
  );

  // competition prize pool
  const prizePool = React.useMemo(() => Constants.PrizePool[tierSlug], [tierSlug]);
  const prizePoolRows = React.useMemo(
    () =>
      competition.competitors
        .filter(
          (competitor) =>
            Boolean(competitor.team) &&
            Boolean(prizePool?.distribution[(competitor.position || 1) - 1]),
        )
        .sort((a, b) => a.position - b.position)
        .map((competitor, idx) => ({
          competitor,
          placement: idx + 1,
          percentage: prizePool.distribution[idx],
        })),
    [competition.competitors, prizePool],
  );
  const visiblePrizePoolRows = showAllPrizePool
    ? prizePoolRows
    : prizePoolRows.slice(0, NUM_PRIZE_POOL_VISIBLE);
  const displayedEndDate = React.useMemo(() => {
    const calendarEndDate = competitionDates[1]?.date;

    if (!latestScheduledMatchDate) {
      return calendarEndDate;
    }

    if (!calendarEndDate) {
      return latestScheduledMatchDate;
    }

    return getDateTime(latestScheduledMatchDate) > getDateTime(calendarEndDate)
      ? latestScheduledMatchDate
      : calendarEndDate;
  }, [competitionDates, latestScheduledMatchDate]);
  const showPrizePool =
    competition.status === Constants.CompetitionStatus.COMPLETED &&
    Boolean(prizePool?.total) &&
    prizePoolRows.length > 0;
  const canExpandPrizePool = prizePoolRows.length > NUM_PRIZE_POOL_VISIBLE;
  const prizePoolCards = React.useMemo(
    () =>
      (prizePool?.distribution || []).map((percentage, index) => {
        const placement = index + 1;
        return {
          amount: prizePool.total * (percentage / 100),
          competitor: competition.competitors.find(
            (entry) => entry.position === placement && Boolean(entry.team),
          ),
          placement,
        };
      }),
    [competition.competitors, prizePool],
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
  const outcomeCards = React.useMemo<OutcomeCard[]>(() => {
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

        if (positionedCompetitor && !claimedPlayoffCompetitorIds.has(positionedCompetitor.id)) {
          claimedPlayoffCompetitorIds.add(positionedCompetitor.id);
          return positionedCompetitor;
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
        const amount = playoffPrizePool?.distribution[start - 1]
          ? Util.formatCurrency(
              playoffPrizePool.total * (playoffPrizePool.distribution[start - 1] / 100),
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
                competitor:
                  hasEseaPlayoffsStarted &&
                  competition.status === Constants.CompetitionStatus.COMPLETED
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
                competitor:
                  hasEseaPlayoffsStarted &&
                  competition.status === Constants.CompetitionStatus.COMPLETED
                    ? standing[groupPlacement - 1]
                    : undefined,
                detail: isRelegated ? 'Relegation' : '',
                label: getPlacementLabel(overallStart, overallEnd),
              });
            });
          }
        }
      }

      return playoffCards;
    }

    if (!prizePoolCards.length) {
      return [];
    }

    return getKnockoutPlacementRanges(prizePoolCards.length).flatMap(([start, end]) => {
      const amount = prizePool.distribution[start - 1]
        ? Util.formatCurrency(prizePool.total * (prizePool.distribution[start - 1] / 100))
        : '';

      return Array.from({ length: end - start + 1 }, (_, index) => {
        const placement = start + index;
        return {
          competitor:
            competition.status === Constants.CompetitionStatus.COMPLETED
              ? competition.competitors.find((competitor) => competitor.position === placement)
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
    prizePoolCards.length,
    standingMatches,
    tierSlug,
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
  const isBracketStandings = !competition.tier.groupSize && !isSwiss;
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
  const hideSmallGroupPoints = Boolean(
    competition.tier.groupSize && competition.tier.groupSize <= 4,
  );
  const navigateTab = React.useCallback(
    (pathname: TabIdentifier) => navigate({ pathname, search: location.search }),
    [location.search, navigate],
  );

  return (
    <section className="divide-base-content/10 grid grid-cols-[minmax(0,3fr)_minmax(26rem,2fr)] divide-x pt-4">
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
                    {competition.federation.name}
                  </span>
                  <CompetitionLocationTag tier={competition.tier} />
                </p>
                <h2 className="truncate text-xl leading-tight font-black">{competitionTitle}</h2>
              </article>
              <dl className="text-base-content/70 flex flex-wrap items-center gap-x-5 gap-y-2 py-3 text-xs font-semibold">
                <div className="flex items-center gap-2">
                  <FaCalendarAlt className="text-base-content/50 shrink-0" />
                  <dd>
                    {competitionDates[0]
                      ? `${format(competitionDates[0].date, 'MMM d, yyyy')}${displayedEndDate ? ` – ${format(displayedEndDate, 'MMM d, yyyy')}` : ''}`
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
                <div className="flex items-center gap-2">
                  <FaUsers className="text-base-content/50 shrink-0" />
                  <dd>
                    {competition.competitors.length}{' '}
                    {competition.competitors.length === 1 ? 'team' : 'teams'}
                  </dd>
                </div>
              </dl>
              {eseaFormat && (
                <section className="border-base-content/10 mt-2 border-t pt-3">
                  <p className="text-base-content/70 mb-1 text-xs font-bold">Format</p>
                  <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-1.5">
                    <article className="flex min-w-0 items-start gap-2">
                      <span className="bg-base-200 text-info flex size-9 shrink-0 items-center justify-center rounded-full">
                        <FaRandom />
                      </span>
                      <span className="min-w-0">
                        <strong className="block truncate text-xs">Group Stage</strong>
                        <small className="text-base-content/60 block leading-tight whitespace-normal">
                          Round robin · Best of 1
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
                        <small className="text-base-content/60 block leading-tight whitespace-normal">
                          {eseaPlayoffFormat} · Best of{' '}
                          {Constants.TierMatchConfig[eseaFormat.playoffTier]?.[0] || 3}
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
                        <small className="text-base-content/60 block leading-tight whitespace-normal">
                          {(eseaPlayoffQualifiers || 1) === 1
                            ? `Winner to ${eseaFormatAdvancement}`
                            : `Top ${eseaPlayoffQualifiers} to ${eseaFormatAdvancement}`}
                        </small>
                      </span>
                    </article>
                  </div>
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
              [TabIdentifier.NEWS, 'News'],
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
                <span className="text-center">Matches</span>
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
                            className="truncate text-right text-[#8392a1]"
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
                            className="mx-auto size-6"
                            blur="blur-xs"
                          />
                          <span
                            className={cx(
                              'text-center font-bold tracking-wide',
                              Util.getResultTextColor(home.result),
                            )}
                          >
                            {home.score ?? '-'} : {away.score ?? '-'}
                          </span>
                          <TeamBlazon
                            src={away.team.blazon}
                            title={away.team.name}
                            className="mx-auto size-6 opacity-70"
                            blur="blur-xs"
                          />
                          <span className="truncate text-[#8392a1]" title={away.team.name}>
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
            {eseaFormat && (
              <section className="border-base-content/10 bg-base-200/45 mt-4 overflow-hidden rounded-lg border shadow-lg">
                <button
                  type="button"
                  className="hover:bg-base-content/5 flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition-colors"
                  onClick={() => setIsPlayoffsOpen((value) => !value)}
                  aria-expanded={isPlayoffsOpen}
                >
                  <span>
                    <strong className="block text-sm">Playoffs</strong>
                    <span className="text-base-content/60 block pt-0.5 text-xs">
                      {eseaPlayoffFormat} Bracket
                    </span>
                  </span>
                  <FaChevronDown
                    className={cx(
                      'text-base-content/55 shrink-0 transition-transform',
                      isPlayoffsOpen && 'rotate-180',
                    )}
                  />
                </button>
                {isPlayoffsOpen && (
                  <div
                    className={cx(
                      'border-base-content/10 border-t',
                      isDoubleEseaPlayoffs
                        ? 'h-[32rem]'
                        : eseaBracketSize >= 16
                          ? 'h-[43rem]'
                          : eseaBracketSize >= 8
                            ? 'h-[31rem]'
                            : 'h-[30rem]',
                    )}
                  >
                    <Brackets
                      fitToContainer
                      matches={eseaPlayoffMatches}
                      preview={{
                        doubleElimination: isDoubleEseaPlayoffs,
                        size: eseaBracketSize,
                      }}
                      onMatchClick={(match) =>
                        api.window.send<ModalRequest>(Constants.WindowIdentifier.Modal, {
                          target: '/postgame',
                          payload: match.id,
                        })
                      }
                      onPartyClick={(party) => navigate(`/teams?teamId=${party.id}`)}
                    />
                  </div>
                )}
              </section>
            )}
            {!hasTournamentStarted && <Participants />}
            {hasTournamentStarted && outcomeCards.length > 0 && (
              <section className="border-base-content/10 bg-base-200/45 mt-4 rounded-lg border p-4 shadow-lg">
                <header className="mb-4 flex items-center justify-between gap-4">
                  <h2 className="text-xl font-black">
                    {eseaFormat ? 'Qualification & Prize Pool' : t('main.competitions.prizePool')}
                  </h2>
                  {!eseaFormat && prizePoolCards.length > 0 && (
                    <span className="text-base-content/60 text-sm">
                      {Util.formatCurrency(prizePool.total)} total
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
            {showWinners && (
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
          isLeagueStandings &&
            'border-base-content/10 bg-base-200/45 mx-3 mb-3 overflow-hidden rounded-lg border shadow-lg',
        )}
      >
        <header
          className={cx(
            'heading max-w-none border-t-0!',
            isLeagueStandings && 'relative flex h-12 items-center px-4 py-0',
          )}
        >
          <h2 className="m-0 text-xl leading-none font-black">{t('shared.standings')}</h2>
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
        {!!competition.tier.groupSize &&
          visibleStandingGroupKeys.map((groupKey) => (
            <Standings
              key={groupKey + '__overview_standings'}
              highlight={state.profile.teamId}
              hidePoints={isLeagueStandings || hideSmallGroupPoints}
              dense={isLeagueStandings}
              competitors={groups[groupKey]}
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
                  : undefined
              }
            />
          ))}
        {!competition.tier.groupSize && (
          <Standings
            highlight={state.profile.teamId}
            competitors={competition.competitors}
            matches={isSwiss ? standingMatches : undefined}
            mode={isBracketStandings ? 'ranking' : isSwiss ? 'swiss' : undefined}
            teamLink={(team) => `/teams?teamId=${team.id}`}
            zones={isBracketStandings || isSwiss ? advancementZones : undefined}
          />
        )}
        {isLeagueStandings && (
          <footer className="border-base-content/10 flex flex-wrap gap-x-4 gap-y-1 border-t px-4 py-3 text-xs">
            {groupZones[0]?.[0] > 0 && groupZones[0][1] >= groupZones[0][0] && (
              <span className="inline-flex items-center gap-2">
                <span className="h-4 w-1 rounded bg-green-500" />
                Advanced
              </span>
            )}
            {groupZones[1]?.[0] > 0 && groupZones[1][1] >= groupZones[1][0] && (
              <span className="inline-flex items-center gap-2">
                <span className="h-4 w-1 rounded bg-green-500" />
                Qualified to Playoffs
              </span>
            )}
            {groupZones[2]?.[0] > 0 && groupZones[2][1] >= groupZones[2][0] && (
              <span className="inline-flex items-center gap-2">
                <span className="h-4 w-1 rounded bg-red-500" />
                Relegated
              </span>
            )}
          </footer>
        )}
      </article>
    </section>
  );
}
