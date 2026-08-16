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

const MAJOR_CHALLENGERS_STAGE_LABEL = 'Challengers Stage';

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

function getCompetitionPlacement(match: TeamMatch, teamId: number) {
  const competitor = match.competition?.competitors.find((item) => item.teamId === teamId);

  if (
    !competitor?.position ||
    match.competition?.status !== Constants.CompetitionStatus.COMPLETED
  ) {
    return null;
  }

  const positionCount =
    match.competition.competitors.filter((item) => item.position === competitor.position).length ||
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
      .then((result) => setMatches(result))
      .then(() => setWorking(false));
  }, [team.id]);

  const winStreak = React.useMemo(() => getWinStreak(matches, team.id), [matches, team.id]);
  const winRate = React.useMemo(() => getWinRate(matches, team.id, now), [matches, now, team.id]);
  const groupedMatches = React.useMemo(() => {
    return matches.reduce<
      Array<{
        key: string;
        label: string;
        matches: TeamMatch[];
      }>
    >((groups, match) => {
      const eventLabel = getEventLabel(match);
      const placement = getCompetitionPlacement(match, team.id);
      const label = [eventLabel, placement].filter(Boolean).join(' - ');
      const key = eventLabel;
      const previous = groups.find((group) => group.key === key);

      if (previous) {
        previous.matches.push(match);
        return groups;
      }

      groups.push({
        key,
        label,
        matches: [match],
      });

      return groups;
    }, []);
  }, [matches, team.id]);
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
                {group.label}
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
                      <span className="truncate text-right text-[#8392a1]" title={rowTeam.name}>
                        {rowTeam.name}
                      </span>
                      <TeamBlazon
                        src={rowTeam.blazon}
                        title={rowTeam.name}
                        className="mx-auto size-6"
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
                          className="mx-auto size-6 opacity-70"
                          blur="blur-xs"
                        />
                      ) : (
                        <span />
                      )}
                      <span
                        className="truncate text-[#8392a1]"
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
