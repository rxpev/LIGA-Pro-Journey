import log from 'electron-log';
import { Constants } from '@liga/shared';

const ACTIVE_FACEIT_STATUSES = [
  Constants.MatchStatus.READY,
  Constants.MatchStatus.WAITING,
  Constants.MatchStatus.PLAYING,
];

function getProfileDayStart(profileDate: Date | number | string) {
  const date = profileDate instanceof Date ? profileDate : new Date(profileDate);
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
}

export async function cleanupStaleFaceitMatchRooms(prisma: any, profile: any) {
  if (!profile?.id || !profile?.date) {
    return 0;
  }

  const profileDayStart = getProfileDayStart(profile.date);
  const activeMatches = await prisma.match.findMany({
    where: {
      profileId: profile.id,
      matchType: 'FACEIT_PUG',
      status: { in: ACTIVE_FACEIT_STATUSES },
      faceitEloDelta: null,
      faceitRating: null,
      faceitIsWin: null,
    },
    select: {
      id: true,
      status: true,
      date: true,
      _count: {
        select: {
          events: true,
        },
      },
    },
  });

  const abandonedMatches = activeMatches.filter(
    (match: { date: Date; status: Constants.MatchStatus; _count?: { events?: number } }) =>
      match.status === Constants.MatchStatus.PLAYING &&
      Number(match._count?.events ?? 0) === 0,
  );
  const staleMatches = activeMatches.filter(
    (match: { date: Date; status: Constants.MatchStatus }) =>
      getProfileDayStart(match.date).getTime() < profileDayStart.getTime(),
  );
  const recoverMatchIds = Array.from(
    new Set([...abandonedMatches, ...staleMatches].map((match: { id: number }) => match.id)),
  );

  if (!recoverMatchIds.length) {
    return 0;
  }

  await prisma.$transaction([
    prisma.match.updateMany({
      where: { id: { in: recoverMatchIds } },
      data: {
        status: Constants.MatchStatus.READY,
        date: profileDayStart.toISOString(),
      },
    }),
    prisma.game.updateMany({
      where: {
        matchId: { in: recoverMatchIds },
        status: { not: Constants.MatchStatus.COMPLETED },
      },
      data: { status: Constants.MatchStatus.READY },
    }),
  ]);

  log.info(
    'Recovered %d abandoned/stale FACEIT matchroom(s) for %s: %s',
    recoverMatchIds.length,
    profileDayStart.toISOString(),
    recoverMatchIds.join(', '),
  );

  return recoverMatchIds.length;
}
