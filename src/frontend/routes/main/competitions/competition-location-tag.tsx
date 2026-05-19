/**
 * Competition LAN/Online badge.
 *
 * @module
 */
import React from 'react';
import { cx } from '@liga/frontend/lib';

type LocationTier = {
  lan?: boolean | null;
};

type Props = {
  className?: string;
  tier: LocationTier;
};

/**
 * Exports this module.
 *
 * @exports
 */
export default function CompetitionLocationTag({ className, tier }: Props) {
  const isLan = Boolean(tier.lan);
  const label = isLan ? 'LAN' : 'Online';

  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center rounded border px-1.5 py-0.5 text-[0.62rem] leading-none font-black tracking-wide uppercase',
        isLan
          ? 'border-primary/50 bg-primary/15 text-primary'
          : 'border-info/40 bg-info/10 text-info',
        className,
      )}
      title={label}
    >
      {label}
    </span>
  );
}
