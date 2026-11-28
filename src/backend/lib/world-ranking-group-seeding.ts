import { sortBy } from 'lodash';
import Tournament from '@liga/shared/tournament';

type RankingSeedCompetitor = {
  id: number;
  teamId: number | null;
  team: { elo: number | null } | null;
};

/**
 * Arrange competitors in contiguous group blocks using balanced snake seeding.
 *
 * Tournament assigns each contiguous `groupSize` block to one group, so the
 * returned array must already contain the final group composition. For example,
 * 32 competitors in groups of four become 1/16/17/32, 2/15/18/31, and so on.
 */
export function seedGroupsByWorldRanking<T extends RankingSeedCompetitor>(
  competitors: T[],
  groupSize: number,
  groupSwiss: boolean,
): T[] {
  const rankedCompetitors = sortBy(competitors, [
    (competitor) => -(competitor.team?.elo ?? 0),
    (competitor) => competitor.teamId,
    (competitor) => competitor.id,
  ]);
  const groupCount = Math.max(1, Math.ceil(rankedCompetitors.length / groupSize));
  const groups: T[][] = Array.from({ length: groupCount }, (): T[] => []);

  rankedCompetitors.forEach((competitor, index) => {
    const row = Math.floor(index / groupCount);
    const column = index % groupCount;
    const groupIndex = row % 2 === 0 ? column : groupCount - 1 - column;
    groups[groupIndex].push(competitor);
  });

  const tournamentOptions = groupSwiss
    ? {
        groupSize: Math.min(groupSize, rankedCompetitors.length),
        groupSwiss: true as const,
        maxLosses: 2,
        maxRounds: 3,
        maxWins: 2,
      }
    : {
        groupSize: Math.min(groupSize, rankedCompetitors.length),
        meetTwice: false,
      };
  const layout = new Tournament(rankedCompetitors.length, tournamentOptions);
  const placeholderIds = rankedCompetitors.map((_, index) => index + 1);
  layout.addCompetitors(placeholderIds);
  layout.start();

  return placeholderIds.map((id) => {
    const groupIndex = layout.getGroupByCompetitorId(id) - 1;
    return groups[groupIndex].shift()!;
  });
}
