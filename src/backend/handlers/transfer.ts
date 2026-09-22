/**
 * Transfer Offer IPC handlers.
 *
 * @module
 */
import { ipcMain } from 'electron';
import { Prisma } from '@prisma/client';
import { addDays, differenceInDays } from 'date-fns';
import { Constants, Eagers } from '@liga/shared';
import { DatabaseClient, News, WindowManager, Worldgen } from '@liga/backend/lib';
import {
  getTrialCoachLateResponse,
  getTrialCoachResponse,
  getTrialLatePlayerResponse,
} from '@liga/locale/en/trial';

/**
 * Register the IPC event handlers.
 *
 * @function
 */
export default function () {
  ipcMain.handle(
    Constants.IPCRoute.EMAILS_TRIAL_REPLY,
    async (_, emailId: number, transferId: number, choice: 'accept' | 'reject') => {
      if (!['accept', 'reject'].includes(choice)) throw new Error('Invalid trial reply.');

      const profile = await DatabaseClient.prisma.profile.findFirst();
      const transfer = await DatabaseClient.prisma.transfer.findFirst({
        where: { id: Number(transferId), playerId: profile?.playerId ?? -1 },
        include: {
          offers: { orderBy: { id: 'desc' }, take: 1 },
          from: { include: { personas: true } },
        },
      });
      if (
        !profile ||
        transfer?.status !== Constants.TransferStatus.PLAYER_PENDING ||
        transfer?.offers[0]?.status !== Constants.TransferStatus.PLAYER_PENDING ||
        transfer?.offers[0]?.offerType !== 'TRIAL'
      ) {
        throw new Error('Trial offer not found.');
      }

      if (choice === 'accept') {
        await Worldgen.acceptTransferOffer(transfer.id);
        await News.generateAutomaticItems();
      } else {
        await Worldgen.rejectTransferOffer(transfer.id);
      }

      // Worldgen re-checks the offer at the point of mutation. If an expiry
      // tick won a race with this request, do not append a response as though
      // the trial had been accepted/rejected successfully.
      const resolvedTransfer = await DatabaseClient.prisma.transfer.findUnique({
        where: { id: transfer.id },
        select: { status: true },
      });
      const expectedStatus =
        choice === 'accept'
          ? Constants.TransferStatus.PLAYER_ACCEPTED
          : Constants.TransferStatus.PLAYER_REJECTED;
      if (resolvedTransfer?.status !== expectedStatus) {
        throw new Error('Trial offer is no longer available.');
      }

      // A response resolves the offer immediately. Mark both scheduled
      // expiry checks complete so a queued reminder/expiry event cannot race
      // the response and append a contradictory message.
      await DatabaseClient.prisma.calendar.updateMany({
        where: {
          type: Constants.CalendarEntry.TRANSFER_OFFER_EXPIRY_CHECK,
          payload: String(transfer.id),
          completed: false,
        },
        data: { completed: true },
      });

      const playerPersona = await DatabaseClient.prisma.persona.upsert({
        where: { name: `__player_profile_${profile.id}` },
        update: { role: 'Player' },
        create: { name: `__player_profile_${profile.id}`, role: 'Player' },
      });
      const coachPersona =
        transfer.from.personas.find(
          (persona) =>
            persona.role === Constants.PersonaRole.MANAGER ||
            persona.role === Constants.PersonaRole.ASSISTANT,
        ) ?? transfer.from.personas[0];
      if (!coachPersona) throw new Error('Trial coach not found.');
      const offer = transfer.offers[0];
      const offerStartedAt = offer.expiresAt ? addDays(offer.expiresAt, -7) : profile.date;
      const isLateReply = differenceInDays(profile.date, offerStartedAt) >= 3;
      const accepted = choice === 'accept';
      await DatabaseClient.prisma.$transaction([
        DatabaseClient.prisma.dialogue.updateMany({
          where: { emailId },
          data: { completed: true },
        }),
        DatabaseClient.prisma.dialogue.create({
          data: {
            emailId,
            fromId: playerPersona.id,
            sentAt: profile.date,
            content: isLateReply
              ? getTrialLatePlayerResponse(accepted)
              : accepted
                ? 'Thank you for the opportunity. I will do my best to prove my worth.'
                : 'Thank you for the opportunity, but I am currently not interested in trialing for your team.',
          },
        }),
        DatabaseClient.prisma.dialogue.create({
          data: {
            emailId,
            fromId: coachPersona.id,
            sentAt: profile.date,
            content: isLateReply
              ? getTrialCoachLateResponse(offer.trialBand, accepted)
              : getTrialCoachResponse(offer.trialBand, accepted),
          },
        }),
      ]);

      const email = await DatabaseClient.prisma.email.findUnique({
        where: { id: emailId },
        include: Eagers.email.include,
      });
      WindowManager.sendAll(Constants.IPCRoute.TRANSFER_UPDATE);
      WindowManager.sendAll(Constants.IPCRoute.NEWS_ITEMS_UPDATED);
      return email;
    },
  );

  ipcMain.handle(Constants.IPCRoute.TRANSFER_ALL, async (_, query: Prisma.TransferFindManyArgs) => {
    const transfers = await DatabaseClient.prisma.transfer.findMany(query);
    return transfers;
  });

  ipcMain.handle(Constants.IPCRoute.TRANSFER_ACCEPT, async (_, id: string) => {
    // All safety checks (profile, transfer.target == user player, etc.)
    // are handled inside acceptUserPlayerTransfer.
    await Worldgen.acceptTransferOffer(Number(id));
    await News.generateAutomaticItems();

    // Let all windows refresh their transfer UIs.
    WindowManager.sendAll(Constants.IPCRoute.TRANSFER_UPDATE);
    WindowManager.sendAll(Constants.IPCRoute.NEWS_ITEMS_UPDATED);
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
