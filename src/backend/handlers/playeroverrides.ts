import { PlayerRole, PersonalityTemplate, BotDifficulty } from '@liga/shared';

export const playerOverrides: Record<
  string,
  {
    role: PlayerRole;
    personality: PersonalityTemplate;
    difficulty: BotDifficulty;
  }
> = {
  ZywOo: {
    role: PlayerRole.SNIPER,
    personality: PersonalityTemplate.ASNIPER,
    difficulty: BotDifficulty.STAR,
  },
  woxic: {
    role: PlayerRole.SNIPER,
    personality: PersonalityTemplate.ASNIPER,
    difficulty: BotDifficulty.MEDIUM,
  },
  NiKo: {
    role: PlayerRole.RIFLER,
    personality: PersonalityTemplate.ENTRY,
    difficulty: BotDifficulty.FRAGGER,
  },
  ropz: {
    role: PlayerRole.RIFLER,
    personality: PersonalityTemplate.ALURK,
    difficulty: BotDifficulty.SOLID,
  },
};
