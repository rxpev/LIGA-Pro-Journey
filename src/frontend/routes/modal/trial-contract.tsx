import React from 'react';
import { FaBullseye, FaCalendarAlt, FaCheck, FaUsers } from 'react-icons/fa';
import { useLocation } from 'react-router-dom';
import { Constants } from '@liga/shared';
import { Image } from '@liga/frontend/components';

export type TrialContractState = {
  emailId: number;
  transferId: number;
  teamName: string;
  teamBlazon?: string | null;
  series: number;
  goalType: 'RATING' | 'WIN_RATE';
  goalValue: number;
  replacedPlayer: string;
};

export default function TrialContract() {
  const { state } = useLocation() as { state: TrialContractState | null };
  if (!state) return null;

  const goal =
    state.goalType === 'WIN_RATE'
      ? `Win at least ${state.goalValue}% of the official series`
      : `Average at least ${Number(state.goalValue).toFixed(2)} rating across the official series`;

  const confirmRead = () => {
    api.window.send<ModalRequest>(
      Constants.WindowIdentifier.Main,
      {
        target: '/inbox',
        payload: { trialInformationRead: { emailId: state.emailId, transferId: state.transferId } },
      },
      0,
    );
    api.window.close(Constants.WindowIdentifier.Modal);
  };

  return (
    <main className="bg-base-100 h-screen w-screen overflow-hidden">
      <article className="flex h-full w-full flex-col overflow-hidden">
        <header className="border-base-content/10 bg-base-200/25 flex shrink-0 items-center border-b px-8 py-5 pr-20">
          <div className="flex min-w-0 items-center gap-4">
            <Image
              src={state.teamBlazon || 'resources://blazonry/noteam.svg'}
              className="size-16 object-contain"
            />
            <div className="min-w-0">
              <h1 className="truncate text-sm font-black tracking-[0.12em] uppercase">
                {state.teamName}
              </h1>
              <span className="text-primary mt-1 block text-[0.65rem] font-black tracking-[0.18em] uppercase">
                Trial agreement
              </span>
            </div>
          </div>
        </header>

        <div className="min-h-0 flex-1 p-5">
          <section className="border-base-content/15 bg-base-200/15 flex h-full min-h-0 flex-col overflow-hidden rounded-xl border">
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
              <div>
                <h2 className="text-2xl font-black">Trial Agreement</h2>
                <p className="text-base-content/55 mt-1 text-sm">
                  A short-term opportunity to join {state.teamName} and demonstrate your
                  performance.
                </p>
              </div>

              <dl className="grid gap-3 sm:grid-cols-2">
                <div className="border-base-content/10 bg-base-200/55 flex items-center gap-4 rounded-xl border p-4">
                  <FaCalendarAlt className="text-base-content/45 size-6 shrink-0" />
                  <div>
                    <dt className="text-base-content/50 text-xs font-bold uppercase">
                      Trial length
                    </dt>
                    <dd className="mt-1 text-lg font-black">{state.series} official series</dd>
                    <span className="text-base-content/45 mt-0.5 block text-xs">
                      Starts immediately
                    </span>
                  </div>
                </div>
                <div className="border-base-content/10 bg-base-200/55 flex items-center gap-4 rounded-xl border p-4">
                  <FaUsers className="text-base-content/45 size-7 shrink-0" />
                  <div>
                    <dt className="text-base-content/50 text-xs font-bold uppercase">
                      Roster position
                    </dt>
                    <dd className="mt-1 text-lg font-black">Replacing {state.replacedPlayer}</dd>
                    <span className="text-base-content/45 mt-0.5 block text-xs">Main lineup</span>
                  </div>
                </div>
              </dl>

              <div className="border-primary/35 bg-primary/10 flex items-center gap-4 rounded-xl border p-5">
                <FaBullseye className="text-primary size-8 shrink-0" />
                <div>
                  <h3 className="text-primary text-xs font-black tracking-wide uppercase">
                    Performance goal
                  </h3>
                  <p className="mt-1 text-base font-bold">{goal}</p>
                </div>
              </div>
            </div>

            <footer className="border-base-content/10 bg-base-200/35 flex shrink-0 justify-end border-t px-6 py-4">
              <button
                type="button"
                className="btn btn-primary shrink-0 gap-2"
                onClick={confirmRead}
              >
                <FaCheck /> I have read the trial information
              </button>
            </footer>
          </section>
        </div>
      </article>
    </main>
  );
}
