import { endOfDay, format, startOfDay } from 'date-fns';
import { Prisma } from '@prisma/client';
import { Constants, Util } from '@liga/shared';
import DatabaseClient from './database-client';
import { backfillMissingMatchPlayerGameStats } from './match-player-game-stats';

const PROTOTYPE_EVENT_PREFIX = 'prototype-news';
const AUTO_EVENT_PREFIX = 'auto-news';
const TOP_TRANSFER_TEAM_COUNT = 30;
const OPEN_TIER_INDEX = 0;
const INTERMEDIATE_TIER_INDEX = 1;
const PLAYER_HONOR_TIER_SLUGS = [
  ...Constants.Awards.filter((award) => award.type === Constants.AwardType.CHAMPION).map(
    (award) => award.target,
  ),
  Constants.TierSlug.MAJOR_CHAMPIONS_STAGE,
];

type NewsDraft = {
  type: 'ARTICLE' | 'SHORT';
  topic: 'MATCHES' | 'TRANSFERS' | 'COMPETITIONS' | 'RANKINGS' | 'FEATURES';
  headline: string;
  summary: string;
  body: string;
  image?: string | null;
  priority: number;
  eventKey: string;
  payload?: Record<string, unknown>;
  publishedAt: Date;
};

type MatchSeed = Awaited<ReturnType<typeof getRecentCompletedMatches>>[number];
type TransferSeed = Awaited<ReturnType<typeof getCompletedTransfersForNews>>[number];

type NewsCompetition = NonNullable<MatchSeed['competition']>;

function toFlagCode(code?: string | null) {
  const normalized = code?.toLocaleLowerCase();
  const aliases: Record<string, string> = {
    uk: 'gb',
  };

  return normalized ? aliases[normalized] || normalized : null;
}

function teamName(team?: { name?: string | null } | null) {
  return team?.name || 'No Team';
}

function playerName(player?: { name?: string | null } | null) {
  return player?.name || 'an emerging player';
}

function playerAgeLabel(
  player?: { age?: number | null } | null,
  fallback = 'the player',
  sentenceStart = false,
) {
  return player?.age ? `${sentenceStart ? 'The' : 'the'} ${player.age}-year-old` : fallback;
}

function teamBlazon(team?: { blazon?: string | null } | null) {
  return team?.blazon || 'resources://blazonry/noteam.svg';
}

function playerImage(
  player?: { avatar?: string | null } | null,
  fallbackTeam?: { blazon?: string | null },
) {
  return player?.avatar || teamBlazon(fallbackTeam);
}

function isNoTeam(
  team?: { id?: number | null; name?: string | null; blazon?: string | null } | null,
) {
  return (
    !team ||
    team.id == null ||
    team.name?.toLocaleLowerCase() === 'no team' ||
    team.blazon?.includes('noteam.svg')
  );
}

function toRelatedTeam(
  team?: { id?: number | null; name?: string | null; blazon?: string | null } | null,
) {
  return isNoTeam(team)
    ? null
    : {
        id: team.id,
        name: team.name,
        blazon: team.blazon,
      };
}

function toRelatedPlayer(player?: {
  id?: number | null;
  name?: string | null;
  avatar?: string | null;
  country?: { code?: string | null } | null;
}) {
  return player?.id
    ? {
        id: player.id,
        name: player.name,
        avatar: player.avatar,
        flagCode: toFlagCode(player.country?.code),
      }
    : null;
}

function getCompetitionFlagCode(competition?: NewsCompetition | null) {
  if (!competition) {
    return null;
  }

  return Util.getCompetitionDisplayLocationCountryCode({
    federationSlug: competition.federation.slug,
    lan: competition.tier.lan,
    location: competition.location,
  });
}

function getCompetitionLogo(competition?: NewsCompetition | null) {
  if (!competition) {
    return 'resources://competitions/league-pro-world.png';
  }

  return Util.getCompetitionLogo(competition.tier.slug, competition.federation.slug, {
    location: competition.location,
    organizer: competition.organizer,
  });
}

function isOpenOrIntermediateTier(tier?: number | null) {
  return tier === OPEN_TIER_INDEX || tier === INTERMEDIATE_TIER_INDEX;
}

function getTransferTier(transfer: TransferSeed) {
  return transfer.to?.tier ?? transfer.from?.tier ?? transfer.target.team?.tier ?? null;
}

function getTransferStoryDate(transfer: TransferSeed, fallback: Date) {
  const destinationId = transfer.from?.id;
  const matchingStint = destinationId
    ? transfer.target.careerStints.find((stint) => stint.teamId === destinationId)
    : null;

  return matchingStint?.startedAt || transfer.target.lastOfferAt || fallback;
}

function findCareerStintForTeam(
  player: {
    careerStints?: Array<{
      endedAt?: Date | string | null;
      startedAt: Date | string;
      starter?: boolean | null;
      team?: { id?: number | null; name?: string | null } | null;
      teamId?: number | null;
    }>;
  },
  teamId?: number | null,
  date?: Date | string,
) {
  if (!teamId) {
    return null;
  }

  const lookupDate = date ? new Date(date) : null;

  return (
    player.careerStints?.find((stint) => {
      if (stint.teamId !== teamId) {
        return false;
      }

      if (!lookupDate) {
        return true;
      }

      const startedAt = new Date(stint.startedAt);
      const endedAt = stint.endedAt ? new Date(stint.endedAt) : null;

      return startedAt <= lookupDate && (!endedAt || endedAt >= startOfDay(lookupDate));
    }) || null
  );
}

function findPreviousCareerStint(
  player: {
    careerStints?: Array<{
      endedAt?: Date | string | null;
      startedAt: Date | string;
      starter?: boolean | null;
      team?: { id?: number | null; name?: string | null } | null;
      teamId?: number | null;
    }>;
  },
  currentTeamId?: number | null,
  date?: Date,
) {
  const cutoff = date ? startOfDay(date) : null;

  return (
    player.careerStints
      ?.filter((stint) => {
        if (!stint.teamId || stint.teamId === currentTeamId) {
          return false;
        }

        if (!cutoff) {
          return true;
        }

        return new Date(stint.startedAt) <= cutoff;
      })
      .sort((a, b) => {
        const aTime = new Date(a.endedAt || a.startedAt).getTime();
        const bTime = new Date(b.endedAt || b.startedAt).getTime();

        return bTime - aTime;
      })[0] || null
  );
}

function findRecentStarterStintForTeam(
  player: {
    careerStints?: Array<{
      endedAt?: Date | string | null;
      startedAt: Date | string;
      starter?: boolean | null;
      team?: { id?: number | null; name?: string | null } | null;
      teamId?: number | null;
    }>;
  },
  teamId?: number | null,
  date?: Date | string,
) {
  if (!teamId) {
    return null;
  }

  const cutoff = date ? endOfDay(new Date(date)) : null;

  return (
    player.careerStints
      ?.filter((stint) => {
        if (stint.teamId !== teamId || !stint.starter) {
          return false;
        }

        return cutoff ? new Date(stint.startedAt) <= cutoff : true;
      })
      .sort((a, b) => {
        const aTime = new Date(a.endedAt || a.startedAt).getTime();
        const bTime = new Date(b.endedAt || b.startedAt).getTime();

        return bTime - aTime;
      })[0] || null
  );
}

function formatBenchDuration(startedAt?: Date | string | null, endedAt?: Date | string | null) {
  if (!startedAt || !endedAt) {
    return null;
  }

  const days = Math.max(
    1,
    Math.round(
      (startOfDay(new Date(endedAt)).getTime() - startOfDay(new Date(startedAt)).getTime()) /
        86_400_000,
    ),
  );

  if (days < 14) {
    return `${days} day${days === 1 ? '' : 's'}`;
  }

  if (days < 56) {
    const weeks = Math.min(8, Math.max(3, Math.round(days / 7)));
    return `${weeks} weeks`;
  }

  if (days < 730) {
    const months = Math.min(24, Math.max(2, Math.round(days / 30)));
    return `${months} months`;
  }

  const years = Math.max(2, Math.round(days / 365));
  return `${years} years`;
}

function scoreLine(match: MatchSeed) {
  return match.competitors.map((competitor) => competitor.score ?? 0).join(' - ') || '0 - 0';
}

function getCompetitionName(match: MatchSeed) {
  return match.competition?.tier?.league?.name || match.competition?.tier?.name || 'LIGA';
}

function isQualifierCompetition(competition?: NewsCompetition | null) {
  return Boolean(competition?.tier.slug.includes('qualifier'));
}

function isEseaNormalCompetition(competition?: NewsCompetition | null) {
  return (
    competition?.tier.league.slug === Constants.LeagueSlug.ESPORTS_LEAGUE &&
    !competition.tier.slug.includes('playoffs')
  );
}

function isEseaPlayoffCompetition(competition?: NewsCompetition | null) {
  return (
    competition?.tier.league.slug === Constants.LeagueSlug.ESPORTS_LEAGUE &&
    [Constants.TierSlug.LEAGUE_ADVANCED_PLAYOFFS, Constants.TierSlug.LEAGUE_MAIN_PLAYOFFS].includes(
      competition.tier.slug as Constants.TierSlug,
    )
  );
}

function shouldSkipEseaOceaniaPlayoffMatch(
  match: MatchSeed,
  allowedFinalMatchIds = new Set<number>(),
) {
  return (
    isEseaPlayoffCompetition(match.competition) &&
    match.competition.federation.slug === Constants.FederationSlug.ESPORTS_OCE &&
    !allowedFinalMatchIds.has(match.id)
  );
}

function getEseaDivisionName(tierSlug?: string | null) {
  if (tierSlug === Constants.TierSlug.LEAGUE_ADVANCED) {
    return 'ESEA Advanced';
  }

  if (tierSlug === Constants.TierSlug.LEAGUE_MAIN) {
    return 'ESEA Main';
  }

  if (tierSlug === Constants.TierSlug.LEAGUE_ADVANCED_PLAYOFFS) {
    return 'ESEA Advanced Playoffs';
  }

  if (tierSlug === Constants.TierSlug.LEAGUE_MAIN_PLAYOFFS) {
    return 'ESEA Main Playoffs';
  }

  return 'ESEA';
}

function getFederationLabel(slug?: string | null) {
  const labels: Partial<Record<Constants.FederationSlug, string>> = {
    [Constants.FederationSlug.ESPORTS_EUROPA]: 'Europe',
    [Constants.FederationSlug.ESPORTS_AMERICAS]: 'Americas',
    [Constants.FederationSlug.ESPORTS_ASIA]: 'Asia',
    [Constants.FederationSlug.ESPORTS_OCE]: 'Oceania',
  };

  return labels[slug as Constants.FederationSlug] || slug || 'World';
}

function getRoundLabel(match: MatchSeed) {
  if (match.round) {
    return `round ${match.round}`;
  }

  return match.competition?.tier?.groupSize ? 'group stage' : 'playoffs';
}

function pickVariant<T>(items: T[], seed: number) {
  return items[Math.abs(seed) % items.length];
}

function seededNumber(seed: number, salt: number) {
  const value = Math.sin(seed * 999 + salt * 97) * 10000;

  return value - Math.floor(value);
}

function seededInt(seed: number, salt: number, min: number, max: number) {
  return min + Math.floor(seededNumber(seed, salt) * (max - min + 1));
}

function isAwper(player?: { role?: string | null } | null) {
  const normalized = player?.role?.toLocaleUpperCase();

  return normalized === Constants.PlayerRole.SNIPER || normalized === Constants.UserRole.AWPER;
}

function getTeamIdentity(players: Array<{ country?: { code?: string | null } | null }>) {
  const counts = new Map<string, number>();

  for (const player of players) {
    const code = toFlagCode(player.country?.code);

    if (code) {
      counts.set(code, (counts.get(code) || 0) + 1);
    }
  }

  const [countryCode, count] =
    [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] || [];

  return {
    countryCode,
    isNational: Boolean(countryCode && count >= 3),
    isInternational: players.length > 0 && count < 3,
  };
}

function formatRating(rating: number) {
  return rating.toFixed(2);
}

function getRatingBucket(rating: number) {
  if (rating > 1.15) {
    return 'GREAT';
  }

  if (rating > 1.05) {
    return 'GOOD';
  }

  if (rating > 0.9) {
    return 'MIXED';
  }

  return 'POOR';
}

function escapeMarkdownLinkText(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/\]/g, '\\]');
}

function teamLink(team?: { id?: number | null; name?: string | null } | null) {
  const name = teamName(team);

  return team?.id
    ? `**[${escapeMarkdownLinkText(name)}](/teams?teamId=${team.id})**`
    : `**${name}**`;
}

function playerLink(player?: { id?: number | null; name?: string | null } | null) {
  const name = playerName(player);

  return player?.id
    ? `**[${escapeMarkdownLinkText(name)}](/players?playerId=${player.id})**`
    : `**${name}**`;
}

function getCompetitionNewsName(
  competition: {
    federation?: { slug?: string | null } | null;
    location?: string | null;
    organizer?: string | null;
    tier: { league?: { name?: string | null } | null; name?: string | null; slug?: string | null };
  },
  options?: { trophy?: boolean },
) {
  const hostedName = Util.getHostedEventDisplayName(competition.tier.slug, competition.location);
  const rawName = (() => {
    if (hostedName) {
      return hostedName;
    }

    if (Util.isMajorStageTier(competition.tier.slug)) {
      return Util.getMajorEventDisplayName(competition.location, competition.organizer);
    }

    const name =
      Util.getCompetitionDisplayName(competition.tier.league?.name, competition.tier.slug) ||
      competition.tier.name ||
      competition.tier.league?.name ||
      'LIGA';
    const region = getFederationLabel(competition.federation?.slug);

    return region &&
      region !== 'World' &&
      !name.toLocaleLowerCase().includes(region.toLocaleLowerCase())
      ? `${name} ${region}`
      : name;
  })();

  return options?.trophy ? rawName.replace(/\s+Playoffs\b/gi, '').trim() : rawName;
}

function competitionLink(competition: {
  federation?: { slug?: string | null } | null;
  federationId?: number | null;
  id?: number | null;
  location?: string | null;
  organizer?: string | null;
  season?: number | null;
  tier: {
    id?: number | null;
    league?: { name?: string | null } | null;
    name?: string | null;
    slug?: string | null;
  };
}) {
  const name = getCompetitionNewsName(competition, { trophy: true });

  return competition.id && competition.federationId && competition.season && competition.tier.id
    ? `**[${escapeMarkdownLinkText(name)}](/competitions?competitionId=${competition.id}&federationId=${competition.federationId}&season=${competition.season}&tierId=${competition.tier.id})**`
    : `**${name}**`;
}

function formatLinkedList(items: string[]) {
  if (items.length <= 1) {
    return items[0] || '';
  }

  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`;
  }

  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

function isExcludedTitleCompetition(competition: {
  tier: { name?: string | null; slug?: string | null };
}) {
  const slug = competition.tier.slug?.toLocaleLowerCase() || '';
  const name = competition.tier.name?.toLocaleLowerCase() || '';

  return (
    slug.includes('qualifier') ||
    slug.includes('rmr') ||
    name.includes('qualifier') ||
    name.includes('rmr')
  );
}

function buildTransferComments(args: {
  benchedPlayer?: { name?: string | null } | null;
  destination?: { name?: string | null } | null;
  isArticle: boolean;
  seed: number;
  seller?: { name?: string | null } | null;
  target: { name?: string | null };
}) {
  const flags = [
    'us',
    'br',
    'dk',
    'se',
    'de',
    'fr',
    'pl',
    'ca',
    'gb',
    'au',
    'fi',
    'no',
    'ee',
    'nl',
    'es',
    'pt',
    'ru',
    'ua',
    'tr',
    'cn',
  ];
  const names = [
    'atomic_',
    'midnightCaller',
    'sjuushEnjoyer',
    'ecoCobra',
    'BAnchor',
    'nukeEnjoyer',
    'defaultPlant',
    'noKitNoProblem',
    'BrollanFan',
    'adminHeSawIt',
    'infernoBan',
    'tradeFrag',
    'lurkAccount',
    'warmupHero',
    'halfBuy',
    'saveMerchant',
    'hltvProfessor',
    'siteAnchor',
    'swingOrBeSwung',
    'lowTabLarry',
  ];
  const targetName = playerName(args.target);
  const destinationName = teamName(args.destination);
  const sellerName = teamName(args.seller);
  const benchedName = args.benchedPlayer ? playerName(args.benchedPlayer) : null;
  const templates = [
    `Nah this ain't it man`,
    `Good luck ${targetName}`,
    `idk if ${targetName} will work on ${destinationName}`,
    benchedName
      ? `No way they benched ${benchedName} for this`
      : `${destinationName} needed this tbh`,
    `LOL`,
    `lmao`,
    `Is this a good move tho?`,
    `Let's go ${destinationName}!`,
    `${sellerName} fans are going through it`,
    `${targetName} masterclass incoming`,
    `actually a smart pickup`,
    `mid move unless the roles are perfect`,
    `${destinationName} cooking?`,
    `give him two events before judging`,
    `people are underrating this`,
    `this roster makes no sense and I love it`,
    `finally some ambition`,
    `I need to see the first match`,
    `${targetName} clears half these comments`,
    `classic ${destinationName} gamble`,
  ].filter(Boolean);
  const count = args.isArticle ? seededInt(args.seed, 1, 10, 25) : seededInt(args.seed, 1, 3, 5);
  const usedNames = new Set<string>();

  return Array.from({ length: count }, (_, index) => {
    let name = pickVariant(names, args.seed + index * 7);

    if (usedNames.has(name)) {
      name = `${name}${seededInt(args.seed, index + 2, 1, 99)}`;
    }

    usedNames.add(name);

    return {
      id: index + 1,
      author: name,
      flagCode: pickVariant(flags, args.seed + index * 11),
      message: pickVariant(templates, args.seed + index * 13),
      score: seededInt(args.seed, index + 3, -4, 112),
    };
  });
}

async function getTopTeamIds(limit = TOP_TRANSFER_TEAM_COUNT) {
  const teams = await DatabaseClient.prisma.team.findMany({
    orderBy: [{ elo: 'desc' }, { id: 'asc' }],
    select: { id: true },
    take: limit,
  });

  return new Set(teams.map((team) => team.id));
}

async function getRecentCompletedMatches(date: Date) {
  const from = startOfDay(date);
  const to = endOfDay(date);

  return DatabaseClient.prisma.match.findMany({
    include: {
      competition: {
        include: {
          competitors: {
            include: {
              team: {
                include: {
                  country: true,
                },
              },
            },
          },
          federation: true,
          tier: {
            include: {
              league: true,
            },
          },
        },
      },
      competitors: {
        include: {
          team: {
            include: {
              country: true,
            },
          },
        },
      },
      games: true,
    },
    orderBy: [{ date: 'desc' }, { id: 'desc' }],
    take: 100,
    where: {
      competitionId: { not: null },
      date: {
        gte: from.toISOString(),
        lte: to.toISOString(),
      },
      matchType: { not: 'FACEIT_PUG' },
      status: Constants.MatchStatus.COMPLETED,
    },
  });
}

async function getCompletedTransfersForNews() {
  return DatabaseClient.prisma.transfer.findMany({
    include: {
      from: {
        include: {
          country: {
            include: {
              continent: true,
            },
          },
          players: {
            include: {
              country: true,
            },
            orderBy: [{ starter: 'desc' }, { xp: 'desc' }, { elo: 'desc' }, { id: 'asc' }],
          },
        },
      },
      to: {
        include: {
          country: {
            include: {
              continent: true,
            },
          },
          players: {
            include: {
              country: true,
            },
            orderBy: [{ starter: 'desc' }, { xp: 'desc' }, { elo: 'desc' }, { id: 'asc' }],
          },
        },
      },
      target: {
        include: {
          careerStints: {
            include: {
              team: true,
            },
            orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
            take: 8,
          },
          country: true,
          team: true,
        },
      },
      offers: {
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 1,
      },
    },
    orderBy: [{ id: 'desc' }],
    take: 40,
    where: {
      status: {
        in: [Constants.TransferStatus.TEAM_ACCEPTED, Constants.TransferStatus.PLAYER_ACCEPTED],
      },
    },
  });
}

async function getLikelyBenchedPlayer(destinationId: number, targetId: number, publishedAt: Date) {
  const dayStart = startOfDay(publishedAt);
  const dayEnd = endOfDay(publishedAt);
  const recentBench = await DatabaseClient.prisma.player.findFirst({
    include: {
      careerStints: {
        orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
        take: 8,
      },
      country: true,
    },
    orderBy: [{ xp: 'desc' }, { elo: 'desc' }, { id: 'asc' }],
    where: {
      id: {
        not: targetId,
      },
      lastOfferAt: {
        gte: dayStart,
        lte: dayEnd,
      },
      starter: false,
      teamId: destinationId,
    },
  });

  if (recentBench) {
    return recentBench;
  }

  const stint = await DatabaseClient.prisma.careerStint.findFirst({
    include: {
      player: {
        include: {
          careerStints: {
            orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
            take: 8,
          },
          country: true,
        },
      },
    },
    orderBy: [{ id: 'desc' }],
    where: {
      playerId: {
        not: targetId,
      },
      starter: false,
      startedAt: {
        gte: dayStart,
        lte: dayEnd,
      },
      teamId: destinationId,
    },
  });

  return stint?.player || null;
}

function getBackfillDeparture(
  transfers: TransferSeed[],
  currentTransfer: TransferSeed,
  destinationId: number,
  storyDate: Date,
  fallbackDate: Date,
) {
  return transfers
    .filter((transfer) => {
      if (transfer.id === currentTransfer.id || transfer.target.id === currentTransfer.target.id) {
        return false;
      }

      if (transfer.id > currentTransfer.id) {
        return false;
      }

      if (transfer.to?.id !== destinationId || !transfer.from || isNoTeam(transfer.from)) {
        return false;
      }

      return (
        startOfDay(getTransferStoryDate(transfer, fallbackDate)).getTime() ===
        startOfDay(storyDate).getTime()
      );
    })
    .sort((a, b) => b.id - a.id)[0];
}

async function getPlayerAggregateStats(
  playerId: number,
  teamId?: number | null,
  afterDate?: Date | null,
  beforeDate?: Date | null,
) {
  const rows = await DatabaseClient.prisma.$queryRaw<
    Array<{
      assists: bigint | number | null;
      deaths: bigint | number | null;
      kills: bigint | number | null;
    }>
  >`
    SELECT
      "MatchPlayerGameStat"."kills" AS "kills",
      "MatchPlayerGameStat"."assists" AS "assists",
      "MatchPlayerGameStat"."deaths" AS "deaths"
    FROM "MatchPlayerGameStat"
    INNER JOIN "Match" ON "Match"."id" = "MatchPlayerGameStat"."matchId"
    WHERE "Match"."status" = ${Constants.MatchStatus.COMPLETED}
      AND "Match"."competitionId" IS NOT NULL
      AND "Match"."matchType" <> 'FACEIT_PUG'
      AND "MatchPlayerGameStat"."playerId" = ${playerId}
      ${afterDate ? Prisma.sql`AND "Match"."date" >= ${afterDate}` : Prisma.empty}
      ${beforeDate ? Prisma.sql`AND "Match"."date" <= ${endOfDay(beforeDate)}` : Prisma.empty}
      ${
        teamId
          ? Prisma.sql`AND EXISTS (
              SELECT 1
              FROM "MatchToTeam"
              WHERE "MatchToTeam"."matchId" = "MatchPlayerGameStat"."matchId"
                AND "MatchToTeam"."teamId" = ${teamId}
            )`
          : Prisma.empty
      }
  `;
  const ratings = rows
    .map((row) =>
      Util.getPlayerRating(
        Number(row.kills || 0),
        Number(row.deaths || 0),
        Number(row.assists || 0),
      ),
    )
    .filter(Number.isFinite);

  if (!ratings.length) {
    return null;
  }

  return {
    maps: ratings.length,
    rating: ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length,
  };
}

async function getRecentTeamTitles(
  teamId?: number | null,
  beforeDate?: Date,
  player?: {
    careerStints?: Array<{
      endedAt?: Date | string | null;
      startedAt: Date | string;
      starter?: boolean | null;
      teamId?: number | null;
    }>;
  },
) {
  if (!teamId) {
    return [];
  }

  return DatabaseClient.prisma.competitionToTeam
    .findMany({
      include: {
        competition: {
          include: {
            competitors: true,
            federation: true,
            matches: {
              orderBy: [{ date: 'desc' }, { id: 'desc' }],
              include: {
                competitors: true,
              },
              take: 1,
            },
            tier: {
              include: {
                league: true,
              },
            },
          },
        },
      },
      orderBy: [{ competitionId: 'desc' }, { id: 'desc' }],
      take: 3,
      where: {
        position: 1,
        teamId,
        competition: {
          status: Constants.CompetitionStatus.COMPLETED,
          tier: {
            slug: {
              in: PLAYER_HONOR_TIER_SLUGS,
            },
          },
          matches: beforeDate
            ? {
                some: {
                  date: {
                    gte: new Date(beforeDate.getTime() - 365 * 24 * 60 * 60 * 1000),
                    lte: beforeDate,
                  },
                },
              }
            : undefined,
        },
      },
    })
    .then((titles) =>
      titles
        .filter((title) => !isExcludedTitleCompetition(title.competition))
        .filter((title) => {
          const championshipMatch = title.competition.matches[0];

          if (!championshipMatch) {
            return false;
          }

          let winnerTeamId = title.competition.competitors?.find(
            (competitor) => competitor.position === 1,
          )?.teamId;

          if (!winnerTeamId && championshipMatch.competitors.length >= 2) {
            const ordered = [...championshipMatch.competitors].sort(
              (a, b) => (b.score ?? 0) - (a.score ?? 0),
            );
            winnerTeamId = ordered[0]?.teamId;
          }

          if (winnerTeamId !== teamId) {
            return false;
          }

          if (!player) {
            return true;
          }

          const titleDate = championshipMatch.date;

          return Boolean(findCareerStintForTeam(player, teamId, new Date(titleDate))?.starter);
        })
        .slice(0, 3),
    );
}

async function getUpcomingTeamMatches(teamId?: number | null, publishedAt?: Date) {
  if (!teamId) {
    return [];
  }

  return DatabaseClient.prisma.match.findMany({
    include: {
      competition: {
        include: {
          federation: true,
          tier: {
            include: {
              league: true,
            },
          },
        },
      },
      competitors: {
        include: {
          team: true,
        },
      },
    },
    orderBy: [{ date: 'asc' }, { id: 'asc' }],
    take: 3,
    where: {
      competitors: {
        some: {
          teamId,
        },
      },
      date: {
        gt: publishedAt || new Date(),
      },
      matchType: {
        not: 'FACEIT_PUG',
      },
      status: {
        not: Constants.MatchStatus.COMPLETED,
      },
    },
  });
}

async function getQualifierMatches(competitionId: number) {
  return DatabaseClient.prisma.match.findMany({
    include: {
      competitors: {
        include: {
          team: {
            include: {
              country: true,
            },
          },
        },
      },
    },
    orderBy: [{ round: 'desc' }, { date: 'desc' }, { id: 'desc' }],
    where: {
      competitionId,
      status: Constants.MatchStatus.COMPLETED,
    },
  });
}

function buildMatchDraft(
  match: MatchSeed,
  publishedAt: Date,
  allowedOceaniaFinalMatchIds?: Set<number>,
): NewsDraft | null {
  if (
    isQualifierCompetition(match.competition) ||
    isEseaNormalCompetition(match.competition) ||
    shouldSkipEseaOceaniaPlayoffMatch(match, allowedOceaniaFinalMatchIds)
  ) {
    return null;
  }

  const winner = match.competitors.find(
    (competitor) => competitor.result === Constants.MatchResult.WIN,
  );
  const loser = match.competitors.find(
    (competitor) => competitor.result === Constants.MatchResult.LOSS,
  );

  if (!winner?.team || !loser?.team) {
    return null;
  }

  const winnerName = teamName(winner.team);
  const loserName = teamName(loser.team);
  const competitionName = getCompetitionName(match);
  const line = scoreLine(match);
  const publishedLabel = format(publishedAt, Constants.Settings.calendar.calendarDateFormat);

  return {
    type: 'ARTICLE',
    topic: 'MATCHES',
    headline: `${winnerName} defeat ${loserName} in ${competitionName}`,
    summary: `${winnerName} claimed a ${line} win in ${getRoundLabel(match)}, adding another result to the ${competitionName} story.`,
    body: [
      `# ${winnerName} defeat ${loserName}`,
      '',
      `${winnerName} got the better of ${loserName}, closing the series ${line} and taking a valuable result in ${competitionName}.`,
      '',
      `The win gives ${winnerName} momentum as the season calendar keeps moving, while ${loserName} will need to respond quickly to avoid losing ground.`,
      '',
      `Published ${publishedLabel}.`,
    ].join('\n'),
    image: teamBlazon(winner.team),
    priority: 80,
    eventKey: `${AUTO_EVENT_PREFIX}:match:${match.id}`,
    payload: {
      matchId: match.id,
      competitionId: match.competitionId,
      teamIds: match.competitors.map((competitor) => competitor.teamId).filter(Boolean),
      flagCode: getCompetitionFlagCode(match.competition),
      relatedTeams: match.competitors
        .map((competitor) => toRelatedTeam(competitor.team))
        .filter(Boolean),
      showMatchPanel: isEseaPlayoffCompetition(match.competition),
    },
    publishedAt,
  };
}

function buildEseaDailyRecapDrafts(matches: MatchSeed[], publishedAt: Date): NewsDraft[] {
  const normalMatches = matches.filter((match) => isEseaNormalCompetition(match.competition));
  const regionOrder = [
    Constants.FederationSlug.ESPORTS_EUROPA,
    Constants.FederationSlug.ESPORTS_AMERICAS,
    Constants.FederationSlug.ESPORTS_ASIA,
    Constants.FederationSlug.ESPORTS_OCE,
  ];
  const recapConfigs = [
    {
      regions: regionOrder,
      tierSlug: Constants.TierSlug.LEAGUE_ADVANCED,
    },
    {
      regions: [Constants.FederationSlug.ESPORTS_EUROPA],
      tierSlug: Constants.TierSlug.LEAGUE_MAIN,
    },
  ];

  return recapConfigs
    .map((config): NewsDraft | null => {
      const divisionMatches = normalMatches.filter(
        (match) => match.competition.tier.slug === config.tierSlug,
      );

      if (!divisionMatches.length) {
        return null;
      }

      const firstMatch = divisionMatches[0];
      const day = firstMatch.round || 1;
      const divisionName = getEseaDivisionName(config.tierSlug);
      const resultLines = config.regions.flatMap((regionSlug) => {
        const regionMatches = divisionMatches.filter(
          (match) => match.competition.federation.slug === regionSlug,
        );

        if (!regionMatches.length) {
          return [];
        }

        return [
          '',
          `${getFederationLabel(regionSlug)}:`,
          ...regionMatches.map((match) => {
            const [home, away] = match.competitors;
            return `- ${teamName(home?.team)} ${home?.score ?? 0} - ${away?.score ?? 0} ${teamName(
              away?.team,
            )}`;
          }),
        ];
      });

      return {
        type: 'ARTICLE',
        topic: 'MATCHES',
        headline: `${divisionName} recap day ${day}`,
        summary:
          config.tierSlug === Constants.TierSlug.LEAGUE_ADVANCED
            ? `All regional ${divisionName} results from day ${day}, covering Europe, Americas, Asia and Oceania.`
            : `Europe's ${divisionName} results from day ${day}.`,
        body: [
          `# ${divisionName} recap day ${day}`,
          '',
          `The latest ${divisionName} matchday is complete. Here are the results by region.`,
          ...resultLines,
        ].join('\n'),
        image: getCompetitionLogo(firstMatch.competition),
        priority: 76,
        eventKey: `${AUTO_EVENT_PREFIX}:esea-recap:${config.tierSlug}:${format(
          publishedAt,
          'yyyy-MM-dd',
        )}:day-${day}`,
        payload: {
          flagCode: 'eu',
          matchIds: divisionMatches.map((match) => match.id),
          relatedTeams: divisionMatches
            .flatMap((match) =>
              match.competitors.map((competitor) => toRelatedTeam(competitor.team)),
            )
            .filter(Boolean),
        },
        publishedAt,
      };
    })
    .filter(Boolean);
}

async function buildQualifierDraft(
  competition: NewsCompetition,
  publishedAt: Date,
): Promise<NewsDraft | null> {
  if (competition.status !== Constants.CompetitionStatus.COMPLETED) {
    return null;
  }

  const matches = await getQualifierMatches(competition.id);
  const advancementEnd = Util.getTierAdvancementEnd(
    competition.tier.slug as Constants.TierSlug,
    competition.federation.slug as Constants.FederationSlug,
  );
  const qualifiedTeams = competition.competitors
    .filter(
      (competitor) =>
        !!advancementEnd && (competitor.position || 0) > 0 && competitor.position <= advancementEnd,
    )
    .sort((a, b) => (a.position || 0) - (b.position || 0));

  if (!qualifiedTeams.length) {
    return null;
  }

  const competitionName = competition.tier.name || competition.tier.league.name;
  const flagCode = getCompetitionFlagCode(competition);
  const resultLines = matches.slice(0, 12).map((match) => {
    const [home, away] = match.competitors;
    return `- ${teamName(home?.team)} ${home?.score ?? 0} - ${away?.score ?? 0} ${teamName(
      away?.team,
    )}`;
  });
  const qualifiedLines = qualifiedTeams.map((competitor) => {
    const teamFlag = toFlagCode(competitor.team?.country?.code) || flagCode;
    return `- :flag_${teamFlag}: ${teamName(competitor.team)}`;
  });

  return {
    type: 'SHORT',
    topic: 'COMPETITIONS',
    headline: `${competitionName} qualified teams decided`,
    summary: `${qualifiedTeams.map((competitor) => teamName(competitor.team)).join(', ')} secured spots through ${competitionName}.`,
    body: [
      `The final matches of ${competitionName} have wrapped, confirming the teams moving on.`,
      '',
      `Qualified teams:`,
      ...qualifiedLines,
      '',
      `Results:`,
      ...resultLines,
      '',
      `The qualifier produced a compact but important set of results, with every remaining series carrying immediate consequences.`,
    ].join('\n'),
    image: getCompetitionLogo(competition),
    priority: 72,
    eventKey: `${AUTO_EVENT_PREFIX}:qualifier:${competition.id}`,
    payload: {
      competitionId: competition.id,
      flagCode,
      qualifiedTeams: qualifiedTeams.map((competitor) => ({
        id: competitor.team.id,
        name: competitor.team.name,
        blazon: competitor.team.blazon,
        flagCode: toFlagCode(competitor.team.country?.code) || flagCode,
      })),
      relatedTeams: qualifiedTeams
        .map((competitor) => toRelatedTeam(competitor.team))
        .filter(Boolean),
    },
    publishedAt,
  };
}

async function buildTransferDraft(
  transfer: TransferSeed,
  transfers: TransferSeed[],
  topTeamIds: Set<number>,
  publishedAt: Date,
  includeStatistics: boolean,
): Promise<NewsDraft | null> {
  const destination = transfer.from;
  const seller = transfer.to;
  const target = transfer.target;
  const destinationIsTop = !!destination && topTeamIds.has(destination.id);
  const sellerIsTop = !!seller && topTeamIds.has(seller.id);
  const isTopTeamTransfer = destinationIsTop || sellerIsTop;
  const tier = getTransferTier(transfer);
  const latestOffer = transfer.offers[0];
  const storyDate = getTransferStoryDate(transfer, publishedAt);
  const articleDate = new Date(startOfDay(storyDate).getTime() + transfer.id);
  const isFreeAgentSigning =
    isNoTeam(seller) || (!!destination && !!seller && destination.id === seller.id);

  if (!isTopTeamTransfer && isOpenOrIntermediateTier(tier)) {
    return null;
  }

  const targetName = playerName(target);
  const destinationName = teamName(destination);
  const sellerName = teamName(seller);
  const targetLabel = playerLink(target);
  const destinationLabel = teamLink(destination);
  const sellerLabel = teamLink(seller);
  const targetAgeLabel = playerAgeLabel(target, targetLabel);
  const targetAgeSentenceLabel = playerAgeLabel(target, targetLabel, true);
  const mainTeam = destination || seller;
  const backfillDeparture = destination
    ? getBackfillDeparture(transfers, transfer, destination.id, storyDate, publishedAt)
    : null;
  const benchedPlayer = destination
    ? await getLikelyBenchedPlayer(destination.id, target.id, storyDate)
    : null;
  const backfillPlayerLabel = playerLink(backfillDeparture?.target);
  const backfillDestinationLabel = teamLink(backfillDeparture?.from);
  const benchedName = playerName(benchedPlayer);
  const benchedLabel = playerLink(benchedPlayer);
  const fee = latestOffer?.cost || 0;
  const includeDetailedStats = isTopTeamTransfer;
  const includeShortSourceStats = seededNumber(transfer.id, 83) > 0.45;
  const includeShortBenchedStats = seededNumber(transfer.id, 89) > 0.45;
  const shouldIncludeSourceStats = includeDetailedStats || includeShortSourceStats;
  const shouldIncludeBenchedStats = includeDetailedStats || includeShortBenchedStats;
  const freeAgentPreviousStint =
    isTopTeamTransfer && isFreeAgentSigning
      ? findPreviousCareerStint(target, destination?.id, storyDate)
      : null;
  const statsSourceTeam = !isFreeAgentSigning ? seller : freeAgentPreviousStint?.team;
  const statsSourceTeamId = statsSourceTeam?.id || freeAgentPreviousStint?.teamId || null;
  const statsSourceLabel = teamLink(statsSourceTeam);
  const currentSourceStint =
    !isFreeAgentSigning && statsSourceTeamId && target.id
      ? findCareerStintForTeam(target, statsSourceTeamId, storyDate)
      : null;
  const isSignedFromBench = Boolean(
    !isFreeAgentSigning && seller && currentSourceStint?.starter === false,
  );
  const activeSourceStint =
    isSignedFromBench && statsSourceTeamId
      ? findRecentStarterStintForTeam(target, statsSourceTeamId, currentSourceStint?.startedAt)
      : null;
  const sourceStint =
    statsSourceTeamId && target.id
      ? activeSourceStint || currentSourceStint || freeAgentPreviousStint
      : null;
  const benchDuration = isSignedFromBench
    ? formatBenchDuration(currentSourceStint?.startedAt, storyDate)
    : null;
  const benchedStint = benchedPlayer
    ? findRecentStarterStintForTeam(benchedPlayer, destination?.id, storyDate)
    : null;
  const sourceStats =
    includeStatistics && shouldIncludeSourceStats && target.id && statsSourceTeamId
      ? await getPlayerAggregateStats(
          target.id,
          statsSourceTeamId,
          sourceStint ? new Date(sourceStint.startedAt) : null,
          sourceStint?.endedAt ? new Date(sourceStint.endedAt) : storyDate,
        )
      : null;
  const benchedStats =
    includeStatistics && shouldIncludeBenchedStats && benchedPlayer?.id
      ? await getPlayerAggregateStats(
          benchedPlayer.id,
          destination?.id,
          benchedStint ? new Date(benchedStint.startedAt) : null,
          benchedStint?.endedAt ? new Date(benchedStint.endedAt) : storyDate,
        )
      : null;
  const sellerTitles = await getRecentTeamTitles(
    isFreeAgentSigning ? null : seller?.id,
    storyDate,
    target,
  );
  const upcomingMatches = await getUpcomingTeamMatches(destination?.id, storyDate);
  const destinationPlayers = destination?.players || [];
  const sellerPlayers = seller?.players || [];
  const destinationStarters = destinationPlayers.filter((player) => player.starter);
  const destinationBench = destinationPlayers.filter((player) => !player.starter);
  const destinationIdentity = getTeamIdentity(destinationStarters);
  const sellerIdentity = getTeamIdentity(sellerPlayers.filter((player) => player.starter));
  const playerFirstWithSeller = [
    `${targetName} transfers to ${destinationName} from ${sellerName}`,
    `${targetName} completes ${destinationName} move`,
    `${targetName} completes transfer to ${destinationName}`,
    `${targetName} seals ${destinationName} move`,
    `${targetName} moves to ${destinationName}`,
    `${targetName} arrives at ${destinationName}`,
    `${targetName} leaves ${sellerName} for ${destinationName}`,
    `${targetName} joins ${destinationName} from ${sellerName}`,
    `${targetName} departs ${sellerName} to join ${destinationName}`,
  ];
  const playerFirstFreeAgent = [
    `${targetName} signs with ${destinationName}`,
    `${targetName} lands ${destinationName} deal`,
    `${targetName} completes ${destinationName} move`,
    `${targetName} seals ${destinationName} move`,
    `${targetName} moves to ${destinationName}`,
    `${targetName} arrives at ${destinationName}`,
  ];
  const teamFirstWithSeller = [
    `${destinationName} sign ${targetName} from ${sellerName}`,
    `${destinationName} complete ${targetName} signing`,
    `${destinationName} announce ${targetName} signing`,
    `${destinationName} confirm ${targetName} arrival`,
    `${destinationName} complete ${targetName} move from ${sellerName}`,
  ];
  const teamFirstFreeAgent = [
    `${destinationName} sign ${targetName}`,
    `${destinationName} land ${targetName}`,
    `${destinationName} secure ${targetName}`,
    `${destinationName} recruit ${targetName}`,
    `${destinationName} bring in ${targetName}`,
    `${destinationName} add ${targetName}`,
    `${destinationName} acquire ${targetName}`,
    `${destinationName} capture ${targetName}`,
    `${destinationName} seal ${targetName} deal`,
    `${destinationName} add ${targetName} to ranks`,
  ];
  const replacementTitles = [
    `${targetName} replaces ${benchedName} on ${destinationName}`,
    `${destinationName} replace ${benchedName} with ${targetName}`,
    `${destinationName} bring in ${targetName} as ${benchedName} is benched`,
  ];
  const baseTitlePool = destination
    ? [
        ...(isFreeAgentSigning ? playerFirstFreeAgent : playerFirstWithSeller),
        ...(isFreeAgentSigning ? teamFirstFreeAgent : teamFirstWithSeller),
      ]
    : [`${targetName} leaves ${sellerName}`, `${targetName} enters free agency`];
  const canUseReplacementTitle = Boolean(destination && benchedPlayer && transfer.id % 5 === 0);
  const baseHeadline = canUseReplacementTitle
    ? pickVariant(replacementTitles, transfer.id)
    : pickVariant(baseTitlePool, transfer.id);
  const headline =
    !canUseReplacementTitle && benchedPlayer && transfer.id % 6 === 0
      ? `${baseHeadline}, ${benchedName} benched`
      : !canUseReplacementTitle && benchedPlayer && transfer.id % 6 === 1
        ? `${baseHeadline}, as ${benchedName} is benched`
        : baseHeadline;
  const feeLine =
    fee > 0 && !isFreeAgentSigning
      ? `The deal is understood to be worth ${fee.toLocaleString('en-US')}.`
      : null;
  const freeAgentOpeners = [
    `${targetLabel} joins ${destinationLabel} as a free agent as the organization hopes to improve its roster with the newest addition.`,
    `${destinationLabel} have added ${targetLabel} on a free transfer, giving the team a new piece to work with before the next run of matches.`,
    `${targetLabel} has linked up with ${destinationLabel} without a transfer fee, adding fresh depth to the lineup.`,
    `${destinationLabel} turn to ${targetLabel} as their latest free-agent pickup in a bid to sharpen the roster.`,
    `${targetLabel} arrives at ${destinationLabel} as a free agent, with the team looking for an immediate boost.`,
    `${destinationLabel} hopes to improve by bringing in ${targetLabel}.`,
    `${destinationLabel} have strengthened their roster with the free-agent signing of ${targetLabel}.`,
    `${targetLabel} joins ${destinationLabel} on a free transfer as the team looks to add depth ahead of upcoming fixtures.`,
    `${destinationLabel} have brought in ${targetLabel} as a free agent in an effort to bolster the lineup.`,
    `${targetLabel} has completed a free-agent move to ${destinationLabel}, giving the side additional depth.`,
    `${destinationLabel} add ${targetLabel} to the roster without a transfer fee as they look to improve their squad.`,
    `${targetLabel} becomes ${destinationLabel}'s latest addition after joining the club as a free agent.`,
    `${destinationLabel} have secured the services of ${targetLabel} on a free transfer.`,
    `${targetLabel} has agreed to join ${destinationLabel} as the organization continues to reshape its roster.`,
    `${destinationLabel} bolster their options with the arrival of free agent ${targetLabel}.`,
  ];
  const transferOpeners = [
    `${targetLabel} joins ${destinationLabel} from ${sellerLabel} as ${destinationLabel} look to strengthen their roster.`,
    `${destinationLabel} have completed a move for ${targetLabel} from ${sellerLabel}, adding a new name to their active lineup.`,
    `${targetLabel} has left ${sellerLabel} for ${destinationLabel} in one of the latest roster moves on the market.`,
    `${destinationLabel} bring in ${targetLabel} from ${sellerLabel}, hoping the signing gives them a cleaner look in upcoming matches.`,
    `${targetLabel} makes the switch from ${sellerLabel} to ${destinationLabel} as both teams adjust their lineups.`,
    `${targetLabel} has joined ${destinationLabel} from ${sellerLabel} as the organization looks to reinforce its roster.`,
    `${destinationLabel} have secured ${targetLabel} from ${sellerLabel} in their latest move to strengthen the lineup.`,
    `${targetLabel} has completed a switch from ${sellerLabel} to ${destinationLabel} ahead of the next stretch of competition.`,
    `${destinationLabel} have brought ${targetLabel} over from ${sellerLabel}, adding fresh firepower to their squad.`,
    `${targetLabel} leaves ${sellerLabel} behind for a new chapter with ${destinationLabel}.`,
    `${destinationLabel} turn to ${targetLabel} from ${sellerLabel} as their newest roster addition.`,
    `${targetLabel} has made the jump from ${sellerLabel} to ${destinationLabel} as the roster takes on a new look.`,
    `${destinationLabel} bring ${targetLabel} into the fold following a move from ${sellerLabel}.`,
    `${destinationLabel} have moved for ${targetLabel} from ${sellerLabel} as they look to bolster their active lineup.`,
    `${destinationLabel} welcome ${targetLabel} from ${sellerLabel} as part of their latest roster adjustment.`,
    `${destinationLabel} reinforce their roster with ${targetLabel}, who arrives from ${sellerLabel}.`,
  ];
  const signedFromBenchOpeners = [
    `${destinationLabel} have signed ${targetLabel} from ${sellerLabel}'s bench, handing them a return to active competition.`,
    `${targetLabel} leaves ${sellerLabel}'s bench to join ${destinationLabel} as part of their active lineup.`,
    `${destinationLabel} have brought in ${targetLabel} from ${sellerLabel}, where they had been previously benched.`,
    `${targetLabel} makes the move from ${sellerLabel}'s bench to a starting opportunity with ${destinationLabel}.`,
    `${destinationLabel} have picked up ${targetLabel} from ${sellerLabel}'s inactive setup and added them to their roster.`,
    `${targetLabel} departs the sidelines at ${sellerLabel} to link up with ${destinationLabel}.`,
    `${destinationLabel} have moved for benched ${targetLabel} from ${sellerLabel}, giving them a fresh opportunity in the lineup.`,
    `${targetLabel} joins ${destinationLabel} after spending their recent spell on ${sellerLabel}'s bench.`,
    `${destinationLabel} add ${targetLabel} from ${sellerLabel}'s bench as they reshape their active roster.`,
    `${targetLabel} swaps a bench role at ${sellerLabel} for a place in ${destinationLabel}'s lineup.`,
    ...(benchDuration
      ? [
          `${targetLabel} joins ${destinationLabel} after spending ${benchDuration} on ${sellerLabel}'s bench.`,
          `${destinationLabel} have brought in ${targetLabel} following ${benchDuration} on the sidelines with ${sellerLabel}.`,
          `${targetLabel} leaves ${sellerLabel} for ${destinationLabel} after ${benchDuration} out of the active lineup.`,
          `${destinationLabel} give ${targetLabel} a fresh opportunity after ${benchDuration} on ${sellerLabel}'s bench.`,
          `${targetLabel} returns to active competition with ${destinationLabel} after spending ${benchDuration} on the bench at ${sellerLabel}.`,
        ]
      : []),
  ];
  const freeAgentBackfillOpeners = [
    `${targetLabel} joins ${destinationLabel} as a free agent to fill the gap left by ${backfillPlayerLabel}.`,
    `${destinationLabel} have brought in free agent ${targetLabel} following ${backfillPlayerLabel}'s departure to ${backfillDestinationLabel}.`,
    `${targetLabel} has linked up with ${destinationLabel} after ${backfillPlayerLabel}'s departure opened a spot in the lineup.`,
    `${destinationLabel} turn to ${targetLabel} on a free transfer after ${backfillPlayerLabel} completed a move to ${backfillDestinationLabel}.`,
    `${targetLabel} arrives at ${destinationLabel} without a transfer fee, taking the place vacated by ${backfillPlayerLabel}.`,
    `${destinationLabel} have filled the gap left by ${backfillPlayerLabel}'s move to ${backfillDestinationLabel} with the signing of ${targetLabel}.`,
    `${targetLabel} steps into the opening left by ${backfillPlayerLabel} after joining ${destinationLabel} as a free agent.`,
    `${destinationLabel} add free agent ${targetLabel} after ${backfillPlayerLabel} left the lineup to join ${backfillDestinationLabel}.`,
    `${targetLabel} becomes ${destinationLabel}'s latest addition, filling the roster spot vacated by ${backfillPlayerLabel}.`,
    `${targetLabel} comes into the ${destinationLabel} lineup in the wake of ${backfillPlayerLabel}'s departure to ${backfillDestinationLabel}.`,
    `${destinationLabel} move quickly to replace ${backfillPlayerLabel} with the free-agent signing of ${targetLabel}.`,
    `${targetLabel} fills the vacancy at ${destinationLabel} created by ${backfillPlayerLabel}'s recent move to ${backfillDestinationLabel}.`,
    `The departure of ${backfillPlayerLabel} makes way for ${targetLabel}, who joins ${destinationLabel} on a free transfer.`,
    `${destinationLabel} restore their active lineup with ${targetLabel} after ${backfillPlayerLabel} moved on.`,
    `${backfillPlayerLabel}'s switch to ${backfillDestinationLabel} opens the door for free agent ${targetLabel} to join ${destinationLabel}.`,
  ];
  const transferBackfillOpeners = [
    `${targetLabel} joins ${destinationLabel} from ${sellerLabel} to fill the gap left by ${backfillPlayerLabel}.`,
    `${destinationLabel} have signed ${targetLabel} from ${sellerLabel} following ${backfillPlayerLabel}'s departure to ${backfillDestinationLabel}.`,
    `${targetLabel} makes the switch from ${sellerLabel} to ${destinationLabel} after ${backfillPlayerLabel}'s departure opened a spot in the lineup.`,
    `${destinationLabel} turn to ${targetLabel} from ${sellerLabel} after ${backfillPlayerLabel} completed a move to ${backfillDestinationLabel}.`,
    `${targetLabel} arrives from ${sellerLabel} to take the place vacated by ${backfillPlayerLabel}.`,
    `${destinationLabel} have filled the gap left by ${backfillPlayerLabel}'s move to ${backfillDestinationLabel} with the signing of ${targetLabel} from ${sellerLabel}.`,
    `${targetLabel} steps into the opening left by ${backfillPlayerLabel} after making the move from ${sellerLabel}.`,
    `${destinationLabel} bring in ${targetLabel} from ${sellerLabel} after ${backfillPlayerLabel} left the lineup for ${backfillDestinationLabel}.`,
    `${targetLabel} becomes ${destinationLabel}'s latest signing, filling the roster spot vacated by ${backfillPlayerLabel}.`,
    `${targetLabel} moves from ${sellerLabel} into the ${destinationLabel} lineup in the wake of ${backfillPlayerLabel}'s departure to ${backfillDestinationLabel}.`,
    `${destinationLabel} move quickly to replace ${backfillPlayerLabel} by bringing in ${targetLabel} from ${sellerLabel}.`,
    `${targetLabel} fills the vacancy at ${destinationLabel} created by ${backfillPlayerLabel}'s recent transfer to ${backfillDestinationLabel}.`,
    `${backfillPlayerLabel}'s departure makes way for ${targetLabel}, who arrives at ${destinationLabel} from ${sellerLabel}.`,
    `${destinationLabel} replenish their lineup with ${targetLabel} from ${sellerLabel} after ${backfillPlayerLabel} moved on.`,
    `${backfillPlayerLabel}'s switch to ${backfillDestinationLabel} opens the door for ${targetLabel} to join ${destinationLabel} from ${sellerLabel}.`,
  ];
  const departureOpeners = [
    `${targetLabel} is now available after leaving ${sellerLabel}.`,
    `${targetLabel} has departed ${sellerLabel}, putting another name into the free-agent pool.`,
    `${sellerLabel} move forward without ${targetLabel} after the player's exit from the roster.`,
  ];
  const sourceLine =
    isSignedFromBench && destination && seller
      ? pickVariant(signedFromBenchOpeners, transfer.id + 17)
      : backfillDeparture && destination
        ? pickVariant(
            isFreeAgentSigning ? freeAgentBackfillOpeners : transferBackfillOpeners,
            transfer.id + 17,
          )
        : !isFreeAgentSigning && seller
          ? pickVariant(transferOpeners, transfer.id + 17)
          : destination
            ? pickVariant(freeAgentOpeners, transfer.id + 17)
            : pickVariant(departureOpeners, transfer.id + 17);
  const statLine =
    sourceStats && statsSourceTeam
      ? pickVariant(
          isSignedFromBench
            ? [
                `Before moving to the bench, ${targetAgeLabel} averaged a ${formatRating(sourceStats.rating)} rating across ${sourceStats.maps} map${sourceStats.maps === 1 ? '' : 's'} for ${statsSourceLabel}.`,
                `Prior to being benched, ${targetLabel} posted a ${formatRating(sourceStats.rating)} rating over ${sourceStats.maps} map${sourceStats.maps === 1 ? '' : 's'} with ${statsSourceLabel}.`,
                `${targetAgeSentenceLabel} recorded a ${formatRating(sourceStats.rating)} average across ${sourceStats.maps} map${sourceStats.maps === 1 ? '' : 's'} before being moved out of ${statsSourceLabel}'s active lineup.`,
                `Before their spell on the bench, ${targetLabel} averaged a ${formatRating(sourceStats.rating)} rating across ${sourceStats.maps} map${sourceStats.maps === 1 ? '' : 's'} for ${statsSourceLabel}.`,
                `${targetLabel} had posted a ${formatRating(sourceStats.rating)} rating over ${sourceStats.maps} map${sourceStats.maps === 1 ? '' : 's'} with ${statsSourceLabel} before being benched.`,
                `During their previous run in ${statsSourceLabel}'s active lineup, ${targetAgeLabel} averaged a ${formatRating(sourceStats.rating)} rating across ${sourceStats.maps} map${sourceStats.maps === 1 ? '' : 's'}.`,
                `${targetLabel} leaves ${statsSourceLabel} having previously averaged a ${formatRating(sourceStats.rating)} rating over ${sourceStats.maps} map${sourceStats.maps === 1 ? '' : 's'} before moving to the bench.`,
                `Prior to their benching, ${targetAgeLabel} registered a ${formatRating(sourceStats.rating)} rating across ${sourceStats.maps} map${sourceStats.maps === 1 ? '' : 's'} in ${statsSourceLabel} colors.`,
                `${targetLabel} averaged a ${formatRating(sourceStats.rating)} rating over ${sourceStats.maps} map${sourceStats.maps === 1 ? '' : 's'} during their last stint in ${statsSourceLabel}'s starting lineup.`,
                `Before dropping out of the active roster, ${targetLabel} recorded a ${formatRating(sourceStats.rating)} average across ${sourceStats.maps} map${sourceStats.maps === 1 ? '' : 's'} for ${statsSourceLabel}.`,
                `${targetAgeSentenceLabel} had accumulated a ${formatRating(sourceStats.rating)} rating over ${sourceStats.maps} map${sourceStats.maps === 1 ? '' : 's'} before ${statsSourceLabel} moved them to the bench.`,
                `${targetLabel}'s most recent active stint with ${statsSourceLabel} saw them average a ${formatRating(sourceStats.rating)} rating across ${sourceStats.maps} map${sourceStats.maps === 1 ? '' : 's'}.`,
                `Before spending time on the sidelines, ${targetLabel} posted a ${formatRating(sourceStats.rating)} average across ${sourceStats.maps} map${sourceStats.maps === 1 ? '' : 's'} for ${statsSourceLabel}.`,
                `${targetLabel} entered their bench spell at ${statsSourceLabel} with a ${formatRating(sourceStats.rating)} rating across ${sourceStats.maps} map${sourceStats.maps === 1 ? '' : 's'} played in the active lineup.`,
                `${targetAgeSentenceLabel} averaged a ${formatRating(sourceStats.rating)} rating over ${sourceStats.maps} map${sourceStats.maps === 1 ? '' : 's'} in ${statsSourceLabel}'s lineup before eventually being benched.`,
              ]
            : [
                `${targetLabel} averaged a ${formatRating(sourceStats.rating)} rating across ${sourceStats.maps} map${sourceStats.maps === 1 ? '' : 's'} during the ${statsSourceLabel} stint.`,
                `${targetLabel} posted an average rating of ${formatRating(sourceStats.rating)} over ${sourceStats.maps} map${sourceStats.maps === 1 ? '' : 's'} with ${statsSourceLabel}.`,
                `During the ${statsSourceLabel} stint, ${targetLabel} recorded a ${formatRating(sourceStats.rating)} average rating across ${sourceStats.maps} map${sourceStats.maps === 1 ? '' : 's'}.`,
                `${targetLabel} finished their spell with ${statsSourceLabel} with a ${formatRating(sourceStats.rating)} rating across ${sourceStats.maps} map${sourceStats.maps === 1 ? '' : 's'}.`,
                `Across ${sourceStats.maps} map${sourceStats.maps === 1 ? '' : 's'} for ${statsSourceLabel}, ${targetLabel} averaged a ${formatRating(sourceStats.rating)} rating.`,
                `${targetLabel} registered a ${formatRating(sourceStats.rating)} average rating over ${sourceStats.maps} map${sourceStats.maps === 1 ? '' : 's'} during their stint with ${statsSourceLabel}.`,
                `In ${sourceStats.maps} map${sourceStats.maps === 1 ? '' : 's'} played for ${statsSourceLabel}, ${targetLabel} averaged a ${formatRating(sourceStats.rating)} rating.`,
                `${targetLabel} maintained a ${formatRating(sourceStats.rating)} average rating across ${sourceStats.maps} map${sourceStats.maps === 1 ? '' : 's'} while representing ${statsSourceLabel}.`,
                `During their run with ${statsSourceLabel}, ${targetLabel} averaged a ${formatRating(sourceStats.rating)} rating over ${sourceStats.maps} map${sourceStats.maps === 1 ? '' : 's'}.`,
                `${targetLabel} put up a ${formatRating(sourceStats.rating)} average rating across ${sourceStats.maps} map${sourceStats.maps === 1 ? '' : 's'} in ${statsSourceLabel} colors.`,
                `${targetLabel} produced a ${formatRating(sourceStats.rating)} rating on average across ${sourceStats.maps} map${sourceStats.maps === 1 ? '' : 's'} for ${statsSourceLabel}.`,
                `Over the course of ${sourceStats.maps} map${sourceStats.maps === 1 ? '' : 's'} with ${statsSourceLabel}, ${targetLabel} averaged a ${formatRating(sourceStats.rating)} rating.`,
                `${targetLabel} ended their ${statsSourceLabel} tenure averaging a ${formatRating(sourceStats.rating)} rating across ${sourceStats.maps} map${sourceStats.maps === 1 ? '' : 's'}.`,
                `${targetLabel} recorded a ${formatRating(sourceStats.rating)} rating across ${sourceStats.maps} map${sourceStats.maps === 1 ? '' : 's'} during their spell with ${statsSourceLabel}.`,
                `The ${statsSourceLabel} stint saw ${targetLabel} average a ${formatRating(sourceStats.rating)} rating over ${sourceStats.maps} map${sourceStats.maps === 1 ? '' : 's'}.`,
              ],
          transfer.id + 31,
        )
      : null;
  const sourceStatsAddonLine =
    sourceStats && destination
      ? pickVariant(
          {
            GREAT: [
              `${targetAgeSentenceLabel} will look to carry their strong form into their new surroundings.`,
              `${targetAgeSentenceLabel} hopes to maintain their level of performance under the new banner.`,
              `${targetAgeSentenceLabel} will aim to build on their impressive form with ${destinationLabel}.`,
              `${targetAgeSentenceLabel} hopes to keep their momentum going in the new jersey.`,
              `${targetAgeSentenceLabel} will look to continue delivering at a high level for ${destinationLabel}.`,
              `${targetAgeSentenceLabel} hopes their strong run of form carries over to the new lineup.`,
              `${targetAgeSentenceLabel} will aim to replicate their previous performances with ${destinationLabel}.`,
              `${targetAgeSentenceLabel} hopes to remain a consistent performer in their new colors.`,
              `${targetAgeSentenceLabel} will look to pick up where they left off after joining ${destinationLabel}.`,
              `${targetAgeSentenceLabel} hopes to bring the same level of impact to their new team.`,
            ],
            GOOD: [
              `${targetAgeSentenceLabel} will look to take another step forward under the new banner.`,
              `${targetAgeSentenceLabel} hopes to further develop their game with ${destinationLabel}.`,
              `${targetAgeSentenceLabel} will aim to improve on their previous level in the new lineup.`,
              `${targetAgeSentenceLabel} hopes the move can help elevate their performances further.`,
              `${targetAgeSentenceLabel} will look to build on their solid showing with ${statsSourceLabel}.`,
              `${targetAgeSentenceLabel} hopes to reach another level in their new surroundings.`,
              `${targetAgeSentenceLabel} will aim to continue progressing as part of ${destinationLabel}.`,
              `${targetAgeSentenceLabel} hopes the new environment can bring further improvement.`,
              `${targetAgeSentenceLabel} will look to build on their previous form in the ${destinationLabel} jersey.`,
              `${targetAgeSentenceLabel} hopes to raise their level after making the switch to ${destinationLabel}.`,
            ],
            MIXED: [
              `${targetAgeSentenceLabel} will look to sharpen their game under the new banner.`,
              `${targetAgeSentenceLabel} hopes to develop further in their new surroundings.`,
              `${targetAgeSentenceLabel} will aim to strengthen their performances with ${destinationLabel}.`,
              `${targetAgeSentenceLabel} hopes the move provides an opportunity to take their game forward.`,
              `${targetAgeSentenceLabel} will look to make further strides as part of the new lineup.`,
              `${targetAgeSentenceLabel} hopes to refine their game during their time with ${destinationLabel}.`,
              `${targetAgeSentenceLabel} will aim to unlock more of their potential under the new banner.`,
              `${targetAgeSentenceLabel} hopes a change of scenery can help improve their level.`,
              `${targetAgeSentenceLabel} will look to grow into a stronger contributor for ${destinationLabel}.`,
              `${targetAgeSentenceLabel} hopes to make progress and establish themselves in the new lineup.`,
            ],
            POOR: [
              `${targetAgeSentenceLabel} will look to rediscover their form with ${destinationLabel}.`,
              `${targetAgeSentenceLabel} hopes a fresh start can help turn their performances around.`,
              `${targetAgeSentenceLabel} will aim to bounce back in their new surroundings.`,
              `${targetAgeSentenceLabel} hopes the move to ${destinationLabel} can spark an upturn in form.`,
              `${targetAgeSentenceLabel} will look to get back on track under the new banner.`,
              `${targetAgeSentenceLabel} hopes a new environment can help them regain their footing.`,
              `${targetAgeSentenceLabel} will aim to put their previous struggles behind them at ${destinationLabel}.`,
              `${targetAgeSentenceLabel} hopes to find renewed form after making the switch.`,
              `${targetAgeSentenceLabel} will look to reset and improve upon their recent performances.`,
              `${targetAgeSentenceLabel} hopes their new chapter with ${destinationLabel} can bring stronger results.`,
            ],
          }[getRatingBucket(sourceStats.rating)],
          transfer.id + 41,
        )
      : null;
  const sourceStatsParagraph = [statLine, sourceStatsAddonLine].filter(Boolean).join(' ') || null;
  const awperLine =
    destination && benchedPlayer && isAwper(target) && isAwper(benchedPlayer)
      ? pickVariant(
          [
            `${destinationLabel} will retain their AWP setup, with ${targetAgeLabel} replacing fellow sniper ${benchedLabel}.`,
            `${destinationLabel} have found their new AWPer, bringing in ${targetAgeLabel} to take over from ${benchedLabel}.`,
            `${targetAgeSentenceLabel} steps into the AWP role for ${destinationLabel}, replacing fellow AWPer ${benchedLabel}.`,
            `${destinationLabel} keep the AWP position unchanged in structure, with ${targetAgeLabel} coming in for ${benchedLabel}.`,
            `${destinationLabel} have opted for an AWP change, replacing ${benchedLabel} with ${targetAgeLabel}.`,
            `${targetAgeSentenceLabel} takes over ${destinationLabel}'s AWP duties from ${benchedLabel}.`,
            `${destinationLabel} remain committed to the AWP role as ${targetAgeLabel} replaces ${benchedLabel} in the lineup.`,
            `${targetAgeSentenceLabel} joins ${destinationLabel} as the new AWPer, taking the place of ${benchedLabel}.`,
            `${destinationLabel} make a direct change in the AWP position, bringing ${targetAgeLabel} in for ${benchedLabel}.`,
            `${targetAgeSentenceLabel} is set to assume AWP responsibilities for ${destinationLabel} following ${benchedLabel}'s departure.`,
            `${destinationLabel} swap one AWPer for another, with ${targetAgeLabel} arriving to replace ${benchedLabel}.`,
          ],
          transfer.id + 43,
        )
      : null;
  const trophyList = formatLinkedList(
    sellerTitles.map((title) => competitionLink(title.competition)),
  );
  const titlesLine = sellerTitles.length
    ? pickVariant(
        [
          `${targetLabel} also departs with silverware to their name after ${sellerLabel}'s recent triumph at ${trophyList}.`,
          `${targetLabel} leaves ${sellerLabel} on the back of a recent title win at ${trophyList}.`,
          `The move also sees ${targetLabel} leave behind a trophy-winning side, with ${sellerLabel} recently claiming ${trophyList}.`,
          `${targetLabel} exits ${sellerLabel} after helping the team secure the title at ${trophyList}.`,
          `${targetLabel}'s stint with ${sellerLabel} also included recent silverware at ${trophyList}.`,
          `${targetLabel} departs ${sellerLabel} shortly after the team's victory at ${trophyList}.`,
          `The ${sellerLabel} chapter ends with silverware for ${targetLabel} following the recent ${trophyList} win.`,
          `${targetLabel} leaves ${sellerLabel} as a recent champion, having won ${trophyList} with the team.`,
          `${targetLabel} moves on from ${sellerLabel} after adding ${trophyList} to their list of achievements.`,
          `${targetLabel}'s departure comes after ${sellerLabel} recently lifted the trophy at ${trophyList}.`,
        ],
        transfer.id + 47,
      )
    : null;
  const identityLine =
    sellerIdentity.isNational && destinationIdentity.isInternational && destination
      ? pickVariant(
          [
            `The move also sees ${targetLabel} transition from a largely national lineup into ${destinationLabel}'s international roster.`,
            `${targetLabel} will also have to adjust from a domestic roster environment to ${destinationLabel}'s international lineup.`,
            `The switch brings a new challenge for ${targetLabel}, who moves from a more national setup into ${destinationLabel}'s international roster.`,
            `${targetLabel} now faces the task of adapting from a predominantly national team to ${destinationLabel}'s multinational lineup.`,
            `The move marks a shift for ${targetLabel} from a more locally focused roster to ${destinationLabel}'s international setup.`,
            `${targetLabel} will need to adapt to a more international environment after leaving ${sellerLabel}'s largely national lineup.`,
            `The transfer also takes ${targetLabel} from a familiar national core into ${destinationLabel}'s more internationally composed roster.`,
            `${targetLabel} enters a different team environment, moving from a mostly national lineup to ${destinationLabel}'s international squad.`,
            `The switch to ${destinationLabel} also requires ${targetLabel} to adjust to an international roster after playing in a more national setup.`,
            `${targetLabel} trades a predominantly national team structure for ${destinationLabel}'s international lineup, adding another layer of adaptation to the move.`,
          ],
          transfer.id + 53,
        )
      : sellerIdentity.isInternational && destinationIdentity.isNational && destination
        ? pickVariant(
            [
              `The move also gives ${targetLabel} the chance to return to a national lineup with ${destinationLabel}.`,
              `${targetLabel} will now be able to compete in a more familiar national setup once again.`,
              `The switch sees ${targetLabel} return to a national roster after time spent in an international lineup.`,
              `${targetLabel} now gets the opportunity to play within a national core again at ${destinationLabel}.`,
              `The move brings ${targetLabel} back into a predominantly national environment with ${destinationLabel}.`,
              `${targetLabel} will once again be part of a national lineup following the move to ${destinationLabel}.`,
              `The transfer offers ${targetLabel} a return to a more familiar national team structure.`,
              `${targetLabel} now rejoins a national setup, moving away from the international roster environment at ${sellerLabel}.`,
              `The switch allows ${targetLabel} to return to playing alongside a largely national core.`,
              `${targetLabel} will now have the opportunity to settle back into a national roster with ${destinationLabel}.`,
            ],
            transfer.id + 59,
          )
        : null;
  const regionLine =
    seller?.country?.continent?.code &&
    destination?.country?.continent?.code &&
    seller.country.continent.code !== destination.country.continent.code
      ? `${targetLabel} will be changing regions as well, moving from ${seller.country.continent.name} to ${destination.country.continent.name}.`
      : null;
  const benchedLine = benchedPlayer
    ? benchedStats
      ? pickVariant(
          {
            GREAT: [
              `${benchedLabel} moves to the bench despite averaging a strong ${formatRating(benchedStats.rating)} rating across ${benchedStats.maps} map${benchedStats.maps === 1 ? '' : 's'} for ${destinationLabel}.`,
              `${benchedLabel} steps out of the starting lineup after posting a ${formatRating(benchedStats.rating)} rating over ${benchedStats.maps} map${benchedStats.maps === 1 ? '' : 's'} for ${destinationLabel}.`,
              `${destinationLabel} move ${benchedLabel} to the bench despite a ${formatRating(benchedStats.rating)} average across ${benchedStats.maps} map${benchedStats.maps === 1 ? '' : 's'}.`,
              `${benchedLabel} heads to the bench after maintaining a ${formatRating(benchedStats.rating)} rating through ${benchedStats.maps} map${benchedStats.maps === 1 ? '' : 's'} with ${destinationLabel}.`,
              `${benchedLabel} is shifted to the bench despite producing a ${formatRating(benchedStats.rating)} rating across ${benchedStats.maps} map${benchedStats.maps === 1 ? '' : 's'}.`,
              `${benchedLabel} leaves the active lineup with a ${formatRating(benchedStats.rating)} average from ${benchedStats.maps} map${benchedStats.maps === 1 ? '' : 's'} played for ${destinationLabel}.`,
              `The change sends ${benchedLabel} to the bench after a strong ${formatRating(benchedStats.rating)} rating over ${benchedStats.maps} map${benchedStats.maps === 1 ? '' : 's'}.`,
              `${benchedLabel} gives up their starting spot despite recording a ${formatRating(benchedStats.rating)} rating across ${benchedStats.maps} map${benchedStats.maps === 1 ? '' : 's'} for ${destinationLabel}.`,
              `${destinationLabel} bench ${benchedLabel} after ${benchedStats.maps} map${benchedStats.maps === 1 ? '' : 's'} in which they averaged a ${formatRating(benchedStats.rating)} rating.`,
              `${benchedLabel} moves out of the lineup while carrying a ${formatRating(benchedStats.rating)} rating across ${benchedStats.maps} map${benchedStats.maps === 1 ? '' : 's'} for ${destinationLabel}.`,
            ],
            GOOD: [
              `${benchedLabel} moves to the bench after posting a solid ${formatRating(benchedStats.rating)} rating across ${benchedStats.maps} map${benchedStats.maps === 1 ? '' : 's'} for ${destinationLabel}.`,
              `${benchedLabel} steps aside from the active lineup with a ${formatRating(benchedStats.rating)} average over ${benchedStats.maps} map${benchedStats.maps === 1 ? '' : 's'}.`,
              `${destinationLabel} move ${benchedLabel} to the bench following a ${formatRating(benchedStats.rating)} rating across ${benchedStats.maps} map${benchedStats.maps === 1 ? '' : 's'}.`,
              `${benchedLabel} heads to the bench after recording a respectable ${formatRating(benchedStats.rating)} rating over ${benchedStats.maps} map${benchedStats.maps === 1 ? '' : 's'}.`,
              `${benchedLabel} is removed from the starting lineup after averaging ${formatRating(benchedStats.rating)} across ${benchedStats.maps} map${benchedStats.maps === 1 ? '' : 's'} for ${destinationLabel}.`,
              `${benchedLabel} takes a place on the bench after putting up a ${formatRating(benchedStats.rating)} rating through ${benchedStats.maps} map${benchedStats.maps === 1 ? '' : 's'}.`,
              `The roster change sees ${benchedLabel} benched after a ${formatRating(benchedStats.rating)} average across ${benchedStats.maps} map${benchedStats.maps === 1 ? '' : 's'}.`,
              `${benchedLabel} leaves the active five having registered a ${formatRating(benchedStats.rating)} rating over ${benchedStats.maps} map${benchedStats.maps === 1 ? '' : 's'}.`,
              `${destinationLabel} shift ${benchedLabel} to the bench after a solid ${benchedStats.maps}-map run at a ${formatRating(benchedStats.rating)} rating.`,
              `${benchedLabel} moves out of the lineup after delivering a ${formatRating(benchedStats.rating)} average across ${benchedStats.maps} map${benchedStats.maps === 1 ? '' : 's'} for ${destinationLabel}.`,
            ],
            MIXED: [
              `${benchedLabel} moves to the bench after averaging a ${formatRating(benchedStats.rating)} rating across ${benchedStats.maps} map${benchedStats.maps === 1 ? '' : 's'} for ${destinationLabel}.`,
              `${benchedLabel} steps out of the lineup following a ${formatRating(benchedStats.rating)} rating over ${benchedStats.maps} map${benchedStats.maps === 1 ? '' : 's'}.`,
              `${destinationLabel} move ${benchedLabel} to the bench after ${benchedStats.maps} map${benchedStats.maps === 1 ? '' : 's'} at a ${formatRating(benchedStats.rating)} average.`,
              `${benchedLabel} heads to the bench after posting a ${formatRating(benchedStats.rating)} rating throughout ${benchedStats.maps} map${benchedStats.maps === 1 ? '' : 's'} for ${destinationLabel}.`,
              `${benchedLabel} is shifted out of the active lineup after recording a ${formatRating(benchedStats.rating)} rating across ${benchedStats.maps} map${benchedStats.maps === 1 ? '' : 's'}.`,
              `${benchedLabel} takes a place on the bench following a ${benchedStats.maps}-map stint at a ${formatRating(benchedStats.rating)} rating.`,
              `The change sees ${benchedLabel} leave the starting lineup after averaging ${formatRating(benchedStats.rating)} over ${benchedStats.maps} map${benchedStats.maps === 1 ? '' : 's'}.`,
              `${benchedLabel} moves to the sidelines after registering a ${formatRating(benchedStats.rating)} rating across ${benchedStats.maps} map${benchedStats.maps === 1 ? '' : 's'} for ${destinationLabel}.`,
              `${destinationLabel} bench ${benchedLabel} following a ${formatRating(benchedStats.rating)} average over their last ${benchedStats.maps} map${benchedStats.maps === 1 ? '' : 's'}.`,
              `${benchedLabel} drops out of the active lineup after a ${benchedStats.maps}-map spell at a ${formatRating(benchedStats.rating)} rating.`,
            ],
            POOR: [
              `${benchedLabel} moves to the bench after struggling to a ${formatRating(benchedStats.rating)} rating across ${benchedStats.maps} map${benchedStats.maps === 1 ? '' : 's'} for ${destinationLabel}.`,
              `${benchedLabel} drops out of the starting lineup after posting a ${formatRating(benchedStats.rating)} rating over ${benchedStats.maps} map${benchedStats.maps === 1 ? '' : 's'}.`,
              `${destinationLabel} move ${benchedLabel} to the bench following a difficult ${benchedStats.maps}-map stretch at a ${formatRating(benchedStats.rating)} rating.`,
              `${benchedLabel} heads to the bench after managing a ${formatRating(benchedStats.rating)} average across ${benchedStats.maps} map${benchedStats.maps === 1 ? '' : 's'}.`,
              `${benchedLabel} is removed from the active lineup after recording a ${formatRating(benchedStats.rating)} rating over ${benchedStats.maps} map${benchedStats.maps === 1 ? '' : 's'}.`,
              `${benchedLabel} takes a place on the bench after a challenging run that produced a ${formatRating(benchedStats.rating)} rating across ${benchedStats.maps} map${benchedStats.maps === 1 ? '' : 's'}.`,
              `The roster change sees ${benchedLabel} benched following a ${formatRating(benchedStats.rating)} average over ${benchedStats.maps} map${benchedStats.maps === 1 ? '' : 's'}.`,
              `${benchedLabel} loses their starting spot after posting a ${formatRating(benchedStats.rating)} rating across ${benchedStats.maps} map${benchedStats.maps === 1 ? '' : 's'} for ${destinationLabel}.`,
              `${destinationLabel} shift ${benchedLabel} to the bench after their ${formatRating(benchedStats.rating)} rating over ${benchedStats.maps} map${benchedStats.maps === 1 ? '' : 's'} fell short of expectations.`,
              `${benchedLabel} moves out of the active lineup following a difficult spell of ${benchedStats.maps} map${benchedStats.maps === 1 ? '' : 's'} at a ${formatRating(benchedStats.rating)} rating.`,
            ],
          }[getRatingBucket(benchedStats.rating)],
          transfer.id + 61,
        )
      : !awperLine
        ? pickVariant(
            [
              `${benchedLabel} is set to move to the bench as ${destinationLabel} open up a spot for their new signing.`,
              `${benchedLabel} is expected to step down from the active lineup to make way for ${targetLabel}.`,
              `${destinationLabel} are expected to move ${benchedLabel} to the bench following the arrival of ${targetLabel}.`,
              `${benchedLabel} is set to give up their place in the starting lineup as ${destinationLabel} accommodate the new addition.`,
              `${benchedLabel} is expected to shift to the bench as ${destinationLabel} reshape their active roster.`,
              `The signing is set to send ${benchedLabel} to the bench as ${destinationLabel} adjust their lineup.`,
              `${benchedLabel} is expected to make way in the active roster following ${destinationLabel}'s latest addition.`,
              `${destinationLabel} are set to bench ${benchedLabel} to create room for the incoming ${targetLabel}.`,
              `${benchedLabel} is expected to step aside from the starting lineup as the new signing slots into the roster.`,
              `The roster change is expected to see ${benchedLabel} move to the bench to accommodate ${targetLabel}.`,
              `${benchedLabel} is set to leave the active five as ${destinationLabel} make space for their newest recruit.`,
              `${destinationLabel}'s latest signing is expected to result in ${benchedLabel} moving to the bench.`,
              `${benchedLabel} is poised to move to the sidelines as ${destinationLabel} integrate their new addition.`,
              `The arrival of ${targetLabel} is expected to push ${benchedLabel} to the bench in ${destinationLabel}'s updated lineup.`,
              `${benchedLabel} is set to exit the starting lineup as ${destinationLabel} make room for their latest roster addition.`,
            ],
            transfer.id + 62,
          )
        : null
    : null;
  const upcomingLine = upcomingMatches.length
    ? (() => {
        const match = upcomingMatches[0];
        const opponent = match.competitors.find(
          (competitor) => competitor.teamId !== destination?.id,
        );
        const opponentLabel = opponent?.team ? teamLink(opponent.team) : 'their next opponent';
        const competitionName = match.competition
          ? getCompetitionNewsName(match.competition)
          : 'their next competition';
        return pickVariant(
          [
            `The new roster will make its debut against ${opponentLabel} in ${competitionName}.`,
            `${destinationLabel}'s revamped lineup will first take the server against ${opponentLabel} in ${competitionName}.`,
            `The new-look roster is set to debut against ${opponentLabel} in ${competitionName}.`,
            `${destinationLabel} will unveil their new lineup against ${opponentLabel} in ${competitionName}.`,
            `The roster's first outing will come against ${opponentLabel} in ${competitionName}.`,
            `${destinationLabel}'s new five will get their first test against ${opponentLabel} in ${competitionName}.`,
            `The refreshed lineup will make its first appearance against ${opponentLabel} in ${competitionName}.`,
            `${destinationLabel}'s new roster will be put to the test against ${opponentLabel} in ${competitionName}.`,
            `The rebuilt lineup will first see action against ${opponentLabel} in ${competitionName}.`,
            `${destinationLabel} will field their new roster for the first time against ${opponentLabel} in ${competitionName}.`,
            `The new lineup's competitive debut will come against ${opponentLabel} in ${competitionName}.`,
            `${destinationLabel}'s latest roster iteration will open against ${opponentLabel} in ${competitionName}.`,
            `The revamped squad will begin its run against ${opponentLabel} in ${competitionName}.`,
            `${destinationLabel}'s new-look side will face ${opponentLabel} in ${competitionName} for its first official outing.`,
            `The first challenge for ${destinationLabel}'s new roster will be ${opponentLabel} in ${competitionName}.`,
          ],
          transfer.id + 71,
        );
      })()
    : null;
  const rosterLines = destination
    ? [
        `${destinationLabel} are now:`,
        '',
        ...destinationStarters.map(
          (player) => `- :flag_${toFlagCode(player.country?.code) || 'xx'}: ${playerLink(player)}`,
        ),
        '',
        ...destinationBench.map(
          (player) =>
            `- :flag_${toFlagCode(player.country?.code) || 'xx'}: ${playerLink(player)} *(benched)*`,
        ),
      ]
    : [];
  const rosterBlock = rosterLines.length ? rosterLines.join('\n') : null;
  const paragraphs = [
    sourceLine,
    feeLine,
    awperLine,
    sourceStatsParagraph,
    titlesLine,
    identityLine,
    regionLine,
    benchedLine,
    upcomingLine,
    rosterBlock,
  ].filter((line) => line != null);
  const type = isTopTeamTransfer ? 'ARTICLE' : 'SHORT';

  return {
    type,
    topic: 'TRANSFERS',
    headline,
    summary: destination
      ? isTopTeamTransfer
        ? pickVariant(
            [
              `${targetName} is at the center of a notable roster move involving ${destinationName}.`,
              `${targetName} headlines the latest roster change at ${destinationName}.`,
              `${targetName} becomes the latest piece in ${destinationName}'s roster shake-up.`,
              `${destinationName} make a significant roster move with the addition of ${targetName}.`,
              `${targetName} lands at ${destinationName} in one of the latest moves among the game's leading sides.`,
              `${targetName} is involved in a notable lineup change at ${destinationName}.`,
              `${destinationName} turn to ${targetName} in their latest high-profile roster move.`,
              `${targetName} takes center stage in ${destinationName}'s latest lineup adjustment.`,
              `${targetName} joins ${destinationName} as the ranked side reshapes its roster.`,
              `${destinationName} add ${targetName} in a move involving one of the scene's established teams.`,
              `${targetName} becomes part of ${destinationName}'s latest push to refresh their lineup.`,
              `A notable roster change sees ${targetName} link up with ${destinationName}.`,
              `${targetName} joins the ranks of ${destinationName} in a significant change to their lineup.`,
              `${destinationName} shake up their roster with the arrival of ${targetName}.`,
              `${targetName} is the focal point of ${destinationName}'s latest roster overhaul.`,
              `${destinationName} bring ${targetName} aboard as they make changes at the upper end of the rankings.`,
              `${targetName} enters the fold at ${destinationName} in another notable move on the competitive scene.`,
              `${targetName} is on the move as ${destinationName} alter their ranked roster.`,
              `${destinationName} make their latest move in the competitive rankings with the addition of ${targetName}.`,
              `${targetName} finds a new home at ${destinationName} as the organization refreshes its lineup.`,
            ],
            transfer.id + 73,
          )
        : pickVariant(
            [
              `${targetName} has changed teams in the latest round of roster moves.`,
              `${targetName} is on the move after joining a new team.`,
              `${targetName} has found a new home in the latest transfer window.`,
              `${targetName} makes the switch to a new organization.`,
              `${targetName} is set for a new chapter after changing teams.`,
              `${targetName} has completed a move to a new lineup.`,
              `${targetName} joins a new team as the transfer market continues to move.`,
              `${targetName} has landed at a new organization following their latest move.`,
              `${targetName} switches sides in the latest roster change.`,
              `${targetName} is headed to a new team following a transfer.`,
              `${targetName} has made their next move on the competitive scene.`,
              `${targetName} links up with a new roster in the latest transfer activity.`,
              `${targetName} begins a fresh chapter with a new organization.`,
              `${targetName} has secured a place on a new roster.`,
              `${targetName} moves on to a new team in the latest lineup shuffle.`,
              `${targetName} is among the latest names to change teams.`,
              `${targetName} takes the next step in their career with a new roster.`,
              `${targetName} has switched organizations as teams continue adjusting their lineups.`,
              `${targetName} joins a new setup following the latest market movement.`,
              `${targetName} is the subject of another move in the ongoing roster shuffle.`,
            ],
            transfer.id + 79,
          )
      : `${targetName} has left ${sellerName} and is now available.`,
    body: paragraphs.join('\n\n'),
    image: playerImage(target, mainTeam),
    priority: 0,
    eventKey: `${AUTO_EVENT_PREFIX}:transfer:${transfer.id}`,
    payload: {
      transferId: transfer.id,
      playerId: target.id,
      teamId: destination?.id || seller?.id,
      teamIds: [destination?.id, isFreeAgentSigning ? null : seller?.id].filter(Boolean),
      flagCode: toFlagCode(target.country?.code),
      comments: buildTransferComments({
        benchedPlayer,
        destination,
        isArticle: type === 'ARTICLE',
        seed: transfer.id,
        seller: isFreeAgentSigning ? null : seller,
        target,
      }),
      relatedPlayers: [toRelatedPlayer(target), toRelatedPlayer(benchedPlayer)].filter(Boolean),
      relatedTeams: [
        toRelatedTeam(destination),
        isFreeAgentSigning ? null : toRelatedTeam(seller),
      ].filter(Boolean),
    },
    publishedAt: articleDate,
  };
}

async function createDrafts(drafts: NewsDraft[]) {
  const eventKeys = drafts.map((draft) => draft.eventKey);
  const existingItems = await DatabaseClient.prisma.newsItem.findMany({
    select: {
      eventKey: true,
      id: true,
    },
    where: {
      eventKey: {
        in: eventKeys,
      },
    },
  });
  const existingItemsByEventKey = new Map(existingItems.map((item) => [item.eventKey, item]));
  const created = [];

  for (const draft of drafts) {
    const existing = existingItemsByEventKey.get(draft.eventKey);

    if (existing) {
      await DatabaseClient.prisma.newsItem.update({
        data: {
          ...draft,
          payload: draft.payload ? JSON.stringify(draft.payload) : null,
        },
        where: {
          id: existing.id,
        },
      });
      continue;
    }

    const item = await DatabaseClient.prisma.newsItem.create({
      data: {
        ...draft,
        payload: draft.payload ? JSON.stringify(draft.payload) : null,
      },
    });

    created.push(item);
  }

  return created;
}

async function pruneNonTransferGeneratedItems() {
  await DatabaseClient.prisma.newsItem.deleteMany({
    where: {
      OR: [
        {
          eventKey: {
            startsWith: `${AUTO_EVENT_PREFIX}:match:`,
          },
        },
        {
          eventKey: {
            startsWith: `${AUTO_EVENT_PREFIX}:qualifier:`,
          },
        },
        {
          eventKey: {
            startsWith: `${AUTO_EVENT_PREFIX}:esea-recap:`,
          },
        },
        {
          eventKey: {
            startsWith: `${AUTO_EVENT_PREFIX}:competition-roundup:`,
          },
        },
        {
          eventKey: {
            startsWith: `${PROTOTYPE_EVENT_PREFIX}:ranking:`,
          },
        },
      ],
    },
  });
}

export async function generateAutomaticItems(date?: Date) {
  const profile = await DatabaseClient.prisma.profile.findFirst();
  const publishedAt = date || profile?.date || new Date();
  const topTeamIds = await getTopTeamIds();
  const includeStatistics = Boolean(profile?.simulateNpcMatchStats);

  if (includeStatistics) {
    await backfillMissingMatchPlayerGameStats();
  }

  await pruneNonTransferGeneratedItems();
  const transfers = await getCompletedTransfersForNews();
  const drafts = (
    await Promise.all(
      transfers.map((transfer) =>
        buildTransferDraft(transfer, transfers, topTeamIds, publishedAt, includeStatistics),
      ),
    )
  ).filter(Boolean) as NewsDraft[];

  return createDrafts(drafts);
}

export async function generatePrototypeItems() {
  return generateAutomaticItems();
}

export async function clearPrototypeItems() {
  return DatabaseClient.prisma.newsItem.deleteMany({
    where: {
      OR: [
        {
          eventKey: {
            startsWith: `${PROTOTYPE_EVENT_PREFIX}:`,
          },
        },
        {
          eventKey: {
            startsWith: `${AUTO_EVENT_PREFIX}:`,
          },
        },
      ],
    },
  });
}

export function getDefaultNewsQuery(): Prisma.NewsItemFindManyArgs {
  return {
    orderBy: [{ publishedAt: 'desc' }, { id: 'asc' }],
    take: 100,
  };
}
