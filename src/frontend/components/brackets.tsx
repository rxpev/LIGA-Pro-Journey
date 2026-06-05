/**
 * Brackets component.
 *
 * @module
 */
import React from 'react';
import Tournament from '@liga/shared/tournament';
import { Constants, Eagers, Util } from '@liga/shared';
import { cx } from '@liga/frontend/lib';
import { useFormatAppDate } from '@liga/frontend/hooks/use-FormatAppDate';
import { ParticipantType } from '@g-loot/react-tournament-brackets/dist/esm';

/** @interface */
interface Props {
  matches: Awaited<ReturnType<typeof api.matches.all<typeof Eagers.match>>>;
  onPartyClick?: (party: ParticipantType, partyWon: boolean) => void;
}

const MATCH_WIDTH = 300;
const MATCH_HEIGHT = 92;
const ROUND_GAP = 72;
const MATCH_GAP = 38;
const HEADER_HEIGHT = 36;
const SECTION_GAP = 52;

/**
 * Converts Prisma Matches object to data
 * expected by the brackets module.
 *
 * @param tourney The clux tournament object.
 * @param matches The Prisma matches data.
 * @function
 */
type BracketMatchId = { s: number; r: number; m: number };
type BracketDisplayMatch = Props['matches'][number] & { isPlaceholder?: boolean };
type BracketSection = {
  height: number;
  nodes: Array<{ hidden: boolean; match: BracketDisplayMatch; x: number; y: number }>;
  positions: Map<string, { hidden: boolean; match: BracketDisplayMatch; x: number; y: number }>;
  roundNumbers: number[];
  title: string;
  top: number;
  width: number;
};

function getMatchKey(matchId: BracketMatchId) {
  return `${matchId.s}:${matchId.r}:${matchId.m}`;
}

function parseMatchId(match: Pick<BracketDisplayMatch, 'payload'>) {
  return JSON.parse(match.payload) as BracketMatchId;
}

function getIemGroupSlotIds() {
  return [
    ...[1, 2, 3, 4].map((match) => ({
      s: Constants.BracketIdentifier.UPPER,
      r: 1,
      m: match,
    })),
    ...[1, 2].map((match) => ({
      s: Constants.BracketIdentifier.UPPER,
      r: 2,
      m: match,
    })),
    { s: Constants.BracketIdentifier.UPPER, r: 3, m: 1 },
    ...[1, 2].map((match) => ({
      s: Constants.BracketIdentifier.LOWER,
      r: 1,
      m: match,
    })),
    ...[1, 2].map((match) => ({
      s: Constants.BracketIdentifier.LOWER,
      r: 2,
      m: match,
    })),
    { s: Constants.BracketIdentifier.LOWER, r: 3, m: 1 },
  ];
}

function createPlaceholderMatch(matchId: BracketMatchId): BracketDisplayMatch {
  return {
    id: -Number(`${matchId.s}${matchId.r}${matchId.m}`),
    payload: JSON.stringify(matchId),
    date: new Date(0),
    competitors: [],
    isPlaceholder: true,
  } as unknown as BracketDisplayMatch;
}

function getVisualWinnerTarget(matchId: BracketMatchId, isIemGroup: boolean) {
  if (!isIemGroup) {
    return null;
  }

  if (matchId.s === Constants.BracketIdentifier.UPPER) {
    if (matchId.r === 1) {
      return {
        s: Constants.BracketIdentifier.UPPER,
        r: 2,
        m: matchId.m <= 2 ? 1 : 2,
      };
    }

    if (matchId.r === 2) {
      return {
        s: Constants.BracketIdentifier.UPPER,
        r: 3,
        m: 1,
      };
    }
  }

  if (matchId.s === Constants.BracketIdentifier.LOWER) {
    if (matchId.r === 1) {
      return {
        s: Constants.BracketIdentifier.LOWER,
        r: 2,
        m: matchId.m,
      };
    }

    if (matchId.r === 2) {
      return {
        s: Constants.BracketIdentifier.LOWER,
        r: 3,
        m: 1,
      };
    }
  }

  return null;
}

function BracketCard(props: {
  match: BracketDisplayMatch;
  fmtDate: (value: Date | number | string) => string;
  onPartyClick?: Props['onPartyClick'];
}) {
  const competitors = [...props.match.competitors].sort((a, b) => a.seed - b.seed);

  return (
    <article className="border-base-content/15 bg-base-200 h-[92px] w-[300px] overflow-hidden border text-xs shadow-sm">
      <header className="text-info/70 bg-base-100 border-base-content/10 border-b px-3 py-1 font-semibold">
        {props.match.isPlaceholder ? 'TBD' : props.fmtDate(props.match.date)}
      </header>
      {props.match.isPlaceholder &&
        [0, 1].map((idx) => (
          <div
            key={`${props.match.payload}-${idx}`}
            className="text-base-content/35 bg-base-100/65 flex h-8 w-full items-center justify-between gap-2 px-3 pr-0 text-left"
          >
            <span>TBD</span>
            <span className="bg-base-300 flex h-full w-12 shrink-0 items-center justify-center">
              -
            </span>
          </div>
        ))}
      {competitors.map((competitor) => {
        const won = competitor.result === Constants.MatchResult.WIN;
        const lost = competitor.result === Constants.MatchResult.LOSS;

        return (
          <button
            key={competitor.id}
            type="button"
            className={cx(
              'hover:bg-base-300 flex h-8 w-full items-center justify-between gap-2 px-3 pr-0 text-left',
              won ? 'bg-base-200 text-base-content' : 'bg-base-100/65',
              lost && 'text-base-content/50',
            )}
            onClick={() =>
              props.onPartyClick?.(
                {
                  id: competitor.team.id,
                  name: competitor.team.name,
                  resultText: competitor.score != null ? String(competitor.score) : null,
                } as ParticipantType,
                won,
              )
            }
          >
            <span className="flex min-w-0 items-center gap-1.5">
              {competitor.team.blazon && (
                <img
                  alt=""
                  className="size-4 shrink-0 object-contain"
                  src={competitor.team.blazon}
                />
              )}
              <span className="truncate">{competitor.team.name}</span>
            </span>
            <span
              className={cx(
                'bg-base-300 flex h-full w-12 shrink-0 items-center justify-center tabular-nums',
                won ? 'text-success' : lost ? 'text-error' : 'text-base-content',
              )}
            >
              {competitor.score ?? '-'}
            </span>
          </button>
        );
      })}
    </article>
  );
}

function ManualBracket(props: {
  matches: Props['matches'];
  tourney: Tournament;
  onPartyClick?: Props['onPartyClick'];
}) {
  const fmtDate = useFormatAppDate();
  const [zoom, setZoom] = React.useState(1);
  const [pan, setPan] = React.useState({ x: 0, y: 0 });
  const [dragStart, setDragStart] = React.useState<{
    mouseX: number;
    mouseY: number;
    x: number;
    y: number;
  }>();
  const handleWheel = React.useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const direction = event.deltaY > 0 ? -1 : 1;
    setZoom((value) => {
      const next = value + direction * 0.08;
      return Math.min(1.35, Math.max(0.45, Number(next.toFixed(2))));
    });
  }, []);
  const handleMouseDown = React.useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (event.button !== 0) {
        return;
      }

      event.preventDefault();
      setDragStart({
        mouseX: event.clientX,
        mouseY: event.clientY,
        x: pan.x,
        y: pan.y,
      });
    },
    [pan.x, pan.y],
  );
  const handleMouseMove = React.useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!dragStart) {
        return;
      }

      setPan({
        x: dragStart.x + event.clientX - dragStart.mouseX,
        y: dragStart.y + event.clientY - dragStart.mouseY,
      });
    },
    [dragStart],
  );
  const stopDragging = React.useCallback(() => setDragStart(undefined), []);
  const layout = React.useMemo(() => {
    const sections = props.matches.reduce(
      (acc, match) => {
        const matchId = parseMatchId(match);
        const section = matchId.s === Constants.BracketIdentifier.LOWER ? 'lower' : 'upper';
        acc[section][matchId.r] ||= [];
        acc[section][matchId.r].push(match);
        return acc;
      },
      { lower: {}, upper: {} } as Record<'lower' | 'upper', Record<number, Props['matches']>>,
    );

    if (props.tourney.iemGroup) {
      const existingKeys = new Set(props.matches.map((match) => getMatchKey(parseMatchId(match))));

      getIemGroupSlotIds().forEach((matchId) => {
        const key = getMatchKey(matchId);

        if (existingKeys.has(key)) {
          return;
        }

        const section = matchId.s === Constants.BracketIdentifier.LOWER ? 'lower' : 'upper';
        sections[section][matchId.r] ||= [];
        sections[section][matchId.r].push(createPlaceholderMatch(matchId));
      });
    }

    Object.values(sections).forEach((rounds) => {
      Object.values(rounds).forEach((round) =>
        round.sort((a, b) => {
          const aId = parseMatchId(a);
          const bId = parseMatchId(b);
          return aId.m - bId.m;
        }),
      );
    });

    return sections;
  }, [props.matches]);

  const buildSection = (
    sectionKey: 'upper' | 'lower',
    title: string,
    top: number,
  ): BracketSection => {
    const rounds = layout[sectionKey];
    const roundNumbers = Object.keys(rounds)
      .map(Number)
      .sort((a, b) => a - b);
    const firstRound = roundNumbers[0];
    const firstRoundMatches = firstRound ? rounds[firstRound] || [] : [];
    const maxMatches = Math.max(
      1,
      firstRoundMatches.length,
      ...roundNumbers.map((round) => rounds[round]?.length || 0),
    );
    const sectionHeight =
      HEADER_HEIGHT + 58 + maxMatches * MATCH_HEIGHT + (maxMatches - 1) * MATCH_GAP;
    const positions = new Map<
      string,
      { hidden: boolean; match: BracketDisplayMatch; x: number; y: number }
    >();
    const incoming = new Map<string, string[]>();

    Object.values(rounds).forEach((matches) => {
      matches.forEach((match) => {
        const matchId = parseMatchId(match);
        const nextMatchId =
          getVisualWinnerTarget(matchId, Boolean(props.tourney.iemGroup)) ||
          props.tourney.brackets.right(matchId)?.[0];
        if (!nextMatchId) {
          return;
        }

        const matchKey = getMatchKey(matchId);
        const nextKey = getMatchKey(nextMatchId as BracketMatchId);
        incoming.set(nextKey, [...(incoming.get(nextKey) || []), matchKey]);
      });
    });

    roundNumbers.forEach((round, roundIndex) => {
      const matches = rounds[round] ?? [];
      matches.forEach((match, matchIndex) => {
        const matchId = parseMatchId(match);
        const matchKey = getMatchKey(matchId);
        const x = roundIndex * (MATCH_WIDTH + ROUND_GAP);
        const childCenters = (incoming.get(matchKey) || [])
          .map((key) => positions.get(key))
          .filter(Boolean)
          .map((position) => position!.y + MATCH_HEIGHT / 2);
        const fallbackY = top + HEADER_HEIGHT + 58 + matchIndex * (MATCH_HEIGHT + MATCH_GAP);
        const isFirstRound = matchId.r === firstRound;
        const isHiddenBye =
          sectionKey === 'upper' &&
          isFirstRound &&
          match.competitors.length < 2 &&
          roundNumbers.length > 1;
        const y = childCenters.length
          ? childCenters.reduce((sum, center) => sum + center, 0) / childCenters.length -
            MATCH_HEIGHT / 2
          : fallbackY;
        positions.set(matchKey, { hidden: isHiddenBye, x, y, match });
      });
    });

    return {
      height: sectionHeight,
      nodes: [...positions.values()],
      title,
      top,
      roundNumbers,
      positions,
      width: roundNumbers.length * MATCH_WIDTH + Math.max(0, roundNumbers.length - 1) * ROUND_GAP,
    };
  };

  const upper = buildSection('upper', 'Upper Bracket', 0);
  const lowerTop = upper.height + SECTION_GAP;
  const lower = buildSection('lower', 'Lower Bracket', lowerTop);
  const sections = lower.nodes.length ? [upper, lower] : [upper];
  const width = Math.max(...sections.map((section) => section.width));
  const height = sections.reduce((max, section) => Math.max(max, section.top + section.height), 0);

  const connectors = sections.flatMap((section) =>
    section.nodes.flatMap(({ match }) => {
      const matchId = parseMatchId(match);
      const matchKey = getMatchKey(matchId);
      const nextMatchId =
        getVisualWinnerTarget(matchId, Boolean(props.tourney.iemGroup)) ||
        props.tourney.brackets.right(matchId)?.[0];
      if (!nextMatchId) {
        return [];
      }

      const from = section.positions.get(matchKey);
      const to = section.positions.get(getMatchKey(nextMatchId as BracketMatchId));
      if (!from || !to || from.hidden || to.hidden) {
        return [];
      }

      const startX = from.x + MATCH_WIDTH;
      const startY = from.y + MATCH_HEIGHT / 2;
      const endX = to.x;
      const endY = to.y + MATCH_HEIGHT / 2;
      const midX = startX + (endX - startX) / 2;

      return [`M ${startX} ${startY} H ${midX} V ${endY} H ${endX}`];
    }),
  );

  const roundTitle = (section: BracketSection, round: number) => {
    const roundIndex = section.roundNumbers.indexOf(round);
    const total = section.roundNumbers.length;

    if (section.title === 'Lower Bracket') {
      if (props.tourney.iemGroup) {
        return (
          {
            1: 'Lower round 1',
            2: 'Lower semi-finals',
            3: 'Lower final',
          }[round] || `Lower round ${round}`
        );
      }

      if (total === 4) {
        return (
          ['Lower round 1', 'Lower semi-finals', 'Lower final', 'Consolidation final'][
            roundIndex
          ] || `Round ${round}`
        );
      }

      if (total === 5) {
        return (
          ['Lower round 1', 'Lower round 2', 'Lower semi-finals', 'Lower final', 'Grand final'][
            roundIndex
          ] || `Round ${round}`
        );
      }

      return Util.parseCupRounds(roundIndex + 1, total);
    }

    if (props.tourney.iemGroup) {
      return (
        {
          1: 'Opening round',
          2: 'Upper semi-finals',
          3: 'Upper final',
        }[round] || `Upper round ${round}`
      );
    }

    if (total === 3 && sections.some((section) => section.title === 'Lower Bracket')) {
      return (
        ['Opening round', 'Upper semi-finals', 'Upper final (qualification)'][roundIndex] ||
        `Round ${round}`
      );
    }

    return Util.parseCupRounds(roundIndex + 1, total);
  };

  return (
    <div
      className={cx(
        'bg-base-100 relative h-full w-full overflow-hidden p-5 select-none',
        dragStart ? 'cursor-grabbing' : 'cursor-grab',
      )}
      onMouseDown={handleMouseDown}
      onMouseLeave={stopDragging}
      onMouseMove={handleMouseMove}
      onMouseUp={stopDragging}
      onWheel={handleWheel}
    >
      <div className="h-full w-full">
        <div
          className="relative"
          style={{
            width,
            height,
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: 'top left',
            transition: dragStart ? undefined : 'transform 120ms ease-out',
          }}
        >
          <svg className="pointer-events-none absolute inset-0" width={width} height={height}>
            {connectors.map((path, index) => (
              <path
                key={`${path}-${index}`}
                d={path}
                fill="none"
                stroke="rgba(148, 163, 184, 0.24)"
                strokeWidth={1}
                shapeRendering="crispEdges"
              />
            ))}
          </svg>
          {sections.map((section) => (
            <React.Fragment key={section.title}>
              {section.title === 'Lower Bracket' && (
                <h3
                  className="text-base-content/70 absolute text-lg font-black uppercase"
                  style={{ top: section.top - 30, left: 0 }}
                >
                  {section.title}
                </h3>
              )}
              {section.roundNumbers.map((round, roundIndex) => (
                <header
                  key={`${section.title}-${round}`}
                  className="text-info bg-base-200 border-base-content/10 absolute h-9 border text-center text-sm leading-9 font-bold"
                  style={{
                    top: section.top,
                    left: roundIndex * (MATCH_WIDTH + ROUND_GAP),
                    width: MATCH_WIDTH,
                  }}
                >
                  {roundTitle(section, round)}
                </header>
              ))}
              {section.nodes.map(({ hidden, match, x, y }) =>
                hidden ? null : (
                  <div key={match.id} className="absolute" style={{ left: x, top: y }}>
                    <BracketCard
                      match={match}
                      fmtDate={fmtDate}
                      onPartyClick={props.onPartyClick}
                    />
                  </div>
                ),
              )}
            </React.Fragment>
          ))}
        </div>
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
export default function (props: Props) {
  const tourney = React.useMemo(
    () => Tournament.restore(JSON.parse(props.matches[0].competition.tournament)),
    [props.matches],
  );

  if (!tourney.brackets) {
    return null;
  }

  return (
    <ManualBracket matches={props.matches} tourney={tourney} onPartyClick={props.onPartyClick} />
  );
}
