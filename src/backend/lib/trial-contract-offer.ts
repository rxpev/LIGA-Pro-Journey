import { TierSlug, UserRole } from '@liga/shared';

export type TrialSuccessResponse = 1 | 2 | 3;

export type TrialContractTerms = {
  contractMonths: number;
  postBenchTerminationClause: boolean;
  postBenchTerminationMonths: number | null;
  rosterStabilityClause: boolean;
};

function isIgl(role: string | null | undefined) {
  return role?.toUpperCase() === UserRole.IGL;
}

export function getTrialContractChatMessage(
  response: TrialSuccessResponse,
  userName: string,
  coachName: string,
  teamName: string,
) {
  if (response === 2) {
    return `Hello, **${userName}**.\n\nFollowing your discussions with **Head Coach ${coachName}**, we’re pleased to formally offer you a contract with **${teamName}**.\n\nThe full terms of the offer are attached below.`;
  }
  if (response === 3) {
    return `Hello, **${userName}**.\n\nFollowing the successful conclusion of your trial and your discussions with **Head Coach ${coachName}**, the **${teamName} Management Board** is pleased to formally offer you a place on the team.\n\nThe proposed contract and its full terms are attached below.`;
  }
  return `Hello, **${userName}**.\n\nAs previously discussed with **Head Coach ${coachName}**, we’re pleased to formally present you with a contract offer to join **${teamName}**.\n\nYou’ll find the full terms and details of the proposed agreement attached below.`;
}

export function getTrialContractOpening(
  response: TrialSuccessResponse,
  role: string | null | undefined,
  coachName: string,
  teamName: string,
) {
  const igl = isIgl(role);
  if (response === 2) {
    return igl
      ? `Following a strong recommendation from our coaching staff and Head Coach ${coachName}, the management board of ${teamName} is pleased to offer you a place on the team after an impressive trial in which your leadership and impact comfortably exceeded our expectations. Below, you will find the proposed contract terms and details of the offer.`
      : `Following a strong recommendation from our coaching staff and Head Coach ${coachName}, the management board of ${teamName} is pleased to offer you a place on the team after an impressive trial in which you comfortably exceeded the performance requirements. Below, you will find the proposed contract terms and details of the offer.`;
  }
  if (response === 3) {
    return igl
      ? `Following the enthusiastic recommendation of our coaching staff and Head Coach ${coachName}, the management board of ${teamName} is pleased to offer you a place on the team after an outstanding trial in which your leadership and impact significantly surpassed our expectations. The details of the proposed agreement and the terms of your contract are outlined below.`
      : `Following the enthusiastic recommendation of our coaching staff and Head Coach ${coachName}, the management board of ${teamName} is pleased to offer you a place on the team after an outstanding trial in which you significantly surpassed the performance requirements. The details of the proposed agreement and the terms of your contract are outlined below.`;
  }
  return igl
    ? `Following the recommendation of our coaching staff and Head Coach ${coachName}, the management board of ${teamName} is pleased to offer you a place on the team after successfully meeting the leadership and performance expectations of your trial. The offer is made under the following terms, with the full contract details outlined below.`
    : `Following the recommendation of our coaching staff and Head Coach ${coachName}, the management board of ${teamName} is pleased to offer you a place on the team after successfully meeting the performance requirements of your trial. The offer is made under the following terms, with the full contract details outlined below.`;
}

export function getTrialContractDecisionMessage(
  response: TrialSuccessResponse,
  role: string | null | undefined,
  accepted: boolean,
) {
  const igl = isIgl(role);
  if (accepted) {
    if (response === 2) {
      return igl
        ? `Really happy we got the contract over the line. You had a strong trial and showed me that your leadership can be a valuable part of this team. Now that everything is official, I’m looking forward to working with you properly and continuing to build on the structure and ideas you introduced. Welcome to the team.`
        : `Really happy we got the contract over the line. You had a strong trial and showed me that you can be a valuable part of this team. Now that everything is official, I’m looking forward to working with you properly and continuing to build on what you showed. Welcome to the team.`;
    }
    if (response === 3) {
      return igl
        ? `Very happy to have this finalized. You made a huge impression during the trial and showed exactly why I wanted your leadership in this lineup. I’m excited to see what you can do now that you’re officially part of the team and we can start building around your vision properly. Welcome to the team.`
        : `Very happy to have this finalized. You made a huge impression during the trial and showed exactly why I wanted you in this lineup. I’m excited to see what you can do now that you’re officially part of the team and we can start building around you properly. Welcome to the team.`;
    }
    return igl
      ? `Glad we got everything sorted and made it official. You showed enough leadership during the trial to earn your place here, and now the focus is on building from that. I’m looking forward to working with you and seeing how far you can take this team. Welcome to the team.`
      : `Glad we got everything sorted and made it official. You showed enough during the trial to earn your place here, and now the focus is on building from that. I’m looking forward to working with you and seeing how far you can push your level. Welcome to the team.`;
  }

  if (response === 2) {
    return igl
      ? `Management let me know that you won’t be accepting the contract offer. That’s unfortunate, because you had a strong trial and I was looking forward to having your leadership as part of the team. I respect your decision, though, and I appreciate the effort and ideas you brought during your time with us. Best of luck going forward.`
      : `Management let me know that you won’t be accepting the contract offer. That’s unfortunate, because you had a strong trial and I was looking forward to having you as part of the team. I respect your decision, though, and I appreciate the effort you put in during your time with us. Best of luck going forward.`;
  }
  if (response === 3) {
    return igl
      ? `I’ve just heard from management that you decided not to accept the contract offer. That’s a real shame, because you had an excellent trial and I was very excited about bringing your leadership into the lineup permanently. I respect the decision, and I appreciate the vision and impact you showed during the trial. I wish you the best with whatever comes next.`
      : `I’ve just heard from management that you decided not to accept the contract offer. That’s a real shame, because you had an excellent trial and I was very excited about bringing you into the lineup permanently. I respect the decision, and I appreciate everything you showed during the trial. I wish you the best with whatever comes next.`;
  }
  return igl
    ? `I heard from management that you’ve decided not to accept the contract offer. It’s unfortunate we couldn’t get everything agreed, but I respect your decision. You earned the opportunity through your leadership during the trial, and I appreciate the time and effort you put in with us. Best of luck with whatever comes next.`
    : `I heard from management that you’ve decided not to accept the contract offer. It’s unfortunate we couldn’t get everything agreed, but I respect your decision. You earned the opportunity through the trial, and I appreciate the time and effort you put in with us. Best of luck with whatever comes next.`;
}

type MonthRange = { min: number; max: number };

const CONTRACT_MONTHS: Record<TrialSuccessResponse, Partial<Record<TierSlug, MonthRange>>> = {
  1: {
    [TierSlug.LEAGUE_OPEN]: { min: 3, max: 6 },
    [TierSlug.LEAGUE_INTERMEDIATE]: { min: 3, max: 6 },
    [TierSlug.LEAGUE_MAIN]: { min: 3, max: 9 },
    [TierSlug.LEAGUE_ADVANCED]: { min: 3, max: 9 },
  },
  2: {
    [TierSlug.LEAGUE_OPEN]: { min: 3, max: 9 },
    [TierSlug.LEAGUE_INTERMEDIATE]: { min: 6, max: 9 },
    [TierSlug.LEAGUE_MAIN]: { min: 6, max: 12 },
    [TierSlug.LEAGUE_ADVANCED]: { min: 6, max: 12 },
  },
  3: {
    [TierSlug.LEAGUE_OPEN]: { min: 6, max: 12 },
    [TierSlug.LEAGUE_INTERMEDIATE]: { min: 9, max: 12 },
    [TierSlug.LEAGUE_MAIN]: { min: 9, max: 12 },
    [TierSlug.LEAGUE_ADVANCED]: { min: 12, max: 12 },
  },
};

const BENCH_MONTHS: Record<TrialSuccessResponse, number[]> = {
  1: [0.5, 1, 2],
  2: [1, 2, 3],
  3: [2, 3, 4],
};

const POST_BENCH_CHANCE: Record<TrialSuccessResponse, number> = { 1: 75, 2: 50, 3: 25 };
const ROSTER_STABILITY_CHANCE: Record<TrialSuccessResponse, number> = { 1: 15, 2: 35, 3: 50 };

function pick<T>(values: T[], random: () => number): T {
  return values[Math.min(values.length - 1, Math.floor(random() * values.length))];
}

function randomInteger(range: MonthRange, random: () => number) {
  return (
    range.min + Math.min(range.max - range.min, Math.floor(random() * (range.max - range.min + 1)))
  );
}

export function rollTrialContractTerms(
  tier: TierSlug | null,
  response: TrialSuccessResponse,
  role: string | null | undefined,
  random: () => number = Math.random,
): TrialContractTerms {
  const duration = (tier && CONTRACT_MONTHS[response][tier]) || { min: 12, max: 12 };
  const hasPostBenchClause = random() * 100 < POST_BENCH_CHANCE[response];
  const rosterChance =
    role?.toUpperCase() === UserRole.IGL && response > 1
      ? response === 2
        ? 15
        : 25
      : ROSTER_STABILITY_CHANCE[response];

  return {
    contractMonths: randomInteger(duration, random),
    postBenchTerminationClause: hasPostBenchClause,
    postBenchTerminationMonths: hasPostBenchClause ? pick(BENCH_MONTHS[response], random) : null,
    rosterStabilityClause: random() * 100 < rosterChance,
  };
}
