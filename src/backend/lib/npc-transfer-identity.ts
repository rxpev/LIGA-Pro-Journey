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
  /** Serialized persistent policy written by save maintenance. */
  npcRecruitmentPolicy?: string | NpcTransferRecruitmentPolicy | null;
  country?: CountryLike;
  players?: PlayerLike[] | null;
};

export type NpcTransferRecruitmentPolicyType =
  | 'national-lock'
  | 'national-core'
  | 'cis-core'
  | 'regional';

/**
 * The policy is deliberately small and JSON serializable because saves are
 * SQLite databases shared by several game versions. The roster can become
 * temporarily incomplete, but this value keeps the recruitment rule stable.
 */
export type NpcTransferRecruitmentPolicy = {
  version: 1;
  type: NpcTransferRecruitmentPolicyType;
  countryId?: number | null;
  region?: RegionIdentity;
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
      type: 'cis-core';
      count: number;
      region: RegionIdentity;
      dominantCountryId?: number | null;
      dominantCount?: number;
    }
  | {
      type: 'regional';
      region: RegionIdentity;
    };

function isRegionIdentity(value: unknown): value is RegionIdentity {
  return (
    value === 'Europe' ||
    value === 'Other' ||
    value === 'South America' ||
    value === 'Asia' ||
    value === 'North America'
  );
}

function parseNpcTransferRecruitmentPolicy(
  value: TeamLike['npcRecruitmentPolicy'],
): NpcTransferRecruitmentPolicy | null {
  let parsed: unknown = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch (_) {
      return null;
    }
  }

  if (!parsed || typeof parsed !== 'object') return null;
  const policy = parsed as Record<string, unknown>;
  const type = policy.type;
  if (
    type !== 'national-lock' &&
    type !== 'national-core' &&
    type !== 'cis-core' &&
    type !== 'regional'
  ) {
    return null;
  }

  const countryId = policy.countryId;
  if (
    (type === 'national-lock' || type === 'national-core') &&
    (typeof countryId !== 'number' || !Number.isInteger(countryId) || countryId <= 0)
  ) {
    return null;
  }

  const region = isRegionIdentity(policy.region) ? policy.region : undefined;
  return {
    version: 1,
    type,
    countryId: typeof countryId === 'number' ? countryId : null,
    region,
  };
}

export function serializeNpcTransferRecruitmentPolicy(policy: NpcTransferRecruitmentPolicy) {
  return JSON.stringify(policy);
}

function identityFromPolicy(
  policy: NpcTransferRecruitmentPolicy,
  team: TeamLike,
  starters: PlayerLike[],
): NpcTransferTeamIdentity {
  const region = policy.region ?? getNpcTransferRegionIdentity(team);
  const countryId = policy.countryId;
  const count =
    countryId == null
      ? 0
      : starters.filter((player) => player.countryId === countryId).length;

  if ((policy.type === 'national-lock' || policy.type === 'national-core') && countryId != null) {
    return { type: policy.type, countryId, count, region };
  }

  if (policy.type === 'cis-core') {
    const countryCounts = new Map<number, number>();
    starters.forEach((player) => {
      if (player.countryId != null && isNpcTransferCisCountry(player)) {
        countryCounts.set(player.countryId, (countryCounts.get(player.countryId) ?? 0) + 1);
      }
    });
    const [dominantCountryId, dominantCount] =
      [...countryCounts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0] ?? [];
    return {
      type: 'cis-core',
      count: starters.filter(isNpcTransferCisCountry).length,
      region,
      dominantCountryId: dominantCountryId ?? null,
      dominantCount: dominantCount ?? 0,
    };
  }

  return { type: 'regional', region };
}

/**
 * Resolve a policy for a new team from its current roster. A national lock is
 * inferred only from a complete five-player same-country roster, which avoids
 * turning an originally mixed team into a permanent lock merely because its
 * current majority is four players.
 */
export function inferNpcTransferRecruitmentPolicy(team: TeamLike): NpcTransferRecruitmentPolicy {
  const starters = (team.players ?? []).filter((player) => player.starter !== false);
  const currentCounts = new Map<number, number>();
  starters.forEach((player) => {
    if (player.countryId != null) {
      currentCounts.set(player.countryId, (currentCounts.get(player.countryId) ?? 0) + 1);
    }
  });

  const currentLock = [...currentCounts.entries()].find(
    ([, count]) => count >= 5 && starters.length >= 5,
  );
  const lock = currentLock ? { countryId: currentLock[0], count: currentLock[1] } : null;

  if (lock) {
    return {
      version: 1,
      type: 'national-lock',
      countryId: lock.countryId,
      region: getNpcTransferRegionIdentity(team),
    };
  }

  const dominantCurrent = [...currentCounts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0] - b[0],
  )[0];
  if (dominantCurrent && dominantCurrent[1] >= 3) {
    const cisCount = starters.filter(isNpcTransferCisCountry).length;
    if (cisCount >= 3 && cisCount >= Math.ceil(starters.length * 0.6)) {
      return {
        version: 1,
        type: 'cis-core',
        region: getNpcTransferRegionIdentity(team),
      };
    }

    return {
      version: 1,
      type: 'national-core',
      countryId: dominantCurrent[0],
      region: getNpcTransferRegionIdentity(team),
    };
  }

  const cisCount = starters.filter(isNpcTransferCisCountry).length;
  if (cisCount >= 3 && cisCount >= Math.ceil(starters.length * 0.6)) {
    return {
      version: 1,
      type: 'cis-core',
      region: getNpcTransferRegionIdentity(team),
    };
  }

  return {
    version: 1,
    type: 'regional',
    region: getNpcTransferRegionIdentity(team),
  };
}

export function getNpcTransferRecruitmentPolicy(team: TeamLike) {
  return parseNpcTransferRecruitmentPolicy(team.npcRecruitmentPolicy);
}

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

export const CIS_COUNTRY_CODES = new Set([
  'ru',
  'ua',
  'by',
  'kz',
  'uz',
  'ge',
  'am',
  'az',
  'tm',
  'tj',
  'kg',
  'md',
]);

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

export function isNpcTransferCisCountry(entity: { country?: CountryLike }) {
  const countryCode = entity.country?.code?.toLowerCase() ?? null;
  return Boolean(countryCode && CIS_COUNTRY_CODES.has(countryCode));
}

export function getNpcTransferTeamIdentity(team: TeamLike): NpcTransferTeamIdentity {
  const starters = (team.players ?? []).filter((player) => player.starter !== false);
  const persistedPolicy = getNpcTransferRecruitmentPolicy(team);
  if (persistedPolicy) {
    // A team that later becomes a complete five-player national roster earns a
    // lock even if it began as a regional team. The caller persists this
    // upgrade on its next roster maintenance pass.
    const currentCounts = new Map<number, number>();
    starters.forEach((player) => {
      if (player.countryId != null) {
        currentCounts.set(player.countryId, (currentCounts.get(player.countryId) ?? 0) + 1);
      }
    });
    const currentLock = [...currentCounts.entries()].find(
      ([, count]) => count >= 5 && starters.length >= 5,
    );
    if (currentLock && persistedPolicy.type !== 'national-lock') {
      return {
        type: 'national-lock',
        countryId: currentLock[0],
        count: currentLock[1],
        region: getNpcTransferRegionIdentity(team),
      };
    }
    return identityFromPolicy(persistedPolicy, team, starters);
  }

  const countryCounts = new Map<number, number>();
  let cisCount = 0;

  for (const player of starters) {
    if (player.countryId == null) continue;
    countryCounts.set(player.countryId, (countryCounts.get(player.countryId) ?? 0) + 1);
    if (isNpcTransferCisCountry(player)) {
      cisCount += 1;
    }
  }

  const [countryId, count] =
    [...countryCounts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0] ?? [];
  const region = getNpcTransferRegionIdentity(team);
  const dominantStarter = starters.find((player) => player.countryId === countryId);
  const dominantCountryIsCis = dominantStarter ? isNpcTransferCisCountry(dominantStarter) : false;

  // A complete five-player same-country roster is always a national lock,
  // including Russian/CIS teams. CIS precedence used to silently weaken this
  // case and let a non-national candidate through after a vacancy.
  if (countryId != null && count >= 5 && starters.length >= 5) {
    return { type: 'national-lock', countryId, count, region };
  }

  if (cisCount >= 3 && cisCount >= Math.ceil(starters.length * 0.6)) {
    return {
      type: 'cis-core',
      count: cisCount,
      region,
      dominantCountryId: dominantCountryIsCis ? countryId : null,
      dominantCount: dominantCountryIsCis ? count : 0,
    };
  }

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
  if (identity.type === 'cis-core') return isNpcTransferCisCountry(candidate);
  if (identity.type !== 'national-lock') return true;
  return candidate.countryId === identity.countryId;
}

export function getNpcTransferCompatibilityScore(team: TeamLike, candidate: PlayerLike) {
  const identity = getNpcTransferTeamIdentity(team);
  if (identity.type === 'national-lock') {
    return candidate.countryId === identity.countryId ? 250 : Number.NEGATIVE_INFINITY;
  }

  if (identity.type === 'cis-core') {
    if (!isNpcTransferCisCountry(candidate)) return Number.NEGATIVE_INFINITY;
    if (candidate.countryId === identity.dominantCountryId) {
      return 185 + Math.min(40, (identity.dominantCount ?? 0) * 8);
    }
    return 95;
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
  const matchesCisDominantIdentity =
    identity.type === 'cis-core' && candidate.countryId === identity.dominantCountryId;

  if (matchesNationalIdentity || matchesCisDominantIdentity || starterMatches > 0) {
    return 'national';
  }

  if (identity.type === 'cis-core' && isNpcTransferCisCountry(candidate)) {
    return 'regional';
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

  if (identity.type === 'cis-core') {
    if (!isNpcTransferCisCountry(candidate)) return Number.NEGATIVE_INFINITY;
    if (candidate.countryId === identity.dominantCountryId) {
      return 215 + Math.min(40, (identity.dominantCount ?? 0) * 8);
    }
    if (starterMatches > 0) {
      return 155 + starterMatches * 20 + (sameFederation ? 10 : 0);
    }
    return 120 + (sameFederation ? 15 : 0);
  }

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
  const sameCisDominantIdentity =
    identity.type === 'cis-core' && candidate.countryId === identity.dominantCountryId;
  const sameRegion = getNpcTransferRegionIdentity(candidate) === identity.region;
  const tierGap = Math.max(1, destinationTier - sourceTier);
  const missingTierBoost = Math.max(0, context.missingIntermediateTiers ?? 0) * 18;

  let score = 18 + Math.min(80, (xp - 70) * 3);
  if (xp >= 80) score += 20;
  if (sameNationalIdentity || sameCisDominantIdentity) score += 55;
  else if (identity.type === 'cis-core' && isNpcTransferCisCountry(candidate)) score += 35;
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
  getNpcTransferRecruitmentPolicy,
  inferNpcTransferRecruitmentPolicy,
  serializeNpcTransferRecruitmentPolicy,
  getNpcTransferRegionIdentity,
  isNpcTransferRegionalSquadIdentity,
  isNpcTransferCisCountry,
  isNpcTransferCompatible,
  getNpcTransferCompatibilityScore,
  USER_OFFER_FIT_BUCKET_WEIGHTS,
  getUserOfferFitBucket,
  getUserOfferFitScore,
  getLowerLeaguePromotionCandidateScore,
  filterNpcTransferCompatibleCandidates,
  sortNpcTransferCandidatesByFit,
};
