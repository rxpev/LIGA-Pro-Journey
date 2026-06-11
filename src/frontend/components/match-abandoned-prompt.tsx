import React from 'react';
import { FaExclamationTriangle } from 'react-icons/fa';
import { useAudio } from '@liga/frontend/hooks';

interface MatchAbandonedPromptProps {
  onClose: () => void;
}

export default function MatchAbandonedPrompt(props: MatchAbandonedPromptProps) {
  const audioNegativeAlert = useAudio('negative-alert.wav');

  React.useEffect(() => {
    audioNegativeAlert();
  }, []);

  return (
    <section className="bg-base-300/80 fixed inset-0 z-[200] flex h-screen w-screen items-center justify-center p-6 backdrop-blur-sm">
      <article className="bg-base-100 border-base-content/10 max-w-lg border p-6 shadow-2xl">
        <header className="stack-y mb-6">
          <div className="flex items-center gap-3">
            <FaExclamationTriangle className="text-warning size-8 shrink-0" />
            <p className="text-lg font-bold">The match was abandoned.</p>
          </div>
          <p>No result was recorded.</p>
        </header>
        <footer className="flex justify-end gap-2">
          <button
            type="button"
            data-interaction-sound="back"
            className="btn btn-primary"
            onClick={props.onClose}
          >
            OK
          </button>
        </footer>
      </article>
    </section>
  );
}
