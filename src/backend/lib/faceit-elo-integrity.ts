import { Constants } from '@liga/shared';

const FACEIT_STARTING_ELO = 1200;
const VALID_FACEIT_ELO_DELTAS = new Set([-40, -35, -30, -25, -20, 10, 15, 20, 25, 30]);

type FaceitEloIntegrityResult = {
  valid: boolean;
  expectedElo: number;
  actualElo: number;
  invalidDeltaMatchIds: number[];
};

export function isValidFaceitEloDelta(delta: number) {
  return Number.isInteger(delta) && VALID_FACEIT_ELO_DELTAS.has(delta);
}

export async function verifyFaceitEloIntegrity(
  prisma: any,
  profile: { id: number; faceitElo?: number | null },
): Promise<FaceitEloIntegrityResult> {
  const completedFaceitMatches = await prisma.match.findMany({
    where: {
      matchType: 'FACEIT_PUG',
      status: Constants.MatchStatus.COMPLETED,
      faceitEloDelta: { not: null },
      OR: [{ profileId: profile.id }, { profileId: null }],
    },
    select: {
      id: true,
      faceitEloDelta: true,
    },
  });

  const invalidDeltaMatchIds = completedFaceitMatches
    .filter((match: { faceitEloDelta: number | null }) =>
      !isValidFaceitEloDelta(Number(match.faceitEloDelta)),
    )
    .map((match: { id: number }) => match.id);

  const expectedElo = completedFaceitMatches.reduce(
    (elo: number, match: { faceitEloDelta: number | null }) =>
      elo + Number(match.faceitEloDelta || 0),
    FACEIT_STARTING_ELO,
  );
  const actualElo = Number(profile.faceitElo ?? FACEIT_STARTING_ELO);

  return {
    valid: invalidDeltaMatchIds.length === 0 && actualElo === expectedElo,
    expectedElo,
    actualElo,
    invalidDeltaMatchIds,
  };
}
