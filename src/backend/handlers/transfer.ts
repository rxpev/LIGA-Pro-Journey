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

function parseRosterBaseline(value: string | null, playerId: number) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    const ids = Array.isArray(parsed) ? parsed : parsed?.playerIds;
    if (!Array.isArray(ids)) return [];
    return [...new Set(ids.filter((id): id is number => Number.isInteger(id) && id !== playerId))];
  } catch {
    return [];
  }
}

async function getRosterStabilityStatus() {
  const profile = await DatabaseClient.prisma.profile.findFirst(Eagers.profile);
  const player = profile?.player;
  const team = profile?.team;
  const requiredDepartures = player?.rosterStabilityRequiredDepartures === 2 ? 2 : 3;
  const coach =
    team?.personas.find((persona) => persona.role === Constants.PersonaRole.MANAGER) ??
    team?.personas.find((persona) => persona.role === Constants.PersonaRole.ASSISTANT) ??
    team?.personas[0] ??
    null;

  if (!profile || !player || !team || !player.rosterStabilityClause) {
    return { profile, player, team, coach, available: false, departed: 0, requiredDepartures };
  }

  const baseline = parseRosterBaseline(player.contractRosterBaseline, player.id);
  const baselinePlayers = baseline.length
    ? await DatabaseClient.prisma.player.findMany({
        where: { id: { in: baseline } },
        select: { id: true, teamId: true },
      })
    : [];
  const currentTeamByPlayer = new Map(baselinePlayers.map((item) => [item.id, item.teamId]));
  const departed = baseline.filter((id) => currentTeamByPlayer.get(id) !== team.id).length;

  let triggeredAt = player.rosterStabilityTriggeredAt;
  if (!triggeredAt && departed >= requiredDepartures) {
    triggeredAt = profile.date;
    await DatabaseClient.prisma.player.update({
      where: { id: player.id },
      data: { rosterStabilityTriggeredAt: triggeredAt },
    });
  }

  const contractActive = !player.contractEnd || profile.date < player.contractEnd;
  const available = Boolean(
    triggeredAt && contractActive && player.starter && !player.transferListed && coach,
  );

  return { profile, player, team, coach, available, departed, requiredDepartures };
}

/**
 * Register the IPC event handlers.
 *
 * @function
 */
export default function () {
  ipcMain.handle(Constants.IPCRoute.EMAILS_ROSTER_STABILITY_STATUS, async () => {
    const status = await getRosterStabilityStatus();
    const existingRequest =
      status.player && status.team
        ? await DatabaseClient.prisma.email.findUnique({
            where: {
              subject: `Roster stability clause request - ${status.player.id} - ${status.team.id}`,
            },
            select: { id: true },
          })
        : null;
    return {
      available: status.available && !existingRequest,
      departed: status.departed,
      required: status.requiredDepartures,
      coach:
        status.coach && status.team
          ? {
              id: status.coach.id,
              name: status.coach.name,
              role: status.coach.role,
              teamName: status.team.name,
              teamBlazon: status.team.blazon,
            }
          : null,
    };
  });

  ipcMain.handle(Constants.IPCRoute.EMAILS_ROSTER_STABILITY_START, async () => {
    const status = await getRosterStabilityStatus();
    if (!status.available || !status.profile || !status.player || !status.team || !status.coach) {
      throw new Error('The roster stability clause is not currently available.');
    }

    const subject = `Roster stability clause request - ${status.player.id} - ${status.team.id}`;
    const existing = await DatabaseClient.prisma.email.findUnique({
      where: { subject },
      include: Eagers.email.include,
    });
    if (existing) return existing;

    const playerPersona = await DatabaseClient.prisma.persona.upsert({
      where: { name: `__player_profile_${status.profile.id}` },
      update: { role: 'Player' },
      create: { name: `__player_profile_${status.profile.id}`, role: 'Player' },
    });
    return DatabaseClient.prisma.email.create({
      data: {
        subject,
        sentAt: status.profile.date,
        read: true,
        fromId: status.coach.id,
        dialogues: {
          create: {
            fromId: playerPersona.id,
            sentAt: status.profile.date,
            content:
              "Hello,\n\nI want to initiate my roster stability clause. I'm sorry this didn't work out as we expected.",
          },
        },
      },
      include: Eagers.email.include,
    });
  });

  ipcMain.handle(
    Constants.IPCRoute.EMAILS_ROSTER_STABILITY_COMPLETE,
    async (_, emailId: number) => {
      const email = await DatabaseClient.prisma.email.findUnique({
        where: { id: Number(emailId) },
        include: Eagers.email.include,
      });
      if (!email?.subject.startsWith('Roster stability clause request - ')) {
        throw new Error('Roster stability request not found.');
      }

      const existingCoachReply = email.dialogues.find(
        (dialogue) => dialogue.fromId === email.fromId,
      );
      if (existingCoachReply) {
        // Repair an interrupted first attempt where the reply was persisted but
        // the larger bench/replacement operation did not finish.
        const retryStatus = await getRosterStabilityStatus();
        if (
          retryStatus.available &&
          retryStatus.profile &&
          retryStatus.player &&
          retryStatus.team
        ) {
          await Worldgen.benchUserPlayer({
            teamId: retryStatus.team.id,
            playerId: retryStatus.player.id,
            now: retryStatus.profile.date,
            reason: 'Roster stability clause exercised by player.',
            suppressEmail: true,
          });
        }
        return email;
      }

      const status = await getRosterStabilityStatus();
      if (!status.available || !status.profile || !status.player || !status.team || !status.coach) {
        throw new Error('The roster stability clause is no longer available.');
      }
      if (status.coach.id !== email.fromId) throw new Error('Roster stability coach mismatch.');

      await DatabaseClient.prisma.dialogue.create({
        data: {
          emailId: email.id,
          fromId: status.coach.id,
          sentAt: status.profile.date,
          content:
            'I understand. We respect your decision and will place you on the transfer list immediately. I am sorry it did not work out, and I wish you the best of luck with your next team.',
        },
      });
      await Worldgen.benchUserPlayer({
        teamId: status.team.id,
        playerId: status.player.id,
        now: status.profile.date,
        reason: 'Roster stability clause exercised by player.',
        suppressEmail: true,
      });

      const updatedEmail = await DatabaseClient.prisma.email.findUnique({
        where: { id: email.id },
        include: Eagers.email.include,
      });
      WindowManager.sendAll(Constants.IPCRoute.TRANSFER_UPDATE);
      return updatedEmail;
    },
  );

  ipcMain.handle(
    Constants.IPCRoute.EMAILS_TRIAL_REPLY,
    async (_, emailId: number, transferId: number, choice: 'accept' | 'reject') => {
      if (!['accept', 'reject'].includes(choice)) throw new Error('Invalid trial reply.');

      const profile = await DatabaseClient.prisma.profile.findFirst();
      const transfer = await DatabaseClient.prisma.transfer.findFirst({
        where: { id: Number(transferId), playerId: profile?.playerId ?? -1 },
        include: {
          offers: { orderBy: { id: 'desc' } },
          from: { include: { personas: true } },
        },
      });
      const trialOffer = transfer?.offers.find((offer) => offer.offerType === 'TRIAL');

      // Treat a repeated acceptance as idempotent. A fast double-click could previously
      // accept the trial in the first IPC call and make the second call fail before the
      // renderer had a chance to start its reveal.
      if (
        choice === 'accept' &&
        profile &&
        transfer?.status === Constants.TransferStatus.PLAYER_ACCEPTED &&
        trialOffer?.status === Constants.TransferStatus.PLAYER_ACCEPTED &&
        profile.trialTeamId === transfer.teamIdFrom
      ) {
        const acceptedEmail = await DatabaseClient.prisma.email.findUnique({
          where: { id: emailId },
          include: Eagers.email.include,
        });
        if (acceptedEmail) return acceptedEmail;
      }
      if (
        !profile ||
        transfer?.status !== Constants.TransferStatus.PLAYER_PENDING ||
        trialOffer?.status !== Constants.TransferStatus.PLAYER_PENDING
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
      const offer = trialOffer;
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
    // The contract reveal owns the hand-off to the inbox. Store acceptance
    // messages now, but do not notify the renderer until that reveal finishes.
    const acceptanceEmail = await Worldgen.acceptTransferOffer(Number(id), false);
    await News.generateAutomaticItems();

    // Let all windows refresh their transfer UIs.
    WindowManager.sendAll(Constants.IPCRoute.TRANSFER_UPDATE);
    WindowManager.sendAll(Constants.IPCRoute.NEWS_ITEMS_UPDATED);
    return acceptanceEmail ? acceptanceEmail.id : null;
  });

  ipcMain.handle(Constants.IPCRoute.TRANSFER_REJECT, async (_, id: string) => {
    const responseEmail = await Worldgen.rejectTransferOffer(Number(id), false);

    WindowManager.sendAll(Constants.IPCRoute.TRANSFER_UPDATE);
    return responseEmail ? responseEmail.id : null;
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
