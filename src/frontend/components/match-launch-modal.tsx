import React from 'react';
import { FaCheck, FaExclamationTriangle, FaFolderOpen, FaSpinner } from 'react-icons/fa';
import { Constants } from '@liga/shared';
import { cx } from '@liga/frontend/lib';
import { useTranslation } from '@liga/frontend/hooks';
import type { PlayingStatus } from '@liga/frontend/redux/state';

export const MATCH_LAUNCH_STATUS_STEPS: Array<PlayingStatus> = [
  'PREPARING_MATCH',
  'COPYING_FILES',
  'STARTING_SERVER',
  'CONNECTING_SERVER',
  'WAITING_FOR_SERVER',
  'STARTING_CLIENT',
  'WATCHING_MATCH',
  'SAVING_RESULTS',
];

interface MatchLaunchModalProps {
  error?: NodeJS.ErrnoException | null;
  onCloseError?: () => void;
  onOpenSettings?: () => void;
  status?: PlayingStatus | null;
  variant?: 'liga' | 'faceit';
}

export default function MatchLaunchModal(props: MatchLaunchModalProps) {
  const t = useTranslation('windows');
  const variant = props.variant || 'liga';
  const statusIndex = Math.max(
    0,
    MATCH_LAUNCH_STATUS_STEPS.findIndex((step) => step === props.status),
  );
  const progressValue = ((statusIndex + 1) / MATCH_LAUNCH_STATUS_STEPS.length) * 100;
  const isInvalidGamePath = props.error?.code === Constants.ErrorCode.EINVAL;
  const isFaceit = variant === 'faceit';

  if (!props.status && !props.error) {
    return null;
  }

  return (
    <section
      className={cx(
        'fixed inset-0 z-[200] flex h-screen w-screen items-center justify-center p-6 backdrop-blur-sm',
        isFaceit ? 'bg-black/85 text-white' : 'bg-base-300/80',
      )}
    >
      {props.status && (
        <article
          className={cx(
            'max-w-lg border p-6 shadow-2xl',
            isFaceit
              ? 'border-[#ff5500]/50 bg-[#111] shadow-[#ff5500]/20'
              : 'bg-base-100 border-base-content/10',
          )}
        >
          <header className="stack-y mb-5">
            <div className="flex items-center gap-3">
              <FaSpinner
                className={cx(
                  'size-8 shrink-0 animate-spin',
                  isFaceit ? 'text-[#ff5500]' : 'text-warning',
                )}
              />
              <p className="text-lg font-bold">{t('main.dashboard.playingMatchTitle')}</p>
            </div>
            <p className={cx('opacity-70', isFaceit && 'text-neutral-300')}>
              {t('main.dashboard.playingMatchSubtitle')}
            </p>
          </header>
          <article className={cx('rounded p-4', isFaceit ? 'bg-black/60' : 'bg-base-200')}>
            <p className="text-sm uppercase opacity-60">{t('main.dashboard.matchStartupStatus')}</p>
            <p className="font-bold">
              {t(`main.dashboard.playingStatus.${props.status || 'PREPARING_MATCH'}`)}
            </p>
            <progress
              className={cx(
                'progress mt-4 w-full',
                isFaceit ? '[&::-moz-progress-bar]:bg-[#ff5500] [&::-webkit-progress-value]:bg-[#ff5500]' : 'progress-warning',
              )}
              value={progressValue}
              max="100"
            />
            <ul className="mt-4 space-y-2 text-sm">
              {MATCH_LAUNCH_STATUS_STEPS.map((step, idx) => {
                const isComplete = idx < statusIndex;
                const isActive = idx === statusIndex;

                return (
                  <li
                    key={step}
                    className={cx(
                      'flex items-center gap-2',
                      isActive && 'font-bold',
                      !isActive && !isComplete && 'opacity-50',
                    )}
                  >
                    {isComplete ? (
                      <FaCheck className={isFaceit ? 'text-[#ff5500]' : 'text-success'} />
                    ) : (
                      <span
                        className={cx(
                          'block size-4 rounded-full border',
                          isFaceit ? 'border-neutral-500' : 'border-base-content/40',
                          isActive && (isFaceit ? 'border-[#ff5500] bg-[#ff5500]' : 'border-warning bg-warning'),
                        )}
                      />
                    )}
                    <span>{t(`main.dashboard.playingStatus.${step}`)}</span>
                  </li>
                );
              })}
            </ul>
          </article>
        </article>
      )}

      {props.error && (
        <article
          className={cx(
            'max-w-lg border p-6 shadow-2xl',
            isFaceit
              ? 'border-[#ff5500]/50 bg-[#111] shadow-[#ff5500]/20'
              : 'bg-base-100 border-base-content/10',
          )}
        >
          <header className="stack-y mb-6">
            <div className="flex items-center gap-3">
              <FaExclamationTriangle
                className={cx('size-8 shrink-0', isFaceit ? 'text-[#ff5500]' : 'text-warning')}
              />
              <p className="text-lg font-bold">
                {t(
                  isInvalidGamePath
                    ? 'main.dashboard.gamePathInvalidTitle'
                    : 'main.dashboard.matchAbandonedTitle',
                )}
              </p>
            </div>
            <p className={cx(isFaceit && 'text-neutral-200')}>
              {t(
                isInvalidGamePath
                  ? 'main.dashboard.gamePathInvalid'
                  : 'main.dashboard.matchAbandonedSubtitle',
              )}
            </p>
            {isInvalidGamePath && !!props.error.path && (
              <p
                className={cx('truncate p-2 text-sm', isFaceit ? 'bg-black/60' : 'bg-base-200')}
                title={props.error.path}
              >
                {props.error.path}
              </p>
            )}
          </header>
          <footer className="flex justify-end gap-2">
            <button
              type="button"
              data-interaction-sound="back"
              className={cx('btn', isFaceit && 'border-neutral-600 bg-neutral-800 text-white hover:bg-neutral-700')}
              onClick={props.onCloseError}
            >
              OK
            </button>
            {isInvalidGamePath && (
              <button
                type="button"
                className={cx('btn btn-primary', isFaceit && 'border-[#ff5500] bg-[#ff5500] text-white hover:border-[#ff7300] hover:bg-[#ff7300]')}
                onClick={props.onOpenSettings}
              >
                <FaFolderOpen />
                {t('main.dashboard.openSettings')}
              </button>
            )}
          </footer>
        </article>
      )}
    </section>
  );
}
