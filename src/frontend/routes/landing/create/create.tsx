/**
 * Provides the route components for the Create Career workflow.
 *
 * @module
 */
import React from 'react';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { useAudio, useTranslation } from '@liga/frontend/hooks';
import { cx } from '@liga/frontend/lib';
import { FaArrowLeft } from 'react-icons/fa';
import { AppStateContext } from '@liga/frontend/redux';

/**
 * Top-level create career component.
 *
 * @component
 */
export default function () {
  const t = useTranslation('windows');
  const navigate = useNavigate();
  const location = useLocation();
  const audioRelease = useAudio('button-release.wav');
  const audioClick = useAudio('button-click.wav');
  const audioNegativeAlert = useAudio('negative-alert.wav');
  const { state } = React.useContext(AppStateContext);

  // infer the currently loaded step
  const currentStep = React.useMemo(() => {
    const pathInfo = location.pathname.match(/(\d+)/);

    if (!pathInfo) {
      return 1;
    }

    return parseInt(pathInfo[1]);
  }, [location.pathname]);

  // the steps for creating a new career.
  const steps = React.useMemo(
    () => [
      {
        id: 'player-info',
        title: 'Player Info',
        subtitle: 'Create your player identity',
        path: '/create',
      },
      { id: 'role', title: 'Role', subtitle: 'Choose your playstyle', path: '/create/2' },
    ],
    [t],
  );
  const canAccessRole =
    Boolean(state.windowData.landing?.user?.name?.trim()) &&
    Boolean(state.windowData.landing?.user?.countryId);

  return (
    <section className="landing-create-panel">
      <header className="landing-create-panel__intro">
        <button
          type="button"
          className="landing-create-panel__back"
          aria-label="Back to main menu"
          onClick={() => navigate('/')}
          onMouseDown={audioRelease}
        >
          <FaArrowLeft />
        </button>
        <div>
          <h1>New Career</h1>
        </div>
      </header>

      <nav className="landing-create-panel__header" aria-label="New career progress">
        <ul aria-label="New career progress">
          {steps.map((step, idx) => (
            <li
              key={step.id}
              className={cx(
                'landing-create-panel__step',
                idx + 1 === currentStep && 'landing-create-panel__step--active',
              )}
              onClick={() => {
                if (step.id === 'role' && !canAccessRole) {
                  audioNegativeAlert();
                  return;
                }
                audioClick();
                navigate(step.path);
              }}
            >
              <strong>0{idx + 1}</strong>
              <span>
                <b>{step.title}</b>
                <small>{step.subtitle}</small>
              </span>
            </li>
          ))}
        </ul>
      </nav>

      <main className="landing-create-panel__content">
        <Outlet />
      </main>
    </section>
  );
}
