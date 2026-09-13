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
      OR: [{ profileId: profile.id }, { profileId: null }],
    },
    select: {
      id: true,
      faceitEloDelta: true,
      faceitRating: true,
    },
    orderBy: { id: 'asc' },
  });

  const placementIndex = completedFaceitMatches.findIndex(
    (match: { faceitRating: number | null }) => match.faceitRating !== null,
  );
  const hasPlacements = placementIndex === 2 && completedFaceitMatches
    .slice(0, 3)
    .every((match: { faceitEloDelta: number | null }) => match.faceitEloDelta === null);
  const legacyCareer = !hasPlacements && completedFaceitMatches.every(
    (match: { faceitEloDelta: number | null }) => match.faceitEloDelta !== null,
  ) && Number(profile.faceitElo) !== 0;
  const inPlacements = !hasPlacements && !legacyCareer && completedFaceitMatches.length < 3 &&
    completedFaceitMatches.every((match: { faceitEloDelta: number | null }) => match.faceitEloDelta === null);
  const ratedMatches = hasPlacements ? completedFaceitMatches.slice(3)
    : inPlacements ? [] : completedFaceitMatches;

  const invalidDeltaMatchIds = ratedMatches
    .filter((match: { faceitEloDelta: number | null }) =>
      match.faceitEloDelta === null || !isValidFaceitEloDelta(Number(match.faceitEloDelta)),
    )
    .map((match: { id: number }) => match.id);

  const baseline = hasPlacements
    ? Math.round(Number(completedFaceitMatches[2].faceitRating))
    : legacyCareer ? FACEIT_STARTING_ELO : 0;
  const expectedElo = ratedMatches.reduce(
    (elo: number, match: { faceitEloDelta: number | null }) =>
      elo + Number(match.faceitEloDelta || 0),
    baseline,
  );
  const actualElo = Number(profile.faceitElo ?? 0);

  return {
    valid: invalidDeltaMatchIds.length === 0 && actualElo === expectedElo &&
      (hasPlacements || legacyCareer || (inPlacements && actualElo === 0)),
    expectedElo,
    actualElo,
    invalidDeltaMatchIds,
  };
}
