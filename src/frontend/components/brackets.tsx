/**
 * Brackets component.
 *
 * @module
 */
import React from 'react';
import Tournament from '@liga/shared/tournament';
import { Constants, Eagers, Util } from '@liga/shared';
import { useFormatAppDate } from '@liga/frontend/hooks/use-FormatAppDate';
import {
  SingleEliminationBracket,
  DoubleEliminationBracket,
  SVGViewer,
  MATCH_STATES,
  MatchType,
  ParticipantType,
  createTheme,
} from '@g-loot/react-tournament-brackets/dist/esm';
import { TeamLogoMatch } from './brackets/match';

/** @interface */
interface Props {
  matches: Awaited<ReturnType<typeof api.matches.all<typeof Eagers.match>>>;
  onPartyClick?: (party: ParticipantType, partyWon: boolean) => void;
}

/**
 * Brackets theme definition.
 *
 * @constant
 */
const theme = createTheme({
  border: {
    color: 'color-mix(in oklch, transparent 90%, var(--color-base-content))',
    highlightedColor: 'var(--color-base-content)',
  },
  matchBackground: {
    wonColor: 'var(--color-base-200)',
    lostColor: 'color-mix(in oklch, transparent 90%, var(--color-base-200))',
  },
  roundHeaders: {
    background: 'var(--color-base-200)',
  },
  score: {
    background: {
      wonColor: 'var(--color-base-300)',
      lostColor: 'var(--color-base-300)',
    },
    text: {
      highlightedWonColor: 'var(--color-info)',
      highlightedLostColor: 'var(--color-warning)',
    },
  },
  textColor: {
    main: 'var(--color-base-content)',
    dark: 'color-mix(in oklch, transparent 50%, var(--color-base-content))',
    highlighted: 'var(--color-base-content)',
  },
});

/**
 * Converts Prisma Matches object to data
 * expected by the brackets module.
 *
 * @param tourney The clux tournament object.
 * @param matches The Prisma matches data.
 * @function
 */
type BracketMatchId = { s: number; r: number; m: number };

function getMatchState(match: Props['matches'][number]) {
  switch (match.status) {
    case Constants.MatchStatus.COMPLETED:
      return MATCH_STATES.SCORE_DONE;
    case Constants.MatchStatus.LOCKED:
      return MATCH_STATES.NO_PARTY;
    default:
      return null;
  }
}

function getParticipantState(match: Props['matches'][number], score: number | null) {
  switch (match.status) {
    case Constants.MatchStatus.COMPLETED:
      return score !== null ? MATCH_STATES.SCORE_DONE : MATCH_STATES.WALK_OVER;
    case Constants.MatchStatus.LOCKED:
      return MATCH_STATES.NO_PARTY;
    default:
      return null;
  }
}

function toMatchType(
  tourney: Tournament,
  match: Props['matches'][number],
  matchId: BracketMatchId,
  fmtDate: (value: Date | number | string) => string,
) {
  const [nextMatchId] = tourney.brackets.right(matchId) || [];
  const downMatch = tourney.brackets as {
    down?: (id: BracketMatchId) => [BracketMatchId, number] | null;
  };
  const [nextLooserMatchId] =
    matchId.s === Constants.BracketIdentifier.UPPER ? downMatch.down?.(matchId) || [] : [];
  const bracketLabel =
    matchId.s === Constants.BracketIdentifier.UPPER
      ? 'UB'
      : matchId.s === Constants.BracketIdentifier.LOWER
        ? 'LB'
        : 'R';

  return {
    id: match.payload,
    nextMatchId: nextMatchId ? JSON.stringify(nextMatchId) : null,
    nextLooserMatchId: nextLooserMatchId ? JSON.stringify(nextLooserMatchId) : null,
    startTime: fmtDate(match.date),
    tournamentRoundText: `${bracketLabel} ${matchId.r}`,
    state: getMatchState(match),
    participants: match.competitors.map((competitor) => ({
      id: competitor.team.id,
      name: competitor.team.name,
      logo: competitor.team.blazon,
      isWinner: competitor.result === Constants.MatchResult.WIN,
      resultText: competitor.score !== null ? String(competitor.score) : null,
      status: getParticipantState(match, competitor.score),
    })),
  } satisfies MatchType;
}

function toSingleElimData(
  tourney: Tournament,
  matches: Props['matches'],
  fmtDate: (value: Date | number | string) => string,
): MatchType[] {
  return matches.map((match) => {
    const matchId = JSON.parse(match.payload) as BracketMatchId;
    return {
      ...toMatchType(tourney, match, matchId, fmtDate),
      tournamentRoundText: String(match.round),
      nextLooserMatchId: null as MatchType['nextLooserMatchId'],
    };
  });
}

function toDoubleElimData(
  tourney: Tournament,
  matches: Props['matches'],
  fmtDate: (value: Date | number | string) => string,
): { upper: MatchType[]; lower: MatchType[] } {
  return matches.reduce(
    (acc, match) => {
      const matchId = JSON.parse(match.payload) as BracketMatchId;
      const bracketMatch = toMatchType(tourney, match, matchId, fmtDate);
      if (matchId.s === Constants.BracketIdentifier.LOWER) {
        acc.lower.push({
          ...bracketMatch,
          nextLooserMatchId: null,
        });
      } else {
        acc.upper.push(bracketMatch);
      }
      return acc;
    },
    { upper: [], lower: [] } as { upper: MatchType[]; lower: MatchType[] },
  );
}

function IemGroupBracket(props: {
  matches: Props['matches'];
  onPartyClick?: Props['onPartyClick'];
}) {
  const fmtDate = useFormatAppDate();
  const sections = React.useMemo(() => {
    const grouped = props.matches.reduce(
      (acc, match) => {
        const matchId = JSON.parse(match.payload) as BracketMatchId;
        const key = matchId.s === Constants.BracketIdentifier.LOWER ? 'lower' : 'upper';
        if (!acc[key][matchId.r]) {
          acc[key][matchId.r] = [];
        }
        acc[key][matchId.r].push(match);
        return acc;
      },
      { lower: {}, upper: {} } as Record<'lower' | 'upper', Record<number, Props['matches']>>,
    );

    Object.values(grouped).forEach((rounds) => {
      Object.values(rounds).forEach((round) => {
        round.sort((a, b) => {
          const aId = JSON.parse(a.payload) as BracketMatchId;
          const bId = JSON.parse(b.payload) as BracketMatchId;
          return aId.m - bId.m;
        });
      });
    });

    return grouped;
  }, [props.matches]);

  const renderMatch = (match: Props['matches'][number]) => {
    const competitors = [...match.competitors].sort((a, b) => a.seed - b.seed);

    return (
      <article
        key={match.id}
        className="border-base-content/10 bg-base-200/70 min-h-14 w-56 border text-xs shadow-sm"
      >
        <header className="text-base-content/60 px-2 py-1">{fmtDate(match.date)}</header>
        {competitors.map((competitor) => {
          const won = competitor.result === Constants.MatchResult.WIN;
          const lost = competitor.result === Constants.MatchResult.LOSS;

          return (
            <button
              key={competitor.id}
              type="button"
              className={[
                'flex h-7 w-full items-center justify-between gap-2 border-t border-base-content/10 px-2 text-left',
                won ? 'bg-base-300 text-base-content' : '',
                lost ? 'text-base-content/50' : '',
              ].join(' ')}
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
                className={[
                  'shrink-0 tabular-nums',
                  won ? 'text-success' : lost ? 'text-error' : 'text-base-content',
                ].join(' ')}
              >
                {competitor.score ?? '-'}
              </span>
            </button>
          );
        })}
      </article>
    );
  };

  const renderRounds = (
    title: string,
    rounds: Record<number, Props['matches']>,
    labels: Record<number, string>,
  ) => (
    <section className="space-y-3">
      <h3 className="text-base-content/70 text-sm font-semibold">{title}</h3>
      <div className="grid min-w-max grid-cols-3 gap-10">
        {[1, 2, 3].map((round) => (
          <div key={`${title}-${round}`} className="space-y-6">
            <header className="bg-base-200 text-info h-8 w-56 text-center text-sm leading-8">
              {labels[round]}
            </header>
            <div className="flex min-h-40 flex-col justify-around gap-4">
              {(rounds[round] ?? []).map(renderMatch)}
            </div>
          </div>
        ))}
      </div>
    </section>
  );

  return (
    <div className="h-full w-full overflow-auto bg-base-100 p-4">
      <div className="flex min-w-max flex-col gap-8">
        {renderRounds('Upper Bracket', sections.upper, {
          1: 'Opening round',
          2: 'Upper semi-finals',
          3: 'Upper final',
        })}
        {renderRounds('Lower Bracket', sections.lower, {
          1: 'Lower round 1',
          2: 'Lower semi-finals',
          3: 'Lower final',
        })}
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
  const fmtDate = useFormatAppDate();
  type HasLast = { last: number };

  function hasLast(options: unknown): options is HasLast {
    return (
      typeof options === 'object' &&
      options !== null &&
      'last' in options &&
      typeof (options as any).last === 'number'
    );
  }

  if (!tourney.brackets) {
    return null;
  }

  if (tourney.iemGroup) {
    return <IemGroupBracket matches={props.matches} onPartyClick={props.onPartyClick} />;
  }

  const isDoubleElim = hasLast(tourney.options) && tourney.options.last === Constants.BracketIdentifier.LOWER;

  // grab the width and height of the parent component
  // dynamically to pass on to the canvas below
  const refWrapper = React.useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = React.useState({
    width: 0,
    height: 0,
  });

  React.useEffect(() => {
    if (!refWrapper.current) {
      return;
    }

    const resizeObserver = new ResizeObserver(() => {
      if (!refWrapper.current) {
        return;
      }
      setDimensions({
        width: refWrapper.current.offsetWidth,
        height: refWrapper.current.offsetHeight,
      });
    });

    resizeObserver.observe(refWrapper.current);

    return () => resizeObserver.disconnect();
  }, []);

  const singleMatches = React.useMemo(
    () => toSingleElimData(tourney, props.matches, fmtDate),
    [fmtDate, props.matches, tourney],
  );
  const doubleMatches = React.useMemo(
    () => toDoubleElimData(tourney, props.matches, fmtDate),
    [fmtDate, props.matches, tourney],
  );

  const bracketOptions = React.useMemo(
    () => ({
      style: {
        connectorColor: 'color-mix(in oklch, transparent 90%, var(--color-base-content))',
        connectorColorHighlight: 'var(--color-base-content)',
        wonBywalkOverText: 'BYE',
        roundHeader: {
          fontColor: 'var(--color-base-content)',
          roundTextGenerator: Util.parseCupRounds,
        },
      },
    }),
    [],
  );

  const svgWrapper = React.useCallback(
    ({ children, ...props }: { children: React.ReactNode } & Record<string, unknown>) => (
      <SVGViewer
        width={dimensions.width}
        height={dimensions.height}
        bracketWidth={dimensions.width}
        bracketHeight={dimensions.height}
        miniatureProps={{ position: 'none' }}
        SVGBackground="var(--color-base-100)"
        {...props}
      >
        {children}
      </SVGViewer>
    ),
    [dimensions.height, dimensions.width],
  );

  return (
    <div ref={refWrapper} className="h-full w-full cursor-grab">
      {isDoubleElim ? (
        <DoubleEliminationBracket
          matches={doubleMatches}
          matchComponent={TeamLogoMatch}
          onPartyClick={props.onPartyClick}
          theme={theme}
          options={bracketOptions}
          svgWrapper={svgWrapper}
        />
      ) : (
        <SingleEliminationBracket
          matches={singleMatches}
          matchComponent={TeamLogoMatch}
          onPartyClick={props.onPartyClick}
          theme={theme}
          options={bracketOptions}
          svgWrapper={svgWrapper}
        />
      )}
    </div>
  );
}
