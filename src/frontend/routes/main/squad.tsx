/**
 * Hub for managing the team squad.
 *
 * @module
 */
import React from 'react';
import { Constants, Eagers, Util } from '@liga/shared';
import { AppStateContext } from '@liga/frontend/redux';
import { useFormatAppShortDate, useTranslation } from '@liga/frontend/hooks';
import { Image, TeamBlazon } from '@liga/frontend/components';
import { useFormatAppDate } from '@liga/frontend/hooks/use-FormatAppDate';
import { groupBy } from 'lodash';
import { Link } from 'react-router-dom';
import {
  FaCalendarAlt,
  FaChartBar,
  FaChevronRight,
  FaClock,
  FaExchangeAlt,
  FaExternalLinkAlt,
  FaFrownOpen,
  FaGrinBeam,
  FaMap,
  FaMeh,
  FaSadTear,
  FaShieldAlt,
  FaSmileBeam,
  FaStar,
  FaTrophy,
  FaUserTie,
  FaWaveSquare,
} from 'react-icons/fa';
import ak47Icon from '@liga/frontend/assets/ak47.png';
import awpIcon from '@liga/frontend/assets/awp.png';
import {
  formatTransferDate,
  getCareerTransferEvents,
  TeamBadge,
  type RosterPlayer,
} from './teams/roster';

function getCoachAvatar(name: string) {
  return `resources://coaches/${name === 'T.c' ? 'tc' : name}.png`;
}

function useEmptyAvatar(event: React.SyntheticEvent<HTMLImageElement>) {
  event.currentTarget.onerror = null;
  event.currentTarget.src = 'resources://avatars/empty.png';
}

function MoraleIcon({
  morale,
  playerName,
}: {
  morale: 'Very Happy' | 'Happy' | 'Content' | 'Unhappy' | 'Very Unhappy';
  playerName: string;
}) {
  const Icon =
    morale === 'Very Happy'
      ? FaGrinBeam
      : morale === 'Happy'
        ? FaSmileBeam
        : morale === 'Content'
          ? FaMeh
          : morale === 'Unhappy'
            ? FaFrownOpen
            : FaSadTear;
  const className = `is-${morale.toLowerCase().replace(/ /g, '-')}`;
  return (
    <span
      className={`squad-player-morale ${className}`}
      title={`Morale: ${morale}`}
      aria-label={`${playerName} morale: ${morale}`}
    >
      <Icon aria-hidden="true" />
    </span>
  );
}

const SquadPlayerQuery = {
  include: {
    country: {
      include: {
        continent: true,
      },
    },
    team: true,
  },
} as const;

function getPlayerRatingFromEvents(playerId: number, events: Array<{ [key: string]: any }>) {
  const killOrAssistEvents = events.filter((event) => !!event.attackerId || !!event.assistId);
  const kills = killOrAssistEvents.filter((event) => event.attackerId === playerId).length;
  const assists = killOrAssistEvents.filter((event) => event.assistId === playerId).length;
  const deaths = killOrAssistEvents.filter(
    (event) => event.victimId === playerId && !event.assistId,
  ).length;

  return Util.getPlayerRating(kills, deaths, assists);
}

function getSquadEventName(competition: any) {
  const tierSlug = competition.tier.slug as Constants.TierSlug;
  const year = competition.season ? 2025 + competition.season : null;
  const city = Util.getCompetitionHostingLocationCity(competition.location);

  if (Util.isMajorStageTier(tierSlug)) {
    return [Util.getMajorEventDisplayName(competition.location, competition.organizer), year]
      .filter(Boolean)
      .join(' ');
  }
  if (tierSlug === Constants.TierSlug.BLAST_FINALS) {
    return ['BLAST Finals', city, year].filter(Boolean).join(' ');
  }
  if (
    [
      Constants.TierSlug.IEM_COLOGNE_GROUP_A,
      Constants.TierSlug.IEM_COLOGNE_GROUP_B,
      Constants.TierSlug.IEM_COLOGNE_PLAYOFFS,
    ].includes(tierSlug)
  ) {
    return ['IEM Cologne', year].filter(Boolean).join(' ');
  }
  if (
    [
      Constants.TierSlug.IEM_KRAKOW_GROUP_A,
      Constants.TierSlug.IEM_KRAKOW_GROUP_B,
      Constants.TierSlug.IEM_KRAKOW_PLAYOFFS,
    ].includes(tierSlug)
  ) {
    return ['IEM Krakow', year].filter(Boolean).join(' ');
  }
  if ([Constants.TierSlug.LEAGUE_PRO, Constants.TierSlug.LEAGUE_PRO_PLAYOFFS].includes(tierSlug)) {
    return ['ESL Pro League', city, year].filter(Boolean).join(' ');
  }

  const hostedName = Util.getHostedEventDisplayName(tierSlug, competition.location, '');
  const displayName =
    hostedName || Util.getCompetitionDisplayName(competition.tier.league.name, tierSlug);
  return [displayName, year].filter(Boolean).join(' ');
}

function getSquadEventIcon(competition: any) {
  return (
    Util.getCompetitionThumbnail({
      federationSlug: competition.federation.slug,
      organizer: competition.organizer,
      tierSlug: competition.tier.slug,
    }) ||
    Util.getCompetitionLogo(competition.tier.slug, competition.federation.slug, {
      location: competition.location,
      organizer: competition.organizer,
    })
  );
}

/**
 * Exports this module.
 *
 * @exports
 */
export default function () {
  const t = useTranslation('windows');
  const { state } = React.useContext(AppStateContext);
  const [squad, setSquad] = React.useState<
    Awaited<ReturnType<typeof api.squad.all<typeof SquadPlayerQuery>>>
  >([]);
  const [squadRatings, setSquadRatings] = React.useState<
    Record<number, { maps: number; rating: number }>
  >({});
  const [completedMatches, setCompletedMatches] = React.useState<
    Awaited<ReturnType<typeof api.matches.all<typeof Eagers.matchEvents>>>
  >([]);
  const [worldRanking, setWorldRanking] = React.useState(0);
  const [recentMatches, setRecentMatches] = React.useState<
    Awaited<ReturnType<typeof api.matches.previous<typeof Eagers.match>>>
  >([]);
  const [transferHistoryPlayers, setTransferHistoryPlayers] = React.useState<RosterPlayer[]>([]);
  const [teammateMorale, setTeammateMorale] = React.useState<
    Awaited<ReturnType<typeof api.teammateMorale.all>>
  >([]);
  const fmtDate = useFormatAppDate();
  const fmtShortDate = useFormatAppShortDate();

  // fetch data on first load
  React.useEffect(() => {
    // Skip all team related fetches if player is teamless
    if (!state.profile?.team) return;

    const isActiveTrialTeam =
      state.profile.trialTeamId === state.profile.team.id && state.profile.playerId != null;
    api.players
      .all<typeof SquadPlayerQuery>({
        ...SquadPlayerQuery,
        where: isActiveTrialTeam
          ? { OR: [{ teamId: state.profile.team.id }, { id: state.profile.playerId }] }
          : { teamId: state.profile.team.id },
      })
      .then(setSquad);
    api.team.worldRanking(state.profile.team.id).then(setWorldRanking);
    api.matches.previous(Eagers.match, state.profile.team.id, 12).then(setRecentMatches);
    api.players
      .all({
        include: {
          careerStints: { include: { team: true } },
          country: true,
          team: true,
        },
        where: { careerStints: { some: { teamId: state.profile.team.id } } },
      })
      .then((players) => setTransferHistoryPlayers(players as RosterPlayer[]));
    if (!state.profile.trialTeamId) {
      api.teammateMorale.all().then(setTeammateMorale);
    } else {
      setTeammateMorale([]);
    }
  }, [state.profile?.playerId, state.profile?.team, state.profile?.trialTeamId]);

  React.useEffect(() => {
    setSquadRatings({});
    setCompletedMatches([]);

    if (!state.profile?.teamId || !squad.length) {
      return;
    }

    api.matches
      .all<typeof Eagers.matchEvents>({
        ...Eagers.matchEvents,
        where: {
          status: Constants.MatchStatus.COMPLETED,
          competitionId: { not: null as null },
          matchType: { not: 'FACEIT_PUG' },
          competitors: {
            some: {
              teamId: state.profile.teamId,
            },
          },
          events: {
            some: {},
          },
        },
      })
      .then((matches) => {
        setCompletedMatches(matches);
        const rows: Record<number, { maps: number; ratingSum: number }> = {};

        squad.forEach((player: any) => {
          matches.forEach((match) => {
            Object.values(groupBy(match.events, 'gameId')).forEach((gameEvents) => {
              const hasPlayerEvent = gameEvents.some(
                (event) =>
                  event.attackerId === player.id ||
                  event.assistId === player.id ||
                  event.victimId === player.id,
              );

              if (!hasPlayerEvent) {
                return;
              }

              const rating = getPlayerRatingFromEvents(player.id, gameEvents);

              if (!Number.isFinite(rating)) {
                return;
              }

              if (!rows[player.id]) {
                rows[player.id] = { maps: 0, ratingSum: 0 };
              }

              rows[player.id].maps += 1;
              rows[player.id].ratingSum += rating;
            });
          });
        });

        setSquadRatings(
          Object.fromEntries(
            Object.entries(rows).map(([playerId, row]) => [
              Number(playerId),
              {
                maps: row.maps,
                rating: row.maps ? row.ratingSum / row.maps : 0,
              },
            ]),
          ),
        );
      });
  }, [squad, state.profile?.teamId]);

  const starters = React.useMemo(() => squad.filter((player) => player.starter), [squad]);
  const transferListed = React.useMemo(() => {
    const isActiveTrial =
      state.profile?.trialTeamId === state.profile?.teamId && state.profile?.playerId != null;

    return squad.filter(
      (player) =>
        player.transferListed ||
        (isActiveTrial && player.id === state.profile?.trialReplacedPlayerId),
    );
  }, [
    squad,
    state.profile?.playerId,
    state.profile?.teamId,
    state.profile?.trialReplacedPlayerId,
    state.profile?.trialTeamId,
  ]);
  const coach = React.useMemo(
    () =>
      state.profile?.team?.personas.find((persona) => persona.role === 'Manager') ??
      state.profile?.team?.personas.find((persona) => persona.role === 'Assistant Manager') ??
      state.profile?.team?.personas[0],
    [state.profile?.team?.personas],
  );
  const teamCountry = React.useMemo(
    () =>
      state.profile?.team
        ? Util.getTeamDisplayCountry({
            ...state.profile.team,
            players: squad,
          })
        : Util.OTHER_TEAM_COUNTRY,
    [squad, state.profile?.team],
  );

  const startingFive = React.useMemo(() => {
    const userId = state.profile?.player?.id;
    const user = squad.find((player) => player.id === userId && !player.transferListed);
    const startingTeammates = starters.filter(
      (player) => player.id !== userId && !player.transferListed,
    );

    return user ? [user, ...startingTeammates].slice(0, 5) : startingTeammates.slice(0, 5);
  }, [squad, starters, state.profile?.player?.id]);
  const playedMatches = React.useMemo(
    () =>
      recentMatches
        .filter((match) =>
          match.competitors.some(
            (competitor) =>
              competitor.teamId != null && competitor.teamId !== state.profile?.teamId,
          ),
        )
        .slice(0, 5),
    [recentMatches, state.profile?.teamId],
  );
  const lineupStartedAt = React.useMemo(() => {
    if (!state.profile?.teamId || !startingFive.length) return null;

    const currentPlayerIds = new Set(startingFive.map((player) => player.id));
    const starts = transferHistoryPlayers
      .filter((player) => currentPlayerIds.has(player.id))
      .map(
        (player) =>
          player.careerStints
            .filter((stint) => stint.teamId === state.profile?.teamId && stint.endedAt == null)
            .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())[0],
      )
      .filter(Boolean)
      .map((stint) => new Date(stint.startedAt).getTime());

    return starts.length ? Math.max(...starts) : null;
  }, [startingFive, state.profile?.teamId, transferHistoryPlayers]);
  const squadPerformance = React.useMemo(() => {
    const currentPlayerIds = new Set(startingFive.map((player) => player.id));
    const lineupMatches = completedMatches
      .filter(
        (match) =>
          (!lineupStartedAt || new Date(match.date).getTime() >= lineupStartedAt) &&
          startingFive.every((player) =>
            match.events.some(
              (event) =>
                event.attackerId === player.id ||
                event.assistId === player.id ||
                event.victimId === player.id,
            ),
          ),
      )
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const results = lineupMatches
      .map(
        (match) =>
          match.competitors.find((entry) => entry.teamId === state.profile?.teamId)?.result,
      )
      .filter((result): result is Constants.MatchResult => result != null);
    const wins = results.filter((result) => result === Constants.MatchResult.WIN).length;
    const losses = results.filter((result) => result === Constants.MatchResult.LOSS).length;
    const mapRatings: number[] = [];
    const mapIds = new Set<number>();

    lineupMatches.forEach((match) => {
      Object.entries(groupBy(match.events, 'gameId')).forEach(([gameId, gameEvents]) => {
        const numericGameId = Number(gameId);
        if (Number.isFinite(numericGameId)) mapIds.add(numericGameId);

        startingFive.forEach((player) => {
          if (!currentPlayerIds.has(player.id)) return;
          const hasPlayerEvent = gameEvents.some(
            (event) =>
              event.attackerId === player.id ||
              event.assistId === player.id ||
              event.victimId === player.id,
          );
          if (!hasPlayerEvent) return;
          const rating = getPlayerRatingFromEvents(player.id, gameEvents);
          if (Number.isFinite(rating)) mapRatings.push(rating);
        });
      });
    });

    return {
      form: results.slice(0, 5),
      losses,
      maps: mapIds.size,
      rating: mapRatings.length
        ? mapRatings.reduce((total, rating) => total + rating, 0) / mapRatings.length
        : 0,
      winRate: results.length ? Math.round((wins / results.length) * 100) : 0,
      wins,
    };
  }, [completedMatches, lineupStartedAt, startingFive, state.profile?.teamId]);
  const displayedMatches = React.useMemo(() => playedMatches.slice(0, 3), [playedMatches]);
  const transferHistory = React.useMemo(() => {
    if (!state.profile?.team) return [];
    return getCareerTransferEvents(transferHistoryPlayers, state.profile.team)
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .slice(0, 5);
  }, [state.profile?.team, transferHistoryPlayers]);
  const openPlayerHistory = React.useCallback((playerId: number) => {
    api.window.send<ModalRequest>(Constants.WindowIdentifier.Modal, {
      target: '/transfer',
      payload: playerId,
    });
  }, []);

  // Teamless Player Career view
  if (!state.profile?.team) {
    const player = state.profile?.player;

    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-8 text-center">
        {/* Teamless blazonry */}
        <div className="relative">
          <Image
            src="resources://blazonry/noteam.svg"
            className="border-base-300 bg-base-100 h-40 w-40 rounded-full border-4 object-contain p-4 shadow-md"
          />
        </div>
        {/* Player info card */}
        <article className="card bg-base-200/40 w-80 rounded-2xl p-6 text-center shadow-md">
          <h2 className="mb-2 text-2xl font-semibold">{player?.name || 'Unnamed Player'}</h2>
          <p className="text-primary text-sm font-medium tracking-wide uppercase">
            {player?.role || 'Unassigned Role'}
          </p>
          <p className="text-muted mb-3 text-base">{player?.country?.name || 'Unknown Country'}</p>

          <div className="divider my-3 before:h-px after:h-px" />

          <p className="text-warning font-semibold">You are currently teamless</p>
          <p className="text-muted mt-1 text-sm">Compete on FACEIT or await offers from teams.</p>
        </article>
      </div>
    );
  }

  const renderRosterPanel = (
    title: string,
    players: typeof squad,
    icon: React.ReactNode,
    emptyMessage: string,
  ) => (
    <section className="squad-roster-panel">
      <header>
        <span className="squad-roster-icon">{icon}</span>
        <h2>{title}</h2>
        <span className="squad-roster-count">
          {players.length} {players.length === 1 ? 'player' : 'players'}
        </span>
      </header>
      <div className="squad-roster-labels">
        <span>Player</span>
        <span>Contracted until</span>
      </div>
      {players.length ? (
        <div className="squad-roster-list">
          {players.map((player) => (
            <button
              type="button"
              className="squad-roster-row"
              key={`${player.id}-${title}`}
              onClick={() => openPlayerHistory(player.id)}
            >
              <span className={`fp ${player.country.code.toLowerCase()}`} />
              <strong title={player.name}>{player.name}</strong>
              <span className={player.starter ? 'squad-status-active' : 'squad-status-listed'} />
              <time>{fmtDate(player.contractEnd as unknown as number)}</time>
              <FaChevronRight aria-hidden="true" />
            </button>
          ))}
        </div>
      ) : (
        <p className="squad-roster-empty">{emptyMessage}</p>
      )}
    </section>
  );

  return (
    <div className="squad-hub">
      <aside className="squad-rosters">
        <section className="squad-team-card">
          <div className="squad-team-identity">
            <Link to={`/teams?teamId=${state.profile.team.id}`} title="Open team">
              <TeamBlazon
                src={state.profile.team.blazon || 'resources://blazonry/noteam.svg'}
                className="squad-team-blazon"
                alt=""
              />
            </Link>
            <div>
              <div className="squad-team-name-row">
                <h2>{state.profile.team.name}</h2>
                <Link
                  to={`/teams?teamId=${state.profile.team.id}`}
                  className="squad-team-link"
                  aria-label={`Open ${state.profile.team.name} in Teams`}
                  title="Open team"
                >
                  <FaChevronRight aria-hidden="true" />
                </Link>
              </div>
              <p>
                <span className={`fp ${teamCountry.code.toLowerCase()}`} />
                <span>{teamCountry.name}</span>
              </p>
            </div>
          </div>
          <footer>
            <span>World Ranking</span>
            <strong>#{worldRanking || '—'}</strong>
          </footer>
        </section>
        {coach ? (
          <article className="squad-coach-card">
            <div className="squad-coach-portrait">
              <img
                className="squad-coach-crest"
                src={state.profile.team.blazon || 'resources://blazonry/noteam.svg'}
                alt=""
                aria-hidden="true"
              />
              <img
                className="squad-coach-person"
                src={getCoachAvatar(coach.name)}
                alt={coach.name}
                onError={useEmptyAvatar}
              />
            </div>
            <div className="squad-coach-details">
              <span className="squad-coach-label">
                <FaUserTie /> Head coach
              </span>
              <h2>{coach.name}</h2>
              <p>{state.profile.team.name}</p>
            </div>
          </article>
        ) : (
          <article className="squad-coach-card squad-coach-empty">
            <FaUserTie />
            <div>
              <span className="squad-coach-label">Head coach</span>
              <h2>No coach assigned</h2>
            </div>
          </article>
        )}
        {renderRosterPanel(
          t('shared.transferListed'),
          transferListed,
          <FaExchangeAlt />,
          t('main.squad.noTransferListed'),
        )}
      </aside>

      <main className="squad-overview">
        <header className="squad-overview-header">
          <div>
            <h1>Squad Overview</h1>
            <p>Your active squad, player form and key info at a glance.</p>
          </div>
          <div className="squad-overview-summary">
            <FaShieldAlt aria-hidden="true" />
            <span>
              <small>Active roster</small>
              <strong>{startingFive.length} players</strong>
            </span>
          </div>
        </header>

        <div className="squad-player-grid">
          {startingFive.map((player) => {
            const role = String(player.role).toLowerCase();
            const isSniper = role === 'awper' || role === 'sniper';
            const isIgl = role === String(Constants.UserRole.IGL).toLowerCase();
            const rating = squadRatings[player.id];
            const isTrialPlayer =
              state.profile?.trialTeamId === state.profile?.teamId &&
              player.id === state.profile?.playerId;
            const morale = teammateMorale.find((item) => item.playerId === player.id);

            return (
              <article
                className="squad-player-card"
                key={`${player.id}__squad`}
                onClick={() => openPlayerHistory(player.id)}
              >
                <button
                  type="button"
                  className="squad-player-history-link"
                  title="View team history"
                  aria-label={`View ${player.name} team history`}
                  onClick={(event) => {
                    event.stopPropagation();
                    openPlayerHistory(player.id);
                  }}
                >
                  <FaExternalLinkAlt aria-hidden="true" />
                </button>
                <header>
                  <figure>
                    {isTrialPlayer && <span className="squad-player-trial-badge">Trial</span>}
                    {morale && <MoraleIcon morale={morale.morale} playerName={player.name} />}
                    <img src={player.avatar || 'resources://avatars/empty.png'} alt={player.name} />
                  </figure>
                  <div className="squad-player-identity">
                    <div className="squad-player-name-row">
                      <h2>{player.name}</h2>
                    </div>
                    <p>
                      <span className={`fp ${player.country.code.toLowerCase()}`} />
                      <span>{player.country.name}</span>
                    </p>
                  </div>
                </header>
                <div className="squad-player-role">
                  <span>
                    <small>Role</small>
                    <strong className={isSniper ? 'is-sniper' : isIgl ? 'is-igl' : ''}>
                      {isSniper ? 'AWPer' : isIgl ? 'IGL' : 'Rifler'}
                    </strong>
                  </span>
                  <img src={isSniper ? awpIcon : ak47Icon} alt="" aria-hidden="true" />
                </div>
                <footer>
                  <div>
                    <small>Rating</small>
                    <strong>{rating ? rating.rating.toFixed(2) : '—'}</strong>
                  </div>
                  <div>
                    <small>Maps played</small>
                    <strong>{rating ? rating.maps : 0} maps</strong>
                  </div>
                </footer>
                <div className="squad-player-contract">
                  <small>{isTrialPlayer ? 'Trial progress' : 'Contracted until'}</small>
                  <strong>
                    <FaCalendarAlt aria-hidden="true" />
                    {isTrialPlayer
                      ? `${state.profile?.trialSeriesPlayed ?? 0} / ${state.profile?.trialSeriesTarget ?? '—'} matches`
                      : player.contractEnd
                        ? fmtDate(player.contractEnd as unknown as number)
                        : 'No contract'}
                  </strong>
                </div>
              </article>
            );
          })}
        </div>

        <section className="squad-lower-grid">
          <div className="squad-performance-column">
            <section className="squad-data-panel squad-performance">
              <header className="squad-panel-header">
                <h2>
                  <FaChartBar /> Squad Performance
                </h2>
                <span>Current lineup</span>
              </header>
              <div className="squad-performance-metrics">
                <article>
                  <FaStar />
                  <span>
                    <small>Team Rating</small>
                    <strong>
                      {squadPerformance.rating ? squadPerformance.rating.toFixed(2) : '—'}
                    </strong>
                  </span>
                </article>
                <article>
                  <FaTrophy />
                  <span>
                    <small>Win Rate</small>
                    <strong>{squadPerformance.winRate}%</strong>
                    <em>
                      {squadPerformance.wins}W / {squadPerformance.losses}L
                    </em>
                  </span>
                </article>
                <article>
                  <FaMap />
                  <span>
                    <small>Maps Played</small>
                    <strong>{squadPerformance.maps}</strong>
                  </span>
                </article>
                <article>
                  <FaWaveSquare />
                  <span>
                    <small>Current Form</small>
                    <span className="squad-form-row">
                      {squadPerformance.form.map((result, index) => (
                        <b
                          className={
                            result === Constants.MatchResult.WIN
                              ? 'is-win'
                              : result === Constants.MatchResult.DRAW
                                ? 'is-draw'
                                : 'is-loss'
                          }
                          key={`${result}-${index}`}
                        >
                          {result === Constants.MatchResult.WIN
                            ? 'W'
                            : result === Constants.MatchResult.DRAW
                              ? 'D'
                              : 'L'}
                        </b>
                      ))}
                      {!squadPerformance.form.length && <em>No matches</em>}
                    </span>
                  </span>
                </article>
              </div>
            </section>

            <section className="squad-data-panel squad-recent-matches">
              <header className="squad-panel-header">
                <h2>
                  <FaClock /> Recent Matches
                </h2>
                <Link to={`/teams/matches?teamId=${state.profile.team.id}`}>
                  View all matches <FaChevronRight />
                </Link>
              </header>
              <div className="squad-match-labels">
                <span>Date</span>
                <span>Match</span>
                <span>Event</span>
                <span />
              </div>
              {displayedMatches.map((match) => {
                const own = match.competitors.find(
                  (entry) => entry.teamId === state.profile?.teamId,
                );
                const opponent = match.competitors.find(
                  (entry) => entry.teamId !== state.profile?.teamId,
                );
                const eventName = getSquadEventName(match.competition);
                const eventIcon = getSquadEventIcon(match.competition);
                const competitionLink = `/competitions?federationId=${match.competition.federationId}&season=${match.competition.season}&tierId=${match.competition.tier.id}`;
                const onClick = match._count.events
                  ? () =>
                      api.window.send<ModalRequest>(Constants.WindowIdentifier.Modal, {
                        target: '/postgame',
                        payload: match.id,
                      })
                  : undefined;

                return (
                  <article className="squad-match-row" key={match.id} onClick={onClick}>
                    <time>{fmtShortDate(match.date)}</time>
                    <div className="squad-match-versus">
                      <Link
                        to={`/teams?teamId=${state.profile.team.id}`}
                        onClick={(event) => event.stopPropagation()}
                      >
                        {state.profile.team.name}
                      </Link>
                      <Link
                        to={`/teams?teamId=${state.profile.team.id}`}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <TeamBlazon src={state.profile.team.blazon} />
                      </Link>
                      <strong className={Util.getResultTextColor(own?.result)}>
                        {own?.score ?? '-'} : {opponent?.score ?? '-'}
                      </strong>
                      <Link
                        to={`/teams?teamId=${opponent?.team.id}`}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <TeamBlazon src={opponent?.team.blazon} />
                      </Link>
                      <Link
                        to={`/teams?teamId=${opponent?.team.id}`}
                        onClick={(event) => event.stopPropagation()}
                      >
                        {opponent?.team.name}
                      </Link>
                    </div>
                    <Link
                      to={competitionLink}
                      className="squad-match-event"
                      title={eventName}
                      onClick={(event) => event.stopPropagation()}
                    >
                      {eventIcon && <img src={eventIcon} alt="" />}
                      <span>{eventName}</span>
                    </Link>
                    <button type="button" disabled={!onClick}>
                      Match
                    </button>
                  </article>
                );
              })}
              {!displayedMatches.length && <p className="squad-panel-empty">No recent matches.</p>}
            </section>
          </div>

          <section className="squad-data-panel squad-transfers">
            <header className="squad-panel-header">
              <h2>
                <FaExchangeAlt /> Transfers for {state.profile.team.name}
              </h2>
              <Link to={`/teams/roster?teamId=${state.profile.team.id}`}>
                View all transfers <FaChevronRight />
              </Link>
            </header>
            <ul>
              {transferHistory.map((item) => (
                <li key={item.id} onClick={() => openPlayerHistory(item.player.id)}>
                  <button
                    type="button"
                    className="squad-transfer-player"
                    title={`View ${item.player.name} team history`}
                    onClick={(event) => {
                      event.stopPropagation();
                      openPlayerHistory(item.player.id);
                    }}
                  >
                    <img src={item.player.avatar || 'resources://avatars/empty.png'} alt="" />
                  </button>
                  {item.from?.id ? (
                    <Link
                      to={`/teams?teamId=${item.from.id}`}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <TeamBadge
                        team={item.from}
                        benched={item.fromBenched}
                        trial={item.fromTrial}
                      />
                    </Link>
                  ) : (
                    <TeamBadge team={item.from} benched={item.fromBenched} trial={item.fromTrial} />
                  )}
                  <span className="squad-transfer-arrow">→</span>
                  {item.to?.id ? (
                    <Link
                      to={`/teams?teamId=${item.to.id}`}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <TeamBadge team={item.to} benched={item.toBenched} trial={item.toTrial} />
                    </Link>
                  ) : (
                    <TeamBadge team={item.to} benched={item.toBenched} trial={item.toTrial} />
                  )}
                  <p>{item.text}</p>
                  <time>{formatTransferDate(item.date)}</time>
                </li>
              ))}
              {!transferHistory.length && (
                <li className="squad-panel-empty">No recent transfers.</li>
              )}
            </ul>
          </section>
        </section>
      </main>
    </div>
  );
}
