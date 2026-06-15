import { Constants, Util } from '@liga/shared';

const ESL_PRO_LEAGUE_NAME = 'ESL Pro League';
const EseaDivisionHonorNameByTierSlug: Record<string, string> = {
  [Constants.TierSlug.LEAGUE_OPEN_PLAYOFFS]: 'ESEA Open Division',
  [Constants.TierSlug.LEAGUE_INTERMEDIATE_PLAYOFFS]: 'ESEA Intermediate Division',
  [Constants.TierSlug.LEAGUE_MAIN_PLAYOFFS]: 'ESEA Main Division',
  [Constants.TierSlug.LEAGUE_ADVANCED_PLAYOFFS]: 'ESEA Advanced Division',
};
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

export const getTeamsHonorLabel = (tierSlug: string, leagueName?: string) => {
  if (EseaDivisionHonorNameByTierSlug[tierSlug]) {
    return leagueName
      ? EseaDivisionHonorNameByTierSlug[tierSlug].replace(/^ESEA/i, leagueName)
      : EseaDivisionHonorNameByTierSlug[tierSlug];
  }

  const hostedEventTitle = Util.getHostedEventTitleDisplayName(tierSlug);

  if (hostedEventTitle) {
    return hostedEventTitle;
  }

  if (StandaloneLeagueNameByTierSlug[tierSlug]) {
    return StandaloneLeagueNameByTierSlug[tierSlug];
  }

  return getTeamsTierLabel(tierSlug, leagueName);
};

export const getTeamsDivisionLabel = (tierSlug: string, leagueName?: string) => {
  if (
    [
      Constants.TierSlug.LEAGUE_OPEN,
      Constants.TierSlug.LEAGUE_INTERMEDIATE,
      Constants.TierSlug.LEAGUE_MAIN,
      Constants.TierSlug.LEAGUE_ADVANCED,
    ].includes(tierSlug as Constants.TierSlug)
  ) {
    return `${leagueName ?? 'ESEA'} ${(Constants.IdiomaticTier[tierSlug] ?? tierSlug).replace(
      /\s+Division$/i,
      '',
    )}`;
  }

  return getTeamsTierLabel(tierSlug, leagueName);
};

type MatchRoundContext = {
  payload?: string | null;
  round?: number | null;
  totalRounds?: number | null;
  competition?: {
    tournament?: string | null;
    tier?: {
      groupSize?: number | null;
      slug?: string | null;
    } | null;
  } | null;
};

export function getTeamsRoundLabel(match: MatchRoundContext) {
  return Util.getMatchRoundLabel(match);
}
