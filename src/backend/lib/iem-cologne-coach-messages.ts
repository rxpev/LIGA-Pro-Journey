import { TierSlug } from '@liga/shared';
import {
  IEM_COLOGNE_CHAMPION_MESSAGES,
  IEM_COLOGNE_FINAL_LOSS_MESSAGES,
  IEM_COLOGNE_GROUP_ELIMINATION_MESSAGES,
  IEM_COLOGNE_QUARTERFINAL_LOSS_MESSAGES,
  IEM_COLOGNE_QUARTERFINAL_QUALIFIED_MESSAGES,
  IEM_COLOGNE_SEMIFINAL_LOSS_MESSAGES,
  IEM_COLOGNE_START_MESSAGES,
  IEM_COLOGNE_UPPER_FINAL_WIN_MESSAGES,
} from './iem-cologne-coach-message-data';

export type IemCologneGroupEliminationStage =
  | 'lower_round_1'
  | 'lower_semifinal'
  | 'lower_final';

export type IemCologneCoachOutcome =
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

function flatMessages(value: unknown) {
  return value as Partial<Record<CoachTier, string>>;
}

export function getIemCologneCoachMessage(params: {
  teamTierSlug: string | null | undefined;
  outcome: IemCologneCoachOutcome;
  eliminationStage?: IemCologneGroupEliminationStage | null;
}) {
  if (!isCoachTier(params.teamTierSlug)) return null;
  if (params.outcome === 'group_eliminated') {
    if (!params.eliminationStage) return null;
    const messages = IEM_COLOGNE_GROUP_ELIMINATION_MESSAGES as unknown as Partial<
      Record<CoachTier, Partial<Record<IemCologneGroupEliminationStage, string>>>
    >;
    return messages[params.teamTierSlug]?.[params.eliminationStage] ?? null;
  }

  const messages =
    params.outcome === 'start'
      ? IEM_COLOGNE_START_MESSAGES
      : params.outcome === 'upper_final_win'
        ? IEM_COLOGNE_UPPER_FINAL_WIN_MESSAGES
        : params.outcome === 'quarterfinal_qualified'
          ? IEM_COLOGNE_QUARTERFINAL_QUALIFIED_MESSAGES
          : params.outcome === 'quarterfinal_loss'
            ? IEM_COLOGNE_QUARTERFINAL_LOSS_MESSAGES
            : params.outcome === 'semifinal_loss'
              ? IEM_COLOGNE_SEMIFINAL_LOSS_MESSAGES
              : params.outcome === 'final_loss'
                ? IEM_COLOGNE_FINAL_LOSS_MESSAGES
                : IEM_COLOGNE_CHAMPION_MESSAGES;
  return flatMessages(messages)[params.teamTierSlug] ?? null;
}

export function getIemCologneCoachSubject(season: number) {
  return `IEM Cologne — Season ${season}`;
}
