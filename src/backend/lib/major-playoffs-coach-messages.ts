import { TierSlug } from '@liga/shared';
import type { MajorChallengersRegion } from './major-challengers-coach-messages';
import {
  MAJOR_PLAYOFF_FINAL_LOSS_MESSAGES,
  MAJOR_PLAYOFF_QUARTERFINAL_LOSS_MESSAGES,
  MAJOR_PLAYOFF_SEMIFINAL_LOSS_MESSAGES,
  MAJOR_PLAYOFF_SEMIFINAL_WIN_MESSAGES,
  MAJOR_PLAYOFF_START_MESSAGES,
} from './major-playoffs-coach-message-data';

export type MajorPlayoffsCoachOutcome =
  | 'start'
  | 'quarterfinal_loss'
  | 'semifinal_loss'
  | 'semifinal_win'
  | 'final_loss';

type CoachTier =
  | TierSlug.LEAGUE_OPEN
  | TierSlug.LEAGUE_INTERMEDIATE
  | TierSlug.LEAGUE_MAIN
  | TierSlug.LEAGUE_ADVANCED
  | TierSlug.LEAGUE_PRO;

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

type FlatMessages = Partial<
  Record<MajorChallengersRegion, Partial<Record<CoachTier, string>>>
>;

function flatMessages(value: unknown) {
  return value as FlatMessages;
}

export function getMajorPlayoffsCoachMessage(params: {
  region: MajorChallengersRegion;
  teamTierSlug: string | null | undefined;
  outcome: MajorPlayoffsCoachOutcome;
  losingScore?: number | null;
  city?: string | null;
}) {
  if (!isCoachTier(params.teamTierSlug)) return null;

  let message: string | undefined;
  if (params.outcome === 'final_loss') {
    const messages = MAJOR_PLAYOFF_FINAL_LOSS_MESSAGES as unknown as Partial<
      Record<MajorChallengersRegion, Partial<Record<CoachTier, Partial<Record<number, string>>>>>
    >;
    message =
      messages[params.region]?.[params.teamTierSlug]?.[
        Math.min(Math.max(params.losingScore ?? 0, 0), 2)
      ];
  } else {
    const messages =
      params.outcome === 'start'
        ? MAJOR_PLAYOFF_START_MESSAGES
        : params.outcome === 'quarterfinal_loss'
          ? MAJOR_PLAYOFF_QUARTERFINAL_LOSS_MESSAGES
          : params.outcome === 'semifinal_loss'
            ? MAJOR_PLAYOFF_SEMIFINAL_LOSS_MESSAGES
            : MAJOR_PLAYOFF_SEMIFINAL_WIN_MESSAGES;
    message = flatMessages(messages)[params.region]?.[params.teamTierSlug];
  }

  return message?.split('CITY').join(params.city || 'the Major host city') ?? null;
}

export function getMajorPlayoffsCoachSubject(season: number) {
  return `Major Playoffs — Season ${season}`;
}
