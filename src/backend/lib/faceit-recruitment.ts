import { Constants, TierSlug } from '@liga/shared';

export type FaceitRecruitmentBand = 'poor' | 'adequate' | 'good' | 'excellent' | 'absurd';

export type FaceitRecruitmentPlan = {
  eligible: boolean;
  minimumMatches: number;
  offerCeilingMatch: number;
  performanceScore: number;
  band: FaceitRecruitmentBand;
  offerChance: number;
  guaranteed: boolean;
  projectedXp: number;
  minimumStarterRatio: number;
  tierWeights: Partial<Record<TierSlug, number>>;
};

export type FaceitTrialGoal = {
  type: 'RATING' | 'WIN_RATE';
  value: number;
};

export function shouldOfferPermanentDeal(
  band: FaceitRecruitmentBand,
  roll: number = Math.random(),
) {
  if (band === 'absurd') return roll < 0.5;
  if (band === 'excellent') return roll < 0.25;
  return false;
}

export function rollFaceitTrialSeries(random: number = Math.random()) {
  return 3 + Math.min(2, Math.floor(random * 3));
}

function steppedGoal(min: number, max: number, random: number) {
  const steps = Math.round((max - min) / 0.05);
  return Number((min + Math.min(steps, Math.floor(random * (steps + 1))) * 0.05).toFixed(2));
}

export function rollFaceitTrialGoal(role: unknown, random: number = Math.random()): FaceitTrialGoal {
  const normalized = String(role ?? '').toUpperCase().replace(/[\s_-]+/g, '');
  if (normalized === 'IGL' || normalized === 'INGAMELEADER') {
    return { type: 'WIN_RATE', value: Math.round(steppedGoal(0.6, 1, random) * 100) };
  }
  if (['AWPER', 'AWP', 'SNIPER', 'SNIPERPLAYER'].includes(normalized)) {
    return { type: 'RATING', value: steppedGoal(1.4, 1.7, random) };
  }
  return { type: 'RATING', value: steppedGoal(1.2, 1.5, random) };
}

type RecruitmentMarket = {
  minimumMatches: number;
  offerCeilingMatch: number;
  minimumElo: number;
  chanceMultiplier: number;
};

const MARKETS: Partial<Record<Constants.FederationSlug, RecruitmentMarket>> = {
  [Constants.FederationSlug.ESPORTS_EUROPA]: {
    minimumMatches: 8,
    offerCeilingMatch: 25,
    minimumElo: 2001,
    chanceMultiplier: 1,
  },
  [Constants.FederationSlug.ESPORTS_AMERICAS]: {
    minimumMatches: 6,
    offerCeilingMatch: 22,
    minimumElo: 0,
    chanceMultiplier: 1.05,
  },
  [Constants.FederationSlug.ESPORTS_ASIA]: {
    minimumMatches: 6,
    offerCeilingMatch: 20,
    minimumElo: 0,
    chanceMultiplier: 1.1,
  },
  [Constants.FederationSlug.ESPORTS_OCE]: {
    minimumMatches: 5,
    offerCeilingMatch: 18,
    minimumElo: 0,
    chanceMultiplier: 1.2,
  },
};

const BAND_CHANCE: Record<FaceitRecruitmentBand, { initial: number; growth: number }> = {
  poor: { initial: 1, growth: 1 },
  adequate: { initial: 3, growth: 2.5 },
  good: { initial: 8, growth: 4 },
  excellent: { initial: 28, growth: 8 },
  absurd: { initial: 65, growth: 12 },
};

const STARTER_RATIO: Record<FaceitRecruitmentBand, number> = {
  poor: 1,
  adequate: 0.97,
  good: 0.93,
  excellent: 0.88,
  absurd: 0.82,
};

const OFFICIAL_RATING_CEILING: Record<FaceitRecruitmentBand, number> = {
  poor: 0.9,
  adequate: 0.96,
  good: 1.02,
  excellent: 1.08,
  absurd: 1.15,
};

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

export function getFaceitRecruitmentPerformance(kd: number, winRatePct: number) {
  // K/D is the primary scouting signal. Treat 3.0 as the exceptional ceiling
  // instead of allowing ordinary 1.6 K/D performances to max out the score.
  const kdScore = clamp01((kd - 1) / 2.0);
  const winRateScore = clamp01((winRatePct - 50) / 30);
  return clamp01(kdScore * 0.95 + winRateScore * 0.05);
}

export function getFaceitRecruitmentBand(score: number): FaceitRecruitmentBand {
  if (score >= 0.88) return 'absurd';
  if (score >= 0.65) return 'excellent';
  if (score >= 0.38) return 'good';
  if (score >= 0.18) return 'adequate';
  return 'poor';
}

export function isFaceitRecruitmentSpotFit(
  plan: Pick<FaceitRecruitmentPlan, 'band' | 'projectedXp' | 'minimumStarterRatio'>,
  candidates: Array<{ xp: number; officialMaps: number; officialRating: number | null }>,
) {
  if (!candidates.length) return true;
  if (
    candidates.some(
      (candidate) =>
        candidate.officialMaps >= 5 &&
        candidate.officialRating != null &&
        candidate.officialRating <= OFFICIAL_RATING_CEILING[plan.band],
    )
  ) {
    return true;
  }

  const xpValues = candidates.map((candidate) => candidate.xp).filter((xp) => xp > 0);
  if (!xpValues.length) return true;
  return plan.projectedXp >= Math.round(Math.min(...xpValues) * plan.minimumStarterRatio);
}

function getEuropeanTierWeights(elo: number, score: number) {
  if (elo < 2200) {
    return score >= 0.88
      ? {
          [TierSlug.LEAGUE_OPEN]: 50,
          [TierSlug.LEAGUE_INTERMEDIATE]: 45,
          [TierSlug.LEAGUE_MAIN]: 5,
        }
      : { [TierSlug.LEAGUE_OPEN]: 75, [TierSlug.LEAGUE_INTERMEDIATE]: 25 };
  }
  if (elo < 2400) {
    return score >= 0.65
      ? {
          [TierSlug.LEAGUE_OPEN]: 10,
          [TierSlug.LEAGUE_INTERMEDIATE]: 70,
          [TierSlug.LEAGUE_MAIN]: 20,
        }
      : {
          [TierSlug.LEAGUE_OPEN]: 25,
          [TierSlug.LEAGUE_INTERMEDIATE]: 70,
          [TierSlug.LEAGUE_MAIN]: 5,
        };
  }
  if (elo < 2600) {
    return {
      [TierSlug.LEAGUE_INTERMEDIATE]: 50,
      [TierSlug.LEAGUE_MAIN]: 45,
      [TierSlug.LEAGUE_ADVANCED]: 5,
    };
  }
  return { [TierSlug.LEAGUE_MAIN]: 55, [TierSlug.LEAGUE_ADVANCED]: 40, [TierSlug.LEAGUE_PRO]: 5 };
}

function getAmericasTierWeights(elo: number, score: number) {
  if (elo < 1900) return { [TierSlug.LEAGUE_OPEN]: 100 };
  if (elo < 2200) {
    return score >= 0.65
      ? {
          [TierSlug.LEAGUE_OPEN]: 35,
          [TierSlug.LEAGUE_INTERMEDIATE]: 60,
          [TierSlug.LEAGUE_MAIN]: 5,
        }
      : { [TierSlug.LEAGUE_OPEN]: 65, [TierSlug.LEAGUE_INTERMEDIATE]: 35 };
  }
  if (elo < 2400) {
    return { [TierSlug.LEAGUE_INTERMEDIATE]: 65, [TierSlug.LEAGUE_MAIN]: 35 };
  }
  return { [TierSlug.LEAGUE_MAIN]: 60, [TierSlug.LEAGUE_ADVANCED]: 40 };
}

export function getFaceitRecruitmentTierWeights(
  federation: Constants.FederationSlug,
  elo: number,
  score: number,
): Partial<Record<TierSlug, number>> {
  if (federation === Constants.FederationSlug.ESPORTS_EUROPA) {
    return getEuropeanTierWeights(elo, score);
  }
  if (federation === Constants.FederationSlug.ESPORTS_AMERICAS) {
    return getAmericasTierWeights(elo, score);
  }

  // Asia and Oceania do not run Intermediate/Main in LPJ.
  return elo < 2200 ? { [TierSlug.LEAGUE_OPEN]: 100 } : { [TierSlug.LEAGUE_ADVANCED]: 100 };
}

export function getFaceitRecruitmentPlan(input: {
  federation: Constants.FederationSlug;
  matchCount: number;
  elo: number;
  xp: number;
  kd: number;
  winRatePct: number;
}): FaceitRecruitmentPlan | null {
  const market = MARKETS[input.federation];
  if (!market) return null;

  const performanceScore = getFaceitRecruitmentPerformance(input.kd, input.winRatePct);
  const band = getFaceitRecruitmentBand(performanceScore);
  const eligible = input.matchCount >= market.minimumMatches && input.elo >= market.minimumElo;
  const matchesVisible = Math.max(0, input.matchCount - market.minimumMatches);
  const chance = BAND_CHANCE[band];
  const offerChance = eligible
    ? Math.max(
        1,
        Math.min(
          95,
          Math.round((chance.initial + chance.growth * matchesVisible) * market.chanceMultiplier),
        ),
      )
    : 0;
  const guaranteed = eligible && band !== 'poor' && input.matchCount >= market.offerCeilingMatch;
  const confidence = Math.min(1, Math.max(0, input.matchCount - 3) / 10);
  const projectedXp = Math.round(input.xp + performanceScore * 8 * (0.7 + confidence * 0.3));

  return {
    eligible,
    minimumMatches: market.minimumMatches,
    offerCeilingMatch: market.offerCeilingMatch,
    performanceScore,
    band,
    offerChance,
    guaranteed,
    projectedXp,
    minimumStarterRatio: STARTER_RATIO[band],
    tierWeights: getFaceitRecruitmentTierWeights(input.federation, input.elo, performanceScore),
  };
}
