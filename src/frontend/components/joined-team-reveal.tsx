import React from 'react';
import Image from '@liga/frontend/components/image';
import joinedTeamBackground from '@liga/frontend/assets/screens/joinedteam.png';
import joinedTeamBackground2 from '@liga/frontend/assets/screens/joinedteam2.png';

const backgrounds = [joinedTeamBackground, joinedTeamBackground2];

type JoinedTeamRevealProps = {
  teamName: string;
  teamBlazon?: string | null;
  kicker: string;
  title: string;
  term: string;
  copy: string;
  onComplete: () => void;
  className?: string;
};

export default function JoinedTeamReveal(props: JoinedTeamRevealProps) {
  const [exiting, setExiting] = React.useState(false);
  const finished = React.useRef(false);
  const exitTimeout = React.useRef<number>();
  const background = React.useMemo(
    () => backgrounds[Math.floor(Math.random() * backgrounds.length)],
    [],
  );

  const finish = React.useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    setExiting(true);
    exitTimeout.current = window.setTimeout(props.onComplete, 700);
  }, [props.onComplete]);

  React.useEffect(() => {
    const timeout = window.setTimeout(finish, 6500);
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ' || event.key === 'Escape') finish();
    };
    window.addEventListener('keydown', dismiss);

    return () => {
      window.clearTimeout(timeout);
      if (exitTimeout.current != null) window.clearTimeout(exitTimeout.current);
      window.removeEventListener('keydown', dismiss);
    };
  }, [finish]);

  return (
    <main
      className={`joined-team-interstitial relative h-screen w-screen cursor-default overflow-hidden bg-[#030714] text-white ${
        exiting ? 'joined-team-interstitial-exiting' : ''
      } ${props.className ?? ''}`}
      aria-live="polite"
      aria-label={props.title}
    >
      <img
        src={background}
        alt=""
        className="joined-team-background absolute inset-0 h-full w-full object-cover"
      />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(1,4,14,0.12),rgba(1,4,14,0.08)_55%,rgba(1,4,14,0.62))]" />

      <section className="relative z-10 flex h-full w-full flex-col items-center px-10 py-[7vh] text-center">
        <p className="joined-team-kicker text-[clamp(0.7rem,1vw,0.95rem)] font-black tracking-[0.42em] text-white/55 uppercase">
          {props.kicker}
        </p>
        <h1 className="joined-team-title mt-[2vh] text-[clamp(2.4rem,5.2vw,5.8rem)] leading-none font-black tracking-[-0.025em] uppercase drop-shadow-[0_5px_20px_rgba(0,0,0,0.65)]">
          {props.title}
        </h1>

        <div className="joined-team-crest my-auto flex size-[clamp(8rem,18vw,14rem)] items-center justify-center">
          <div className="absolute size-[clamp(8rem,18vw,14rem)] rounded-full bg-blue-500/12 blur-2xl" />
          <Image
            src={props.teamBlazon || 'resources://blazonry/noteam.svg'}
            className="relative max-h-full max-w-full object-contain drop-shadow-[0_12px_28px_rgba(0,0,0,0.75)]"
          />
        </div>

        <p className="joined-team-term text-[clamp(1.35rem,2.7vw,2.7rem)] leading-none font-black tracking-[0.04em] uppercase drop-shadow-lg">
          {props.term}
        </p>
        <p className="joined-team-copy mt-[clamp(2.5rem,8vh,6rem)] max-w-3xl text-[clamp(0.65rem,1vw,0.95rem)] leading-relaxed font-bold tracking-[0.06em] text-white/78 uppercase drop-shadow-md">
          {props.copy}
        </p>

        <button
          type="button"
          className="joined-team-continue mt-5 flex items-center gap-3 text-[0.65rem] font-black tracking-[0.22em] text-white/55 uppercase transition-colors hover:text-white"
          onClick={finish}
        >
          <span className="joined-team-loader size-5 rounded-full border-2 border-white/25 border-t-white" />
          Continue
        </button>
      </section>
    </main>
  );
}
