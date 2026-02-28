/**
 * Match historial of the last N-matches.
 *
 * @module
 */
import React from 'react';
import { Constants, Eagers } from '@liga/shared';
import { cx } from '@liga/frontend/lib';
import { useFormatAppDate } from '@liga/frontend/hooks/use-FormatAppDate';

/** @type {Match} */
type Match = Awaited<ReturnType<typeof api.matches.upcoming<typeof Eagers.match>>>[number];

/** @interface */
interface Props {
  matches: Array<Match>;
  teamId: number;
  className?: string;
}

/**
 * Exports this module.
 *
 * @param props Root props.
 * @exports
 */
export default function (props: Props) {
  const badgeStyle = 'badge badge-xs';
  const fmtDate = useFormatAppDate();
  const matches = props.matches || [];

  // fill in data until it meets the minimum
  const data = React.useMemo<Array<Match | undefined>>(() => {
    if (matches.length < Constants.Application.SQUAD_MIN_LENGTH) {
      return [
        ...matches,
        ...Array(Constants.Application.SQUAD_MIN_LENGTH - matches.length),
      ];
    }

    return matches;
  }, [matches]);

  return (
    <div className={cx('stack-x gap-1!', props.className)}>
      {data.map((match, idx) => {
        if (!match) {
          return (
            <span
              key={idx + props.teamId + '__loading'}
              className={cx(badgeStyle, 'badge-outline')}
            />
          );
        }

        const result = match.competitors.find(
          (competitor) => competitor.teamId === props.teamId,
        )?.result;

        if (result === undefined) {
          return (
            <span
              key={match.id + props.teamId + '__loading'}
              className={cx(badgeStyle, 'badge-ghost')}
            />
          );
        }

        return (
          <span
            key={match.id + props.teamId + '__result'}
            title={['Win on ', 'Draw on ', 'Loss on '][result] + fmtDate(match.date)}
            className={cx(badgeStyle, ['badge-success', 'badge-ghost', 'badge-error'][result])}
          />
        );
      })}
    </div>
  );
}
