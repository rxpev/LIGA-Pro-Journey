/**
 * Displays the landing page's start menu.
 *
 * @module
 */
import React from 'react';
import { createPortal } from 'react-dom';
import Wordmark from '@liga/frontend/assets/liga-pro-journey-wordmark.png';
import { upperFirst } from 'lodash';
import { useNavigate } from 'react-router-dom';
import { Constants, Util } from '@liga/shared';
import { AppStateContext } from '@liga/frontend/redux';
import type { AppState } from '@liga/frontend/redux/state';
import { profilesDelete } from '@liga/frontend/redux/actions';
import {
  formatAppRelativeDate,
  getCalendarDateFormat,
  useAudio,
  useTranslation,
} from '@liga/frontend/hooks';
import { FaExclamationTriangle, FaTrash } from 'react-icons/fa';
import awperIcon from '@liga/frontend/assets/awper.png';
import iglIcon from '@liga/frontend/assets/igl.png';
import riflerIcon from '@liga/frontend/assets/rifler.png';

const NO_TEAM_ICON = 'resources://blazonry/noteam.svg';

const ROLE_ICONS: Record<string, string> = {
  AWPER: awperIcon,
  IGL: iglIcon,
  RIFLER: riflerIcon,
};

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
  const { state, dispatch } = React.useContext(AppStateContext);
  const [quitPromptVisible, setQuitPromptVisible] = React.useState(false);
  const [loadPanelOpen, setLoadPanelOpen] = React.useState(false);
  const loadButtonRef = React.useRef<HTMLButtonElement>(null);
  const loadPanelRef = React.useRef<HTMLElement>(null);
  const [loadPanelPosition, setLoadPanelPosition] = React.useState<{
    left: number;
    top: number;
  } | null>(null);
  const [profilePendingDeletion, setProfilePendingDeletion] =
    React.useState<ContinueProfile | null>(null);
  const [deletingProfile, setDeletingProfile] = React.useState(false);
  const [profile] = state.profiles as Array<ContinueProfile>;
  const team = profile?.team || profile?.player?.team;
  const teamBlazon = team?.blazon || NO_TEAM_ICON;
  const teamName = team?.name || 'No Team';
  const dateFormat = getCalendarDateFormat(state.profile?.settings);

  // load audio files
  const audioHover = useAudio('button-hover.wav');
  const audioClick = useAudio('button-click.wav');
  const audioRelease = useAudio('button-release.wav');
  const audioNegativeAlert = useAudio('negative-alert.wav');

  React.useLayoutEffect(() => {
    if (!loadPanelOpen) {
      setLoadPanelPosition(null);
      return;
    }

    const updatePosition = () => {
      const bounds = loadButtonRef.current?.getBoundingClientRect();

      if (bounds) {
        setLoadPanelPosition({ left: bounds.right + 8, top: bounds.top });
      }
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    return () => window.removeEventListener('resize', updatePosition);
  }, [loadPanelOpen]);

  React.useEffect(() => {
    if (!loadPanelOpen) {
      return;
    }

    const closeOnOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target;

      if (
        target instanceof Node &&
        (loadButtonRef.current?.contains(target) || loadPanelRef.current?.contains(target))
      ) {
        return;
      }

      setLoadPanelOpen(false);
    };

    document.addEventListener('pointerdown', closeOnOutsidePointerDown);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointerDown);
  }, [loadPanelOpen]);

  // build the action menu
  const actions = [
    {
      path: '/create',
      label: t('landing.home.create'),
    },
    {
      id: 'load',
      label: t('landing.home.load'),
      disabled: !state.profiles.length,
      onClick: () => setLoadPanelOpen((open) => !open),
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

  const deleteProfile = async () => {
    if (!profilePendingDeletion) {
      return;
    }

    setDeletingProfile(true);
    await api.saves.delete(profilePendingDeletion.id);
    dispatch(profilesDelete([profilePendingDeletion]));
    setDeletingProfile(false);
    setProfilePendingDeletion(null);
  };

  return (
    <React.Fragment>
      <main className="landing-menu-shell">
        <header className="landing-brand" aria-label="LIGA: Pro Journey">
          <img src={Wordmark} alt="LIGA Pro Journey" className="landing-brand__wordmark" />
        </header>
        <nav className="landing-menu" aria-label="Main menu">
          {!!profile && (
            <section
              className="landing-menu-button landing-menu-button--active landing-continue"
              onClick={() => navigate('/connect/' + profile.id)}
              onPointerEnter={audioHover}
              onPointerDown={audioClick}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  audioClick();
                  navigate('/connect/' + profile.id);
                }
              }}
            >
              <span className="landing-menu-button__label">{t('landing.home.continue')}</span>
              <img
                src={teamBlazon}
                alt={teamName}
                title={teamName}
                className="landing-continue__team-logo"
              />
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
                    ref={item.id === 'load' ? loadButtonRef : undefined}
                    disabled={item.disabled}
                    onClick={item.onClick ? item.onClick : () => navigate(item.path)}
                    className={`landing-menu-button ${
                      item.id === 'load' && loadPanelOpen ? 'landing-menu-button--expanded' : ''
                    }`}
                    onPointerEnter={audioHover}
                    onPointerDown={item.noClickSound ? undefined : audioClick}
                    onKeyDown={(event) => {
                      if (!item.noClickSound && (event.key === 'Enter' || event.key === ' ')) {
                        audioClick();
                      }
                    }}
                  >
                    <span className="landing-menu-button__label">{item.label}</span>
                  </button>
                );
            }
          })}
        </nav>
      </main>
      {loadPanelOpen && (
        <aside
          ref={loadPanelRef}
          className="landing-load-panel"
          aria-label="Load career"
          style={
            loadPanelPosition
              ? { left: loadPanelPosition.left, top: loadPanelPosition.top }
              : { visibility: 'hidden' }
          }
        >
          <header className="landing-load-panel__header">
            <div>
              <p className="landing-load-panel__eyebrow">Career archive</p>
            </div>
          </header>
          <section className="landing-load-panel__list">
            {state.profiles.map((savedProfile) => {
              const savedCareer = savedProfile as ContinueProfile;
              const savedTeam = savedCareer.team || savedCareer.player?.team;
              const savedTeamBlazon = savedTeam?.blazon || NO_TEAM_ICON;
              const savedTeamName = savedTeam?.name || 'No Team';
              const role = savedCareer.player?.role || 'RIFLER';
              const roleIcon = ROLE_ICONS[role] || riflerIcon;

              return (
                <article key={savedCareer.id} className="landing-save-card">
                  <button
                    type="button"
                    className="landing-save-card__load"
                    onClick={() => navigate('/connect/' + savedCareer.id)}
                    onPointerEnter={audioHover}
                    onPointerDown={audioClick}
                  >
                    <img
                      src={savedTeamBlazon}
                      alt={savedTeamName}
                      className="landing-save-card__crest"
                    />
                    <span className="landing-save-card__details">
                      <strong>{savedCareer.name}</strong>
                      <span>{savedTeamName}</span>
                      <small>
                        {upperFirst(formatAppRelativeDate(savedCareer.updatedAt, dateFormat))}
                      </small>
                    </span>
                    <span className="landing-save-card__role" title={role}>
                      <span className="landing-save-card__role-icon">
                        <img src={roleIcon} alt="" />
                      </span>
                      <span>{role}</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="landing-save-card__delete"
                    aria-label={`Delete ${savedCareer.name}`}
                    onClick={() => setProfilePendingDeletion(savedCareer)}
                    onPointerEnter={audioHover}
                    onPointerDown={audioNegativeAlert}
                  >
                    <FaTrash />
                  </button>
                </article>
              );
            })}
          </section>
        </aside>
      )}
      <p className="fixed right-7 bottom-6 z-20 text-2xl font-semibold text-white">
        {state.appInfo?.version}
      </p>
      {quitPromptVisible &&
        createPortal(
          <section className="landing-quit-confirmation fixed inset-0 z-50 flex h-screen w-screen items-center justify-center p-6">
            <article className="landing-quit-confirmation__dialog">
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
                  className="landing-quit-confirmation__button"
                  onMouseDown={audioRelease}
                  onClick={() => setQuitPromptVisible(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="landing-quit-confirmation__button landing-quit-confirmation__button--confirm"
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
      {profilePendingDeletion &&
        createPortal(
          <section className="landing-confirmation fixed inset-0 z-50 flex items-center justify-center p-6">
            <article>
              <p className="landing-confirmation__eyebrow">Delete career</p>
              <h3>{profilePendingDeletion.name}</h3>
              <p>{t('landing.delete.subtitle')}</p>
              <footer>
                <button
                  type="button"
                  onClick={() => setProfilePendingDeletion(null)}
                  onPointerDown={audioRelease}
                >
                  {t('landing.delete.cancel')}
                </button>
                <button type="button" onClick={deleteProfile} onPointerDown={audioNegativeAlert}>
                  {deletingProfile && <span className="loading loading-spinner loading-xs" />}
                  {t('shared.delete')}
                </button>
              </footer>
            </article>
          </section>,
          document.body,
        )}
    </React.Fragment>
  );
}
