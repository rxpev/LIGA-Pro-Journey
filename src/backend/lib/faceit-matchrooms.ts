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

  const staleBefore = getProfileDayStart(profile.date);
  const staleMatches = await prisma.match.findMany({
    where: {
      profileId: profile.id,
      matchType: 'FACEIT_PUG',
      status: { in: ACTIVE_FACEIT_STATUSES },
      date: { lt: staleBefore },
      faceitEloDelta: null,
      faceitRating: null,
      faceitIsWin: null,
    },
    select: { id: true },
  });

  const matchIds = staleMatches.map((match: { id: number }) => match.id);
  if (!matchIds.length) {
    return 0;
  }

  const games = await prisma.game.findMany({
    where: { matchId: { in: matchIds } },
    select: { id: true },
  });
  const gameIds = games.map((game: { id: number }) => game.id);

  await prisma.$transaction([
    prisma.matchPlayerGameStat.deleteMany({ where: { matchId: { in: matchIds } } }),
    prisma.matchEvent.deleteMany({ where: { matchId: { in: matchIds } } }),
    prisma.matchVeto.deleteMany({ where: { matchId: { in: matchIds } } }),
    ...(gameIds.length
      ? [prisma.gameToTeam.deleteMany({ where: { gameId: { in: gameIds } } })]
      : []),
    prisma.game.deleteMany({ where: { matchId: { in: matchIds } } }),
    prisma.matchToTeam.deleteMany({ where: { matchId: { in: matchIds } } }),
    prisma.match.deleteMany({ where: { id: { in: matchIds } } }),
  ]);

  log.info(
    'Cleaned up %d stale FACEIT matchroom(s) before %s: %s',
    matchIds.length,
    staleBefore.toISOString(),
    matchIds.join(', '),
  );

  return matchIds.length;
}
