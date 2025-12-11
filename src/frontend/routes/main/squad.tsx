/**
 * Hub for managing the team squad.
 *
 * @module
 */
import React from 'react';
import { format } from 'date-fns';
import { Constants, Eagers, Util } from '@liga/shared';
import { AppStateContext } from '@liga/frontend/redux';
import { useTranslation } from '@liga/frontend/hooks';
import { Image, PlayerCard } from '@liga/frontend/components';

/**
 * Format contract end timestamp (ms since epoch) using app date format.
 */
function formatContractEnd(contractEnd?: number | null) {
  if (!contractEnd) return '-';

  const date = new Date(contractEnd);
  if (Number.isNaN(date.getTime())) return '-';

  return format(date, Constants.Application.CALENDAR_DATE_FORMAT);
}

/**
 * Exports this module.
 *
 * @exports
 */
export default function () {
  const t = useTranslation('windows');
  const { state } = React.useContext(AppStateContext);
  const [settings, setSettings] = React.useState(Constants.Settings);
  const [squad, setSquad] = React.useState<
    Awaited<ReturnType<typeof api.squad.all<typeof Eagers.player>>>
  >([]);

  // fetch data on first load
  React.useEffect(() => {
    // Skip all team related fetches if player is teamless
    if (!state.profile?.team) return;

    api.squad.all().then(setSquad);
  }, [state.profile?.team]);

  // load settings
  React.useEffect(() => {
    if (!state.profile) {
      return;
    }

    setSettings(Util.loadSettings(state.profile.settings));
  }, [state.profile]);

  const starters = React.useMemo(() => squad.filter((player) => player.starter), [squad]);
  const transferListed = React.useMemo(
    () => squad.filter((player) => player.transferListed),
    [squad],
  );

  // Players to show as cards:
  // - exclude transfer-listed players
  // - include the user
  // - user card first
  const visibleSquad = React.useMemo(() => {
    if (!state.profile?.player) {
      return squad.filter((p) => !p.transferListed);
    }

    const userId = state.profile.player.id;
    const me = squad.find((p) => p.id === userId && !p.transferListed);
    const others = squad.filter((p) => p.id !== userId && !p.transferListed);

    return me ? [me, ...others] : others;
  }, [squad, state.profile?.player]);

  // Teamless Player Career view
  if (!state.profile?.team) {
    const player = state.profile?.player;

    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-8 text-center">
        {/* Teamless blazonry */}
        <div className="relative">
          <Image
            src="resources://blazonry/009399.svg"
            className="h-40 w-40 rounded-full border-4 border-base-300 shadow-md object-contain bg-base-100 p-4"
          />
        </div>
        {/* Player info card */}
        <article className="card bg-base-200/40 p-6 w-80 text-center shadow-md rounded-2xl">
          <h2 className="text-2xl font-semibold mb-2">{player?.name || 'Unnamed Player'}</h2>
          <p className="uppercase tracking-wide text-sm text-primary font-medium">
            {player?.role || 'Unassigned Role'}
          </p>
          <p className="text-base text-muted mb-3">
            {player?.country?.name || 'Unknown Country'}
          </p>

          <div className="divider my-3 before:h-px after:h-px" />

          <p className="text-warning font-semibold">You are currently teamless</p>
          <p className="text-sm text-muted mt-1">
            Compete on FACEIT or await offers from teams.
          </p>
        </article>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <main>
        <section className="divide-base-content/10 divide-y">
          {/* Starters table */}
          <article className="stack-y gap-0!">
            <header className="prose border-t-0! text-center">
              <h2>{t('main.squad.starters')}</h2>
            </header>
            {!!starters.length && (
              <footer>
                <table className="table table-fixed">
                  <thead>
                    <tr>
                      <th>{t('shared.name')}</th>
                      <th className="text-right">Contracted until</th>
                    </tr>
                  </thead>
                  <tbody>
                    {starters.map((player) => (
                      <tr key={player.id + '__starter'}>
                        <td className="truncate" title={player.name}>
                          <span className={`fp ${player.country.code.toLowerCase()}`} />
                          <span>&nbsp;{player.name}</span>
                        </td>
                        <td className="text-right font-mono text-sm">
                          {formatContractEnd(player.contractEnd as unknown as number)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </footer>
            )}
            {!starters.length && (
              <footer className="center h-32">
                <p>{t('main.squad.noStarters')}</p>
              </footer>
            )}
          </article>

          {/* Transfer listed table */}
          <article className="stack-y gap-0! border-t-0!">
            <header className="prose text-center">
              <h2>{t('shared.transferListed')}</h2>
            </header>
            {!!transferListed.length && (
              <footer>
                <table className="table table-fixed">
                  <thead>
                    <tr>
                      <th>{t('shared.name')}</th>
                      <th className="text-right">Contracted until</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transferListed.map((player) => (
                      <tr key={player.id + '__transfer-listed'}>
                        <td className="truncate" title={player.name}>
                          <span className={`fp ${player.country.code.toLowerCase()}`} />
                          <span>&nbsp;{player.name}</span>
                        </td>
                        <td className="text-right font-mono text-sm">
                          {formatContractEnd(player.contractEnd as unknown as number)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </footer>
            )}
            {!transferListed.length && (
              <footer className="center h-32">
                <p>{t('main.squad.noTransferListed')}</p>
              </footer>
            )}
          </article>
        </section>
        <section className="divide-base-content/10 divide-y">
          <article className="stack-y gap-0! border-t-0!">
            <header className="prose text-center">
              <h2>Squad Overview</h2>
            </header>
            <footer className="p-5">
              <div className="grid auto-rows-min grid-cols-2 gap-5 xl:grid-cols-3">
                {visibleSquad.map((player) => (
                  <PlayerCard
                    key={player.id + '__squad'}
                    game={settings.general.game}
                    player={player}
                    onClickStarter={undefined}
                    onClickTransferListed={undefined}
                    onClickViewOffers={undefined}
                    onClickRelease={undefined}
                  />
                ))}
              </div>
            </footer>
          </article>
        </section>
      </main>
    </div>
  );
}
