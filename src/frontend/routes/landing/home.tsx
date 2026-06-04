/**
 * Displays the landing page's start menu.
 *
 * @module
 */
import React from 'react';
import { createPortal } from 'react-dom';
import Logo from '@liga/frontend/assets/icon.png';
import { upperFirst } from 'lodash';
import { useNavigate } from 'react-router-dom';
import { Constants, Util } from '@liga/shared';
import { AppStateContext } from '@liga/frontend/redux';
import type { AppState } from '@liga/frontend/redux/state';
import {
  formatAppRelativeDate,
  getCalendarDateFormat,
  useAudio,
  useTranslation,
} from '@liga/frontend/hooks';
import { FaClock, FaExclamationTriangle } from 'react-icons/fa';
import awperIcon from '@liga/frontend/assets/awper.png';
import iglIcon from '@liga/frontend/assets/igl.png';
import riflerIcon from '@liga/frontend/assets/rifler.png';

const ROLE_ICONS: Record<string, string> = {
  AWPER: awperIcon,
  IGL: iglIcon,
  RIFLER: riflerIcon,
};

const ROLE_BADGE_STYLES: Record<string, string> = {
  AWPER: 'bg-purple-300',
  IGL: 'bg-green-300',
  RIFLER: 'bg-blue-300',
};

const NO_TEAM_ICON = 'resources://blazonry/noteam.svg';

const QUIT_ALERT_DELAY = 700;

type ContinueProfile = AppState['profiles'][number] & {
  player?: {
    role?: string | null;
    team?: {
      name?: string | null;
      blazon?: string | null;
    } | null;
  } | null;
  team?: {
    name?: string | null;
    blazon?: string | null;
  } | null;
};

/**
 * Exports this module.
 *
 * @exports
 */
export default function () {
  const navigate = useNavigate();
  const t = useTranslation('windows');
  const { state } = React.useContext(AppStateContext);
  const [quitPromptVisible, setQuitPromptVisible] = React.useState(false);
  const [profile] = state.profiles as Array<ContinueProfile>;
  const role = profile?.player?.role || 'RIFLER';
  const roleIcon = ROLE_ICONS[role] || riflerIcon;
  const roleBadgeStyle = ROLE_BADGE_STYLES[role] || ROLE_BADGE_STYLES.RIFLER;
  const team = profile?.team || profile?.player?.team;
  const teamBlazon = team?.blazon || NO_TEAM_ICON;
  const teamName = team?.name || 'No Team';
  const dateFormat = getCalendarDateFormat(state.profile?.settings);

  // load audio files
  const audioHover = useAudio('button-hover.wav');
  const audioClick = useAudio('button-click.wav');
  const audioRelease = useAudio('button-release.wav');
  const audioNegativeAlert = useAudio('negative-alert.wav');

  // build the action menu
  const actions = [
    {
      path: '/create',
      label: t('landing.home.create'),
    },
    {
      path: '/load',
      label: t('landing.home.load'),
      disabled: !state.profiles.length,
    },
    {
      path: '/exhibition',
      label: t('landing.home.exhibition'),
    },
    {
      type: 'divider',
    },
    {
      label: t('shared.settings'),
      onClick: () =>
        api.window.send<ModalRequest>(Constants.WindowIdentifier.Modal, {
          target: '/settings',
        }),
    },
    {
      label: t('shared.quit'),
      onClick: () => {
        audioNegativeAlert();
        setQuitPromptVisible(true);
      },
      noClickSound: true,
    },
    {
      type: 'divider',
    },
  ];

  return (
    <main className="frosted center h-full w-2/5 p-5 xl:w-1/3">
      <header className="mb-5">
        <img src={Logo} className="size-32 object-cover" />
      </header>
      <nav className="menu w-full gap-2">
        {!!profile && (
          <section
            className="bg-base-content/10 hover:bg-base-content/20 flex cursor-pointer items-center gap-5 rounded-md p-5"
            onClick={() => navigate('/connect/' + profile.id)}
            onMouseEnter={audioHover}
            onMouseDown={audioClick}
          >
            <figure>
              <FaClock className="size-12" />
            </figure>
            <article className="stack-y w-full min-w-0">
              <h2>{t('landing.home.continue')}</h2>
              <span className="divider mt-0 mb-0" />
              <div className="flex items-center justify-between gap-5">
                <aside className="min-w-0">
                  <p>{profile.name}</p>
                  <p>
                    <em>{upperFirst(formatAppRelativeDate(profile.updatedAt, dateFormat))}</em>
                  </p>
                  <p className="text-muted">
                    <em>{Util.getSaveFileName(profile.id)}</em>
                  </p>
                </aside>
                <aside className="flex shrink-0 items-center gap-4">
                  <span
                    title={role}
                    className={`inline-grid size-9 place-items-center rounded-full ${roleBadgeStyle}`}
                  >
                    <img src={roleIcon} alt={role} className="size-8 object-contain opacity-95" />
                  </span>
                  <div className="flex max-w-32 items-center gap-2">
                    <img
                      src={teamBlazon}
                      alt={teamName}
                      title={teamName}
                      className="size-9 shrink-0 object-contain"
                    />
                    <span className="truncate text-sm">{teamName}</span>
                  </div>
                </aside>
              </div>
            </article>
          </section>
        )}
        {actions.map((item, idx) => {
          switch (item.type) {
            case 'divider':
              return <span key={item.type + idx} className="divider mt-0 mb-0" />;
            default:
              return (
                <button
                  key={item.label}
                  disabled={item.disabled}
                  onClick={item.onClick ? item.onClick : () => navigate(item.path)}
                  className="btn btn-ghost btn-md btn-block"
                  onMouseEnter={audioHover}
                  onMouseDown={item.noClickSound ? undefined : audioClick}
                >
                  {item.label}
                </button>
              );
          }
        })}
      </nav>
      <footer className="w-full px-2">
        <p>
          <small>{state.appInfo?.version}</small>
        </p>
      </footer>
      {quitPromptVisible &&
        createPortal(
          <section className="bg-base-300/80 fixed inset-0 z-50 flex h-screen w-screen items-center justify-center p-6 backdrop-blur-sm">
            <article className="bg-base-100 border-base-content/10 max-w-lg border p-6 shadow-2xl">
              <header className="stack-y mb-6">
                <div className="flex items-center gap-3">
                  <FaExclamationTriangle className="text-warning size-8 shrink-0" />
                  <p className="text-lg font-bold">
                    Are you sure you want to quit the application?
                  </p>
                </div>
              </header>
              <footer className="flex justify-end gap-2">
                <button
                  type="button"
                  className="btn"
                  onMouseDown={audioRelease}
                  onClick={() => setQuitPromptVisible(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-error"
                  onClick={async () => {
                    audioNegativeAlert();
                    await Util.sleep(QUIT_ALERT_DELAY);
                    api.app.quit();
                  }}
                >
                  Quit
                </button>
              </footer>
            </article>
          </section>,
          document.body,
        )}
    </main>
  );
}
