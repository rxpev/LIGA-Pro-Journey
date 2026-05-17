/**
 * The pregame modal allows users to handle map veto
 * or manage their squad before starting their match.
 *
 * @module
 */
import React from 'react';
import { useLocation } from 'react-router-dom';
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

/** @type {Matches} */
type Matches<T = typeof Eagers.match> = Awaited<ReturnType<typeof api.matches.all<T>>>;

/** @constant */
const CPU_THINKING_TIME_MAX = 3000;

/** @constant */
const CPU_THINKING_TIME_MIN = 1000;

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

/**
 * Exports this module.
 *
 * @exports
 */
export default function () {
  const location = useLocation();
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

  // load map veto info
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
  React.useEffect(() => {
    const isCpuTurn = !!vetoSequenceStep && vetoSequenceStep.team === cpuIdx;
    const isUserAutomatedTurn =
      !!vetoSequenceStep && vetoSequenceStep.team === userCompetitorIdx && !isIgl;

    if (!isCpuTurn && !isUserAutomatedTurn) {
      return;
    }

    setWorking(true);

    const timeout = setTimeout(
      () => {
        onVetoSelection(sample(cpuPool));
        setWorking(false);
      },
      random(CPU_THINKING_TIME_MIN, CPU_THINKING_TIME_MAX),
    );

    return () => clearTimeout(timeout);
  }, [cpuIdx, cpuPool, isIgl, userCompetitorIdx, vetoSequenceStep]);

  // figure out the decider
  React.useEffect(() => {
    if (!match || vetoSequenceComplete || vetoSequenceStep) {
      return;
    }

    setWorking(true);

    const timeout = setTimeout(
      () => {
        onVetoSelection(sample(cpuPool));
        setWorking(false);
      },
      random(CPU_THINKING_TIME_MIN, CPU_THINKING_TIME_MAX),
    );

    return () => clearTimeout(timeout);
  }, [cpuPool, match, vetoSequenceComplete, vetoSequenceStep]);

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

      <button
        className="btn btn-xl btn-block btn-secondary rounded-none active:translate-0!"
        disabled={!vetoSequenceComplete}
        onClick={() => {
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
        }}
      >
        {t('main.dashboard.play')}
      </button>
    </main>
  );
}
