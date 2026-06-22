type RegionIdentity = 'Europe' | 'Other' | 'South America' | 'Asia' | 'North America';

type ContinentLike = {
  code?: string | null;
  federationId?: number | null;
} | null;

type CountryLike = {
  code?: string | null;
  continent?: ContinentLike;
} | null;

type PlayerLike = {
  id?: number;
  starter?: boolean | null;
  countryId?: number | null;
  country?: CountryLike;
  xp?: number | null;
};

type TeamLike = {
  id?: number;
  countryId?: number | null;
  competitionFederationId?: number | null;
  country?: CountryLike;
  players?: PlayerLike[] | null;
};

export type UserOfferFitBucket = 'national' | 'regional' | 'other';

export const USER_OFFER_FIT_BUCKET_WEIGHTS: Record<UserOfferFitBucket, number> = {
  national: 45,
  regional: 55,
  other: 8,
};

export type NpcTransferTeamIdentity =
  | {
      type: 'national-lock';
      countryId: number;
      count: number;
      region: RegionIdentity;
    }
  | {
      type: 'national-core';
      countryId: number;
      count: number;
      region: RegionIdentity;
    }
  | {
      type: 'regional';
      region: RegionIdentity;
    };

const REGION_STORAGE_CODES: Record<string, RegionIdentity> = {
  eu: 'Europe',
  na: 'North America',
  xsa: 'South America',
  sa: 'South America',
  as: 'Asia',
  other: 'Other',
};

const CONTINENT_REGION_CODES: Record<string, RegionIdentity> = {
  EU: 'Europe',
  NA: 'North America',
  SA: 'South America',
  XSA: 'South America',
  AS: 'Asia',
  OC: 'Other',
  AF: 'Other',
};

export function getNpcTransferRegionIdentity(entity: { country?: CountryLike }): RegionIdentity {
  const countryCode = entity.country?.code?.toLowerCase() ?? null;
  if (countryCode && REGION_STORAGE_CODES[countryCode]) {
    return REGION_STORAGE_CODES[countryCode];
  }

  const continentCode = entity.country?.continent?.code?.toUpperCase() ?? null;
  if (continentCode && CONTINENT_REGION_CODES[continentCode]) {
    return CONTINENT_REGION_CODES[continentCode];
  }

  return 'Other';
}

export function isNpcTransferRegionalSquadIdentity(entity: { country?: CountryLike }) {
  const countryCode = entity.country?.code?.toLowerCase() ?? null;
  return Boolean(countryCode && REGION_STORAGE_CODES[countryCode]);
}

export function getNpcTransferTeamIdentity(team: TeamLike): NpcTransferTeamIdentity {
  const starters = (team.players ?? []).filter((player) => player.starter !== false);
  const countryCounts = new Map<number, number>();

  for (const player of starters) {
    if (player.countryId == null) continue;
    countryCounts.set(player.countryId, (countryCounts.get(player.countryId) ?? 0) + 1);
  }

  const [countryId, count] =
    [...countryCounts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0] ?? [];
  const region = getNpcTransferRegionIdentity(team);

  if (countryId != null && count >= 4) {
    return { type: 'national-lock', countryId, count, region };
  }

  if (countryId != null && count >= 3) {
    return { type: 'national-core', countryId, count, region };
  }

  return { type: 'regional', region };
}

export function isNpcTransferCompatible(team: TeamLike, candidate: PlayerLike) {
  const identity = getNpcTransferTeamIdentity(team);
  if (identity.type !== 'national-lock') return true;
  return candidate.countryId === identity.countryId;
}

export function getNpcTransferCompatibilityScore(team: TeamLike, candidate: PlayerLike) {
  const identity = getNpcTransferTeamIdentity(team);
  if (identity.type === 'national-lock') {
    return candidate.countryId === identity.countryId ? 250 : Number.NEGATIVE_INFINITY;
  }

  const sameRegion = getNpcTransferRegionIdentity(candidate) === identity.region;
  const sameFederation =
    team.competitionFederationId != null &&
    candidate.country?.continent?.federationId === team.competitionFederationId;

  if (identity.type === 'national-core') {
    if (candidate.countryId === identity.countryId) return 180;
    return (sameRegion ? 20 : -45) + (sameFederation ? 8 : 0);
  }

  return (sameRegion ? 45 : -12) + (sameFederation ? 8 : 0);
}

function getStarterNationalityMatchCount(team: TeamLike, candidate: PlayerLike) {
  if (candidate.countryId == null) return 0;

  return (team.players ?? []).filter(
    (player) => player.starter !== false && player.countryId === candidate.countryId,
  ).length;
}

export function getUserOfferFitBucket(team: TeamLike, candidate: PlayerLike): UserOfferFitBucket {
  if (!isNpcTransferCompatible(team, candidate)) return 'other';

  const identity = getNpcTransferTeamIdentity(team);
  const starterMatches = getStarterNationalityMatchCount(team, candidate);
  const matchesNationalIdentity =
    (identity.type === 'national-lock' || identity.type === 'national-core') &&
    candidate.countryId === identity.countryId;

  if (matchesNationalIdentity || starterMatches > 0) {
    return 'national';
  }

  if (identity.type === 'regional' && isNpcTransferRegionalSquadIdentity(team)) {
    return 'regional';
  }

  return 'other';
}

export function getUserOfferFitScore(team: TeamLike, candidate: PlayerLike) {
  if (!isNpcTransferCompatible(team, candidate)) {
    return Number.NEGATIVE_INFINITY;
  }

  const identity = getNpcTransferTeamIdentity(team);
  const starterMatches = getStarterNationalityMatchCount(team, candidate);
  const sameRegion = getNpcTransferRegionIdentity(candidate) === identity.region;
  const sameFederation =
    team.competitionFederationId != null &&
    candidate.country?.continent?.federationId === team.competitionFederationId;
  const regionalSquad = identity.type === 'regional' && isNpcTransferRegionalSquadIdentity(team);

  if (
    (identity.type === 'national-lock' || identity.type === 'national-core') &&
    candidate.countryId === identity.countryId
  ) {
    return identity.type === 'national-lock' ? 245 + identity.count * 8 : 215;
  }

  if (starterMatches > 0) {
    return 115 + starterMatches * 25 + (sameFederation ? 10 : 0);
  }

  if (regionalSquad) {
    return sameRegion ? 180 + (sameFederation ? 25 : 0) : 28 + (sameFederation ? 8 : 0);
  }

  if (identity.type === 'national-core') {
    return (sameRegion ? 52 : 22) + (sameFederation ? 8 : 0);
  }

  return (sameRegion ? 78 : 30) + (sameFederation ? 8 : 0);
}

export function getLowerLeaguePromotionCandidateScore(
  team: TeamLike,
  candidate: PlayerLike,
  context: {
    destinationTier: number | null | undefined;
    sourceTier: number | null | undefined;
    advancedTier: number;
    proTier: number;
    missingIntermediateTiers?: number;
  },
) {
  if (!isNpcTransferCompatible(team, candidate)) {
    return Number.NEGATIVE_INFINITY;
  }

  const destinationTier = context.destinationTier;
  const sourceTier = context.sourceTier;
  if (typeof destinationTier !== 'number' || typeof sourceTier !== 'number') return 0;
  if (destinationTier < context.advancedTier || sourceTier >= destinationTier) return 0;

  const xp = candidate.xp ?? 0;
  if (xp < 70) return 0;

  const identity = getNpcTransferTeamIdentity(team);
  const sameNationalIdentity =
    (identity.type === 'national-lock' || identity.type === 'national-core') &&
    candidate.countryId === identity.countryId;
  const sameRegion = getNpcTransferRegionIdentity(candidate) === identity.region;
  const tierGap = Math.max(1, destinationTier - sourceTier);
  const missingTierBoost = Math.max(0, context.missingIntermediateTiers ?? 0) * 18;

  let score = 18 + Math.min(80, (xp - 70) * 3);
  if (xp >= 80) score += 20;
  if (sameNationalIdentity) score += 55;
  else if (sameRegion) score += 25;
  if (destinationTier >= context.proTier) score += 10;
  score += missingTierBoost;
  score -= Math.max(0, tierGap - 1) * 8;

  return Math.max(0, Math.round(score));
}

export function filterNpcTransferCompatibleCandidates<T extends PlayerLike>(
  team: TeamLike,
  candidates: T[],
) {
  return candidates.filter((candidate) => isNpcTransferCompatible(team, candidate));
}

export function sortNpcTransferCandidatesByFit<T extends PlayerLike & { xp?: number | null }>(
  team: TeamLike,
  candidates: T[],
) {
  return [...filterNpcTransferCompatibleCandidates(team, candidates)].sort((a, b) => {
    const aScore = (a.xp ?? 0) + getNpcTransferCompatibilityScore(team, a);
    const bScore = (b.xp ?? 0) + getNpcTransferCompatibilityScore(team, b);
    return bScore - aScore || (b.xp ?? 0) - (a.xp ?? 0);
  });
}

export const __npcTransferIdentityTest = {
  getNpcTransferTeamIdentity,
  getNpcTransferRegionIdentity,
  isNpcTransferRegionalSquadIdentity,
  isNpcTransferCompatible,
  getNpcTransferCompatibilityScore,
  USER_OFFER_FIT_BUCKET_WEIGHTS,
  getUserOfferFitBucket,
  getUserOfferFitScore,
  getLowerLeaguePromotionCandidateScore,
  filterNpcTransferCompatibleCandidates,
  sortNpcTransferCandidatesByFit,
};
