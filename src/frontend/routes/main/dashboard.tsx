/**
 * The main browser window dashboard.
 *
 * @module
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { addDays, differenceInDays, format } from 'date-fns';
import { Constants, Eagers, Util } from '@liga/shared';
import { cx, isFreeAgentTransfer } from '@liga/frontend/lib';
import {
  describeTransferEvent,
  loadTransferEvents,
  type TransferEvent,
} from '@liga/frontend/lib/transfer-events';
import { AppStateContext } from '@liga/frontend/redux';
import { calendarAdvance, playErrorUpdate } from '@liga/frontend/redux/actions';
import type { PlayingStatus } from '@liga/frontend/redux/state';
import { useAudio, useFormatAppShortDate, useTranslation } from '@liga/frontend/hooks';
import { Standings, Image, Historial } from '@liga/frontend/components';
import faceitLevel1 from '../../assets/faceit/levels_large/1.png';
import faceitLevel2 from '../../assets/faceit/levels_large/2.png';
import faceitLevel3 from '../../assets/faceit/levels_large/3.png';
import faceitLevel4 from '../../assets/faceit/levels_large/4.png';
import faceitLevel5 from '../../assets/faceit/levels_large/5.png';
import faceitLevel6 from '../../assets/faceit/levels_large/6.png';
import faceitLevel7 from '../../assets/faceit/levels_large/7.png';
import faceitLevel8 from '../../assets/faceit/levels_large/8.png';
import faceitLevel9 from '../../assets/faceit/levels_large/9.png';
import faceitLevel10 from '../../assets/faceit/levels_large/10.png';
import faceitUnranked from '../../assets/faceit/levels_large/unranked_large.png';
import faceitLogo from '../../assets/faceit/icon.png';
import faceitDashboardBackground from '../../assets/faceit/background.png';
import { getTeamsRoundLabel, getTeamsTierLabel } from './teams/labels';
import { getStatisticsEventTitle } from './stats';
import {
  FaArrowRight,
  FaBullseye,
  FaCalendarDay,
  FaChartBar,
  FaCheckCircle,
  FaClock,
  FaClipboardCheck,
  FaCloudMoon,
  FaExchangeAlt,
  FaExclamationTriangle,
  FaForward,
  FaInfoCircle,
  FaMapSigns,
  FaNewspaper,
  FaSpinner,
  FaStop,
  FaStopwatch,
  FaStream,
  FaUser,
} from 'react-icons/fa';

/** @interface */
interface StatusBannerProps {
  error: string;
}

/** @constant */
const NUM_UPCOMING = 6 + 1; // adds an extra for "next match"

/** @constant */
const NUM_PREVIOUS = 5;

const FACEIT_LEVEL_IMAGES: Record<number, string> = {
  1: faceitLevel1,
  2: faceitLevel2,
  3: faceitLevel3,
  4: faceitLevel4,
  5: faceitLevel5,
  6: faceitLevel6,
  7: faceitLevel7,
  8: faceitLevel8,
  9: faceitLevel9,
  10: faceitLevel10,
};

type DashboardNewsItem = Awaited<ReturnType<typeof api.news.all>>[number];
type DashboardFaceitProfile = Awaited<ReturnType<typeof api.faceit.profile>>;
type DashboardVetoEntry = Awaited<ReturnType<typeof api.match.findVetoList>>[number];

function getDecidedVetoMaps(vetoes: Array<DashboardVetoEntry>) {
  return vetoes.filter((entry) =>
    [Constants.MapVetoAction.PICK, Constants.MapVetoAction.DECIDER].includes(
      entry.type as Constants.MapVetoAction,
    ),
  );
}

function DashboardMapBackground({
  maps,
  game,
  className,
}: {
  maps: Array<string>;
  game: Constants.Game;
  className?: string;
}) {
  if (!maps.length) {
    return (
      <Image className={className} src="resources://maps/allmaps.png" alt="" aria-hidden="true" />
    );
  }

  return (
    <div className={cx(className, 'team-dashboard-veto-map-background')} aria-hidden="true">
      {maps.map((map, index) => (
        <Image
          key={`${index}__${map}`}
          src={Util.convertMapPool(map, game, true)}
          alt=""
          style={{ width: `${100 / maps.length}%` }}
        />
      ))}
    </div>
  );
}

function DashboardRequirement({
  complete,
  loaded,
  storageKey,
  children,
}: {
  complete: boolean;
  loaded: boolean;
  storageKey: string;
  children: React.ReactNode;
}) {
  const [dismissed, setDismissed] = React.useState(
    () => localStorage.getItem(storageKey) === 'done',
  );
  React.useEffect(() => {
    if (!loaded) return;
    if (!complete) {
      localStorage.removeItem(storageKey);
      setDismissed(false);
    }
  }, [complete, loaded, storageKey]);
  if (!loaded) return null;
  if (complete && dismissed) return null;
  return (
    <article
      className={cx(complete && 'is-complete requirement-completing')}
      onAnimationEnd={(event) => {
        if (event.target !== event.currentTarget || event.animationName !== 'requirement-dismiss')
          return;
        localStorage.setItem(storageKey, 'done');
        setDismissed(true);
      }}
    >
      {children}
    </article>
  );
}

function getDashboardNewsDisplay(item: DashboardNewsItem) {
  let payload: Record<string, unknown> = {};

  try {
    const parsed = item.payload ? (JSON.parse(item.payload) as unknown) : null;
    payload =
      parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
  } catch (_) {
    // A malformed story still displays its headline.
  }

  return {
    flagCode: typeof payload.flagCode === 'string' ? payload.flagCode.toLowerCase() : null,
    image:
      item.image ||
      (typeof payload.promotedMap === 'string'
        ? `resources://maps/${payload.promotedMap}.png`
        : null),
    golden:
      payload.goldenTransfer === true ||
      (Array.isArray(payload.mapUsage) && payload.mapUsage.length > 0) ||
      (Array.isArray(payload.ranking) && payload.ranking.length > 0),
    graphic:
      payload.welcomeGraphic && typeof payload.welcomeGraphic === 'object'
        ? (payload.welcomeGraphic as Record<string, unknown>)
        : null,
  };
}

const PLAYING_STATUS_STEPS: Array<PlayingStatus> = [
  'PREPARING_MATCH',
  'COPYING_FILES',
  'STARTING_SERVER',
  'CONNECTING_SERVER',
  'WAITING_FOR_SERVER',
  'STARTING_CLIENT',
  'WATCHING_MATCH',
  'SAVING_RESULTS',
];

/**
 * Application status error banner.
 *
 * @param props The root props.
 * @function
 */
export function StatusBanner(props: StatusBannerProps) {
  const t = useTranslation('windows');

  const error = React.useMemo(
    () => (props.error ? (JSON.parse(props.error) as NodeJS.ErrnoException) : null),
    [props.error],
  );

  // figure out which game is not installed
  const message = React.useMemo(() => {
    if (
      !error ||
      (error.code !== Constants.ErrorCode.ENOENT && error.code !== Constants.ErrorCode.ERUNNING)
    ) {
      return;
    }

    const [, match] = error.path?.match(/((?:csgo|cstrike|cs2|hl|steam)\.exe)/) || [];
    return match;
  }, [error]);

  const showSteamMissing =
    error?.code === Constants.ErrorCode.ENOENT && message === Constants.GameSettings.STEAM_EXE;
  const showRunningError = error?.code === Constants.ErrorCode.ERUNNING;
  const showPluginsError = !!error?.path?.includes('plugins');

  if (!showSteamMissing && !showRunningError && !showPluginsError) {
    return null;
  }

  return (
    <section className="alert alert-warning flex h-8 justify-center rounded-none p-0">
      <FaExclamationTriangle />
      {showSteamMissing && (
        <p>
          {message} {t('main.dashboard.gameNotDetected')}
        </p>
      )}

      {showRunningError && (
        <p>
          {message} {t('main.dashboard.runningError')}
        </p>
      )}

      {showPluginsError && <p>{t('main.dashboard.pluginsError')}</p>}
    </section>
  );
}

/**
 * Exports this module.
 *
 * @exports
 */
export default function () {
  const t = useTranslation('windows');
  const fmtShortDate = useFormatAppShortDate();
  const { state, dispatch } = React.useContext(AppStateContext);
  const audioNegativeAlert = useAudio('negative-alert.wav');
  const audioClick = useAudio('button-click-inapp.wav');
  const isBenched = React.useMemo(
    () => state.profile?.player?.transferListed === true,
    [state.profile],
  );
  const isFaceitMatchroomLocked = !!state.faceitMatchRoom && !state.faceitMatchCompleted;
  const [settings, setSettings] = React.useState(Constants.Settings);
  const [upcoming, setUpcoming] = React.useState<
    Awaited<ReturnType<typeof api.matches.upcoming<typeof Eagers.match>>>
  >([]);
  const [matchHistorial, setMatchHistorial] = React.useState<Array<typeof upcoming>>([[], []]);
  const [previous, setPrevious] = React.useState<typeof upcoming>([]);
  const [worldRankings, setWorldRankings] = React.useState<Array<number>>([]);
  const [spotlightVetoes, setSpotlightVetoes] = React.useState<Array<DashboardVetoEntry>>([]);
  const [transfers, setTransfers] = React.useState<
    Awaited<ReturnType<typeof api.transfers.all<typeof Eagers.transfer>>>
  >([]);
  const [recentTransferEvents, setRecentTransferEvents] = React.useState<TransferEvent[]>([]);
  const [newsItems, setNewsItems] = React.useState<Awaited<ReturnType<typeof api.news.all>>>([]);
  const [dashboardFaceit, setDashboardFaceit] = React.useState<DashboardFaceitProfile | null>(null);
  const dashboardNewsItems = React.useMemo(() => {
    // Fill the rail with its first five stories, then let only Top Stories replace them.
    const oldestFirst = [...newsItems].reverse();
    const candidates = oldestFirst
      .filter((item, index) => index < 5 || item.type === 'ARTICLE')
      .slice(-5)
      .reverse();
    const featured = candidates.find((item) => {
      const { golden, graphic } = getDashboardNewsDisplay(item);
      return golden && typeof graphic?.template === 'string';
    });
    if (!featured) return candidates;
    const selected = candidates.slice(0, 4);
    if (!selected.some((item) => item.id === featured.id)) selected[3] = featured;
    return selected;
  }, [newsItems]);
  const featuredNewsId = dashboardNewsItems.find((item) => {
    const { golden, graphic } = getDashboardNewsDisplay(item);
    return golden && typeof graphic?.template === 'string';
  })?.id;
  const [standingMatches, setStandingMatches] = React.useState<
    Awaited<ReturnType<typeof api.matches.all<typeof Eagers.match>>>
  >([]);

  const [dismissedNoTeamAdvanceWarning, setDismissedNoTeamAdvanceWarning] = React.useState(false);
  const [noTeamAdvanceWarningVisible, setNoTeamAdvanceWarningVisible] = React.useState(false);
  const [activeFaceitMatch, setActiveFaceitMatch] = React.useState<{
    id: number;
    status: number;
  } | null>(null);
  const [activeFaceitMatchChecked, setActiveFaceitMatchChecked] = React.useState(false);
  const soundedPlayErrorAt = React.useRef(0);

  const toDashboardTeamTierLabel = (
    tierSlug: Constants.TierSlug | string,
    leagueName?: string | null,
  ): string => getTeamsTierLabel(tierSlug, leagueName ?? undefined);

  const toDashboardMatchCompetitionLabel = (match: (typeof upcoming)[number]): string => {
    const tier = match.competition.tier;
    const tierLabel = toDashboardTeamTierLabel(tier.slug, tier.league.name);
    const suffix = tier.groupSize === null ? ` ${getTeamsRoundLabel(match)}` : '';

    return `${tierLabel}${suffix}`;
  };

  const toDashboardTournamentLabel = (match: (typeof upcoming)[number]): string =>
    getStatisticsEventTitle(match.competition);

  const toDashboardRoundLabel = (match: (typeof upcoming)[number]): string =>
    match.competition.tier.groupSize
      ? `${t('shared.matchday')} ${match.round}`
      : getTeamsRoundLabel(match);

  const openPlayerTransferModal = React.useCallback((playerId: number) => {
    api.window.send<ModalRequest>(Constants.WindowIdentifier.Modal, {
      target: '/transfer',
      payload: playerId,
    });
  }, []);

  const shouldUseVetoFlow = React.useCallback((match?: (typeof upcoming)[number]) => {
    return (
      !!match &&
      match.status !== Constants.MatchStatus.PLAYING &&
      match.status !== Constants.MatchStatus.COMPLETED
    );
  }, []);

  // load settings
  React.useEffect(() => {
    if (!state.profile) {
      return;
    }

    setSettings(Util.loadSettings(state.profile.settings));
  }, [state.profile]);

  React.useEffect(() => {
    if (!state.profile) {
      setActiveFaceitMatch(null);
      setActiveFaceitMatchChecked(false);
      return;
    }

    let disposed = false;
    setActiveFaceitMatchChecked(false);
    const refreshActiveFaceitMatch = () => {
      api.faceit
        .activeMatch()
        .then((match) => {
          if (!disposed) {
            setActiveFaceitMatch(match);
            setActiveFaceitMatchChecked(true);
          }
        })
        .catch(() => {
          if (!disposed) {
            setActiveFaceitMatch(null);
            setActiveFaceitMatchChecked(true);
          }
        });
    };

    refreshActiveFaceitMatch();
    const interval = setInterval(refreshActiveFaceitMatch, 2000);

    return () => {
      disposed = true;
      clearInterval(interval);
    };
  }, [state.profile?.id, state.playing]);

  // reset one-time warning after switching profiles/saves
  React.useEffect(() => {
    setDismissedNoTeamAdvanceWarning(false);
  }, [state.profile?.id]);

  React.useEffect(() => {
    if (noTeamAdvanceWarningVisible) {
      audioNegativeAlert();
    }
  }, [noTeamAdvanceWarningVisible]);

  // fetch upcoming list of matches
  React.useEffect(() => {
    if (!state.profile) {
      return;
    }

    if (!state.profile.teamId) {
      setUpcoming([]);
      return;
    }

    api.matches.upcoming(Eagers.match, NUM_UPCOMING).then(setUpcoming);
  }, [state.profile]);

  // fetch recent transfers
  React.useEffect(() => {
    if (!state.profile) {
      return;
    }

    api.transfers
      .all({
        include: Eagers.transfer.include,
        take: NUM_PREVIOUS,
        where: {
          status: {
            in: [
              Constants.TransferStatus.PLAYER_ACCEPTED,
              Constants.TransferStatus.TEAM_ACCEPTED,
              Constants.TransferStatus.EXPIRED,
            ],
          },
        },
        orderBy: {
          id: 'desc',
        },
      })
      .then(setTransfers);
  }, [state.profile]);

  React.useEffect(() => {
    if (!state.profile) return;
    let active = true;
    loadTransferEvents().then((events) => {
      if (active) setRecentTransferEvents(events.slice(0, 4));
    });
    return () => {
      active = false;
    };
  }, [state.profile?.id, state.profile?.date]);

  React.useEffect(() => {
    if (!state.profile || state.profile.teamId) {
      setDashboardFaceit(null);
      return;
    }

    let active = true;
    api.faceit
      .profile()
      .then((faceitProfile) => {
        if (active) setDashboardFaceit(faceitProfile);
      })
      .catch(() => {
        if (active) setDashboardFaceit(null);
      });

    return () => {
      active = false;
    };
  }, [state.profile?.id, state.profile?.date, state.profile?.teamId]);

  // fetch the newsroom headlines used by the compact dashboard rail
  React.useEffect(() => {
    if (!state.profile) {
      setNewsItems([]);
      return;
    }

    let active = true;
    const refreshNews = () => {
      api.news.all().then((items) => {
        if (active) setNewsItems(items);
      });
    };

    refreshNews();
    const removeNewsItemsUpdatedListener = api.ipc.on(
      Constants.IPCRoute.NEWS_ITEMS_UPDATED,
      refreshNews,
    );

    return () => {
      active = false;
      removeNewsItemsUpdatedListener();
    };
  }, [state.profile?.id]);

  // fetch match facts for spotlight
  React.useEffect(() => {
    const [nextMatch] = upcoming.slice(0, 1);

    if (!nextMatch) {
      return;
    }

    // match historial
    Promise.all(
      nextMatch.competitors.map((competitor) =>
        api.matches.previous(Eagers.match, competitor.teamId, NUM_PREVIOUS * 2),
      ),
    ).then(setMatchHistorial);

    // world rankings
    Promise.all(
      nextMatch.competitors.map((competitor) => api.team.worldRanking(competitor.teamId)),
    ).then(setWorldRankings);
  }, [upcoming]);

  // fetch previous matches if no upcoming matches
  React.useEffect(() => {
    const [nextMatch] = upcoming.slice(0, 1);

    if (!state.profile || !state.profile.teamId) {
      setPrevious([]);
      return;
    }

    if (nextMatch) {
      return;
    }

    api.matches.previous(Eagers.match, state.profile.teamId).then(setPrevious);
  }, [upcoming, state.profile]);

  // fill in rows if not enough upcoming matches
  const upcomingFiller = React.useMemo(
    () => [...Array(Math.max(0, NUM_UPCOMING - (upcoming.length || 1)))],
    [upcoming],
  );

  // check if its matchday
  const isMatchday = React.useMemo(
    () =>
      state.profile &&
      upcoming.length &&
      upcoming[0]?.date.toISOString() === state.profile.date.toISOString(),
    [upcoming, state.profile],
  );

  // grab next match info
  const [spotlight] = React.useMemo(() => upcoming.slice(0, 1), [upcoming]);
  const spotlightVetoMaps = React.useMemo(() => {
    if (!spotlight) return [];
    const decidedMaps = getDecidedVetoMaps(spotlightVetoes);
    return decidedMaps.length >= spotlight.games.length
      ? decidedMaps.slice(0, spotlight.games.length).map((entry) => entry.map)
      : [];
  }, [spotlight, spotlightVetoes]);

  React.useEffect(() => {
    if (!spotlight) {
      setSpotlightVetoes([]);
      return;
    }

    let active = true;
    let refreshInterval: ReturnType<typeof setInterval> | undefined;
    const refreshVetoes = () => {
      api.match.findVetoList(spotlight.id).then((vetoes) => {
        if (!active) return;

        setSpotlightVetoes(vetoes);
        if (getDecidedVetoMaps(vetoes).length >= spotlight.games.length && refreshInterval) {
          clearInterval(refreshInterval);
          refreshInterval = undefined;
        }
      });
    };

    refreshVetoes();
    refreshInterval = setInterval(refreshVetoes, 1000);
    return () => {
      active = false;
      if (refreshInterval) clearInterval(refreshInterval);
    };
  }, [spotlight?.id]);
  const playingStatus = state.playing ? state.playing.status : undefined;
  const playingStatusIndex = Math.max(
    0,
    PLAYING_STATUS_STEPS.findIndex((step) => step === playingStatus),
  );
  const playingProgressValue = ((playingStatusIndex + 1) / PLAYING_STATUS_STEPS.length) * 100;
  const playError = React.useMemo(() => {
    if (!state.playError?.status) {
      return null;
    }

    try {
      return JSON.parse(state.playError.status) as NodeJS.ErrnoException;
    } catch (_) {
      return null;
    }
  }, [state.playError?.status]);
  const playErrorPromptVisible = !!playError && !!state.playError;
  const playErrorIsInvalidGamePath = playError?.code === Constants.ErrorCode.EINVAL;
  const isActiveFaceitMatchroom =
    activeFaceitMatch?.status === Constants.MatchStatus.READY ||
    activeFaceitMatch?.status === Constants.MatchStatus.WAITING ||
    activeFaceitMatch?.status === Constants.MatchStatus.PLAYING;
  const isCalendarFaceitBlocked =
    !activeFaceitMatchChecked || isFaceitMatchroomLocked || isActiveFaceitMatchroom;

  React.useEffect(() => {
    if (
      !playErrorPromptVisible ||
      !state.playError ||
      soundedPlayErrorAt.current === state.playError.at
    ) {
      return;
    }

    soundedPlayErrorAt.current = state.playError.at;
    audioNegativeAlert();
  }, [audioNegativeAlert, playErrorPromptVisible, state.playError]);

  // grab standings info
  const [standings] = React.useMemo(
    () => (spotlight ? upcoming.slice(0, 1) : previous),
    [spotlight, previous],
  );

  // fetch stage matches for expandable standings rows
  React.useEffect(() => {
    setStandingMatches([]);

    if (!standings?.competition.tier.groupSize) {
      return;
    }

    let isCurrent = true;

    api.matches
      .all({
        include: Eagers.match.include,
        orderBy: [{ round: 'asc' }, { date: 'asc' }, { id: 'asc' }],
        where: {
          competitionId: standings.competition.id,
        },
      })
      .then((matches) => {
        if (isCurrent) {
          setStandingMatches(matches);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [standings]);

  // grab user's team info
  const userTeam = React.useMemo(() => {
    if (!standings || !state.profile?.teamId) {
      return undefined;
    }

    return standings.competition.competitors.find(
      (competitor) => competitor.teamId === state.profile.teamId,
    );
  }, [standings, state.profile?.teamId]);

  // grab competitors by user's group
  const userGroupCompetitors = React.useMemo(() => {
    if (!standings || !standings.competition.tier.groupSize || !userTeam) {
      return undefined;
    }

    return standings.competition.competitors
      .filter((competitor) => competitor.group === userTeam.group)
      .sort((a, b) => a.position - b.position);
  }, [standings, userTeam]);

  const userRecentMatches = React.useMemo(() => {
    if (!state.profile?.teamId) {
      return [];
    }

    if (!spotlight) {
      return previous.filter(
        (match) => match.competitors.filter((competitor) => !!competitor.team).length >= 2,
      );
    }

    const userCompetitorIndex = spotlight.competitors.findIndex(
      (competitor) => competitor.teamId === state.profile?.teamId,
    );

    return (userCompetitorIndex >= 0 ? matchHistorial[userCompetitorIndex] || [] : []).filter(
      (match) => match.competitors.filter((competitor) => !!competitor.team).length >= 2,
    );
  }, [matchHistorial, previous, spotlight, state.profile?.teamId]);

  const profile = state.profile;

  return (
    <div className="dashboard">
      {/** PLAYING MODAL */}
      <dialog className={cx('modal', state.playing && 'modal-open')}>
        <section className="modal-box">
          <h3 className="text-lg">{t('main.dashboard.playingMatchTitle')}</h3>
          <p className="pt-3 text-sm opacity-70">{t('main.dashboard.playingMatchSubtitle')}</p>
          <article className="bg-base-200 mt-5 rounded p-4">
            <div className="flex items-center gap-3">
              <FaSpinner className="animate-spin text-xl" />
              <div>
                <p className="text-sm uppercase opacity-60">
                  {t('main.dashboard.matchStartupStatus')}
                </p>
                <p className="font-bold">
                  {t(`main.dashboard.playingStatus.${playingStatus || 'PREPARING_MATCH'}`)}
                </p>
              </div>
            </div>
            <progress
              className="progress progress-warning mt-4 w-full"
              value={playingProgressValue}
              max="100"
            />
            <ul className="mt-4 space-y-2 text-sm">
              {PLAYING_STATUS_STEPS.map((step, idx) => {
                const isComplete = idx < playingStatusIndex;
                const isActive = idx === playingStatusIndex;

                return (
                  <li
                    key={step}
                    className={cx(
                      'flex items-center gap-2',
                      isActive && 'font-bold',
                      !isActive && !isComplete && 'opacity-50',
                    )}
                  >
                    {isComplete ? (
                      <FaCheckCircle className="text-success" />
                    ) : (
                      <span
                        className={cx(
                          'border-base-content/40 block size-4 rounded-full border',
                          isActive && 'border-warning bg-warning',
                        )}
                      />
                    )}
                    <span>{t(`main.dashboard.playingStatus.${step}`)}</span>
                  </li>
                );
              })}
            </ul>
          </article>
        </section>
      </dialog>

      {/** SETTINGS VALIDATION WARNING BANNER */}
      <StatusBanner error={state.appStatus} />

      {/** TEAM DASHBOARD */}
      {!!profile && (
        <section className="team-dashboard-overview">
          <section className="team-dashboard-calendar" aria-label="Upcoming calendar">
            {!state.working ? (
              <button
                type="button"
                title={t('main.dashboard.advanceCalendar')}
                data-interaction-sound="none"
                className="team-dashboard-advance"
                disabled={state.working || isCalendarFaceitBlocked || (isMatchday && !isBenched)}
                onClick={async () => {
                  if (state.working || isCalendarFaceitBlocked) {
                    return;
                  }

                  if (!profile.teamId && !dismissedNoTeamAdvanceWarning) {
                    const faceitProfile = dashboardFaceit ?? (await api.faceit.profile());
                    if (faceitProfile.lifetime.matchesPlayed < 10) {
                      setNoTeamAdvanceWarningVisible(true);
                      return;
                    }
                  }

                  if (isMatchday && isBenched) {
                    audioClick();
                    api.calendar.sim().then(() => dispatch(calendarAdvance(1)));
                    return;
                  }

                  if (!isMatchday) {
                    audioClick();
                    dispatch(calendarAdvance());
                  }
                }}
              >
                <FaForward aria-hidden="true" />
                <span>{t('main.dashboard.advanceCalendar').replace(' Calendar', '')}</span>
              </button>
            ) : (
              <button
                type="button"
                title={t('main.dashboard.stopCalendar')}
                className="team-dashboard-advance is-stop"
                onClick={api.calendar.stop}
              >
                <FaStop aria-hidden="true" />
                <span>{t('main.dashboard.stopCalendar').replace(' Calendar', '')}</span>
              </button>
            )}

            {[...Array(6)].map((_, idx) => {
              const day = addDays(profile.date, idx);
              const entry = upcoming.find(
                (match) => match.date.toISOString() === day.toISOString(),
              );
              const opponent = entry?.competitors.find(
                (competitor) => competitor.teamId !== profile.teamId,
              );
              const trainingAllowed =
                differenceInDays(day, profile.trainedAt || profile.date) ===
                Constants.Application.TRAINING_FREQUENCY;

              return (
                <article
                  key={`${idx}__team_calendar`}
                  className={cx('team-dashboard-day', idx === 0 && 'is-today')}
                >
                  <div className="team-dashboard-day-icon">
                    {opponent ? (
                      <img src={opponent.team.blazon} title={opponent.team.name} />
                    ) : trainingAllowed ? (
                      <FaStopwatch aria-hidden="true" />
                    ) : (
                      <FaCloudMoon aria-hidden="true" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="team-dashboard-day-kicker">
                      {idx === 0 ? `Today · ${format(day, 'EEE')}` : format(day, 'EEE')}
                    </p>
                    <p className="team-dashboard-day-number">{format(day, 'd')}</p>
                    <p className="team-dashboard-day-label">
                      {opponent
                        ? `vs ${opponent.team.name}`
                        : trainingAllowed
                          ? t('shared.training')
                          : t('main.dashboard.rest').toUpperCase()}
                    </p>
                  </div>
                </article>
              );
            })}
          </section>

          <div className="team-dashboard-grid">
            <div className="team-dashboard-main-column">
              {profile.teamId ? (
                <>
                  <section className="team-dashboard-panel team-dashboard-next-match">
                    <DashboardMapBackground
                      className="team-dashboard-map-background"
                      maps={spotlightVetoMaps}
                      game={settings.general.game}
                    />
                    <div className="team-dashboard-map-overlay" aria-hidden="true" />
                    <header className="team-dashboard-panel-header is-borderless justify-end">
                      {!!spotlight && (
                        <time className={cx('team-dashboard-date-pill', isMatchday && 'is-today')}>
                          {isMatchday ? 'Today · ' : ''}
                          {format(spotlight.date, 'EEE d MMM yyyy')}
                        </time>
                      )}
                    </header>

                    {!spotlight ? (
                      <div className="team-dashboard-empty-match">
                        <FaCalendarDay aria-hidden="true" />
                        <strong>{t('main.dashboard.noMatch')}</strong>
                        <span>{t('main.dashboard.noMatchScheduled')}</span>
                      </div>
                    ) : (
                      (() => {
                        const competitors = spotlight.competitors.filter(
                          (competitor) => !!competitor.team,
                        );
                        const own = competitors.find(
                          (competitor) => competitor.teamId === profile.teamId,
                        );
                        const opponent = competitors.find(
                          (competitor) => competitor.teamId !== profile.teamId,
                        );

                        if (!own || !opponent) {
                          return (
                            <div className="team-dashboard-empty-match">
                              <FaCalendarDay aria-hidden="true" />
                              <strong>{t('main.dashboard.noMatchScheduled')}</strong>
                            </div>
                          );
                        }

                        const spotlightGames = spotlight.games || [];
                        const spotlightUsesVetoFlow = shouldUseVetoFlow(spotlight);
                        const ownIndex = spotlight.competitors.findIndex(
                          (competitor) => competitor.teamId === own.teamId,
                        );
                        const opponentIndex = spotlight.competitors.findIndex(
                          (competitor) => competitor.teamId === opponent.teamId,
                        );
                        const ownRanking = worldRankings[ownIndex] || 0;
                        const opponentRanking = worldRankings[opponentIndex] || 0;
                        const ownHistory = matchHistorial[ownIndex] || [];
                        const opponentHistory = matchHistorial[opponentIndex] || [];
                        const disabled =
                          state.working || !isMatchday || isBenched || isActiveFaceitMatchroom;

                        const teamPosition = (teamId: number, tier: number) => {
                          if (!spotlight.competition.tier.groupSize || !userGroupCompetitors) {
                            return toDashboardTeamTierLabel(Constants.Prestige[tier]);
                          }

                          const position = userGroupCompetitors.findIndex(
                            (competitor) => competitor.teamId === teamId,
                          );
                          return position >= 0
                            ? Util.toOrdinalSuffix(position + 1)
                            : toDashboardTeamTierLabel(Constants.Prestige[tier]);
                        };

                        const openPregame = () => {
                          if (isActiveFaceitMatchroom) {
                            return;
                          }

                          audioClick();
                          api.window.send<ModalRequest>(Constants.WindowIdentifier.Modal, {
                            target: '/pregame',
                            payload: spotlight.id,
                          });
                        };

                        return (
                          <div className="team-dashboard-match-content">
                            <Link
                              to={`/teams?teamId=${own.teamId}`}
                              className="team-dashboard-team"
                            >
                              <img src={own.team.blazon} alt="" />
                              <h3>{own.team.name}</h3>
                              <p>
                                #{ownRanking || '—'} {t('shared.worldRanking')} ·{' '}
                                {teamPosition(own.teamId, own.team.tier)}
                              </p>
                              <Historial matches={ownHistory} teamId={own.teamId} />
                            </Link>

                            <Link
                              to={`/competitions?federationId=${spotlight.competition.federationId}&season=${spotlight.competition.season}&tierId=${spotlight.competition.tier.id}`}
                              className="team-dashboard-match-meta"
                            >
                              <Image
                                className="team-dashboard-event-logo"
                                src={Util.getCompetitionLogo(
                                  spotlight.competition.tier.slug,
                                  spotlight.competition.federation.slug,
                                  {
                                    location: spotlight.competition.location,
                                    organizer: spotlight.competition.organizer,
                                  },
                                )}
                                alt=""
                              />
                              <strong>{toDashboardTournamentLabel(spotlight)}</strong>
                              <span>{toDashboardRoundLabel(spotlight)}</span>
                              <small>
                                {t('shared.bestOf')} {spotlightGames.length || 1}
                              </small>
                            </Link>

                            <Link
                              to={`/teams?teamId=${opponent.teamId}`}
                              className="team-dashboard-team"
                            >
                              <img src={opponent.team.blazon} alt="" />
                              <h3>{opponent.team.name}</h3>
                              <p>
                                #{opponentRanking || '—'} {t('shared.worldRanking')} ·{' '}
                                {teamPosition(opponent.teamId, opponent.team.tier)}
                              </p>
                              <Historial matches={opponentHistory} teamId={opponent.teamId} />
                            </Link>

                            {spotlight.status === Constants.MatchStatus.PLAYING && (
                              <span className="team-dashboard-live">
                                <i /> Live ·{' '}
                                {spotlight.competitors
                                  .map((competitor) => competitor.score)
                                  .join(' – ')}
                              </span>
                            )}

                            <footer className="team-dashboard-match-actions">
                              <button
                                type="button"
                                data-interaction-sound="none"
                                className="btn btn-primary team-dashboard-play-button"
                                disabled={disabled}
                                onClick={openPregame}
                              >
                                {t('main.dashboard.play')}
                              </button>
                            </footer>
                          </div>
                        );
                      })()
                    )}
                  </section>

                  <section className="team-dashboard-panel team-dashboard-recent-matches">
                    <header className="team-dashboard-panel-header">
                      <h2>
                        <FaChartBar aria-hidden="true" />
                        {t('main.dashboard.headerRecentMatches')}
                      </h2>
                      <Link to={`/teams/matches?teamId=${profile.teamId}`}>
                        View all matches <FaArrowRight aria-hidden="true" />
                      </Link>
                    </header>
                    <div className="team-dashboard-match-table-header">
                      <span>Date</span>
                      <span>Match</span>
                      <span>Event</span>
                      <span />
                    </div>
                    <div className="team-dashboard-match-list">
                      {userRecentMatches.slice(0, NUM_PREVIOUS).map((match) => {
                        const own = match.competitors.find(
                          (competitor) => competitor.teamId === profile.teamId,
                        );
                        const opponent = match.competitors.find(
                          (competitor) => competitor.teamId !== profile.teamId,
                        );
                        const resultLabel =
                          own?.result === Constants.MatchResult.WIN
                            ? 'Win'
                            : own?.result === Constants.MatchResult.DRAW
                              ? 'Draw'
                              : 'Loss';
                        const eventThumbnail =
                          Util.getCompetitionThumbnail({
                            federationSlug: match.competition.federation.slug,
                            organizer: match.competition.organizer,
                            tierSlug: match.competition.tier.slug,
                          }) ||
                          Util.getCompetitionLogo(
                            match.competition.tier.slug,
                            match.competition.federation.slug,
                            {
                              location: match.competition.location,
                              organizer: match.competition.organizer,
                            },
                          );
                        const canOpen = match._count.events > 0;

                        return (
                          <article key={`${match.id}__team_recent`}>
                            <time title={format(match.date, 'PPPP')}>
                              {fmtShortDate(match.date)}
                            </time>
                            <div className="team-dashboard-result">
                              <span
                                className={cx(
                                  'team-dashboard-result-badge',
                                  resultLabel === 'Win' && 'is-win',
                                  resultLabel === 'Draw' && 'is-draw',
                                  resultLabel === 'Loss' && 'is-loss',
                                )}
                              >
                                {resultLabel}
                              </span>
                              <img src={own?.team.blazon} alt="" />
                              <strong>{own?.team.name || '—'}</strong>
                              <b className={Util.getResultTextColor(own?.result)}>
                                {own?.score ?? 0} : {opponent?.score ?? 0}
                              </b>
                              {!!opponent?.team && <img src={opponent.team.blazon} alt="" />}
                              <strong>{opponent?.team.name || 'BYE'}</strong>
                            </div>
                            <span
                              className="team-dashboard-event"
                              title={toDashboardTournamentLabel(match)}
                            >
                              <img src={eventThumbnail} alt="" />
                              <b>{toDashboardTournamentLabel(match)}</b>
                            </span>
                            <button
                              type="button"
                              className="btn btn-xs w-16 justify-self-end bg-[#4d6783] text-[#d8e5f1]"
                              disabled={!canOpen}
                              onClick={() =>
                                api.window.send<ModalRequest>(Constants.WindowIdentifier.Modal, {
                                  target: '/postgame',
                                  payload: match.id,
                                })
                              }
                            >
                              Match
                            </button>
                          </article>
                        );
                      })}
                      {!userRecentMatches.length && (
                        <p className="team-dashboard-list-empty">{t('shared.noRecentMatch')}</p>
                      )}
                    </div>
                  </section>
                </>
              ) : (
                (() => {
                  const faceit = dashboardFaceit;
                  const offerProgress = faceit?.offerProgress;
                  const faceitOffer = offerProgress?.faceit;
                  const advanceOffer = offerProgress?.advance;
                  const matchCount = faceit?.lifetime.matchesPlayed ?? 0;
                  const minimumMatches = faceitOffer?.minimumMatches ?? 8;
                  const minimumElo = faceitOffer?.minimumElo ?? 0;
                  const faceitChance = Math.round(faceitOffer?.offerChance ?? 0);
                  const advanceChance = Math.round(advanceOffer?.chance ?? 0);
                  const elo = faceit?.faceitElo ?? profile.faceitElo ?? 0;
                  const level = faceit?.faceitLevel ?? 0;
                  const dailyPlayed = faceit?.daily?.playedToday ?? 0;
                  const dailyMaximum = faceit?.daily?.maxToday ?? 3;
                  const faceitRequirements = [
                    {
                      label: `Complete ${minimumMatches} FACEIT matches`,
                      detail: `${Math.min(matchCount, minimumMatches)}/${minimumMatches} completed`,
                      complete: matchCount >= minimumMatches,
                    },
                    ...(minimumElo > 0
                      ? [
                          {
                            label: `Reach ${minimumElo} FACEIT ELO`,
                            detail: `${elo}/${minimumElo} ELO`,
                            complete: elo >= minimumElo,
                          },
                        ]
                      : []),
                  ];
                  const advanceRequirements = [
                    {
                      label: 'Complete official matches',
                      detail: `${advanceOffer?.maps ?? 0} official maps recorded`,
                      complete: (advanceOffer?.matches ?? 0) > 0,
                    },
                  ];

                  return (
                    <>
                      <section
                        className="team-dashboard-panel team-dashboard-next-match teamless-dashboard-faceit"
                        style={{
                          backgroundImage: `url(${faceitDashboardBackground})`,
                          backgroundSize: 'cover',
                          backgroundPosition: 'center',
                          backgroundRepeat: 'no-repeat',
                        }}
                      >
                        <time className="team-dashboard-date-pill absolute top-4 left-4 z-10">
                          Today · {format(profile.date, 'EEE d MMM yyyy')}
                        </time>
                        <div className="teamless-dashboard-faceit-content">
                          <div className="teamless-dashboard-player">
                            <span className="teamless-dashboard-avatar">
                              {profile.player?.avatar ? (
                                <img src={profile.player.avatar} alt="" />
                              ) : (
                                <FaUser aria-hidden="true" />
                              )}
                            </span>
                            <strong>Free agent</strong>
                            <span className="teamless-dashboard-no-team">
                              <img src="resources://blazonry/noteam.svg" alt="" />
                              No Team
                            </span>
                          </div>

                          <div className="teamless-dashboard-rank">
                            <span
                              className={cx('teamless-dashboard-level', !level && 'is-unranked')}
                            >
                              <img
                                src={FACEIT_LEVEL_IMAGES[level] || faceitUnranked}
                                alt={level ? `FACEIT Level ${level}` : 'Unranked'}
                              />
                            </span>
                            <strong>{elo > 0 ? `${elo} ELO` : 'Unranked'}</strong>
                            {!elo && <span>Complete your placements</span>}
                            <small>
                              Matches today {dailyPlayed}/{dailyMaximum}
                            </small>
                          </div>

                          <div className="teamless-dashboard-form">
                            <span>FACEIT form</span>
                            <strong style={{ whiteSpace: 'nowrap' }}>
                              {(faceit?.lifetime.kdRatio ?? 0).toFixed(2)}{' '}
                              <span style={{ fontSize: '0.75rem' }}>K/D</span>
                            </strong>
                          </div>

                          <div className="teamless-dashboard-form teamless-dashboard-win-rate">
                            <span>Win rate</span>
                            <strong>{Math.round(faceit?.lifetime.winRate ?? 0)}%</strong>
                          </div>

                          <div className="teamless-dashboard-form teamless-dashboard-last-five">
                            <span>Last 5 matches</span>
                            <div aria-label="Last five FACEIT match results">
                              {Array.from({ length: 5 }, (_, index) => {
                                const result = faceit?.recent?.[index]?.yourTeamWon;
                                return (
                                  <i
                                    key={index}
                                    title={
                                      result === true
                                        ? 'Win'
                                        : result === false
                                          ? 'Loss'
                                          : 'No match'
                                    }
                                    className={cx(
                                      result === true && 'is-active',
                                      result === false && 'is-loss',
                                    )}
                                  />
                                );
                              })}
                            </div>
                          </div>

                          <Link className="btn btn-primary teamless-dashboard-play" to="/faceit">
                            Play FACEIT
                          </Link>
                        </div>
                      </section>

                      <section className="team-dashboard-panel team-dashboard-recent-matches teamless-dashboard-offers">
                        <header className="team-dashboard-panel-header">
                          <h2>
                            <FaBullseye aria-hidden="true" /> Contract Offer Progress
                          </h2>
                        </header>
                        <div className="teamless-dashboard-offer-methods">
                          <article>
                            <header>
                              <img
                                src={faceitLogo}
                                className="bg-base-300 size-10 shrink-0 rounded object-contain p-1"
                                alt=""
                              />
                              <div>
                                <strong>FACEIT offer chance</strong>
                              </div>
                            </header>
                            <p>
                              <strong>{faceitChance}%</strong>{' '}
                              {faceitOffer?.blockedReason || 'chance after your next match'}
                            </p>
                            <progress value={faceitChance} max="100" />
                          </article>
                          <article>
                            <header>
                              <FaClock aria-hidden="true" />
                              <div>
                                <strong>Advancement offer chance</strong>
                              </div>
                            </header>
                            <p>
                              <strong>{advanceChance}%</strong> weekly chance
                            </p>
                            <progress value={advanceChance} max="100" />
                          </article>
                        </div>
                        <header className="team-dashboard-panel-header teamless-dashboard-requirements-header">
                          <h2>
                            <FaClipboardCheck aria-hidden="true" /> Requirements
                          </h2>
                        </header>
                        <div className="teamless-dashboard-requirements">
                          {[faceitRequirements, advanceRequirements].map(
                            (pathRequirements, pathIndex) => (
                              <div key={pathIndex === 0 ? 'faceit' : 'advance'}>
                                {pathRequirements.map((requirement) => (
                                  <DashboardRequirement
                                    key={requirement.label}
                                    complete={requirement.complete && !!dashboardFaceit}
                                    loaded={!!dashboardFaceit}
                                    storageKey={`dashboard-requirement:${profile.id}:${profile.name}:${requirement.label}`}
                                  >
                                    <FaCheckCircle aria-hidden="true" />
                                    <div>
                                      <strong>
                                        {requirement.label}
                                        {requirement.label === `Reach ${minimumElo} FACEIT ELO` && (
                                          <span
                                            className="tooltip ml-2 inline-block align-middle"
                                            data-tip="FACEIT Level 10 is required for contract offers in Europe"
                                            tabIndex={0}
                                            aria-label="FACEIT Level 10 is required for contract offers in Europe"
                                          >
                                            <FaInfoCircle style={{ fontSize: '0.875rem' }} />
                                          </span>
                                        )}
                                      </strong>
                                      <span>{requirement.detail}</span>
                                    </div>
                                  </DashboardRequirement>
                                ))}
                                <p className="teamless-dashboard-offer-info">
                                  <FaInfoCircle aria-hidden="true" />
                                  {pathIndex === 0
                                    ? 'Strong FACEIT results raise visibility'
                                    : 'Teams review free agents over time'}
                                </p>
                              </div>
                            ),
                          )}
                        </div>
                      </section>
                    </>
                  );
                })()
              )}
            </div>

            <aside className="team-dashboard-side-column">
              <section className="team-dashboard-panel">
                <header className="team-dashboard-panel-header">
                  <h2>
                    <FaExchangeAlt aria-hidden="true" />
                    Recent Transfers
                  </h2>
                  <button
                    type="button"
                    onClick={() =>
                      api.window.send<ModalRequest>(Constants.WindowIdentifier.Modal, {
                        target: '/transfer-history',
                      })
                    }
                  >
                    View all <FaArrowRight aria-hidden="true" />
                  </button>
                </header>
                <div className="team-dashboard-transfer-list">
                  {recentTransferEvents.map((event) => {
                    const fromTeam = event.from;
                    const toTeam = event.to;
                    return (
                      <article key={`${event.id}__team_transfer`}>
                        <button
                          type="button"
                          className="team-dashboard-player-avatar"
                          title={`View ${event.player.name}`}
                          aria-label={`View ${event.player.name}`}
                          onClick={() => openPlayerTransferModal(event.player.id)}
                        >
                          <img
                            src={event.player.avatar || 'resources://avatars/empty.png'}
                            alt=""
                          />
                        </button>
                        <div className="team-dashboard-transfer-copy">
                          <strong>{event.player.name}</strong>
                          <span>{describeTransferEvent(event)}</span>
                        </div>
                        <div className="team-dashboard-transfer-route">
                          {fromTeam ? (
                            <Link to={`/teams?teamId=${fromTeam.id}`} title={fromTeam.name}>
                              <img src={fromTeam.blazon} alt={fromTeam.name} />
                              {event.fromBenched && <small>BENCH</small>}
                            </Link>
                          ) : (
                            <img src="resources://blazonry/noteam.svg" alt="No Team" />
                          )}
                          <FaArrowRight aria-hidden="true" />
                          {toTeam ? (
                            <Link to={`/teams?teamId=${toTeam.id}`} title={toTeam.name}>
                              <img src={toTeam.blazon} alt={toTeam.name} />
                              {event.toBenched && <small>BENCH</small>}
                            </Link>
                          ) : (
                            <img src="resources://blazonry/noteam.svg" alt="No Team" />
                          )}
                        </div>
                      </article>
                    );
                  })}
                  {!recentTransferEvents.length && (
                    <p className="team-dashboard-list-empty">No recent transfers</p>
                  )}
                </div>
              </section>

              <section className="team-dashboard-panel">
                <header className="team-dashboard-panel-header">
                  <h2>
                    <FaNewspaper aria-hidden="true" />
                    News
                  </h2>
                  <Link to="/news">
                    View all <FaArrowRight aria-hidden="true" />
                  </Link>
                </header>
                <div className="team-dashboard-news-list">
                  {dashboardNewsItems.map((item) => {
                    const display = getDashboardNewsDisplay(item);
                    const graphic = display.graphic;
                    const avatarLayout = graphic?.avatarLayout as
                      | Record<string, string>
                      | undefined;
                    const nameLayout = graphic?.nameLayout as Record<string, string> | undefined;

                    return (
                      <Link
                        key={`${item.id}__team_news`}
                        className={cx(
                          'team-dashboard-news-item',
                          display.golden && 'is-golden',
                          item.id === featuredNewsId && 'is-featured',
                        )}
                        to="/news"
                        state={{ articleId: item.id }}
                      >
                        <div className="team-dashboard-news-copy">
                          <span>
                            {item.topic} · {fmtShortDate(item.publishedAt)}
                          </span>
                          <strong>
                            {display.flagCode && (
                              <span className={cx('fp', display.flagCode)} aria-hidden="true" />
                            )}
                            {item.headline}
                          </strong>
                        </div>
                        {item.id === featuredNewsId && graphic && (
                          <figure
                            className="team-dashboard-news-feature"
                            style={{ aspectRatio: String(graphic.aspectRatio || '1836 / 857') }}
                          >
                            <img src={String(graphic.template)} alt="" />
                            {typeof graphic.avatar === 'string' && (
                              <img
                                className="team-dashboard-news-feature-avatar"
                                src={graphic.avatar}
                                alt=""
                                style={{
                                  bottom: avatarLayout?.bottom || '0%',
                                  height: avatarLayout?.height || '90%',
                                  left: avatarLayout?.left || '3%',
                                  maxWidth: avatarLayout?.maxWidth || '37%',
                                }}
                              />
                            )}
                            <figcaption
                              style={{
                                color:
                                  typeof graphic.textColor === 'string'
                                    ? graphic.textColor
                                    : '#fff',
                                fontFamily:
                                  typeof graphic.fontFamily === 'string'
                                    ? graphic.fontFamily
                                    : undefined,
                                fontStyle:
                                  typeof graphic.fontStyle === 'string'
                                    ? graphic.fontStyle
                                    : undefined,
                                left: nameLayout?.left || '68%',
                                top: nameLayout?.top || '84%',
                                width: nameLayout?.width || '34%',
                                transform: `translate(-50%, -50%) rotate(${graphic.rotate || '0deg'}) skewX(${graphic.skewX || '0deg'})`,
                              }}
                            >
                              {String(graphic.playerName || '')}
                            </figcaption>
                          </figure>
                        )}
                        {item.id !== featuredNewsId && display.golden && display.image && (
                          <img className="team-dashboard-news-image" src={display.image} alt="" />
                        )}
                      </Link>
                    );
                  })}
                  {!newsItems.length && <p className="team-dashboard-list-empty">No news yet</p>}
                </div>
              </section>
            </aside>
          </div>
        </section>
      )}

      {/** MAIN CONTENT */}
      <main style={profile ? { display: 'none' } : undefined}>
        {/** LEFT COLUMN */}
        <div className="stack-y gap-0!">
          <section className="stack-y gap-0!">
            <header className="prose border-t-0!">
              <h2>{t('main.dashboard.headerUpcomingMatches')}</h2>
            </header>
            <table className="table table-fixed">
              <tbody>
                {upcoming.slice(1, NUM_UPCOMING).map((match) => {
                  const opponent = match.competitors.find(
                    (competitor) => competitor.teamId !== state.profile.teamId,
                  );
                  return (
                    <tr key={`${match.id}__match_upcoming`}>
                      <td className="w-1/5" title={format(match.date, 'PPPP')}>
                        {fmtShortDate(match.date)}
                      </td>
                      <td className="w-2/5 truncate" title={opponent?.team?.name || '-'}>
                        <img
                          src={opponent?.team?.blazon || 'resources://blazonry/009400.png'}
                          className="mr-2 inline-block size-4"
                        />
                        <span>{opponent?.team.name || '-'}</span>
                      </td>
                      <td
                        className="w-2/5 truncate"
                        title={toDashboardMatchCompetitionLabel(match)}
                      >
                        {toDashboardMatchCompetitionLabel(match)}
                      </td>
                    </tr>
                  );
                })}
                {upcomingFiller.map((_, idx) => (
                  <tr key={`${idx}__filler_match_upcoming`} className="text-muted">
                    <td className="w-1/5">
                      {state.profile
                        ? fmtShortDate(
                            addDays(
                              !upcoming.length ? state.profile.date : upcoming.slice(-1)[0].date,
                              idx + 1,
                            ),
                          )
                        : '-'}
                    </td>
                    <td className="w-2/5 truncate">{t('main.dashboard.noMatchScheduled')}</td>
                    <td className="w-2/5">-</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <section className="stack-y gap-0!">
            <header className="prose">
              <h2>{t('shared.standings')}</h2>
            </header>
            {!standings && (
              <article key="empty__standings" className="card h-32 rounded-none">
                <aside className="card-body items-center justify-center">
                  <p className="grow-0">{t('main.dashboard.noStandings')}</p>
                </aside>
              </article>
            )}
            {!!standings &&
              !!spotlight &&
              (() => {
                if (standings.competition.tier.groupSize && userTeam && userGroupCompetitors) {
                  return (
                    <article className="stack-y divide-base-content/10 !gap-0 divide-y">
                      <aside className="stack-x items-center px-2">
                        <Image
                          className="size-16"
                          src={Util.getCompetitionLogo(
                            spotlight.competition.tier.slug,
                            spotlight.competition.federation.slug,
                            {
                              location: spotlight.competition.location,
                              organizer: spotlight.competition.organizer,
                            },
                          )}
                        />
                        <header>
                          <h3>{spotlight.competition.tier.league.name}</h3>
                          <h4>
                            {toDashboardTeamTierLabel(
                              spotlight.competition.tier.slug,
                              spotlight.competition.tier.league.name,
                            )}
                          </h4>
                          <h5>
                            {t('shared.matchday')} {spotlight.round}
                          </h5>
                        </header>
                      </aside>
                      <Standings
                        compact
                        highlight={state.profile.teamId}
                        competitors={userGroupCompetitors}
                        matches={standingMatches}
                        teamLink={(team) => `/teams?teamId=${team.id}`}
                        title={
                          standings.competition.tier.league.slug ===
                          Constants.LeagueSlug.ESPORTS_LEAGUE
                            ? Constants.IdiomaticTier[standings.competition.tier.slug]
                            : `${t('shared.group')} ${Util.toAlpha(userTeam.group)}`
                        }
                        zones={
                          Util.shouldShowStandingsZones(standings.competition.status) &&
                          (standings.competition.tier.slug === Constants.TierSlug.LEAGUE_ADVANCED &&
                          standings.competition.federation.slug ===
                            Constants.FederationSlug.ESPORTS_OCE
                            ? [
                                [0, 0],
                                [1, 4],
                                [userGroupCompetitors.length, userGroupCompetitors.length],
                              ]
                            : Util.getTierZonesByGroup(
                                standings.competition.tier.slug as Constants.TierSlug,
                                standings.competition.federation.slug as Constants.FederationSlug,
                                new Set(
                                  standings.competition.competitors.map(
                                    (competitor) => competitor.group,
                                  ),
                                ).size,
                                standings.competition.tier.groupSize,
                              ))
                        }
                      />
                    </article>
                  );
                }

                if (standings.competition.tier.groupSize && !userTeam) {
                  return (
                    <article key="empty__standings_group" className="card h-32 rounded-none">
                      <aside className="card-body items-center justify-center">
                        <p className="grow-0">{t('main.dashboard.noStandings')}</p>
                      </aside>
                    </article>
                  );
                }

                return (
                  <article className="stack-y divide-base-content/10 !gap-0 divide-y">
                    <aside className="stack-x items-center px-2">
                      <Image
                        className="size-16"
                        src={Util.getCompetitionLogo(
                          spotlight.competition.tier.slug,
                          spotlight.competition.federation.slug,
                          {
                            location: spotlight.competition.location,
                            organizer: spotlight.competition.organizer,
                          },
                        )}
                      />
                      <header>
                        <h3>{spotlight.competition.tier.league.name}</h3>
                        <h4>
                          {toDashboardTeamTierLabel(
                            spotlight.competition.tier.slug,
                            spotlight.competition.tier.league.name,
                          )}
                        </h4>
                        <h5>{toDashboardRoundLabel(spotlight)}</h5>
                      </header>
                    </aside>
                    <aside className="grid grid-cols-2 place-items-center">
                      {standings.competitors.map((competitor) => (
                        <header
                          key={`${competitor.id}__cup_splotlight_header`}
                          className="heading w-full border-y-0! py-2! text-center"
                        >
                          <p>{competitor.team.name}</p>
                        </header>
                      ))}
                    </aside>
                    <aside className="grid grid-cols-2 place-items-center pb-2">
                      {standings.competitors.map((competitor) => (
                        <figure key={`${competitor.id}__cup_splotlight`} className="center">
                          <Image
                            title={competitor.team.name}
                            src={competitor.team.blazon}
                            className="size-32"
                          />
                        </figure>
                      ))}
                    </aside>
                    <aside className="text-center">
                      {Constants.TierSwissConfig[
                        standings.competition.tier.slug as Constants.TierSlug
                      ] ? (
                        <Link
                          className="btn btn-block rounded-none border-x-0"
                          to={`/competitions?federationId=${standings.competition.federationId}&season=${standings.competition.season}&tierId=${standings.competition.tier.id}`}
                        >
                          View Standings
                        </Link>
                      ) : (
                        <button
                          className="btn btn-block rounded-none border-x-0"
                          onClick={() => {
                            api.window.send<ModalRequest>(Constants.WindowIdentifier.Modal, {
                              target: '/brackets',
                              payload: standings.competitionId,
                            });
                          }}
                        >
                          {t('main.dashboard.viewBracket')}
                        </button>
                      )}
                    </aside>
                  </article>
                );
              })()}
          </section>
        </div>

        {/** RIGHT COLUMN */}
        <div className="stack-y gap-0!">
          <section className="divide-base-content/10 grid grid-cols-6 divide-x">
            {!state.working && (
              <button
                title={t('main.dashboard.advanceCalendar')}
                data-interaction-sound="none"
                className="day day-btn border-t-0"
                disabled={
                  !state.profile ||
                  state.working ||
                  isCalendarFaceitBlocked ||
                  (isMatchday && !isBenched)
                }
                onClick={async () => {
                  if (state.working || !state.profile || isCalendarFaceitBlocked) {
                    return;
                  }

                  if (!state.profile.teamId && !dismissedNoTeamAdvanceWarning) {
                    const profileData = await api.faceit.profile();

                    if (profileData.lifetime.matchesPlayed < 10) {
                      setNoTeamAdvanceWarningVisible(true);
                      return;
                    }
                  }

                  if (isMatchday && isBenched) {
                    audioClick();
                    api.calendar.sim().then(() => dispatch(calendarAdvance(1)));
                    return;
                  }

                  if (!isMatchday) {
                    audioClick();
                    dispatch(calendarAdvance());
                  }
                }}
              >
                <figure>
                  <FaForward />
                </figure>
              </button>
            )}
            {!!state.working && (
              <button
                title={t('main.dashboard.stopCalendar')}
                className="day day-btn btn-error! border-t-0"
                onClick={api.calendar.stop}
              >
                <figure>
                  <FaStop />
                </figure>
              </button>
            )}
            {!state.profile &&
              [...Array(5)].map((_, idx) => (
                <article
                  key={`${idx}__calendar_loading`}
                  className="day h-32 items-center justify-center border-t-0"
                >
                  <span className="loading loading-spinner loading-sm" />
                </article>
              ))}
            {!!state.profile &&
              [...Array(5)].map((_, idx) => {
                const today = addDays(state.profile.date, idx);
                const isActive = idx === 0;
                const entry = upcoming.find(
                  (match) => match.date.toISOString() === today.toISOString(),
                );
                const opponent = entry?.competitors?.find(
                  (competitor) => competitor.teamId !== state.profile.teamId,
                );

                const trainingAllowed =
                  differenceInDays(today, state.profile.trainedAt || state.profile.date) ===
                  Constants.Application.TRAINING_FREQUENCY;

                return (
                  <article
                    key={`${idx}__calendar`}
                    className={cx('day border-t-0', isActive && 'day-active')}
                  >
                    <figure>
                      {isActive && (
                        <React.Fragment>
                          <p>{format(today, 'MMM')}</p>
                          <p>{format(today, 'y')}</p>
                        </React.Fragment>
                      )}
                      {!isActive && opponent && (
                        <img src={opponent.team.blazon} title={opponent.team.name} />
                      )}
                      {!isActive && !opponent ? (
                        trainingAllowed ? (
                          <FaStopwatch />
                        ) : (
                          <FaCloudMoon />
                        )
                      ) : null}
                    </figure>
                    <aside>
                      <h2>{format(today, 'd')}</h2>
                      <p>
                        {isActive && format(today, 'E')}
                        {!isActive && opponent && t('main.dashboard.match')}
                        {!isActive && !opponent
                          ? trainingAllowed
                            ? t('shared.training')
                            : t('main.dashboard.rest')
                          : ''}
                      </p>
                    </aside>
                  </article>
                );
              })}
          </section>
          <section className="divide-base-content/10 flex divide-x">
            <aside className="w-2/3">
              {(() => {
                // placeholder while things are loading
                // or if there are no matches
                if (!spotlight) {
                  return (
                    <section className="card image-full card-sm h-80 flex-grow rounded-none before:rounded-none! before:opacity-50!">
                      <figure>
                        <Image
                          className="h-full w-full"
                          src={Util.convertMapPool('de_dust2', Constants.Game.CSGO, true)}
                        />
                      </figure>
                      <article className="card-body items-center justify-center">
                        {t('main.dashboard.noMatch')}
                      </article>
                    </section>
                  );
                }

                // the suffix is either the current position
                // or their league tier if it's a cup
                const disabled =
                  state.working || !isMatchday || isBenched || isActiveFaceitMatchroom;
                const spotlightCompetitors = spotlight.competitors.filter(
                  (competitor) => !!competitor?.team,
                );
                const [home, away] = spotlightCompetitors;

                if (!home || !away) {
                  return (
                    <section className="card image-full card-sm h-80 flex-grow rounded-none before:rounded-none! before:opacity-50!">
                      <figure>
                        <Image
                          className="h-full w-full"
                          src={Util.convertMapPool('de_dust2', Constants.Game.CSGO, true)}
                        />
                      </figure>
                      <article className="card-body items-center justify-center text-center">
                        {t('main.dashboard.noMatchScheduled')}
                      </article>
                    </section>
                  );
                }

                const spotlightGames = spotlight.games || [];
                const spotlightUsesVetoFlow = shouldUseVetoFlow(spotlight);
                const [homeHistorial, awayHistorial] = matchHistorial;
                const [homeWorldRanking, awayWorldRanking] = worldRankings;
                const [homeSuffix, awaySuffix] = [home, away].map((competitor) => {
                  if (!spotlight.competition.tier.groupSize || !userGroupCompetitors) {
                    return toDashboardTeamTierLabel(Constants.Prestige[competitor.team.tier]);
                  }

                  const idx = userGroupCompetitors.findIndex((a) => a.teamId === competitor.teamId);
                  if (idx === -1) {
                    return toDashboardTeamTierLabel(Constants.Prestige[competitor.team.tier]);
                  }

                  return Util.toOrdinalSuffix(idx + 1);
                });

                return (
                  <section className="card image-full card-sm h-80 flex-grow rounded-none before:rounded-none!">
                    {spotlight.status === Constants.MatchStatus.PLAYING && (
                      <figure className="center absolute top-2 left-1/2 z-10 -translate-x-1/2 gap-1 uppercase">
                        <article className="inline-grid *:[grid-area:1/1]">
                          <span className="status status-error animate-ping" />
                          <span className="status status-error" />
                        </article>
                        <span>
                          <strong>Live&nbsp;</strong>
                          <em>
                            (
                            {spotlight.competitors
                              .map((competitor) => competitor.score)
                              .join(' - ')}
                            )
                          </em>
                        </span>
                      </figure>
                    )}
                    <figure>
                      <DashboardMapBackground
                        className={cx(
                          'h-full w-full',
                          !spotlightUsesVetoFlow && 'team-dashboard-selected-map-background',
                        )}
                        maps={
                          spotlightVetoMaps.length
                            ? spotlightVetoMaps
                            : spotlightUsesVetoFlow
                              ? []
                              : [spotlightGames[0]?.map || 'de_dust2']
                        }
                        game={settings.general.game}
                      />
                    </figure>
                    <article className="card-body">
                      <header className="grid h-full grid-cols-3 place-items-center">
                        <aside className="stack-y items-center">
                          <img src={home.team.blazon} className="h-24 w-auto" />
                          <Historial matches={homeHistorial} teamId={home.teamId} />
                          <div className="text-center">
                            <p>
                              {home.team.name}&nbsp;
                              <small title={t('shared.worldRanking')}>
                                (#{homeWorldRanking || 0})
                              </small>
                            </p>
                            <p>
                              <small>{homeSuffix}</small>
                            </p>
                          </div>
                        </aside>
                        <aside className="center h-full gap-4">
                          <Image
                            title={Util.getCompetitionDisplayName(
                              spotlight.competition.tier.league.name,
                              spotlight.competition.tier.slug,
                            )}
                            className="size-24"
                            src={Util.getCompetitionLogo(
                              spotlight.competition.tier.slug,
                              spotlight.competition.federation.slug,
                              {
                                location: spotlight.competition.location,
                                organizer: spotlight.competition.organizer,
                              },
                            )}
                          />
                          <p>
                            <em>{format(spotlight.date, 'PPPP')}</em>
                          </p>
                          <ul>
                            <li className="stack-x items-center">
                              <FaMapSigns />
                              <span>
                                {spotlightUsesVetoFlow
                                  ? 'Map veto'
                                  : Util.convertMapPool(
                                      spotlightGames[0]?.map || 'de_dust2',
                                      settings.general.game,
                                    )}
                              </span>
                            </li>
                            <li className="stack-x items-center">
                              <FaCalendarDay />
                              <span>{toDashboardRoundLabel(spotlight)}</span>
                            </li>
                            <li className="stack-x items-center">
                              <FaStream />
                              <span>
                                {t('shared.bestOf')}&nbsp;
                                {spotlightGames.length || 1}
                              </span>
                            </li>
                          </ul>
                        </aside>
                        <aside className="stack-y items-center">
                          <img src={away.team.blazon} className="h-24 w-auto" />
                          <Historial matches={awayHistorial} teamId={away.teamId} />
                          <div className="text-center">
                            <p>
                              {away.team.name}&nbsp;
                              <small title="World Ranking">(#{awayWorldRanking || 0})</small>
                            </p>
                            <p>
                              <small>{awaySuffix}</small>
                            </p>
                          </div>
                        </aside>
                      </header>
                      <footer className="join justify-center">
                        <button
                          data-interaction-sound="none"
                          className="btn btn-primary join-item btn-wide"
                          disabled={disabled}
                          onClick={() => {
                            if (isActiveFaceitMatchroom) {
                              return;
                            }

                            audioClick();
                            api.window.send<ModalRequest>(Constants.WindowIdentifier.Modal, {
                              target: '/pregame',
                              payload: spotlight.id,
                            });
                          }}
                        >
                          {t('main.dashboard.play')}
                        </button>
                      </footer>
                    </article>
                  </section>
                );
              })()}
            </aside>
            <aside className="w-1/3">
              <header className="heading prose max-w-none border-t-0!">
                <h2>Recent Transfers</h2>
              </header>
              <table className="table table-fixed">
                <tbody>
                  {transfers.slice(0, NUM_PREVIOUS).map((transfer) => {
                    const isContractExpiry = transfer.status === Constants.TransferStatus.EXPIRED;
                    const isFreeAgentSigning = isFreeAgentTransfer(transfer);
                    const destinationTeam = isContractExpiry ? transfer.from : transfer.to;
                    const isNoTeam =
                      isFreeAgentSigning ||
                      !destinationTeam ||
                      destinationTeam.id == null ||
                      destinationTeam.name?.toLowerCase() === 'no team' ||
                      destinationTeam.blazon?.includes('noteam.svg');

                    return (
                      <tr key={`${transfer.id}__transfer_recent`}>
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
                        <td className="p-0 text-center">
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
                    <tr key={`${idx}__filler_transfer_recent`} className="text-muted">
                      <td className="text-center">-</td>
                      <td className="text-center">&rarr;</td>
                      <td className="text-center">-</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </aside>
          </section>
          <section className="divide-base-content/10 grid grid-cols-2 divide-x">
            {((!!spotlight && spotlight.competitors) || [...Array(2)]).map(
              (competitor, competitorIdx) => {
                const teamId = competitor?.teamId;
                const matches = competitor ? matchHistorial[competitorIdx] || [] : [];
                const previousFiller = [...Array(Math.max(0, NUM_PREVIOUS - matches.length))];
                return (
                  <article
                    key={`${competitor?.id}_${competitorIdx}__match_previous`}
                    className="stack-y gap-0!"
                  >
                    <header className="prose">
                      <h4 className="truncate">
                        {competitor?.team?.name}&nbsp;
                        {t('main.dashboard.headerRecentMatches')}
                      </h4>
                    </header>
                    <table className="table table-fixed">
                      <tbody>
                        {!!matches.length &&
                          matches.slice(0, NUM_PREVIOUS).map((match) => {
                            const opponent = match.competitors.find(
                              (c) => teamId != null && c.teamId !== teamId,
                            );
                            const result = match.competitors.find(
                              (c) => teamId != null && c.teamId === teamId,
                            )?.result;
                            const onClick =
                              match._count.events > 0
                                ? () =>
                                    api.window.send<ModalRequest>(
                                      Constants.WindowIdentifier.Modal,
                                      {
                                        target: '/postgame',
                                        payload: match.id,
                                      },
                                    )
                                : null;

                            return (
                              <tr
                                key={`${match.id}__match_previous`}
                                onClick={onClick}
                                className={cx(onClick && 'hover:bg-base-content/10 cursor-pointer')}
                              >
                                <td
                                  className={cx('w-1/12', !onClick && 'text-muted')}
                                  title={
                                    onClick
                                      ? t('shared.viewMatchDetails')
                                      : t('shared.noMatchDetails')
                                  }
                                >
                                  <FaChartBar />
                                </td>
                                <td className="w-1/12" title={format(match.date, 'PPPP')}>
                                  {fmtShortDate(match.date)}
                                </td>
                                <td
                                  className={cx(
                                    'w-3/12 text-center',
                                    Util.getResultTextColor(result),
                                  )}
                                >
                                  {match.competitors
                                    .map((competitor) => competitor.score)
                                    .join(' : ') || '-'}
                                </td>
                                <td className="w-4/12 truncate" title={opponent?.team?.name || '-'}>
                                  {!!opponent?.team && (
                                    <img
                                      className="mr-2 inline-block size-4"
                                      src={
                                        opponent?.team?.blazon || 'resources://blazonry/009400.png'
                                      }
                                    />
                                  )}
                                  <span>{opponent?.team?.name || 'BYE'}</span>
                                </td>
                                <td
                                  className="w-3/12 truncate"
                                  title={toDashboardMatchCompetitionLabel(match)}
                                >
                                  {toDashboardMatchCompetitionLabel(match)}
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
                                      !matches.length
                                        ? state.profile.date
                                        : matches.slice(-1)[0].date,
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
                  </article>
                );
              },
            )}
          </section>
        </div>
      </main>
      {noTeamAdvanceWarningVisible && (
        <section className="bg-base-300/80 fixed inset-0 z-50 flex items-center justify-center p-6 backdrop-blur-sm">
          <article className="bg-base-100 border-base-content/10 max-w-lg border p-6 shadow-2xl">
            <header className="stack-y mb-6">
              <div className="flex items-center gap-3">
                <FaExclamationTriangle className="text-warning size-8 shrink-0" />
                <p className="text-lg font-bold">Are you sure you want to advance the calendar?</p>
              </div>
              <p>You have not found a team to compete with yet!</p>
              <p>Play FACEIT to get a team's attention.</p>
            </header>
            <footer className="flex justify-end gap-2">
              <button
                type="button"
                data-interaction-sound="back"
                className="btn btn-primary"
                onClick={() => {
                  setDismissedNoTeamAdvanceWarning(true);
                  setNoTeamAdvanceWarningVisible(false);
                }}
              >
                OK
              </button>
            </footer>
          </article>
        </section>
      )}
      {playErrorPromptVisible && (
        <section className="bg-base-300/80 fixed inset-0 z-50 flex items-center justify-center p-6 backdrop-blur-sm">
          <article className="bg-base-100 border-base-content/10 max-w-lg border p-6 shadow-2xl">
            <header className="stack-y mb-6">
              <div className="flex items-center gap-3">
                <FaExclamationTriangle className="text-warning size-8 shrink-0" />
                <p className="text-lg font-bold">
                  {t(
                    playErrorIsInvalidGamePath
                      ? 'main.dashboard.gamePathInvalidTitle'
                      : 'main.dashboard.matchAbandonedTitle',
                  )}
                </p>
              </div>
              <p>
                {t(
                  playErrorIsInvalidGamePath
                    ? 'main.dashboard.gamePathInvalid'
                    : 'main.dashboard.matchAbandonedSubtitle',
                )}
              </p>
              {playErrorIsInvalidGamePath && !!playError.path && (
                <p className="bg-base-200 truncate p-2 text-sm" title={playError.path}>
                  {playError.path}
                </p>
              )}
            </header>
            <footer className="flex justify-end gap-2">
              <button
                type="button"
                data-interaction-sound="back"
                className="btn"
                onClick={() => dispatch(playErrorUpdate(null))}
              >
                OK
              </button>
              {playErrorIsInvalidGamePath && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    dispatch(playErrorUpdate(null));
                    api.window.send<ModalRequest>(Constants.WindowIdentifier.Modal, {
                      target: '/settings',
                    });
                  }}
                >
                  {t('main.dashboard.openSettings')}
                </button>
              )}
            </footer>
          </article>
        </section>
      )}
    </div>
  );
}
