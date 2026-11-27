import { TierSlug } from '@liga/shared';
import type { MajorChallengersRegion } from './major-challengers-coach-messages';
import {
  MAJOR_LEGENDS_DIRECT_START_MESSAGES,
  MAJOR_LEGENDS_ELIMINATION_MESSAGES,
  MAJOR_LEGENDS_PLAYOFF_MESSAGES,
  MAJOR_LEGENDS_PROMOTED_START_MESSAGES,
} from './major-legends-coach-message-data';

export type MajorLegendsEntryPath = 'promoted' | 'direct';
export type MajorLegendsCoachOutcome = 'start' | 'qualified' | 'eliminated';

type CoachTier =
  | TierSlug.LEAGUE_OPEN
  | TierSlug.LEAGUE_INTERMEDIATE
  | TierSlug.LEAGUE_MAIN
  | TierSlug.LEAGUE_ADVANCED
  | TierSlug.LEAGUE_PRO;

type Standing = { wins?: number | null; losses?: number | null };

const ALL_COACH_TIERS: readonly CoachTier[] = [
  TierSlug.LEAGUE_OPEN,
  TierSlug.LEAGUE_INTERMEDIATE,
  TierSlug.LEAGUE_MAIN,
  TierSlug.LEAGUE_ADVANCED,
  TierSlug.LEAGUE_PRO,
];

function isCoachTier(value: string | null | undefined): value is CoachTier {
  return ALL_COACH_TIERS.includes(value as CoachTier);
}

function messageMap(
  value: unknown,
): Partial<Record<MajorChallengersRegion, Partial<Record<CoachTier, string>>>> {
  return value as Partial<Record<MajorChallengersRegion, Partial<Record<CoachTier, string>>>>;
}

export function getMajorLegendsStartMessage(params: {
  region: MajorChallengersRegion;
  teamTierSlug: string | null | undefined;
  entryPath: MajorLegendsEntryPath;
  city?: string | null;
}) {
  if (!isCoachTier(params.teamTierSlug)) return null;
  const messages = messageMap(
    params.entryPath === 'direct'
      ? MAJOR_LEGENDS_DIRECT_START_MESSAGES
      : MAJOR_LEGENDS_PROMOTED_START_MESSAGES,
  );
  return (
    messages[params.region]?.[params.teamTierSlug]
      ?.split('CITY')
      .join(params.city || 'the Major host city') ?? null
  );
}

export function getMajorLegendsCoachOutcome(params: {
  standing: Standing | null | undefined;
  lostThisBatch: boolean;
}): Exclude<MajorLegendsCoachOutcome, 'start'> | null {
  if (!params.standing) return null;
  if ((params.standing.wins ?? 0) >= 3) return 'qualified';
  if (params.lostThisBatch && (params.standing.losses ?? 0) >= 3) return 'eliminated';
  return null;
}

export function getMajorLegendsOutcomeMessage(params: {
  region: MajorChallengersRegion;
  teamTierSlug: string | null | undefined;
  outcome: Exclude<MajorLegendsCoachOutcome, 'start'>;
  wins?: number | null;
}) {
  if (!isCoachTier(params.teamTierSlug)) return null;
  if (params.outcome === 'qualified') {
    return messageMap(MAJOR_LEGENDS_PLAYOFF_MESSAGES)[params.region]?.[params.teamTierSlug] ?? null;
  }
  const messages = MAJOR_LEGENDS_ELIMINATION_MESSAGES as unknown as Partial<
    Record<MajorChallengersRegion, Partial<Record<CoachTier, Partial<Record<number, string>>>>>
  >;
  return (
    messages[params.region]?.[params.teamTierSlug]?.[
      Math.min(Math.max(params.wins ?? 0, 0), 2)
    ] ?? null
  );
}

export function getMajorLegendsCoachSubject(season: number) {
  return `Major Legends Stage — Season ${season}`;
}
