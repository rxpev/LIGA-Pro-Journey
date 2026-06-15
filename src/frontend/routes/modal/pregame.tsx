/**
 * The pregame modal allows users to manage their squad
 * before starting their match.
 *
 * @module
 */
import React from 'react';
import { useLocation } from 'react-router-dom';
import { differenceBy, groupBy } from 'lodash';
import { subMonths } from 'date-fns';
import { Constants, Eagers, Util } from '@liga/shared';
import { cx } from '@liga/frontend/lib';
import { AppStateContext } from '@liga/frontend/redux';
import { useTranslation } from '@liga/frontend/hooks';
import { Image, PlayerCard } from '@liga/frontend/components';
import asiaFlag from '@liga/frontend/assets/flags/as.svg';
import euFlag from '@liga/frontend/assets/flags/eu.svg';
import northAmericaFlag from '@liga/frontend/assets/flags/na.svg';
import southAmericaFlag from '@liga/frontend/assets/flags/sa.svg';

/** @type {Matches} */
type Matches<T = typeof Eagers.match> = Awaited<ReturnType<typeof api.matches.all<T>>>;

function getOrdinalDay(day: number) {
  if (day >= 11 && day <= 13) {
    return `${day}th`;
  }

  switch (day % 10) {
    case 1:
      return `${day}st`;
    case 2:
      return `${day}nd`;
    case 3:
      return `${day}rd`;
    default:
      return `${day}th`;
  }
}

function formatMatchDate(date: Date | string) {
  const matchDate = new Date(date);

  const day = getOrdinalDay(matchDate.getDate());
  const month = new Intl.DateTimeFormat('en-US', {
    month: 'long',
  }).format(matchDate);
  const year = matchDate.getFullYear();

  return `${day} of ${month} ${year}`;
}

enum Rating {
  LOW = 0.95,
  HIGH = 1.05,
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

function getPlayerRatingFromEvents(playerId: number, events: Array<{ [key: string]: any }>) {
  const killOrAssistEvents = events.filter((event) => !!event.attackerId || !!event.assistId);
  const kills = killOrAssistEvents.filter((event) => event.attackerId === playerId).length;
  const assists = killOrAssistEvents.filter((event) => event.assistId === playerId).length;
  const deaths = killOrAssistEvents.filter(
    (event) => event.victimId === playerId && !event.assistId,
  ).length;

  return Util.getPlayerRating(kills, deaths, assists);
}

function getCustomCountryBackground(code?: string | null) {
  switch (code?.toLowerCase()) {
    case 'eu':
      return euFlag;
    case 'as':
    case 'asia':
      return asiaFlag;
    case 'na':
    case 'north-america':
    case 'northamerica':
    case 'north_america':
      return northAmericaFlag;
    case 'sa':
    case 'south-america':
    case 'southamerica':
    case 'south_america':
      return southAmericaFlag;
    default:
      return null;
  }
}

function PregameTeamHeader(props: {
  competitor: Matches[number]['competitors'][number];
  side: 'left' | 'right';
}) {
  return (
    <article
      className={cx(
        'relative z-10 flex h-full min-w-0 items-center',
        props.side === 'left' ? 'justify-start pl-16' : 'justify-end pr-16',
      )}
    >
      <div className="grid w-28 place-items-center gap-1">
        <img src={props.competitor.team.blazon} className="size-16 object-contain" />
        <p className="max-w-full truncate px-1 text-sm font-black">
          {props.competitor.team.name}
        </p>
      </div>
    </article>
  );
}

export function PregameMatchHeader(props: {
  away: Matches[number]['competitors'][number];
  home: Matches[number]['competitors'][number];
  match: Matches[number];
}) {
  const competitionLogo = Util.getCompetitionLogo(
    props.match.competition.tier.slug,
    props.match.competition.federation.slug,
    {
      location: props.match.competition.location,
      organizer: props.match.competition.organizer,
    },
  );

  const homeCountryCode = props.home.team.country?.code?.toLowerCase();
  const awayCountryCode = props.away.team.country?.code?.toLowerCase();
  const homeCountryBackground = getCustomCountryBackground(homeCountryCode);
  const awayCountryBackground = getCustomCountryBackground(awayCountryCode);
  const matchDateLabel = formatMatchDate(props.match.date);

  return (
    <section className="border-base-content/10 bg-base-200 relative isolate grid h-32 grid-cols-[minmax(0,1fr)_15rem_minmax(0,1fr)] items-center overflow-hidden border-b">
      {!!homeCountryCode && (
        <div
          className={cx(
            'pointer-events-none absolute inset-y-0 left-0 z-0 w-[15rem] bg-left bg-no-repeat saturate-75',
            !homeCountryBackground && homeCountryCode,
          )}
          style={{
            backgroundImage: homeCountryBackground ? `url(${homeCountryBackground})` : undefined,
            backgroundPosition: 'left center',
            backgroundSize: homeCountryBackground ? 'cover' : '100% 100%',
            backgroundRepeat: 'no-repeat',
            maskImage: 'linear-gradient(to right, #000 0%, rgba(0,0,0,.9) 46%, transparent 100%)',
            opacity: 0.22,
            WebkitMaskImage:
              'linear-gradient(to right, #000 0%, rgba(0,0,0,.9) 46%, transparent 100%)',
          }}
        />
      )}

      {!!awayCountryCode && (
        <div
          className={cx(
            'pointer-events-none absolute inset-y-0 right-0 z-0 w-[15rem] bg-right bg-no-repeat saturate-75',
            !awayCountryBackground && awayCountryCode,
          )}
          style={{
            backgroundImage: awayCountryBackground ? `url(${awayCountryBackground})` : undefined,
            backgroundPosition: 'right center',
            backgroundSize: awayCountryBackground ? 'cover' : '100% 100%',
            backgroundRepeat: 'no-repeat',
            maskImage: 'linear-gradient(to left, #000 0%, rgba(0,0,0,.9) 46%, transparent 100%)',
            opacity: 0.22,
            WebkitMaskImage:
              'linear-gradient(to left, #000 0%, rgba(0,0,0,.9) 46%, transparent 100%)',
          }}
        />
      )}

      <PregameTeamHeader competitor={props.home} side="left" />

      <article className="relative z-10 grid place-items-center gap-1">
        <Image src={competitionLogo} className="size-24 object-contain" />
        <p className="text-base-content/60 text-xs font-bold uppercase leading-none tracking-wide">
          {matchDateLabel}
        </p>
      </article>

      <PregameTeamHeader competitor={props.away} side="right" />
    </section>
  );
}

/**
 * Exports this module.
 *
 * @exports
 */
export default function () {
  const location = useLocation();
  const t = useTranslation('windows');
  const { state } = React.useContext(AppStateContext);
  const [match, setMatch] = React.useState<Matches[number]>();
  const [userSquad, setUserSquad] = React.useState<
    Awaited<ReturnType<typeof api.squad.all<typeof Eagers.player>>>
  >([]);
  const [recentPlayerRatings, setRecentPlayerRatings] = React.useState<
    Record<number, { maps: number; rating: number }>
  >({});

  // load profile settings for game-specific visuals
  const settingsAll = React.useMemo(
    () => !!state.profile && Util.loadSettings(state.profile.settings),
    [],
  );

  // initial data load
  React.useEffect(() => {
    if (!location.state) {
      return;
    }

    api.squad.all().then(setUserSquad);
    api.matches
      .all({
        where: {
          id: location.state,
        },
        include: Eagers.match.include,
      })
      .then((matches) => setMatch(matches[0]));
  }, []);

  // grab basic match info
  const game = React.useMemo(() => match && match.games[0], [match]);
  const [home, away] = React.useMemo(() => (match ? match.competitors : []), [match]);

  React.useEffect(() => {
    setRecentPlayerRatings({});

    if (!state.profile?.simulateNpcMatchStats || !match) {
      return;
    }

    const teamIds = match.competitors
      .map((competitor) => competitor.teamId)
      .filter((teamId): teamId is number => teamId != null);
    const teamIdSet = new Set(teamIds);

    if (!teamIds.length) {
      return;
    }

    api.matches
      .all<typeof Eagers.matchEvents>({
        ...Eagers.matchEvents,
        where: {
          status: Constants.MatchStatus.COMPLETED,
          competitionId: { not: null as null },
          matchType: { not: 'FACEIT_PUG' },
          date: {
            gte: subMonths(state.profile.date, 3),
            lte: state.profile.date,
          },
          competitors: {
            some: {
              teamId: {
                in: teamIds,
              },
            },
          },
          events: {
            some: {},
          },
        },
      })
      .then((recentMatches) => {
        const ratingRows: Record<number, { maps: number; ratingSum: number }> = {};

        recentMatches.forEach((recentMatch) => {
          Object.values(groupBy(recentMatch.events, 'gameId')).forEach((gameEvents) => {
            const playerIds = new Set<number>();

            gameEvents.forEach((event) => {
              if (event.attacker?.teamId != null && teamIdSet.has(event.attacker.teamId)) {
                playerIds.add(event.attackerId);
              }

              if (event.assist?.teamId != null && teamIdSet.has(event.assist.teamId)) {
                playerIds.add(event.assistId);
              }

              if (event.victim?.teamId != null && teamIdSet.has(event.victim.teamId)) {
                playerIds.add(event.victimId);
              }
            });

            playerIds.forEach((playerId) => {
              const rating = getPlayerRatingFromEvents(playerId, gameEvents);

              if (!Number.isFinite(rating)) {
                return;
              }

              if (!ratingRows[playerId]) {
                ratingRows[playerId] = { maps: 0, ratingSum: 0 };
              }

              ratingRows[playerId].maps += 1;
              ratingRows[playerId].ratingSum += rating;
            });
          });
        });

        setRecentPlayerRatings(
          Object.fromEntries(
            Object.entries(ratingRows).map(([playerId, row]) => [
              Number(playerId),
              {
                maps: row.maps,
                rating: row.maps ? row.ratingSum / row.maps : 0,
              },
            ]),
          ),
        );
      });
  }, [match, state.profile]);

  if (!state.profile || !match) {
    return (
      <main className="h-screen w-screen">
        <section className="center h-full">
          <span className="loading loading-bars" />
        </section>
      </main>
    );
  }

  return (
    <main className="flex h-screen w-full flex-col">
      <header className="breadcrumbs border-base-content/10 bg-base-200 sticky top-0 z-30 overflow-x-visible border-b px-2 text-sm">
        <ul>
          <li>
            <span>
              {Util.getCompetitionDisplayName(
                match.competition.tier.league.name,
                match.competition.tier.slug,
              )}
            </span>
          </li>
          <li>
            {Util.getMatchRoundLabel(match, t('shared.matchday'))}
          </li>
          {match.games.length > 1 && (
            <li>
              {t('shared.bestOf')}&nbsp;
              {match.games.length}
            </li>
          )}
          {match.games.length === 1 && (
            <li>{Util.convertMapPool(game.map, settingsAll.general.game)}</li>
          )}
        </ul>
      </header>
      <PregameMatchHeader home={home} away={away} match={match} />
      <section className="divide-base-content/10 grid grid-cols-2 items-start divide-x">
        {match.competitors.map((competitor) => {
          const isUserTeam = competitor.teamId === state.profile.teamId;
          const team = competitor.team;

          // wire user's squad which can be changed
          // on-the-fly to this competitor's squad
          if (isUserTeam) {
            team.players = team.players.map((player) => ({
              ...player,
              starter: userSquad.find((userPlayer) => userPlayer.id === player.id)?.starter,
            }));
          }

          const starters = Util.getSquad(team, state.profile, true);
          const bench = differenceBy(team.players, starters, 'id');
          const squad = { starters, bench };

          return (
            <table key={competitor.id + '__competitor'} className="table-xs table table-fixed">
              {Object.keys(squad).map((key) => (
                <React.Fragment key={key}>
                  <thead>
                    <tr className="border-t-base-content/10 border-t">
                      <th>{key.toUpperCase()}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {squad[key as keyof typeof squad].map((player) => (
                      <tr key={player.id + '__squad'}>
                        <td
                          title={player.id === state.profile.playerId ? t('shared.you') : undefined}
                          className={cx(
                            'p-0',
                            player.id === state.profile.playerId && 'bg-base-200/50',
                          )}
                        >
                          <PlayerCard
                            compact
                            key={player.id + '__squad'}
                            className="border-transparent bg-transparent"
                            game={settingsAll.general.game}
                            player={player}
                            compactMetric={
                              state.profile?.simulateNpcMatchStats
                                ? {
                                    className: recentPlayerRatings[player.id]
                                      ? getRatingColorClass(recentPlayerRatings[player.id].rating)
                                      : 'text-muted',
                                    subtitle: recentPlayerRatings[player.id]
                                      ? `(Past 3 months - ${recentPlayerRatings[player.id].maps} maps)`
                                      : '(Past 3 months)',
                                    title: 'Rating',
                                    value: recentPlayerRatings[player.id]
                                      ? recentPlayerRatings[player.id].rating.toFixed(2)
                                      : '-',
                                  }
                                : undefined
                            }
                            noStats={player.id === state.profile.playerId}
                            showStatusBadge={false}
                            wideCompactIdentity
                            onClickStarter={
                              isUserTeam &&
                              player.id !== state.profile.playerId &&
                              (userSquad.filter((userPlayer) => userPlayer.starter).length <
                                Constants.Application.SQUAD_MIN_LENGTH - 1 ||
                                player.starter) &&
                              (() => {
                                api.squad
                                  .update({
                                    where: { id: player.id },
                                    data: {
                                      starter: !player.starter,
                                    },
                                  })
                                  .then(setUserSquad);
                              })
                            }
                          />
                        </td>
                      </tr>
                    ))}
                    {squad[key as keyof typeof squad].length === 0 && (
                      <tr>
                        <td className="h-[70px] text-center">
                          <b>{team.name}</b> {t('shared.noBench')}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </React.Fragment>
              ))}
            </table>
          );
        })}
      </section>
    </main>
  );
}
