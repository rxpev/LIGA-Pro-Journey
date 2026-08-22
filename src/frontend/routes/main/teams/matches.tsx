/**
 * Team matches route.
 *
 * @module
 */
import React from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { subMonths } from 'date-fns';
import { Constants, Eagers, Util } from '@liga/shared';
import { cx } from '@liga/frontend/lib';
import { AppStateContext } from '@liga/frontend/redux';
import { useFormatAppShortDate } from '@liga/frontend/hooks';
import { TeamBlazon } from '@liga/frontend/components';
import { getTeamsRoundLabel, getTeamsTierLabel } from './labels';

type TeamMatch = Awaited<ReturnType<typeof api.matches.all<typeof Eagers.match>>>[number];
type TeamCompetition = Awaited<
  ReturnType<
    typeof api.competitions.all<{
      include: {
        competitors: true;
        federation: true;
        tier: {
          include: {
            league: true;
          };
        };
      };
    }>
  >
>[number];

const MAJOR_CHALLENGERS_STAGE_LABEL = 'Challengers Stage';
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
const IEM_PLACEMENT_RANGES: Array<[number, number]> = [
  [1, 1],
  [2, 2],
  [3, 4],
  [5, 6],
  [7, 8],
  [9, 12],
  [13, 16],
];

function getSeasonYear(season?: number | null) {
  return season ? 2025 + season : null;
}

function getPlacementLabel(position: number, count: number) {
  if (count <= 1) {
    return Util.toOrdinalSuffix(position);
  }

  const end = position + count - 1;
  return `${position}-${Util.toOrdinalSuffix(end)}`;
}

function getMajorPlacementLabel(tierSlug: string, position: number) {
  if (tierSlug === Constants.TierSlug.MAJOR_CHAMPIONS_STAGE) {
    if (position <= 2) return Util.toOrdinalSuffix(position);
    if (position <= 4) return '3-4th';
    if (position <= 8) return '5-8th';
  }

  if (tierSlug === Constants.TierSlug.MAJOR_LEGENDS_STAGE) {
    if (position <= 8) return Util.toOrdinalSuffix(position);
    if (position <= 11) return '9-11th';
    if (position <= 14) return '12-14th';
    if (position <= 16) return '15-16th';
  }

  return null;
}

function getPlacementRangeLabel(position: number, ranges: Array<[number, number]>) {
  const range = ranges.find(([start, end]) => position >= start && position <= end);

  return range ? getPlacementLabel(range[0], range[1] - range[0] + 1) : null;
}

function getKnockoutPlacementLabel(position: number, size: number) {
  const ranges: Array<[number, number]> = [];
  let start = 1;
  let count = 1;

  while (start <= size) {
    const end = Math.min(size, start + count - 1);
    ranges.push([start, end]);
    start = end + 1;
    if (start > 2) count *= 2;
  }

  return getPlacementRangeLabel(position, ranges);
}

function getCompetitionStageOrder(tierSlug?: string | null) {
  const stageOrder: Partial<Record<Constants.TierSlug, number>> = {
    [Constants.TierSlug.MAJOR_CHALLENGERS_STAGE]: 70,
    [Constants.TierSlug.MAJOR_LEGENDS_STAGE]: 80,
    [Constants.TierSlug.MAJOR_CHAMPIONS_STAGE]: 90,
    [Constants.TierSlug.LEAGUE_OPEN_PLAYOFFS]: 100,
    [Constants.TierSlug.LEAGUE_INTERMEDIATE_PLAYOFFS]: 100,
    [Constants.TierSlug.LEAGUE_MAIN_PLAYOFFS]: 100,
    [Constants.TierSlug.LEAGUE_ADVANCED_PLAYOFFS]: 100,
    [Constants.TierSlug.LEAGUE_PRO_PLAYOFFS]: 100,
    [Constants.TierSlug.ESL_CHALLENGER_PLAYOFFS]: 100,
    [Constants.TierSlug.CCT_SERIES_PLAYOFFS]: 100,
    [Constants.TierSlug.CCT_OCE_PLAYOFFS]: 100,
    [Constants.TierSlug.IEM_COLOGNE_PLAYOFFS]: 100,
    [Constants.TierSlug.IEM_KRAKOW_PLAYOFFS]: 100,
  };

  return stageOrder[tierSlug as Constants.TierSlug] ?? 50;
}

/**
 * Matches the event-card grouping used by the Competitions browser.  Prefixing
 * the card key with federation and season prevents separate editions of the
 * same tournament from being merged on a team's full match history.
 */
function getTournamentGroupKey(competition: TeamCompetition) {
  const tierSlug = competition.tier.slug as Constants.TierSlug;
  const leagueSlug = competition.tier.league?.slug as Constants.LeagueSlug | undefined;
  let tournamentKey = `${leagueSlug}:${tierSlug}`;

  if (leagueSlug === Constants.LeagueSlug.ESPORTS_LEAGUE) {
    tournamentKey = `${leagueSlug}:${Constants.IdiomaticTier[tierSlug].replace(' Playoffs', '')}`;
  } else if (leagueSlug === Constants.LeagueSlug.ESPORTS_CCT) {
    tournamentKey =
      tierSlug === Constants.TierSlug.CCT_OCE_SERIES ||
      tierSlug === Constants.TierSlug.CCT_OCE_PLAYOFFS
        ? 'cct:oceania'
        : 'cct:regional';
  } else if (leagueSlug === Constants.LeagueSlug.ESPORTS_CCT_GLOBAL) {
    tournamentKey = 'cct:global-finals';
  } else if (leagueSlug === Constants.LeagueSlug.ESPORTS_MAJOR) {
    if (tierSlug.includes('open-qualifier')) {
      tournamentKey = `major:qualifier:${tierSlug}`;
    } else if (tierSlug.includes(':rmr')) {
      tournamentKey =
        tierSlug === Constants.TierSlug.MAJOR_EUROPE_RMR_A
          ? 'major:rmr:europe:a'
          : tierSlug === Constants.TierSlug.MAJOR_EUROPE_RMR_B
            ? 'major:rmr:europe:b'
            : 'major:rmr';
    } else if (tierSlug === Constants.TierSlug.MAJOR_CHALLENGERS_STAGE) {
      tournamentKey = 'major:challengers';
    } else {
      tournamentKey = 'major:international';
    }
  } else if (
    [
      Constants.LeagueSlug.ESPORTS_BLAST,
      Constants.LeagueSlug.ESPORTS_ESEA_CASH_CUP,
      Constants.LeagueSlug.ESPORTS_IEM_COLOGNE,
      Constants.LeagueSlug.ESPORTS_IEM_KRAKOW,
      Constants.LeagueSlug.ESPORTS_ESL_CHALLENGER,
      Constants.LeagueSlug.ESPORTS_PRO_LEAGUE,
      Constants.LeagueSlug.ESPORTS_IEM_COLOGNE_QUALIFIER,
      Constants.LeagueSlug.ESPORTS_IEM_KRAKOW_QUALIFIER,
    ].includes(leagueSlug as Constants.LeagueSlug)
  ) {
    tournamentKey = leagueSlug;
  }

  return `${competition.federationId}:${competition.season}:${tournamentKey}`;
}

function getEventPlacement(competitions: TeamCompetition[], teamId: number) {
  const finalCompetition = [...competitions].sort(
    (a, b) => getCompetitionStageOrder(b.tier.slug) - getCompetitionStageOrder(a.tier.slug),
  )[0];

  if (finalCompetition?.status !== Constants.CompetitionStatus.COMPLETED) {
    return null;
  }

  const leagueSlug = finalCompetition.tier.league?.slug as Constants.LeagueSlug | undefined;
  if (leagueSlug === Constants.LeagueSlug.ESPORTS_PRO_LEAGUE) {
    const playoffCompetition = competitions.find(
      (competition) => competition.tier.slug === Constants.TierSlug.LEAGUE_PRO_PLAYOFFS,
    );
    const playoffCompetitor = playoffCompetition?.competitors.find(
      (item) => item.teamId === teamId,
    );

    if (playoffCompetitor?.position) {
      return getKnockoutPlacementLabel(
        playoffCompetitor.position,
        playoffCompetition.tier.size || 16,
      );
    }

    const groupCompetitor = competitions
      .find((competition) => competition.tier.slug === Constants.TierSlug.LEAGUE_PRO)
      ?.competitors.find((item) => item.teamId === teamId);

    return groupCompetitor?.position === 3
      ? '17-24th'
      : groupCompetitor?.position === 4
        ? '25-32nd'
        : null;
  }

  if (
    leagueSlug === Constants.LeagueSlug.ESPORTS_IEM_COLOGNE ||
    leagueSlug === Constants.LeagueSlug.ESPORTS_IEM_KRAKOW
  ) {
    const playoffTeams = competitions
      .filter((competition) =>
        IEM_PLAYOFF_TIER_SLUGS.has(competition.tier.slug as Constants.TierSlug),
      )
      .flatMap((competition) => competition.competitors)
      .sort((a, b) => a.position - b.position || a.seed - b.seed);
    const playoffTeamIds = new Set(playoffTeams.map((competitor) => competitor.teamId));
    const groupTeams = competitions
      .filter((competition) =>
        IEM_GROUP_STAGE_TIER_SLUGS.has(competition.tier.slug as Constants.TierSlug),
      )
      .flatMap((competition) => competition.competitors)
      .filter((competitor) => !playoffTeamIds.has(competitor.teamId))
      .sort((a, b) => a.position - b.position || a.seed - b.seed);
    const placement = [...playoffTeams, ...groupTeams].findIndex(
      (competitor) => competitor.teamId === teamId,
    );

    return placement < 0 ? null : getPlacementRangeLabel(placement + 1, IEM_PLACEMENT_RANGES);
  }

  const competitor = finalCompetition?.competitors.find((item) => item.teamId === teamId);

  if (!competitor?.position) {
    return null;
  }

  const majorPlacement = getMajorPlacementLabel(finalCompetition.tier.slug, competitor.position);
  if (majorPlacement) {
    return majorPlacement;
  }

  const positionCount =
    finalCompetition.competitors.filter((item) => item.position === competitor.position).length ||
    1;

  return getPlacementLabel(competitor.position, positionCount);
}

function getEventLabel(match: TeamMatch) {
  const tier = match.competition?.tier;
  const league = tier?.league;
  const federationName = match.competition?.federation?.name;
  const year = getSeasonYear(match.competition?.season);
  const city = Util.getCompetitionHostingLocationCity(match.competition?.location);

  if (!tier) {
    return federationName ?? 'Unknown competition';
  }

  if (Util.isMajorStageTier(tier.slug)) {
    const eventName = [
      Util.getMajorEventDisplayName(match.competition?.location, match.competition?.organizer),
      year,
    ]
      .filter(Boolean)
      .join(' ');

    return tier.slug === Constants.TierSlug.MAJOR_CHALLENGERS_STAGE
      ? `${eventName} ${MAJOR_CHALLENGERS_STAGE_LABEL}`
      : eventName;
  }

  if (
    [
      Constants.TierSlug.IEM_KRAKOW_GROUP_A,
      Constants.TierSlug.IEM_KRAKOW_GROUP_B,
      Constants.TierSlug.IEM_KRAKOW_PLAYOFFS,
    ].includes(tier.slug as Constants.TierSlug)
  ) {
    return ['IEM Krakow', year].filter(Boolean).join(' ');
  }

  if (tier.slug === Constants.TierSlug.IEM_KRAKOW_OPEN_QUALIFIER) {
    return ['IEM Krakow', year, 'Open Qualifier'].filter(Boolean).join(' ');
  }

  if (
    [
      Constants.TierSlug.IEM_COLOGNE_GROUP_A,
      Constants.TierSlug.IEM_COLOGNE_GROUP_B,
      Constants.TierSlug.IEM_COLOGNE_PLAYOFFS,
    ].includes(tier.slug as Constants.TierSlug)
  ) {
    return ['IEM Cologne', year].filter(Boolean).join(' ');
  }

  if (tier.slug === Constants.TierSlug.IEM_COLOGNE_OPEN_QUALIFIER) {
    return ['IEM Cologne', year, 'Open Qualifier'].filter(Boolean).join(' ');
  }

  if (
    [Constants.TierSlug.LEAGUE_PRO, Constants.TierSlug.LEAGUE_PRO_PLAYOFFS].includes(
      tier.slug as Constants.TierSlug,
    )
  ) {
    return ['ESL Pro League', city, year].filter(Boolean).join(' ');
  }

  if (
    [Constants.TierSlug.ESL_CHALLENGER, Constants.TierSlug.ESL_CHALLENGER_PLAYOFFS].includes(
      tier.slug as Constants.TierSlug,
    )
  ) {
    return ['ESL Challenger', city, year].filter(Boolean).join(' ');
  }

  const tierLabel = getTeamsTierLabel(tier.slug, league?.name);
  const suffix = tier.groupSize === null ? ` ${getTeamsRoundLabel(match)}` : '';

  const hostedEventLabel = Util.getHostedEventDisplayName(
    tier.slug,
    match.competition?.location,
    '',
  );
  if (hostedEventLabel) {
    return [hostedEventLabel, year].filter(Boolean).join(' ');
  }

  if (league?.slug === Constants.LeagueSlug.ESPORTS_PRO_LEAGUE) {
    return [tierLabel, city, year].filter(Boolean).join(' ');
  }
  if (match.competition?.federation?.slug === Constants.FederationSlug.ESPORTS_WORLD) {
    return [tierLabel, year].filter(Boolean).join(' ');
  }

  return [federationName, tierLabel, year].filter(Boolean).join(' ').trim();
}

function getTeamCompetitor(match: TeamMatch, teamId: number) {
  return match.competitors.find((competitor) => competitor.teamId === teamId);
}

function getOpponentCompetitor(match: TeamMatch, teamId: number) {
  return match.competitors.find(
    (competitor) => competitor.teamId != null && competitor.teamId !== teamId,
  );
}

function isWin(match: TeamMatch, teamId: number) {
  return getTeamCompetitor(match, teamId)?.result === Constants.MatchResult.WIN;
}

function getWinStreak(matches: TeamMatch[], teamId: number) {
  let streak = 0;

  for (const match of matches) {
    if (!isWin(match, teamId)) {
      break;
    }

    streak += 1;
  }

  return streak;
}

function getWinRate(matches: TeamMatch[], teamId: number, now: Date) {
  const start = subMonths(now, 3).getTime();
  const recentMatches = matches.filter((match) => new Date(match.date).getTime() >= start);

  if (!recentMatches.length) {
    return 0;
  }

  const wins = recentMatches.filter((match) => isWin(match, teamId)).length;
  return (wins / recentMatches.length) * 100;
}

/**
 * Exports this module.
 *
 * @exports
 */
export default function () {
  const fmtShortDate = useFormatAppShortDate();
  const { state } = React.useContext(AppStateContext);
  const { team } = useOutletContext<RouteContextTeams>();
  const [matches, setMatches] = React.useState<TeamMatch[]>([]);
  const [competitions, setCompetitions] = React.useState<TeamCompetition[]>([]);
  const [showAllResults, setShowAllResults] = React.useState(false);
  const [working, setWorking] = React.useState(false);
  const now = React.useMemo(
    () => (state.profile?.date ? new Date(state.profile.date) : new Date()),
    [state.profile?.date],
  );

  React.useEffect(() => {
    setShowAllResults(false);
    setWorking(true);
    api.matches
      .all({
        ...Eagers.match,
        orderBy: { date: 'desc' },
        where: {
          status: Constants.MatchStatus.COMPLETED,
          competitionId: { not: null as null },
          matchType: { not: 'FACEIT_PUG' },
          competitors: {
            some: {
              teamId: team.id,
            },
          },
          AND: [
            {
              competitors: {
                some: {
                  teamId: {
                    not: team.id,
                  },
                },
              },
            },
          ],
        },
        include: Eagers.match.include,
      })
      .then(async (nextMatches) => {
        const competitionScopes = [
          ...new Map(
            nextMatches.flatMap((match) =>
              match.competition
                ? [
                    [
                      `${match.competition.federationId}:${match.competition.season}`,
                      match.competition,
                    ],
                  ]
                : [],
            ),
          ).values(),
        ];
        const resultSets = await Promise.all(
          competitionScopes.map((competition) =>
            api.competitions.all<{
              include: {
                competitors: true;
                federation: true;
                tier: {
                  include: {
                    league: true;
                  };
                };
              };
            }>({
              where: {
                federationId: competition.federationId,
                season: competition.season,
              },
              include: {
                competitors: true,
                federation: true,
                tier: {
                  include: {
                    league: true,
                  },
                },
              },
            }),
          ),
        );

        return [nextMatches, resultSets.flat()] as const;
      })
      .then(([nextMatches, nextCompetitions]) => {
        setMatches(nextMatches);
        setCompetitions(nextCompetitions);
        setWorking(false);
      });
  }, [team.id]);

  const winStreak = React.useMemo(() => getWinStreak(matches, team.id), [matches, team.id]);
  const winRate = React.useMemo(() => getWinRate(matches, team.id, now), [matches, now, team.id]);
  const groupedMatches = React.useMemo(() => {
    return matches.reduce<
      Array<{
        competitionId: number | null;
        key: string;
        label: string;
        matches: TeamMatch[];
      }>
    >((groups, match) => {
      const matchCompetition = match.competition as TeamCompetition | null;
      const key = matchCompetition ? getTournamentGroupKey(matchCompetition) : String(match.id);
      const eventCompetitions = competitions.filter(
        (competition) => getTournamentGroupKey(competition) === key,
      );
      const canonicalCompetition = [...eventCompetitions].sort(
        (a, b) => getCompetitionStageOrder(a.tier.slug) - getCompetitionStageOrder(b.tier.slug),
      )[0];
      const eventLabel = canonicalCompetition
        ? getEventLabel({ competition: canonicalCompetition } as TeamMatch)
        : getEventLabel(match);
      const placement = getEventPlacement(eventCompetitions, team.id);
      const label = [eventLabel, placement].filter(Boolean).join(' - ');
      const previous = groups.find((group) => group.key === key);

      if (previous) {
        previous.matches.push(match);
        return groups;
      }

      groups.push({
        key,
        competitionId:
          eventCompetitions.sort(
            (a, b) => getCompetitionStageOrder(a.tier.slug) - getCompetitionStageOrder(b.tier.slug),
          )[0]?.id ?? null,
        label,
        matches: [match],
      });

      return groups;
    }, []);
  }, [competitions, matches, team.id]);
  const visibleGroups = React.useMemo(
    () => (showAllResults ? groupedMatches : groupedMatches.slice(0, 5)),
    [groupedMatches, showAllResults],
  );

  return (
    <section>
      <aside className="m-3">
        <header className="mb-2">
          <h3 className="text-base leading-none font-bold text-[#9aa8b5]">
            Match stats for {team.name}
          </h3>
        </header>
        <div className="border-base-content/15 bg-base-200/55 grid grid-cols-2 border">
          <article className="border-base-content/15 grid h-16 place-items-center border-r">
            <p className="text-center">
              <b className="block text-2xl leading-none text-[#9aa8b5]">{winStreak}</b>
              <span className="text-muted text-xs">Current win streak</span>
            </p>
          </article>
          <article className="relative grid h-16 place-items-center">
            <span className="text-muted absolute top-2 right-3 text-[10px]">Last 3 months</span>
            <p className="text-center">
              <b className="block text-2xl leading-none text-[#9aa8b5]">{winRate.toFixed(1)}%</b>
              <span className="text-muted text-xs">Win rate</span>
            </p>
          </article>
        </div>
      </aside>
      <aside className="m-3 mt-5">
        <header className="mb-3 grid grid-cols-[86px_minmax(0,1fr)] px-2 text-xs font-bold text-[#75899d]">
          <span>Date</span>
          <span className="text-center">Matches</span>
        </header>
        {working && (
          <div className="grid h-32 place-items-center">
            <span className="loading loading-bars loading-lg" />
          </div>
        )}
        {!working &&
          visibleGroups.map((group) => (
            <section key={`${group.key}__team_matches_group`} className="mb-6 last:mb-0">
              <h3 className="border-base-content/10 bg-base-content/10 border-y py-3 text-center text-lg font-black text-[#9aa8b5]">
                {group.competitionId ? (
                  <Link
                    to={`/competitions?competitionId=${group.competitionId}`}
                    className="link-hover"
                  >
                    {group.label}
                  </Link>
                ) : (
                  group.label
                )}
              </h3>
              <div>
                {group.matches.map((match) => {
                  const teamCompetitor = getTeamCompetitor(match, team.id);
                  const opponent = getOpponentCompetitor(match, team.id);
                  const rowTeam = teamCompetitor?.team || team;
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
                      key={`${match.id}__team_match`}
                      data-interaction-hover-sound="none"
                      className={cx(
                        'border-base-content/10 grid min-h-12 grid-cols-[78px_minmax(74px,1fr)_30px_58px_30px_minmax(74px,1fr)_66px] items-center gap-1 border-b px-3 text-sm',
                        onClick && 'hover:bg-base-content/10 cursor-pointer',
                      )}
                      onClick={onClick}
                    >
                      <time className="text-[#8392a1]">{fmtShortDate(match.date)}</time>
                      <span
                        className={cx(
                          'truncate text-right text-[#8392a1]',
                          teamCompetitor?.result === Constants.MatchResult.LOSS && 'opacity-45',
                        )}
                        title={rowTeam.name}
                      >
                        {rowTeam.name}
                      </span>
                      <TeamBlazon
                        src={rowTeam.blazon}
                        title={rowTeam.name}
                        className={cx(
                          'mx-auto size-6',
                          teamCompetitor?.result === Constants.MatchResult.LOSS && 'opacity-45',
                        )}
                        blur="blur-xs"
                      />
                      <span
                        className={cx(
                          'text-center font-bold tracking-wide',
                          Util.getResultTextColor(teamCompetitor?.result),
                        )}
                      >
                        {teamCompetitor?.score ?? '-'} : {opponent?.score ?? '-'}
                      </span>
                      {opponent?.team ? (
                        <TeamBlazon
                          src={opponent.team.blazon}
                          title={opponent.team.name}
                          className={cx(
                            'mx-auto size-6',
                            opponent.result === Constants.MatchResult.LOSS && 'opacity-45',
                          )}
                          blur="blur-xs"
                        />
                      ) : (
                        <span />
                      )}
                      <span
                        className={cx(
                          'truncate text-[#8392a1]',
                          opponent?.result === Constants.MatchResult.LOSS && 'opacity-45',
                        )}
                        title={opponent?.team.name || 'BYE'}
                      >
                        {opponent?.team ? (
                          <Link
                            to={`/teams?teamId=${opponent.team.id}`}
                            className="link-hover"
                            onClick={(event) => event.stopPropagation()}
                          >
                            {opponent.team.name}
                          </Link>
                        ) : (
                          'BYE'
                        )}
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
        {!working && !showAllResults && groupedMatches.length > visibleGroups.length && (
          <button
            className="btn w-full rounded-none border-0 bg-[#4d6783] text-[#d8e5f1]"
            onClick={() => setShowAllResults(true)}
          >
            See all results for {team.name}
          </button>
        )}
      </aside>
    </section>
  );
}
