/**
 * The pregame modal allows users to handle map veto
 * or manage their squad before starting their match.
 *
 * @module
 */
import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { differenceBy, random, sample } from 'lodash';
import { Constants, Eagers, Util } from '@liga/shared';
import { cx } from '@liga/frontend/lib';
import { AppStateContext } from '@liga/frontend/redux';
import { useTranslation } from '@liga/frontend/hooks';
import { Image, PlayerCard } from '@liga/frontend/components';

/** @enum */
enum Tab {
  MAPS,
  SQUADS,
}

/** @interface */
type MapVetoAction = {
  teamId?: number | null;
  type: Constants.MapVetoAction;
  map: string;
};

type HistoricalMatch = {
  games: Array<{
    map: string;
    teams: Array<{
      teamId: number | null;
      result: number | null;
    }>;
  }>;
};

type MapPerformance = {
  played: number;
  wins: number;
};

/** @type {Matches} */
type Matches<T = typeof Eagers.match> = Awaited<ReturnType<typeof api.matches.all<T>>>;

/** @constant */
const CPU_THINKING_TIME_MAX = 3000;

/** @constant */
const CPU_THINKING_TIME_MIN = 1000;

/** @constant */
const MAP_WINRATE_PRIOR_GAMES = 4;

/** @constant */
const MAP_RANDOMNESS = 0.35;

const ARENA_MODE_TIER_SLUGS = new Set<string>([
  Constants.TierSlug.MAJOR_CHAMPIONS_STAGE,
  Constants.TierSlug.BLAST_FINALS,
  Constants.TierSlug.IEM_COLOGNE_PLAYOFFS,
  Constants.TierSlug.IEM_KRAKOW_PLAYOFFS,
  Constants.TierSlug.LEAGUE_PRO_PLAYOFFS,
  Constants.TierSlug.ESL_CHALLENGER_PLAYOFFS,
  Constants.TierSlug.CCT_GLOBAL_FINALS,
]);

function isArenaModeMatch(match?: Matches[number]) {
  const tierSlug = match?.competition?.tier?.slug;
  return Boolean(tierSlug && ARENA_MODE_TIER_SLUGS.has(tierSlug));
}

/** @constants */
const VETO_STYLES = {
  badge: {
    [Constants.MapVetoAction.BAN]: 'badge-error',
    [Constants.MapVetoAction.DECIDER]: 'badge-warning',
    [Constants.MapVetoAction.PICK]: 'badge-success',
  },
  border: {
    [Constants.MapVetoAction.BAN]: 'border-error shadow-error',
    [Constants.MapVetoAction.DECIDER]: 'border-warning shadow-warning',
    [Constants.MapVetoAction.PICK]: 'border-success shadow-success',
  },
};

function getMapPerformance(matches: Array<HistoricalMatch>, teamId?: number | null) {
  const performances: Record<string, MapPerformance> = {};

  if (!teamId) {
    return performances;
  }

  matches.forEach((historicalMatch) => {
    historicalMatch.games.forEach((historicalGame) => {
      const teamResult = historicalGame.teams.find((team) => team.teamId === teamId);

      if (!teamResult || teamResult.result == null) {
        return;
      }

      const performance = performances[historicalGame.map] || { played: 0, wins: 0 };

      performance.played += 1;
      performance.wins +=
        teamResult.result === Constants.MatchResult.WIN
          ? 1
          : teamResult.result === Constants.MatchResult.DRAW
            ? 0.5
            : 0;

      performances[historicalGame.map] = performance;
    });
  });

  return performances;
}

function getMapStrength(performance?: MapPerformance) {
  const played = performance?.played || 0;
  const wins = performance?.wins || 0;
  const adjustedWinRate =
    (wins + MAP_WINRATE_PRIOR_GAMES * 0.5) / (played + MAP_WINRATE_PRIOR_GAMES);
  const confidence = 1 - Math.exp(-played / 4);

  return adjustedWinRate * 0.78 + confidence * 0.22;
}

function getMapWeakness(performance?: MapPerformance) {
  const played = performance?.played || 0;
  const lowSampleBonus = Math.exp(-played / 3);

  return (1 - getMapStrength(performance)) * 0.8 + lowSampleBonus * 0.2;
}

function weightedMapSample(
  maps: Array<string>,
  getWeight: (map: string) => number,
  fallback?: string,
) {
  const weights = maps.map((map) => {
    const weight = Math.max(0.01, getWeight(map));
    return weight * (1 - MAP_RANDOMNESS + Math.random() * MAP_RANDOMNESS * 2);
  });
  const total = weights.reduce((sum, weight) => sum + weight, 0);

  if (!maps.length || total <= 0) {
    return fallback;
  }

  let cursor = Math.random() * total;

  for (let i = 0; i < maps.length; i += 1) {
    cursor -= weights[i];

    if (cursor <= 0) {
      return maps[i];
    }
  }

  return maps[maps.length - 1];
}

/**
 * Exports this module.
 *
 * @exports
 */
export default function () {
  const location = useLocation();
  const navigate = useNavigate();
  const t = useTranslation('windows');
  const { state } = React.useContext(AppStateContext);
  const [activeTab, setActiveTab] = React.useState<Tab>(Tab.MAPS);
  const [match, setMatch] = React.useState<Matches[number]>();
  const [userSquad, setUserSquad] = React.useState<
    Awaited<ReturnType<typeof api.squad.all<typeof Eagers.player>>>
  >([]);
  const [vetoHistory, setVetoHistory] = React.useState<Array<MapVetoAction>>([]);
  const [working, setWorking] = React.useState(false);
  const [mapPool, setMapPool] = React.useState<Awaited<ReturnType<typeof api.mapPool.find>>>([]);
  const [historicalMatches, setHistoricalMatches] = React.useState<Array<HistoricalMatch>>([]);
  const [historicalMatchesLoaded, setHistoricalMatchesLoaded] = React.useState(false);
  const [arenaModePromptVisible, setArenaModePromptVisible] = React.useState(false);

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

    api.mapPool
      .find({
        where: {
          gameVersion: {
            slug: settingsAll.general.game,
          },
          position: {
            not: null,
          },
        },
      })
      .then(setMapPool);
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
  const isIgl = React.useMemo(
    () => state.profile?.player?.role === Constants.UserRole.IGL,
    [state.profile],
  );
  const mapPerformance = React.useMemo(
    () => getMapPerformance(historicalMatches, state.profile?.teamId),
    [historicalMatches, state.profile?.teamId],
  );

  React.useEffect(() => {
    if (!state.profile?.teamId || !match) {
      return;
    }

    setHistoricalMatchesLoaded(false);
    api.matches
      .all({
        where: {
          id: {
            not: match.id,
          },
          matchType: 'LEAGUE',
          status: Constants.MatchStatus.COMPLETED,
          competitors: {
            some: {
              teamId: state.profile.teamId,
            },
          },
        },
        include: {
          games: {
            include: {
              teams: true,
            },
          },
        },
      })
      .then((matches) => setHistoricalMatches(matches as Array<HistoricalMatch>))
      .finally(() => setHistoricalMatchesLoaded(true));
  }, [match, state.profile?.teamId]);

  // load map veto info
  React.useEffect(() => {
    if (!match?.id) {
      return;
    }

    api.match.findVetoList(match.id).then((vetoes) => {
      if (!vetoes.length) {
        return;
      }

      setVetoHistory(
        vetoes.map((veto) => ({
          type: veto.type as Constants.MapVetoAction,
          map: veto.map,
          teamId: veto.teamId,
        })),
      );
    });
  }, [match?.id]);

  const vetoMapList = React.useMemo(
    () =>
      vetoHistory.filter((item) =>
        [Constants.MapVetoAction.DECIDER, Constants.MapVetoAction.PICK].includes(item.type),
      ),
    [vetoHistory],
  );
  const vetoSequence = React.useMemo(() => {
    if (!match) {
      return [];
    }

    // best-of-one veto runs as alternating bans until one map is left.
    if (match.games.length === 1) {
      return Array.from({ length: Math.max(0, mapPool.length - 1) }, (_, idx) => ({
        team: idx % 2,
        type: Constants.MapVetoAction.BAN,
      }));
    }

    return Constants.MapVetoConfig[match.games.length] || [];
  }, [mapPool.length, match]);
  const vetoSequenceComplete = React.useMemo(
    () => match && vetoMapList.length >= match.games.length,
    [match, vetoHistory, vetoSequence],
  );
  const vetoSequenceStep = React.useMemo(
    () => vetoSequence[vetoHistory.length],
    [vetoHistory, vetoSequence],
  );

  // handle map veto selections
  const onVetoSelection = (map: string) => {
    if (!vetoSequenceStep) {
      return setVetoHistory([
        ...vetoHistory,
        {
          type: Constants.MapVetoAction.DECIDER,
          map,
        },
      ]);
    }
    setVetoHistory([
      ...vetoHistory,
      {
        teamId: match.competitors[vetoSequenceStep.team].team.id,
        type: vetoSequenceStep.type,
        map,
      },
    ]);
  };

  // handle when cpu makes their map veto
  const cpu = React.useMemo(
    () =>
      !!match && match.competitors.find((competitor) => competitor.teamId !== state.profile.teamId),
    [match, state],
  );
  const cpuIdx = React.useMemo(
    () => !!match && !!cpu && match.competitors.findIndex((competitor) => competitor.id === cpu.id),
    [match, cpu],
  );
  const userCompetitorIdx = React.useMemo(
    () =>
      !!match &&
      match.competitors.findIndex((competitor) => competitor.teamId === state.profile.teamId),
    [match, state.profile.teamId],
  );
  const cpuPool = React.useMemo(
    () =>
      mapPool
        .filter((map) => vetoHistory.every((item) => item.map !== map.gameMap.name))
        .map((map) => map.gameMap.name),
    [mapPool, vetoHistory],
  );
  const previewMap = React.useMemo(() => {
    if (vetoMapList.length > 0) {
      return vetoMapList[0].map;
    }

    // In BO1, don't reveal a league-preselected map in pregame.
    // Show the last unvetoed map (if available) while veto is in progress.
    if (match?.games.length === 1 && cpuPool.length === 1) {
      return cpuPool[0];
    }

    return mapPool[0]?.gameMap.name || game?.map;
  }, [cpuPool, game?.map, mapPool, match?.games.length, vetoMapList]);
  const selectAutomatedVetoMap = React.useCallback(
    (teamIdx?: number | false, type?: Constants.MapVetoAction) => {
      if (!match) {
        return sample(cpuPool);
      }

      const isUserTeamTurn = teamIdx === userCompetitorIdx;
      const getPerformance = (map: string) => mapPerformance[map];

      if (isUserTeamTurn && type === Constants.MapVetoAction.PICK) {
        return weightedMapSample(
          cpuPool,
          (map) => getMapStrength(getPerformance(map)),
          sample(cpuPool),
        );
      }

      if (isUserTeamTurn && type === Constants.MapVetoAction.BAN) {
        return weightedMapSample(
          cpuPool,
          (map) => getMapWeakness(getPerformance(map)),
          sample(cpuPool),
        );
      }

      if (!isUserTeamTurn && type === Constants.MapVetoAction.BAN) {
        return weightedMapSample(
          cpuPool,
          (map) => getMapStrength(getPerformance(map)),
          sample(cpuPool),
        );
      }

      if (!isUserTeamTurn && type === Constants.MapVetoAction.PICK) {
        return weightedMapSample(
          cpuPool,
          (map) => getMapWeakness(getPerformance(map)),
          sample(cpuPool),
        );
      }

      return weightedMapSample(cpuPool, () => 1, sample(cpuPool));
    },
    [cpuPool, mapPerformance, match, userCompetitorIdx],
  );

  const startMatch = React.useCallback(() => {
    if (!match) {
      return;
    }

    setWorking(true);

    Promise.all([
      api.match.updateMapList(
        match.id,
        vetoMapList.map((item) => item.map),
      ),
      api.match.updateVetoList(match.id, vetoMapList),
    ]).then(() => {
      setWorking(false);
      api.window.send(Constants.WindowIdentifier.Main, match.id, null);
      api.window.close(Constants.WindowIdentifier.Modal);
    });
  }, [match, vetoMapList]);

  const savePregameState = React.useCallback(async () => {
    if (!match) {
      return;
    }

    await Promise.all([
      api.match.updateMapList(
        match.id,
        vetoMapList.map((item) => item.map),
      ),
      api.match.updateVetoList(match.id, vetoHistory),
    ]);
  }, [match, vetoHistory, vetoMapList]);

  const onPlay = React.useCallback(async () => {
    if (!match) {
      return;
    }

    if (!isArenaModeMatch(match)) {
      startMatch();
      return;
    }

    const settings = Util.loadSettings(state.profile.settings);
    const arenaModeStatus = await api.app.arenaModeStatus(settings);
    const arenaModeReady =
      settings.arenaMode.enabled &&
      arenaModeStatus.installed &&
      arenaModeStatus.equalizerApoInstalled &&
      arenaModeStatus.valhallaSupermassiveInstalled;

    if (arenaModeReady) {
      startMatch();
      return;
    }

    setArenaModePromptVisible(true);
  }, [match, startMatch, state.profile.settings]);

  React.useEffect(() => {
    const isCpuTurn = !!vetoSequenceStep && vetoSequenceStep.team === cpuIdx;
    const isUserAutomatedTurn =
      !!vetoSequenceStep && vetoSequenceStep.team === userCompetitorIdx && !isIgl;

    if ((!isCpuTurn && !isUserAutomatedTurn) || !historicalMatchesLoaded) {
      return;
    }

    setWorking(true);

    const timeout = setTimeout(
      () => {
        onVetoSelection(selectAutomatedVetoMap(vetoSequenceStep.team, vetoSequenceStep.type));
        setWorking(false);
      },
      random(CPU_THINKING_TIME_MIN, CPU_THINKING_TIME_MAX),
    );

    return () => clearTimeout(timeout);
  }, [
    cpuIdx,
    historicalMatchesLoaded,
    isIgl,
    selectAutomatedVetoMap,
    userCompetitorIdx,
    vetoSequenceStep,
  ]);

  // figure out the decider
  React.useEffect(() => {
    if (!match || vetoSequenceComplete || vetoSequenceStep || !historicalMatchesLoaded) {
      return;
    }

    setWorking(true);

    const timeout = setTimeout(
      () => {
        onVetoSelection(selectAutomatedVetoMap());
        setWorking(false);
      },
      random(CPU_THINKING_TIME_MIN, CPU_THINKING_TIME_MAX),
    );

    return () => clearTimeout(timeout);
  }, [
    historicalMatchesLoaded,
    match,
    selectAutomatedVetoMap,
    vetoSequenceComplete,
    vetoSequenceStep,
  ]);

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
            {match.competition.tier.groupSize
              ? `${t('shared.matchday')} ${match.round}`
              : Constants.TierSwissConfig[match.competition.tier.slug as Constants.TierSlug]
                ? Util.parseSwissRound(match.round)
                : Util.parseCupRounds(match.round, match.totalRounds)}
          </li>
          <li>
            {t('shared.bestOf')}&nbsp;
            {match.games.length}
          </li>
        </ul>
      </header>
      <section className="card image-full h-16 rounded-none drop-shadow-md before:rounded-none!">
        <figure>
          <Image
            className="h-full w-full"
            src={Util.convertMapPool(previewMap || game.map, settingsAll.general.game, true)}
          />
        </figure>
        <header className="card-body grid grid-cols-3 place-items-center p-0">
          <article className="grid w-full grid-cols-2 place-items-center font-black">
            <img src={home.team.blazon} className="size-8" />
            <p>{home.team.name}</p>
          </article>
          <article className="center text-2xl font-bold">
            <p>vs</p>
          </article>
          <article className="grid w-full grid-cols-2 place-items-center font-black">
            <p>{away.team.name}</p>
            <img src={away.team.blazon} className="size-8" />
          </article>
        </header>
      </section>
      <section
        role="tablist"
        className="tabs-box tabs border-base-content/10 tabs-xs rounded-none border-y"
      >
        {Object.keys(Tab)
          .filter((tabKey) => isNaN(Number(tabKey)))
          .map((tabKey: keyof typeof Tab) => (
            <a
              key={tabKey + '__tab'}
              role="tab"
              className={cx('tab capitalize', Tab[tabKey] === activeTab && 'tab-active')}
              onClick={() => setActiveTab(Tab[tabKey])}
            >
              {tabKey.replace('_', ' ').toLowerCase()}
            </a>
          ))}
      </section>
      {activeTab === Tab.MAPS && (
        <section className="flex flex-1 flex-col gap-1 overflow-y-scroll">
          <p className="p-2">
            {!!vetoSequenceStep && (
              <React.Fragment>
                <span className="loading loading-dots loading-sm"></span>
                {vetoSequenceStep.team === userCompetitorIdx && isIgl ? (
                  <span>
                    &nbsp;Your turn to <strong>{vetoSequenceStep.type.toUpperCase()}</strong> a map.
                  </span>
                ) : (
                  <span>
                    &nbsp;Waiting on {match.competitors[vetoSequenceStep.team].team.name} to{' '}
                    <strong>{vetoSequenceStep.type.toUpperCase()}</strong> a map...
                  </span>
                )}
              </React.Fragment>
            )}
            {!vetoSequenceComplete && !vetoSequenceStep && (
              <React.Fragment>
                <span className="loading loading-dots loading-sm"></span>
                <span>&nbsp;Picking decider...</span>
              </React.Fragment>
            )}
            {!!vetoSequenceComplete && (
              <React.Fragment>
                <span>Map veto process completed.&nbsp;</span>
                <em>Good luck and have fun!</em>
              </React.Fragment>
            )}
          </p>
          <article
            className="grid h-full flex-1 grid-cols-11 gap-2"
            style={{
              gridTemplateColumns: `repeat(${mapPool.length}, minmax(0, 1fr))`,
            }}
          >
            {mapPool.map((map) => {
              const picked = vetoHistory.find((item) => item.map === map.gameMap.name);
              const competitor =
                picked && match.competitors.find((entry) => entry.teamId === picked.teamId);
              const isUsersTurn = !!vetoSequenceStep && vetoSequenceStep.team === userCompetitorIdx;
              const canPick = !picked && !vetoSequenceComplete && !working && isUsersTurn && isIgl;

              return (
                <figure key={map.gameMap.name} className="relative h-full w-full">
                  <Image
                    title={Util.convertMapPool(map.gameMap.name, settingsAll.general.game)}
                    src={Util.convertMapPool(map.gameMap.name, settingsAll.general.game, true)}
                    onClick={() => canPick && onVetoSelection(map.gameMap.name)}
                    className={cx(
                      'h-full border object-cover shadow-md',
                      canPick && 'cursor-pointer',
                      picked
                        ? VETO_STYLES.border[picked.type as Constants.MapVetoAction]
                        : 'border-base-content/50 shadow-base-content/50',
                    )}
                  />
                  {!!picked && (
                    <React.Fragment>
                      <span
                        className={cx(
                          'badge badge-xs absolute top-2 left-1/2 -translate-x-1/2',
                          VETO_STYLES.badge[picked.type as Constants.MapVetoAction],
                        )}
                      >
                        {picked.type.toUpperCase()}
                      </span>
                      {!!competitor && (
                        <Image src={competitor.team.blazon} className="absolute bottom-0 size-16" />
                      )}
                    </React.Fragment>
                  )}
                </figure>
              );
            })}
          </article>
        </section>
      )}
      {activeTab === Tab.SQUADS && (
        <section className="divide-base-content/10 grid flex-1 grid-cols-2 items-start divide-x overflow-y-scroll">
          {match.competitors.map((competitor) => {
            const isUserTeam = competitor.teamId === state.profile.teamId;
            const team = competitor.team;

            // wire user's squad which can be changed
            // on-the-fly to this competitor's squad
            if (isUserTeam) {
              team.players = team.players.map((player) => {
                const entry = userSquad.find((u) => u.id === player.id);

                // transferListed players can never be starters
                const starter = player.transferListed
                  ? false
                  : entry
                    ? entry.starter
                    : player.starter;

                return {
                  ...player,
                  starter,
                };
              });
            }

            const starters = Util.getSquad(team, state.profile, isUserTeam);
            const bench = differenceBy(team.players, starters, 'id');
            const squad = { starters, bench };

            return (
              <table key={competitor.id + '__competitor'} className="table-xs table table-fixed">
                {Object.keys(squad).map((key) => (
                  <React.Fragment key={key}>
                    <thead>
                      <tr>
                        <th>{key.toUpperCase()}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {squad[key as keyof typeof squad].map((player) => (
                        <tr key={player.id + '__squad'}>
                          <td
                            title={
                              player.id === state.profile.playerId ? t('shared.you') : undefined
                            }
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
                              noStats={false}
                              onClickStarter={
                                isUserTeam &&
                                !player.transferListed &&
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
      )}
      {arenaModePromptVisible && (
        <section className="bg-base-300/80 fixed inset-0 z-50 flex items-center justify-center p-6 backdrop-blur-sm">
          <article className="bg-base-100 border-base-content/10 max-w-lg border p-6 shadow-2xl">
            <header className="stack-y mb-6">
              <p className="text-lg font-bold">Arena Mode is turned off</p>
              <p>
                This playoff match supports Arena Mode. It adds arena reverb and crowd noise for
                maximum immersion, and it is strongly recommended to be turned on before playing.
              </p>
              <p>
                Enable Arena Mode by installing it in the Game Settings tab.
              </p>
            </header>
            <footer className="flex justify-end gap-2">
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setArenaModePromptVisible(false);
                  startMatch();
                }}
              >
                Continue without Arena Mode
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={async () => {
                  await savePregameState();
                  navigate('/settings', {
                    state: { tab: 'game-settings', returnToPlayMatchId: match.id },
                  });
                }}
              >
                Go to settings
              </button>
            </footer>
          </article>
        </section>
      )}

      <button
        className="btn btn-xl btn-block btn-secondary rounded-none active:translate-0!"
        disabled={!vetoSequenceComplete}
        onClick={onPlay}
      >
        {t('main.dashboard.play')}
      </button>
    </main>
  );
}
