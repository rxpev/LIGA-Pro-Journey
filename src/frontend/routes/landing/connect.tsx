/**
 * Connects to a saved career.
 *
 * @module
 */
import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Constants } from '@liga/shared';
import { useTranslation } from '@liga/frontend/hooks';
import { FaExclamationTriangle, FaLock } from 'react-icons/fa';
import faceitLogo from '@liga/frontend/assets/faceit/faceit.png';

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
  const [faceitLockout, setFaceitLockout] = React.useState(false);

  React.useEffect(() => {
    Promise.resolve(setStatus(t('landing.connect.flushing')))
      .then(() => api.database.disconnect())
      .then(() => Promise.resolve(setStatus(t('shared.connectingToDatabase'))))
      .then(() => api.database.connect(id))
      .then(async (result) => {
        if (result?.blocked && result.reason === 'FACEIT_ELO_TAMPERED') {
          setFaceitLockout(true);
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

      {faceitLockout && (
        <section className="fixed inset-0 z-50 grid place-items-center bg-black/65 px-6 backdrop-blur-sm">
          <article className="relative w-full max-w-xl overflow-hidden border border-[#ff5500]/70 bg-[#080808] shadow-2xl shadow-black/70">
            <div className="absolute inset-x-0 top-0 h-1 bg-[#ff5500]" />
            <div className="absolute top-0 right-0 h-28 w-28 translate-x-10 -translate-y-10 rotate-45 bg-[#ff5500]/15" />

            <header className="flex items-center justify-between border-b border-white/10 px-6 py-5">
              <img src={faceitLogo} className="h-8 select-none object-contain" />
              <div className="flex items-center gap-2 text-xs font-bold tracking-[0.24em] text-[#ff5500] uppercase">
                <FaLock className="size-3" />
                Save Locked
              </div>
            </header>

            <main className="px-6 py-8">
              <div className="flex gap-5">
                <figure className="grid size-14 shrink-0 place-items-center border border-[#ff5500]/70 bg-[#ff5500]/15 text-[#ff5500]">
                  <FaExclamationTriangle className="size-7" />
                </figure>
                <section className="space-y-4">
                  <h1 className="text-2xl font-black tracking-normal text-white uppercase">
                    FACEIT Integrity Check Failed
                  </h1>
                  <p className="text-base leading-7 text-white/80">
                    FACEIT ELO has been manually altered. Revert changes to continue.
                  </p>
                </section>
              </div>
            </main>

            <footer className="flex justify-end border-t border-white/10 bg-white/[0.03] px-6 py-4">
              <button
                className="btn border-[#ff5500] bg-[#ff5500] px-8 font-bold text-black hover:border-[#ff7a2f] hover:bg-[#ff7a2f]"
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
