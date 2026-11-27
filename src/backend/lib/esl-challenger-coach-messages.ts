import { FederationSlug, TierSlug } from '@liga/shared';
import { ESL_CHALLENGER_COACH_MESSAGES } from './esl-challenger-coach-message-data';

export type EslChallengerRegion = 'Europe' | 'Americas' | 'Asia' | 'Oceania';
export type EslChallengerCoachOutcome =
  | 'start'
  | 'qualified'
  | 'group_eliminated'
  | 'semifinal_loss'
  | 'final_loss'
  | 'champion';

export function getEslChallengerRegion(
  federationSlug: string | null | undefined,
): EslChallengerRegion | null {
  if (federationSlug === FederationSlug.ESPORTS_EUROPA) return 'Europe';
  if (federationSlug === FederationSlug.ESPORTS_AMERICAS) return 'Americas';
  if (federationSlug === FederationSlug.ESPORTS_ASIA) return 'Asia';
  if (federationSlug === FederationSlug.ESPORTS_OCE) return 'Oceania';
  return null;
}

export function getEslChallengerCoachMessage(params: {
  region: EslChallengerRegion;
  teamTierSlug: string | null | undefined;
  outcome: EslChallengerCoachOutcome;
  city?: string | null;
}) {
  const requiredTier =
    params.region === 'Europe' ? TierSlug.LEAGUE_MAIN : TierSlug.LEAGUE_ADVANCED;
  if (params.teamTierSlug !== requiredTier) return null;
  return ESL_CHALLENGER_COACH_MESSAGES[params.outcome][params.region]
    .split('CITY')
    .join(params.city || 'the ESL Challenger host city');
}

export function getEslChallengerGroupOutcome(params: {
  wins?: number | null;
  losses?: number | null;
  lostThisBatch: boolean;
}): Extract<EslChallengerCoachOutcome, 'qualified' | 'group_eliminated'> | null {
  if ((params.wins ?? 0) >= 2) return 'qualified';
  if (params.lostThisBatch && (params.losses ?? 0) >= 2) return 'group_eliminated';
  return null;
}

export function getEslChallengerCoachSubject(season: number) {
  return `ESL Challenger — Season ${season}`;
}
