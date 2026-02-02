import { Constants } from '@liga/shared';

const ESL_PRO_LEAGUE_NAME = 'ESL Pro League';

export const getTeamsTierLabel = (tierSlug: string, leagueName?: string) => {
  if (tierSlug === Constants.TierSlug.LEAGUE_PRO) {
    return leagueName ?? ESL_PRO_LEAGUE_NAME;
  }

  if (tierSlug === Constants.TierSlug.LEAGUE_PRO_PLAYOFFS) {
    return `${leagueName ?? ESL_PRO_LEAGUE_NAME} Playoffs`;
  }

  return Constants.IdiomaticTier[tierSlug] ?? tierSlug;
};
