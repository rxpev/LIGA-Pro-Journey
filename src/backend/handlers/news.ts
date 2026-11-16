/**
 * News IPC handlers.
 *
 * @module
 */
import { ipcMain } from 'electron';
import { Prisma } from '@prisma/client';
import { Constants } from '@liga/shared';
import { DatabaseClient, News, WindowManager } from '@liga/backend/lib';

function notifyNewsItemsUpdated() {
  WindowManager.get(Constants.WindowIdentifier.Main, false)?.webContents.send(
    Constants.IPCRoute.NEWS_ITEMS_UPDATED,
  );
}

async function markTopFiveTransferStories<
  T extends { topic: string; payload: string | null; publishedAt: Date },
>(items: T[]): Promise<T[]> {
  const legacyTeamIds = new Set<number>();
  for (const item of items) {
    if (item.topic !== 'TRANSFERS' || !item.payload) continue;
    try {
      const payload = JSON.parse(item.payload) as Record<string, unknown>;
      if (typeof payload.goldenTransfer === 'boolean') continue;
      const ids = Array.isArray(payload.teamIds) ? payload.teamIds : [payload.teamId];
      ids.forEach((id) => {
        if (typeof id === 'number') legacyTeamIds.add(id);
      });
    } catch (_) {
      // Keep malformed legacy payloads unchanged.
    }
  }

  if (!legacyTeamIds.size) {
    return items;
  }

  const [teams, snapshots] = await Promise.all([
    DatabaseClient.prisma.team.findMany({
      orderBy: [{ elo: 'desc' }, { id: 'asc' }],
      select: { id: true },
      take: 5,
    }),
    DatabaseClient.prisma.teamRankingSnapshot.findMany({
      where: { teamId: { in: [...legacyTeamIds] } },
      orderBy: { date: 'desc' },
      select: { teamId: true, date: true, rank: true },
    }),
  ]);
  const topTeamIds = new Set(teams.map((team) => team.id));
  const snapshotsByTeam = new Map<number, typeof snapshots>();
  for (const snapshot of snapshots) {
    const teamSnapshots = snapshotsByTeam.get(snapshot.teamId) || [];
    teamSnapshots.push(snapshot);
    snapshotsByTeam.set(snapshot.teamId, teamSnapshots);
  }

  return items.map((item) => {
    if (item.topic !== 'TRANSFERS' || !item.payload) {
      return item;
    }

    try {
      const payload = JSON.parse(item.payload) as Record<string, unknown>;
      if (typeof payload.goldenTransfer === 'boolean') return item;
      const teamIds = Array.isArray(payload.teamIds)
        ? payload.teamIds.filter((id): id is number => typeof id === 'number')
        : typeof payload.teamId === 'number'
          ? [payload.teamId]
          : [];

      return {
        ...item,
        payload: JSON.stringify({
          ...payload,
          goldenTransfer: teamIds.some((id) => {
            const snapshot = snapshotsByTeam
              .get(id)
              ?.find((entry) => entry.date <= item.publishedAt);
            return (snapshot?.rank ?? Infinity) <= 5 || topTeamIds.has(id);
          }),
        }),
      };
    } catch (_) {
      return item;
    }
  });
}

/**
 * Register the IPC event handlers.
 *
 * @function
 */
export default function () {
  ipcMain.handle(Constants.IPCRoute.NEWS_ALL, async (_, query?: Prisma.NewsItemFindManyArgs) =>
    markTopFiveTransferStories(
      await DatabaseClient.prisma.newsItem.findMany(query || News.getDefaultNewsQuery()),
    ),
  );

  ipcMain.handle(
    Constants.IPCRoute.NEWS_UPDATE_MANY,
    async (_, query: Prisma.NewsItemUpdateManyArgs) => {
      await DatabaseClient.prisma.newsItem.updateMany(query);
      notifyNewsItemsUpdated();

      return markTopFiveTransferStories(
        await DatabaseClient.prisma.newsItem.findMany(News.getDefaultNewsQuery()),
      );
    },
  );

  ipcMain.handle(Constants.IPCRoute.NEWS_GENERATE_TEST, async () => {
    const items = await News.generatePrototypeItems();
    notifyNewsItemsUpdated();

    return items;
  });

  ipcMain.handle(Constants.IPCRoute.NEWS_CLEAR_TEST, async () => {
    const result = await News.clearPrototypeItems();
    notifyNewsItemsUpdated();

    return result;
  });
}
