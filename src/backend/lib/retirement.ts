/**
 * Career-end balancing for NPC players.
 *
 * The returned value is deliberately a probability instead of a hard age cut-off:
 * exceptional starters can outlast the normal career curve, while an inactive
 * veteran can decide that the available market is no longer worth pursuing.
 */
export type NpcRetirementCandidate = {
  age: number | null;
  xp: number | null;
  starter: boolean;
  teamId: number | null;
  transferListed: boolean;
  hasViableNationalContinuation: boolean;
  careerTrophyPoints?: number;
};

function baseRetirementChance(age: number) {
  if (age <= 29) return 0;
  if (age === 30) return 1;
  if (age === 31) return 3;
  if (age === 32) return 7;
  if (age === 33) return 14;
  if (age === 34) return 30;
  if (age === 35) return 48;
  if (age === 36) return 84;
  if (age === 37) return 94;
  return 98;
}

export function getNpcRetirementChance(candidate: NpcRetirementCandidate) {
  const age = candidate.age ?? 24;
  const xp = candidate.xp ?? 0;
  let chance = baseRetirementChance(age);

  // Lack of a meaningful next contract accelerates a veteran's decision.
  if (candidate.teamId == null) chance += 16;
  else if (!candidate.starter) chance += 20;
  if (candidate.transferListed) chance += 8;
  if (!candidate.hasViableNationalContinuation) chance += 12;

  // Veterans who have already completed a trophy-laden career are less willing
  // to restart in a lower tier after losing their place at the top.
  const trophyPoints = candidate.careerTrophyPoints ?? 0;
  if (trophyPoints >= 6) chance += 24;
  else if (trophyPoints >= 4) chance += 16;
  else if (trophyPoints >= 2) chance += 8;

  // Active, elite players are the intentional exceptions to the 36+ default.
  if (candidate.starter) chance -= 22;
  if (xp >= 88) chance -= 30;
  else if (xp >= 78) chance -= 15;

  // Retirement begins at 30 for everybody, even for exceptional players. The
  // one-percent floor keeps that early-career tail genuinely rare.
  return Math.max(age >= 30 ? 1 : 0, Math.min(99, Math.round(chance)));
}
