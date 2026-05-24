import { Constants } from '@liga/shared';

const FACEIT_STARTING_ELO = 1200;

type FaceitEloIntegrityResult = {
  valid: boolean;
  expectedElo: number;
  actualElo: number;
};

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
      faceitEloDelta: true,
    },
  });

  const expectedElo = completedFaceitMatches.reduce(
    (elo: number, match: { faceitEloDelta: number | null }) =>
      elo + Number(match.faceitEloDelta || 0),
    FACEIT_STARTING_ELO,
  );
  const actualElo = Number(profile.faceitElo ?? FACEIT_STARTING_ELO);

  return {
    valid: actualElo === expectedElo,
    expectedElo,
    actualElo,
  };
}
