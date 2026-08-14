import { endOfDay, format, startOfDay } from 'date-fns';
import { Prisma } from '@prisma/client';
import { Constants, Util } from '@liga/shared';
import DatabaseClient from './database-client';
import { findCompetitionMvps, getCompetitionMvpStageCompetitionIds } from './competition-mvps';
import { backfillMissingMatchPlayerGameStats } from './match-player-game-stats';
import { getThankYouGraphic, getWelcomeGraphic } from './news-welcome-graphics';

const PROTOTYPE_EVENT_PREFIX = 'prototype-news';
const AUTO_EVENT_PREFIX = 'auto-news';
const TOP_TRANSFER_TEAM_COUNT = 30;
const MAIN_TIER_INDEX = Constants.Prestige.indexOf(Constants.TierSlug.LEAGUE_MAIN);
const ADVANCED_TIER_INDEX = Constants.Prestige.indexOf(Constants.TierSlug.LEAGUE_ADVANCED);
const PRO_TIER_INDEX = Constants.Prestige.indexOf(Constants.TierSlug.LEAGUE_PRO);
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
type CompetitionMvpSeed = Awaited<ReturnType<typeof findCompetitionMvps>>[number];

type NewsCompetition = NonNullable<MatchSeed['competition']>;
type MvpContender = {
  playerId: number;
  playerName: string;
  rating: number;
  maps: number;
};
type MvpContenderGameRow = {
  playerId: number;
  playerName: string;
  kills: bigint | number;
  assists: bigint | number;
  deaths: bigint | number;
};
type MapPoolNewsEntry = {
  id: number;
  position: number | null;
  gameMap: {
    name: string;
  };
};

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
  majorWins = 0,
) {
  if (majorWins > 0) {
    const title = majorWins === 1 ? 'Major Winner' : `${majorWins}x Major Winner`;

    return `${sentenceStart ? 'The' : 'the'} ${title}`;
  }

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

function getCompetitionLogo(
  competition?: {
    federation: { slug: string };
    location?: string | null;
    organizer?: string | null;
    tier: { slug: string };
  } | null,
) {
  if (!competition) {
    return 'resources://competitions/league-pro-world.png';
  }

  return Util.getCompetitionLogo(competition.tier.slug, competition.federation.slug, {
    location: competition.location,
    organizer: competition.organizer,
  });
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

function findContinuousCareerSpellForTeam(
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
  if (!teamId || !player.careerStints?.length) {
    return null;
  }

  const lookupDate = date ? startOfDay(new Date(date)) : null;
  const stints = player.careerStints
    .filter((stint) => (lookupDate ? new Date(stint.startedAt) <= endOfDay(lookupDate) : true))
    .slice()
    .sort((a, b) => {
      const timeDiff = new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime();

      return (
        timeDiff ||
        new Date(a.endedAt || a.startedAt).getTime() - new Date(b.endedAt || b.startedAt).getTime()
      );
    });
  const anchorIndex = (() => {
    for (let index = stints.length - 1; index >= 0; index -= 1) {
      const stint = stints[index];

      if (stint.teamId !== teamId) {
        continue;
      }

      if (!lookupDate) {
        return index;
      }

      const startedAt = new Date(stint.startedAt);
      const endedAt = stint.endedAt ? new Date(stint.endedAt) : null;

      if (startedAt <= endOfDay(lookupDate) && (!endedAt || endedAt >= lookupDate)) {
        return index;
      }
    }

    return -1;
  })();

  if (anchorIndex < 0) {
    return null;
  }

  let firstIndex = anchorIndex;

  while (firstIndex > 0) {
    const previous = stints[firstIndex - 1];
    const current = stints[firstIndex];

    if (previous.teamId !== teamId) {
      break;
    }

    const previousEndedAt = previous.endedAt ? new Date(previous.endedAt) : null;
    const currentStartedAt = startOfDay(new Date(current.startedAt));

    if (!previousEndedAt || previousEndedAt < new Date(currentStartedAt.getTime() - 86_400_000)) {
      break;
    }

    firstIndex -= 1;
  }

  const spellStints = stints.slice(firstIndex, anchorIndex + 1);
  const firstStint = spellStints[0];
  const anchorStint = spellStints.at(-1);

  return firstStint && anchorStint
    ? {
        endedAt: lookupDate || anchorStint.endedAt || new Date(),
        startedAt: firstStint.startedAt,
        stints: spellStints,
        currentStint: anchorStint,
      }
    : null;
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

function formatContractDuration(startedAt?: Date | string | null, endedAt?: Date | string | null) {
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

  if (days < 720) {
    const months = Math.min(23, Math.max(2, Math.round(days / 30)));
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

function stylizeMapName(map: string) {
  const explicitNames: Record<string, string> = {
    de_ancient: 'Ancient',
    de_anubis: 'Anubis',
    de_cache: 'Cache',
    de_cbble: 'Cobblestone',
    de_cbble_cz: 'Cobblestone',
    de_cpl_fire: 'Fire',
    de_cpl_mill: 'Mill',
    de_cpl_strike: 'Mirage',
    de_czl_freight: 'Freight',
    de_czl_karnak: 'Karnak',
    de_czl_silo: 'Silo',
    de_dust2: 'Dust II',
    de_dust2_cz: 'Dust II',
    de_inferno: 'Inferno',
    de_inferno_cz: 'Inferno',
    de_mirage: 'Mirage',
    de_nuke: 'Nuke',
    de_overpass: 'Overpass',
    de_russka: 'Russka',
    de_russka_cz: 'Russka',
    de_train: 'Train',
    de_tuscan: 'Tuscan',
    de_vertigo: 'Vertigo',
  };

  return (
    explicitNames[map] ||
    map
      .replace(/^de_/, '')
      .split('_')
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ')
  );
}

function formatNewsDate(date: Date) {
  return `${format(date, 'MMMM')} ${Util.toOrdinalSuffix(format(date, 'd'))}`;
}

function formatDurationAsCompound(duration: string) {
  const match = duration.match(/^(\d+) (days|weeks|months|years)$/);

  if (!match) {
    return duration;
  }

  return `${match[1]}-${match[2].slice(0, -1)}`;
}

function formatMapIconName(map: string) {
  return map
    .replace(/^de_/, '')
    .replace(/_cz$/, '')
    .replace(/^dust2$/, 'dust2')
    .replace(/^cpl_strike$/, 'mirage')
    .replace(/^cpl_mill$/, 'ancient')
    .replace(/^cpl_fire$/, 'inferno')
    .replace(/^cbble$/, 'cache');
}

function getCompetitionYear(competition: { season?: number | null }) {
  return 2025 + (competition.season || 0);
}

function getMvpTournamentLabel(
  competition: CompetitionLinkTarget,
  options?: { genericMajor?: boolean },
) {
  if (options?.genericMajor && Util.isMajorStageTier(competition.tier.slug)) {
    return 'Majors';
  }

  const city = Util.getCompetitionHostingLocationCity(competition.location);
  const year = getCompetitionYear(competition);

  if (Util.isMajorStageTier(competition.tier.slug)) {
    return [Util.getMajorEventDisplayName(competition.location, competition.organizer), year]
      .filter(Boolean)
      .join(' ');
  }

  if (competition.tier.slug === Constants.TierSlug.BLAST_FINALS) {
    return ['BLAST Finals', city, year].filter(Boolean).join(' ');
  }

  if (competition.tier.slug === Constants.TierSlug.IEM_COLOGNE_PLAYOFFS) {
    return ['IEM Cologne', year].filter(Boolean).join(' ');
  }

  if (competition.tier.slug === Constants.TierSlug.IEM_KRAKOW_PLAYOFFS) {
    return ['IEM Krakow', year].filter(Boolean).join(' ');
  }

  if (competition.tier.slug === Constants.TierSlug.LEAGUE_PRO_PLAYOFFS) {
    return ['ESL Pro League', city, year].filter(Boolean).join(' ');
  }

  return [getCompetitionNewsName(competition, { trophy: true }), city, year]
    .filter(Boolean)
    .join(' ');
}

function getMapChartColor(map: string) {
  const colors: Record<string, string> = {
    de_mirage: '#2f7fbd',
    de_inferno: '#2f9097',
    de_nuke: '#38a06a',
    de_dust2: '#3fac59',
    de_dust2_cz: '#3fac59',
    de_overpass: '#85a83f',
    de_ancient: '#aaa53a',
    de_train: '#c49a2c',
    de_cache: '#eea72a',
    de_vertigo: '#e28c1c',
    de_anubis: '#d46914',
  };

  return colors[map] || '#8ba3b8';
}

async function getMapSeasonUsage(lastSeason: number | null, removedMap: string) {
  const games = await DatabaseClient.prisma.game.findMany({
    select: {
      map: true,
    },
    where: {
      match: {
        status: Constants.MatchStatus.COMPLETED,
        ...(lastSeason
          ? {
              competition: {
                season: lastSeason,
              },
            }
          : {}),
      },
    },
  });
  const counts = games.reduce<Map<string, number>>((acc, game) => {
    acc.set(game.map, (acc.get(game.map) || 0) + 1);
    return acc;
  }, new Map());
  const rankedMaps = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const rankIndex = rankedMaps.findIndex(([map]) => map === removedMap);

  return {
    count: counts.get(removedMap) || 0,
    rank: rankIndex >= 0 ? rankIndex + 1 : rankedMaps.length + 1,
  };
}

async function getMapUsageCounts(lastSeason: number | null, maps: string[]) {
  const games = await DatabaseClient.prisma.game.findMany({
    select: {
      map: true,
    },
    where: {
      map: {
        in: maps,
      },
      match: {
        status: Constants.MatchStatus.COMPLETED,
        ...(lastSeason
          ? {
              competition: {
                season: lastSeason,
              },
            }
          : {}),
      },
    },
  });
  const counts = games.reduce<Map<string, number>>((acc, game) => {
    acc.set(game.map, (acc.get(game.map) || 0) + 1);
    return acc;
  }, new Map());

  return maps
    .map((map) => ({
      color: getMapChartColor(map),
      map,
      name: stylizeMapName(map),
      plays: counts.get(map) || 0,
    }))
    .sort((a, b) => b.plays - a.plays || a.name.localeCompare(b.name));
}

async function getMapLastPlayedYear(map: string, before: Date) {
  const game = await DatabaseClient.prisma.game.findFirst({
    select: {
      match: {
        select: {
          date: true,
        },
      },
    },
    where: {
      map,
      match: {
        date: {
          lt: startOfDay(before),
        },
        status: Constants.MatchStatus.COMPLETED,
      },
    },
    orderBy: {
      match: {
        date: 'desc',
      },
    },
  });

  return game?.match?.date ? new Date(game.match.date).getFullYear() : null;
}

async function getMapFirstPlayedInCurrentSpell(map: string, lastSeason: number | null) {
  const game = await DatabaseClient.prisma.game.findFirst({
    select: {
      match: {
        select: {
          date: true,
        },
      },
    },
    where: {
      map,
      match: {
        status: Constants.MatchStatus.COMPLETED,
        ...(lastSeason
          ? {
              competition: {
                season: lastSeason,
              },
            }
          : {}),
      },
    },
    orderBy: {
      match: {
        date: 'asc',
      },
    },
  });

  return game?.match?.date || null;
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

function mapCountLabel(count: number) {
  return `${count} map${count === 1 ? '' : 's'}`;
}

function titleNoun(count: number) {
  return count === 1 ? 'a title' : 'titles';
}

function victoryNoun(count: number) {
  return count === 1 ? 'a victory' : 'victories';
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

function cleanCompetitionNewsName(name: string) {
  return name.replace(/\s+world$/i, '').trim();
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

  const cleanedName = cleanCompetitionNewsName(rawName);

  return options?.trophy ? cleanedName.replace(/\s+Playoffs\b/gi, '').trim() : cleanedName;
}

type CompetitionLinkTarget = {
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
};

function competitionLink(competition: CompetitionLinkTarget, label?: string) {
  const name = label || getCompetitionNewsName(competition, { trophy: true });

  return competition.id && competition.federationId && competition.season && competition.tier.id
    ? `[**${escapeMarkdownLinkText(name)}**](/competitions?competitionId=${competition.id}&federationId=${competition.federationId}&season=${competition.season}&tierId=${competition.tier.id})`
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

function formatRepeatCount(count: number) {
  if (count === 2) {
    return 'twice';
  }

  if (count === 3) {
    return 'three times';
  }

  return `${count} times`;
}

function formatMajorCompetitionTitleLink(competition: CompetitionLinkTarget) {
  const city = Util.getCompetitionHostingLocationCity(competition.location);
  const organizer = competition.organizer || 'LIGA';
  const useInVariation = Boolean((competition.id ?? competition.season ?? 0) % 2);

  if (city && useInVariation) {
    return `the ${competitionLink(competition, `${organizer} Major`)} in ${competitionLink(
      competition,
      city,
    )}`;
  }

  return `the ${competitionLink(competition, Util.getMajorEventDisplayName(competition.location, organizer))}`;
}

function getCompetitionTitleGroup(competition: CompetitionLinkTarget) {
  const isMajor = Util.isMajorStageTier(competition.tier.slug);

  if (isMajor) {
    const label = formatMajorCompetitionTitleLink(competition);

    return {
      key: `major:${competition.id ?? getCompetitionNewsName(competition, { trophy: true })}`,
      label,
      repeatLabel: label,
      collapseRepeats: false,
    };
  }

  const hostedTitle = Util.getHostedEventTitleDisplayName(competition.tier.slug);
  const repeatLabel = hostedTitle || getCompetitionNewsName(competition, { trophy: true });

  return {
    key: repeatLabel.toLocaleLowerCase(),
    label: competitionLink(competition),
    repeatLabel: competitionLink(competition, repeatLabel),
    collapseRepeats: true,
  };
}

function formatCompetitionTitleList(
  titles: Array<{
    competition: CompetitionLinkTarget;
  }>,
) {
  const groupedTitles = titles.reduce<
    Array<{
      collapseRepeats: boolean;
      key: string;
      label: string;
      repeatLabel: string;
      count: number;
    }>
  >((groups, title) => {
    const titleGroup = getCompetitionTitleGroup(title.competition);
    const key = titleGroup.key.toLocaleLowerCase();
    const existing = groups.find((group) => group.key === key);

    if (existing && titleGroup.collapseRepeats) {
      existing.count += 1;
      return groups;
    }

    groups.push({
      collapseRepeats: titleGroup.collapseRepeats,
      key,
      label: titleGroup.label,
      repeatLabel: titleGroup.repeatLabel,
      count: 1,
    });

    return groups;
  }, []);

  return formatLinkedList(
    groupedTitles.map((title) =>
      title.collapseRepeats && title.count > 1
        ? `${title.repeatLabel} ${formatRepeatCount(title.count)}`
        : title.label,
    ),
  );
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

async function getPlayerMajorWinCount(
  player?: {
    id?: number | null;
    careerStints?: Parameters<typeof findCareerStintForTeam>[0]['careerStints'];
  } | null,
  beforeDate?: Date,
) {
  if (!player?.id) {
    return 0;
  }

  const [careerStints, titles] = await Promise.all([
    DatabaseClient.prisma.careerStint.findMany({
      orderBy: [{ startedAt: 'asc' }, { id: 'asc' }],
      where: {
        playerId: player.id,
      },
    }),
    DatabaseClient.prisma.competitionToTeam.findMany({
      include: {
        competition: {
          include: {
            competitors: true,
            matches: {
              orderBy: [{ date: 'desc' }, { id: 'desc' }],
              include: {
                competitors: true,
              },
              take: 1,
            },
            tier: true,
          },
        },
      },
      where: {
        position: 1,
        teamId: {
          not: null,
        },
        competition: {
          status: Constants.CompetitionStatus.COMPLETED,
          tier: {
            slug: Constants.TierSlug.MAJOR_CHAMPIONS_STAGE,
          },
          matches: beforeDate
            ? {
                some: {
                  date: {
                    lte: beforeDate,
                  },
                },
              }
            : undefined,
        },
      },
    }),
  ]);
  const playerWithStints = { ...player, careerStints };
  const wonMajorCompetitionIds = new Set<number>();

  for (const title of titles) {
    const teamId = title.teamId;
    const championshipMatch = title.competition.matches[0];

    if (!teamId || !championshipMatch) {
      continue;
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

    if (winnerTeamId !== teamId || (beforeDate && championshipMatch.date > beforeDate)) {
      continue;
    }

    if (!findCareerStintForTeam(playerWithStints, teamId, championshipMatch.date)?.starter) {
      continue;
    }

    wonMajorCompetitionIds.add(title.competitionId);
  }

  return wonMajorCompetitionIds.size;
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

async function getTransferShortTeamIds() {
  const rankedTeams = await DatabaseClient.prisma.team.findMany({
    orderBy: [{ elo: 'desc' }, { id: 'asc' }],
    select: {
      id: true,
      tier: true,
      competitionFederation: {
        select: {
          slug: true,
        },
      },
      country: {
        select: {
          continent: {
            select: {
              federation: {
                select: {
                  slug: true,
                },
              },
            },
          },
        },
      },
    },
    where: {
      OR: [
        {
          competitionFederation: {
            is: {
              slug: {
                in: [
                  Constants.FederationSlug.ESPORTS_EUROPA,
                  Constants.FederationSlug.ESPORTS_AMERICAS,
                  Constants.FederationSlug.ESPORTS_ASIA,
                  Constants.FederationSlug.ESPORTS_OCE,
                ],
              },
            },
          },
        },
        {
          competitionFederationId: null,
          country: {
            continent: {
              federation: {
                slug: {
                  in: [
                    Constants.FederationSlug.ESPORTS_EUROPA,
                    Constants.FederationSlug.ESPORTS_AMERICAS,
                    Constants.FederationSlug.ESPORTS_ASIA,
                    Constants.FederationSlug.ESPORTS_OCE,
                  ],
                },
              },
            },
          },
        },
      ],
    },
  });
  const eligibleTeamIds = new Set<number>();
  const asiaNonEpl: number[] = [];
  const oceaniaNonEpl: number[] = [];

  for (const team of rankedTeams) {
    const federationSlug =
      team.competitionFederation?.slug || team.country.continent.federation.slug;
    const tier = team.tier;

    if (
      tier === ADVANCED_TIER_INDEX &&
      (federationSlug === Constants.FederationSlug.ESPORTS_EUROPA ||
        federationSlug === Constants.FederationSlug.ESPORTS_AMERICAS)
    ) {
      eligibleTeamIds.add(team.id);
    }

    if (tier === MAIN_TIER_INDEX && federationSlug === Constants.FederationSlug.ESPORTS_EUROPA) {
      eligibleTeamIds.add(team.id);
    }

    if (federationSlug === Constants.FederationSlug.ESPORTS_ASIA) {
      if (tier === PRO_TIER_INDEX) {
        eligibleTeamIds.add(team.id);
      } else {
        asiaNonEpl.push(team.id);
      }
    }

    if (federationSlug === Constants.FederationSlug.ESPORTS_OCE) {
      if (tier === PRO_TIER_INDEX) {
        eligibleTeamIds.add(team.id);
      } else {
        oceaniaNonEpl.push(team.id);
      }
    }
  }

  asiaNonEpl.slice(0, 5).forEach((teamId) => eligibleTeamIds.add(teamId));
  oceaniaNonEpl.slice(0, 3).forEach((teamId) => eligibleTeamIds.add(teamId));

  return eligibleTeamIds;
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
            take: 24,
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
        in: [
          Constants.TransferStatus.TEAM_ACCEPTED,
          Constants.TransferStatus.PLAYER_ACCEPTED,
          Constants.TransferStatus.EXPIRED,
        ],
      },
    },
  });
}

async function getCompetitionMvpSeedsForNews(publishedAt: Date) {
  const mvps = await findCompetitionMvps({});
  const storyDates = new Map<number, Date>(
    await Promise.all(
      mvps.map(
        async (mvp) =>
          [mvp.competitionId, await getCompetitionMvpStoryDate(mvp.competitionId, publishedAt)] as [
            number,
            Date,
          ],
      ),
    ),
  );

  return mvps
    .filter(
      (mvp) => new Date(storyDates.get(mvp.competitionId) || publishedAt) <= endOfDay(publishedAt),
    )
    .sort(
      (a, b) =>
        (b.competition.season || 0) - (a.competition.season || 0) ||
        b.competitionId - a.competitionId ||
        b.id - a.id,
    );
}

async function getCompetitionMvpStoryDate(competitionId: number, fallback: Date) {
  const match = await DatabaseClient.prisma.match.findFirst({
    orderBy: [{ date: 'desc' }, { id: 'desc' }],
    select: {
      date: true,
    },
    where: {
      competitionId,
      status: Constants.MatchStatus.COMPLETED,
    },
  });

  return match?.date || fallback;
}

async function getCompetitionMvpContenders(competitionId: number, mvpPlayerId: number) {
  const stageCompetitionIds = await getCompetitionMvpStageCompetitionIds(competitionId);
  const rows = await DatabaseClient.prisma.$queryRaw<MvpContenderGameRow[]>`
    SELECT
      "MatchPlayerGameStat"."playerId" AS "playerId",
      "Player"."name" AS "playerName",
      "MatchPlayerGameStat"."kills" AS "kills",
      "MatchPlayerGameStat"."assists" AS "assists",
      "MatchPlayerGameStat"."deaths" AS "deaths"
    FROM "MatchPlayerGameStat"
    INNER JOIN "Player"
      ON "Player"."id" = "MatchPlayerGameStat"."playerId"
    INNER JOIN "Match"
      ON "Match"."id" = "MatchPlayerGameStat"."matchId"
    LEFT JOIN "CareerStint"
      ON "CareerStint"."playerId" = "MatchPlayerGameStat"."playerId"
      AND "CareerStint"."startedAt" <= "Match"."date"
      AND (
        "CareerStint"."endedAt" IS NULL
        OR "CareerStint"."endedAt" >= "Match"."date"
      )
      AND "CareerStint"."starter" = true
    INNER JOIN "MatchToTeam" AS "OwnTeam"
      ON "OwnTeam"."matchId" = "Match"."id"
      AND "OwnTeam"."teamId" = COALESCE("CareerStint"."teamId", "Player"."teamId")
    INNER JOIN "CompetitionToTeam" AS "Finalist"
      ON "Finalist"."competitionId" = ${competitionId}
      AND "Finalist"."teamId" = "OwnTeam"."teamId"
    WHERE "Match"."competitionId" IN (${Prisma.join(stageCompetitionIds)})
      AND "Match"."status" = ${Constants.MatchStatus.COMPLETED}
      AND "Match"."matchType" <> 'FACEIT_PUG'
      AND "Finalist"."position" <= 2
      AND "MatchPlayerGameStat"."playerId" <> ${mvpPlayerId}
  `;
  const contenders = new Map<number, MvpContender & { ratingSum: number }>();

  rows.forEach((row) => {
    const rating = Util.getPlayerRating(Number(row.kills), Number(row.deaths), Number(row.assists));

    if (!Number.isFinite(rating)) {
      return;
    }

    const contender =
      contenders.get(row.playerId) ||
      ({
        playerId: Number(row.playerId),
        playerName: row.playerName,
        rating: 0,
        ratingSum: 0,
        maps: 0,
      } satisfies MvpContender & { ratingSum: number });
    contender.ratingSum += rating;
    contender.maps += 1;
    contenders.set(row.playerId, contender);
  });

  return [...contenders.values()]
    .map(({ ratingSum, ...contender }) => ({
      ...contender,
      rating: contender.maps ? ratingSum / contender.maps : 0,
    }))
    .sort(
      (a, b) => b.rating - a.rating || b.maps - a.maps || a.playerName.localeCompare(b.playerName),
    )
    .slice(0, 3);
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
  afterDate?: Date | null,
) {
  if (!teamId) {
    return [];
  }

  const titleAfterDate = afterDate || null;

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
                    ...(titleAfterDate ? { gte: titleAfterDate } : {}),
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
        }),
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

async function buildContractExpiryDraft(
  transfer: TransferSeed,
  previousTeam: NonNullable<TransferSeed['from']>,
  storyDate: Date,
  articleDate: Date,
  includeStatistics: boolean,
  isTopTeamTransfer: boolean,
): Promise<NewsDraft> {
  const target = transfer.target;
  const targetName = playerName(target);
  const targetLabel = playerLink(target);
  const previousTeamName = teamName(previousTeam);
  const previousTeamLabel = teamLink(previousTeam);
  const targetMajorWins = await getPlayerMajorWinCount(target, storyDate);
  const targetSecondDescriptorSentenceLabel = playerAgeLabel(
    target,
    targetLabel,
    true,
    targetMajorWins,
  );
  const targetLaterDescriptorSentenceLabel = playerAgeLabel(target, targetLabel, true);
  const continuousSpell = findContinuousCareerSpellForTeam(target, previousTeam.id, storyDate);
  const currentStint =
    continuousSpell?.currentStint || findCareerStintForTeam(target, previousTeam.id, storyDate);
  const wasBenchedAtExpiry = currentStint?.starter === false;
  const activeStint = wasBenchedAtExpiry
    ? findRecentStarterStintForTeam(target, previousTeam.id, currentStint?.startedAt)
    : currentStint;
  const stintDuration =
    formatContractDuration(continuousSpell?.startedAt || currentStint?.startedAt, storyDate) ||
    'time with the organization';
  const compoundDuration = formatDurationAsCompound(stintDuration);
  const benchDuration = wasBenchedAtExpiry
    ? formatBenchDuration(currentStint?.startedAt, storyDate)
    : null;
  const statsStint = activeStint || currentStint;
  const sourceStats =
    includeStatistics && target.id
      ? await getPlayerAggregateStats(
          target.id,
          previousTeam.id,
          statsStint ? new Date(statsStint.startedAt) : null,
          statsStint?.endedAt ? new Date(statsStint.endedAt) : storyDate,
        )
      : null;
  const titles = await getRecentTeamTitles(
    previousTeam.id,
    storyDate,
    target,
    statsStint ? new Date(statsStint.startedAt) : null,
  );
  const trophyList = formatCompetitionTitleList(titles);
  const headline = pickVariant(
    [
      `${targetName} becomes a free agent`,
      `${targetName} leaves ${previousTeamName}`,
      `${targetName} departs ${previousTeamName}`,
      `${targetName} enters free agency`,
      `${targetName} parts ways with ${previousTeamName}`,
      `${targetName} leaves after ${stintDuration}`,
      `${targetName} departs after ${stintDuration}`,
      `${targetName} hits free agency`,
      `${targetName} exits ${previousTeamName}`,
      `${targetName} moves on from ${previousTeamName}`,
      `${previousTeamName} part ways with ${targetName}`,
      `${targetName}'s ${previousTeamName} stint ends`,
      `${targetName}'s contract expires`,
      `${targetName} leaves as contract expires`,
      `${targetName} becomes available`,
      `${targetName} enters the open market`,
      `${targetName} ends ${previousTeamName} spell`,
      `${targetName}'s ${previousTeamName} tenure ends`,
      `${previousTeamName} release ${targetName}`,
      `${targetName} leaves after contract expiry`,
    ],
    transfer.id,
  );
  const summary = pickVariant(
    [
      `${targetName} becomes a free agent after leaving ${previousTeamName}.`,
      `${targetName} leaves ${previousTeamName} after ${stintDuration} with the organization.`,
      `${targetName} parts ways with ${previousTeamName} following the end of their contract.`,
      `${targetName} enters free agency after ${previousTeamName} opted not to extend their contract.`,
      `${targetName} departs ${previousTeamName} after ${stintDuration} on the roster.`,
      `${previousTeamName} part ways with ${targetName} as their contract comes to an end.`,
      `${targetName} is now a free agent following their departure from ${previousTeamName}.`,
      `${targetName} leaves ${previousTeamName} after the two sides did not agree on a contract extension.`,
      `${targetName} hits free agency after ${stintDuration} with ${previousTeamName}.`,
      `${targetName}'s spell with ${previousTeamName} comes to an end after ${stintDuration}.`,
      `${previousTeamName} allow ${targetName}'s contract to expire, sending the player into free agency.`,
      `${targetName} moves on from ${previousTeamName} after their contract was not renewed.`,
      `${targetName} becomes available as a free agent following the conclusion of their ${previousTeamName} contract.`,
      `${targetName}'s ${compoundDuration} tenure with ${previousTeamName} ends as their contract expires.`,
      `${targetName} leaves the ${previousTeamName} roster after the organization chose not to extend their deal.`,
      `${previousTeamName} and ${targetName} go their separate ways following ${stintDuration} together.`,
      `${targetName} enters the open market after their stint with ${previousTeamName} came to an end.`,
      `${targetName} departs ${previousTeamName} upon the expiration of their contract.`,
      `${targetName} is searching for a new team after ending a ${compoundDuration} spell with ${previousTeamName}.`,
      `${targetName} becomes a free agent as ${previousTeamName} elect against renewing their contract.`,
    ],
    transfer.id + 11,
  );
  const firstSentence = pickVariant(
    [
      `${targetLabel} leaves ${previousTeamLabel} after his contract expired following a ${compoundDuration} stint.`,
      `${targetLabel} departs ${previousTeamLabel} after ${stintDuration} as his contract comes to an end.`,
      `${targetLabel} leaves ${previousTeamLabel} following the expiration of his contract after ${stintDuration}.`,
      `${targetLabel} parts ways with ${previousTeamLabel} after his ${compoundDuration} contract ran its course.`,
      `${targetLabel} exits ${previousTeamLabel} after ${stintDuration} following the end of his contract.`,
      `${targetLabel} becomes a free agent after his contract with ${previousTeamLabel} expired following ${stintDuration}.`,
      `${targetLabel} moves on from ${previousTeamLabel} after ${stintDuration} as his deal expires.`,
      `${targetLabel} leaves ${previousTeamLabel} upon the expiration of his contract after ${stintDuration} with the team.`,
      `${targetLabel} departs ${previousTeamLabel} after a ${compoundDuration} spell as his contract reaches its end.`,
      `${targetLabel}'s ${compoundDuration} stint with ${previousTeamLabel} ends following the expiration of his contract.`,
      `${targetLabel} leaves ${previousTeamLabel} after spending ${stintDuration} with the organization, with his contract now expired.`,
      `${targetLabel} parts ways with ${previousTeamLabel} following ${stintDuration} as his contract expires.`,
      `${targetLabel} exits the ${previousTeamLabel} roster after his contract ended following ${stintDuration}.`,
      `${targetLabel} leaves ${previousTeamLabel} after a ${compoundDuration} tenure, with his contract having run out.`,
      `${targetLabel} departs ${previousTeamLabel} at the end of his contract following ${stintDuration} with the organization.`,
    ],
    transfer.id + 23,
  );
  const addon = wasBenchedAtExpiry
    ? pickVariant(
        [
          `${targetSecondDescriptorSentenceLabel} spent his final ${benchDuration || stintDuration} with ${previousTeamLabel} on the bench and will now be hoping for a new opportunity.`,
          `${targetSecondDescriptorSentenceLabel} had been on the bench for ${benchDuration || stintDuration} before his contract with ${previousTeamLabel} came to an end.`,
          `${targetSecondDescriptorSentenceLabel} enters free agency after spending the last ${benchDuration || stintDuration} on ${previousTeamLabel}'s bench.`,
          `${targetSecondDescriptorSentenceLabel} leaves ${previousTeamLabel} following ${benchDuration || stintDuration} on the sidelines and will now look for a fresh start.`,
          `${targetSecondDescriptorSentenceLabel} had spent ${benchDuration || stintDuration} out of the active lineup before becoming a free agent.`,
          `${targetSecondDescriptorSentenceLabel}'s departure comes after a ${formatDurationAsCompound(benchDuration || stintDuration)} spell on ${previousTeamLabel}'s bench.`,
          `${targetSecondDescriptorSentenceLabel} now hopes to find a new opportunity after spending his final ${benchDuration || stintDuration} at ${previousTeamLabel} on the bench.`,
          `${targetSecondDescriptorSentenceLabel} hits the open market after being sidelined from ${previousTeamLabel}'s active lineup for ${benchDuration || stintDuration}.`,
          `${targetSecondDescriptorSentenceLabel} sees his contract expiry end a ${formatDurationAsCompound(benchDuration || stintDuration)} spell on the bench and will now seek a new team.`,
          `${targetSecondDescriptorSentenceLabel} becomes available after spending the final ${benchDuration || stintDuration} of his ${previousTeamLabel} tenure on the bench.`,
        ],
        transfer.id + 31,
      )
    : pickVariant(
        [
          `${targetSecondDescriptorSentenceLabel}'s side of the decision remains unknown, with no clarity on whether he or ${previousTeamLabel} decided against extending the contract.`,
          `${targetSecondDescriptorSentenceLabel} leaves with it still unclear whether he or the organization opted against a contract extension.`,
          `${targetSecondDescriptorSentenceLabel} departs with the decision not to renew still unclear, as neither he nor ${previousTeamLabel} has been identified as the side behind it.`,
          `${targetSecondDescriptorSentenceLabel}'s stay with ${previousTeamLabel} ends without clarity on which side decided against extending the deal.`,
          `${targetSecondDescriptorSentenceLabel} leaves with no indication given as to whether he or ${previousTeamLabel} chose not to continue the partnership.`,
          `${targetSecondDescriptorSentenceLabel}'s lack of an extension remains unexplained, with neither side known to have made the decision.`,
          `${targetSecondDescriptorSentenceLabel} enters free agency with it still unknown whether he turned down an extension or ${previousTeamLabel} opted not to offer one.`,
          `${targetSecondDescriptorSentenceLabel} parts ways with ${previousTeamLabel} without either side indicating who decided against continuing.`,
          `${targetSecondDescriptorSentenceLabel} remained part of the active lineup until his contract expired, with the decision behind the lack of an extension unclear.`,
          `${targetSecondDescriptorSentenceLabel} leaves while still part of ${previousTeamLabel}'s active lineup, though it remains unknown which side decided against extending the deal.`,
        ],
        transfer.id + 37,
      );
  const statLine =
    sourceStats &&
    (wasBenchedAtExpiry
      ? titles.length
        ? pickVariant(
            [
              `Before moving to the bench, ${targetLabel} played ${mapCountLabel(sourceStats.maps)} for ${previousTeamLabel} and averaged a ${formatRating(sourceStats.rating)} rating, helping the team win ${trophyList}.`,
              `During their active stint with ${previousTeamLabel}, ${targetLabel} featured across ${mapCountLabel(sourceStats.maps)} with a ${formatRating(sourceStats.rating)} average and claimed ${titleNoun(titles.length)} at ${trophyList}.`,
              `Prior to being benched, ${targetLabel} recorded a ${formatRating(sourceStats.rating)} rating over ${mapCountLabel(sourceStats.maps)} while helping ${previousTeamLabel} to ${victoryNoun(titles.length)} at ${trophyList}.`,
              `${targetLabel} played ${mapCountLabel(sourceStats.maps)} during their time in ${previousTeamLabel}'s active lineup, averaging ${formatRating(sourceStats.rating)} and lifting ${titles.length === 1 ? 'a trophy' : 'trophies'} at ${trophyList}.`,
              `Across ${mapCountLabel(sourceStats.maps)} in ${previousTeamLabel}'s starting lineup, ${targetLabel} averaged ${formatRating(sourceStats.rating)} and contributed to ${titles.length === 1 ? 'a triumph' : 'triumphs'} at ${trophyList}.`,
            ],
            transfer.id + 41,
          )
        : pickVariant(
            [
              `Before moving to the bench, ${targetLabel} played ${mapCountLabel(sourceStats.maps)} for ${previousTeamLabel} and averaged a ${formatRating(sourceStats.rating)} rating.`,
              `During their active stint with ${previousTeamLabel}, ${targetLabel} featured across ${mapCountLabel(sourceStats.maps)} with a ${formatRating(sourceStats.rating)} average rating.`,
              `Prior to being benched, ${targetLabel} recorded a ${formatRating(sourceStats.rating)} rating across ${mapCountLabel(sourceStats.maps)} for ${previousTeamLabel}.`,
              `${targetLabel} played ${mapCountLabel(sourceStats.maps)} during their time in ${previousTeamLabel}'s active lineup, averaging a ${formatRating(sourceStats.rating)} rating.`,
              `Across ${mapCountLabel(sourceStats.maps)} in ${previousTeamLabel}'s starting lineup, ${targetLabel} averaged a ${formatRating(sourceStats.rating)} rating before moving to the bench.`,
            ],
            transfer.id + 43,
          )
      : titles.length
        ? pickVariant(
            [
              `During their stint, ${targetLabel} played ${mapCountLabel(sourceStats.maps)} at a ${formatRating(sourceStats.rating)} average, helping ${previousTeamLabel} win ${trophyList}.`,
              `${targetLabel} featured across ${mapCountLabel(sourceStats.maps)} for ${previousTeamLabel} with a ${formatRating(sourceStats.rating)} rating and contributed to ${titles.length === 1 ? 'a victory' : 'victories'} at ${trophyList}.`,
              `Over the course of their ${previousTeamLabel} spell, ${targetLabel} averaged ${formatRating(sourceStats.rating)} across ${mapCountLabel(sourceStats.maps)} while helping the team claim ${trophyList}.`,
              `${targetLabel} leaves ${previousTeamLabel} after ${mapCountLabel(sourceStats.maps)} at a ${formatRating(sourceStats.rating)} average, with ${titleNoun(titles.length)} at ${trophyList} along the way.`,
              `Across ${mapCountLabel(sourceStats.maps)} in ${previousTeamLabel} colors, ${targetLabel} averaged ${formatRating(sourceStats.rating)} and helped secure ${titles.length === 1 ? 'a trophy' : 'trophies'} at ${trophyList}.`,
            ],
            transfer.id + 47,
          )
        : pickVariant(
            [
              `During their stint with ${previousTeamLabel}, ${targetLabel} played ${mapCountLabel(sourceStats.maps)} and averaged a ${formatRating(sourceStats.rating)} rating.`,
              `${targetLabel} featured across ${mapCountLabel(sourceStats.maps)} for ${previousTeamLabel}, posting a ${formatRating(sourceStats.rating)} average rating.`,
              `Over the course of their ${previousTeamLabel} stint, ${targetLabel} recorded a ${formatRating(sourceStats.rating)} rating across ${mapCountLabel(sourceStats.maps)}.`,
              `${targetLabel} leaves ${previousTeamLabel} having played ${mapCountLabel(sourceStats.maps)} at a ${formatRating(sourceStats.rating)} average.`,
              `Across ${mapCountLabel(sourceStats.maps)} in ${previousTeamLabel} colors, ${targetLabel} averaged a ${formatRating(sourceStats.rating)} rating.`,
              `${targetLabel}'s stint with ${previousTeamLabel} saw them average ${formatRating(sourceStats.rating)} across ${mapCountLabel(sourceStats.maps)}.`,
              `Over ${mapCountLabel(sourceStats.maps)} for ${previousTeamLabel}, ${targetLabel} maintained a ${formatRating(sourceStats.rating)} average rating.`,
            ],
            transfer.id + 53,
          ));
  const finalLine = pickVariant(
    [
      `${targetLabel} now enters free agency with his next destination yet to be determined.`,
      `${targetLaterDescriptorSentenceLabel} is now free to explore his options as he searches for his next team.`,
      `${targetLabel}'s future remains open following the expiration of his ${previousTeamLabel} contract.`,
      `${targetLabel} now heads to the open market with no new team confirmed.`,
      `${targetLaterDescriptorSentenceLabel} is available as a free agent while he considers his next move.`,
      `${targetLabel} will now assess his options after bringing his time with ${previousTeamLabel} to an end.`,
      `No next destination has been announced for ${targetLabel} following his departure from ${previousTeamLabel}.`,
      `${targetLabel} is now looking for his next opportunity after entering free agency.`,
      `${targetLaterDescriptorSentenceLabel}'s next move remains unclear as he becomes available on the open market.`,
      `${targetLabel} is free to speak with interested teams as he weighs up his future.`,
      `${targetLabel} now faces an uncertain next chapter after his contract with ${previousTeamLabel} expired.`,
      `The former ${previousTeamLabel} player is now on the market with his next destination still unknown.`,
      `${targetLabel} will now look for a new home, with no agreement elsewhere announced so far.`,
      `${targetLaterDescriptorSentenceLabel} enters free agency without a confirmed landing spot.`,
      `${targetLabel}'s next step is yet to be revealed following the end of his ${previousTeamLabel} stint.`,
      `${targetLabel} is now available to interested organizations as he searches for a new project.`,
      `${targetLaterDescriptorSentenceLabel} will now consider his options before deciding on the next move of his career.`,
      `${targetLabel} remains without a team for the time being after leaving ${previousTeamLabel}.`,
      `${targetLabel}'s future is currently undecided as he begins his spell as a free agent.`,
      `${targetLaterDescriptorSentenceLabel} now turns his attention to finding a new team after his ${previousTeamLabel} chapter came to a close.`,
    ],
    transfer.id + 61,
  );
  const type = isTopTeamTransfer ? 'ARTICLE' : 'SHORT';

  return {
    type,
    topic: 'TRANSFERS',
    headline,
    summary,
    body: [[firstSentence, addon].join(' '), statLine, finalLine].filter(Boolean).join('\n\n'),
    image: playerImage(target, previousTeam),
    priority: 0,
    eventKey: `${AUTO_EVENT_PREFIX}:transfer:${transfer.id}`,
    payload: {
      transferId: transfer.id,
      playerId: target.id,
      teamId: previousTeam.id,
      teamIds: [previousTeam.id],
      flagCode: toFlagCode(target.country?.code),
      welcomeGraphic: getThankYouGraphic(previousTeam, target),
      comments: buildTransferComments({
        destination: null,
        isArticle: type === 'ARTICLE',
        seed: transfer.id,
        seller: previousTeam,
        target,
      }),
      relatedPlayers: [toRelatedPlayer(target)].filter(Boolean),
      relatedTeams: [toRelatedTeam(previousTeam)].filter(Boolean),
    },
    publishedAt: articleDate,
  };
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

async function buildCompetitionMvpDraft(
  mvp: CompetitionMvpSeed,
  allMvps: CompetitionMvpSeed[],
  publishedAt: Date,
): Promise<NewsDraft | null> {
  const competitionName = getMvpTournamentLabel(mvp.competition);
  const tournamentReference = competitionLink(mvp.competition, competitionName);
  const sameTournamentReference = getMvpTournamentLabel(mvp.competition, { genericMajor: true });
  const player = await DatabaseClient.prisma.player.findFirst({
    include: {
      country: true,
    },
    where: {
      id: mvp.playerId,
    },
  });
  const playerDisplayName = playerName(mvp.player);
  const playerLabel = playerLink(mvp.player);
  const playerDescriptor = playerAgeLabel(player, playerLabel);
  const playerDescriptorStart = playerAgeLabel(player, playerLabel, true);
  const teamLabel = teamLink(mvp.team);
  const teamDisplayName = teamName(mvp.team);
  const seed = mvp.competitionId * 97 + mvp.playerId;
  const storyDate = await getCompetitionMvpStoryDate(mvp.competitionId, publishedAt);
  const year = getCompetitionYear(mvp.competition);
  const chronologicalMvps = allMvps.filter(
    (item) =>
      (item.competition.season || 0) < (mvp.competition.season || 0) ||
      ((item.competition.season || 0) === (mvp.competition.season || 0) &&
        item.competitionId <= mvp.competitionId),
  );
  const playerMvps = chronologicalMvps.filter((item) => item.playerId === mvp.playerId);
  const currentYearMvps = playerMvps.filter(
    (item) => getCompetitionYear(item.competition) === year,
  );
  const previousCareerMvpCount = Math.max(0, playerMvps.length - 1);
  const currentCareerMvpCount = playerMvps.length;
  const currentYearMvpCount = currentYearMvps.length;
  const tournamentMvpCount = playerMvps.filter((item) => {
    if (Util.isMajorStageTier(mvp.competition.tier.slug)) {
      return Util.isMajorStageTier(item.competition.tier.slug);
    }

    return (
      getMvpTournamentLabel(item.competition, { genericMajor: true }).toLocaleLowerCase() ===
      sameTournamentReference.toLocaleLowerCase()
    );
  }).length;
  const careerTotals = chronologicalMvps.reduce<
    Map<number, { count: number; id: number; name: string }>
  >((acc, item) => {
    const entry = acc.get(item.playerId) || {
      count: 0,
      id: item.playerId,
      name: playerName(item.player),
    };
    entry.count += 1;
    acc.set(item.playerId, entry);
    return acc;
  }, new Map());
  const tiedPlayer = [...careerTotals.entries()]
    .filter(
      ([playerId, entry]) => playerId !== mvp.playerId && entry.count === currentCareerMvpCount,
    )
    .sort((a, b) => a[1].name.localeCompare(b[1].name))[0]?.[1];
  const tiedPlayerLabel = tiedPlayer ? playerLink(tiedPlayer) : null;
  const overtakenPlayer = [...careerTotals.entries()]
    .filter(
      ([playerId, entry]) =>
        playerId !== mvp.playerId &&
        entry.count === currentCareerMvpCount - 1 &&
        previousCareerMvpCount === entry.count,
    )
    .sort((a, b) => a[1].name.localeCompare(b[1].name))[0]?.[1];
  const overtakenPlayerLabel = overtakenPlayer ? playerLink(overtakenPlayer) : null;
  const contenders = await getCompetitionMvpContenders(mvp.competitionId, mvp.playerId);
  const closestContender = contenders[0] || null;
  const closestContenderLabel = closestContender
    ? playerLink({ id: closestContender.playerId, name: closestContender.playerName })
    : null;
  const headline = pickVariant(
    [
      `${playerDisplayName} named MVP at ${competitionName}`,
      `${playerDisplayName} named ${competitionName} MVP`,
      `${playerDisplayName} wins MVP at ${competitionName}`,
      `${playerDisplayName} claims ${competitionName} MVP`,
      `${playerDisplayName} earns MVP honors at ${competitionName}`,
      `${playerDisplayName} crowned MVP of ${competitionName}`,
      `${playerDisplayName} takes home ${competitionName} MVP`,
      `${playerDisplayName} secures MVP award at ${competitionName}`,
      `${playerDisplayName} voted MVP at ${competitionName}`,
      `${playerDisplayName} takes ${competitionName} MVP honors`,
      `${playerDisplayName} lands MVP award at ${competitionName}`,
      `${playerDisplayName} awarded MVP at ${competitionName}`,
      `${playerDisplayName} finishes ${competitionName} as MVP`,
      `${playerDisplayName} collects ${competitionName} MVP award`,
      `${playerDisplayName} emerges as ${competitionName} MVP`,
      `${playerDisplayName} picks up MVP honors at ${competitionName}`,
      `${playerDisplayName} earns ${competitionName} MVP award`,
      `${playerDisplayName} walks away with ${competitionName} MVP`,
      `${playerDisplayName} takes MVP honors at ${competitionName}`,
    ],
    seed,
  );
  const summary =
    previousCareerMvpCount === 0
      ? pickVariant(
          [
            `${playerDisplayName} wins the first MVP medal of his career`,
            `${playerDisplayName} claims his first career MVP award`,
            `${playerDisplayName} earns his maiden MVP medal`,
            `${playerDisplayName} secures his first-ever MVP honor`,
            `${playerDisplayName} opens his career MVP account`,
            `${playerDisplayName} becomes an MVP winner for the first time`,
          ],
          seed + 7,
        )
      : currentYearMvpCount <= 1
        ? pickVariant(
            [
              `${playerDisplayName} claims his first MVP medal of ${year}`,
              `${playerDisplayName} earns his first MVP honor of ${year}`,
              `${playerDisplayName} opens his ${year} MVP account`,
              `${playerDisplayName} gets on the board with his first MVP of ${year}`,
              `${playerDisplayName} returns to MVP-winning ways with his first of ${year}`,
            ],
            seed + 11,
          )
        : pickVariant(
            [
              `${playerDisplayName} clinches his ${Util.toOrdinalSuffix(currentYearMvpCount)} MVP medal of ${year}`,
              `${playerDisplayName} claims his ${Util.toOrdinalSuffix(currentYearMvpCount)} MVP honor of ${year}`,
              `${playerDisplayName} adds another MVP medal to his ${year} haul`,
              `${playerDisplayName} makes it ${currentYearMvpCount} MVP medals in ${year}`,
              `${playerDisplayName} continues his ${year} run with another MVP honor`,
            ],
            seed + 13,
          );
  const firstSentence =
    mvp.placement === 2
      ? pickVariant(
          [
            `${playerLabel} claimed the ${tournamentReference} MVP despite ${teamLabel} falling short in the grand final.`,
            `${playerLabel}'s individual performances were enough to earn MVP honors even as ${teamLabel} finished runners-up at ${tournamentReference}.`,
            `${playerLabel} walked away with the ${tournamentReference} MVP despite missing out on the trophy in the final.`,
            `${playerLabel} secured the MVP medal despite ${teamLabel}'s loss in the ${tournamentReference} title decider.`,
            `${playerLabel} finished ${tournamentReference} as its most valuable player despite ${teamLabel} settling for second place.`,
          ],
          seed + 17,
        )
      : closestContender && Math.abs(mvp.rating - closestContender.rating) <= 0.04
        ? pickVariant(
            [
              `${playerLabel} claimed the ${tournamentReference} MVP after narrowly edging ${closestContenderLabel} in a closely contested race.`,
              `${playerLabel} added the MVP medal to ${teamLabel}'s ${tournamentReference} title after finishing just ahead of ${closestContenderLabel}.`,
              `${playerLabel} came out on top in a tight MVP battle with ${closestContenderLabel} as ${teamLabel} lifted the ${tournamentReference} trophy.`,
              `${playerLabel} narrowly beat ${closestContenderLabel} to MVP honors following ${teamLabel}'s victory at ${tournamentReference}.`,
              `${playerLabel} edged out ${closestContenderLabel} for the ${tournamentReference} MVP as ${teamLabel} completed their championship run.`,
            ],
            seed + 19,
          )
        : pickVariant(
            [
              `${playerLabel} capped off ${teamLabel}'s title run at ${tournamentReference} with a dominant individual showing that left little doubt over the MVP award.`,
              `${playerLabel} was the standout performer throughout ${teamLabel}'s victorious ${tournamentReference} campaign, comfortably securing MVP honors.`,
              `${playerLabel} led ${teamLabel} to the ${tournamentReference} trophy while establishing himself as the clear choice for MVP.`,
              `${playerLabel} paired ${teamLabel}'s ${tournamentReference} victory with a commanding performance that earned him the MVP medal.`,
              `${playerLabel} stood above the rest during ${teamLabel}'s championship run at ${tournamentReference} and walked away with MVP honors.`,
              `${playerLabel}'s standout performances throughout ${tournamentReference} made him the obvious MVP choice after ${teamLabel} secured the title.`,
            ],
            seed + 23,
          );
  const contenderSentence = (() => {
    if (mvp.placement === 2) {
      return pickVariant(
        [
          `${teamLabel} could not convert the final, but ${playerDescriptor}'s performances throughout the tournament made him the clear MVP favorite.`,
          `Despite losing the title decider, ${playerDescriptor} remained the standout performer across the tournament.`,
          `${playerDescriptorStart} missed out on the trophy but still finished the event as its standout individual performer.`,
        ],
        seed + 29,
      );
    }

    if (!contenders.length) {
      return null;
    }

    if (closestContender && Math.abs(mvp.rating - closestContender.rating) <= 0.04) {
      const ratingDifference = Math.abs(mvp.rating - closestContender.rating).toFixed(2);

      return mvp.rating >= closestContender.rating
        ? pickVariant(
            [
              `${closestContenderLabel} pushed him close throughout the event, ultimately finishing just ${ratingDifference} rating points behind ${playerDescriptor}.`,
              `Only ${ratingDifference} rating points separated ${playerDescriptor} from ${closestContenderLabel} after a closely contested battle for the award.`,
              `${closestContenderLabel} came close to denying ${playerDescriptor} the medal, with only ${ratingDifference} rating points separating the pair.`,
            ],
            seed + 31,
          )
        : pickVariant(
            [
              `Despite posting a lower rating than ${closestContenderLabel}, ${playerDescriptor} edged the MVP race after facing tougher opposition throughout the tournament.`,
              `${closestContenderLabel} held the higher rating, though ${playerDescriptor}'s performances against tougher opponents ultimately swung the MVP race.`,
              `${playerDescriptorStart} claimed the medal despite a lower rating than ${closestContenderLabel}, with the strength of his opposition proving an important factor.`,
            ],
            seed + 37,
          );
    }

    if (contenders.length >= 3) {
      const names = contenders
        .slice(0, 3)
        .map((contender) => playerLink({ id: contender.playerId, name: contender.playerName }));

      return pickVariant(
        [
          `${formatLinkedList(names)} were also in contention, but ${playerDescriptor} comfortably outperformed the chasing pack.`,
          `${formatLinkedList(names)} emerged as the closest challengers, but ${playerDescriptor} finished well clear of all three.`,
          `${playerDescriptorStart} faced competition from ${formatLinkedList(names)}, but comfortably separated himself from the field.`,
          `${formatLinkedList(names)} rounded out the main MVP candidates, with ${playerDescriptor} finishing comfortably ahead of the trio.`,
        ],
        seed + 41,
      );
    }

    return null;
  })();
  const statSentence = pickVariant(
    [
      `They posted a ${formatRating(mvp.rating)} average rating across ${mapCountLabel(mvp.maps)}.`,
      `They averaged a ${formatRating(mvp.rating)} rating over ${mapCountLabel(mvp.maps)}.`,
      `They finished the tournament with a ${formatRating(mvp.rating)} rating across ${mapCountLabel(mvp.maps)}.`,
      `They maintained an average rating of ${formatRating(mvp.rating)} through ${mapCountLabel(mvp.maps)}.`,
      `They wrapped up the event with a ${formatRating(mvp.rating)} rating across ${mapCountLabel(mvp.maps)}.`,
    ],
    seed + 43,
  );
  const specialSentences = [
    tournamentMvpCount > 1
      ? pickVariant(
          [
            `This marks the ${Util.toOrdinalSuffix(tournamentMvpCount)} time he has earned MVP honors at ${sameTournamentReference}.`,
            `This is now his ${Util.toOrdinalSuffix(tournamentMvpCount)} MVP medal from ${sameTournamentReference}.`,
            `He has now claimed MVP honors at ${sameTournamentReference} for the ${Util.toOrdinalSuffix(tournamentMvpCount)} time.`,
            `He now boasts ${tournamentMvpCount} MVP medals from ${sameTournamentReference}.`,
          ],
          seed + 47,
        )
      : null,
    tiedPlayer
      ? pickVariant(
          [
            `${playerLabel} now draws level with ${tiedPlayerLabel} on ${currentCareerMvpCount} career MVP medals.`,
            `${playerLabel}'s latest award sees him tie ${tiedPlayerLabel} with ${currentCareerMvpCount} MVPs apiece.`,
            `The medal moves ${playerLabel} level with ${tiedPlayerLabel} at ${currentCareerMvpCount} MVPs.`,
          ],
          seed + 53,
        )
      : null,
    overtakenPlayer
      ? pickVariant(
          [
            `${playerLabel} moves ahead of ${overtakenPlayerLabel} in the MVP standings with ${currentCareerMvpCount} career awards.`,
            `${playerLabel} overtakes ${overtakenPlayerLabel} in total MVP medals, bringing his tally to ${currentCareerMvpCount}.`,
            `The latest award moves ${playerLabel} past ${overtakenPlayerLabel} with ${currentCareerMvpCount} career MVPs.`,
          ],
          seed + 59,
        )
      : null,
    previousCareerMvpCount === 0
      ? pickVariant(
          [
            `${playerLabel} finally breaks through with his first career MVP medal at ${tournamentReference}.`,
            `${playerLabel} celebrates his first-ever MVP honor after his standout run at ${tournamentReference}.`,
            `${playerLabel} opens his MVP account with a career-first award at ${tournamentReference}.`,
            `${playerLabel}'s wait for an MVP comes to an end with his first award at ${tournamentReference}.`,
          ],
          seed + 61,
        )
      : null,
  ].filter(Boolean);

  return {
    type: 'ARTICLE',
    topic: 'COMPETITIONS',
    headline,
    summary,
    body: [firstSentence, contenderSentence, statSentence, ...specialSentences]
      .filter(Boolean)
      .join('\n\n'),
    image: playerImage(mvp.player, mvp.team),
    priority: 84,
    eventKey: `${AUTO_EVENT_PREFIX}:competition-mvp:${mvp.competitionId}`,
    payload: {
      competitionId: mvp.competitionId,
      playerId: mvp.playerId,
      teamId: mvp.teamId,
      flagCode: toFlagCode(player?.country?.code || mvp.player.country?.code),
      mvpGraphic: {
        medal: 'resources://competitions/mvp.png',
        playerImage: playerImage(mvp.player, mvp.team),
        tournamentLogo: getCompetitionLogo(mvp.competition),
      },
      relatedPlayers: [toRelatedPlayer(mvp.player)].filter(Boolean),
      relatedTeams: [toRelatedTeam(mvp.team)].filter(Boolean),
    },
    publishedAt: new Date(startOfDay(storyDate).getTime() + mvp.competitionId),
  };
}

async function buildTransferDraft(
  transfer: TransferSeed,
  transfers: TransferSeed[],
  topTeamIds: Set<number>,
  transferShortTeamIds: Set<number>,
  publishedAt: Date,
  includeStatistics: boolean,
): Promise<NewsDraft | null> {
  const destination = transfer.from;
  const seller = transfer.to;
  const target = transfer.target;
  const destinationIsTop = !!destination && topTeamIds.has(destination.id);
  const sellerIsTop = !!seller && topTeamIds.has(seller.id);
  const isTopTeamTransfer = destinationIsTop || sellerIsTop;
  const destinationIsShortEligible = !!destination && transferShortTeamIds.has(destination.id);
  const sellerIsShortEligible = !!seller && transferShortTeamIds.has(seller.id);
  const isShortEligibleTransfer = destinationIsShortEligible || sellerIsShortEligible;
  const latestOffer = transfer.offers[0];
  const isContractExpiry = transfer.status === Constants.TransferStatus.EXPIRED;
  const storyDate = isContractExpiry
    ? transfer.target.lastOfferAt || publishedAt
    : getTransferStoryDate(transfer, publishedAt);
  const articleDate = new Date(startOfDay(storyDate).getTime() + transfer.id);
  const isFreeAgentSigning =
    isNoTeam(seller) || (!!destination && !!seller && destination.id === seller.id);

  if (!isTopTeamTransfer && !isShortEligibleTransfer) {
    return null;
  }

  if (isContractExpiry && destination && !isNoTeam(destination)) {
    return buildContractExpiryDraft(
      transfer,
      destination,
      storyDate,
      articleDate,
      includeStatistics,
      isTopTeamTransfer,
    );
  }

  const targetName = playerName(target);
  const destinationName = teamName(destination);
  const sellerName = teamName(seller);
  const targetLabel = playerLink(target);
  const destinationLabel = teamLink(destination);
  const sellerLabel = teamLink(seller);
  const targetMajorWins = await getPlayerMajorWinCount(target, storyDate);
  const targetSecondDescriptorLabel = playerAgeLabel(target, targetLabel, false, targetMajorWins);
  const targetSecondDescriptorSentenceLabel = playerAgeLabel(
    target,
    targetLabel,
    true,
    targetMajorWins,
  );
  const targetLaterDescriptorLabel = playerAgeLabel(target, targetLabel);
  const targetLaterDescriptorSentenceLabel = playerAgeLabel(target, targetLabel, true);
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
  const benchedMajorWins = await getPlayerMajorWinCount(benchedPlayer, storyDate);
  const benchedAgeLabel = playerAgeLabel(benchedPlayer, benchedLabel, false, benchedMajorWins);
  const benchedAgeSentenceLabel = playerAgeLabel(
    benchedPlayer,
    benchedLabel,
    true,
    benchedMajorWins,
  );
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
  const sourceSpell =
    statsSourceTeamId && target.id
      ? findContinuousCareerSpellForTeam(target, statsSourceTeamId, storyDate)
      : null;
  const sourceStintDuration = formatContractDuration(
    sourceSpell?.startedAt || sourceStint?.startedAt,
    storyDate,
  );
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
    sourceSpell?.startedAt || sourceStint?.startedAt
      ? new Date(sourceSpell?.startedAt || sourceStint?.startedAt || storyDate)
      : null,
  );
  const benchedStintEnd = benchedStint?.endedAt ? new Date(benchedStint.endedAt) : storyDate;
  const benchedStintDuration = benchedStint
    ? formatBenchDuration(benchedStint.startedAt, benchedStintEnd)
    : null;
  const benchedTitles =
    benchedStats && benchedPlayer && benchedStint
      ? await getRecentTeamTitles(
          destination?.id,
          benchedStintEnd,
          benchedPlayer,
          new Date(benchedStint.startedAt),
        )
      : [];
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
  const hasAwperLine = Boolean(
    destination && benchedPlayer && isAwper(target) && isAwper(benchedPlayer),
  );
  const targetStatsDescriptorLabel = hasAwperLine
    ? targetLaterDescriptorLabel
    : targetSecondDescriptorLabel;
  const targetStatsDescriptorSentenceLabel = hasAwperLine
    ? targetLaterDescriptorSentenceLabel
    : targetSecondDescriptorSentenceLabel;
  const statLine =
    sourceStats && statsSourceTeam
      ? pickVariant(
          isSignedFromBench
            ? [
                `Before moving to the bench, ${targetStatsDescriptorLabel} averaged a ${formatRating(sourceStats.rating)} rating across ${sourceStats.maps} map${sourceStats.maps === 1 ? '' : 's'} for ${statsSourceLabel}.`,
                `Prior to being benched, ${targetLabel} posted a ${formatRating(sourceStats.rating)} rating over ${sourceStats.maps} map${sourceStats.maps === 1 ? '' : 's'} with ${statsSourceLabel}.`,
                `${targetStatsDescriptorSentenceLabel} recorded a ${formatRating(sourceStats.rating)} average across ${sourceStats.maps} map${sourceStats.maps === 1 ? '' : 's'} before being moved out of ${statsSourceLabel}'s active lineup.`,
                `Before their spell on the bench, ${targetLabel} averaged a ${formatRating(sourceStats.rating)} rating across ${sourceStats.maps} map${sourceStats.maps === 1 ? '' : 's'} for ${statsSourceLabel}.`,
                `${targetLabel} had posted a ${formatRating(sourceStats.rating)} rating over ${sourceStats.maps} map${sourceStats.maps === 1 ? '' : 's'} with ${statsSourceLabel} before being benched.`,
                `During their previous run in ${statsSourceLabel}'s active lineup, ${targetStatsDescriptorLabel} averaged a ${formatRating(sourceStats.rating)} rating across ${sourceStats.maps} map${sourceStats.maps === 1 ? '' : 's'}.`,
                `${targetLabel} leaves ${statsSourceLabel} having previously averaged a ${formatRating(sourceStats.rating)} rating over ${sourceStats.maps} map${sourceStats.maps === 1 ? '' : 's'} before moving to the bench.`,
                `Prior to their benching, ${targetStatsDescriptorLabel} registered a ${formatRating(sourceStats.rating)} rating across ${sourceStats.maps} map${sourceStats.maps === 1 ? '' : 's'} in ${statsSourceLabel} colors.`,
                `${targetLabel} averaged a ${formatRating(sourceStats.rating)} rating over ${sourceStats.maps} map${sourceStats.maps === 1 ? '' : 's'} during their last stint in ${statsSourceLabel}'s starting lineup.`,
                `Before dropping out of the active roster, ${targetLabel} recorded a ${formatRating(sourceStats.rating)} average across ${sourceStats.maps} map${sourceStats.maps === 1 ? '' : 's'} for ${statsSourceLabel}.`,
                `${targetStatsDescriptorSentenceLabel} had accumulated a ${formatRating(sourceStats.rating)} rating over ${sourceStats.maps} map${sourceStats.maps === 1 ? '' : 's'} before ${statsSourceLabel} moved them to the bench.`,
                `${targetLabel}'s most recent active stint with ${statsSourceLabel} saw them average a ${formatRating(sourceStats.rating)} rating across ${sourceStats.maps} map${sourceStats.maps === 1 ? '' : 's'}.`,
                `Before spending time on the sidelines, ${targetLabel} posted a ${formatRating(sourceStats.rating)} average across ${sourceStats.maps} map${sourceStats.maps === 1 ? '' : 's'} for ${statsSourceLabel}.`,
                `${targetLabel} entered their bench spell at ${statsSourceLabel} with a ${formatRating(sourceStats.rating)} rating across ${sourceStats.maps} map${sourceStats.maps === 1 ? '' : 's'} played in the active lineup.`,
                `${targetStatsDescriptorSentenceLabel} averaged a ${formatRating(sourceStats.rating)} rating over ${sourceStats.maps} map${sourceStats.maps === 1 ? '' : 's'} in ${statsSourceLabel}'s lineup before eventually being benched.`,
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
              `${targetStatsDescriptorSentenceLabel} will look to carry their strong form into their new surroundings.`,
              `${targetStatsDescriptorSentenceLabel} hopes to maintain their level of performance under the new banner.`,
              `${targetStatsDescriptorSentenceLabel} will aim to build on their impressive form with ${destinationLabel}.`,
              `${targetStatsDescriptorSentenceLabel} hopes to keep their momentum going in the new jersey.`,
              `${targetStatsDescriptorSentenceLabel} will look to continue delivering at a high level for ${destinationLabel}.`,
              `${targetStatsDescriptorSentenceLabel} hopes their strong run of form carries over to the new lineup.`,
              `${targetStatsDescriptorSentenceLabel} will aim to replicate their previous performances with ${destinationLabel}.`,
              `${targetStatsDescriptorSentenceLabel} hopes to remain a consistent performer in their new colors.`,
              `${targetStatsDescriptorSentenceLabel} will look to pick up where they left off after joining ${destinationLabel}.`,
              `${targetStatsDescriptorSentenceLabel} hopes to bring the same level of impact to their new team.`,
            ],
            GOOD: [
              `${targetStatsDescriptorSentenceLabel} will look to take another step forward under the new banner.`,
              `${targetStatsDescriptorSentenceLabel} hopes to further develop their game with ${destinationLabel}.`,
              `${targetStatsDescriptorSentenceLabel} will aim to improve on their previous level in the new lineup.`,
              `${targetStatsDescriptorSentenceLabel} hopes the move can help elevate their performances further.`,
              `${targetStatsDescriptorSentenceLabel} will look to build on their solid showing with ${statsSourceLabel}.`,
              `${targetStatsDescriptorSentenceLabel} hopes to reach another level in their new surroundings.`,
              `${targetStatsDescriptorSentenceLabel} will aim to continue progressing as part of ${destinationLabel}.`,
              `${targetStatsDescriptorSentenceLabel} hopes the new environment can bring further improvement.`,
              `${targetStatsDescriptorSentenceLabel} will look to build on their previous form in the ${destinationLabel} jersey.`,
              `${targetStatsDescriptorSentenceLabel} hopes to raise their level after making the switch to ${destinationLabel}.`,
            ],
            MIXED: [
              `${targetStatsDescriptorSentenceLabel} will look to sharpen their game under the new banner.`,
              `${targetStatsDescriptorSentenceLabel} hopes to develop further in their new surroundings.`,
              `${targetStatsDescriptorSentenceLabel} will aim to strengthen their performances with ${destinationLabel}.`,
              `${targetStatsDescriptorSentenceLabel} hopes the move provides an opportunity to take their game forward.`,
              `${targetStatsDescriptorSentenceLabel} will look to make further strides as part of the new lineup.`,
              `${targetStatsDescriptorSentenceLabel} hopes to refine their game during their time with ${destinationLabel}.`,
              `${targetStatsDescriptorSentenceLabel} will aim to unlock more of their potential under the new banner.`,
              `${targetStatsDescriptorSentenceLabel} hopes a change of scenery can help improve their level.`,
              `${targetStatsDescriptorSentenceLabel} will look to grow into a stronger contributor for ${destinationLabel}.`,
              `${targetStatsDescriptorSentenceLabel} hopes to make progress and establish themselves in the new lineup.`,
            ],
            POOR: [
              `${targetStatsDescriptorSentenceLabel} will look to rediscover their form with ${destinationLabel}.`,
              `${targetStatsDescriptorSentenceLabel} hopes a fresh start can help turn their performances around.`,
              `${targetStatsDescriptorSentenceLabel} will aim to bounce back in their new surroundings.`,
              `${targetStatsDescriptorSentenceLabel} hopes the move to ${destinationLabel} can spark an upturn in form.`,
              `${targetStatsDescriptorSentenceLabel} will look to get back on track under the new banner.`,
              `${targetStatsDescriptorSentenceLabel} hopes a new environment can help them regain their footing.`,
              `${targetStatsDescriptorSentenceLabel} will aim to put their previous struggles behind them at ${destinationLabel}.`,
              `${targetStatsDescriptorSentenceLabel} hopes to find renewed form after making the switch.`,
              `${targetStatsDescriptorSentenceLabel} will look to reset and improve upon their recent performances.`,
              `${targetStatsDescriptorSentenceLabel} hopes their new chapter with ${destinationLabel} can bring stronger results.`,
            ],
          }[getRatingBucket(sourceStats.rating)],
          transfer.id + 41,
        )
      : null;
  const sourceStatsParagraph = [statLine, sourceStatsAddonLine].filter(Boolean).join(' ') || null;
  const awperLine = hasAwperLine
    ? pickVariant(
        [
          `${destinationLabel} will retain their AWP setup, with ${targetSecondDescriptorLabel} replacing fellow sniper ${benchedLabel}.`,
          `${destinationLabel} have found their new AWPer, bringing in ${targetSecondDescriptorLabel} to take over from ${benchedLabel}.`,
          `${targetSecondDescriptorSentenceLabel} steps into the AWP role for ${destinationLabel}, replacing fellow AWPer ${benchedLabel}.`,
          `${destinationLabel} keep the AWP position unchanged in structure, with ${targetSecondDescriptorLabel} coming in for ${benchedLabel}.`,
          `${destinationLabel} have opted for an AWP change, replacing ${benchedLabel} with ${targetSecondDescriptorLabel}.`,
          `${targetSecondDescriptorSentenceLabel} takes over ${destinationLabel}'s AWP duties from ${benchedLabel}.`,
          `${destinationLabel} remain committed to the AWP role as ${targetSecondDescriptorLabel} replaces ${benchedLabel} in the lineup.`,
          `${targetSecondDescriptorSentenceLabel} joins ${destinationLabel} as the new AWPer, taking the place of ${benchedLabel}.`,
          `${destinationLabel} make a direct change in the AWP position, bringing ${targetSecondDescriptorLabel} in for ${benchedLabel}.`,
          `${targetSecondDescriptorSentenceLabel} is set to assume AWP responsibilities for ${destinationLabel} following ${benchedLabel}'s departure.`,
          `${destinationLabel} swap one AWPer for another, with ${targetSecondDescriptorLabel} arriving to replace ${benchedLabel}.`,
        ],
        transfer.id + 43,
      )
    : null;
  const trophyList = formatCompetitionTitleList(sellerTitles);
  const sourceDurationLabel = sourceStintDuration || 'their time';
  const sourceStintLabel = sourceStintDuration ? `${sourceStintDuration} stint` : 'time';
  const titlesLine = sellerTitles.length
    ? pickVariant(
        [
          `${targetLabel} leaves ${sellerLabel} after ${sourceDurationLabel} with the team, a spell that included silverware at ${trophyList}.`,
          `${targetLabel} moves on from ${sellerLabel} after ${sourceDurationLabel}, having won ${trophyList} with the team.`,
          `${targetLabel}'s ${sourceStintLabel} with ${sellerLabel} included title success at ${trophyList}.`,
          `${targetLabel} exits ${sellerLabel} after ${sourceDurationLabel}, during which they helped the team win ${trophyList}.`,
          `${targetLabel} departs ${sellerLabel} after ${sourceDurationLabel} and silverware at ${trophyList}.`,
          `${targetLabel}'s time with ${sellerLabel} ends after ${sourceDurationLabel}, with trophies claimed at ${trophyList}.`,
          `The ${sellerLabel} chapter closes for ${targetLabel} after ${sourceDurationLabel}, a run that featured success at ${trophyList}.`,
          `${targetLabel} leaves ${sellerLabel} after ${sourceDurationLabel} as a title winner with victories at ${trophyList}.`,
          `${targetLabel} moves on from ${sellerLabel} after ${sourceDurationLabel}, adding ${trophyList} to their list of achievements along the way.`,
          `${targetLabel}'s departure from ${sellerLabel} comes after ${sourceDurationLabel} together and title wins at ${trophyList}.`,
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
  const benchedStatsLine = benchedPlayer
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
  const benchedTrophyList = formatCompetitionTitleList(benchedTitles);
  const benchedWonMultipleTitles = benchedTitles.length !== 1;
  const benchedStintAddonLine =
    benchedStats && benchedStintDuration
      ? benchedTitles.length
        ? pickVariant(
            [
              `${benchedAgeSentenceLabel} helped ${destinationLabel} to ${benchedWonMultipleTitles ? 'victories' : 'a victory'} at ${benchedTrophyList} during their ${benchedStintDuration} with the team.`,
              `During their ${benchedStintDuration} stint, ${benchedAgeLabel} helped ${destinationLabel} ${benchedWonMultipleTitles ? 'claim titles' : 'claim a title'} at ${benchedTrophyList}.`,
              `${benchedAgeSentenceLabel} leaves the active lineup having helped ${destinationLabel} win ${benchedTrophyList} over a ${benchedStintDuration} spell.`,
              `${benchedAgeSentenceLabel} was part of ${destinationLabel}'s title-winning ${benchedWonMultipleTitles ? 'runs' : 'run'} at ${benchedTrophyList} during their ${benchedStintDuration} on the roster.`,
              `${benchedAgeSentenceLabel} contributed to ${destinationLabel}'s ${benchedWonMultipleTitles ? 'triumphs' : 'triumph'} at ${benchedTrophyList} across a ${benchedStintDuration} stint.`,
              `${benchedAgeSentenceLabel}'s ${benchedStintDuration} in ${destinationLabel}'s active lineup included ${benchedWonMultipleTitles ? 'victories' : 'a victory'} at ${benchedTrophyList}.`,
              `Over their ${benchedStintDuration} with ${destinationLabel}, ${benchedAgeLabel} helped the side lift ${benchedWonMultipleTitles ? 'trophies' : 'a trophy'} at ${benchedTrophyList}.`,
              `The stint also brought silverware for ${benchedAgeLabel}, who helped ${destinationLabel} secure ${benchedTrophyList} during their ${benchedStintDuration} together.`,
              `${benchedAgeSentenceLabel} departs the active roster after a ${benchedStintDuration} spell that featured ${benchedWonMultipleTitles ? 'title wins' : 'a title win'} at ${benchedTrophyList}.`,
              `${benchedAgeSentenceLabel}'s ${benchedStintDuration} run with ${destinationLabel} saw the team come out on top at ${benchedTrophyList}.`,
            ],
            transfer.id + 63,
          )
        : pickVariant(
            [
              `${benchedAgeSentenceLabel} spent ${benchedStintDuration} in ${destinationLabel}'s active lineup.`,
              `${benchedAgeSentenceLabel}'s spell in ${destinationLabel}'s starting roster lasted ${benchedStintDuration}.`,
              `${benchedAgeSentenceLabel} had been part of ${destinationLabel}'s active roster for ${benchedStintDuration}.`,
              `${benchedAgeSentenceLabel} now moves out of the lineup after a ${benchedStintDuration} stint with ${destinationLabel}.`,
              `The benching brings an end to ${benchedAgeLabel}'s ${benchedStintDuration} run in ${destinationLabel}'s active five.`,
              `${benchedAgeSentenceLabel} spent a total of ${benchedStintDuration} competing as part of ${destinationLabel}'s active lineup.`,
              `${benchedAgeSentenceLabel}'s time in ${destinationLabel}'s starting roster spanned ${benchedStintDuration}.`,
              `${benchedAgeSentenceLabel} had occupied a place in ${destinationLabel}'s active lineup for ${benchedStintDuration} before the change.`,
              `The roster move ends a ${benchedStintDuration} active stint for ${benchedAgeLabel} at ${destinationLabel}.`,
              `${benchedAgeSentenceLabel} steps onto the bench following ${benchedStintDuration} as part of ${destinationLabel}'s starting lineup.`,
            ],
            transfer.id + 64,
          )
      : null;
  const benchedLine = [benchedStatsLine, benchedStintAddonLine].filter(Boolean).join(' ') || null;
  const upcomingLine = upcomingMatches.length
    ? (() => {
        const match = upcomingMatches[0];
        const opponent = match.competitors.find(
          (competitor) => competitor.teamId !== destination?.id,
        );
        const opponentLabel = opponent?.team ? teamLink(opponent.team) : 'their next opponent';
        const competitionName = match.competition
          ? competitionLink(match.competition)
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
      welcomeGraphic: getWelcomeGraphic(destination, target),
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

export async function createMapPoolRotationItem(args: {
  activeMaps: MapPoolNewsEntry[];
  demotedMap: MapPoolNewsEntry;
  gameVersionSlug: Constants.Game;
  profileSeason?: number | null;
  promotedMap: MapPoolNewsEntry;
  publishedAt: Date;
}) {
  const promotedSlug = args.promotedMap.gameMap.name;
  const demotedSlug = args.demotedMap.gameMap.name;
  const promotedName = stylizeMapName(promotedSlug);
  const demotedName = stylizeMapName(demotedSlug);
  const seed = (args.profileSeason || 0) * 131 + args.promotedMap.id * 17 + args.demotedMap.id;
  const articleDate = startOfDay(args.publishedAt);
  const lastSeason = args.profileSeason ? Math.max(1, args.profileSeason - 1) : null;
  const previousPlayedYear = await getMapLastPlayedYear(promotedSlug, articleDate);
  const usage = await getMapSeasonUsage(lastSeason, demotedSlug);
  const outgoingStartedAt = await getMapFirstPlayedInCurrentSpell(demotedSlug, lastSeason);
  const outgoingDuration =
    formatBenchDuration(outgoingStartedAt, articleDate) ||
    (lastSeason ? `season ${lastSeason}` : 'the last season');
  const returningDuration = previousPlayedYear
    ? formatBenchDuration(new Date(previousPlayedYear, 0, 1), articleDate) || 'time'
    : null;
  const returningDurationCompound = returningDuration
    ? formatDurationAsCompound(returningDuration)
    : null;
  const outgoingDurationCompound = formatDurationAsCompound(outgoingDuration);
  const dateLabel = formatNewsDate(articleDate);
  const finalPool = args.activeMaps
    .slice()
    .sort((a, b) => (a.position ?? 99) - (b.position ?? 99))
    .map((map) => ({
      name: stylizeMapName(map.gameMap.name),
      slug: map.gameMap.name,
    }));
  const previousPool = args.activeMaps
    .filter((map) => map.id !== args.promotedMap.id)
    .concat(args.demotedMap)
    .sort((a, b) => (a.position ?? 99) - (b.position ?? 99))
    .map((map) => map.gameMap.name);
  const mapUsage = await getMapUsageCounts(lastSeason, previousPool);
  const fillMaps = (text: string, first = promotedName, second = demotedName) =>
    text.replace(/MAP/g, () => {
      const value = first;
      first = second;
      return value;
    });
  const headline = fillMaps(
    pickVariant(
      [
        'MAP replaces MAP in the Active Duty map pool.',
        'MAP takes the place of MAP in the Active Duty pool.',
        'MAP enters the Active Duty pool in place of MAP.',
        'MAP has replaced MAP in the Active Duty map pool.',
        'MAP joins the Active Duty pool as MAP is removed.',
        'MAP rotates into the Active Duty pool, replacing MAP.',
        'MAP is added to the Active Duty pool at the expense of MAP.',
        'MAP returns to the Active Duty pool in place of MAP.',
        'MAP makes its way into the Active Duty pool as MAP drops out.',
        'MAP swaps into the Active Duty pool for MAP.',
        'MAP is introduced to the Active Duty pool, replacing MAP.',
        "MAP takes over MAP's spot in the Active Duty map pool.",
        'MAP moves into the Active Duty pool while MAP moves out.',
        `${demotedName} is rotated out of the Active Duty pool in favor of ${promotedName}.`,
        `${demotedName} makes way for ${promotedName} in the Active Duty pool.`,
        'The Active Duty pool sees MAP replace MAP.',
        'The latest map pool change brings MAP in for MAP.',
        'MAP becomes part of the Active Duty pool, with MAP departing.',
        'The Active Duty rotation sees MAP take the place of MAP.',
        `${demotedName} is swapped out for ${promotedName} in the Active Duty map pool.`,
      ],
      seed,
    ),
  ).replace(/\./g, '');
  const summary = pickVariant(
    [
      'Valve has once again made changes to the map pool following the end of the season.',
      'Valve has opted for another map pool adjustment after the season came to a close.',
      'The conclusion of the season has brought another map pool shake-up from Valve.',
      'Valve is ringing in another map pool change following the end of the season.',
      'Another season has ended, and Valve has responded with a fresh map pool update.',
      'Valve has used the offseason to make another change to the Active Duty pool.',
      'The map pool is changing again as Valve makes another post-season adjustment.',
      "Valve has introduced another map pool change in the wake of the season's conclusion.",
      'The end of the season has once again prompted Valve to refresh the map pool.',
      'Valve has moved to shake up the Active Duty pool following the latest season.',
      'Another map pool rotation is here as Valve makes changes after the season.',
      'Valve has once again taken the opportunity to alter the map pool between seasons.',
      'The offseason brings another Active Duty pool change from Valve.',
      'Valve has made another tweak to the competitive map pool after the season wrapped up.',
      'With the season now over, Valve has opted to make another change to the map rotation.',
      'Valve has once again refreshed the map pool heading into the next stretch of competition.',
      'The competitive map pool is getting another update following the end of the season.',
      'Valve has chosen the post-season window for another Active Duty pool shake-up.',
      'The latest season has concluded with Valve making another adjustment to the map pool.',
      'Valve is changing up the map rotation once again after the conclusion of the season.',
    ],
    seed + 11,
  );
  const firstSentence = fillMaps(
    pickVariant(
      [
        'Valve have announced that MAP will replace MAP following the end of the current season on DATE.',
        'Valve have announced that MAP will take the place of MAP in the Active Duty pool following the end of the current season on DATE.',
        'Valve have confirmed that MAP will replace MAP once the current season concludes on DATE.',
        'MAP will replace MAP in the Active Duty map pool after the current season ends on DATE, Valve have announced.',
        'Valve are set to swap MAP for MAP following the conclusion of the current season on DATE.',
        'Valve have revealed that MAP will enter the Active Duty pool in place of MAP when the season ends on DATE.',
        'The Active Duty pool will see MAP replace MAP following the end of the current season on DATE.',
        'Valve have confirmed a map pool rotation that will see MAP come in for MAP after the season concludes on DATE.',
        "MAP is set to take over MAP's spot in the Active Duty pool once the current season wraps up on DATE.",
        "Valve will rotate MAP into the Active Duty pool for MAP following the season's conclusion on DATE.",
        'Valve have announced a post-season map pool change, with MAP replacing MAP on DATE.',
        'MAP will join the Active Duty pool at the expense of MAP after the current season comes to an end on DATE.',
        'Valve have opted to bring MAP into the Active Duty pool for MAP following the DATE conclusion of the current season.',
        'The end of the current season on DATE will bring a change to the Active Duty pool, with MAP replacing MAP.',
        "Valve have unveiled their next Active Duty pool adjustment, as MAP will replace MAP following the season's end on DATE.",
      ],
      seed + 23,
    ),
  ).replace(/DATE/g, dateLabel);
  const secondSentence = previousPlayedYear
    ? pickVariant(
        [
          `${promotedName} returns to the Active Duty pool after a ${returningDurationCompound} hiatus, having been removed in ${previousPlayedYear} in favor of ${demotedName}.`,
          `${promotedName} makes its return to the map pool following ${returningDuration} away, after being replaced by ${demotedName} in ${previousPlayedYear}.`,
          `${promotedName} is back in the Active Duty pool for the first time since ${previousPlayedYear}, when it made way for ${demotedName}.`,
          `${promotedName} returns after ${returningDuration} out of rotation, having last been removed from the pool in ${previousPlayedYear} for ${demotedName}.`,
          `${promotedName} rejoins the competitive map pool following a ${returningDurationCompound} absence that began when ${demotedName} replaced it in ${previousPlayedYear}.`,
          `${promotedName} makes its comeback to the Active Duty pool after being out since ${previousPlayedYear}, when it was swapped out for ${demotedName}.`,
          `${promotedName} returns to competitive rotation after ${returningDuration} on the sidelines, having exited the pool in ${previousPlayedYear} in favor of ${demotedName}.`,
          `${promotedName} is set to re-enter the Active Duty pool after a ${returningDurationCompound} break, with its previous removal coming in ${previousPlayedYear} for ${demotedName}.`,
          `${promotedName} returns to the map pool after ${returningDuration} away from Active Duty, having been replaced by ${demotedName} back in ${previousPlayedYear}.`,
          `${promotedName} rejoins the rotation following a ${returningDurationCompound} hiatus, ending an absence that began when it was removed for ${demotedName} in ${previousPlayedYear}.`,
        ],
        seed + 31,
      )
    : pickVariant(
        [
          `${promotedName} enters the Active Duty pool, replacing ${demotedName} after its ${outgoingDurationCompound} spell in the rotation.`,
          `${promotedName} joins the map pool in place of ${demotedName}, which had been part of the rotation for ${outgoingDuration}.`,
          `${promotedName} is added to the Active Duty pool as ${demotedName} departs following a ${outgoingDurationCompound} stint.`,
          `${promotedName} takes a place in the competitive map pool, replacing ${demotedName} after ${outgoingDuration} in the rotation.`,
          `${promotedName} moves into the Active Duty pool while ${demotedName} exits after spending ${outgoingDuration} in the map pool.`,
          `${promotedName} joins the competitive rotation in place of ${demotedName}, ending the latter's ${outgoingDurationCompound} run in the pool.`,
          `${promotedName} is brought into the Active Duty pool as ${demotedName} makes way after ${outgoingDuration} in rotation.`,
          `${promotedName} enters the map pool at the expense of ${demotedName}, which had occupied a spot for ${outgoingDuration}.`,
          `${promotedName} becomes part of the Active Duty rotation as ${demotedName} drops out following a ${outgoingDurationCompound} stint.`,
          `${promotedName} rotates into the Active Duty pool for ${demotedName}, bringing the outgoing map's ${outgoingDurationCompound} spell to an end.`,
        ],
        seed + 37,
      );
  const rankLabel = Util.toOrdinalSuffix(usage.rank);
  const statisticSentence = pickVariant(
    [
      `The departing ${demotedName} was played ${usage.count} times over the course of the last season, making it the ${rankLabel}-most played map in the pool.`,
      `${demotedName} featured ${usage.count} times throughout the previous season, ranking as the ${rankLabel}-most played map.`,
      `The outgoing ${demotedName} was picked ${usage.count} times last season, placing it ${rankLabel} in terms of overall play frequency.`,
      `${demotedName} leaves the pool after being played ${usage.count} times during the last season, the ${rankLabel}-highest total among all maps.`,
      `Over the previous season, ${demotedName} was played ${usage.count} times, making it the ${rankLabel}-most frequently played map.`,
      `The leaving ${demotedName} appeared ${usage.count} times across last season and finished as the ${rankLabel}-most played map in the rotation.`,
      `${demotedName} saw ${usage.count} plays during the previous season, ranking ${rankLabel} among the most frequently played maps.`,
      `The outgoing ${demotedName} was used ${usage.count} times throughout the season, enough to make it the ${rankLabel}-most played map.`,
      `${demotedName} exits the pool after recording ${usage.count} plays last season, placing it ${rankLabel} in the map usage standings.`,
      `The departing ${demotedName} featured in ${usage.count} matches during the previous season, making it the ${rankLabel}-most played map overall.`,
      `${demotedName} was played ${usage.count} times over the last season and ranked ${rankLabel} in total usage across the pool.`,
      `The map being removed saw ${usage.count} plays throughout the previous season, finishing as the ${rankLabel}-most played in rotation.`,
      `${demotedName} leaves Active Duty after appearing ${usage.count} times last season, the ${rankLabel}-most among the available maps.`,
      `Across the last season, ${demotedName} was selected ${usage.count} times, ranking as the ${rankLabel}-most played map in the pool.`,
      `The outgoing ${demotedName} accumulated ${usage.count} plays during the previous season, placing it ${rankLabel} on the season's map frequency list.`,
    ],
    seed + 41,
  );
  const finalPoolBlock = [
    'The new map pool is:',
    '',
    ...finalPool.map((map) => `- ${map.name}`),
  ].join('\n');

  return createDrafts([
    {
      type: 'ARTICLE',
      topic: 'COMPETITIONS',
      headline,
      summary,
      body: [
        firstSentence,
        '',
        `::map-image{map="${promotedSlug}" icon="${formatMapIconName(promotedSlug)}"}`,
        '',
        secondSentence,
        '',
        statisticSentence,
        '',
        '::map-usage-chart',
        '',
        finalPoolBlock,
      ].join('\n'),
      image: null,
      priority: 78,
      eventKey: `${AUTO_EVENT_PREFIX}:map-pool:${args.profileSeason || 0}:${promotedSlug}:${demotedSlug}`,
      payload: {
        flagCode: 'other',
        gameVersionSlug: args.gameVersionSlug,
        promotedMap: promotedSlug,
        demotedMap: demotedSlug,
        hideArticleImage: true,
        activeMaps: finalPool.map((map) => map.slug),
        mapUsage,
      },
      publishedAt: articleDate,
    },
  ]);
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

export async function generateAutomaticItems(date?: Date) {
  const profile = await DatabaseClient.prisma.profile.findFirst();
  const publishedAt = date || profile?.date || new Date();
  const topTeamIds = await getTopTeamIds();
  const transferShortTeamIds = await getTransferShortTeamIds();
  const includeStatistics = Boolean(profile?.simulateNpcMatchStats);

  if (includeStatistics) {
    await backfillMissingMatchPlayerGameStats();
  }

  const transfers = await getCompletedTransfersForNews();
  const mvpSeeds = includeStatistics ? await getCompetitionMvpSeedsForNews(publishedAt) : [];
  const allMvps = includeStatistics ? await findCompetitionMvps({}) : [];
  const transferDrafts = (
    await Promise.all(
      transfers.map((transfer) =>
        buildTransferDraft(
          transfer,
          transfers,
          topTeamIds,
          transferShortTeamIds,
          publishedAt,
          includeStatistics,
        ),
      ),
    )
  ).filter(Boolean) as NewsDraft[];
  const mvpDrafts = (
    await Promise.all(mvpSeeds.map((mvp) => buildCompetitionMvpDraft(mvp, allMvps, publishedAt)))
  ).filter(Boolean) as NewsDraft[];

  return createDrafts([...transferDrafts, ...mvpDrafts]);
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
