/**
 * Configure application settings.
 *
 * @module
 */
import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { cloneDeep, isNull, set } from 'lodash';
import { Constants, Util } from '@liga/shared';
import { cx } from '@liga/frontend/lib';
import { AppStateContext } from '@liga/frontend/redux';
import { useAudio, useTranslation } from '@liga/frontend/hooks';
import {
  FaDownload,
  FaExclamationTriangle,
  FaFolderOpen,
  FaInfoCircle,
  FaTrashAlt,
} from 'react-icons/fa';
import { ReduxActions } from '@liga/frontend/redux/actions';
import cz75AutoIcon from '@liga/frontend/assets/weapons/2D/cz75a.svg';
import m4a1sIcon from '@liga/frontend/assets/weapons/2D/m4a1_silencer.svg';
import uspsIcon from '@liga/frontend/assets/weapons/2D/usp_silencer.svg';

/** @enum */
enum Tab {
  GENERAL,
  CALENDAR,
  GAME_SETTINGS,
}

const weaponSettings = [
  {
    icon: uspsIcon,
    label: 'Equip USP-S',
    path: 'gameSettings.isUSP',
    setting: 'isUSP',
  },
  {
    icon: m4a1sIcon,
    label: 'Equip M4A1-S',
    path: 'gameSettings.isM4A1',
    setting: 'isM4A1',
  },
  {
    icon: cz75AutoIcon,
    label: 'Equip CZ75-Auto',
    path: 'gameSettings.isCZ',
    setting: 'isCZ',
  },
] as const;

/**
 * Exports this module.
 *
 * @exports
 */
export default function () {
  const location = useLocation();
  const navigate = useNavigate();
  const routeState = location.state as {
    inCareer?: boolean;
    returnToPlayMatchId?: number;
    tab?: string;
  } | null;
  const t = useTranslation('windows');
  const { state, dispatch } = React.useContext(AppStateContext);
  const audioRelease = useAudio('button-release.wav');
  const audioClick = useAudio('button-click.wav');
  const audioNegativeAlert = useAudio('negative-alert.wav');
  const [activeTab, setActiveTab] = React.useState(
    routeState?.tab === 'game-settings'
      ? Tab.GAME_SETTINGS
      : Tab.GENERAL,
  );
  const returnToPlayMatchId = routeState?.returnToPlayMatchId;
  const [settings, setSettings] = React.useState(Util.loadSettings(state.profile.settings));
  const [appStatus, setAppStatus] = React.useState<NodeJS.ErrnoException>();
  const [arenaModeStatus, setArenaModeStatus] = React.useState<Awaited<
    ReturnType<typeof api.app.arenaModeStatus>
  > | null>(null);
  const [arenaModeBusy, setArenaModeBusy] = React.useState(false);
  const [arenaModeError, setArenaModeError] = React.useState<string | null>(null);
  const [legacyBackfillBusy, setLegacyBackfillBusy] = React.useState(false);
  const [legacyBackfillProgress, setLegacyBackfillProgress] = React.useState<{
    completed: number;
    total: number;
    percent: number;
  } | null>(null);
  const [legacyBackfillConfirmVisible, setLegacyBackfillConfirmVisible] = React.useState(false);
  const hasAttemptedDedicatedDetection = React.useRef(false);
  const GAME_SLUG = Constants.Game.CSGO;

  // load settings
  React.useEffect(() => {
    if (!state.profile) {
      return;
    }

    const localSettings = Util.loadSettings(state.profile.settings);
    localSettings.general.game = GAME_SLUG;

    // if paths are not explicitly initialized then
    // we detect steam and game paths together
    // which avoids a race-condition
    if (localSettings.general.steamPath === null || localSettings.general.gamePath === null) {
      Promise.all([api.app.detectSteam(), api.app.detectGame(GAME_SLUG)]).then(
        ([steamPath, gamePath]) => {
          const modified = cloneDeep(localSettings);
          modified.general.game = GAME_SLUG;
          modified.general.steamPath = steamPath;
          modified.general.gamePath = gamePath;
          setSettings(modified);
        },
      );
      return;
    }

    setSettings(localSettings);
  }, [state.profile]);

  React.useEffect(() => {
    hasAttemptedDedicatedDetection.current = false;
  }, [state.profile?.id]);

  // validate game installation path
  React.useEffect(() => {
    // if paths are not explicitly initialized
    // then we won't send a status check yet
    if (settings.general.steamPath === null || settings.general.gamePath === null) {
      return;
    }

    api.app.status(settings).then((status) => setAppStatus(status ? JSON.parse(status) : null));
  }, [settings]);

  React.useEffect(() => {
    api.app
      .arenaModeStatus(settings)
      .then(setArenaModeStatus)
      .catch(() => setArenaModeStatus(null));
  }, [settings.arenaMode.equalizerApoConfigPath]);

  React.useEffect(() => {
    const removeListener = api.ipc.on(
      Constants.IPCRoute.PROFILES_NPC_MATCH_STATS_BACKFILL_PROGRESS,
      (progress: typeof legacyBackfillProgress) => {
        setLegacyBackfillProgress(progress);
      },
    );

    return () => {
      removeListener();
    };
  }, []);

  // handle settings updates
  const onSettingsUpdate = (path: string, value: unknown) => {
    const modified = cloneDeep(settings);
    set(modified, path, value);

    // 1) immediate update for this screen
    setSettings(modified);

    const json = JSON.stringify(modified);

    // 2) immediate update for the whole app (critical)
    dispatch({
      type: ReduxActions.PROFILE_UPDATE,
      payload: {
        ...state.profile,
        settings: json,
      },
    });

    // 3) persistence
    api.profiles.update({
      where: { id: state.profile.id },
      data: { settings: json },
    });
  };

  const onToggleSettingsUpdate = (path: string, checked: boolean) => {
    (checked ? audioClick : audioRelease)();
    onSettingsUpdate(path, checked);
  };

  const onFullscreenSettingsUpdate = (checked: boolean) => {
    onToggleSettingsUpdate('general.fullscreen', checked);
    api.window.setFullscreen(checked);
  };

  const onArenaModeInstall = async () => {
    setArenaModeBusy(true);
    setArenaModeError(null);

    try {
      const status = await api.app.installArenaMode(settings);
      setArenaModeStatus(status);

      if (status.detectedVstPluginPath && !settings.arenaMode.vstPluginPath) {
        onSettingsUpdate('arenaMode.vstPluginPath', status.detectedVstPluginPath);
      }
    } catch (error) {
      setArenaModeError((error as Error)?.message || 'Could not install Arena Mode.');
    } finally {
      setArenaModeBusy(false);
    }
  };

  const onArenaModeUninstall = async () => {
    setArenaModeBusy(true);
    setArenaModeError(null);

    try {
      const status = await api.app.uninstallArenaMode(settings);
      setArenaModeStatus(status);
    } catch (error) {
      setArenaModeError((error as Error)?.message || 'Could not delete Arena Mode.');
    } finally {
      setArenaModeBusy(false);
    }
  };

  const onLegacyBackfillNpcMatchStats = async () => {
    setLegacyBackfillConfirmVisible(false);
    setLegacyBackfillBusy(true);
    setLegacyBackfillProgress({ completed: 0, total: 0, percent: 0 });

    try {
      const result = await api.profiles.backfillNpcMatchStats();
      dispatch({
        type: ReduxActions.PROFILE_UPDATE,
        payload: result.profile,
      });
      setLegacyBackfillProgress({ completed: result.completed, total: result.total, percent: 100 });
    } finally {
      setLegacyBackfillBusy(false);
    }
  };

  React.useEffect(() => {
    if (
      !state.profile ||
      settings.general.dedicatedServerPath ||
      hasAttemptedDedicatedDetection.current
    ) {
      return;
    }

    hasAttemptedDedicatedDetection.current = true;

    api.app.detectDedicatedServer().then((detectedPath) => {
      if (!detectedPath) {
        return;
      }

      onSettingsUpdate('general.dedicatedServerPath', detectedPath);
    });
  }, [state.profile, settings.general.dedicatedServerPath]);

  // steam and game path validation
  const steamPathError = React.useMemo(() => {
    if (!appStatus) {
      return;
    }
    const [, match] = appStatus.path.match(/(steam\.exe)/) || [];
    return match ? appStatus.path : '';
  }, [appStatus]);
  const gamePathError = React.useMemo(() => {
    if (!appStatus) {
      return;
    }
    const [, match] = appStatus.path.match(/((?:csgo|hl|hl2)\.exe)/) || [];
    return match ? appStatus.path : '';
  }, [appStatus]);
  const showLegacyBackfillNpcMatchStats =
    !!routeState?.inCareer &&
    !!state.profile &&
    (!state.profile.simulateNpcMatchStats || legacyBackfillBusy);

  return (
    <main>
      <header role="tablist" className="tabs-box tabs sticky top-0 left-0 rounded-none">
        {Object.keys(Tab)
          .filter((tabKey) => isNaN(Number(tabKey)))
          .map((tabKey: keyof typeof Tab) => (
            <a
              key={tabKey + '__tab'}
              role="tab"
              className={cx('tab capitalize', Tab[tabKey] === activeTab && 'tab-active')}
              onClick={() => setActiveTab(Tab[tabKey])}
            >
              {tabKey.replace('_', ' ').toLowerCase()}
            </a>
          ))}
      </header>
      <form className="form-ios h-full">
        {activeTab === Tab.GENERAL && (
          <fieldset>
            <section>
              <header>
                <p>{t('settings.themeTitle')}</p>
              </header>
              <article>
                <select
                  className="select"
                  onChange={(event) => onSettingsUpdate('general.theme', event.target.value)}
                  value={settings.general.theme || Constants.ThemeType.SYSTEM}
                >
                  {Object.values(Constants.ThemeType).map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </article>
            </section>
            <section>
              <header>
                <p>{t('settings.fullscreenTitle')}</p>
              </header>
              <article>
                <input
                  type="checkbox"
                  data-interaction-sound="none"
                  className="toggle"
                  onChange={(event) => onFullscreenSettingsUpdate(event.target.checked)}
                  checked={settings.general.fullscreen}
                  value={String(settings.general.fullscreen)}
                />
              </article>
            </section>
            <section>
              <header>
                <p>{t('settings.discordPresenceTitle')}</p>
              </header>
              <article>
                <input
                  type="checkbox"
                  data-interaction-sound="none"
                  className="toggle"
                  onChange={(event) =>
                    onToggleSettingsUpdate('general.discordPresence', event.target.checked)
                  }
                  checked={settings.general.discordPresence}
                  value={String(settings.general.discordPresence)}
                />
              </article>
            </section>
            <section>
              <header>
                <p>{t('settings.volumeTitle')}</p>
              </header>
              <article>
                <input
                  type="range"
                  className="range range-sm"
                  min={0}
                  max={1}
                  step={0.01}
                  value={settings.general.volume}
                  onChange={(event) => onSettingsUpdate('general.volume', event.target.value)}
                />
              </article>
            </section>
            <section>
              <header>
                <p>{t('settings.musicVolumeTitle')}</p>
              </header>
              <article>
                <input
                  type="range"
                  className="range range-sm"
                  min={0}
                  max={1}
                  step={0.01}
                  value={settings.general.musicVolume}
                  onChange={(event) =>
                    onSettingsUpdate('general.musicVolume', event.target.value)
                  }
                />
              </article>
            </section>
            <section>
              <header>
                <p>{t('settings.faceitMatchFoundTuneTitle')}</p>
              </header>
              <article>
                <select
                  className="select"
                  onChange={(event) =>
                    onSettingsUpdate('general.faceitMatchFoundTune', event.target.value || null)
                  }
                  value={settings.general.faceitMatchFoundTune || ''}
                >
                  {Constants.FaceitMatchFoundTunes.map((tune) => (
                    <option key={tune.value || 'off'} value={tune.value || ''}>
                      {tune.label}
                    </option>
                  ))}
                </select>
              </article>
            </section>
            <section>
              <header>
                <p>{t('settings.steamTitle')}</p>
                <p>
                  e.g.: <code>C:\Program Files\Steam</code>
                </p>
                {!!steamPathError && (
                  <span className="tooltip" data-tip={String(steamPathError)}>
                    <FaExclamationTriangle className="text-error" />
                  </span>
                )}
              </header>
              <article className="join">
                <input
                  readOnly
                  type="text"
                  className="input join-item bg-base-200 cursor-default text-sm"
                  value={settings.general.steamPath || ''}
                />
                <button
                  type="button"
                  className="btn join-item"
                  onClick={() =>
                    api.app
                      .dialog(Constants.WindowIdentifier.Modal, {
                        properties: ['openDirectory'],
                      })
                      .then(
                        (dialogData) =>
                          !dialogData.canceled &&
                          onSettingsUpdate('general.steamPath', dialogData.filePaths[0]),
                      )
                  }
                >
                  <FaFolderOpen />
                </button>
              </article>
            </section>
            <section>
              <header>
                <p>{t('settings.gamePathTitle')}</p>
                <p>{t('settings.gamePathSubtitle')}</p>
                {!!gamePathError && (
                  <span className="tooltip" data-tip={String(gamePathError)}>
                    <FaExclamationTriangle className="text-error" />
                  </span>
                )}
              </header>
              <article className="join">
                <input
                  readOnly
                  type="text"
                  className="input join-item bg-base-200 cursor-default text-sm"
                  value={settings.general.gamePath || ''}
                />
                <button
                  type="button"
                  className="btn join-item"
                  onClick={() =>
                    api.app
                      .dialog(Constants.WindowIdentifier.Modal, {
                        properties: ['openDirectory'],
                      })
                      .then(
                        (dialogData) =>
                          !dialogData.canceled &&
                          onSettingsUpdate('general.gamePath', dialogData.filePaths[0]),
                      )
                  }
                >
                  <FaFolderOpen />
                </button>
              </article>
            </section>
            <section>
              <header>
                <p>Dedicated Server Path</p>
                <p>Path to your CS:GO Dedicated Server (srcds) installation.</p>
              </header>
              <article className="join">
                <input
                  readOnly
                  type="text"
                  className="input join-item bg-base-200 cursor-default text-sm"
                  value={settings.general.dedicatedServerPath || ''}
                />
                <button
                  type="button"
                  className="btn join-item"
                  onClick={() =>
                    api.app
                      .dialog(Constants.WindowIdentifier.Modal, {
                        properties: ['openDirectory'],
                      })
                      .then(
                        (dialogData) =>
                          !dialogData.canceled &&
                          onSettingsUpdate('general.dedicatedServerPath', dialogData.filePaths[0]),
                      )
                  }
                >
                  <FaFolderOpen />
                </button>
              </article>
            </section>
            <section>
              <header>
                <p>Game Launch Timeout</p>
                <p>Increase if your game generally needs more time to start up.</p>
              </header>
              <article>
                <input
                  type="number"
                  min={1}
                  className="input join-item bg-base-200 text-sm"
                  value={settings.general.gameLaunchTimeout}
                  onChange={(event) =>
                    onSettingsUpdate(
                      'general.gameLaunchTimeout',
                      Math.max(
                        1,
                        Number(event.target.value) || Constants.Settings.general.gameLaunchTimeout,
                      ),
                    )
                  }
                />
              </article>
            </section>
            <section>
              <header>
                <p>{t('settings.launchOptionsTitle')}</p>
                <p>{t('settings.launchOptionsSubtitle')}</p>
              </header>
              <article>
                <input
                  type="text"
                  className="input join-item bg-base-200 text-sm"
                  value={settings.general.gameLaunchOptions || ''}
                  onChange={(event) =>
                    onSettingsUpdate('general.gameLaunchOptions', event.target.value)
                  }
                />
              </article>
            </section>
            <section>
              <header>
                <p>{t('settings.logLevelTitle')}</p>
              </header>
              <article>
                <select
                  className="select"
                  onChange={(event) => onSettingsUpdate('general.logLevel', event.target.value)}
                  value={settings.general.logLevel}
                >
                  {Object.values(Constants.LogLevel).map((level) => (
                    <option key={level} value={level}>
                      {level}
                    </option>
                  ))}
                </select>
              </article>
            </section>
            {showLegacyBackfillNpcMatchStats && (
              <section className="border-warning/40 bg-warning/5 mt-8 border-t pt-6">
                <header>
                  <p>Simulate NPC Player Statistics</p>
                  <p>
                    Enable statistic simulation for non-user matches to give all players generated
                    scoreboards, ratings, kills, deaths, assists, and map-level match details. This
                    can significantly slow down calendar simulation and may be problematic on
                    low-end PCs.
                  </p>
                </header>
                <article className="flex min-w-64 flex-col items-end gap-3">
                  {legacyBackfillBusy && (
                    <div className="w-full">
                      <progress
                        className="progress progress-warning w-full"
                        value={legacyBackfillProgress?.percent ?? 0}
                        max="100"
                      />
                      <p className="text-base-content/70 mt-2 text-right text-xs">
                        {legacyBackfillProgress?.total
                          ? `${legacyBackfillProgress.completed} / ${legacyBackfillProgress.total} matches`
                          : 'Preparing backfill...'}
                      </p>
                    </div>
                  )}
                  <input
                    type="checkbox"
                    data-interaction-sound="none"
                    className="toggle"
                    checked={legacyBackfillBusy}
                    disabled={legacyBackfillBusy}
                    value={String(legacyBackfillBusy)}
                    onChange={(event) => {
                      if (!event.target.checked) {
                        return;
                      }

                      audioNegativeAlert();
                      setLegacyBackfillConfirmVisible(true);
                    }}
                  />
                </article>
              </section>
            )}
          </fieldset>
        )}
        {activeTab === Tab.GAME_SETTINGS && (
          <fieldset>
            <section>
              <header>
                <p>Equipment</p>
                <p>Choose the weapons your player equips in CS:GO.</p>
              </header>
            </section>
            {weaponSettings.map((weapon) => (
              <section key={weapon.path}>
                <header>
                  <p className="flex items-center gap-4 not-italic">
                    <span className="border-base-content/20 flex h-14 w-24 shrink-0 items-center justify-center overflow-hidden border-r pr-4">
                      <img
                        alt=""
                        className="h-10 w-20 object-contain"
                        draggable={false}
                        src={weapon.icon}
                      />
                    </span>
                    <span>{weapon.label}</span>
                  </p>
                </header>
                <article>
                  <input
                    type="checkbox"
                    data-interaction-sound="none"
                    className="toggle"
                    onChange={(event) => onToggleSettingsUpdate(weapon.path, event.target.checked)}
                    checked={settings.gameSettings[weapon.setting]}
                    value={String(settings.gameSettings[weapon.setting])}
                  />
                </article>
              </section>
            ))}
            <section className="border-base-content/10 mt-8 border-t pt-6">
              <header>
                <p>Arena Mode (BETA)</p>
                <p>
                  Recommended! Add reverb & crowd noise to your playoff matches for maximum
                  immersion.
                </p>
              </header>
              <article>
                <input
                  type="checkbox"
                  data-interaction-sound="none"
                  className="toggle"
                  onChange={(event) =>
                    onToggleSettingsUpdate('arenaMode.enabled', event.target.checked)
                  }
                  checked={settings.arenaMode.enabled}
                  value={String(settings.arenaMode.enabled)}
                />
              </article>
            </section>
            {!!returnToPlayMatchId && (
              <section>
                <header>
                  <p>Pending match</p>
                  <p>Your map veto has been saved. Return to the match when Arena Mode is ready.</p>
                </header>
                <article>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => navigate('/play', { state: returnToPlayMatchId })}
                  >
                    Return to match
                  </button>
                </article>
              </section>
            )}
            <section>
              <header>
                <p>Equalizer APO Config</p>
                <p>Folder containing Equalizer APO config.txt.</p>
              </header>
              <article className="join">
                <input
                  type="text"
                  className="input join-item bg-base-200 text-sm"
                  value={settings.arenaMode.equalizerApoConfigPath || ''}
                  onChange={(event) =>
                    onSettingsUpdate('arenaMode.equalizerApoConfigPath', event.target.value)
                  }
                />
                <button
                  type="button"
                  className="btn join-item"
                  onClick={() =>
                    api.app
                      .dialog(Constants.WindowIdentifier.Modal, {
                        properties: ['openDirectory'],
                      })
                      .then(
                        (dialogData) =>
                          !dialogData.canceled &&
                          onSettingsUpdate(
                            'arenaMode.equalizerApoConfigPath',
                            dialogData.filePaths[0],
                          ),
                      )
                  }
                >
                  <FaFolderOpen />
                </button>
              </article>
            </section>
            <section>
              <header>
                <p>Valhalla Supermassive DLL</p>
                <p>VST2 plugin path.</p>
              </header>
              <article className="join">
                <input
                  type="text"
                  className="input join-item bg-base-200 text-sm"
                  value={settings.arenaMode.vstPluginPath || ''}
                  onChange={(event) =>
                    onSettingsUpdate('arenaMode.vstPluginPath', event.target.value)
                  }
                />
                <button
                  type="button"
                  className="btn join-item"
                  onClick={() =>
                    api.app
                      .dialog(Constants.WindowIdentifier.Modal, {
                        properties: ['openFile'],
                        filters: [{ name: 'VST plugins', extensions: ['dll'] }],
                      })
                      .then(
                        (dialogData) =>
                          !dialogData.canceled &&
                          onSettingsUpdate('arenaMode.vstPluginPath', dialogData.filePaths[0]),
                      )
                  }
                >
                  <FaFolderOpen />
                </button>
              </article>
            </section>
            <section>
              <header>
                <p>Install State</p>
                <p className={arenaModeStatus?.installed ? 'text-success' : 'text-error'}>
                  {arenaModeStatus?.installed ? 'Arena Mode installed' : 'Arena Mode not installed'}
                </p>
                <p
                  className={arenaModeStatus?.equalizerApoInstalled ? 'text-success' : 'text-error'}
                >
                  Equalizer APO:{' '}
                  {arenaModeStatus?.equalizerApoInstalled ? 'installed' : 'not detected'}
                </p>
                <p
                  className={
                    arenaModeStatus?.valhallaSupermassiveInstalled ? 'text-success' : 'text-error'
                  }
                >
                  Valhalla Supermassive:{' '}
                  {arenaModeStatus?.valhallaSupermassiveInstalled ? 'installed' : 'not detected'}
                </p>
                {!!arenaModeError && <p className="text-error">{arenaModeError}</p>}
              </header>
              <article className="join">
                <span
                  className="tooltip tooltip-left flex items-center px-3"
                  data-tip="Install downloads Equalizer APO for Windows audio processing and Valhalla Supermassive for the arena reverb effect. During setup, choose the playback device used by CS:GO. A PC restart may be required before Equalizer APO affects sound. Changing paths is not recommended; default paths are easiest for LIGA to detect and manage."
                >
                  <FaInfoCircle className="text-info" />
                </span>
                <button
                  type="button"
                  title="Install Arena Mode"
                  className="btn btn-primary btn-sm join-item"
                  disabled={arenaModeBusy}
                  onClick={onArenaModeInstall}
                >
                  <FaDownload />
                </button>
                <button
                  type="button"
                  title="Delete Arena Mode"
                  data-interaction-sound="none"
                  className="btn btn-error btn-sm join-item"
                  disabled={arenaModeBusy || !arenaModeStatus?.installed}
                  onClick={onArenaModeUninstall}
                  onMouseDown={audioNegativeAlert}
                >
                  <FaTrashAlt />
                </button>
              </article>
            </section>
          </fieldset>
        )}
        {activeTab === Tab.CALENDAR && (
          <fieldset>
            <section>
              <header>
                <p>{t('settings.calendarDateFormatTitle')}</p>
                <p>{t('settings.calendarDateFormatSubtitle')}</p>
              </header>
              <article>
                <select
                  className="select"
                  onChange={(event) =>
                    onSettingsUpdate('calendar.calendarDateFormat', event.target.value)
                  }
                  value={settings.calendar.calendarDateFormat}
                >
                  {Object.values(Constants.CalendarDateFormat).map((format) => (
                    <option key={format} value={format}>
                      {format}
                    </option>
                  ))}
                </select>
              </article>
            </section>

            <section>
              <header>
                <p>{t('settings.loopTitle')}</p>
              </header>
              <article className="stack-x join">
                <input
                  type="number"
                  min="1"
                  className="input join-item"
                  value={settings.calendar.maxIterations}
                  onChange={(event) =>
                    onSettingsUpdate('calendar.maxIterations', event.target.value)
                  }
                />
                <select
                  className="join-item select"
                  onChange={(event) => onSettingsUpdate('calendar.unit', event.target.value)}
                  value={settings.calendar.unit}
                >
                  {Object.values(Constants.CalendarUnit).map((unit) => (
                    <option key={unit} value={unit}>
                      {unit}
                    </option>
                  ))}
                </select>
              </article>
            </section>
          </fieldset>
        )}
      </form>
      {legacyBackfillConfirmVisible && (
        <section className="bg-base-300/80 fixed inset-0 z-50 flex items-center justify-center p-6 backdrop-blur-sm">
          <article className="bg-base-100 border-base-content/10 max-w-lg border p-6 shadow-2xl">
            <header className="stack-y mb-6">
              <div className="flex items-center gap-3">
                <FaExclamationTriangle className="text-warning size-8 shrink-0" />
                <p className="text-lg font-bold">Simulate NPC Player Statistics?</p>
              </div>
              <p>
                This setting will permanently turn on NPC statistic simulation for this save and
                cannot be turned off again.
              </p>
              <p>
                LIGA will also simulate statistics for eligible past NPC matches. This might take a
                long while depending on how far advanced the save is.
              </p>
              <p>
                Future calendar simulation can be significantly slower and may be problematic on
                low-end PCs.
              </p>
            </header>
            <footer className="flex justify-end gap-2">
              <button
                type="button"
                data-interaction-sound="back"
                className="btn"
                onClick={() => setLegacyBackfillConfirmVisible(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                data-interaction-sound="none"
                className="btn btn-warning"
                onClick={onLegacyBackfillNpcMatchStats}
              >
                Enable permanently
              </button>
            </footer>
          </article>
        </section>
      )}
    </main>
  );
}
