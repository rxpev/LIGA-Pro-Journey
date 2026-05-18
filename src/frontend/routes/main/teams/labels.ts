import { Constants, Util } from '@liga/shared';

const ESL_PRO_LEAGUE_NAME = 'ESL Pro League';
const StandaloneLeagueNameByTierSlug: Record<string, string> = {
  [Constants.TierSlug.BLAST_FINALS]: 'BLAST Finals',
  [Constants.TierSlug.CCT_GLOBAL_FINALS]: 'CCT Global Finals',
  [Constants.TierSlug.CCT_OCE_PLAYOFFS]: 'CCT Series',
  [Constants.TierSlug.CCT_OCE_SERIES]: 'CCT Series',
  [Constants.TierSlug.CCT_SERIES]: 'CCT Series',
  [Constants.TierSlug.CCT_SERIES_PLAYOFFS]: 'CCT Series',
  [Constants.TierSlug.ESEA_CASH_CUP]: 'ESEA Cash Cup',
  [Constants.TierSlug.ESL_CHALLENGER]: 'ESL Challenger',
  [Constants.TierSlug.ESL_CHALLENGER_PLAYOFFS]: 'ESL Challenger',
  [Constants.TierSlug.IEM_COLOGNE_GROUP_A]: 'IEM Cologne',
  [Constants.TierSlug.IEM_COLOGNE_GROUP_B]: 'IEM Cologne',
  [Constants.TierSlug.IEM_COLOGNE_OPEN_QUALIFIER]: 'IEM Cologne Qualifier',
  [Constants.TierSlug.IEM_COLOGNE_PLAYOFFS]: 'IEM Cologne',
  [Constants.TierSlug.IEM_KRAKOW_GROUP_A]: 'IEM Krakow',
  [Constants.TierSlug.IEM_KRAKOW_GROUP_B]: 'IEM Krakow',
  [Constants.TierSlug.IEM_KRAKOW_OPEN_QUALIFIER]: 'IEM Krakow Qualifier',
  [Constants.TierSlug.IEM_KRAKOW_PLAYOFFS]: 'IEM Krakow',
};

export const getTeamsTierLabel = (tierSlug: string, leagueName?: string) => {
  if (tierSlug === Constants.TierSlug.LEAGUE_PRO) {
    return leagueName ?? ESL_PRO_LEAGUE_NAME;
  }

  if (tierSlug === Constants.TierSlug.LEAGUE_PRO_PLAYOFFS) {
    return `${leagueName ?? ESL_PRO_LEAGUE_NAME} Playoffs`;
  }

  if (leagueName) {
    return Util.getCompetitionDisplayName(leagueName, tierSlug);
  }

  if (StandaloneLeagueNameByTierSlug[tierSlug]) {
    return Util.getCompetitionDisplayName(StandaloneLeagueNameByTierSlug[tierSlug], tierSlug);
  }

  return Constants.IdiomaticTier[tierSlug] ?? tierSlug;
};

type MatchRoundContext = {
  payload?: string | null;
  round?: number | null;
  totalRounds?: number | null;
  competition?: {
    tournament?: string | null;
    tier?: {
      slug?: string | null;
    } | null;
  } | null;
};

function parseTournamentFlags(tournament?: string | null) {
  if (!tournament) {
    return { isDoubleElim: false, isIemGroup: false };
  }

  try {
    const parsed = JSON.parse(tournament);

    return {
      isDoubleElim:
        parsed?.brackets?.options?.last === Constants.BracketIdentifier.LOWER ||
        parsed?.iemGroup?.options?.last === Constants.BracketIdentifier.LOWER,
      isIemGroup: Boolean(parsed?.iemGroup),
    };
  } catch {
    return { isDoubleElim: false, isIemGroup: false };
  }
}

function parseBracketMatchId(payload?: string | null) {
  if (!payload) {
    return null;
  }

  try {
    return JSON.parse(payload) as { s?: number; r?: number; m?: number };
  } catch {
    return null;
  }
}

export function getTeamsRoundLabel(match: MatchRoundContext) {
  const tierSlug = match.competition?.tier?.slug as Constants.TierSlug | undefined;

  if (tierSlug && Constants.TierSwissConfig[tierSlug]) {
    return Util.parseSwissRound(match.round ?? 0);
  }

  const matchId = parseBracketMatchId(match.payload);
  const { isDoubleElim, isIemGroup } = parseTournamentFlags(match.competition?.tournament);

  if (isIemGroup && matchId) {
    if (matchId.s === Constants.BracketIdentifier.LOWER) {
      return (
        {
          1: 'Lower round 1',
          2: 'Lower semi-finals',
          3: 'Lower final',
        }[matchId.r ?? 0] || `Round ${matchId.r}`
      );
    }

    return (
      {
        1: 'Opening round',
        2: 'Upper semi-finals',
        3: 'Upper final',
      }[matchId.r ?? 0] || `Round ${matchId.r}`
    );
  }

  if (isDoubleElim && matchId) {
    if (matchId.s === Constants.BracketIdentifier.LOWER) {
      return (
        {
          1: 'Lower round 1',
          2: 'Lower round 2',
          3: 'Lower semi-finals',
          4: 'Lower final',
          5: 'Grand final',
        }[matchId.r ?? 0] || `Lower round ${matchId.r}`
      );
    }

    return (
      {
        1: 'Opening round',
        2: 'Upper semi-finals',
        3: 'Upper final',
      }[matchId.r ?? 0] || `Upper round ${matchId.r}`
    );
  }

  return Util.parseCupRounds(match.round ?? 0, match.totalRounds ?? 0);
}
