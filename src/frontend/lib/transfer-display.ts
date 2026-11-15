import { Constants } from '@liga/shared';

type TransferDisplayRecord = {
  status: number;
  from: { id: number };
  to?: { id: number } | null;
  offers: Array<{ cost?: number | null }>;
};

/**
 * Free-agent NPC signings use the destination team as a source-team sentinel.
 * A zero fee alone is not sufficient: academy promotions and other legitimate
 * team-to-team moves can also be free transfers.
 */
export function isFreeAgentTransfer(transfer: TransferDisplayRecord) {
  const latestOffer = transfer.offers[0];

  return (
    transfer.status === Constants.TransferStatus.TEAM_ACCEPTED &&
    (latestOffer?.cost || 0) === 0 &&
    (!transfer.to || transfer.to.id === transfer.from.id)
  );
}
