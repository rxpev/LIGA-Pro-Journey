/**
 * Dedicated modal for transfer offers (Player Career Only).
 *
 * This modal now ONLY supports:
 * - Viewing incoming PLAYER_PENDING offers for the user.
 * - Accepting or rejecting those offers.
 * - Viewing past offers.
 *
 * All Manager Career logic has been removed.
 */

import React from 'react';
import { flatten } from 'lodash';
import { useLocation } from 'react-router-dom';
import { Bot, Constants, Eagers, Util } from '@liga/shared';
import { cx } from '@liga/frontend/lib';
import { AppStateContext } from '@liga/frontend/redux';
import { useTranslation } from '@liga/frontend/hooks';
import { Image } from '@liga/frontend/components';
import { XPBar } from '@liga/frontend/components/player-card';
import {
  FaBan,
  FaCheck,
  FaPiggyBank,
  FaTag,
  FaWallet,
} from 'react-icons/fa';

/** @enum */
enum Tab {
  REVIEW_OFFERS,
  PAST_OFFERS,
}

/** @type {Player} */
type Player = Awaited<ReturnType<typeof api.players.find<typeof Eagers.player>>>;

/** @type {Transfer} */
type Transfer = Awaited<
  ReturnType<typeof api.transfers.all<typeof Eagers.transfer>>
>[number];

const TransferStatusBadgeColor: Record<number, string> = {
  [Constants.TransferStatus.PLAYER_ACCEPTED]: 'badge-success',
  [Constants.TransferStatus.PLAYER_PENDING]: 'badge-warning',
  [Constants.TransferStatus.PLAYER_REJECTED]: 'badge-error',
  [Constants.TransferStatus.TEAM_ACCEPTED]: 'badge-success',
  [Constants.TransferStatus.TEAM_PENDING]: 'badge-warning',
  [Constants.TransferStatus.TEAM_REJECTED]: 'badge-error',
};

function fetchTransfers(playerId: number) {
  return api.transfers.all({
    where: { target: { id: playerId } },
    include: Eagers.transfer.include,
  });
}

export default function TransferModal() {
  const location = useLocation();
  const t = useTranslation('windows');
  const { state } = React.useContext(AppStateContext);

  const [activeTab, setActiveTab] = React.useState<Tab>(Tab.REVIEW_OFFERS);
  const [player, setPlayer] = React.useState<Player>();
  const [transfers, setTransfers] = React.useState<Array<Transfer>>([]);

  const isUserPlayer = player?.id === state.profile.playerId;

  React.useEffect(() => {
    if (!location.state) return;

    const playerId = location.state as number;

    api.players
      .find({
        ...Eagers.player,
        where: { id: playerId },
      })
      .then(setPlayer);

    fetchTransfers(playerId).then(setTransfers);
  }, []);

  // All offers (flattened)
  const offers = React.useMemo(() => {
    if (!transfers) return [];
    return flatten(transfers.map((t) => t.offers));
  }, [transfers]);

  // Only incoming pending offers that YOU need to respond to
  const pendingTransfers = React.useMemo(() => {
    if (!isUserPlayer) return [];
    return (transfers ?? []).filter(
      (t) => t.status === Constants.TransferStatus.PLAYER_PENDING,
    );
  }, [transfers, isUserPlayer]);

  if (!player) {
    return (
      <main className="h-screen w-screen">
        <section className="center h-full">
          <span className="loading loading-bars" />
        </section>
      </main>
    );
  }

  return (
    <main className="divide-base-content/10 flex h-screen w-screen flex-col divide-y">
      {/* HEADER: PLAYER OVERVIEW */}
      <header className="stats bg-base-200 w-full grid-cols-3 rounded-none">
        <section className="stat">
          <figure className="stat-figure text-secondary">
            <FaWallet className="size-8" />
          </figure>
          <header className="stat-title">Wages</header>
          <aside className="stat-value text-secondary">
            {Util.formatCurrency(player.wages, { notation: 'compact' })}
          </aside>
          <footer className="stat-desc">Per Week</footer>
        </section>

        <section className="stat">
          <figure className="stat-figure text-primary">
            <FaTag className="size-8" />
          </figure>
          <header className="stat-title">Transfer Value</header>
          <aside className="stat-value text-primary">
            {Util.formatCurrency(player.cost, { notation: 'compact' })}
          </aside>
        </section>

        <section className="stat">
          <figure className="stat-figure">
            <FaPiggyBank className="size-8" />
          </figure>
          <header className="stat-title">Your Cash</header>
          <aside className="stat-value">
            {Util.formatCurrency(state.profile.team?.earnings ?? 0, {
              notation: 'compact',
            })}
          </aside>
        </section>
      </header>

      {/* PLAYER CARD */}
      <section className="flex">
        <figure className="center w-1/5 gap-2 p-2">
          <Image
            src={player.avatar || 'resources://avatars/empty.png'}
            className="h-auto w-full"
          />
        </figure>

        <table className="table table-fixed">
          <thead>
            <tr>
              <th>Name</th>
              <th>Country</th>
              <th>Team</th>
              <th>Potential</th>
            </tr>
          </thead>

          <tbody>
            <tr className="border-base-content/10 border-l">
              <td className="truncate">{player.name}</td>
              <td>
                <span className={cx('fp', 'mr-2', player.country.code.toLowerCase())} />
                {player.country.name}
              </td>
              <td className="truncate">
                {player.team ? (
                  <>
                    <img src={player.team.blazon} className="inline-block size-6" />
                    <span>&nbsp;{player.team.name}</span>
                  </>
                ) : (
                  'Free Agent'
                )}
              </td>
              <td>
                <figure className="rating gap-1">
                  {[...Array(Constants.Prestige.length)].map((_, idx) => (
                    <span
                      key={idx}
                      className="mask mask-star bg-yellow-500"
                      aria-current={idx + 1 <= player.prestige + 1}
                    />
                  ))}
                </figure>
              </td>
            </tr>
          </tbody>

          <thead>
            <tr>
              <th colSpan={4}>Stats</th>
            </tr>
          </thead>

          <tbody>
            <XPBar title="Total XP" value={Bot.Exp.getTotalXP(player.xp)} max={100} />
          </tbody>
        </table>
      </section>

      {/* TAB BAR (Player Career Only: REVIEW_OFFERS + PAST_OFFERS) */}
      <section role="tablist" className="tabs-box tabs rounded-none border-t-0!">
        {Object.keys(Tab)
          .filter((k) => isNaN(Number(k)))
          .map((tabKey: keyof typeof Tab) => (
            <a
              key={tabKey}
              role="tab"
              className={cx('tab capitalize', Tab[tabKey] === activeTab && 'tab-active')}
              onClick={() => setActiveTab(Tab[tabKey])}
            >
              {tabKey.replace('_', ' ').toLowerCase()}
            </a>
          ))}
      </section>

      {/* REVIEW OFFERS (Only PLAYER_PENDING for YOU) */}
      {activeTab === Tab.REVIEW_OFFERS && (
        <section className="flex-1 overflow-y-scroll">
          <table className="table table-fixed table-pin-rows">
            <thead>
              <tr>
                <th>From</th>
                <th className="text-center">Fee</th>
                <th className="text-right">Accept / Reject</th>
              </tr>
            </thead>

            <tbody>
              {pendingTransfers.length === 0 && (
                <tr>
                  <td colSpan={3} className="text-center opacity-60 py-8">
                    No pending offers.
                  </td>
                </tr>
              )}

              {pendingTransfers.map((transfer) => (
                <tr key={transfer.id}>
                  <td className="truncate">
                    <img src={transfer.from.blazon} className="inline-block size-6" />
                    <span>&nbsp;{transfer.from.name}</span>
                  </td>

                  <td className="text-center">
                    {Util.formatCurrency(transfer.offers[0].cost)}
                  </td>

                  <td className="join w-full justify-end text-center">
                    <button
                      title="Accept Offer"
                      className="btn btn-success join-item btn-sm"
                      onClick={() =>
                        api.transfers
                          .accept(transfer.id)
                          .then(() => fetchTransfers(player.id))
                          .then(setTransfers)
                      }
                    >
                      <FaCheck />
                    </button>

                    <button
                      title="Reject Offer"
                      className="btn btn-error join-item btn-sm"
                      onClick={() =>
                        api.transfers
                          .reject(transfer.id)
                          .then(() => fetchTransfers(player.id))
                          .then(setTransfers)
                      }
                    >
                      <FaBan />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* PAST OFFERS */}
      {activeTab === Tab.PAST_OFFERS && (
        <section className="flex-1 overflow-y-scroll">
          <table className="table table-fixed table-pin-rows">
            <thead>
              <tr>
                <th>From</th>
                <th className="text-center">Fee</th>
                <th className="text-center">Wages</th>
                <th className="text-center w-3/12">Status</th>
              </tr>
            </thead>

            <tbody>
              {offers.map((offer) => {
                const transfer = transfers.find((t) => t.id === offer.transferId);
                const team = transfer?.from;

                if (!team) return null;

                return (
                  <tr key={offer.id}>
                    <td>
                      <img src={team.blazon} className="inline-block size-6" />
                      <span>&nbsp;{team.name}</span>
                    </td>

                    <td className="text-center">
                      {Util.formatCurrency(offer.cost)}
                    </td>

                    <td className="text-center">
                      {Util.formatCurrency(offer.wages)}
                    </td>

                    <td className="text-center">
                      <span
                        className={cx(
                          'badge w-full capitalize',
                          TransferStatusBadgeColor[offer.status],
                        )}
                      >
                        {Constants.IdiomaticTransferStatus[offer.status]}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
}
