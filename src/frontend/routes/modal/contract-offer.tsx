import React from 'react';
import { FaCalendarAlt, FaCheck, FaFileContract, FaTimes, FaUserTag } from 'react-icons/fa';
import { useLocation } from 'react-router-dom';
import { Constants } from '@liga/shared';
import { Image } from '@liga/frontend/components';
import { AppStateContext } from '@liga/frontend/redux';
import { useAudioControls } from '@liga/frontend/hooks';
import type { Prisma } from '@prisma/client';

type ContractOfferState = {
  transferId: number;
  dialogueId: number;
  teamId: number;
  teamName: string;
  teamBlazon?: string | null;
  coachName: string;
  coachSignatureFont?: string | null;
  contractYears: number;
  playerRole: string;
  postBenchClause: boolean;
  rosterStabilityClause: boolean;
  expiresAt: string;
};

const signatureFonts: Record<string, string> = {
  ANTICALLY: "'SIGNATURE ANTICALLY', cursive",
  CALVIN_FALLEN: "'SIGNATURE CALVIN FALLEN', cursive",
  EASY_FREE: "'SIGNATURE EASY FREE', cursive",
};

type TeamWithPersonas = Prisma.TeamGetPayload<{ include: { personas: true } }>;

export default function ContractOffer() {
  const { state } = useLocation() as { state: ContractOfferState | null };
  const { state: appState } = React.useContext(AppStateContext);
  const [working, setWorking] = React.useState(false);
  const [acceptProgress, setAcceptProgress] = React.useState(0);
  const [coach, setCoach] = React.useState<{ name: string; signatureFont?: string | null } | null>(
    null,
  );
  const [resolvedTeamId, setResolvedTeamId] = React.useState<number | null>(null);
  const signingAudio = useAudioControls('button-signature.wav');

  React.useEffect(() => {
    if (!state) return;
    const hasTeamId = Number.isFinite(state.teamId) && state.teamId > 0;
    api.teams
      .all<{ include: { personas: true } }>({
        where: hasTeamId ? { id: state.teamId } : { name: state.teamName },
        include: { personas: true },
        take: 1,
      })
      .then((teams: TeamWithPersonas[]) => {
        const team = teams[0];
        if (!team) return;
        setResolvedTeamId(team.id);
        const persona =
          team.personas.find((item) => item.role === Constants.PersonaRole.MANAGER) ??
          team.personas.find((item) => item.role === Constants.PersonaRole.ASSISTANT) ??
          team.personas[0];
        if (persona) setCoach(persona);
      });
  }, [state?.teamId, state?.teamName]);

  if (!state) return null;

  const respond = async (accepted: boolean) => {
    setWorking(true);
    try {
      if (accepted) await api.transfers.accept(state.transferId);
      else await api.transfers.reject(state.transferId);
      await api.emails.updateDialogue({
        where: { id: state.dialogueId },
        data: { completed: true },
      });
      api.window.send<ModalRequest>(
        Constants.WindowIdentifier.Main,
        { target: '/inbox', payload: { refreshEmails: true } },
        0,
      );
      api.window.close(Constants.WindowIdentifier.Modal);
    } finally {
      setWorking(false);
    }
  };

  const roleLabels: Record<string, string> = {
    AWPER: 'AWPer',
    IGL: 'IGL',
    RIFLER: 'Rifler',
  };
  const role = roleLabels[state.playerRole.toUpperCase()] ?? state.playerRole;
  const playerName = appState.profile?.player?.name ?? appState.profile?.name ?? '';

  const openTeam = () => {
    const teamId = resolvedTeamId ?? state.teamId;
    api.window.send<ModalRequest>(
      Constants.WindowIdentifier.Main,
      { target: `/teams?teamId=${teamId}` },
      0,
    );
    api.window.close(Constants.WindowIdentifier.Modal);
  };

  return (
    <main className="bg-base-100 h-screen w-screen overflow-hidden">
      <article className="border-base-content/15 relative flex h-full w-full flex-col overflow-hidden border">
        <header className="border-base-content/15 bg-base-200/35 flex min-h-24 shrink-0 items-center border-b px-9 py-4 pr-20 sm:px-10">
          <div className="flex min-w-0 items-center gap-5">
            <Image
              src={state.teamBlazon || 'resources://blazonry/noteam.svg'}
              className="size-14 shrink-0 object-contain sm:size-16"
            />
            <div className="min-w-0">
              <div className="tooltip tooltip-bottom" data-tip="View Team">
                <button
                  type="button"
                  className="hover:text-primary truncate text-left text-base font-black tracking-[0.16em] uppercase transition-colors sm:text-xl"
                  onClick={openTeam}
                >
                  {state.teamName}
                </button>
              </div>
              <span className="text-primary mt-1.5 block text-xs font-black tracking-[0.2em] uppercase sm:text-sm">
                Contract Offer
              </span>
            </div>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-8 py-6 sm:px-12 sm:py-7">
          <p className="text-base-content/65 max-w-4xl text-base leading-relaxed sm:text-lg">
            The management board of{' '}
            <span className="tooltip tooltip-bottom" data-tip="View Team">
              <button
                type="button"
                className="text-base-content hover:text-primary font-bold underline decoration-transparent underline-offset-4 transition-colors hover:decoration-current"
                onClick={openTeam}
              >
                {state.teamName}
              </button>
            </span>{' '}
            is pleased to offer you a place on the team under the following terms.
          </p>

          <dl className="mt-5 flex w-full max-w-2xl flex-col">
            <ContractTerm icon={<FaCalendarAlt />} label="Contract length">
              {state.contractYears} {state.contractYears === 1 ? 'year' : 'years'}
            </ContractTerm>
            <ContractTerm icon={<FaUserTag />} label="Role" last>
              {role}
            </ContractTerm>
          </dl>

          {(state.postBenchClause || state.rosterStabilityClause) && (
            <section className="mt-6 max-w-4xl">
              <h2 className="flex items-center gap-3 text-sm font-black tracking-[0.16em] uppercase">
                <FaFileContract className="text-primary size-5" /> Special clauses
              </h2>
              <ul className="text-base-content/70 mt-3 list-disc space-y-2 pl-6 text-sm leading-snug sm:text-base">
                {state.postBenchClause && (
                  <li>
                    Post-benching termination: If you remain benched for two consecutive months, you
                    may terminate your contract.
                  </li>
                )}
                {state.rosterStabilityClause && (
                  <li>
                    Roster stability: If three of the five active players in place when you sign
                    leave the team, you may request to be benched and transfer-listed.
                  </li>
                )}
              </ul>
            </section>
          )}

          <div className="mt-auto flex items-end justify-between gap-8 pt-5">
            <p className="text-base-content/55 shrink-0 text-sm">
              This offer expires on {new Date(state.expiresAt).toLocaleDateString()}.
            </p>
            <div className="flex items-end gap-10">
              <div className="border-base-content/60 relative h-9 w-40 border-b">
                <span
                  className="text-base-content absolute bottom-[-0.1rem] left-4 inline-block -rotate-6 -skew-x-6 text-3xl leading-none tracking-[-0.08em] whitespace-nowrap"
                  style={{
                    fontFamily:
                      signatureFonts[coach?.signatureFont ?? state.coachSignatureFont ?? ''] ??
                      "'SIGNATURE ANTICALLY', cursive",
                  }}
                >
                  {coach?.name ??
                    (state.coachName && state.coachName !== 'undefined'
                      ? state.coachName
                      : 'Head Coach')}
                </span>
              </div>
              <div
                className="border-base-content/60 relative h-9 w-40 overflow-hidden border-b"
                aria-label="Your signature"
              >
                <span
                  className="text-base-content absolute bottom-[-0.1rem] left-3 inline-block -rotate-5 -skew-x-6 text-3xl leading-none tracking-[-0.08em] whitespace-nowrap"
                  style={{
                    fontFamily: "'SIGNATURE ANTICALLY', cursive",
                  }}
                >
                  {[...playerName].map((character, index, characters) => {
                    const letterProgress = Math.max(
                      0,
                      Math.min(1, acceptProgress * (characters.length + 1) - index),
                    );
                    return (
                      <span
                        key={`${character}-${index}`}
                        className="inline-block origin-bottom-left"
                        style={{
                          opacity: letterProgress,
                          transform: `translateY(${(1 - letterProgress) * 2}px) scale(${0.82 + letterProgress * 0.18})`,
                          filter: `blur(${(1 - letterProgress) * 0.7}px)`,
                        }}
                      >
                        {character === ' ' ? '\u00a0' : character}
                      </span>
                    );
                  })}
                </span>
              </div>
            </div>
          </div>
        </div>

        <footer className="border-base-content/10 bg-base-200/20 flex shrink-0 justify-end gap-3 border-t px-8 py-4 sm:px-12 sm:py-5">
          <HoldButton
            className="btn-ghost"
            disabled={working}
            fillClassName="bg-error/20"
            onComplete={() => respond(false)}
          >
            <FaTimes className="size-4" /> Reject offer
          </HoldButton>
          <HoldButton
            className="btn-primary shadow-md"
            disabled={working}
            fillClassName="bg-base-content/25"
            onProgress={setAcceptProgress}
            onHoldStart={signingAudio.play}
            onHoldEnd={signingAudio.stop}
            onComplete={() => respond(true)}
          >
            <FaCheck className="size-4" /> Sign contract
          </HoldButton>
        </footer>
      </article>
    </main>
  );
}

const HOLD_DURATION_MS = 3000;

function HoldButton(props: {
  children: React.ReactNode;
  className?: string;
  fillClassName: string;
  disabled?: boolean;
  onProgress?: (progress: number) => void;
  onHoldStart?: () => void;
  onHoldEnd?: () => void;
  onComplete: () => void | Promise<void>;
}) {
  const [progress, setProgress] = React.useState(0);
  const frame = React.useRef<number | null>(null);
  const startedAt = React.useRef(0);
  const holding = React.useRef(false);
  const completed = React.useRef(false);

  const cancel = React.useCallback(() => {
    if (completed.current) return;
    holding.current = false;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    setProgress(0);
    props.onProgress?.(0);
    props.onHoldEnd?.();
  }, [props.onHoldEnd, props.onProgress]);

  const start = React.useCallback(() => {
    if (props.disabled || holding.current) return;
    completed.current = false;
    holding.current = true;
    props.onHoldStart?.();
    startedAt.current = performance.now();

    const tick = (now: number) => {
      if (!holding.current) return;
      const next = Math.min(1, (now - startedAt.current) / HOLD_DURATION_MS);
      setProgress(next);
      props.onProgress?.(next);
      if (next >= 1) {
        completed.current = true;
        holding.current = false;
        frame.current = null;
        props.onHoldEnd?.();
        void props.onComplete();
        return;
      }
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  }, [props.disabled, props.onComplete, props.onHoldEnd, props.onHoldStart, props.onProgress]);

  React.useEffect(() => cancel, [cancel]);
  React.useEffect(() => {
    if (props.disabled) cancel();
  }, [props.disabled, cancel]);

  return (
    <button
      type="button"
      className={`btn relative h-10 min-h-10 touch-none overflow-hidden px-5 text-sm font-black ${props.className ?? ''}`}
      disabled={props.disabled}
      aria-label={`Hold to ${typeof props.children === 'string' ? props.children : 'confirm'}`}
      onClick={(event) => event.preventDefault()}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        start();
      }}
      onPointerUp={cancel}
      onPointerCancel={cancel}
      onPointerLeave={cancel}
      onKeyDown={(event) => {
        if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) {
          event.preventDefault();
          start();
        }
      }}
      onKeyUp={(event) => {
        if (event.key === ' ' || event.key === 'Enter') cancel();
      }}
      onBlur={cancel}
    >
      <span
        className={`pointer-events-none absolute inset-y-0 left-0 ${props.fillClassName}`}
        style={{ width: `${progress * 100}%` }}
        aria-hidden="true"
      />
      <span className="pointer-events-none relative z-10 flex items-center gap-2">
        {props.children}
      </span>
    </button>
  );
}

function ContractTerm(props: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-4 py-3.5 ${props.last ? '' : 'border-base-content/10 border-b'}`}
    >
      <div className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-full">
        {props.icon}
      </div>
      <div>
        <dt className="text-base-content/60 text-sm font-black uppercase">{props.label}</dt>
        <dd className="mt-1.5 text-xl leading-tight font-black">{props.children}</dd>
      </div>
    </div>
  );
}
