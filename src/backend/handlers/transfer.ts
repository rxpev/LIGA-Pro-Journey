/**
 * Transfer Offer IPC handlers.
 *
 * @module
 */
import { ipcMain } from 'electron';
import { Prisma } from '@prisma/client';
import { Constants } from '@liga/shared';
import { DatabaseClient, WindowManager, Worldgen } from '@liga/backend/lib';

/**
 * Register the IPC event handlers.
 *
 * @function
 */
export default function () {

  ipcMain.handle(Constants.IPCRoute.TRANSFER_ALL, async (_, query: Prisma.TransferFindManyArgs) => {
    const transfers = await DatabaseClient.prisma.transfer.findMany(query);
    return transfers;
  });

  ipcMain.handle(Constants.IPCRoute.TRANSFER_ACCEPT, async (_, id: string) => {
    // All safety checks (profile, transfer.target == user player, etc.)
    // are handled inside acceptUserPlayerTransfer.
    await Worldgen.acceptTransferOffer(Number(id));

    // Let all windows refresh their transfer UIs.
    WindowManager.sendAll(Constants.IPCRoute.TRANSFER_UPDATE);
    return Promise.resolve();
  });

  ipcMain.handle(Constants.IPCRoute.TRANSFER_REJECT, async (_, id: string) => {
    await Worldgen.rejectTransferOffer(Number(id));

    WindowManager.sendAll(Constants.IPCRoute.TRANSFER_UPDATE);
    return Promise.resolve();
  });

  ipcMain.handle(
    Constants.IPCRoute.TRANSFER_CREATE,
    async (
      _,
      transferDetails: Prisma.TransferCreateInput,
      offerDetails: Partial<Prisma.OfferCreateInput>,
    ) => {
      const status = !transferDetails.to
        ? Constants.TransferStatus.PLAYER_PENDING
        : Constants.TransferStatus.TEAM_PENDING;

      // See if there's an existing transfer discussion between these parties.
      let transfer = await DatabaseClient.prisma.transfer.findFirst({
        where: {
          from: {
            id: transferDetails.from.connect.id,
          },
          to: transferDetails.to
            ? {
              id: transferDetails.to.connect?.id,
            }
            : undefined,
          target: {
            id: transferDetails.target.connect.id,
          },
        },
      });

      if (!transfer) {
        // Create the transfer if it doesn't already exist.
        transfer = await DatabaseClient.prisma.transfer.create({
          data: {
            ...transferDetails,
            status,
            offers: {
              create: [
                {
                  ...offerDetails,
                  status,
                },
              ],
            },
          },
        });
      } else {
        // Otherwise attach a new offer to the existing transfer.
        await DatabaseClient.prisma.transfer.update({
          where: {
            id: transfer.id,
          },
          data: {
            status,
            offers: {
              create: [
                {
                  ...offerDetails,
                  status,
                },
              ],
            },
          },
        });
      }

      WindowManager.sendAll(Constants.IPCRoute.TRANSFER_UPDATE);
      return transfer;
    },
  );
}
