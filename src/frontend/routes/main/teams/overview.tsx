/**
 * Team overview route.
 *
 * @module
 */
import React from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { Constants, Eagers, Util } from '@liga/shared';
import { cx } from '@liga/frontend/lib';
import { AppStateContext } from '@liga/frontend/redux';
import { useFormatAppShortDate, useTranslation } from '@liga/frontend/hooks';
import { FaChartBar } from 'react-icons/fa';
import { addDays, format } from 'date-fns';
import { getTeamsTierLabel } from './labels';

/** @constant */
const NUM_PREVIOUS = 5;

/** @constant */
const NUM_FORM_LOOKBACK = NUM_PREVIOUS * 2;

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
  const [matches, setMatches] = React.useState<
    Awaited<ReturnType<typeof api.matches.upcoming<typeof Eagers.match>>>
  >([]);
  const [transfers, setTransfers] = React.useState<
    Awaited<ReturnType<typeof api.transfers.all<typeof Eagers.transfer>>>
  >([]);

  const openPlayerTransferModal = React.useCallback((playerId: number) => {
    api.window.send<ModalRequest>(Constants.WindowIdentifier.Modal, {
      target: '/transfer',
      payload: playerId,
    });
  }, []);

  React.useEffect(() => {
    api.matches.previous(Eagers.match, team.id, NUM_FORM_LOOKBACK).then(setMatches);
    api.team.transfers(team.id).then(setTransfers);
  }, [team]);

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

  return (
    <section>
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

                const competitionLabel = getTeamsTierLabel(
                  match.competition.tier.slug,
                  match.competition.tier.league?.name,
                );
                const competitionLink = `/competitions?federationId=${match.competition.federationId}&season=${match.competition.season}&tierId=${match.competition.tier.id}`;

                return (
                  <tr
                    key={`${match.id}__match_previous`}
                    data-interaction-hover-sound="none"
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
    </section>
  );
}
