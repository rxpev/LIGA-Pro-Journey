/**
 * Connects to a saved career.
 *
 * @module
 */
import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Constants } from '@liga/shared';
import { useAudio, useTranslation } from '@liga/frontend/hooks';
import { FaExclamationTriangle } from 'react-icons/fa';

/**
 * Exports this module.
 *
 * @exports
 */
export default function () {
  const t = useTranslation('windows');
  const { id } = useParams();
  const navigate = useNavigate();
  const [status, setStatus] = React.useState('');
  const [integrityLockout, setIntegrityLockout] = React.useState<null | {
    title: string;
    message: string;
  }>(null);
  const audioNegativeAlert = useAudio('negative-alert.wav');
  const audioRelease = useAudio('button-release.wav');

  React.useEffect(() => {
    Promise.resolve(setStatus(t('landing.connect.flushing')))
      .then(() => api.database.disconnect())
      .then(() => Promise.resolve(setStatus(t('shared.connectingToDatabase'))))
      .then(() => api.database.connect(id))
      .then(async (result) => {
        if (result?.blocked && result.reason === 'FACEIT_ELO_TAMPERED') {
          audioNegativeAlert();
          setIntegrityLockout({
            title: 'FACEIT Integrity Check Failed',
            message: 'FACEIT ELO has been manually altered. Revert changes to continue.',
          });
          return false;
        }

        if (result?.blocked && result.reason === 'SAVE_TAMPERED') {
          audioNegativeAlert();
          setIntegrityLockout({
            title: 'Save Integrity Check Failed',
            message: 'This career save has been manually altered. Revert changes to continue.',
          });
          return false;
        }

        return true;
      })
      .then((connected) => {
        if (!connected) return false;

        return Promise.resolve(setStatus(t('landing.connect.connected'))).then(() => true);
      })
      .then((connected) => {
        if (!connected) return;

        api.window.open(Constants.WindowIdentifier.Main);
        api.window.close(Constants.WindowIdentifier.Landing);
      });
  }, []);

  return (
    <React.Fragment>
      <main className="frosted center h-full w-2/5 p-5 xl:w-1/3">
        <header className="center gap-6">
          <span className="loading loading-bars loading-lg" />
          <p>{status}</p>
        </header>
      </main>

      {integrityLockout && (
        <section className="bg-base-300/80 fixed inset-0 z-50 flex h-screen w-screen items-center justify-center p-6 backdrop-blur-sm">
          <article className="bg-base-100 border-base-content/10 max-w-lg border p-6 shadow-2xl">
            <header className="stack-y mb-6">
              <div className="flex items-center gap-3">
                <FaExclamationTriangle className="text-warning size-8 shrink-0" />
                <p className="text-lg font-bold">{integrityLockout.title}</p>
              </div>
              <p>{integrityLockout.message}</p>
            </header>
            <footer className="flex justify-end">
              <button
                type="button"
                data-interaction-sound="back"
                className="btn btn-primary"
                onMouseDown={audioRelease}
                onClick={() => navigate('/', { replace: true })}
              >
                Main Menu
              </button>
            </footer>
          </article>
        </section>
      )}
    </React.Fragment>
  );
}
