/**
 * IPC handlers for the plugins manager.
 *
 * @module
 */
import { ipcMain } from 'electron';
import { Constants } from '@liga/shared';
import { Plugins } from '@liga/backend/lib';

/**
 * Register the IPC event handlers.
 *
 * @function
 */
export default function () {
  ipcMain.on(Constants.IPCRoute.PLUGINS_START, (event) => {
    const plugins = new Plugins.Manager('https://github.com/rxpev/LIGA-Plugins.git');

    // register plugin manager event handlers
    plugins.on(Plugins.EventIdentifier.CHECKING, () =>
      event.reply(Constants.IPCRoute.PLUGINS_CHECKING),
    );
    plugins.on(Plugins.EventIdentifier.NO_UPDATE, () =>
      event.reply(Constants.IPCRoute.PLUGINS_NO_UPDATE),
    );
    plugins.on(Plugins.EventIdentifier.DOWNLOADING, () =>
      event.reply(Constants.IPCRoute.PLUGINS_DOWNLOADING),
    );
    plugins.on(Plugins.EventIdentifier.DOWNLOAD_PROGRESS, (percent) =>
      event.reply(Constants.IPCRoute.PLUGINS_DOWNLOAD_PROGRESS, percent),
    );
    plugins.on(Plugins.EventIdentifier.ERROR, () => event.reply(Constants.IPCRoute.PLUGINS_ERROR));
    plugins.on(Plugins.EventIdentifier.FINISHED, () =>
      event.reply(Constants.IPCRoute.PLUGINS_FINISHED),
    );
    plugins.on(Plugins.EventIdentifier.INSTALL, () =>
      event.reply(Constants.IPCRoute.PLUGINS_INSTALLING),
    );

    // start checking for updates after all replies are wired up
    // @todo: do not hardcode the url
    plugins.checkForUpdates();
  });
}
