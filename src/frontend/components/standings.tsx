/**
 * Standings component.
 *
 * @module
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { compact, inRange } from 'lodash';
import { Eagers } from '@liga/shared';
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
  limit?: number;
  mode?: 'default' | 'swiss';
  offset?: number;
  teamLink?: (team: Props['competitors'][number]['team']) => string;
  title?: React.ReactNode;
  zones?: Array<number[]>;
  onClick?: (competitor: Props['competitors'][number]) => void;
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

export default function (props: Props) {
  const isSwiss = props.mode === 'swiss';

  return (
    <table className="table table-fixed">
      {!!props.title && <caption>{props.title}</caption>}
      <thead>
        <tr>
          <th className="w-1/12">
            <p title="Ranking">#</p>
          </th>
          <th className={cx(isSwiss ? 'w-5/12' : 'w-8/12')}>Name</th>
          {!!props.compact && (
            <th className={cx(isSwiss ? 'w-3/12' : 'w-2/12 text-right pr-1')}>
              <p title={isSwiss ? 'Record' : 'Win/Loss'}>{isSwiss ? 'Record' : 'W/L'}</p>
            </th>
          )}
          {!props.compact && (
            <>
              <th className={cx(isSwiss ? 'w-2/12 text-center' : 'w-2/12 text-right pr-1')}>
                <p title={isSwiss ? 'Record' : 'Win/Loss'}>{isSwiss ? 'Record' : 'W/L'}</p>
              </th>
            </>
          )}
          <th className={cx(isSwiss ? 'w-2/12 text-center' : 'w-1/12 text-right')}>
            <p title={isSwiss ? 'Scoreline' : 'Total Points'}>{isSwiss ? 'Score' : 'Pts.'}</p>
          </th>
        </tr>
      </thead>
      <tbody>
        {props.competitors
          .sort((a, b) => a.position - b.position)
          .slice(
            props.offset || 0,
            props.limit ? (props.offset || 0) + props.limit : props.competitors.length,
          )
          .map((competitor, idx) => (
            <tr
              key={competitor.team.id}
              className={cx(
                getZoneColorValue(idx + (props.offset || 0), props.zones),
                props.onClick ? 'cursor-pointer' : 'cursor-default',
                competitor.team.id === props.highlight && 'bg-base-content/10',
              )}
              onClick={() => props.onClick && props.onClick(competitor)}
            >
              <td>{idx + 1 + (props.offset || 0)}.</td>
              <td className="truncate">
                {props.teamLink ? (
                  <Link
                    to={props.teamLink(competitor.team)}
                    onClick={(event) => event.stopPropagation()}
                    className="link link-hover inline-flex items-center"
                  >
                    {!!competitor.team.blazon && (
                      <img src={competitor.team.blazon} className="mr-2 inline-block size-4" />
                    )}
                    {competitor.team.name}
                  </Link>
                ) : (
                  <>
                    {!!competitor.team.blazon && (
                      <img src={competitor.team.blazon} className="mr-2 inline-block size-4" />
                    )}
                    {competitor.team.name}
                  </>
                )}
              </td>
              {!!props.compact && (
                <td className={cx(!isSwiss && 'text-right pr-1')}>
                  {`${competitor.win}-${competitor.loss}`}
                </td>
              )}
              {!props.compact && (
                <td className={cx(isSwiss ? 'text-center' : 'text-right pr-1')}>
                  {`${competitor.win}-${competitor.loss}`}
                </td>
              )}
              <td className={cx(isSwiss ? 'text-center' : 'text-right')}>
                {isSwiss ? `${competitor.win}-${competitor.loss}` : competitor.win * 3 + competitor.draw}
              </td>
            </tr>
          ))}
      </tbody>
    </table>
  );
}
