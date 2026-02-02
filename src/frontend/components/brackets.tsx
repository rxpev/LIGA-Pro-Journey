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
  Match,
  SVGViewer,
  MATCH_STATES,
  MatchType,
  createTheme,
} from '@g-loot/react-tournament-brackets/dist/esm';

/** @interface */
interface Props {
  matches: Awaited<ReturnType<typeof api.matches.all<typeof Eagers.match>>>;
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

/**
 * Exports this module.
 *
 * @param props Root props.
 * @component
 * @exports
 */
export default function (props: Props) {
  // bail if no brackets data
  const tourney = Tournament.restore(JSON.parse(props.matches[0].competition.tournament));
  const fmtDate = useFormatAppDate();
  if (!tourney.brackets) {
    return null;
  }
  type HasLast = { last: number };

  function hasLast(options: unknown): options is HasLast {
    return (
      typeof options === 'object' &&
      options !== null &&
      'last' in options &&
      typeof (options as any).last === 'number'
    );
  }

  const isDoubleElim = hasLast(tourney.options) && tourney.options.last === Constants.BracketIdentifier.LOWER;

  // grab the width and height of the parent component
  // dynamically to pass on to the canvas below
  const refWrapper = React.useRef<HTMLDivElement>();
  const [dimensions, setDimensions] = React.useState({
    width: 0,
    height: 0,
  });

  React.useEffect(() => {
    if (refWrapper.current) {
      setDimensions({
        width: refWrapper.current.offsetWidth,
        height: refWrapper.current.offsetHeight,
      });
    }
  }, []);

  return (
    <div ref={refWrapper} className="h-full w-full cursor-grab">
      {isDoubleElim ? (
        <DoubleEliminationBracket
          matches={toDoubleElimData(tourney, props.matches, fmtDate)}
          matchComponent={Match}
          theme={theme}
          options={{
            style: {
              connectorColor: 'color-mix(in oklch, transparent 90%, var(--color-base-content))',
              connectorColorHighlight: 'var(--color-base-content)',
              wonBywalkOverText: 'BYE',
              roundHeader: {
                fontColor: 'var(--color-base-content)',
                roundTextGenerator: Util.parseCupRounds,
              },
            },
          }}
          svgWrapper={({ children, ...props }) => (
            <SVGViewer
              width={dimensions.width}
              height={dimensions.height}
              miniatureProps={{ position: 'none' }}
              SVGBackground="var(--color-base-100)"
              {...props}
            >
              {children}
            </SVGViewer>
          )}
        />
      ) : (
        <SingleEliminationBracket
          matches={toSingleElimData(tourney, props.matches, fmtDate)}
          matchComponent={Match}
          theme={theme}
          options={{
            style: {
              connectorColor: 'color-mix(in oklch, transparent 90%, var(--color-base-content))',
              connectorColorHighlight: 'var(--color-base-content)',
              wonBywalkOverText: 'BYE',
              roundHeader: {
                fontColor: 'var(--color-base-content)',
                roundTextGenerator: Util.parseCupRounds,
              },
            },
          }}
          svgWrapper={({ children, ...props }) => (
            <SVGViewer
              width={dimensions.width}
              height={dimensions.height}
              miniatureProps={{ position: 'none' }}
              SVGBackground="var(--color-base-100)"
              {...props}
            >
              {children}
            </SVGViewer>
          )}
        />
      )}
    </div>
  );
}
