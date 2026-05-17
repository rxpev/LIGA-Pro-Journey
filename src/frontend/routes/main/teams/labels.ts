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
  if (leagueName) {
    return Util.getCompetitionDisplayName(leagueName, tierSlug);
  }

  if (StandaloneLeagueNameByTierSlug[tierSlug]) {
    return Util.getCompetitionDisplayName(StandaloneLeagueNameByTierSlug[tierSlug], tierSlug);
  }

  if (tierSlug === Constants.TierSlug.LEAGUE_PRO) {
    return leagueName ?? ESL_PRO_LEAGUE_NAME;
  }

  if (tierSlug === Constants.TierSlug.LEAGUE_PRO_PLAYOFFS) {
    return `${leagueName ?? ESL_PRO_LEAGUE_NAME} Playoffs`;
  }

  return Constants.IdiomaticTier[tierSlug] ?? tierSlug;
};
