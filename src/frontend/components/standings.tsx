/**
 * Standings component.
 *
 * @module
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { compact, inRange } from 'lodash';
import { format } from 'date-fns';
import { FaCaretDown, FaChartBar } from 'react-icons/fa';
import { Constants, Eagers, Util } from '@liga/shared';
import { useFormatAppShortDate } from '@liga/frontend/hooks';
import { cx } from '@liga/frontend/lib';

/**
 * Promotion and relegation zone colors.
 *
 * @constant
 */
const ZoneColors = [
  'bg-green-800/10', // automatic promotion
  'bg-blue-800/10', // playoffs
  'bg-red-800/10', // relegation
];

/**
 * @interface
 */
interface Props {
  competitors: Awaited<
    ReturnType<typeof api.competitions.all<typeof Eagers.competition>>
  >[number]['competitors'];
  compact?: boolean;
  highlight?: number;
  hidePoints?: boolean;
  limit?: number;
  mode?: 'default' | 'swiss' | 'ranking';
  offset?: number;
  matches?: Awaited<ReturnType<typeof api.matches.all<typeof Eagers.match>>>;
  teamLink?: (team: Props['competitors'][number]['team']) => string;
  title?: React.ReactNode;
  zones?: Array<number[]>;
  onClick?: (competitor: Props['competitors'][number]) => void;
}

type Match = NonNullable<Props['matches']>[number];

function getOrdinalSuffix(value: number) {
  const mod100 = value % 100;
  if (mod100 >= 11 && mod100 <= 13) {
    return 'th';
  }

  switch (value % 10) {
    case 1:
      return 'st';
    case 2:
      return 'nd';
    case 3:
      return 'rd';
    default:
      return 'th';
  }
}

function getPlacementLabel(position: number, count: number) {
  if (count <= 1) {
    return `${position}${getOrdinalSuffix(position)}`;
  }

  const rangeEnd = position + count - 1;
  return `${position}-${rangeEnd}${getOrdinalSuffix(rangeEnd)}`;
}

function getZoneColorValue(value: number, zones?: Props['zones']) {
  if (!zones) {
    return null;
  }

  return compact(
    zones.map((zone, zoneIdx) =>
      inRange(value + 1, zone[0], zone[1] + 1) ? ZoneColors[zoneIdx] : null,
    ),
  )[0];
}

function getMatchTeams(match: Match) {
  return [...match.competitors].sort((a, b) => a.seed - b.seed);
}

function hasTeam(match: Match, teamId: number) {
  return match.competitors.some((competitor) => competitor.teamId === teamId);
}

function hasOpponent(match: Match) {
  return match.competitors.filter((competitor) => competitor.teamId != null).length > 1;
}

function getMatchDateTime(match: Match) {
  return match.date instanceof Date ? match.date.getTime() : new Date(match.date).getTime();
}

function getMatchDayLabel(match: Match, fallbackIndex: number) {
  return `MD${match.round || fallbackIndex + 1}`;
}

function StandingsMatchRows(props: {
  matches: Match[];
  teamId: number;
  teamLink?: Props['teamLink'];
}) {
  const fmtShortDate = useFormatAppShortDate();

  if (!props.matches.length) {
    return (
      <div className="text-muted px-4 py-3 text-center text-xs">No matches scheduled.</div>
    );
  }

  return (
    <div className="divide-base-content/10 divide-y">
      {props.matches.map((match, idx) => {
        const [first, second] = getMatchTeams(match);
        const team = first?.teamId === props.teamId ? first : second;
        const opponent = first?.teamId === props.teamId ? second : first;
        const isCompleted = match.status === Constants.MatchStatus.COMPLETED;
        const onClick =
          match._count.events > 0
            ? () =>
                api.window.send<ModalRequest>(Constants.WindowIdentifier.Modal, {
                  target: '/postgame',
                  payload: match.id,
                })
            : null;

        return (
          <div
            key={`${match.id}__standings_match`}
            className={cx(
              'grid grid-cols-[4.5rem_minmax(0,1fr)_2.5rem] items-center gap-3 px-4 py-2 text-xs',
              onClick && 'hover:bg-base-content/10 cursor-pointer',
            )}
            onClick={onClick || undefined}
          >
            <span title={format(match.date, 'PPPP')}>
              {fmtShortDate(match.date)}
            </span>
            <span className="grid min-w-0 grid-cols-[minmax(0,1fr)_4.5rem_minmax(0,1fr)] items-center gap-3">
              <span className="truncate text-right" title={team?.team?.name}>
                {!!team?.team && (
                  <>
                    {props.teamLink ? (
                      <Link
                        to={props.teamLink(team.team)}
                        className="link-hover font-semibold"
                        onClick={(event) => event.stopPropagation()}
                      >
                        {team.team.name}
                      </Link>
                    ) : (
                      <span className="font-semibold">{team.team.name}</span>
                    )}
                    {!!team.team.blazon && (
                      <img src={team.team.blazon} className="ml-2 inline-block size-4" />
                    )}
                  </>
                )}
              </span>
              <span className="text-center font-semibold">
                {isCompleted && opponent ? (
                  <span className="inline-flex items-center justify-center gap-2">
                    <span className={Util.getResultTextColor(team.result)}>{team.score}</span>
                    <span>-</span>
                    <span className={Util.getResultTextColor(opponent.result)}>
                      {opponent.score}
                    </span>
                  </span>
                ) : (
                  'TBD'
                )}
              </span>
              <span className="truncate" title={opponent?.team?.name || 'BYE'}>
                {!opponent?.team && 'BYE'}
                {!!opponent?.team && (
                  <>
                    {!!opponent.team.blazon && (
                      <img src={opponent.team.blazon} className="mr-2 inline-block size-4" />
                    )}
                    {props.teamLink ? (
                      <Link
                        to={props.teamLink(opponent.team)}
                        className="link-hover font-semibold"
                        onClick={(event) => event.stopPropagation()}
                      >
                        {opponent.team.name}
                      </Link>
                    ) : (
                      <span className="font-semibold">{opponent.team.name}</span>
                    )}
                  </>
                )}
              </span>
            </span>
            <span
              className={cx(
                'text-muted flex items-center justify-end gap-2 text-[10px] font-bold uppercase',
                onClick && 'text-info/70',
              )}
              title={onClick ? 'View match details' : undefined}
            >
              {onClick && <FaChartBar />}
              {getMatchDayLabel(match, idx)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function (props: Props) {
  const [expandedTeamId, setExpandedTeamId] = React.useState<number | null>(null);
  const isSwiss = props.mode === 'swiss';
  const isRanking = props.mode === 'ranking';
  const hasMatchDetails = Boolean(props.matches) && !isRanking;
  const showPlacementOrPoints = !isSwiss && (isRanking || !props.hidePoints);
  const columnCount = 2 + (!isRanking ? 1 : 0) + (showPlacementOrPoints ? 1 : 0);
  const positionCounts = React.useMemo(
    () =>
      props.competitors.reduce((acc, competitor) => {
        acc.set(competitor.position, (acc.get(competitor.position) || 0) + 1);
        return acc;
      }, new Map<number, number>()),
    [props.competitors],
  );
  const sortedCompetitors = React.useMemo(
    () =>
      [...props.competitors]
        .sort((a, b) => a.position - b.position)
        .slice(
          props.offset || 0,
          props.limit ? (props.offset || 0) + props.limit : props.competitors.length,
        ),
    [props.competitors, props.limit, props.offset],
  );

  React.useEffect(() => {
    setExpandedTeamId(null);
  }, [props.competitors, props.matches]);

  return (
    <table className="table table-fixed">
      {!!props.title && <caption>{props.title}</caption>}
      <thead>
        <tr>
          <th className="w-1/12">
            <p title="Ranking">#</p>
          </th>
          <th
            className={cx(
              isRanking ? 'w-8/12' : props.hidePoints ? 'w-8/12' : isSwiss ? 'w-9/12' : 'w-8/12',
            )}
          >
            Name
          </th>
          {!isRanking && !!props.compact && (
            <th
              className={cx(
                isSwiss
                  ? 'w-2/12 pr-6 text-right'
                  : props.hidePoints
                    ? 'w-2/12 pr-6 text-right'
                    : 'w-2/12 pr-1 text-right',
              )}
            >
              <p title={isSwiss ? 'Record' : 'Win/Loss'}>{isSwiss ? 'Record' : 'W/L'}</p>
            </th>
          )}
          {!isRanking && !props.compact && (
            <>
              <th
                className={cx(
                  isSwiss
                    ? 'w-2/12 pr-6 text-right'
                    : props.hidePoints
                      ? 'w-2/12 pr-6 text-right'
                      : 'w-2/12 pr-1 text-right',
                )}
              >
                <p title={isSwiss ? 'Record' : 'Win/Loss'}>{isSwiss ? 'Record' : 'W/L'}</p>
              </th>
            </>
          )}
          {showPlacementOrPoints && (
            <th className={cx(isRanking ? 'w-3/12 text-right' : 'w-1/12 text-right')}>
              <p title={isRanking ? 'Finishing Position' : 'Total Points'}>
                {isRanking ? 'Place' : 'Pts.'}
              </p>
            </th>
          )}
        </tr>
      </thead>
      <tbody>
        {sortedCompetitors.map((competitor, idx) => {
          const detailMatches = (props.matches || [])
            .filter((match) => hasTeam(match, competitor.team.id) && hasOpponent(match))
            .sort(
              (a, b) =>
                getMatchDateTime(a) - getMatchDateTime(b) ||
                (a.round || 0) - (b.round || 0) ||
                a.id - b.id,
            );
          const isExpanded = expandedTeamId === competitor.team.id;

          return (
            <React.Fragment key={competitor.team.id}>
              <tr
                className={cx(
                  'group',
                  getZoneColorValue(idx + (props.offset || 0), props.zones),
                  props.onClick ? 'cursor-pointer' : 'cursor-default',
                  competitor.team.id === props.highlight && 'bg-base-content/10',
                )}
                onClick={() => props.onClick && props.onClick(competitor)}
              >
                <td>{idx + 1 + (props.offset || 0)}.</td>
                <td>
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="min-w-0 truncate">
                      {props.teamLink ? (
                        <Link
                          to={props.teamLink(competitor.team)}
                          onClick={(event) => event.stopPropagation()}
                          className="link link-hover inline-flex min-w-0 items-center"
                        >
                          {!!competitor.team.blazon && (
                            <img src={competitor.team.blazon} className="mr-2 inline-block size-4" />
                          )}
                          <span className="truncate">{competitor.team.name}</span>
                        </Link>
                      ) : (
                        <>
                          {!!competitor.team.blazon && (
                            <img src={competitor.team.blazon} className="mr-2 inline-block size-4" />
                          )}
                          {competitor.team.name}
                        </>
                      )}
                    </span>
                    {hasMatchDetails && (
                      <button
                        type="button"
                        title="Show matches"
                        className={cx(
                          'btn btn-square btn-xs shrink-0 transition-opacity',
                          isExpanded
                            ? 'btn-active opacity-100'
                            : 'opacity-0 group-hover:opacity-100',
                        )}
                        onClick={(event) => {
                          event.stopPropagation();
                          setExpandedTeamId((teamId) =>
                            teamId === competitor.team.id ? null : competitor.team.id,
                          );
                        }}
                      >
                        <FaCaretDown
                          className={cx('transition-transform', isExpanded && 'rotate-180')}
                        />
                      </button>
                    )}
                  </div>
                </td>
                {!isRanking && !!props.compact && (
                  <td
                    className={cx(
                      isSwiss
                        ? 'pr-6 text-right'
                        : props.hidePoints
                          ? 'pr-6 text-right'
                          : 'pr-1 text-right',
                    )}
                  >
                    {`${competitor.win}-${competitor.loss}`}
                  </td>
                )}
                {!isRanking && !props.compact && (
                  <td
                    className={cx(
                      isSwiss
                        ? 'pr-6 text-right'
                        : props.hidePoints
                          ? 'pr-6 text-right'
                          : 'pr-1 text-right',
                    )}
                  >
                    {`${competitor.win}-${competitor.loss}`}
                  </td>
                )}
                {showPlacementOrPoints && (
                  <td className={cx('text-right')}>
                    {isRanking
                      ? getPlacementLabel(
                          competitor.position,
                          positionCounts.get(competitor.position) || 1,
                        )
                      : competitor.win * 3 + competitor.draw}
                  </td>
                )}
              </tr>
              {hasMatchDetails && isExpanded && (
                <tr className="bg-base-100">
                  <td colSpan={columnCount} className="p-0!">
                    <StandingsMatchRows
                      matches={detailMatches}
                      teamId={competitor.team.id}
                      teamLink={props.teamLink}
                    />
                  </td>
                </tr>
              )}
            </React.Fragment>
          );
        })}
      </tbody>
    </table>
  );
}
