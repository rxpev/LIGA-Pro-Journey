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
  coachName?: string;
  coachSignatureFont?: string | null;
};

const signatureFonts: Record<string, string> = {
  ANTICALLY: "'SIGNATURE ANTICALLY', cursive",
  CALVIN_FALLEN: "'SIGNATURE CALVIN FALLEN', cursive",
  EASY_FREE: "'SIGNATURE EASY FREE', cursive",
};

export default function TrialContract() {
  const { state } = useLocation() as { state: TrialContractState | null };
  if (!state) return null;

  const goal =
    state.goalType === 'WIN_RATE'
      ? `Win rate of ${state.goalValue}% across the trial period`
      : `Average rating of ${Number(state.goalValue).toFixed(2)} across the trial period`;

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
      <article className="border-base-content/15 relative flex h-full w-full flex-col overflow-hidden border">
        <header className="border-base-content/15 bg-base-200/35 flex min-h-26 shrink-0 items-center border-b px-9 py-6 pr-20 sm:min-h-32 sm:px-10">
          <div className="flex min-w-0 items-center gap-5">
            <Image
              src={state.teamBlazon || 'resources://blazonry/noteam.svg'}
              className="size-16 shrink-0 object-contain sm:size-20"
            />
            <div className="min-w-0">
              <h1 className="truncate text-base font-black tracking-[0.16em] uppercase sm:text-xl">
                {state.teamName}
              </h1>
              <span className="text-primary mt-1.5 block text-xs font-black tracking-[0.2em] uppercase sm:text-sm">
                Trial agreement
              </span>
            </div>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-8 py-9 sm:px-12 sm:py-11">
          <div className="w-full max-w-6xl">
            <p className="text-base-content/65 max-w-5xl text-base leading-relaxed sm:text-lg">
              Invitation for a short term trial period for {state.teamName}. In order for a
              permanent contract to come into consideration for the management board the following
              performance goal has to be met.
            </p>

            <dl className="mt-8 flex w-full max-w-2xl flex-col">
              <div className="border-base-content/10 flex items-center gap-5 border-b py-5">
                <div className="bg-base-content/8 flex size-12 shrink-0 items-center justify-center rounded-full">
                  <FaCalendarAlt className="text-base-content/70 size-5" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <dt className="text-base-content/60 text-sm font-black uppercase">
                    Trial length
                  </dt>
                  <dd className="mt-1.5 text-xl leading-tight font-black">
                    {state.series} Matches
                  </dd>
                </div>
              </div>
              <div className="border-base-content/10 flex items-center gap-5 border-b py-5">
                <div className="bg-base-content/8 flex size-12 shrink-0 items-center justify-center rounded-full">
                  <FaUsers className="text-base-content/70 size-5" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <dt className="text-base-content/60 text-sm font-black uppercase">
                    Roster details
                  </dt>
                  <dd className="mt-1.5 truncate text-xl leading-tight font-black">
                    Replacing {state.replacedPlayer}
                  </dd>
                </div>
              </div>
              <div className="flex items-center gap-5 py-5">
                <div className="bg-primary/10 flex size-12 shrink-0 items-center justify-center rounded-full">
                  <FaBullseye className="text-primary size-6" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <dt className="text-primary text-sm font-black tracking-[0.16em] uppercase">
                    Performance goal
                  </dt>
                  <dd className="mt-1.5 text-lg leading-snug font-black">{goal}</dd>
                </div>
              </div>
            </dl>
          </div>

          <div className="mt-auto pt-10 sm:pt-12">
            <div className="border-base-content/65 relative h-12 w-72 border-b">
              <span
                className="text-base-content absolute bottom-[-0.15rem] left-8 inline-block -rotate-6 -skew-x-6 text-4xl leading-none tracking-[-0.08em]"
                style={{
                  fontFamily:
                    signatureFonts[state.coachSignatureFont ?? ''] ??
                    "'SIGNATURE ANTICALLY', cursive",
                }}
              >
                {state.coachName || 'Head Coach'}
              </span>
            </div>
          </div>
        </div>

        <footer className="border-base-content/10 bg-base-200/20 flex shrink-0 justify-end border-t px-8 py-6 sm:px-12 sm:py-8">
          <button
            type="button"
            className="btn btn-primary h-10 min-h-10 gap-2 px-5 text-sm font-black shadow-md"
            onClick={confirmRead}
          >
            <FaCheck className="size-4" aria-hidden="true" /> I have read the trial information
          </button>
        </footer>
      </article>
    </main>
  );
}
