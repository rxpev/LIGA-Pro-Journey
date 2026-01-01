/**
 * Player card component.
 *
 * @module
 */
import React from 'react';
import { Constants, Eagers, Util } from '@liga/shared';
import { cx } from '@liga/frontend/lib';
import { useTranslation } from '@liga/frontend/hooks';
import ak47Icon from '@liga/frontend/assets/ak47.png';
import awpIcon from '@liga/frontend/assets/awp.png';

/** @type {Player} */
type Player = Awaited<ReturnType<typeof api.players.all<typeof Eagers.player>>>[number];

/** @interface */
interface XPBarProps {
  max: number;
  value: number;
  className?: string;
  gains?: number;
  high?: number;
  low?: number;
  subtitle?: string;
  title?: string;
}

/** @interface */
interface PlayerCardProps extends React.ComponentProps<'article'> {
  game: Constants.Game;
  player: Omit<Player, 'team'>;
  className?: string;
  compact?: boolean;
  noStats?: boolean;

  // Kept for type-compatibility, but no longer rendered as buttons
  onClickStarter?: () => void;
  onClickTransferListed?: () => void;
  onClickViewOffers?: () => void;
  onClickRelease?: () => void;
}

/**
 * XP bar.
 *
 * @param props Root props.
 * @component
 * @function
 */
export function XPBar(props: XPBarProps) {
  return (
    <div className={cx('stack-y', props.className)}>
      {!!props.title && (
        <div className="stack-x justify-between text-xs">
          <p title={props.title.replace(/(delay|time)/i, 'speed')} className="truncate capitalize">
            {props.title.replace(/(delay|time)/i, 'speed')}
            {!!props.gains && (
              <span className="text-success font-mono">
                &nbsp;+{Util.toOptionalDecimal(Math.abs(props.gains))}
              </span>
            )}
          </p>
          {!!props.subtitle && <p className="font-mono">{props.subtitle}</p>}
        </div>
      )}
      <div className="stack-x w-full items-center">
        {!!props.high && !!props.low && (
          <meter
            className="inverted"
            value={props.value}
            max={props.max}
            low={props.low}
            high={props.high}
          />
        )}
        {(!props.high || !props.low) && (
          <progress className="progress" value={props.value} max={props.max} />
        )}
      </div>
    </div>
  );
}

/**
 * Exports this module.
 *
 * @param props Root props.
 * @component
 * @exports
 */
export default function (props: PlayerCardProps) {

  const roleRaw = props.player.role;

  // Treat both the enum value and legacy/string values as “sniper”
  const isSniper =
    roleRaw === Constants.PlayerRole.SNIPER ||
    String(roleRaw).toLowerCase() === 'awper' ||
    String(roleRaw).toLowerCase() === 'sniper';

  const isIgl =
    roleRaw === Constants.UserRole.IGL

  const t = useTranslation('components');
  if (props.compact) {
    return (
      <article
        className={cx(
          'grid grid-cols-4 items-center divide-x border',
          'divide-base-content/10 border-base-content/10 bg-base-200 border-b-0',
          props.className,
        )}
      >
        <figure className="center">
          <img
            src={props.player.avatar || 'resources://avatars/empty.png'}
            className="h-12 w-auto"
          />
        </figure>
        <aside className="col-span-2 px-4">
          <h3>{props.player.name}</h3>
          <p className="line-clamp-1 text-sm">
            <span className={cx('fp', props.player.country.code.toLowerCase())} />
            <span>&nbsp;{props.player.country.name}</span>
          </p>
        </aside>
        <aside className="stack-y center gap-0 px-2">
          <p className="text-muted text-xs">{t('playerCard.totalXP')}</p>
          <p className="text-2xl! font-black">
            {Math.floor(props.player.xp ?? 0)}
          </p>
        </aside>
      </article>
    );
  }
  return (
    <article
      className={cx(
        'stack-y h-fit gap-0! divide-y border',
        'divide-base-content/10 border-base-content/10 bg-base-200',
        props.className,
      )}
    >
      <header className="flex gap-4 px-10">
        <figure className="center w-1/3">
          <img
            src={props.player.avatar || 'resources://avatars/empty.png'}
            className="h-12 w-auto"
          />
        </figure>
        <nav className="w-2/3 py-4">
          <h3 className="truncate">{props.player.name}</h3>
          <p className="text-sm">
            <span className={cx('fp', props.player.country.code.toLowerCase())} />
            <span>&nbsp;{props.player.country.name}</span>
          </p>
        </nav>
      </header>
      <aside className="px-10 py-4">
        <label className="fieldset p-0 text-xs">
          <p>Role</p>
          <div className="mt-2 flex items-center justify-between">
            <span
              className={cx(
                'text-sm font-semibold',
                isSniper ? 'text-purple-300' : isIgl ? 'text-green-300' : 'text-blue-300',
              )}
            >
              {isSniper ? 'AWPer' : isIgl ? 'IGL' : 'Rifler'}
            </span>
            <img
              src={isSniper ? awpIcon : ak47Icon}
              alt={isSniper ? 'AWP icon' : 'AK-47 icon'}
              className={cx('h-4 w-auto opacity-80')}
              style={
                !isSniper && isIgl
                  ? { filter: 'hue-rotate(90deg) saturate(2) brightness(1.1)' }
                  : undefined
              }
            />
          </div>
        </label>
      </aside>
      <aside className="px-10 py-4">
        <XPBar
          title={t('playerCard.totalXP')}
          subtitle={`${Math.floor(props.player.xp ?? 0)}/100`}
          value={props.player.xp ?? 0}
          max={100}
        />
      </aside>
    </article>
  );
}
