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

/**
 * Register the IPC event handlers.
 *
 * @function
 */
export default function () {
  ipcMain.handle(Constants.IPCRoute.NEWS_ALL, (_, query?: Prisma.NewsItemFindManyArgs) =>
    DatabaseClient.prisma.newsItem.findMany(query || News.getDefaultNewsQuery()),
  );

  ipcMain.handle(
    Constants.IPCRoute.NEWS_UPDATE_MANY,
    async (_, query: Prisma.NewsItemUpdateManyArgs) => {
      await DatabaseClient.prisma.newsItem.updateMany(query);
      notifyNewsItemsUpdated();

      return DatabaseClient.prisma.newsItem.findMany(News.getDefaultNewsQuery());
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
