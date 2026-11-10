import { TierSlug } from '@liga/shared';

export type PassiveCareerLevel =
  | 'BEGINNER'
  | TierSlug.LEAGUE_OPEN
  | TierSlug.LEAGUE_INTERMEDIATE
  | TierSlug.LEAGUE_MAIN
  | TierSlug.LEAGUE_ADVANCED
  | TierSlug.LEAGUE_PRO;

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

export type OfficialScoutingEvidence = {
  maps: number;
  matches: number;
  rating: number | null;
  daysSinceLastMatch: number | null;
  lanMapShare: number;
  eventPrestige: number;
};

function getRecencyFactor(daysSinceLastMatch: number | null) {
  if (daysSinceLastMatch == null) return 0;
  return daysSinceLastMatch <= 14
    ? 1
    : daysSinceLastMatch <= 30
      ? 0.85
      : daysSinceLastMatch <= 60
        ? 0.55
        : daysSinceLastMatch <= 90
          ? 0.3
          : daysSinceLastMatch <= 180
            ? 0.12
            : 0.04;
}

export function getPassiveCareerLevel(params: {
  permanentStints: number;
  peakTier: number | null;
  majorWinner: boolean;
  prestige: readonly TierSlug[];
}): PassiveCareerLevel {
  if (params.majorWinner) return TierSlug.LEAGUE_PRO;
  if (params.permanentStints <= 0 || params.peakTier == null) return 'BEGINNER';
  return params.prestige[
    Math.max(0, Math.min(params.prestige.length - 1, params.peakTier))
  ] as PassiveCareerLevel;
}

export type OfficialScoutingBand = 'inactive' | 'low' | 'established' | 'strong' | 'exceptional';

export type OfficialScoutingPlan = {
  band: OfficialScoutingBand;
  weeklyChance: number;
  seasonMin: number;
  seasonMax: number;
};

function interpolate(min: number, max: number, value: number) {
  return min + (max - min) * clamp01(value);
}

/** Convert official evidence into a paced seasonal market band. */
export function getOfficialScoutingPlan(params: {
  evidence: OfficialScoutingEvidence;
  quality: number;
  transferListed: boolean;
}): OfficialScoutingPlan {
  const { evidence } = params;
  if (
    evidence.matches <= 0 ||
    evidence.maps <= 0 ||
    evidence.rating == null ||
    evidence.daysSinceLastMatch == null
  ) {
    return { band: 'inactive', weeklyChance: 0, seasonMin: 0, seasonMax: 0 };
  }

  const quality = clamp01(params.quality);
  const exceptional =
    evidence.daysSinceLastMatch <= 30 &&
    evidence.matches >= 6 &&
    evidence.maps >= 15 &&
    evidence.rating >= 1.2 &&
    quality >= 0.75;
  const strong =
    params.transferListed ||
    (evidence.daysSinceLastMatch <= 60 &&
      evidence.matches >= 4 &&
      evidence.maps >= 8 &&
      (evidence.rating >= 1.1 || quality >= 0.58));
  const established =
    evidence.daysSinceLastMatch <= 90 &&
    evidence.matches >= 2 &&
    evidence.maps >= 5 &&
    quality >= 0.3;

  if (exceptional) {
    return {
      band: 'exceptional',
      weeklyChance: Number(interpolate(9, 13, (quality - 0.75) / 0.25).toFixed(1)),
      seasonMin: 4,
      seasonMax: 6,
    };
  }
  if (strong) {
    return {
      band: 'strong',
      weeklyChance: Number(interpolate(7, 10, (quality - 0.58) / 0.17).toFixed(1)),
      seasonMin: 3,
      seasonMax: 4,
    };
  }
  if (established) {
    return {
      band: 'established',
      weeklyChance: Number(interpolate(2.5, 5, (quality - 0.3) / 0.28).toFixed(1)),
      seasonMin: 1,
      seasonMax: 3,
    };
  }
  return {
    band: 'low',
    weeklyChance: Number(interpolate(0.5, 2, quality / 0.3).toFixed(1)),
    seasonMin: 0,
    seasonMax: 1,
  };
}

export function hasOfficialScoutingCapacity(plan: OfficialScoutingPlan, offersThisSeason: number) {
  return plan.band !== 'inactive' && offersThisSeason < plan.seasonMax;
}

export function getOfficialScoutingQuality(params: {
  evidence: OfficialScoutingEvidence;
  promotionCount: number;
  titleReputation: number;
  majorWinner: boolean;
}) {
  const { evidence } = params;
  if (evidence.matches <= 0 || evidence.maps <= 0 || evidence.rating == null) return 0;
  const volume = clamp01(evidence.maps / 20) * 0.65 + clamp01(evidence.matches / 8) * 0.35;
  const rating = clamp01((evidence.rating - 0.75) / 0.6);
  const exposure = clamp01(
    0.55 * clamp01((evidence.eventPrestige - 0.5) / 1.25) + 0.45 * clamp01(evidence.lanMapShare),
  );
  const reputation = clamp01(
    params.promotionCount * 0.12 + params.titleReputation * 0.1 + (params.majorWinner ? 0.35 : 0),
  );
  const currentRelevance = 0.55 + getRecencyFactor(evidence.daysSinceLastMatch) * 0.45;
  return clamp01(
    (rating * 0.5 + volume * 0.25 + exposure * 0.15 + reputation * 0.1) * currentRelevance,
  );
}

/**
 * Maps career reputation to the market that can realistically scout a player.
 * Attention shifts weight within that market but never skips multiple levels.
 */
export function getPassiveTierWeights(params: {
  level: PassiveCareerLevel;
  attention: number;
}): Partial<Record<TierSlug, number>> {
  const attention = clamp01(params.attention);
  let weights: Partial<Record<TierSlug, number>>;

  switch (params.level) {
    case 'BEGINNER':
      weights = { [TierSlug.LEAGUE_OPEN]: 100 };
      break;
    case TierSlug.LEAGUE_OPEN:
      weights = {
        [TierSlug.LEAGUE_OPEN]: 80,
        [TierSlug.LEAGUE_INTERMEDIATE]: 20,
      };
      break;
    case TierSlug.LEAGUE_INTERMEDIATE:
      weights = {
        [TierSlug.LEAGUE_OPEN]: 15,
        [TierSlug.LEAGUE_INTERMEDIATE]: 65,
        [TierSlug.LEAGUE_MAIN]: 20,
      };
      break;
    case TierSlug.LEAGUE_MAIN:
      weights = {
        [TierSlug.LEAGUE_INTERMEDIATE]: 10,
        [TierSlug.LEAGUE_MAIN]: 65,
        [TierSlug.LEAGUE_ADVANCED]: 25,
      };
      break;
    case TierSlug.LEAGUE_ADVANCED:
      weights = {
        [TierSlug.LEAGUE_MAIN]: 10,
        [TierSlug.LEAGUE_ADVANCED]: 65,
        [TierSlug.LEAGUE_PRO]: 25,
      };
      break;
    default:
      weights = {
        [TierSlug.LEAGUE_ADVANCED]: 15,
        [TierSlug.LEAGUE_PRO]: 85,
      };
      break;
  }

  const entries = Object.entries(weights) as Array<[TierSlug, number]>;
  if (entries.length <= 1) return weights;

  // Strong form/reputation pushes ten points toward the top of the available
  // market; weak form pushes ten points toward the lowest realistic level.
  const shift = attention >= 0.75 ? 10 : attention <= 0.35 ? -10 : 0;
  if (!shift) return weights;
  const low = entries[0];
  const high = entries[entries.length - 1];
  if (shift > 0) {
    const amount = Math.min(shift, low[1] - 1);
    weights[low[0]] = low[1] - amount;
    weights[high[0]] = high[1] + amount;
  } else {
    const amount = Math.min(-shift, high[1] - 1);
    weights[low[0]] = low[1] + amount;
    weights[high[0]] = high[1] - amount;
  }
  return weights;
}

export function getPassivePermanentOfferChance(params: {
  level: PassiveCareerLevel;
  attention: number;
  permanentStints: number;
}) {
  const base: Record<PassiveCareerLevel, number> = {
    BEGINNER: 15,
    [TierSlug.LEAGUE_OPEN]: 35,
    [TierSlug.LEAGUE_INTERMEDIATE]: 50,
    [TierSlug.LEAGUE_MAIN]: 65,
    [TierSlug.LEAGUE_ADVANCED]: 80,
    [TierSlug.LEAGUE_PRO]: 90,
  };
  const performanceAdjustment = Math.round((clamp01(params.attention) - 0.5) * 30);
  const experienceAdjustment = Math.min(12, Math.max(0, params.permanentStints - 1) * 3);
  return Math.max(
    10,
    Math.min(95, base[params.level] + performanceAdjustment + experienceAdjustment),
  );
}
