/**
 * Competition overview route.
 *
 * @module
 */
import React from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { Constants, Eagers, Util } from '@liga/shared';
import { cx } from '@liga/frontend/lib';
import { AppStateContext } from '@liga/frontend/redux';
import { useFormatAppShortDate, useTranslation } from '@liga/frontend/hooks';
import { Historial, PlayerCard, Standings, TeamBlazon } from '@liga/frontend/components';
import { FaChartBar } from 'react-icons/fa';
import { addDays, format, subMonths } from 'date-fns';
import { groupBy } from 'lodash';
import { getTeamsDivisionLabel, getTeamsTierLabel } from './labels';

/** @constant */
const NUM_PREVIOUS = 5;

/** @constant */
const NUM_FORM_LOOKBACK = NUM_PREVIOUS * 2;

/** @enum */
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

/**
 * Exports this module.
 *
 * @exports
 */
export default function () {
  const t = useTranslation('windows');
  const fmtShortDate = useFormatAppShortDate();
  const { state } = React.useContext(AppStateContext);
  const { team } = useOutletContext<RouteContextTeams>();
  const [competition, setCompetition] =
    React.useState<Awaited<ReturnType<typeof api.competitions.find<typeof Eagers.competition>>>>();
  const [matches, setMatches] = React.useState<
    Awaited<ReturnType<typeof api.matches.upcoming<typeof Eagers.match>>>
  >([]);
  const [standingMatches, setStandingMatches] = React.useState<
    Awaited<ReturnType<typeof api.matches.all<typeof Eagers.match>>>
  >([]);
  const [recentMapWinRate, setRecentMapWinRate] = React.useState<{
    maps: number;
    percentage: number;
  } | null>(null);
  const [settings, setSettings] = React.useState(Constants.Settings);
  const [squad, setSquad] = React.useState<
    Awaited<ReturnType<typeof api.players.all<typeof Eagers.player>>>
  >([]);
  const [recentPlayerRatings, setRecentPlayerRatings] = React.useState<
    Record<number, { maps: number; rating: number }>
  >({});
  const [worldRanking, setWorldRanking] = React.useState<number>(0);
  const [transfers, setTransfers] = React.useState<
    Awaited<ReturnType<typeof api.transfers.all<typeof Eagers.transfer>>>
  >([]);

  const openPlayerTransferModal = React.useCallback((playerId: number) => {
    api.window.send<ModalRequest>(Constants.WindowIdentifier.Modal, {
      target: '/transfer',
      payload: playerId,
    });
  }, []);

  // fetch data when team changes
  React.useEffect(() => {
    api.matches.previous(Eagers.match, team.id, NUM_FORM_LOOKBACK).then(setMatches);
    api.team.worldRanking(team.id).then(setWorldRanking);
    api.competitions
      .find({
        ...Eagers.competition,
        where: {
          tier: {
            slug: Constants.Prestige[team.tier],
          },
          competitors: {
            some: {
              teamId: team.id,
            },
          },
        },
        orderBy: {
          season: 'desc',
        },
      })
      .then(setCompetition);
    api.players
      .all({
        ...Eagers.player,
        where: {
          teamId: team.id,
        },
      })
      .then(setSquad);
    api.team.transfers(team.id).then(setTransfers);
  }, [team]);

  React.useEffect(() => {
    setStandingMatches([]);

    if (
      !competition ||
      (!competition.tier.groupSize &&
        !Constants.TierSwissConfig[competition.tier.slug as Constants.TierSlug])
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
  }, [competition]);

  React.useEffect(() => {
    if (!state.profile) {
      return;
    }

    api.matches
      .all({
        ...Eagers.match,
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
              teamId: team.id,
            },
          },
        },
      })
      .then((recentMatches) => {
        const playedMaps = recentMatches.flatMap((match) => {
          const hasOpponent = match.competitors.some(
            (competitor) => competitor.teamId != null && competitor.teamId !== team.id,
          );

          if (!hasOpponent) {
            return [];
          }

          const gameResults = match.games.flatMap((game) => {
            const ownGameTeam = game.teams.find((gameTeam) => gameTeam.teamId === team.id);
            const opponentGameTeam = game.teams.find(
              (gameTeam) => gameTeam.teamId != null && gameTeam.teamId !== team.id,
            );

            if (!ownGameTeam || !opponentGameTeam) {
              return [];
            }

            if (ownGameTeam.result != null) {
              return [ownGameTeam.result];
            }

            if (ownGameTeam.score != null && opponentGameTeam.score != null) {
              if (ownGameTeam.score > opponentGameTeam.score) {
                return [Constants.MatchResult.WIN];
              }

              if (ownGameTeam.score < opponentGameTeam.score) {
                return [Constants.MatchResult.LOSS];
              }

              return [Constants.MatchResult.DRAW];
            }

            return [];
          });

          if (gameResults.length) {
            return gameResults;
          }

          const ownMatchTeam = match.competitors.find(
            (competitor) => competitor.teamId === team.id,
          );
          const opponentMatchTeam = match.competitors.find(
            (competitor) => competitor.teamId != null && competitor.teamId !== team.id,
          );
          const ownScore = ownMatchTeam?.score ?? null;
          const opponentScore = opponentMatchTeam?.score ?? null;
          const looksLikeSeriesScore =
            ownScore != null &&
            opponentScore != null &&
            ownScore + opponentScore > 1 &&
            ownScore + opponentScore <= 5 &&
            ownScore <= 3 &&
            opponentScore <= 3;

          if (looksLikeSeriesScore) {
            return [
              ...Array(ownScore).fill(Constants.MatchResult.WIN),
              ...Array(opponentScore).fill(Constants.MatchResult.LOSS),
            ];
          }

          return ownMatchTeam?.result != null ? [ownMatchTeam.result] : [];
        });

        if (!playedMaps.length) {
          setRecentMapWinRate(null);
          return;
        }

        const wins = playedMaps.filter((result) => result === Constants.MatchResult.WIN).length;

        setRecentMapWinRate({
          maps: playedMaps.length,
          percentage: Math.round((wins / playedMaps.length) * 100),
        });
      });
  }, [state.profile, team]);

  React.useEffect(() => {
    setRecentPlayerRatings({});

    if (!state.profile?.simulateNpcMatchStats) {
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
              teamId: team.id,
            },
          },
          events: {
            some: {},
          },
        },
      })
      .then((recentMatches) => {
        const ratingRows: Record<number, { maps: number; ratingSum: number }> = {};

        recentMatches.forEach((match) => {
          Object.values(groupBy(match.events, 'gameId')).forEach((gameEvents) => {
            const playerIds = new Set<number>();

            gameEvents.forEach((event) => {
              if (event.attacker?.teamId === team.id && event.attackerId != null) {
                playerIds.add(event.attackerId);
              }

              if (event.assist?.teamId === team.id && event.assistId != null) {
                playerIds.add(event.assistId);
              }

              if (event.victim?.teamId === team.id && event.victimId != null) {
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
  }, [state.profile, team]);

  // load settings
  React.useEffect(() => {
    if (!state.profile) {
      return;
    }

    setSettings(Util.loadSettings(state.profile.settings));
  }, [state.profile]);

  // grab user's team info
  const userTeam = React.useMemo(
    () =>
      !!competition && competition.competitors.find((competitor) => competitor.teamId === team.id),
    [competition, team],
  );

  // grab group to highlight
  const group = React.useMemo(
    () =>
      !!competition &&
      competition.competitors.filter((competitor) => competitor.group === (userTeam?.group || 1)),
    [competition, userTeam],
  );

  // filler for previous matches
  const playedMatches = React.useMemo(
    () =>
      matches
        .filter((match) =>
          match.competitors.some(
            (competitor) => competitor.teamId != null && competitor.teamId !== team.id,
          ),
        )
        .slice(0, NUM_PREVIOUS),
    [matches, team.id],
  );
  const previousFiller = React.useMemo(
    () => [...Array(Math.max(0, NUM_PREVIOUS - playedMatches.length))],
    [playedMatches.length],
  );
  const divisionLabel = getTeamsDivisionLabel(
    competition?.tier.slug,
    competition?.tier.league.name,
  );

  const sortedSquad = React.useMemo(
    () => [...squad].sort((a, b) => Number(b.starter) - Number(a.starter)),
    [squad],
  );

  if (!competition) {
    return (
      <section className="center h-full">
        <span className="loading loading-bars" />
      </section>
    );
  }

  return (
    <section className="divide-base-content/10 grid grid-cols-2 divide-x">
      <article>
        <header className="heading prose max-w-none border-t-0!">
          <h2>{t('shared.overview')}</h2>
        </header>
        <aside>
          <section className="border-base-content/10 flex items-center gap-3 border-b p-4">
            <TeamBlazon alt={team.name} src={team.blazon} className="size-20" />
            <article className="min-w-0">
              <h3 className="truncate text-xl leading-tight font-bold" title={team.name}>
                {team.name}
              </h3>
              <p className="mt-1 truncate text-sm" title={team.country.name}>
                <span className={cx('fp', team.country.code.toLowerCase())} />
                &nbsp;{team.country.name}
              </p>
            </article>
          </section>
          <section className="divide-base-content/10 grid grid-cols-4 divide-x">
            <article className="min-w-0 p-4">
              <p className="text-muted mb-2 text-xs font-bold uppercase">Form</p>
              <Historial matches={matches} teamId={team.id} />
            </article>
            <article className="min-w-0 p-4">
              <p className="text-muted mb-2 text-xs font-bold uppercase">
                {t('main.teams.division')}
              </p>
              <p className="truncate" title={divisionLabel}>
                {divisionLabel}
              </p>
            </article>
            <article className="min-w-0 p-4">
              <p className="text-muted mb-2 text-xs font-bold uppercase">
                {t('shared.worldRanking')}
              </p>
              <p className="truncate">
                <span>#{worldRanking}</span>&nbsp;
                <span className="text-muted">({team.elo} Elo)</span>
              </p>
            </article>
            <article className="min-w-0 p-4">
              <p className="text-muted mb-2 text-xs font-bold uppercase">Win % Last 3 Months</p>
              <p
                className={cx(
                  recentMapWinRate && recentMapWinRate.percentage > 50 && 'text-success',
                  recentMapWinRate && recentMapWinRate.percentage < 50 && 'text-error',
                )}
              >
                {recentMapWinRate == null
                  ? '-'
                  : `${recentMapWinRate.percentage}% (${recentMapWinRate.maps} maps)`}
              </p>
            </article>
          </section>
        </aside>
        <aside>
          <header className="heading prose max-w-none border-t-0!">
            <h2>{t('shared.squad')}</h2>
          </header>
          <table className="table-xs table table-fixed">
            <tbody>
              {sortedSquad.map((player) => (
                <tr key={player.id + '__squad'}>
                  <td
                    title={player.id === state.profile.playerId ? t('shared.you') : undefined}
                    className={cx(
                      'hover:bg-base-content/10 cursor-pointer p-0',
                      player.id === state.profile.playerId && 'bg-base-200/50',
                    )}
                    onClick={() => openPlayerTransferModal(player.id)}
                  >
                    <PlayerCard
                      compact
                      key={player.id + '__squad'}
                      className="border-transparent bg-transparent"
                      compactAvatarClassName="h-17"
                      game={settings.general.game}
                      player={player}
                      compactMetric={
                        state.profile?.simulateNpcMatchStats
                          ? {
                              className: recentPlayerRatings[player.id]
                                ? getRatingColorClass(recentPlayerRatings[player.id].rating)
                                : 'text-muted',
                              subtitle: recentPlayerRatings[player.id]
                                ? `(Past 3 months • ${recentPlayerRatings[player.id].maps} maps)`
                                : '(Past 3 months)',
                              title: 'Rating',
                              value: recentPlayerRatings[player.id]
                                ? recentPlayerRatings[player.id].rating.toFixed(2)
                                : '-',
                            }
                          : undefined
                      }
                      noStats={player.id === state.profile.playerId}
                    />
                  </td>
                </tr>
              ))}
              {sortedSquad.length === 0 && (
                <tr>
                  <td className="h-[70px] text-center">
                    <b>{team.name}</b> {t('shared.noBench')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </aside>
        <aside>
          <header className="heading prose max-w-none border-t-0!">
            <h2>{t('shared.recentMatchResults')}</h2>
          </header>
          <table className="table table-fixed">
            <tbody>
              {!!playedMatches.length &&
                playedMatches.map((match) => {
                  const opponent = match.competitors.find(
                    (c) => c.teamId != null && c.teamId !== team.id,
                  );
                  const result = match.competitors.find((c) => c.teamId === team.id)?.result;
                  const onClick =
                    match._count.events > 0
                      ? () =>
                          api.window.send<ModalRequest>(Constants.WindowIdentifier.Modal, {
                            target: '/postgame',
                            payload: match.id,
                          })
                      : null;

                  const tierLabel = getTeamsTierLabel(
                    match.competition.tier.slug,
                    match.competition.tier.league?.name,
                  );
                  const competitionLabel =
                    match.competition.tier.league.slug === Constants.LeagueSlug.ESPORTS_PRO_LEAGUE
                      ? tierLabel
                      : tierLabel;
                  const competitionLink = `/competitions?federationId=${match.competition.federationId}&season=${match.competition.season}&tierId=${match.competition.tier.id}`;

                  return (
                    <tr
                      key={`${match.id}__match_previous`}
                      onClick={onClick}
                      className={cx(onClick && 'hover:bg-base-content/10 cursor-pointer')}
                    >
                      <td
                        className={cx('w-1/12', !onClick && 'text-muted')}
                        title={onClick ? 'View Match Details' : 'No Match Details'}
                      >
                        <FaChartBar />
                      </td>
                      <td className="w-1/12" title={format(match.date, 'PPPP')}>
                        {fmtShortDate(match.date)}
                      </td>
                      <td className={cx('w-3/12 text-center', Util.getResultTextColor(result))}>
                        {match.competitors.map((competitor) => competitor.score).join(' : ') || '-'}
                      </td>
                      <td className="w-4/12 truncate" title={opponent?.team.name || '-'}>
                        {!!opponent?.team && (
                          <img
                            src={opponent?.team.blazon || 'resources://blazonry/009400.png'}
                            className="mr-2 inline-block size-4"
                          />
                        )}
                        {!!opponent?.team && (
                          <Link
                            to={`/teams?teamId=${opponent.team.id}`}
                            className="link-hover"
                            onClick={(event) => event.stopPropagation()}
                          >
                            {opponent.team.name}
                          </Link>
                        )}
                        {!opponent?.team && <span>BYE</span>}
                      </td>
                      <td className="w-3/12 truncate" title={competitionLabel}>
                        <Link
                          to={competitionLink}
                          className="link-hover"
                          onClick={(event) => event.stopPropagation()}
                        >
                          {competitionLabel}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              {previousFiller.map((_, idx) => (
                <tr key={`${idx}__filler_match_previous`} className="text-muted">
                  <td className="w-1/12">
                    {state.profile
                      ? fmtShortDate(
                          addDays(
                            !playedMatches.length
                              ? state.profile.date
                              : playedMatches.slice(-1)[0].date,
                            idx - 1,
                          ),
                        )
                      : '-'}
                  </td>
                  <td className="w-4/12 text-center">-</td>
                  <td className="w-4/12">{t('shared.noRecentMatch')}</td>
                  <td className="w-3/12">-</td>
                </tr>
              ))}
            </tbody>
          </table>
        </aside>
        <aside>
          <header className="heading prose max-w-none border-t-0!">
            <h2>Recent Transfers</h2>
          </header>
          <table className="table table-fixed">
            <tbody>
              {transfers.slice(0, NUM_PREVIOUS).map((transfer) => {
                const latestOffer = transfer.offers[0];
                const isContractExpiry = transfer.status === Constants.TransferStatus.EXPIRED;
                const isFreeAgentTransfer =
                  transfer.status === Constants.TransferStatus.TEAM_ACCEPTED &&
                  (latestOffer?.cost || 0) === 0;
                const destinationTeam = isContractExpiry ? transfer.from : transfer.to;
                const isNoTeam =
                  isFreeAgentTransfer ||
                  !destinationTeam ||
                  destinationTeam.id == null ||
                  destinationTeam.name?.toLowerCase() === 'no team' ||
                  destinationTeam.blazon?.includes('noteam.svg');

                return (
                  <tr key={transfer.id + '__transfer'}>
                    <td className="p-0 text-center">
                      <button
                        type="button"
                        className="mr-2 inline-block"
                        title={`View ${transfer.target.name}`}
                        onClick={() => openPlayerTransferModal(transfer.target.id)}
                      >
                        <img
                          title={transfer.target.name}
                          className="inline-block size-12"
                          src={transfer.target.avatar || 'resources://avatars/empty.png'}
                        />
                      </button>
                      {isNoTeam ? (
                        <img
                          title="No Team"
                          className="inline-block size-12"
                          src="resources://blazonry/noteam.svg"
                        />
                      ) : (
                        <Link to={`/teams?teamId=${destinationTeam.id}`}>
                          <img
                            title={destinationTeam.name}
                            className="inline-block size-12"
                            src={destinationTeam.blazon}
                          />
                        </Link>
                      )}
                    </td>
                    <td className="text-center">&rarr;</td>
                    <td
                      title={isContractExpiry ? 'No Team' : transfer.from.name}
                      className="p-0 text-center"
                    >
                      {isContractExpiry ? (
                        <img
                          title="No Team"
                          className="inline-block size-12"
                          src="resources://blazonry/noteam.svg"
                        />
                      ) : (
                        <Link to={`/teams?teamId=${transfer.from.id}`}>
                          <img
                            title={transfer.from.name}
                            className="inline-block size-12"
                            src={transfer.from.blazon}
                          />
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
              {[...Array(Math.max(0, NUM_PREVIOUS - transfers.length))].map((_, idx) => (
                <tr key={`${idx}__filler_transfers`} className="text-muted">
                  <td className="text-center">-</td>
                  <td className="text-center">&rarr;</td>
                  <td className="text-center">-</td>
                </tr>
              ))}
            </tbody>
          </table>
        </aside>
      </article>
      <article>
        <header className="heading prose max-w-none border-t-0!">
          <h2>{t('shared.standings')}</h2>
        </header>
        <select
          disabled
          className={cx(
            'select border-base-content/10 w-full rounded-none border-0 border-b',
            'disabled:bg-base-200 disabled:text-opacity-100',
          )}
          value={
            group.length
              ? getTeamsTierLabel(competition.tier.slug, competition.tier.league?.name)
              : -1
          }
        >
          {!group.length && (
            <option disabled value={-1}>
              {t('shared.competitionNotStarted')}
            </option>
          )}
          {!!group.length && (
            <option
              disabled
              value={getTeamsTierLabel(competition.tier.slug, competition.tier.league?.name)}
            >
              {getTeamsTierLabel(competition.tier.slug, competition.tier.league?.name)}
            </option>
          )}
        </select>
        <Standings
          competitors={group}
          highlight={team.id}
          matches={standingMatches.length ? standingMatches : undefined}
          mode={
            Constants.TierSwissConfig[competition.tier.slug as Constants.TierSlug]
              ? 'swiss'
              : undefined
          }
          teamLink={(memberTeam) => `/teams?teamId=${memberTeam.id}`}
          zones={
            Util.shouldShowStandingsZones(competition.status) &&
            competition.tier.groupSize &&
            Util.getTierZonesByGroup(
              competition.tier.slug as Constants.TierSlug,
              competition.federation.slug as Constants.FederationSlug,
              new Set(competition.competitors.map((competitor) => competitor.group)).size,
              competition.tier.groupSize,
            )
          }
        />
      </article>
    </section>
  );
}
