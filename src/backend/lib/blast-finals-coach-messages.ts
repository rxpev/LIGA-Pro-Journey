import {
  BLAST_FINALS_CHAMPION_MESSAGES,
  BLAST_FINALS_ELIMINATION_MESSAGES,
  BLAST_FINALS_START_MESSAGES,
} from './blast-finals-coach-message-data';

export type BlastFinalsEliminationStage =
  | 'lower_round_1'
  | 'lower_round_2'
  | 'lower_semifinal'
  | 'lower_final'
  | 'grand_final';

export type BlastFinalsCoachOutcome = 'start' | 'eliminated' | 'champion';

function validRank(rank: number | null | undefined): rank is 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 {
  return Number.isInteger(rank) && rank != null && rank >= 1 && rank <= 8;
}

export function getBlastFinalsCoachMessage(params: {
  openingWorldRank: number | null | undefined;
  outcome: BlastFinalsCoachOutcome;
  eliminationStage?: BlastFinalsEliminationStage | null;
  city?: string | null;
}) {
  if (!validRank(params.openingWorldRank)) return null;

  let message: string | undefined;
  if (params.outcome === 'start') {
    message = BLAST_FINALS_START_MESSAGES[params.openingWorldRank];
  } else if (params.outcome === 'champion') {
    message = BLAST_FINALS_CHAMPION_MESSAGES[params.openingWorldRank];
  } else if (params.eliminationStage) {
    message = BLAST_FINALS_ELIMINATION_MESSAGES[params.openingWorldRank][params.eliminationStage];
  }
  return message?.split('CITY').join(params.city || 'the BLAST Finals host city') ?? null;
}

export function getBlastFinalsOpeningRankFromConversation(params: {
  dialogueContents: readonly string[];
  city?: string | null;
}) {
  for (let rank = 1; rank <= 8; rank += 1) {
    const startMessage = getBlastFinalsCoachMessage({
      openingWorldRank: rank,
      outcome: 'start',
      city: params.city,
    });
    if (startMessage && params.dialogueContents.includes(startMessage)) return rank;
  }
  return null;
}

export function getBlastFinalsCoachSubject(season: number) {
  return `BLAST Finals — Season ${season}`;
}
