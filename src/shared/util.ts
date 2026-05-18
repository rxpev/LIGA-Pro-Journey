/**
 * Shared utility functions between main and renderer process.
 *
 * It is important to be careful with not importing any packages
 * specific to either platform as it may cause build failures.
 *
 * @module
 */
import type { Prisma } from '@prisma/client';
import { differenceBy, merge, set } from 'lodash';
import * as Constants from './constants';

/**
 * Builds team query from provided filters.
 *
 * @param federationId    Limit search to a specific federation.
 * @param countryId       Limit search to a specific country.
 * @param tier            Limit search to a specific tier.
 * @function
 */
export function buildTeamQuery(
  federationId?: number,
  countryId?: number,
  tier?: number,
): Prisma.TeamFindManyArgs {
  return {
    where: {
      ...(Number.isInteger(tier) ? { tier } : {}),
      country: {
        ...(countryId ? { id: countryId } : {}),
        ...(federationId
          ? {
              continent: {
                federationId,
              },
            }
          : {}),
      },
    },
  };
}

/**
 * Returns the replacement map for the selected
 * game variant, if one is found.
 *
 * Can optionally return the map in URI format which
 * can be used when passing to image components.
 *
 * @param map         The map to parse.
 * @param game        The selected game variant.
 * @param uri         Use uri format.
 * @function
 */
export function convertMapPool(map: string, game: Constants.Game, uri = false) {
  // setup uri fragments
  const protocol = 'resources://maps/';
  const extension = (() => {
    switch (game) {
      default:
        return '.png';
    }
  })();

  // find a replacement if any
  const replacement = Constants.MapPoolReplacements[game]?.[map] || map;
  return uri ? protocol + replacement + extension : replacement;
}

/**
 * @param result The result enum.
 * @function
 */
export function getResultTextColor(result: number) {
  return ['text-success', 'text-muted', 'text-error'][result];
}

/**
 * @param path The sorting property.
 * @param value The sorting value.
 * @function
 */
export function parseSortingDirection(path: string, value: unknown) {
  let direction: string | null;

  switch (value) {
    case 'asc':
      direction = 'desc';
      break;
    case 'desc':
      return null;
    default:
      direction = 'asc';
  }

  return set({}, path, direction);
}

/**
 * Implementation of sleep with promises.
 *
 * @function
 * @param ms Time in milliseconds to sleep for.
 */
export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Displays a whole number unless the
 * decimals are greater than 1.
 *
 * @param value The value.
 * @constant
 */
export function toOptionalDecimal(value: number) {
  return value.toFixed(3).replace(/[.,]000$/, '');
}

/**
 * Returns the ordinal suffix of the provided number.
 *
 * @param num The number to append the ordinal suffix to.
 * @function
 */
export function toOrdinalSuffix(num: string | number) {
  const int = parseInt(num as string);
  const digits = [int % 10, int % 100];
  const ordinals = ['st', 'nd', 'rd', 'th'];
  const oPattern = [1, 2, 3, 4];
  const tPattern = [11, 12, 13, 14, 15, 16, 17, 18, 19];
  return oPattern.includes(digits[0]) && !tPattern.includes(digits[1])
    ? int + ordinals[digits[0] - 1]
    : int + ordinals[3];
}

/**
 * Leverages `Intl.NumberFormat` to format numbers to currency.
 *
 * @param value The number to format.
 * @param opts  Number format options.
 * @function
 */
export function formatCurrency(value: number | string, opts?: Intl.NumberFormatOptions) {
  // setup base options
  const options: Intl.NumberFormatOptions = {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
    ...opts,
  };

  // convert string to number
  const num = typeof value === 'string' ? Number(value) : value;

  // only show decimals if necessary
  const formatter =
    num % 1 === 0
      ? new Intl.NumberFormat('en-US', {
          ...options,
          minimumFractionDigits: 0,
        })
      : new Intl.NumberFormat('en-US', options);

  // format the number
  return formatter.format(num);
}

/**
 * Returns the proper round description depending
 * on the number of matches left. For example:
 *
 * - RO16, Quarterfinals, Semifinals, Final
 * - Round xx
 *
 * @param round The current round number.
 * @param total The total number of matches in the current round.
 * @function
 */
export function parseCupRound(round: number, total: number) {
  switch (total) {
    case 16:
      return Constants.BracketRoundName.RO32;
    case 8:
      return Constants.BracketRoundName.RO16;
    case 4:
      return Constants.BracketRoundName.QF;
    case 2:
      return Constants.BracketRoundName.SF;
    case 1:
      return Constants.BracketRoundName.GF;
    default:
      return `Round ${round}`;
  }
}

/**
 * Similar to `parseCupRound` but returns the proper
 * round description based off of the _total_ number
 * of rounds in the entire tournament.
 *
 * @param round The current round number.
 * @param total The total number of rounds.
 * @function
 */
export function parseCupRounds(round: number, total: number) {
  switch (total - round) {
    case 4:
      return Constants.BracketRoundName.RO32;
    case 3:
      return Constants.BracketRoundName.RO16;
    case 2:
      return Constants.BracketRoundName.QF;
    case 1:
      return Constants.BracketRoundName.SF;
    case 0:
      return Constants.BracketRoundName.GF;
    default:
      return `Round ${round}`;
  }
}

/**
 * Returns a swiss round label.
 *
 * @param round The current round number.
 * @function
 */
export function parseSwissRound(round: number) {
  return `Swiss Round #${round}`;
}

/**
 * Returns the league tier size for the given federation,
 * falling back to the provided default when no override exists.
 *
 * @param tierSlug        The tier slug.
 * @param federationSlug  The federation slug.
 * @param fallback        The fallback size.
 * @function
 */
export function getLeagueTierSize(
  tierSlug: Constants.TierSlug,
  federationSlug: Constants.FederationSlug,
  fallback: number,
) {
  return Constants.LeagueTierSizesByFederation[federationSlug]?.[tierSlug] ?? fallback;
}

/**
 * Returns the promotion/relegation zones for a tier within a federation.
 *
 * @param tierSlug        The tier slug.
 * @param federationSlug  The federation slug.
 * @function
 */
export function getTierZones(
  tierSlug: Constants.TierSlug,
  federationSlug: Constants.FederationSlug,
) {
  const leagueZones = Constants.LeagueTierZonesByFederation[federationSlug]?.[tierSlug];
  return leagueZones ?? Constants.TierZones[tierSlug] ?? Constants.TierZones.default;
}

/**
 * Returns promotion/relegation zones adjusted for grouped standings.
 *
 * @param tierSlug        The tier slug.
 * @param federationSlug  The federation slug.
 * @param groupCount      Number of groups shown as separate tables.
 * @function
 */
export function getTierZonesByGroup(
  tierSlug: Constants.TierSlug,
  federationSlug: Constants.FederationSlug,
  groupCount: number,
) {
  const zones = getTierZones(tierSlug, federationSlug);
  if (groupCount <= 1) {
    return zones;
  }

  return zones.map(([start, end]) => {
    if (!start || !end || end < start) {
      return [0, 0];
    }

    const groupedStart = Math.ceil(start / groupCount);
    const groupedEnd = Math.max(groupedStart, Math.floor(end / groupCount));
    return [groupedStart, groupedEnd];
  });
}

/**
 * Returns whether a league tier should be available in a federation.
 *
 * @param tierSlug        The tier slug.
 * @param federationSlug  The federation slug.
 * @function
 */
export function isLeagueTierEnabledForFederation(
  tierSlug: Constants.TierSlug,
  federationSlug: Constants.FederationSlug,
) {
  const disabled = Constants.LeagueTierDisabledByFederation[federationSlug] ?? [];
  return !disabled.includes(tierSlug);
}

/**
 * Loads user reported issues.
 *
 * @param issues The issues string.
 * @function
 */
export function loadIssues(issues: string | undefined) {
  return JSON.parse(issues || '[]') as Array<number>;
}

/**
 * Loads user settings by merging with
 * application default settings.
 *
 * @param settings The settings string.
 * @function
 */
export function loadSettings(settings: string) {
  return merge({}, Constants.Settings, JSON.parse(settings) as typeof Constants.Settings);
}

/**
 * Sanitizes a file name.
 *
 * @param fileName The file name to sanitize.
 * @function
 */
export function sanitizeFileName(fileName: string) {
  const sanitized = fileName.replace(/[<>:"/\\|?*]/g, '');
  return sanitized.replace(/^\.+|\s+$|\.+$/g, '');
}

/**
 * Builds the team's squad by going through their
 * starters first and then backfilling if needed.
 *
 * @param team        The team database record.
 * @param profile     The profile database record.
 * @param includeUser Whether to include the user in the squad.
 * @param forceSize   Force the team size.
 * @function
 */
export function getSquad(
  team: Prisma.TeamGetPayload<{ include: { players: { include: { country: true } } } }>,
  profile: Prisma.ProfileGetPayload<unknown>,
  includeUser = false,
  forceSize?: number,
) {
  const isUserTeam = team.id === profile.teamId;

  const user = isUserTeam ? team.players.find((p) => p.id === profile.playerId) : undefined;

  const willIncludeUser = !!(includeUser && isUserTeam && user && !user.transferListed);
  const size = forceSize || Constants.GameSettings.SQUAD_STARTERS_NUM - +willIncludeUser;
  const pool = team.players.filter((p) => p.id !== profile.playerId);

  const eligible = pool.filter((p) => !p.transferListed);
  const listed = pool.filter((p) => p.transferListed);

  // build starters from eligible first
  const eligibleStarters = eligible.filter((p) => p.starter);
  let squad = [...eligibleStarters];

  // backfill with remaining eligible
  if (squad.length < size) {
    const eligibleRest = differenceBy(eligible, eligibleStarters, 'id');
    squad = [...squad, ...eligibleRest];
  }

  if (squad.length < size) {
    const listedStarters = listed.filter((p) => p.starter);
    const listedRest = differenceBy(listed, listedStarters, 'id');
    squad = [...squad, ...listedStarters, ...listedRest];
  }

  squad = squad.slice(0, size);

  return willIncludeUser ? [...squad, user!] : squad;
}

/**
 * Converts an integer to a letter of the alphabet.
 *
 * @param value The number to format.
 * @function
 */
export function toAlpha(value: number | string) {
  return String.fromCharCode(97 + (Number(value) - 1)).toUpperCase();
}

/**
 * Gets the formatted database name by the provided id.
 *
 * @param id The database id.
 * @method
 */
export function getSaveFileName(id: number) {
  return Constants.Application.DATABASE_NAME_FORMAT.replace('%s', String(id));
}

/**
 * Gets the logo for the specified tier based on
 * their federation and/or competition name.
 *
 * @param tierSlug        The tier slug.
 * @param federationSlug  The federation slug.
 * @function
 */
export function getCompetitionLogo(
  tierSlug: Constants.TierSlug | string,
  federationSlug?: Constants.FederationSlug | string,
) {
  const protocol = 'resources://competitions/';
  const slug =
    tierSlug === Constants.TierSlug.CCT_OCE_PLAYOFFS
      ? 'cct-oceania-series-playoffs'
      : tierSlug.replace(/:/gi, '-');

  // circuits are not tied to a federation
  if (slug.includes('circuit')) {
    return protocol + slug + '.png';
  }

  if (!federationSlug) {
    return protocol + slug + '-europa.png';
  }

  return `${protocol}${slug}-${federationSlug}.png`;
}

/**
 * Builds a user-facing competition name without repeating words already in the league name.
 *
 * @param leagueName The competition league name.
 * @param tierSlug   The tier slug.
 * @function
 */
export function getCompetitionDisplayName(
  leagueName: string | null | undefined,
  tierSlug: Constants.TierSlug | string | null | undefined,
) {
  const tierName = tierSlug ? Constants.IdiomaticTier[tierSlug] : '';
  const cleanLeagueName = (leagueName ?? '').trim();
  const cleanTierName = (tierName ?? '').trim();

  if (!cleanLeagueName) {
    return cleanTierName || tierSlug || '';
  }

  if (!cleanTierName) {
    return cleanLeagueName;
  }

  if (cleanLeagueName.toLocaleLowerCase().endsWith(cleanTierName.toLocaleLowerCase())) {
    return cleanLeagueName;
  }

  if (
    cleanLeagueName === 'CCT Series' &&
    cleanTierName.toLocaleLowerCase().startsWith('oceania ')
  ) {
    return `CCT ${cleanTierName}`;
  }

  return `${cleanLeagueName} ${cleanTierName}`;
}

/**
 * Gets the expected score value using the Elo formula.
 *
 * @param ratingA Expected score for Team A.
 * @param ratingB Expected score for Team B.
 * @param scaling Scaling factor for rating differences.
 * @function
 */
export function getEloWinProbability(ratingA: number, ratingB: number, scaling = 400): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / scaling));
}

/**
 * Gets the delta for a player's Elo rating.
 *
 * @param actualScore     The actual score.
 * @param expectedScore   The expected score.
 * @param k               The K-factor.
 * @function
 */
export function getEloRatingDelta(actualScore: number, expectedScore: number, k = 32) {
  return Math.round(k * (actualScore - expectedScore));
}

/**
 * Context used to compute team ranking point adjustments.
 */
export type TeamRankingDeltaContext = {
  tierSlug?: string | null;
  leagueSlug?: string | null;
  competitionFederationId?: number | null;
  ownCompetitionFederationId?: number | null;
  opponentCompetitionFederationId?: number | null;
  ownTier?: number | null;
  opponentTier?: number | null;
};

function getRankingTierWeight(tierSlug?: string | null, leagueSlug?: string | null) {
  if (leagueSlug === Constants.LeagueSlug.ESPORTS_PRO_LEAGUE) return 1.38;

  switch (tierSlug) {
    case Constants.TierSlug.MAJOR_CHAMPIONS_STAGE:
      return 1.8;
    case Constants.TierSlug.IEM_COLOGNE_PLAYOFFS:
    case Constants.TierSlug.IEM_KRAKOW_PLAYOFFS:
      return 1.58;
    case Constants.TierSlug.IEM_COLOGNE_GROUP_A:
    case Constants.TierSlug.IEM_COLOGNE_GROUP_B:
    case Constants.TierSlug.IEM_KRAKOW_GROUP_A:
    case Constants.TierSlug.IEM_KRAKOW_GROUP_B:
      return 1.36;
    case Constants.TierSlug.BLAST_FINALS:
      return 1.42;
    case Constants.TierSlug.CCT_GLOBAL_FINALS:
      return 1.0;
    case Constants.TierSlug.ESL_CHALLENGER_PLAYOFFS:
      return 0.98;
    case Constants.TierSlug.ESL_CHALLENGER:
      return 0.9;
    case Constants.TierSlug.CCT_SERIES_PLAYOFFS:
    case Constants.TierSlug.CCT_OCE_PLAYOFFS:
      return 0.82;
    case Constants.TierSlug.CCT_SERIES:
    case Constants.TierSlug.CCT_OCE_SERIES:
      return 0.72;
    case Constants.TierSlug.LEAGUE_PRO:
    case Constants.TierSlug.LEAGUE_PRO_PLAYOFFS:
      return 1.35;
    case Constants.TierSlug.LEAGUE_ADVANCED:
    case Constants.TierSlug.LEAGUE_ADVANCED_PLAYOFFS:
      return 0.92;
    case Constants.TierSlug.LEAGUE_MAIN:
    case Constants.TierSlug.LEAGUE_MAIN_PLAYOFFS:
      return 0.75;
    case Constants.TierSlug.LEAGUE_INTERMEDIATE:
    case Constants.TierSlug.LEAGUE_INTERMEDIATE_PLAYOFFS:
      return 0.52;
    case Constants.TierSlug.LEAGUE_OPEN:
    case Constants.TierSlug.LEAGUE_OPEN_PLAYOFFS:
      return 0.38;
    case Constants.TierSlug.MAJOR_CHALLENGERS_STAGE:
      return 1.15;
    case Constants.TierSlug.MAJOR_LEGENDS_STAGE:
      return 1.2;
    default:
      return 0.95;
  }
}

function getRankingFederationWeight(competitionFederationId?: number | null) {
  switch (competitionFederationId) {
    case 2: // Europe
      return 1.12;
    case 1: // Americas
      return 1.0;
    case 3: // Asia
      return 0.9;
    case 4: // OCE
      return 0.82;
    default:
      return 1.0;
  }
}

function getTournamentChampionBonus(tierSlug?: string | null, leagueSlug?: string | null) {
  if (leagueSlug === Constants.LeagueSlug.ESPORTS_PRO_LEAGUE) {
    return 70;
  }

  switch (tierSlug) {
    case Constants.TierSlug.MAJOR_CHAMPIONS_STAGE:
      return 160;
    case Constants.TierSlug.IEM_COLOGNE_PLAYOFFS:
    case Constants.TierSlug.IEM_KRAKOW_PLAYOFFS:
      return 115;
    case Constants.TierSlug.BLAST_FINALS:
      return 90;
    case Constants.TierSlug.CCT_GLOBAL_FINALS:
      return 42;
    case Constants.TierSlug.ESL_CHALLENGER_PLAYOFFS:
      return 36;
    case Constants.TierSlug.CCT_SERIES_PLAYOFFS:
    case Constants.TierSlug.CCT_OCE_PLAYOFFS:
      return 24;
    case Constants.TierSlug.MAJOR_LEGENDS_STAGE:
    case Constants.TierSlug.MAJOR_CHALLENGERS_STAGE:
      return 55;
    case Constants.TierSlug.LEAGUE_PRO_PLAYOFFS:
      return 85;
    case Constants.TierSlug.LEAGUE_PRO:
      return 45;
    default:
      return 16;
  }
}

function getTournamentDeltaCap(tierSlug?: string | null, leagueSlug?: string | null) {
  if (leagueSlug === Constants.LeagueSlug.ESPORTS_PRO_LEAGUE) {
    return 150;
  }

  switch (tierSlug) {
    case Constants.TierSlug.MAJOR_CHAMPIONS_STAGE:
      return 260;
    case Constants.TierSlug.IEM_COLOGNE_PLAYOFFS:
    case Constants.TierSlug.IEM_KRAKOW_PLAYOFFS:
      return 210;
    case Constants.TierSlug.BLAST_FINALS:
      return 170;
    case Constants.TierSlug.CCT_GLOBAL_FINALS:
      return 95;
    case Constants.TierSlug.ESL_CHALLENGER_PLAYOFFS:
      return 85;
    case Constants.TierSlug.CCT_SERIES_PLAYOFFS:
    case Constants.TierSlug.CCT_OCE_PLAYOFFS:
      return 70;
    case Constants.TierSlug.MAJOR_LEGENDS_STAGE:
    case Constants.TierSlug.MAJOR_CHALLENGERS_STAGE:
      return 140;
    case Constants.TierSlug.LEAGUE_PRO_PLAYOFFS:
      return 150;
    case Constants.TierSlug.LEAGUE_PRO:
      return 120;
    default:
      return 60;
  }
}

/**
 * Calculates per-team ranking point delta for a match using an HLTV-like
 * points model (upset boosts, favorite penalties, and top-team volatility).
 */
export function getTeamRankingPointDelta(
  ownElo: number,
  opponentElo: number,
  actualScore: number,
  context: TeamRankingDeltaContext = {},
) {
  const expectedScore = getEloWinProbability(ownElo, opponentElo, 325);
  const tierWeight = getRankingTierWeight(context.tierSlug, context.leagueSlug);
  const federationWeight = getRankingFederationWeight(context.competitionFederationId);
  let matchWeight = tierWeight * federationWeight;

  const sameRegionalCircuit =
    context.ownCompetitionFederationId != null &&
    context.opponentCompetitionFederationId != null &&
    context.ownCompetitionFederationId === context.opponentCompetitionFederationId;

  if (sameRegionalCircuit) {
    switch (context.tierSlug) {
      case Constants.TierSlug.LEAGUE_OPEN:
      case Constants.TierSlug.LEAGUE_OPEN_PLAYOFFS:
        matchWeight *= 0.5;
        break;
      case Constants.TierSlug.LEAGUE_INTERMEDIATE:
      case Constants.TierSlug.LEAGUE_INTERMEDIATE_PLAYOFFS:
        matchWeight *= 0.58;
        break;
      case Constants.TierSlug.LEAGUE_MAIN:
      case Constants.TierSlug.LEAGUE_MAIN_PLAYOFFS:
        matchWeight *= 0.72;
        break;
      default:
        matchWeight *= 0.9;
    }
  }

  const isWin = actualScore === 1;
  const isLoss = actualScore === 0;
  const rawDelta = 18 * (actualScore - expectedScore);
  const eloGap = ownElo - opponentElo;

  let volatility = 1;
  if (isWin) {
    const underdogBoost = expectedScore < 0.5 ? 1 + (0.5 - expectedScore) * 0.9 : 1;
    const eliteWinBoost =
      opponentElo > ownElo ? 1 + Math.min(0.85, (opponentElo - ownElo) / 1000) : 1;
    const topGainDamp = ownElo > 1400 ? Math.max(0.64, 1 - (ownElo - 1400) / 1800) : 1;
    volatility *= underdogBoost * eliteWinBoost * topGainDamp;
  } else if (isLoss) {
    const upsetPenalty = expectedScore > 0.5 ? 1 + (expectedScore - 0.5) * 1.25 : 1;
    const topLossBoost = ownElo > 1700 ? 1 + (ownElo - 1700) / 2200 : 1;
    const strongerOpponentRelief = eloGap < -250 ? Math.max(0.62, 1 - Math.abs(eloGap) / 2200) : 1;
    volatility *= upsetPenalty * topLossBoost * strongerOpponentRelief;
  } else {
    volatility *= 0.9;
  }

  let delta = Math.round(rawDelta * matchWeight * volatility);

  if (isWin && opponentElo >= 1500) {
    const elitePointsBonus = Math.min(26, Math.round((opponentElo - 1450) / 28));
    delta += Math.max(0, Math.round(elitePointsBonus * matchWeight));
  }

  if (isLoss && ownElo >= 1500 && opponentElo <= 1200) {
    const badLossPenalty = Math.min(16, Math.round((ownElo - opponentElo) / 60));
    delta -= Math.max(0, Math.round(badLossPenalty * matchWeight));
  }

  const cappedDelta = Math.max(-45, Math.min(45, delta));

  if (cappedDelta === 0 && actualScore !== expectedScore) {
    return actualScore > expectedScore ? 1 : -1;
  }

  return cappedDelta;
}

/**
 * Calculates end-of-tournament ranking bonus/penalty for a team.
 */
export function getTournamentPlacementRankingDelta(params: {
  currentElo: number;
  placement: number;
  totalTeams: number;
  tierSlug?: string | null;
  leagueSlug?: string | null;
  competitionFederationId?: number | null;
}) {
  const { currentElo, placement, totalTeams, tierSlug, leagueSlug, competitionFederationId } =
    params;

  if (!Number.isFinite(totalTeams) || totalTeams <= 1 || placement <= 0) {
    return 0;
  }

  const tierWeight = getRankingTierWeight(tierSlug, leagueSlug);
  const federationWeight = getRankingFederationWeight(competitionFederationId);
  const tournamentWeight = tierWeight * federationWeight;

  const normalizedStrength = clampElo(currentElo) / 2000;
  const expectedPlacement = 1 + (totalTeams - 1) * (1 - normalizedStrength);
  const placementPerformance = expectedPlacement - placement;
  let delta = placementPerformance * 3.25 * tournamentWeight;

  if (placement === 1) {
    delta += getTournamentChampionBonus(tierSlug, leagueSlug) * tournamentWeight;
  }

  const topTeamCollapseThreshold = Math.ceil(totalTeams * 0.35);
  if (currentElo >= 1500 && placement > topTeamCollapseThreshold) {
    const collapseSpan = Math.max(1, totalTeams - topTeamCollapseThreshold);
    const collapseSeverity = (placement - topTeamCollapseThreshold) / collapseSpan;
    delta -= 18 * collapseSeverity * tournamentWeight;
  }

  const cap = getTournamentDeltaCap(tierSlug, leagueSlug);
  return Math.max(-cap, Math.min(cap, Math.round(delta)));
}

/**
 * Clamps an Elo value to the configured team range.
 *
 * @param rating Elo value to clamp.
 * @param min Minimum allowed Elo.
 * @param max Maximum allowed Elo.
 * @function
 */
export function clampElo(rating: number, min = 1, max = 2000) {
  return Math.max(min, Math.min(max, Math.round(rating)));
}
