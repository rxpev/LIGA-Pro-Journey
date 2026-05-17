/**
 * The pregame modal allows users to manage their squad
 * before starting their match.
 *
 * @module
 */
import React from 'react';
import { useLocation } from 'react-router-dom';
import { differenceBy } from 'lodash';
import { Constants, Eagers, Util } from '@liga/shared';
import { cx } from '@liga/frontend/lib';
import { AppStateContext } from '@liga/frontend/redux';
import { useTranslation } from '@liga/frontend/hooks';
import { Image, PlayerCard } from '@liga/frontend/components';

/** @type {Matches} */
type Matches<T = typeof Eagers.match> = Awaited<ReturnType<typeof api.matches.all<T>>>;

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
      <section className="card image-full h-16 rounded-none drop-shadow-md before:rounded-none!">
        <figure>
          <Image
            className="h-full w-full"
            src={Util.convertMapPool(game.map, settingsAll.general.game, true)}
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
