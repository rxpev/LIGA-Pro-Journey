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
type BracketMatches = Awaited<ReturnType<typeof api.matches.all<typeof Eagers.match>>>;

interface Props {
  fitToContainer?: boolean;
  matches: BracketMatches;
  onMatchClick?: (match: BracketMatches[number]) => void;
  onPartyClick?: (party: ParticipantType, partyWon: boolean) => void;
  preview?: {
    doubleElimination?: boolean;
    size: number;
  };
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

function matchHasTeam(match: BracketDisplayMatch, teamId?: number) {
  return teamId != null && match.competitors.some((competitor) => competitor.team.id === teamId);
}

function getIemGroupSlotIds(skipUpperFinal: boolean) {
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
    ...(skipUpperFinal ? [] : [{ s: Constants.BracketIdentifier.UPPER, r: 3, m: 1 }]),
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

function createPreviewMatches(preview: NonNullable<Props['preview']>): BracketMatches {
  const tourney = new Tournament(
    preview.size,
    preview.doubleElimination
      ? { last: Constants.BracketIdentifier.LOWER, short: true }
      : { short: true },
  );
  tourney.start();
  const tournament = JSON.stringify(tourney.save());

  return tourney.brackets
    .rounds()
    .flat()
    .map((match, index) =>
      Object.assign(createPlaceholderMatch(match.id), {
        id: -(index + 1),
        competition: { tournament },
      }),
    ) as BracketMatches;
}

function getVisualWinnerTarget(
  matchId: BracketMatchId,
  isIemGroup: boolean,
  skipUpperFinal: boolean,
) {
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
      if (skipUpperFinal) {
        return null;
      }

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
  compact?: boolean;
  height?: number;
  highlightedTeamId?: number;
  match: BracketDisplayMatch;
  fmtDate: (value: Date | number | string) => string;
  onMatchClick?: (match: BracketDisplayMatch) => void;
  onPartyClick?: Props['onPartyClick'];
  onTeamHover: (teamId?: number) => void;
  width?: number;
}) {
  const competitors = [...props.match.competitors].sort((a, b) => a.seed - b.seed);
  const isMatchHighlighted = matchHasTeam(props.match, props.highlightedTeamId);
  const canOpenMatch = !props.match.isPlaceholder && props.match._count?.events > 0;
  const handleMatchClick = () => {
    if (canOpenMatch) {
      props.onMatchClick?.(props.match);
    }
  };

  return (
    <article
      className={cx(
        'bg-base-200 grid grid-rows-[auto_minmax(0,1fr)_minmax(0,1fr)] overflow-hidden border text-xs shadow-sm transition-colors duration-150',
        props.compact && 'text-[13px]',
        canOpenMatch && 'cursor-pointer',
        isMatchHighlighted ? 'border-info/70 shadow-info/20' : 'border-base-content/15',
      )}
      onClick={handleMatchClick}
      style={{ height: props.height || MATCH_HEIGHT, width: props.width || MATCH_WIDTH }}
    >
      <header
        className={cx(
          'text-base-content bg-base-100 border-base-content/10 shrink-0 border-b leading-none font-semibold',
          props.compact ? 'px-2 py-0.5' : 'px-3 py-1',
        )}
      >
        {props.match.isPlaceholder ? 'TBD' : props.fmtDate(props.match.date)}
      </header>
      {props.match.isPlaceholder &&
        [0, 1].map((idx) => (
          <div
            key={`${props.match.payload}-${idx}`}
            className={cx(
              'text-base-content/35 bg-base-100/65 flex w-full items-center justify-between gap-2 pr-0 text-left',
              '!h-auto min-h-0 px-2',
              !props.compact && 'px-3',
            )}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="text-base-content/35 text-lg leading-none font-bold">?</span>
              <span>TBD</span>
            </span>
            <span
              className={cx(
                'bg-base-300 flex h-full shrink-0 items-center justify-center',
                props.compact ? 'w-10' : 'w-12',
              )}
            >
              -
            </span>
          </div>
        ))}
      {competitors.map((competitor) => {
        const won = competitor.result === Constants.MatchResult.WIN;
        const lost = competitor.result === Constants.MatchResult.LOSS;
        const isHighlighted = competitor.team.id === props.highlightedTeamId;

        return (
          <div
            key={competitor.id}
            className={cx(
              'hover:bg-base-300 flex w-full items-center justify-between gap-2 pr-0 text-left transition-colors duration-150',
              '!h-auto min-h-0 px-2',
              !props.compact && 'px-3',
              isHighlighted
                ? 'bg-info/15 text-base-content'
                : won
                  ? 'bg-base-200 text-base-content'
                  : 'bg-base-100/65',
              lost && !isHighlighted && 'text-base-content/50',
            )}
            onMouseEnter={() => props.onTeamHover(competitor.team.id)}
            onMouseLeave={() => props.onTeamHover(undefined)}
          >
            <span className="flex min-w-0 items-center gap-1.5">
              {competitor.team.blazon && (
                <button
                  type="button"
                  className="grid size-4 shrink-0 place-items-center"
                  onClick={(event) => {
                    event.stopPropagation();
                    props.onPartyClick?.(
                      {
                        id: competitor.team.id,
                        name: competitor.team.name,
                        resultText: competitor.score != null ? String(competitor.score) : null,
                      } as ParticipantType,
                      won,
                    );
                  }}
                  onMouseDown={(event) => event.stopPropagation()}
                >
                  <img
                    alt={`${competitor.team.name} logo`}
                    className="size-4 object-contain"
                    src={competitor.team.blazon}
                  />
                </button>
              )}
              <span className="truncate">{competitor.team.name}</span>
            </span>
            <span
              className={cx(
                'bg-base-300 flex h-full shrink-0 items-center justify-center tabular-nums',
                props.compact ? 'w-10' : 'w-12',
                isHighlighted
                  ? 'text-info'
                  : won
                    ? 'text-success'
                    : lost
                      ? 'text-error'
                      : 'text-base-content',
              )}
            >
              {competitor.score ?? '-'}
            </span>
          </div>
        );
      })}
    </article>
  );
}

function ManualBracket(props: {
  fitToContainer?: boolean;
  matches: BracketDisplayMatch[];
  tourney: Tournament;
  onMatchClick?: Props['onMatchClick'];
  onPartyClick?: Props['onPartyClick'];
}) {
  const fmtDate = useFormatAppDate();
  const matchWidth = props.fitToContainer ? 220 : MATCH_WIDTH;
  const matchHeight = props.fitToContainer ? 76 : MATCH_HEIGHT;
  const roundGap = props.fitToContainer ? 32 : ROUND_GAP;
  const matchGap = props.fitToContainer ? 22 : MATCH_GAP;
  const headerHeight = props.fitToContainer ? 30 : HEADER_HEIGHT;
  const bracketTopOffset = props.fitToContainer ? 46 : 58;
  const [zoom, setZoom] = React.useState(1);
  const [pan, setPan] = React.useState({ x: 0, y: 0 });
  const [highlightedTeamId, setHighlightedTeamId] = React.useState<number>();
  const viewportRef = React.useRef<HTMLDivElement>(null);
  const [viewportSize, setViewportSize] = React.useState({ height: 0, width: 0 });
  const skipUpperFinal = Boolean(props.tourney.iemGroup?.metadata().options.skipUpperFinal);
  const [dragStart, setDragStart] = React.useState<{
    mouseX: number;
    mouseY: number;
    x: number;
    y: number;
  }>();
  const handleWheel = React.useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      if (props.fitToContainer) {
        return;
      }

      event.preventDefault();
      const direction = event.deltaY > 0 ? -1 : 1;
      setZoom((value) => {
        const next = value + direction * 0.08;
        return Math.min(1.35, Math.max(0.45, Number(next.toFixed(2))));
      });
    },
    [props.fitToContainer],
  );
  const handleMouseDown = React.useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (props.fitToContainer || event.button !== 0) {
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
    [pan.x, pan.y, props.fitToContainer],
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
  const handleMouseLeave = React.useCallback(() => {
    setHighlightedTeamId(undefined);
    stopDragging();
  }, [stopDragging]);
  const layout = React.useMemo(() => {
    const sections = props.matches.reduce(
      (acc, match) => {
        const matchId = parseMatchId(match);
        const section = matchId.s === Constants.BracketIdentifier.LOWER ? 'lower' : 'upper';
        acc[section][matchId.r] ||= [];
        acc[section][matchId.r].push(match);
        return acc;
      },
      {
        lower: {},
        upper: {},
      } as Record<'lower' | 'upper', Record<number, BracketDisplayMatch[]>>,
    );

    if (props.tourney.iemGroup) {
      const existingKeys = new Set(props.matches.map((match) => getMatchKey(parseMatchId(match))));

      getIemGroupSlotIds(skipUpperFinal).forEach((matchId) => {
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
  }, [props.matches, skipUpperFinal]);

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
      headerHeight + bracketTopOffset + maxMatches * matchHeight + (maxMatches - 1) * matchGap;
    const positions = new Map<
      string,
      { hidden: boolean; match: BracketDisplayMatch; x: number; y: number }
    >();
    const incoming = new Map<string, string[]>();

    Object.values(rounds).forEach((matches) => {
      matches.forEach((match) => {
        const matchId = parseMatchId(match);
        const nextMatchId =
          getVisualWinnerTarget(matchId, Boolean(props.tourney.iemGroup), skipUpperFinal) ||
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
        const x = roundIndex * (matchWidth + roundGap);
        const childCenters = (incoming.get(matchKey) || [])
          .map((key) => positions.get(key))
          .filter(Boolean)
          .map((position) => position!.y + matchHeight / 2);
        const fallbackY =
          top + headerHeight + bracketTopOffset + matchIndex * (matchHeight + matchGap);
        const isFirstRound = matchId.r === firstRound;
        const isHiddenBye =
          !match.isPlaceholder &&
          sectionKey === 'upper' &&
          isFirstRound &&
          match.competitors.length < 2 &&
          roundNumbers.length > 1;
        const y = childCenters.length
          ? childCenters.reduce((sum, center) => sum + center, 0) / childCenters.length -
            matchHeight / 2
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
      width: roundNumbers.length * matchWidth + Math.max(0, roundNumbers.length - 1) * roundGap,
    };
  };

  const upper = buildSection('upper', 'Upper Bracket', 0);
  const lowerTop = upper.height + SECTION_GAP;
  const lower = buildSection('lower', 'Lower Bracket', lowerTop);
  const hasStandardDoubleElimFinals =
    !props.tourney.iemGroup &&
    upper.roundNumbers.length === 3 &&
    lower.roundNumbers.length === 5 &&
    Boolean(lower.positions.size);

  if (hasStandardDoubleElimFinals) {
    const upperFinal = upper.positions.get(
      getMatchKey({ s: Constants.BracketIdentifier.UPPER, r: 3, m: 1 }),
    );
    const lowerFinal = lower.positions.get(
      getMatchKey({ s: Constants.BracketIdentifier.LOWER, r: 4, m: 1 }),
    );
    const grandFinal = lower.positions.get(
      getMatchKey({ s: Constants.BracketIdentifier.LOWER, r: 5, m: 1 }),
    );

    if (upperFinal && lowerFinal && grandFinal) {
      upperFinal.x = lowerFinal.x;
      grandFinal.y =
        (upperFinal.y + matchHeight / 2 + lowerFinal.y + matchHeight / 2) / 2 - matchHeight / 2;
    }
  }

  const sections = lower.nodes.length ? [upper, lower] : [upper];
  const width = Math.max(
    ...sections.flatMap((section) => section.nodes.map((node) => node.x + matchWidth)),
  );
  const height = sections.reduce((max, section) => Math.max(max, section.top + section.height), 0);
  const allPositions = new Map(sections.flatMap((section) => [...section.positions.entries()]));

  React.useEffect(() => {
    const viewport = viewportRef.current;

    if (!viewport) {
      return;
    }

    const observer = new ResizeObserver(([entry]) => {
      setViewportSize({
        height: entry.contentRect.height,
        width: entry.contentRect.width,
      });
    });

    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  React.useLayoutEffect(() => {
    if (!props.fitToContainer || !viewportSize.width || !viewportSize.height) {
      return;
    }

    const fitZoom = (viewportSize.width - 40) / width;
    const minimumZoom = lower.nodes.length ? 0.65 : 0.7;
    setZoom(Number(Math.max(minimumZoom, fitZoom).toFixed(2)));
    setPan({ x: 0, y: 0 });
  }, [height, props.fitToContainer, viewportSize.height, viewportSize.width, width]);

  const connectors = sections.flatMap((section) =>
    section.nodes.flatMap(({ match }) => {
      const matchId = parseMatchId(match);
      const matchKey = getMatchKey(matchId);
      const nextMatchId =
        getVisualWinnerTarget(matchId, Boolean(props.tourney.iemGroup), skipUpperFinal) ||
        props.tourney.brackets.right(matchId)?.[0];
      if (!nextMatchId) {
        return [];
      }

      const from = section.positions.get(matchKey);
      const to = allPositions.get(getMatchKey(nextMatchId as BracketMatchId));
      if (!from || !to || from.hidden || to.hidden) {
        return [];
      }

      const startX = from.x + matchWidth;
      const startY = from.y + matchHeight / 2;
      const endX = to.x;
      const endY = to.y + matchHeight / 2;
      const midX = startX + (endX - startX) / 2;

      return [
        {
          highlighted:
            matchHasTeam(from.match, highlightedTeamId) &&
            matchHasTeam(to.match, highlightedTeamId),
          path: `M ${startX} ${startY} H ${midX} V ${endY} H ${endX}`,
        },
      ];
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
      return ['Opening round', 'Upper semi-finals', 'Upper final'][roundIndex] || `Round ${round}`;
    }

    return Util.parseCupRounds(roundIndex + 1, total);
  };
  const roundLeft = (section: BracketSection, round: number, roundIndex: number) =>
    section.nodes.find(({ match }) => parseMatchId(match).r === round)?.x ??
    roundIndex * (matchWidth + roundGap);
  const roundTop = (section: BracketSection, round: number) =>
    hasStandardDoubleElimFinals && section.title === 'Lower Bracket' && round === 5
      ? upper.top
      : section.top;

  return (
    <div
      className={cx(
        'bg-base-100 relative h-full w-full overflow-hidden p-5 select-none',
        props.fitToContainer ? 'cursor-default' : dragStart ? 'cursor-grabbing' : 'cursor-grab',
      )}
      ref={viewportRef}
      onMouseDown={handleMouseDown}
      onMouseLeave={handleMouseLeave}
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
            {connectors.map(({ highlighted, path }, index) => (
              <path
                key={`${path}-${index}`}
                d={path}
                fill="none"
                stroke={highlighted ? 'var(--color-info)' : 'rgba(148, 163, 184, 0.24)'}
                strokeWidth={highlighted ? 2 : 1}
                shapeRendering="crispEdges"
              />
            ))}
          </svg>
          {sections.map((section) => (
            <React.Fragment key={section.title}>
              {section.roundNumbers.map((round, roundIndex) => (
                <header
                  key={`${section.title}-${round}`}
                  className="text-base-content bg-base-200 border-base-content/10 absolute border text-center text-sm font-bold"
                  style={{
                    top: roundTop(section, round),
                    left: roundLeft(section, round, roundIndex),
                    width: matchWidth,
                    height: headerHeight,
                    lineHeight: `${headerHeight}px`,
                  }}
                >
                  {roundTitle(section, round)}
                </header>
              ))}
              {section.nodes.map(({ hidden, match, x, y }) =>
                hidden ? null : (
                  <div key={match.id} className="absolute" style={{ left: x, top: y }}>
                    <BracketCard
                      highlightedTeamId={highlightedTeamId}
                      compact={props.fitToContainer}
                      height={matchHeight}
                      match={match}
                      fmtDate={fmtDate}
                      onMatchClick={props.onMatchClick}
                      onPartyClick={props.onPartyClick}
                      onTeamHover={setHighlightedTeamId}
                      width={matchWidth}
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
  const displayMatches = React.useMemo(
    () =>
      props.matches.length
        ? props.matches
        : props.preview
          ? createPreviewMatches(props.preview)
          : [],
    [props.matches, props.preview],
  );
  const tourney = React.useMemo(
    () =>
      displayMatches[0]
        ? Tournament.restore(JSON.parse(displayMatches[0].competition.tournament))
        : undefined,
    [displayMatches],
  );

  if (!tourney?.brackets) {
    return null;
  }

  return (
    <ManualBracket
      matches={displayMatches}
      tourney={tourney}
      fitToContainer={props.fitToContainer}
      onMatchClick={props.onMatchClick}
      onPartyClick={props.onPartyClick}
    />
  );
}
