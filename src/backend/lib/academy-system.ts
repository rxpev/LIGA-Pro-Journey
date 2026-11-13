import { TierSlug, UserRole } from '@liga/shared';

export const AcademyPromotionClause = {
  GUARANTEE: 'PROMOTION_GUARANTEE',
  PRIORITY: 'PROMOTION_PRIORITY',
} as const;

export type AcademyPromotionClauseValue =
  (typeof AcademyPromotionClause)[keyof typeof AcademyPromotionClause];

export const ACADEMY_PROMOTION_MIN_MAPS = 20;
export const ACADEMY_PROMOTION_MIN_STINT_DAYS = 90;
export const ACADEMY_PROMOTION_COOLDOWN_DAYS = 90;
export const ACADEMY_PROMOTION_MAX_PER_YEAR = 2;
export const ACADEMY_VACANCY_MIN_RATING = 1.18;
export const ACADEMY_VACANCY_PATHWAY_BONUS = 8;

export type AcademyPlayerSnapshot = {
  id: number;
  age?: number | null;
  role?: string | null;
  rating?: number | null;
  maps?: number;
};

const MAIN_LEAGUE_TIER_ORDER = new Map<string, number>([
  [TierSlug.LEAGUE_OPEN, 0],
  [TierSlug.LEAGUE_INTERMEDIATE, 1],
  [TierSlug.LEAGUE_MAIN, 2],
  [TierSlug.LEAGUE_ADVANCED, 3],
  [TierSlug.LEAGUE_PRO, 4],
]);

export function getLeagueTierOrder(tierSlug?: string | null) {
  return tierSlug == null ? null : (MAIN_LEAGUE_TIER_ORDER.get(tierSlug) ?? null);
}

export function getAcademyIntegrityFieldSize(tierSize: number, qualifiedCount: number) {
  return Math.max(0, Math.min(tierSize, qualifiedCount));
}

export function isRegularLeagueTier(tierSlug?: string | null) {
  return getLeagueTierOrder(tierSlug) != null;
}

export function normalizeAcademyRole(role?: string | null) {
  const value = String(role ?? '').toUpperCase();
  if (value.includes('AWP') || value.includes('SNIP')) return 'SNIPER';
  if (value.includes('IGL') || value.includes('LEADER')) return 'IGL';
  return 'RIFLER';
}

export function academyRolesMatch(incomingRole?: string | null, incumbentRole?: string | null) {
  const incoming = normalizeAcademyRole(incomingRole);
  const incumbent = normalizeAcademyRole(incumbentRole);
  if (incoming === 'SNIPER' || incumbent === 'SNIPER') return incoming === incumbent;
  return true;
}

/**
 * Academy ratings are compressed towards 1.00 because they are earned against
 * weaker opposition. A larger division gap increases that compression.
 */
export function getOppositionAdjustedAcademyRating(
  rating: number,
  academyTier: number | null | undefined,
  parentTier: number | null | undefined,
) {
  const gap = Math.max(1, Number(parentTier ?? 0) - Number(academyTier ?? 0));
  const multiplier = Math.max(0.45, 0.68 - (gap - 1) * 0.08);
  return 1 + (rating - 1) * multiplier;
}

export function getAcademyPromotionScore(params: {
  academy: AcademyPlayerSnapshot;
  incumbent: AcademyPlayerSnapshot;
  academyTier?: number | null;
  parentTier?: number | null;
}) {
  const { academy, incumbent, academyTier, parentTier } = params;
  if (!academyRolesMatch(academy.role, incumbent.role)) return Number.NEGATIVE_INFINITY;
  if (
    (academy.maps ?? 0) < ACADEMY_PROMOTION_MIN_MAPS ||
    (incumbent.maps ?? 0) < ACADEMY_PROMOTION_MIN_MAPS
  ) {
    return Number.NEGATIVE_INFINITY;
  }
  if (academy.rating == null || incumbent.rating == null) return Number.NEGATIVE_INFINITY;

  const adjusted = getOppositionAdjustedAcademyRating(academy.rating, academyTier, parentTier);
  const agePressure = Math.max(0, (Number(incumbent.age ?? 25) - 28) * 0.018);
  const youthValue = Math.max(0, (22 - Number(academy.age ?? 22)) * 0.008);
  return adjusted - incumbent.rating + agePressure + youthValue;
}

export function shouldPromoteAcademyPlayer(params: {
  academy: AcademyPlayerSnapshot;
  incumbent: AcademyPlayerSnapshot;
  academyTier?: number | null;
  parentTier?: number | null;
}) {
  const score = getAcademyPromotionScore(params);
  const academyRating = params.academy.rating ?? 0;
  const incumbentRating = params.incumbent.rating ?? 9;

  // A badly struggling main player lowers the bar, while an exceptional 1.40
  // academy season can displace a merely solid 1.06 incumbent.
  const requiredGain = incumbentRating < 0.9 ? 0.02 : incumbentRating < 0.98 ? 0.07 : 0.12;
  return academyRating >= 1.18 && score >= requiredGain;
}

export function getAcademyVacancyDecisionScore(params: {
  xp?: number | null;
  rating?: number | null;
  maps?: number;
  compatibilityScore?: number;
  academyPlayer?: boolean;
  acquisitionBonus?: number;
}) {
  const stableRating =
    (params.maps ?? 0) >= 10 && Number.isFinite(params.rating) ? Number(params.rating) : 1;
  const formScore = Math.max(-25, Math.min(45, (stableRating - 1) * 100));
  return (
    Number(params.xp ?? 0) +
    Number(params.compatibilityScore ?? 0) +
    formScore +
    (params.academyPlayer ? ACADEMY_VACANCY_PATHWAY_BONUS : 0) +
    Number(params.acquisitionBonus ?? 0)
  );
}

export function isAcademyAgeMoveAllowed(
  age: number | null | undefined,
  currentRoster: Array<{ age?: number | null }>,
) {
  if (age == null || age <= 25) return true;
  return !currentRoster.some((player) => Number(player.age ?? 0) > 25);
}

export function getAcademyRecruitmentAgeScore(params: {
  age?: number | null;
  isRegen?: boolean | null;
  currentRoster: Array<{ age?: number | null }>;
}) {
  const age = Number(params.age ?? 24);
  if (!isAcademyAgeMoveAllowed(age, params.currentRoster)) return Number.NEGATIVE_INFINITY;
  if (age <= 19) return 135 + (params.isRegen ? 35 : 0);
  if (age <= 21) return 95 + (params.isRegen ? 25 : 0);
  if (age === 22) return 35;
  if (age <= 25) return -90;
  return -170; // the single veteran/mentor slot
}

export function isAcademyCareerEligible(params: {
  wonOfficialCompetition: boolean;
  highestPermanentTier: number | null;
  mainTierIndex: number;
}) {
  return (
    !params.wonOfficialCompetition &&
    Number(params.highestPermanentTier ?? -1) < params.mainTierIndex
  );
}

export function getAcademyUserClause(params: {
  role: UserRole | string;
  incumbentRating?: number | null;
  clubConfidence: 'guarantee' | 'priority';
}) {
  if (params.clubConfidence === 'priority') {
    return {
      clause: AcademyPromotionClause.PRIORITY as AcademyPromotionClauseValue,
      target: null,
    };
  }

  const role = normalizeAcademyRole(params.role);
  const base = role === 'SNIPER' ? 1.45 : role === 'IGL' ? 0.85 : 1.3;
  const ceiling = role === 'SNIPER' ? 2 : role === 'IGL' ? 1 : 1.6;
  const iglTarget = Math.min(
    ceiling,
    Math.max(base, base + Math.max(0, Number(params.incumbentRating ?? 1) - 0.9) * 0.5),
  );
  const comparisonTarget =
    params.incumbentRating == null
      ? base
      : role === 'IGL'
        ? iglTarget
        : Math.max(base, params.incumbentRating + (role === 'SNIPER' ? 0.32 : 0.24));

  return {
    clause: AcademyPromotionClause.GUARANTEE as AcademyPromotionClauseValue,
    target: Math.min(ceiling, Math.round(comparisonTarget * 100) / 100),
  };
}

export function isAcademyGuaranteeMet(params: {
  role?: string | null;
  rating?: number | null;
  winRate?: number | null;
  target?: number | null;
}) {
  if (params.target == null) return false;
  return normalizeAcademyRole(params.role) === 'IGL'
    ? Number(params.winRate ?? 0) >= params.target
    : Number(params.rating ?? 0) >= params.target;
}
