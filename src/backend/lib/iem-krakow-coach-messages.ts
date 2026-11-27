import { TierSlug } from '@liga/shared';
import {
  IEM_KRAKOW_CHAMPION_MESSAGES,
  IEM_KRAKOW_FINAL_LOSS_MESSAGES,
  IEM_KRAKOW_GROUP_ELIMINATION_MESSAGES,
  IEM_KRAKOW_QUARTERFINAL_LOSS_MESSAGES,
  IEM_KRAKOW_QUARTERFINAL_QUALIFIED_MESSAGES,
  IEM_KRAKOW_SEMIFINAL_LOSS_MESSAGES,
  IEM_KRAKOW_START_MESSAGES,
  IEM_KRAKOW_UPPER_FINAL_WIN_MESSAGES,
} from './iem-krakow-coach-message-data';

export type IemKrakowGroupEliminationStage =
  | 'lower_round_1'
  | 'lower_semifinal'
  | 'lower_final';
export type IemKrakowCoachOutcome =
  | 'start'
  | 'group_eliminated'
  | 'upper_final_win'
  | 'quarterfinal_qualified'
  | 'quarterfinal_loss'
  | 'semifinal_loss'
  | 'final_loss'
  | 'champion';

type CoachTier =
  | TierSlug.LEAGUE_OPEN
  | TierSlug.LEAGUE_INTERMEDIATE
  | TierSlug.LEAGUE_MAIN
  | TierSlug.LEAGUE_ADVANCED
  | TierSlug.LEAGUE_PRO;
const TIERS: readonly CoachTier[] = [
  TierSlug.LEAGUE_OPEN,
  TierSlug.LEAGUE_INTERMEDIATE,
  TierSlug.LEAGUE_MAIN,
  TierSlug.LEAGUE_ADVANCED,
  TierSlug.LEAGUE_PRO,
];

function isTier(value: string | null | undefined): value is CoachTier {
  return TIERS.includes(value as CoachTier);
}

function flat(value: unknown) {
  return value as Partial<Record<CoachTier, string>>;
}

export function getIemKrakowCoachMessage(params: {
  teamTierSlug: string | null | undefined;
  outcome: IemKrakowCoachOutcome;
  eliminationStage?: IemKrakowGroupEliminationStage | null;
}) {
  if (!isTier(params.teamTierSlug)) return null;
  if (params.outcome === 'group_eliminated') {
    if (!params.eliminationStage) return null;
    const messages = IEM_KRAKOW_GROUP_ELIMINATION_MESSAGES as unknown as Partial<
      Record<CoachTier, Partial<Record<IemKrakowGroupEliminationStage, string>>>
    >;
    return messages[params.teamTierSlug]?.[params.eliminationStage] ?? null;
  }
  const messages =
    params.outcome === 'start'
      ? IEM_KRAKOW_START_MESSAGES
      : params.outcome === 'upper_final_win'
        ? IEM_KRAKOW_UPPER_FINAL_WIN_MESSAGES
        : params.outcome === 'quarterfinal_qualified'
          ? IEM_KRAKOW_QUARTERFINAL_QUALIFIED_MESSAGES
          : params.outcome === 'quarterfinal_loss'
            ? IEM_KRAKOW_QUARTERFINAL_LOSS_MESSAGES
            : params.outcome === 'semifinal_loss'
              ? IEM_KRAKOW_SEMIFINAL_LOSS_MESSAGES
              : params.outcome === 'final_loss'
                ? IEM_KRAKOW_FINAL_LOSS_MESSAGES
                : IEM_KRAKOW_CHAMPION_MESSAGES;
  return flat(messages)[params.teamTierSlug] ?? null;
}

export function getIemKrakowCoachSubject(season: number) {
  return `IEM Krakow — Season ${season}`;
}
