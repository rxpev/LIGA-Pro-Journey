/**
 * Team roster route.
 *
 * @module
 */
import React from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { Constants, Util } from '@liga/shared';
import { cx } from '@liga/frontend/lib';
import { AppStateContext } from '@liga/frontend/redux';
import { useTranslation } from '@liga/frontend/hooks';
import { FaUsers } from 'react-icons/fa';
import {
  addMonths,
  differenceInCalendarDays,
  differenceInCalendarMonths,
  getYear,
  format,
  intervalToDuration,
  startOfMonth,
  startOfYear,
} from 'date-fns';

type RosterPlayer = Awaited<
  ReturnType<
    typeof api.players.all<{
      include: {
        careerStints: {
          include: {
            team: true;
          };
        };
        country: true;
        team: true;
      };
    }>
  >
>[number];

type PlayerTeamRating = {
  maps: number;
  rating: number;
};
type PlayerRatingGame = Awaited<ReturnType<typeof api.matches.playerRatingGames>>[number];
type RatingGamesByPlayer = Record<number, PlayerRatingGame[]>;

type TimelineMode = 'all' | 'year';

type TransferListItem = {
  date: Date;
  from: TransferTeam | null;
  fromBenched: boolean;
  id: string;
  player: RosterPlayer;
  text: React.ReactNode;
  to: TransferTeam | null;
  toBenched: boolean;
};

type TransferTeam = {
  blazon: string | null;
  id: number;
  name: string;
};

const SECTION_LABEL_CLASS = 'text-base leading-none font-bold text-[#9aa8b5]';

enum Rating {
  LOW = 0.95,
  HIGH = 1.05,
}

function getRatingColorClass(rating: number) {
  if (rating <= Rating.LOW) {
    return 'text-error';
  }

  if (rating >= Rating.HIGH) {
    return 'text-success';
  }

  return 'text-inherit';
}

function formatTimeOnTeam(player: RosterPlayer, teamId: number, now: Date) {
  const stints = [...(player.careerStints || [])].sort(
    (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime(),
  );
  const stint = stints
    .reduce<
      Array<{
        endedAt: Date | string | null;
        startedAt: Date | string;
        teamId: number | null;
      }>
    >((spans, item) => {
      const previous = spans.at(-1);

      if (previous?.teamId === item.teamId) {
        previous.endedAt = item.endedAt;
        return spans;
      }

      spans.push({
        endedAt: item.endedAt,
        startedAt: item.startedAt,
        teamId: item.teamId,
      });

      return spans;
    }, [])
    .filter((item) => item.teamId === teamId)
    .at(-1);

  if (!stint) {
    return '-';
  }

  const duration = intervalToDuration({
    start: new Date(stint.startedAt),
    end: stint.endedAt ? new Date(stint.endedAt) : now,
  });
  const parts = [
    duration.years ? `${duration.years} ${duration.years === 1 ? 'year' : 'years'}` : null,
    duration.months ? `${duration.months} ${duration.months === 1 ? 'month' : 'months'}` : null,
  ].filter(Boolean);

  if (parts.length) {
    return parts.join('\n');
  }

  const days = Math.max(1, duration.days || 0);
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}

function statusLabel(player: RosterPlayer) {
  return player.starter ? 'STARTER' : 'BENCHED';
}

function getFirstTeamStintStart(player: RosterPlayer, teamId: number) {
  const starts = (player.careerStints || [])
    .filter((stint) => stint.teamId === teamId)
    .map((stint) => toMs(stint.startedAt));

  return starts.length ? Math.min(...starts) : Number.MAX_SAFE_INTEGER;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function toMs(date: Date | string) {
  return new Date(date).getTime();
}

function formatHoverRating(value: number | null) {
  return value == null || !Number.isFinite(value) ? '-' : value.toFixed(2);
}

function getStintStats(
  games: PlayerRatingGame[] | undefined,
  stint: { endedAt: Date | string | null; startedAt: Date | string },
  teamId: number,
  now: Date,
) {
  const start = new Date(stint.startedAt);
  const end = stint.endedAt ? new Date(stint.endedAt) : now;
  const startMs = start.getTime();
  const endMs = end.getTime();
  const stintGames = (games || []).filter((game) => {
    const gameMs = toMs(game.date);
    return game.teamIds.includes(teamId) && gameMs >= startMs && gameMs <= endMs;
  });
  const ratingSum = stintGames.reduce((sum, game) => sum + game.rating, 0);

  return {
    days: Math.max(1, differenceInCalendarDays(end, start) + 1),
    maps: stintGames.length,
    rating: stintGames.length ? ratingSum / stintGames.length : null,
  };
}

function getTimelineRange(players: RosterPlayer[], teamId: number, now: Date, mode: TimelineMode) {
  const starts = players.flatMap((player) =>
    (player.careerStints || [])
      .filter((stint) => stint.teamId === teamId)
      .map((stint) => toMs(stint.startedAt)),
  );
  const fallbackStart = getLastYearWindowStart(now);
  const allStart = starts.length ? new Date(Math.min(...starts)) : fallbackStart;
  const start = mode === 'year' ? fallbackStart : allStart;

  return {
    end: now,
    start: startOfMonth(start),
  };
}

function getLastYearWindowStart(now: Date) {
  return startOfMonth(addMonths(now, -11));
}

function getMonthTicks(start: Date, end: Date) {
  const count = Math.max(1, differenceInCalendarMonths(end, start));
  const step = count <= 14 ? 1 : count <= 48 ? 3 : 12;

  return [...Array(Math.floor(count / step) + 1)]
    .map((_, index) => index * step)
    .concat(count)
    .filter((value, index, all) => all.indexOf(value) === index)
    .map((index) => {
      const date = addMonths(start, index);
      const left = count ? (index / count) * 100 : 0;
      const allTimeYear = count > 48;

      return {
        date: allTimeYear ? startOfYear(date) : date,
        label: allTimeYear ? String(getYear(date)) : format(date, 'MMM'),
        left,
        style: allTimeYear ? 'year' : 'month',
      };
    });
}

function hasVisibleTeamStint(player: RosterPlayer, teamId: number, startMs: number, endMs: number) {
  return (player.careerStints || []).some((stint) => {
    if (stint.teamId !== teamId) {
      return false;
    }

    return (
      toMs(stint.startedAt) <= endMs && (stint.endedAt ? toMs(stint.endedAt) : endMs) >= startMs
    );
  });
}

function getNoTeamTeam(): TransferTeam {
  return {
    blazon: 'resources://blazonry/noteam.svg',
    id: 0,
    name: 'No Team',
  };
}

function toTransferTeam(team: TransferTeam | null | undefined): TransferTeam {
  return team
    ? {
        blazon: team.blazon,
        id: team.id,
        name: team.name,
      }
    : getNoTeamTeam();
}

function isNoTeam(team: TransferTeam | null | undefined) {
  return (
    !team ||
    team.id === 0 ||
    team.name.toLowerCase() === 'no team' ||
    !!team.blazon?.includes('noteam.svg')
  );
}

function getCareerTransferEvents(
  players: RosterPlayer[],
  team: RouteContextTeams['team'],
): TransferListItem[] {
  const currentTeam = toTransferTeam(team);

  return players.flatMap<TransferListItem>((player) => {
    const stints = [...(player.careerStints || [])].sort(
      (a, b) => toMs(a.startedAt) - toMs(b.startedAt),
    );

    return stints.flatMap<TransferListItem>((stint, index) => {
      const previous = stints[index - 1];
      const next = stints[index + 1];
      const date = new Date(stint.startedAt);

      // A player can leave a team at the end of their final recorded stint
      // without a separate No Team stint being stored afterward.
      if (stint.teamId === team.id && stint.endedAt && !next) {
        return [
          {
            date: new Date(stint.endedAt),
            from: currentTeam,
            fromBenched: !stint.starter,
            id: `release_${player.id}_${stint.id}`,
            player,
            text: (
              <>
                <b>{player.name}</b> parts ways with <b>{team.name}</b>
              </>
            ),
            to: getNoTeamTeam(),
            toBenched: false,
          },
        ];
      }

      if (stint.teamId === team.id && previous?.teamId !== team.id) {
        if (!previous) {
          if (!stint.endedAt || next) {
            return [];
          }

          const endedAt = new Date(stint.endedAt);

          return [
            {
              date: endedAt,
              from: currentTeam,
              fromBenched: !stint.starter,
              id: `release_${player.id}_${stint.id}`,
              player,
              text: (
                <>
                  <b>{player.name}</b> parts ways with <b>{team.name}</b>
                </>
              ),
              to: getNoTeamTeam(),
              toBenched: false,
            },
          ];
        }

        const source = toTransferTeam(previous?.team);

        return [
          {
            date,
            from: source,
            fromBenched: false,
            id: `join_${player.id}_${stint.id}`,
            player,
            text: isNoTeam(source) ? (
              <>
                <b>{player.name}</b> joins <b>{team.name}</b>
              </>
            ) : (
              <>
                <b>{player.name}</b> transfers from <b>{source.name}</b> to <b>{team.name}</b>
              </>
            ),
            to: currentTeam,
            toBenched: !stint.starter,
          },
        ];
      }

      if (previous?.teamId === team.id && stint.teamId !== team.id) {
        const destination = toTransferTeam(stint.team);

        return [
          {
            date,
            from: currentTeam,
            fromBenched: !previous.starter,
            id: `leave_${player.id}_${stint.id}`,
            player,
            text: isNoTeam(destination) ? (
              <>
                <b>{player.name}</b> parts ways with <b>{team.name}</b>
              </>
            ) : (
              <>
                <b>{player.name}</b> transfers from <b>{team.name}</b> to <b>{destination.name}</b>
              </>
            ),
            to: destination,
            toBenched: false,
          },
        ];
      }

      if (
        previous?.teamId === team.id &&
        stint.teamId === team.id &&
        previous.starter &&
        !stint.starter
      ) {
        return [
          {
            date,
            from: currentTeam,
            fromBenched: false,
            id: `bench_${player.id}_${stint.id}`,
            player,
            text: (
              <>
                <b>{player.name}</b> is benched on <b>{team.name}</b>
              </>
            ),
            to: currentTeam,
            toBenched: true,
          },
        ];
      }

      if (
        previous?.teamId === team.id &&
        stint.teamId === team.id &&
        !previous.starter &&
        stint.starter
      ) {
        return [
          {
            date,
            from: currentTeam,
            fromBenched: true,
            id: `reinstate_${player.id}_${stint.id}`,
            player,
            text: (
              <>
                <b>{player.name}</b> is moved to the active roster on <b>{team.name}</b>
              </>
            ),
            to: currentTeam,
            toBenched: false,
          },
        ];
      }

      return [];
    });
  });
}

function formatTransferDate(date: Date) {
  return date.toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function filterTransferItems(items: TransferListItem[], mode: TimelineMode, now: Date) {
  if (mode === 'all') {
    return items;
  }

  const startMs = getLastYearWindowStart(now).getTime();

  return items.filter(
    (item) => item.date.getTime() >= startMs && item.date.getTime() <= now.getTime(),
  );
}

function TeamBadge(props: { benched?: boolean; team: TransferTeam | null }) {
  if (!props.team) {
    return null;
  }

  return (
    <span className="relative grid size-11 shrink-0 place-items-center">
      <img
        src={props.team.blazon || 'resources://blazonry/009400.png'}
        title={props.team.name}
        className="max-h-10 max-w-10 object-contain"
      />
      {props.benched && (
        <span className="absolute right-0 bottom-0 bg-[#1d2630] px-0.5 text-[7px] leading-3 font-black text-[#b6c1ca] uppercase">
          Bench
        </span>
      )}
    </span>
  );
}

function RosterTimeline(props: {
  ratingGamesByPlayer: RatingGamesByPlayer;
  mode: TimelineMode;
  now: Date;
  onModeChange: (mode: TimelineMode) => void;
  players: RosterPlayer[];
  team: RouteContextTeams['team'];
}) {
  const range = React.useMemo(
    () => getTimelineRange(props.players, props.team.id, props.now, props.mode),
    [props.mode, props.now, props.players, props.team.id],
  );
  const ticks = React.useMemo(() => getMonthTicks(range.start, range.end), [range]);
  const timelinePlayers = React.useMemo(
    () =>
      [...props.players].sort(
        (a, b) =>
          getFirstTeamStintStart(a, props.team.id) - getFirstTeamStintStart(b, props.team.id) ||
          a.name.localeCompare(b.name),
      ),
    [props.players, props.team.id],
  );
  const startMs = range.start.getTime();
  const endMs = range.end.getTime();
  const durationMs = Math.max(1, endMs - startMs);
  const visiblePlayers = React.useMemo(
    () =>
      timelinePlayers.filter((player) =>
        hasVisibleTeamStint(player, props.team.id, startMs, endMs),
      ),
    [endMs, props.team.id, startMs, timelinePlayers],
  );

  return (
    <aside className="m-3 mt-4">
      <header className="mb-2 flex items-center justify-between">
        <h3 className={SECTION_LABEL_CLASS}>Roster timeline of {props.team.name}</h3>
        <nav className="join">
          <button
            className={cx('btn join-item btn-xs', props.mode === 'year' && 'btn-active')}
            onClick={() => props.onModeChange('year')}
          >
            Last year
          </button>
          <button
            className={cx('btn join-item btn-xs', props.mode === 'all' && 'btn-active')}
            onClick={() => props.onModeChange('all')}
          >
            All time
          </button>
        </nav>
      </header>
      <section className="border-base-content/10 bg-base-200/55 grid grid-cols-[112px_minmax(0,1fr)] gap-x-4 border p-4">
        <div />
        <div className="relative h-7">
          {ticks.map((tick) => (
            <span
              key={`${tick.date.toISOString()}__timeline_month_label`}
              className={cx(
                'text-muted absolute top-0 -translate-x-1/2 text-xs',
                tick.style === 'year' && 'bg-base-content/10 rounded px-2 py-0.5',
              )}
              style={{ left: `${tick.left}%` }}
            >
              {tick.label}
            </span>
          ))}
        </div>
        {visiblePlayers.map((player) => {
          const stints = (player.careerStints || []).filter(
            (stint) => stint.teamId === props.team.id,
          );

          return (
            <React.Fragment key={`${player.id}__timeline_row`}>
              <button
                type="button"
                className="relative z-10 flex h-7 min-w-0 items-center gap-1 text-left font-bold"
                onClick={() =>
                  api.window.send<ModalRequest>(Constants.WindowIdentifier.Modal, {
                    target: '/transfer',
                    payload: player.id,
                  })
                }
              >
                <span className={cx('fp shrink-0', player.country.code.toLowerCase())} />
                <span className="truncate text-xs">{player.name}</span>
              </button>
              <div className="relative h-7">
                {ticks.map((tick) => (
                  <span
                    key={`${player.id}_${tick.date.toISOString()}__timeline_grid`}
                    className="border-base-content/10 absolute top-0 bottom-0 border-l border-dashed"
                    style={{ left: `${tick.left}%` }}
                  />
                ))}
                {stints.map((stint) => {
                  const stintStart = Math.max(toMs(stint.startedAt), startMs);
                  const stintEnd = Math.min(stint.endedAt ? toMs(stint.endedAt) : endMs, endMs);

                  if (stintEnd < startMs || stintStart > endMs) {
                    return null;
                  }

                  const left = clamp(((stintStart - startMs) / durationMs) * 100, 0, 100);
                  const width = clamp(((stintEnd - stintStart) / durationMs) * 100, 1, 100 - left);
                  const tooltipPosition =
                    left < 14
                      ? 'left-0 translate-x-0'
                      : left + width > 86
                        ? 'right-0 left-auto translate-x-0'
                        : '-translate-x-1/2';
                  const isEdgeTooltip = left < 14 || left + width > 86;
                  const stats = getStintStats(
                    props.ratingGamesByPlayer[player.id],
                    stint,
                    props.team.id,
                    props.now,
                  );

                  return (
                    <span
                      key={`${stint.id}__timeline_segment`}
                      className={cx(
                        'group absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full',
                        stint.starter ? 'bg-[#4a6684]' : 'bg-[#8a2d3a]',
                      )}
                      style={{
                        left: `${left}%`,
                        width: `${width}%`,
                      }}
                      onMouseMove={(event) => {
                        if (isEdgeTooltip) return;
                        const rect = event.currentTarget.getBoundingClientRect();
                        const pointerPosition = ((event.clientX - rect.left) / rect.width) * 100;
                        event.currentTarget.style.setProperty(
                          '--timeline-tooltip-x',
                          `${pointerPosition}%`,
                        );
                      }}
                    >
                      <span
                        className={cx(
                          'pointer-events-none absolute bottom-full z-50 mb-2 hidden w-[265px] border border-[#607186] bg-[#314253] text-[#b8c7d6] shadow-2xl group-hover:block',
                          tooltipPosition,
                        )}
                        style={
                          !isEdgeTooltip ? { left: 'var(--timeline-tooltip-x, 50%)' } : undefined
                        }
                      >
                        <span className="flex h-5 items-center gap-1.5 border-b border-[#607186] bg-[#34485b] px-1.5 text-[10px] font-black text-[#c6d5e4]">
                          <span className={cx('fp shrink-0', player.country.code.toLowerCase())} />
                          <span className="truncate">{player.name}</span>
                          {!stint.starter && (
                            <span className="ml-auto shrink-0 bg-red-500 px-1 text-[9px] leading-3 font-black text-white">
                              B
                            </span>
                          )}
                        </span>
                        <span className="relative grid h-[110px] grid-cols-[90px_1fr] overflow-hidden">
                          {props.team.blazon && (
                            <img
                              src={props.team.blazon}
                              className="absolute right-2 bottom-1 size-20 object-contain opacity-15"
                            />
                          )}
                          <span className="h-full overflow-hidden bg-[#2c3b4a]">
                            <img
                              src={player.avatar || 'resources://avatars/empty.png'}
                              className="h-full w-full object-cover object-top"
                            />
                          </span>
                          <span className="relative z-10 grid grid-rows-3 text-[10px]">
                            <span className="grid grid-cols-[72px_1fr] items-center border-b border-[#607186] px-1.5">
                              <span>Maps played:</span>
                              <span className="text-right font-bold">{stats.maps}</span>
                            </span>
                            <span className="grid grid-cols-[72px_1fr] items-center border-b border-[#607186] px-1.5">
                              <span>Rating:</span>
                              <span className="text-right font-bold">
                                {formatHoverRating(stats.rating)}
                              </span>
                            </span>
                            <span className="grid grid-cols-[72px_1fr] items-center px-1.5">
                              <span>Days:</span>
                              <span className="text-right font-bold">{stats.days}</span>
                            </span>
                          </span>
                        </span>
                      </span>
                    </span>
                  );
                })}
              </div>
            </React.Fragment>
          );
        })}
      </section>
    </aside>
  );
}

function TeamTransfers(props: {
  mode: TimelineMode;
  now: Date;
  onModeChange: (mode: TimelineMode) => void;
  players: RosterPlayer[];
  team: RouteContextTeams['team'];
}) {
  const items = React.useMemo(() => {
    return getCareerTransferEvents(props.players, props.team).sort(
      (a, b) => b.date.getTime() - a.date.getTime(),
    );
  }, [props.players, props.team]);
  const visibleItems = React.useMemo(
    () => filterTransferItems(items, props.mode, props.now),
    [items, props.mode, props.now],
  );

  return (
    <aside className="m-3 mt-4">
      <header className="mb-2 flex items-center justify-between">
        <h3 className={SECTION_LABEL_CLASS}>Transfers for {props.team.name}</h3>
        <nav className="join">
          <button
            className={cx('btn join-item btn-xs', props.mode === 'year' && 'btn-active')}
            onClick={() => props.onModeChange('year')}
          >
            Last year
          </button>
          <button
            className={cx('btn join-item btn-xs', props.mode === 'all' && 'btn-active')}
            onClick={() => props.onModeChange('all')}
          >
            All time
          </button>
        </nav>
      </header>
      {!visibleItems.length && (
        <div className="border-base-content/10 bg-base-200/80 flex h-16 items-center gap-4 border px-4 text-[#9aa8b5]">
          <FaUsers className="text-4xl text-[#748291]" />
          <span>No transfers in this time period</span>
        </div>
      )}
      {!!visibleItems.length && (
        <ul className="border-base-content/10 bg-base-200/80 border">
          {visibleItems.map((item) => (
            <li
              key={item.id}
              className="border-base-content/10 hover:bg-base-content/10 grid min-h-14 grid-cols-[42px_52px_18px_52px_minmax(0,1fr)_76px] items-center gap-1 border-b px-3 last:border-b-0"
            >
              <button
                type="button"
                className="grid size-9 place-items-center overflow-hidden rounded-full bg-[#526171]/40"
                title={`View ${item.player.name}`}
                onClick={() =>
                  api.window.send<ModalRequest>(Constants.WindowIdentifier.Modal, {
                    target: '/transfer',
                    payload: item.player.id,
                  })
                }
              >
                <img
                  src={item.player.avatar || 'resources://avatars/empty.png'}
                  className="h-full w-full object-cover object-top"
                />
              </button>
              <span className="grid place-items-center">
                {item.from?.id && !isNoTeam(item.from) ? (
                  <Link to={`/teams?teamId=${item.from.id}`}>
                    <TeamBadge team={item.from} benched={item.fromBenched} />
                  </Link>
                ) : (
                  <TeamBadge team={item.from} benched={item.fromBenched} />
                )}
              </span>
              <span className="text-center text-[#9aa8b5]">&rarr;</span>
              <span className="grid place-items-center">
                {item.to?.id && !isNoTeam(item.to) ? (
                  <Link to={`/teams?teamId=${item.to.id}`} className="shrink-0">
                    <TeamBadge team={item.to} benched={item.toBenched} />
                  </Link>
                ) : (
                  <TeamBadge team={item.to} benched={item.toBenched} />
                )}
              </span>
              <span className="min-w-0 truncate pl-3 text-sm text-[#aeb9c3]">{item.text}</span>
              <time className="text-right text-xs leading-tight text-[#8392a1]">
                {formatTransferDate(item.date)}
              </time>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

/**
 * Exports this module.
 *
 * @exports
 */
export default function () {
  const t = useTranslation('windows');
  const { state } = React.useContext(AppStateContext);
  const { team } = useOutletContext<RouteContextTeams>();
  const [settings, setSettings] = React.useState(Constants.Settings);
  const [timelineMode, setTimelineMode] = React.useState<TimelineMode>('year');
  const [transferMode, setTransferMode] = React.useState<TimelineMode>('year');
  const [players, setPlayers] = React.useState<RosterPlayer[]>([]);
  const [timelinePlayers, setTimelinePlayers] = React.useState<RosterPlayer[]>([]);
  const [ratingGamesByPlayer, setRatingGamesByPlayer] = React.useState<RatingGamesByPlayer>({});
  const [ratings, setRatings] = React.useState<Record<number, PlayerTeamRating>>({});
  const now = React.useMemo(
    () => (state.profile?.date ? new Date(state.profile.date) : new Date()),
    [state.profile?.date],
  );

  React.useEffect(() => {
    setPlayers([]);
    setTimelinePlayers([]);
    setRatingGamesByPlayer({});
    setRatings({});

    api.players
      .all({
        include: {
          careerStints: {
            include: {
              team: true,
            },
          },
          country: true,
          team: true,
        },
        where: {
          teamId: team.id,
        },
      })
      .then((foundPlayers) => setPlayers(foundPlayers as RosterPlayer[]));
    api.players
      .all({
        include: {
          careerStints: {
            include: {
              team: true,
            },
          },
          country: true,
          team: true,
        },
        where: {
          careerStints: {
            some: {
              teamId: team.id,
            },
          },
        },
      })
      .then((foundPlayers) => setTimelinePlayers(foundPlayers as RosterPlayer[]));
  }, [team.id]);

  React.useEffect(() => {
    if (!state.profile) {
      return;
    }

    setSettings(Util.loadSettings(state.profile.settings));
  }, [state.profile]);

  React.useEffect(() => {
    setRatings({});
    setRatingGamesByPlayer({});

    if (!state.profile?.simulateNpcMatchStats || !timelinePlayers.length) {
      return;
    }

    Promise.all(
      timelinePlayers.map((player) =>
        api.matches.playerRatingGames(player.id).then((games) => {
          const teamGames = games.filter((game) => game.teamIds.includes(team.id));
          const ratingSum = teamGames.reduce((sum, game) => sum + game.rating, 0);

          return [
            player.id,
            games,
            {
              maps: teamGames.length,
              rating: teamGames.length ? ratingSum / teamGames.length : 0,
            },
          ] as const;
        }),
      ),
    ).then((rows) => {
      setRatingGamesByPlayer(
        Object.fromEntries(rows.map(([playerId, games]) => [playerId, games])),
      );
      setRatings(Object.fromEntries(rows.map(([playerId, , rating]) => [playerId, rating])));
    });
  }, [state.profile?.simulateNpcMatchStats, team.id, timelinePlayers]);

  const sortedPlayers = React.useMemo(
    () =>
      [...players].sort(
        (a, b) =>
          Number(b.starter) - Number(a.starter) ||
          Number(a.transferListed) - Number(b.transferListed) ||
          a.name.localeCompare(b.name),
      ),
    [players],
  );

  const openPlayerTransferModal = React.useCallback((playerId: number) => {
    api.window.send<ModalRequest>(Constants.WindowIdentifier.Modal, {
      target: '/transfer',
      payload: playerId,
    });
  }, []);

  return (
    <section>
      <header className="border-base-content/10 m-3 mb-0 border-b pb-3">
        <h3 className={SECTION_LABEL_CLASS}>Players of {team.name}</h3>
      </header>
      <table className="table table-fixed">
        <thead>
          <tr>
            <th>Player</th>
            <th className="w-2/12 text-center">Status</th>
            <th className="w-2/12 text-center">Time on team</th>
            {state.profile?.simulateNpcMatchStats && (
              <th className="w-2/12 text-center">Maps played</th>
            )}
            <th className="w-2/12 text-center">XP</th>
          </tr>
        </thead>
        <tbody>
          {sortedPlayers.map((player) => {
            const playerRating = ratings[player.id];
            const status = statusLabel(player);

            return (
              <tr
                key={`${player.id}__team_roster`}
                data-interaction-hover-sound="none"
                className="hover:bg-base-content/10 cursor-pointer"
                onClick={() => openPlayerTransferModal(player.id)}
              >
                <td className="py-0">
                  <div className="flex min-w-0 items-center gap-3">
                    <img
                      src={player.avatar || 'resources://avatars/empty.png'}
                      className="h-16 w-14 shrink-0 object-contain object-bottom"
                    />
                    <article className="flex min-w-0 items-center gap-1.5">
                      <span className={cx('fp shrink-0', player.country.code.toLowerCase())} />
                      <p className="truncate text-lg leading-tight font-bold" title={player.name}>
                        {player.name}
                      </p>
                    </article>
                  </div>
                </td>
                <td className="text-center">
                  <span
                    className={cx(
                      'inline-flex h-6 min-w-[76px] items-center justify-center rounded px-2 text-[10px] leading-none font-semibold tracking-wide uppercase',
                      status === 'STARTER' && 'bg-[#2f4660] text-[#9fc9f3]',
                      status === 'BENCHED' && 'bg-[#7a2430] text-[#ffdce3]',
                    )}
                  >
                    {status}
                  </span>
                </td>
                <td className="text-muted text-center whitespace-pre-line">
                  {formatTimeOnTeam(player, team.id, now)}
                </td>
                {state.profile?.simulateNpcMatchStats && (
                  <td className="text-center">{playerRating?.maps ?? 0}</td>
                )}
                <td className="text-center text-lg font-black text-[#a8d8ff]">{player.xp ?? 0}</td>
              </tr>
            );
          })}
          {!sortedPlayers.length && (
            <tr>
              <td
                colSpan={state.profile?.simulateNpcMatchStats ? 5 : 4}
                className="h-32 text-center"
              >
                <b>{team.name}</b> {t('shared.noBench')}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <RosterTimeline
        ratingGamesByPlayer={ratingGamesByPlayer}
        mode={timelineMode}
        now={now}
        onModeChange={setTimelineMode}
        players={timelinePlayers}
        team={team}
      />
      <TeamTransfers
        mode={transferMode}
        now={now}
        onModeChange={setTransferMode}
        players={timelinePlayers}
        team={team}
      />
    </section>
  );
}
