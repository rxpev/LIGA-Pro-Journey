/**
 * Competition hosting location assignment.
 *
 * @module
 */
import { PrismaClient } from '@prisma/client';
import { sample } from 'lodash';
import { Constants, Util } from '@liga/shared';

type LocationCompetition = {
  id: number;
  season: number | null;
  location: string | null;
  organizer: string | null;
  federation: {
    slug: string;
  };
  tier: {
    slug: string;
    lan: boolean | null;
  };
};

const TIER_LOCATION_GROUPS: Partial<Record<Constants.TierSlug, string>> = {
  [Constants.TierSlug.MAJOR_EUROPE_RMR_A]: 'major:rmr:europe',
  [Constants.TierSlug.MAJOR_EUROPE_RMR_B]: 'major:rmr:europe',
  [Constants.TierSlug.MAJOR_ASIA_RMR]: 'major:rmr:asia',
  [Constants.TierSlug.MAJOR_AMERICAS_RMR]: 'major:rmr:americas',
  [Constants.TierSlug.BLAST_FINALS]: 'blast:finals',
  [Constants.TierSlug.CCT_GLOBAL_FINALS]: 'cct:global-finals',
  [Constants.TierSlug.ESL_CHALLENGER]: 'esl-challenger',
  [Constants.TierSlug.ESL_CHALLENGER_PLAYOFFS]: 'esl-challenger',
  [Constants.TierSlug.MAJOR_CHALLENGERS_STAGE]: 'major',
  [Constants.TierSlug.MAJOR_LEGENDS_STAGE]: 'major',
  [Constants.TierSlug.MAJOR_CHAMPIONS_STAGE]: 'major',
  [Constants.TierSlug.LEAGUE_PRO]: 'esl-pro-league',
  [Constants.TierSlug.LEAGUE_PRO_PLAYOFFS]: 'esl-pro-league',
  [Constants.TierSlug.IEM_COLOGNE_GROUP_A]: 'iem-cologne',
  [Constants.TierSlug.IEM_COLOGNE_GROUP_B]: 'iem-cologne',
  [Constants.TierSlug.IEM_COLOGNE_PLAYOFFS]: 'iem-cologne',
  [Constants.TierSlug.IEM_KRAKOW_GROUP_A]: 'iem-krakow',
  [Constants.TierSlug.IEM_KRAKOW_GROUP_B]: 'iem-krakow',
  [Constants.TierSlug.IEM_KRAKOW_PLAYOFFS]: 'iem-krakow',
};

function getLocationGroup(competition: LocationCompetition) {
  const tierSlug = competition.tier.slug as Constants.TierSlug;
  return TIER_LOCATION_GROUPS[tierSlug] ?? `${tierSlug}:${competition.federation.slug}`;
}

function getLocationPool(competition: LocationCompetition) {
  return Constants.CompetitionHostingLocations[competition.tier.slug as Constants.TierSlug] ?? [];
}

function pickLocation(
  pool: string[],
  previousLocation?: string | null,
  excludedLocations = new Set<string>(),
) {
  const available = pool.filter(
    (location) => location !== previousLocation && !excludedLocations.has(location),
  );

  if (available.length) {
    return sample(available) ?? available[0];
  }

  const fallback = pool.filter((location) => location !== previousLocation);
  if (fallback.length) {
    return sample(fallback) ?? fallback[0];
  }

  if (pool.length <= 1) {
    return pool[0] ?? null;
  }

  return sample(pool) ?? pool[0];
}

function pickOrganizer(remainingOrganizers: string[], usedLocationsInCycle: Set<string>) {
  if (!remainingOrganizers.length) {
    remainingOrganizers.push(...Constants.MajorHostingOrganizers.map((organizer) => organizer.name));
    usedLocationsInCycle.clear();
  }

  const organizer = sample(remainingOrganizers) ?? remainingOrganizers[0];
  remainingOrganizers.splice(remainingOrganizers.indexOf(organizer), 1);

  return organizer;
}

function getMajorEventGroups(competitions: LocationCompetition[]) {
  const groups: LocationCompetition[][] = [];
  let current: LocationCompetition[] = [];

  for (const competition of competitions) {
    const tierSlug = competition.tier.slug as Constants.TierSlug;

    if (!Util.isMajorStageTier(tierSlug)) {
      continue;
    }

    if (tierSlug === Constants.TierSlug.MAJOR_CHALLENGERS_STAGE && current.length) {
      groups.push(current);
      current = [];
    }

    current.push(competition);

    if (tierSlug === Constants.TierSlug.MAJOR_CHAMPIONS_STAGE) {
      groups.push(current);
      current = [];
    }
  }

  if (current.length) {
    groups.push(current);
  }

  return groups;
}

function getMajorOrganizer(name?: string | null) {
  return Constants.MajorHostingOrganizers.find((organizer) => organizer.name === name);
}

function getMajorEventAssignment(
  group: LocationCompetition[],
  remainingOrganizers: string[],
  previousLocationByOrganizer: Map<string, string | null>,
  usedLocationsInCycle: Set<string>,
) {
  if (!remainingOrganizers.length) {
    remainingOrganizers.push(...Constants.MajorHostingOrganizers.map((organizer) => organizer.name));
    usedLocationsInCycle.clear();
  }

  const existingOrganizerName =
    group.every((competition) => competition.organizer === group[0].organizer)
      ? group[0].organizer
      : null;
  const existingLocation =
    group.every((competition) => competition.location === group[0].location)
      ? group[0].location
      : null;
  const existingOrganizer = getMajorOrganizer(existingOrganizerName);
  const existingLocationPool =
    existingOrganizer?.locations.map(Util.formatCompetitionHostingLocation) ?? [];

  if (
    existingOrganizerName &&
    existingOrganizer &&
    existingLocation &&
    existingLocationPool.includes(existingLocation) &&
    remainingOrganizers.includes(existingOrganizerName) &&
    existingLocation !== previousLocationByOrganizer.get(existingOrganizerName) &&
    !usedLocationsInCycle.has(existingLocation)
  ) {
    remainingOrganizers.splice(remainingOrganizers.indexOf(existingOrganizerName), 1);
    previousLocationByOrganizer.set(existingOrganizerName, existingLocation);
    usedLocationsInCycle.add(existingLocation);
    return {
      organizer: existingOrganizerName,
      location: existingLocation,
    };
  }

  const organizerName = pickOrganizer(remainingOrganizers, usedLocationsInCycle);
  const organizer = getMajorOrganizer(organizerName);
  const pool = organizer?.locations.map(Util.formatCompetitionHostingLocation) ?? [];
  const location = pickLocation(
    pool,
    previousLocationByOrganizer.get(organizerName),
    usedLocationsInCycle,
  );

  if (location) {
    previousLocationByOrganizer.set(organizerName, location);
    usedLocationsInCycle.add(location);
  }

  return {
    organizer: organizerName,
    location,
  };
}

/**
 * Backfills missing competition hosting locations and repairs immediate repeats.
 *
 * @param prisma The Prisma client.
 * @function
 */
export async function backfillCompetitionLocations(prisma: PrismaClient) {
  const competitions = await prisma.competition.findMany({
    where: {
      OR: [
        {
          tier: {
            slug: {
              in: Object.keys(Constants.CompetitionHostingLocations),
            },
          },
        },
        {
          tier: {
            slug: {
              in: [
                Constants.TierSlug.MAJOR_CHALLENGERS_STAGE,
                Constants.TierSlug.MAJOR_LEGENDS_STAGE,
                Constants.TierSlug.MAJOR_CHAMPIONS_STAGE,
              ],
            },
          },
        },
      ],
    },
    include: {
      federation: true,
      tier: true,
    },
    orderBy: [{ season: 'asc' }, { id: 'asc' }],
  });

  const previousByGroup = new Map<string, string | null>();
  const locationBySeasonGroup = new Map<string, string>();
  const remainingMajorOrganizers: string[] = [];
  const previousMajorLocationByOrganizer = new Map<string, string | null>();
  const usedMajorLocationsInCycle = new Set<string>();
  const updates: Array<ReturnType<typeof prisma.competition.update>> = [];

  for (const group of getMajorEventGroups(competitions)) {
    const assignment = getMajorEventAssignment(
      group,
      remainingMajorOrganizers,
      previousMajorLocationByOrganizer,
      usedMajorLocationsInCycle,
    );

    if (!assignment.location) {
      continue;
    }

    for (const competition of group) {
      if (
        competition.location === assignment.location &&
        competition.organizer === assignment.organizer
      ) {
        continue;
      }

      updates.push(
        prisma.competition.update({
          where: { id: competition.id },
          data: {
            location: assignment.location,
            organizer: assignment.organizer,
          },
        }),
      );
    }
  }

  for (const competition of competitions) {
    if (!competition.tier.lan) {
      continue;
    }

    if (Util.isMajorStageTier(competition.tier.slug)) {
      continue;
    }

    const pool = getLocationPool(competition).map(Util.formatCompetitionHostingLocation);
    if (!pool.length) {
      continue;
    }

    const group = getLocationGroup(competition);
    const seasonGroup = `${competition.season ?? 0}:${group}`;
    const previousLocation = previousByGroup.get(group) ?? null;
    const existingSeasonLocation = locationBySeasonGroup.get(seasonGroup);
    let nextLocation = competition.location;

    if (!nextLocation || !pool.includes(nextLocation)) {
      nextLocation = existingSeasonLocation ?? pickLocation(pool, previousLocation);
    }

    if (!nextLocation) {
      continue;
    }

    locationBySeasonGroup.set(seasonGroup, nextLocation);
    previousByGroup.set(group, nextLocation);

    if (nextLocation !== competition.location) {
      updates.push(
        prisma.competition.update({
          where: { id: competition.id },
          data: { location: nextLocation },
        }),
      );
    }
  }

  if (updates.length) {
    await prisma.$transaction(updates);
  }

  return updates.length;
}
