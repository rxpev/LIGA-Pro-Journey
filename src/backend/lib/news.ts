import { endOfDay, format, startOfDay } from 'date-fns';
import { Prisma } from '@prisma/client';
import { Constants, Util } from '@liga/shared';
import DatabaseClient from './database-client';
import { findCompetitionMvps, getCompetitionMvpStageCompetitionIds } from './competition-mvps';
import { backfillMissingMatchPlayerGameStats } from './match-player-game-stats';
import { getThankYouGraphic, getWelcomeGraphic } from './news-welcome-graphics';
import { CIS_COUNTRY_CODES } from './npc-transfer-identity';

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
const TOP_PLAYERS_OF_YEAR_SIZE = 20;
const TOP_PLAYERS_OF_YEAR_MIN_MAPS = 12;
const TOP_PLAYERS_OF_YEAR_MIN_BIG_EVENT_MAPS = 8;

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
type TopPlayerOfYearGameRow = {
  playerId: number;
  playerName: string;
  playerAvatar: string | null;
  playerCountryCode: string | null;
  playerAge: number | null;
  playerRole: string | null;
  teamId: number | null;
  teamName: string | null;
  teamBlazon: string | null;
  competitionId: number;
  competitionLocation: string | null;
  competitionOrganizer: string | null;
  competitionSeason: number | null;
  federationSlug: string;
  tierSlug: string;
  matchId: number;
  matchDate: Date;
  totalRounds: number | null;
  gameKey: number;
  round: number | null;
  placement: number | null;
  ownResult: number | null;
  ownScore: number | null;
  opponentTeamId: number | null;
  opponentTeamName: string | null;
  opponentScore: number | null;
  kills: bigint | number;
  assists: bigint | number;
  deaths: bigint | number;
  opponentElo: bigint | number | null;
};
type TopPlayerOfYearTrophyRow = {
  playerId: number;
  teamId: number | null;
  teamName: string | null;
  competitionId: number;
  competitionLocation: string | null;
  competitionOrganizer: string | null;
  competitionSeason: number | null;
  federationSlug: string;
  tierSlug: string;
};
type TopPlayerOfYearCandidate = {
  playerId: number;
  playerName: string;
  playerAvatar: string | null;
  playerCountryCode: string | null;
  playerAge: number | null;
  playerRole: string | null;
  teamId: number | null;
  teamName: string | null;
  teamBlazon: string | null;
  maps: number;
  actualMaps: number;
  actualRating: number;
  notableRating: number;
  score: number;
  mvpCount: number;
  eliteMaps: number;
  bigEventMaps: number;
  bigEventRating: number;
  pressureRating: number;
  strongEventCount: number;
  weakEventCount: number;
  bestEvent?: {
    competitionId: number;
    name: string;
    maps: number;
    placement: number | null;
    rating: number;
    date?: Date | null;
  } | null;
  weakEvent?: {
    competitionId: number;
    name: string;
    maps: number;
    placement: number | null;
    rating: number;
    date?: Date | null;
  } | null;
  rmrEvent?: {
    competitionId: number;
    name: string;
    maps: number;
    placement: number | null;
    rating: number;
    date?: Date | null;
  } | null;
  signatureMatch?: {
    competitionId: number;
    name: string;
    opponentTeamId: number | null;
    opponentTeamName: string | null;
    round: number | null;
    totalRounds: number | null;
    maps: number;
    rating: number;
    teamScore: number | null;
    opponentScore: number | null;
    won: boolean | null;
    date?: Date | null;
  } | null;
  teams: Array<{
    id: number;
    name: string;
    blazon: string | null;
    maps: number;
  }>;
  mvpTournaments: Array<{
    competitionId: number;
    name: string;
    weight: number;
  }>;
  trophies: Array<{
    competitionId: number;
    name: string;
    teamId: number | null;
    teamName: string | null;
    weight: number;
  }>;
};
type TopPlayerOfYearHistory = {
  appearances: number;
  bestRank: number;
  firstYear: number;
  lastAppearance?: {
    rank: number;
    year: number;
  };
  previousYearRank?: number | null;
  years: number[];
};
type TopPlayerOfYearComparison = {
  above?: TopPlayerOfYearCandidate | null;
  below?: TopPlayerOfYearCandidate | null;
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

  return matchingStint?.startedAt || transfer.offers[0]?.createdAt || fallback;
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
  let cisCount = 0;

  for (const player of players) {
    const code = toFlagCode(player.country?.code);

    if (code) {
      counts.set(code, (counts.get(code) || 0) + 1);
      if (CIS_COUNTRY_CODES.has(code)) {
        cisCount += 1;
      }
    }
  }

  const [countryCode, count] =
    [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] || [];
  const isNational = Boolean(countryCode && count >= 3);
  const isCisNational = cisCount >= 3 && cisCount >= Math.ceil(players.length * 0.6);

  return {
    countryCode,
    isNational: isNational || isCisNational,
    isInternational: players.length > 0 && !isNational && !isCisNational,
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

function isTopPlayersOfYearDate(publishedAt: Date) {
  return publishedAt.getMonth() === 11 && publishedAt.getDate() === 31;
}

function getTopPlayersOfYearEventWeight(tierSlug?: string | null, federationSlug?: string | null) {
  if (!tierSlug || tierSlug.includes('qualifier') || tierSlug.includes('rmr')) {
    return 0;
  }

  if (tierSlug === Constants.TierSlug.MAJOR_CHAMPIONS_STAGE) return 2.25;
  if (tierSlug === Constants.TierSlug.MAJOR_LEGENDS_STAGE) return 1.65;
  if (tierSlug === Constants.TierSlug.MAJOR_CHALLENGERS_STAGE) return 1.45;
  if (
    tierSlug === Constants.TierSlug.IEM_COLOGNE_PLAYOFFS ||
    tierSlug === Constants.TierSlug.IEM_KRAKOW_PLAYOFFS
  ) {
    return 1.9;
  }
  if (
    tierSlug === Constants.TierSlug.LEAGUE_PRO_PLAYOFFS ||
    tierSlug === Constants.TierSlug.BLAST_FINALS
  ) {
    return 1.65;
  }
  if (
    tierSlug === Constants.TierSlug.IEM_COLOGNE_GROUP_A ||
    tierSlug === Constants.TierSlug.IEM_COLOGNE_GROUP_B ||
    tierSlug === Constants.TierSlug.IEM_KRAKOW_GROUP_A ||
    tierSlug === Constants.TierSlug.IEM_KRAKOW_GROUP_B ||
    tierSlug === Constants.TierSlug.LEAGUE_PRO
  ) {
    return 1.2;
  }
  if (tierSlug === Constants.TierSlug.CCT_GLOBAL_FINALS) return 0.65;
  if (tierSlug === Constants.TierSlug.ESL_CHALLENGER_PLAYOFFS) return 0.6;
  if (tierSlug === Constants.TierSlug.ESL_CHALLENGER) return 0.42;
  if (tierSlug === Constants.TierSlug.CCT_SERIES_PLAYOFFS) return 0.38;
  if (tierSlug === Constants.TierSlug.CCT_SERIES) return 0.26;
  if (tierSlug === Constants.TierSlug.CCT_OCE_PLAYOFFS) return 0.35;
  if (tierSlug === Constants.TierSlug.CCT_OCE_SERIES) return 0.25;

  const regionalLeagueWeights: Record<string, number> = {
    [Constants.FederationSlug.ESPORTS_EUROPA]: 0.5,
    [Constants.FederationSlug.ESPORTS_AMERICAS]: 0.36,
    [Constants.FederationSlug.ESPORTS_ASIA]: 0.25,
    [Constants.FederationSlug.ESPORTS_OCE]: 0.18,
  };

  if (tierSlug.includes('league:') || tierSlug === Constants.TierSlug.ESEA_CASH_CUP) {
    const base = regionalLeagueWeights[federationSlug || ''] || 0.12;
    return tierSlug.includes('playoffs') ? base * 1.25 : base;
  }

  return 0;
}

function isTopPlayersOfYearBigEvent(tierSlug?: string | null) {
  return Boolean(
    tierSlug &&
      [
        Constants.TierSlug.MAJOR_CHALLENGERS_STAGE,
        Constants.TierSlug.MAJOR_LEGENDS_STAGE,
        Constants.TierSlug.MAJOR_CHAMPIONS_STAGE,
        Constants.TierSlug.IEM_COLOGNE_GROUP_A,
        Constants.TierSlug.IEM_COLOGNE_GROUP_B,
        Constants.TierSlug.IEM_COLOGNE_PLAYOFFS,
        Constants.TierSlug.IEM_KRAKOW_GROUP_A,
        Constants.TierSlug.IEM_KRAKOW_GROUP_B,
        Constants.TierSlug.IEM_KRAKOW_PLAYOFFS,
        Constants.TierSlug.LEAGUE_PRO,
        Constants.TierSlug.LEAGUE_PRO_PLAYOFFS,
        Constants.TierSlug.BLAST_FINALS,
      ].includes(tierSlug as Constants.TierSlug),
  );
}

function isTopPlayersOfYearRmrTier(tierSlug?: string | null) {
  return Boolean(tierSlug && tierSlug.includes(':rmr') && !tierSlug.includes('open-qualifier'));
}

function isTopPlayersOfYearPressureTier(tierSlug?: string | null, placement?: number | null) {
  return Boolean(
    tierSlug &&
      (tierSlug.includes('playoffs') ||
        tierSlug === Constants.TierSlug.MAJOR_CHAMPIONS_STAGE ||
        tierSlug === Constants.TierSlug.BLAST_FINALS ||
        (tierSlug === Constants.TierSlug.CCT_GLOBAL_FINALS && placement != null && placement <= 2)),
  );
}

function getTopPlayersOfYearEventName(tierSlug?: string | null) {
  if (
    tierSlug === Constants.TierSlug.MAJOR_EUROPE_RMR_A ||
    tierSlug === Constants.TierSlug.MAJOR_EUROPE_RMR_B
  ) {
    return tierSlug === Constants.TierSlug.MAJOR_EUROPE_RMR_A ? 'Europe RMR A' : 'Europe RMR B';
  }
  if (tierSlug === Constants.TierSlug.MAJOR_AMERICAS_RMR) return 'Americas RMR';
  if (tierSlug === Constants.TierSlug.MAJOR_ASIA_RMR) return 'Asia RMR';
  if (tierSlug === Constants.TierSlug.MAJOR_CHAMPIONS_STAGE) return 'the Major';
  if (tierSlug === Constants.TierSlug.MAJOR_LEGENDS_STAGE) return 'the Major Legends Stage';
  if (tierSlug === Constants.TierSlug.MAJOR_CHALLENGERS_STAGE) {
    return 'the Major Challengers Stage';
  }
  if (
    tierSlug === Constants.TierSlug.IEM_COLOGNE_GROUP_A ||
    tierSlug === Constants.TierSlug.IEM_COLOGNE_GROUP_B ||
    tierSlug === Constants.TierSlug.IEM_COLOGNE_PLAYOFFS
  ) {
    return 'IEM Cologne';
  }
  if (
    tierSlug === Constants.TierSlug.IEM_KRAKOW_GROUP_A ||
    tierSlug === Constants.TierSlug.IEM_KRAKOW_GROUP_B ||
    tierSlug === Constants.TierSlug.IEM_KRAKOW_PLAYOFFS
  ) {
    return 'IEM Krakow';
  }
  if (
    tierSlug === Constants.TierSlug.LEAGUE_PRO ||
    tierSlug === Constants.TierSlug.LEAGUE_PRO_PLAYOFFS
  ) {
    return 'ESL Pro League';
  }
  if (tierSlug === Constants.TierSlug.BLAST_FINALS) return 'BLAST Finals';
  if (tierSlug === Constants.TierSlug.CCT_GLOBAL_FINALS) return 'CCT Global Finals';
  if (tierSlug === Constants.TierSlug.ESL_CHALLENGER_PLAYOFFS) return 'ESL Challenger';
  if (tierSlug === Constants.TierSlug.ESL_CHALLENGER) return 'ESL Challenger groups';
  if (tierSlug === Constants.TierSlug.CCT_SERIES_PLAYOFFS) return 'CCT playoffs';
  if (tierSlug === Constants.TierSlug.CCT_SERIES) return 'CCT regional play';
  if (tierSlug === Constants.TierSlug.CCT_OCE_PLAYOFFS) return 'CCT Oceania playoffs';
  if (tierSlug === Constants.TierSlug.CCT_OCE_SERIES) return 'CCT Oceania';
  if (tierSlug?.includes('league:advanced')) return 'Advanced';
  if (tierSlug?.includes('league:main')) return 'Main';
  if (tierSlug?.includes('league:intermediate')) return 'Intermediate';
  if (tierSlug?.includes('league:open')) return 'Open';

  return 'notable events';
}

function getTopPlayersOfYearEventKey(row: {
  competitionId: number;
  competitionLocation?: string | null;
  competitionOrganizer?: string | null;
  competitionSeason?: number | null;
  federationSlug?: string | null;
  tierSlug?: string | null;
}) {
  const stageGroup = (() => {
    if (Util.isMajorStageTier(row.tierSlug)) return 'major';
    if (
      row.tierSlug === Constants.TierSlug.IEM_COLOGNE_GROUP_A ||
      row.tierSlug === Constants.TierSlug.IEM_COLOGNE_GROUP_B ||
      row.tierSlug === Constants.TierSlug.IEM_COLOGNE_PLAYOFFS
    ) {
      return 'iem-cologne';
    }
    if (
      row.tierSlug === Constants.TierSlug.IEM_KRAKOW_GROUP_A ||
      row.tierSlug === Constants.TierSlug.IEM_KRAKOW_GROUP_B ||
      row.tierSlug === Constants.TierSlug.IEM_KRAKOW_PLAYOFFS
    ) {
      return 'iem-krakow';
    }
    if (
      row.tierSlug === Constants.TierSlug.LEAGUE_PRO ||
      row.tierSlug === Constants.TierSlug.LEAGUE_PRO_PLAYOFFS
    ) {
      return 'esl-pro-league';
    }

    return row.tierSlug || `competition-${row.competitionId}`;
  })();

  return [
    row.federationSlug,
    row.competitionSeason,
    row.competitionLocation,
    row.competitionOrganizer,
    stageGroup,
  ]
    .filter((part) => part != null && part !== '')
    .join(':');
}

function getTopPlayersOfYearPrimaryCompetitionId(
  currentCompetitionId: number,
  currentTierSlug?: string | null,
  nextCompetitionId?: number,
  nextTierSlug?: string | null,
) {
  const currentWeight = getTopPlayersOfYearEventWeight(currentTierSlug);
  const nextWeight = getTopPlayersOfYearEventWeight(nextTierSlug);

  if (nextCompetitionId && nextWeight > currentWeight) {
    return nextCompetitionId;
  }

  return currentCompetitionId;
}

function topPlayersCompetitionLink(competitionId: number, name: string) {
  return `[**${escapeMarkdownLinkText(name)}**](/competitions?competitionId=${competitionId})`;
}

function getTopPlayersOfYearMvpWeight(mvp: CompetitionMvpSeed) {
  const eventWeight = getTopPlayersOfYearEventWeight(
    mvp.competition.tier.slug,
    mvp.competition.federation.slug,
  );

  return Math.round(eventWeight * 16);
}

async function getTopPlayersOfYearCandidates(
  publishedAt: Date,
  allMvps: CompetitionMvpSeed[],
): Promise<TopPlayerOfYearCandidate[]> {
  const year = publishedAt.getFullYear();
  const season = year - 2025;
  const rows = await DatabaseClient.prisma.$queryRaw<TopPlayerOfYearGameRow[]>`
    SELECT
      "MatchPlayerGameStat"."playerId" AS "playerId",
      "Player"."name" AS "playerName",
      "Player"."avatar" AS "playerAvatar",
      "Country"."code" AS "playerCountryCode",
      "Player"."age" AS "playerAge",
      "Player"."role" AS "playerRole",
      "OwnTeam"."teamId" AS "teamId",
      "Team"."name" AS "teamName",
      "Team"."blazon" AS "teamBlazon",
      "Competition"."id" AS "competitionId",
      "Competition"."location" AS "competitionLocation",
      "Competition"."organizer" AS "competitionOrganizer",
      "Competition"."season" AS "competitionSeason",
      "Federation"."slug" AS "federationSlug",
      "Tier"."slug" AS "tierSlug",
      "Match"."id" AS "matchId",
      "Match"."date" AS "matchDate",
      "Match"."totalRounds" AS "totalRounds",
      "MatchPlayerGameStat"."gameKey" AS "gameKey",
      "Match"."round" AS "round",
      "Placement"."position" AS "placement",
      "OwnTeam"."result" AS "ownResult",
      "OwnTeam"."score" AS "ownScore",
      "Opponent"."teamId" AS "opponentTeamId",
      "OpponentTeam"."name" AS "opponentTeamName",
      "Opponent"."score" AS "opponentScore",
      "MatchPlayerGameStat"."kills" AS "kills",
      "MatchPlayerGameStat"."assists" AS "assists",
      "MatchPlayerGameStat"."deaths" AS "deaths",
      AVG("OpponentTeam"."elo") AS "opponentElo"
    FROM "MatchPlayerGameStat"
    INNER JOIN "Match"
      ON "Match"."id" = "MatchPlayerGameStat"."matchId"
    INNER JOIN "Competition"
      ON "Competition"."id" = "Match"."competitionId"
    INNER JOIN "Tier"
      ON "Tier"."id" = "Competition"."tierId"
    INNER JOIN "Federation"
      ON "Federation"."id" = "Competition"."federationId"
    INNER JOIN "Player"
      ON "Player"."id" = "MatchPlayerGameStat"."playerId"
    LEFT JOIN "Country"
      ON "Country"."id" = "Player"."countryId"
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
    LEFT JOIN "Team"
      ON "Team"."id" = "OwnTeam"."teamId"
    LEFT JOIN "CompetitionToTeam" AS "Placement"
      ON "Placement"."competitionId" = "Competition"."id"
      AND "Placement"."teamId" = "OwnTeam"."teamId"
    LEFT JOIN "MatchToTeam" AS "Opponent"
      ON "Opponent"."matchId" = "Match"."id"
      AND "Opponent"."teamId" IS NOT NULL
      AND "Opponent"."teamId" <> "OwnTeam"."teamId"
    LEFT JOIN "Team" AS "OpponentTeam"
      ON "OpponentTeam"."id" = "Opponent"."teamId"
    WHERE "Competition"."season" = ${season}
      AND "Match"."date" <= ${endOfDay(publishedAt)}
      AND "Match"."status" = ${Constants.MatchStatus.COMPLETED}
      AND "Match"."matchType" <> 'FACEIT_PUG'
    GROUP BY
      "MatchPlayerGameStat"."playerId",
      "Player"."name",
      "Player"."avatar",
      "Country"."code",
      "Player"."age",
      "Player"."role",
      "OwnTeam"."teamId",
      "Team"."name",
      "Team"."blazon",
      "Competition"."id",
      "Competition"."location",
      "Competition"."organizer",
      "Competition"."season",
      "Federation"."slug",
      "Tier"."slug",
      "Match"."id",
      "Match"."date",
      "Match"."totalRounds",
      "MatchPlayerGameStat"."gameKey",
      "Match"."round",
      "Placement"."position",
      "OwnTeam"."result",
      "OwnTeam"."score",
      "Opponent"."teamId",
      "OpponentTeam"."name",
      "Opponent"."score",
      "MatchPlayerGameStat"."kills",
      "MatchPlayerGameStat"."assists",
      "MatchPlayerGameStat"."deaths"
  `;
  const eventStats = new Map<
    string,
    {
      competitionId: number;
      firstDate: Date | null;
      federationSlug: string;
      impact: number;
      latestDate: Date | null;
      maps: number;
      placement: number | null;
      playerId: number;
      primaryTierSlug: string;
      ratingSum: number;
      tierSlug: string;
    }
  >();
  const rmrEventStats = new Map<
    string,
    {
      competitionId: number;
      date: Date | null;
      maps: number;
      placement: number | null;
      playerId: number;
      ratingSum: number;
      tierSlug: string;
    }
  >();
  const pressureMatchStats = new Map<
    string,
    {
      competitionId: number;
      date: Date | null;
      maps: number;
      opponentScore: number | null;
      opponentTeamId: number | null;
      opponentTeamName: string | null;
      playerId: number;
      ratingSum: number;
      round: number | null;
      teamScore: number | null;
      tierSlug: string;
      totalRounds: number | null;
      won: boolean | null;
    }
  >();
  const playerStats = new Map<
    number,
    TopPlayerOfYearCandidate & {
      rawRatingSum: number;
      weightedRatingSum: number;
      weightedRatingMaps: number;
      weightedMaps: number;
      pressureRatingSum: number;
      pressureMaps: number;
      bigEventRatingSum: number;
      bigEventRatingMaps: number;
      actualRatingSum: number;
      actualMaps: number;
      opponentEloSum: number;
      opponentEloMaps: number;
      teamsById: Map<
        number,
        {
          id: number;
          name: string;
          blazon: string | null;
          maps: number;
        }
      >;
      trophyByCompetitionId: Map<
        number,
        {
          competitionId: number;
          name: string;
          teamId: number | null;
          teamName: string | null;
          weight: number;
        }
      >;
    }
  >();

  rows.forEach((row) => {
    const impact = getTopPlayersOfYearEventWeight(row.tierSlug, row.federationSlug);
    const rating = Util.getPlayerRating(Number(row.kills), Number(row.deaths), Number(row.assists));

    if (!Number.isFinite(rating)) {
      return;
    }

    const player =
      playerStats.get(row.playerId) ||
      ({
        playerId: row.playerId,
        playerName: row.playerName,
        playerAvatar: row.playerAvatar,
        playerCountryCode: row.playerCountryCode,
        playerAge: row.playerAge,
        playerRole: row.playerRole,
        teamId: row.teamId,
        teamName: row.teamName,
        teamBlazon: row.teamBlazon,
        maps: 0,
        actualMaps: 0,
        actualRating: 0,
        notableRating: 0,
        score: 0,
        mvpCount: 0,
        eliteMaps: 0,
        bigEventMaps: 0,
        bigEventRating: 0,
        pressureRating: 0,
        strongEventCount: 0,
        weakEventCount: 0,
        bestEvent: null as TopPlayerOfYearCandidate['bestEvent'],
        weakEvent: null as TopPlayerOfYearCandidate['weakEvent'],
        teams: [] as TopPlayerOfYearCandidate['teams'],
        mvpTournaments: [] as TopPlayerOfYearCandidate['mvpTournaments'],
        trophies: [] as TopPlayerOfYearCandidate['trophies'],
        rawRatingSum: 0,
        weightedRatingSum: 0,
        weightedRatingMaps: 0,
        weightedMaps: 0,
        pressureRatingSum: 0,
        pressureMaps: 0,
        bigEventRatingSum: 0,
        bigEventRatingMaps: 0,
        actualRatingSum: 0,
        opponentEloSum: 0,
        opponentEloMaps: 0,
        teamsById: new Map(),
        trophyByCompetitionId: new Map(),
      } satisfies TopPlayerOfYearCandidate & {
        rawRatingSum: number;
        weightedRatingSum: number;
        weightedRatingMaps: number;
        weightedMaps: number;
        pressureRatingSum: number;
        pressureMaps: number;
        bigEventRatingSum: number;
        bigEventRatingMaps: number;
        actualRatingSum: number;
        actualMaps: number;
        opponentEloSum: number;
        opponentEloMaps: number;
        teamsById: Map<
          number,
          {
            id: number;
            name: string;
            blazon: string | null;
            maps: number;
          }
        >;
        trophyByCompetitionId: Map<
          number,
          {
            competitionId: number;
            name: string;
            teamId: number | null;
            teamName: string | null;
            weight: number;
          }
        >;
      });

    player.actualMaps += 1;
    player.actualRatingSum += rating;

    if (row.teamId && row.teamName) {
      const teamEntry = player.teamsById.get(row.teamId) || {
        id: row.teamId,
        name: row.teamName,
        blazon: row.teamBlazon,
        maps: 0,
      };

      teamEntry.maps += 1;
      player.teamsById.set(row.teamId, teamEntry);
    }

    playerStats.set(row.playerId, player);

    if (isTopPlayersOfYearRmrTier(row.tierSlug)) {
      const rmrKey = `${row.playerId}:${row.competitionId}`;
      const rmrEntry =
        rmrEventStats.get(rmrKey) ||
        ({
          competitionId: row.competitionId,
          date: row.matchDate || null,
          maps: 0,
          placement: row.placement,
          playerId: row.playerId,
          ratingSum: 0,
          tierSlug: row.tierSlug,
        } satisfies {
          competitionId: number;
          date: Date | null;
          maps: number;
          placement: number | null;
          playerId: number;
          ratingSum: number;
          tierSlug: string;
        });

      if (!rmrEntry.date || row.matchDate > rmrEntry.date) {
        rmrEntry.date = row.matchDate;
      }
      rmrEntry.maps += 1;
      rmrEntry.placement =
        rmrEntry.placement == null || row.placement == null
          ? (rmrEntry.placement ?? row.placement)
          : Math.min(rmrEntry.placement, row.placement);
      rmrEntry.ratingSum += rating;
      rmrEventStats.set(rmrKey, rmrEntry);
    }

    if (impact <= 0) {
      return;
    }

    const opponentElo = row.opponentElo == null ? null : Number(row.opponentElo);
    const opponentFactor =
      opponentElo == null || !Number.isFinite(opponentElo)
        ? 1
        : 1 + Math.max(-0.08, Math.min(0.12, (opponentElo - 1800) / 2500));
    const isPressureTier = isTopPlayersOfYearPressureTier(row.tierSlug, row.placement);
    const pressureFactor = isPressureTier ? 1.12 : 1;
    const isBigEvent = isTopPlayersOfYearBigEvent(row.tierSlug);
    const key = `${row.playerId}:${getTopPlayersOfYearEventKey(row)}`;
    const eventEntry =
      eventStats.get(key) ||
      ({
        competitionId: row.competitionId,
        firstDate: row.matchDate || null,
        federationSlug: row.federationSlug,
        impact,
        latestDate: row.matchDate || null,
        maps: 0,
        placement: row.placement,
        playerId: row.playerId,
        primaryTierSlug: row.tierSlug,
        ratingSum: 0,
        tierSlug: row.tierSlug,
      } satisfies {
        competitionId: number;
        firstDate: Date | null;
        federationSlug: string;
        impact: number;
        latestDate: Date | null;
        maps: number;
        placement: number | null;
        playerId: number;
        primaryTierSlug: string;
        ratingSum: number;
        tierSlug: string;
      });
    if (!eventEntry.firstDate || row.matchDate < eventEntry.firstDate) {
      eventEntry.firstDate = row.matchDate;
    }
    if (!eventEntry.latestDate || row.matchDate > eventEntry.latestDate) {
      eventEntry.latestDate = row.matchDate;
    }
    eventEntry.competitionId = getTopPlayersOfYearPrimaryCompetitionId(
      eventEntry.competitionId,
      eventEntry.primaryTierSlug,
      row.competitionId,
      row.tierSlug,
    );
    eventEntry.impact = Math.max(eventEntry.impact, impact);
    eventEntry.maps += 1;
    eventEntry.placement =
      eventEntry.placement == null || row.placement == null
        ? (eventEntry.placement ?? row.placement)
        : Math.min(eventEntry.placement, row.placement);
    eventEntry.ratingSum += rating;
    if (
      getTopPlayersOfYearEventWeight(row.tierSlug) >=
      getTopPlayersOfYearEventWeight(eventEntry.primaryTierSlug)
    ) {
      eventEntry.primaryTierSlug = row.tierSlug;
      eventEntry.tierSlug = row.tierSlug;
    }
    eventStats.set(key, eventEntry);

    player.maps += 1;
    player.rawRatingSum += rating;
    player.weightedRatingSum += rating * impact * pressureFactor * opponentFactor;
    player.weightedRatingMaps += impact * pressureFactor * opponentFactor;
    player.weightedMaps += impact;

    if (pressureFactor > 1) {
      player.pressureRatingSum += rating;
      player.pressureMaps += 1;

      const ownScore = row.ownScore == null ? null : Number(row.ownScore);
      const opponentScore = row.opponentScore == null ? null : Number(row.opponentScore);
      const ownResult = row.ownResult == null ? null : Number(row.ownResult);
      const matchWon =
        ownResult == null || !Number.isFinite(ownResult)
          ? ownScore != null && opponentScore != null
            ? ownScore > opponentScore
            : null
          : ownResult === Constants.MatchResult.WIN;
      const pressureKey = `${row.playerId}:${row.matchId}`;
      const pressureEntry =
        pressureMatchStats.get(pressureKey) ||
        ({
          competitionId: row.competitionId,
          date: row.matchDate || null,
          maps: 0,
          opponentScore:
            opponentScore != null && Number.isFinite(opponentScore) ? opponentScore : null,
          opponentTeamId: row.opponentTeamId,
          opponentTeamName: row.opponentTeamName,
          playerId: row.playerId,
          ratingSum: 0,
          round: row.round,
          teamScore: ownScore != null && Number.isFinite(ownScore) ? ownScore : null,
          tierSlug: row.tierSlug,
          totalRounds: row.totalRounds,
          won: matchWon,
        } satisfies {
          competitionId: number;
          date: Date | null;
          maps: number;
          opponentScore: number | null;
          opponentTeamId: number | null;
          opponentTeamName: string | null;
          playerId: number;
          ratingSum: number;
          round: number | null;
          teamScore: number | null;
          tierSlug: string;
          totalRounds: number | null;
          won: boolean | null;
        });

      pressureEntry.maps += 1;
      pressureEntry.ratingSum += rating;
      pressureMatchStats.set(pressureKey, pressureEntry);
    }

    if (impact >= 1.2) {
      player.eliteMaps += 1;
    }

    if (isBigEvent) {
      player.bigEventMaps += 1;
      player.bigEventRatingSum += rating;
      player.bigEventRatingMaps += 1;
    }

    if (opponentElo != null && Number.isFinite(opponentElo)) {
      player.opponentEloSum += opponentElo;
      player.opponentEloMaps += 1;
    }

    playerStats.set(row.playerId, player);
  });

  const eventConsistency = new Map<number, number>();
  const eventSummary = new Map<
    number,
    {
      bestEvent: TopPlayerOfYearCandidate['bestEvent'];
      bestEventScore: number;
      weakEvent: TopPlayerOfYearCandidate['weakEvent'];
      strongEventCount: number;
      weakEventCount: number;
    }
  >();
  eventStats.forEach((eventEntry, key) => {
    const playerId = Number(key.split(':')[0]);
    const rating = eventEntry.maps ? eventEntry.ratingSum / eventEntry.maps : 0;
    const currentSummary =
      eventSummary.get(playerId) ||
      ({
        bestEvent: null,
        bestEventScore: 0,
        weakEvent: null,
        strongEventCount: 0,
        weakEventCount: 0,
      } satisfies {
        bestEvent: TopPlayerOfYearCandidate['bestEvent'];
        bestEventScore: number;
        weakEvent: TopPlayerOfYearCandidate['weakEvent'];
        strongEventCount: number;
        weakEventCount: number;
      });
    const eventScore = rating * eventEntry.impact * Math.min(1, eventEntry.maps / 4);

    if (eventEntry.impact >= 0.7 && eventEntry.maps >= 2 && rating >= 1.05) {
      eventConsistency.set(playerId, (eventConsistency.get(playerId) || 0) + 1);
    }

    if (eventEntry.impact >= 0.7 && eventEntry.maps >= 2) {
      if (rating >= 1.1) {
        currentSummary.strongEventCount += 1;
      } else if (rating < 1) {
        currentSummary.weakEventCount += 1;
      }

      if (!currentSummary.weakEvent || rating < currentSummary.weakEvent.rating) {
        currentSummary.weakEvent = {
          competitionId: eventEntry.competitionId,
          date: eventEntry.latestDate,
          name: getTopPlayersOfYearEventName(eventEntry.tierSlug),
          maps: eventEntry.maps,
          placement: eventEntry.placement,
          rating,
        };
      }
    }

    if (
      eventEntry.maps >= 2 &&
      (!currentSummary.bestEvent || eventScore > currentSummary.bestEventScore)
    ) {
      currentSummary.bestEventScore = eventScore;
      currentSummary.bestEvent = {
        competitionId: eventEntry.competitionId,
        date: eventEntry.latestDate,
        name: getTopPlayersOfYearEventName(eventEntry.tierSlug),
        maps: eventEntry.maps,
        placement: eventEntry.placement,
        rating,
      };
    }

    eventSummary.set(playerId, currentSummary);
  });

  const rmrEventByPlayer = new Map<number, TopPlayerOfYearCandidate['rmrEvent']>();
  rmrEventStats.forEach((eventEntry) => {
    if (eventEntry.maps < 2) {
      return;
    }

    const rating = eventEntry.ratingSum / eventEntry.maps;
    const candidate = {
      competitionId: eventEntry.competitionId,
      date: eventEntry.date,
      name: getTopPlayersOfYearEventName(eventEntry.tierSlug),
      maps: eventEntry.maps,
      placement: eventEntry.placement,
      rating,
    } satisfies NonNullable<TopPlayerOfYearCandidate['rmrEvent']>;
    const current = rmrEventByPlayer.get(eventEntry.playerId);
    const currentPlacement = current?.placement ?? Number.POSITIVE_INFINITY;
    const candidatePlacement = candidate.placement ?? Number.POSITIVE_INFINITY;

    if (
      !current ||
      candidatePlacement < currentPlacement ||
      (candidatePlacement === currentPlacement && candidate.rating > current.rating)
    ) {
      rmrEventByPlayer.set(eventEntry.playerId, candidate);
    }
  });

  const pressureMatchByPlayer = new Map<number, TopPlayerOfYearCandidate['signatureMatch']>();
  const pressureMatchScore = (match: NonNullable<TopPlayerOfYearCandidate['signatureMatch']>) =>
    match.rating * Math.min(1.3, Math.max(1, match.maps / 2)) +
    (match.won ? 0.08 : 0) +
    (match.round != null && match.totalRounds != null
      ? Math.max(0, match.round / Math.max(1, match.totalRounds)) * 0.05
      : 0);

  pressureMatchStats.forEach((matchEntry) => {
    if (matchEntry.maps < 1) {
      return;
    }

    const rating = matchEntry.ratingSum / matchEntry.maps;

    if (rating < 1.05) {
      return;
    }

    const candidate = {
      competitionId: matchEntry.competitionId,
      date: matchEntry.date,
      maps: matchEntry.maps,
      name: getTopPlayersOfYearEventName(matchEntry.tierSlug),
      opponentScore: matchEntry.opponentScore,
      opponentTeamId: matchEntry.opponentTeamId,
      opponentTeamName: matchEntry.opponentTeamName,
      rating,
      round: matchEntry.round,
      teamScore: matchEntry.teamScore,
      totalRounds: matchEntry.totalRounds,
      won: matchEntry.won,
    } satisfies NonNullable<TopPlayerOfYearCandidate['signatureMatch']>;
    const current = pressureMatchByPlayer.get(matchEntry.playerId);

    if (!current || pressureMatchScore(candidate) > pressureMatchScore(current)) {
      pressureMatchByPlayer.set(matchEntry.playerId, candidate);
    }
  });

  allMvps
    .filter((mvp) => getCompetitionYear(mvp.competition) === year)
    .forEach((mvp) => {
      const player = playerStats.get(mvp.playerId);

      if (!player) {
        return;
      }

      player.mvpCount += 1;
      const weight = getTopPlayersOfYearMvpWeight(mvp);

      player.score += weight;
      player.mvpTournaments.push({
        competitionId: mvp.competitionId,
        name: getMvpTournamentLabel(mvp.competition),
        weight,
      });
    });

  const trophyRows = await DatabaseClient.prisma.$queryRaw<TopPlayerOfYearTrophyRow[]>`
    WITH "ChampionshipMatch" AS (
      SELECT
        "Match"."competitionId" AS "competitionId",
        MAX("Match"."date") AS "championshipDate"
      FROM "Match"
      WHERE "Match"."status" = ${Constants.MatchStatus.COMPLETED}
        AND "Match"."competitionId" IS NOT NULL
      GROUP BY "Match"."competitionId"
    )
    SELECT
      "CareerStint"."playerId" AS "playerId",
      "Winner"."teamId" AS "teamId",
      "Team"."name" AS "teamName",
      "Competition"."id" AS "competitionId",
      "Competition"."location" AS "competitionLocation",
      "Competition"."organizer" AS "competitionOrganizer",
      "Competition"."season" AS "competitionSeason",
      "Federation"."slug" AS "federationSlug",
      "Tier"."slug" AS "tierSlug"
    FROM "CompetitionToTeam" AS "Winner"
    INNER JOIN "Competition"
      ON "Competition"."id" = "Winner"."competitionId"
    INNER JOIN "Tier"
      ON "Tier"."id" = "Competition"."tierId"
    INNER JOIN "Federation"
      ON "Federation"."id" = "Competition"."federationId"
    INNER JOIN "ChampionshipMatch"
      ON "ChampionshipMatch"."competitionId" = "Competition"."id"
    INNER JOIN "CareerStint"
      ON "CareerStint"."teamId" = "Winner"."teamId"
      AND "CareerStint"."starter" = true
      AND "CareerStint"."startedAt" <= "ChampionshipMatch"."championshipDate"
      AND (
        "CareerStint"."endedAt" IS NULL
        OR "CareerStint"."endedAt" >= "ChampionshipMatch"."championshipDate"
      )
    LEFT JOIN "Team"
      ON "Team"."id" = "Winner"."teamId"
    WHERE "Competition"."season" = ${season}
      AND "Competition"."status" = ${Constants.CompetitionStatus.COMPLETED}
      AND "Winner"."position" = 1
      AND "Winner"."teamId" IS NOT NULL
      AND "Tier"."slug" IN (${Prisma.join(PLAYER_HONOR_TIER_SLUGS)})
      AND "ChampionshipMatch"."championshipDate" <= ${endOfDay(publishedAt)}
  `;

  trophyRows.forEach((row) => {
    const player = playerStats.get(row.playerId);

    if (!player) {
      return;
    }

    player.trophyByCompetitionId.set(row.competitionId, {
      competitionId: row.competitionId,
      name: getMvpTournamentLabel({
        id: row.competitionId,
        location: row.competitionLocation,
        organizer: row.competitionOrganizer,
        season: row.competitionSeason,
        tier: { slug: row.tierSlug },
      }),
      teamId: row.teamId,
      teamName: row.teamName,
      weight: getTopPlayersOfYearEventWeight(row.tierSlug, row.federationSlug),
    });
  });

  return [...playerStats.values()]
    .filter(
      (player) =>
        player.maps >= TOP_PLAYERS_OF_YEAR_MIN_MAPS &&
        player.bigEventMaps >= TOP_PLAYERS_OF_YEAR_MIN_BIG_EVENT_MAPS,
    )
    .map((player) => {
      const notableRating = player.weightedRatingMaps
        ? player.weightedRatingSum / player.weightedRatingMaps
        : player.maps
          ? player.rawRatingSum / player.maps
          : 0;
      const actualRating = player.actualMaps ? player.actualRatingSum / player.actualMaps : 0;
      const pressureRating = player.pressureMaps
        ? player.pressureRatingSum / player.pressureMaps
        : notableRating;
      const bigEventRating = player.bigEventRatingMaps
        ? player.bigEventRatingSum / player.bigEventRatingMaps
        : notableRating;
      const summary = eventSummary.get(player.playerId);
      const sampleFactor = Math.min(1, player.maps / 45);
      const bigEventSampleFactor = Math.min(1, player.bigEventMaps / 28);
      const eliteSampleFactor = Math.min(1, player.eliteMaps / 24);
      const consistency = Math.min(1, (eventConsistency.get(player.playerId) || 0) / 6);
      const oppositionFactor = player.opponentEloMaps
        ? Math.max(-6, Math.min(8, (player.opponentEloSum / player.opponentEloMaps - 1800) / 45))
        : 0;
      const candidate = {
        ...player,
        actualRating,
        bigEventRating,
      } as TopPlayerOfYearCandidate;
      const bestEvent =
        summary?.bestEvent && isTopPlayersOfYearMeaningfulPeak(summary.bestEvent, candidate)
          ? summary.bestEvent
          : null;
      const weakEvent =
        summary?.weakEvent && isTopPlayersOfYearMeaningfulWeakness(summary.weakEvent, candidate)
          ? summary.weakEvent
          : null;

      return {
        playerId: player.playerId,
        playerName: player.playerName,
        playerAvatar: player.playerAvatar,
        playerCountryCode: player.playerCountryCode,
        playerAge: player.playerAge,
        playerRole: player.playerRole,
        teamId: player.teamId,
        teamName: player.teamName,
        teamBlazon: player.teamBlazon,
        maps: player.maps,
        actualMaps: player.actualMaps,
        actualRating,
        notableRating,
        mvpCount: player.mvpCount,
        eliteMaps: player.eliteMaps,
        bigEventMaps: player.bigEventMaps,
        bigEventRating,
        pressureRating,
        strongEventCount: summary?.strongEventCount || 0,
        weakEventCount: summary?.weakEventCount || 0,
        bestEvent,
        weakEvent,
        rmrEvent: rmrEventByPlayer.get(player.playerId) || null,
        signatureMatch: pressureMatchByPlayer.get(player.playerId) || null,
        teams: [...player.teamsById.values()].sort(
          (a, b) => b.maps - a.maps || a.name.localeCompare(b.name),
        ),
        mvpTournaments: player.mvpTournaments.sort(
          (a, b) => b.weight - a.weight || a.name.localeCompare(b.name),
        ),
        trophies: [...player.trophyByCompetitionId.values()].sort(
          (a, b) => b.weight - a.weight || a.name.localeCompare(b.name),
        ),
        score:
          player.score +
          (bigEventRating - 1) * 185 +
          (notableRating - 1) * 45 +
          (pressureRating - 1) * 35 +
          sampleFactor * 6 +
          bigEventSampleFactor * 28 +
          eliteSampleFactor * 16 +
          consistency * 16 +
          oppositionFactor +
          Math.min(6, player.weightedMaps / 22),
      } satisfies TopPlayerOfYearCandidate;
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.notableRating - a.notableRating ||
        b.mvpCount - a.mvpCount ||
        b.eliteMaps - a.eliteMaps ||
        a.playerName.localeCompare(b.playerName),
    )
    .slice(0, TOP_PLAYERS_OF_YEAR_SIZE);
}

function formatTopPlayersLinkedCompetitionList(
  competitions: Array<{ competitionId: number; name: string }>,
  maxItems = 3,
) {
  return formatLinkedList(
    competitions
      .slice(0, maxItems)
      .map((competition) => topPlayersCompetitionLink(competition.competitionId, competition.name)),
  );
}

export function isTopPlayersOfYearMeaningfulPeak(
  event: TopPlayerOfYearCandidate['bestEvent'],
  player: TopPlayerOfYearCandidate,
) {
  if (!event || event.maps < 2) {
    return false;
  }

  const hasMatchingMvp = player.mvpTournaments.some(
    (mvp) => mvp.competitionId === event.competitionId,
  );
  const clearsBaseline = event.rating >= player.actualRating + 0.04;
  const clearsStandaloneLevel = event.rating >= 1.15;

  return clearsStandaloneLevel && (clearsBaseline || hasMatchingMvp);
}

export function isTopPlayersOfYearMeaningfulWeakness(
  event: TopPlayerOfYearCandidate['weakEvent'],
  player: TopPlayerOfYearCandidate,
) {
  if (!event || event.maps < 2) {
    return false;
  }

  return event.rating <= player.actualRating - 0.1 || event.rating < 0.98;
}

function getTopPlayerRankingPayloadYear(
  item: { eventKey?: string | null; payload?: string | null },
  payload: Record<string, unknown>,
) {
  const payloadYear = Number(payload.year);

  if (Number.isFinite(payloadYear)) {
    return payloadYear;
  }

  const eventYear = item.eventKey?.match(/:top-players:(\d+)$/)?.[1];

  return eventYear ? Number(eventYear) : null;
}

async function getTopPlayersOfYearHistory(year: number) {
  const items = await DatabaseClient.prisma.newsItem.findMany({
    orderBy: [{ publishedAt: 'asc' }, { id: 'asc' }],
    select: {
      eventKey: true,
      payload: true,
    },
    where: {
      eventKey: {
        startsWith: `${AUTO_EVENT_PREFIX}:top-players:`,
      },
    },
  });
  const history = new Map<number, TopPlayerOfYearHistory>();

  items.forEach((item) => {
    if (!item.payload) {
      return;
    }

    let payload: Record<string, unknown>;

    try {
      payload = JSON.parse(item.payload) as Record<string, unknown>;
    } catch {
      return;
    }

    const itemYear = getTopPlayerRankingPayloadYear(item, payload);

    if (!itemYear || itemYear >= year || !Array.isArray(payload.ranking)) {
      return;
    }

    payload.ranking.forEach((entry) => {
      if (!entry || typeof entry !== 'object') {
        return;
      }

      const playerId = Number((entry as { playerId?: unknown }).playerId);
      const rank = Number((entry as { rank?: unknown }).rank);

      if (!Number.isFinite(playerId) || !Number.isFinite(rank)) {
        return;
      }

      const current =
        history.get(playerId) ||
        ({
          appearances: 0,
          bestRank: rank,
          firstYear: itemYear,
          years: [],
        } satisfies TopPlayerOfYearHistory);

      current.appearances += 1;
      current.bestRank = Math.min(current.bestRank, rank);
      current.firstYear = Math.min(current.firstYear, itemYear);
      current.years = [...new Set([...current.years, itemYear])].sort((a, b) => a - b);

      if (!current.lastAppearance || itemYear > current.lastAppearance.year) {
        current.lastAppearance = { rank, year: itemYear };
      }

      if (itemYear === year - 1) {
        current.previousYearRank = rank;
      }

      history.set(playerId, current);
    });
  });

  return history;
}

function getTopPlayersOfYearRankTone(rank: number) {
  if (rank === 1) return 'the top of the list';
  if (rank <= 3) return 'the podium';
  if (rank <= 7) return 'the Player of the Year chasing pack';
  if (rank <= 12) return 'the upper half';
  if (rank <= 16) return 'the No. 13-16 range';

  return 'the cutoff fight';
}

function getTopPlayersOfYearPlacementContext(event?: { placement?: number | null } | null) {
  if (event?.placement == null) {
    return null;
  }

  if (event.placement === 1) return 'during a title run';
  if (event.placement === 2) return 'as his team reached the final';
  if (event.placement <= 4) return 'during a deep run';
  if (event.placement >= 9) return 'as his team exited early';

  return null;
}

function getTopPlayersOfYearRatingColorLabel(rating: number) {
  return rating < 1 ? `a red ${formatRating(rating)}` : `a ${formatRating(rating)}`;
}

function getTopPlayersOfYearComparisonSentence(
  player: TopPlayerOfYearCandidate,
  rank: number,
  comparison: TopPlayerOfYearComparison | undefined,
  seed: number,
) {
  const playerLabel = playerLink({ id: player.playerId, name: player.playerName });
  const above = comparison?.above;
  const below = comparison?.below;
  const target = rank === 1 ? below : above || below;

  if (!target) {
    return `${playerLabel}'s final place came down to the balance of peak, sample, trophies and late-event form.`;
  }

  const targetLabel = playerLink({ id: target.playerId, name: target.playerName });
  const isAbove = target.playerId === above?.playerId;
  const relation = isAbove ? `behind ${targetLabel}` : `ahead of ${targetLabel}`;
  const sameTeam =
    player.teamId != null && target.teamId != null && player.teamId === target.teamId
      ? teamLink({ id: player.teamId, name: player.teamName })
      : null;
  const evidence = (() => {
    if (sameTeam) {
      return `the split inside ${sameTeam}, where ${formatRating(player.bigEventRating)} at big events sat next to ${targetLabel}'s ${formatRating(target.bigEventRating)}`;
    }

    if (player.weakEvent && target.bestEvent?.name === player.weakEvent.name) {
      return `${targetLabel}'s cleaner ${target.bestEvent.name} showing against ${playerLabel}'s ${formatRating(player.weakEvent.rating)}`;
    }

    if (isAbove && target.bigEventRating >= player.bigEventRating + 0.03) {
      return `${targetLabel}'s stronger big-event line, ${formatRating(target.bigEventRating)} to ${formatRating(player.bigEventRating)}`;
    }

    if (!isAbove && player.bigEventRating >= target.bigEventRating + 0.03) {
      return `${playerLabel}'s stronger big-event line, ${formatRating(player.bigEventRating)} to ${formatRating(target.bigEventRating)}`;
    }

    if (isAbove && target.mvpTournaments.length > player.mvpTournaments.length) {
      return `${targetLabel}'s heavier MVP record`;
    }

    if (!isAbove && player.mvpTournaments.length > target.mvpTournaments.length) {
      return `${playerLabel}'s heavier MVP record`;
    }

    if (isAbove && target.bestEvent && !player.bestEvent) {
      return `${targetLabel}'s clearer tournament peak`;
    }

    if (!isAbove && player.bestEvent && !target.bestEvent) {
      return `${playerLabel}'s clearer tournament peak`;
    }

    return `${playerLabel}'s mix of event strength, sample size and playoff form`;
  })();

  return pickVariant(
    [
      `The comparison ${relation} came down to ${evidence}.`,
      `That is where the gap ${relation} was drawn: ${evidence}.`,
      `Placed ${relation}, ${playerLabel}'s case was ultimately judged through ${evidence}.`,
      `${targetLabel} was the natural comparison point, and ${evidence} decided the order.`,
      `The nearby name on the list matters here: ${relation}, ${playerLabel} was separated by ${evidence}.`,
      `The final ordering around No. ${rank} leaned on ${evidence}.`,
      `Against ${targetLabel}, the decisive part of ${playerLabel}'s case was ${evidence}.`,
      `The head-to-head ranking read was less about one stat and more about ${evidence}.`,
      `${playerLabel}'s position ${relation} makes most sense through ${evidence}.`,
      `The line between the two players was thin enough that ${evidence} became important.`,
      `What kept ${playerLabel} ${relation} was ${evidence}.`,
      `The deciding argument near this part of the list was ${evidence}.`,
      `For this slot, ${evidence} mattered more than a simple full-year rating comparison.`,
      `That comparison is also why the rank stops here: ${evidence}.`,
      `The order around ${playerLabel} was shaped by ${evidence}.`,
      `In the end, ${evidence} was the cleanest way to separate ${playerLabel} from ${targetLabel}.`,
      `${playerLabel} did not land ${relation} by accident; ${evidence} gave the placement its logic.`,
      `The adjacent-player argument points back to ${evidence}.`,
      `${targetLabel}'s presence nearby puts the focus on ${evidence}.`,
      `The ranking call was close enough that ${evidence} had to carry real weight.`,
      `The comparison with ${targetLabel} is useful because it highlights ${evidence}.`,
      `${playerLabel}'s case ${relation} was built around ${evidence}.`,
      `The difference between the two resumes was not huge, but ${evidence} was hard to ignore.`,
      `The nearby slot was decided by the detail HLTV-style rankings usually care about most: ${evidence}.`,
      `Compared with ${targetLabel}, ${playerLabel}'s year was defined by ${evidence}.`,
      `The last layer of the argument was ${evidence}, which explains the order around him.`,
      `The ranking did not need a vague tiebreaker; ${evidence} provided a concrete one.`,
      `${playerLabel}'s place ${relation} follows from ${evidence}.`,
      `The surrounding names make the decision clearer, because ${evidence} stands out.`,
      `There was enough overlap with ${targetLabel}'s case that ${evidence} became the separator.`,
      `The article ends up pointing back to ${evidence} as the simplest explanation for No. ${rank}.`,
      `The slot is best understood through ${evidence}, especially next to ${targetLabel}.`,
      `The final comparison reads cleanly through ${evidence}.`,
      `The order was less about a single table line and more about ${evidence}.`,
      `${playerLabel}'s year holds this position because ${evidence}.`,
    ],
    seed,
  );
}

function getTopPlayersOfYearRoleNoun(player: TopPlayerOfYearCandidate) {
  return isAwper({ role: player.playerRole }) ? 'AWPer' : 'rifler';
}

function getTopPlayersOfYearCareerArcSentence(
  player: TopPlayerOfYearCandidate,
  rank: number,
  year: number,
  history: TopPlayerOfYearHistory | undefined,
  seed: number,
  canMentionFirstAppearance: boolean,
) {
  const playerLabel = playerLink({
    id: player.playerId,
    name: player.playerName,
  });
  const agePrefix = player.playerAge ? `${player.playerAge}-year-old ` : '';
  const roleNoun = getTopPlayersOfYearRoleNoun(player);

  if (!history) {
    if (!canMentionFirstAppearance) {
      return null;
    }

    return pickVariant(
      [
        `${playerLabel} makes his first LIGA Top 20 appearance, entering at No. ${rank} after a year that moved the ${agePrefix}${roleNoun} into sharper focus.`,
        `${playerLabel} reaches the year-end list for the first time, arriving at No. ${rank} after turning scattered promise into a full-season breakthrough.`,
        `${playerLabel} is a fresh name in the Top 20, with his No. ${rank} finish marking the first year his output demanded a place among the season's best.`,
      ],
      seed,
    );
  }

  const appearanceNumber = history.appearances + 1;
  const last = history.lastAppearance;
  const previousRank = history.previousYearRank;
  const previousBest = history.bestRank;
  const bestYear = history.years.find((pastYear) => {
    if (!last) return false;

    return pastYear === last.year && last.rank === previousBest;
  });
  const personalBest =
    rank < previousBest
      ? `a new personal best, beating his previous high of No. ${previousBest}${
          bestYear ? ` from ${bestYear}` : ''
        }`
      : rank === previousBest
        ? `matching his personal best of No. ${previousBest}`
        : null;

  if (previousRank) {
    const movement = previousRank - rank;

    if (movement > 0) {
      return pickVariant(
        [
          `${playerLabel} returns to the Top 20 for the ${Util.toOrdinalSuffix(
            appearanceNumber,
          )} time, climbing ${movement} place${movement === 1 ? '' : 's'} from No. ${previousRank} in ${year - 1} to No. ${rank}.`,
          `${playerLabel}'s latest appearance is an upgrade on last year: No. ${previousRank} in ${year - 1}, No. ${rank} now${personalBest ? `, and ${personalBest}` : ''}.`,
          `After landing No. ${previousRank} last year, ${playerLabel} pushes further up the list to No. ${rank}.`,
        ],
        seed + 1,
      );
    }

    if (movement < 0) {
      return pickVariant(
        [
          `${playerLabel} stays in the Top 20 for another year, slipping from No. ${previousRank} in ${year - 1} to No. ${rank} but keeping his place among the season's elite.`,
          `The ${agePrefix}${roleNoun} could not quite repeat last year's No. ${previousRank} finish, but No. ${rank} keeps him on the list for a ${Util.toOrdinalSuffix(
            appearanceNumber,
          )} time.`,
          `${playerLabel} takes a lower slot than his No. ${previousRank} finish from ${year - 1}, though another Top 20 year still underlines his staying power.`,
        ],
        seed + 2,
      );
    }

    return pickVariant(
      [
        `${playerLabel} repeats last year's No. ${rank} finish, giving him back-to-back seasons in the same lane of the Top 20.`,
        `For the second year running, ${playerLabel} lands at No. ${rank}, a rare bit of symmetry in a list that usually shifts around him.`,
        `${playerLabel} holds steady from ${year - 1}, matching his No. ${rank} finish with another year at the same level.`,
      ],
      seed + 3,
    );
  }

  if (last) {
    const yearsAway = year - last.year - 1;

    return pickVariant(
      [
        `${playerLabel} is back on the list for the first time since ${last.year}, returning at No. ${rank}${
          personalBest ? ` with ${personalBest}` : ''
        }.`,
        `After ${yearsAway > 0 ? `${yearsAway} year${yearsAway === 1 ? '' : 's'} away from` : 'missing'} the Top 20, ${playerLabel} reappears at No. ${rank}.`,
        `${playerLabel}'s ${Util.toOrdinalSuffix(
          appearanceNumber,
        )} Top 20 appearance arrives at No. ${rank}, ${last.year < year - 1 ? `ending a gap that stretched back to ${last.year}` : `one year after his previous run`}.`,
      ],
      seed + 4,
    );
  }

  return pickVariant(
    [
      `${playerLabel} adds another Top 20 year to his record, landing at No. ${rank}${
        personalBest ? ` and ${personalBest}` : ''
      }.`,
      `${playerLabel}'s ${Util.toOrdinalSuffix(
        appearanceNumber,
      )} appearance on the list comes at No. ${rank}.`,
    ],
    seed + 5,
  );
}

function getTopPlayersOfYearTeamStory(player: TopPlayerOfYearCandidate, seed: number) {
  const playerLabel = playerLink({
    id: player.playerId,
    name: player.playerName,
  });
  const teams = player.teams.slice(0, 3);

  if (!teams.length) {
    return pickVariant(
      [
        `${playerLabel}'s year did not belong to one long-running team story, which put the spotlight squarely on his own level.`,
        `${playerLabel}'s year was less about one club's rise and more about how often he delivered from server to server.`,
        `There was no single trophy run behind ${playerLabel}, only a season of performances that kept pulling attention back to him.`,
      ],
      seed,
    );
  }

  const teamList = formatLinkedList(
    teams.map((team) => teamLink({ id: team.id, name: team.name })),
  );

  if (player.teams.length > 1) {
    const primaryTeam = teams[0];
    const secondaryTeams = teams.slice(1);
    const secondaryList = formatLinkedList(
      secondaryTeams.map((team) => teamLink({ id: team.id, name: team.name })),
    );
    const primaryShare = player.actualMaps
      ? Math.round((primaryTeam.maps / player.actualMaps) * 100)
      : 0;

    return pickVariant(
      [
        `${playerLabel}'s year crossed team lines, with the form following him through spells at ${teamList}.`,
        `There was more than one badge attached to the year: ${playerLabel} played most often for ${teamLink(
          primaryTeam,
        )}${secondaryList ? ` and still left a mark for ${secondaryList}` : ''}.`,
        `${playerLabel} changed surroundings during the year, but the production did not disappear between ${teamList}.`,
        `${playerLabel} played most of his maps for ${teamLink(primaryTeam)}${
          primaryShare >= 60 ? `, roughly ${primaryShare}% of his maps` : ''
        }, with ${secondaryList || 'another stop'} giving the year a split-roster wrinkle.`,
      ],
      seed + player.teams.length,
    );
  }

  return pickVariant(
    [
      `Most of the evidence came in ${teamList} colors.`,
      `In ${teamList} colors, ${playerLabel} gave the year a steady individual thread.`,
      `${teamList} provided the backdrop, while ${playerLabel}'s best events supplied the headline material.`,
    ],
    seed,
  );
}

function getTopPlayersOfYearPrimaryStrength(player: TopPlayerOfYearCandidate, rank: number) {
  const bigEventDelta = player.bigEventRating - player.actualRating;
  const pressureDelta = player.pressureRating - player.actualRating;

  if (rank === 1 && player.bigEventRating >= player.actualRating - 0.02) return 'coronation';
  if (player.mvpTournaments.length >= 2) return 'award-collector';
  if (player.bestEvent && player.bestEvent.rating >= player.actualRating + 0.14)
    return 'signature-peak';
  if (pressureDelta >= 0.04) return 'big-stage-riser';
  if (player.weakEventCount === 0 && player.strongEventCount >= 4) return 'metronome';
  if (player.trophies.length >= 2) return 'trophy-engine';
  if (player.teams.length > 1) return 'reinvention';
  if (bigEventDelta >= 0.04) return 'big-event-proof';
  if (!player.mvpTournaments.length && player.trophies.length <= 1)
    return 'numbers-without-silverware';

  return 'quietly-elite';
}

function getTopPlayersOfYearCeilingSentence(
  player: TopPlayerOfYearCandidate,
  rank: number,
  seed: number,
) {
  const rankTone = getTopPlayersOfYearRankTone(rank);
  const weakPlacementContext = getTopPlayersOfYearPlacementContext(player.weakEvent);

  if (rank === 1) {
    return pickVariant(
      [
        `That blend of peak, consistency and silverware is what carried him all the way to No. 1.`,
        `The closest challengers could match one part of his year, but not the combination of big-event rating and award-winning tournaments.`,
        `He had the best mix at the top: a strong enough baseline, the right trophies and a tournament peak that mattered.`,
      ],
      seed,
    );
  }

  if (player.weakEvent) {
    return pickVariant(
      [
        `${topPlayersCompetitionLink(
          player.weakEvent.competitionId,
          player.weakEvent.name,
        )} was the roughest entry on the calendar, with ${getTopPlayersOfYearRatingColorLabel(
          player.weakEvent.rating,
        )} rating over ${mapCountLabel(
          player.weakEvent.maps,
        )}${weakPlacementContext ? ` ${weakPlacementContext}` : ''}.`,
        `The most obvious missed opportunity came at ${topPlayersCompetitionLink(
          player.weakEvent.competitionId,
          player.weakEvent.name,
        )}, where he slipped to ${getTopPlayersOfYearRatingColorLabel(
          player.weakEvent.rating,
        )} across ${mapCountLabel(
          player.weakEvent.maps,
        )}${weakPlacementContext ? ` ${weakPlacementContext}` : ''}.`,
        `That low point did not undo the season, but ${formatRating(
          player.weakEvent.rating,
        )} at ${topPlayersCompetitionLink(
          player.weakEvent.competitionId,
          player.weakEvent.name,
        )}${weakPlacementContext ? ` ${weakPlacementContext}` : ''} left him short of the players with cleaner elite-event records.`,
      ],
      seed + 1,
    );
  }

  if (!player.mvpTournaments.length) {
    return pickVariant(
      [
        `The missing piece was an MVP-level tournament, leaving the year solid but short on a single runaway peak.`,
        `Without an MVP medal, he needed repeated quality rather than one defining award run.`,
        `The year lacked the kind of runaway tournament that moved others higher, particularly against players with MVPs on elite stages.`,
      ],
      seed + 2,
    );
  }

  if (!player.trophies.length) {
    return pickVariant(
      [
        `His own level was stronger than the team results around it, which is why the ceiling stopped here.`,
        `A thinner trophy record kept the season from reading like a full Player of the Year challenge.`,
        `The numbers traveled further than the silverware, and that difference shaped the final slot.`,
      ],
      seed + 3,
    );
  }

  return pickVariant(
    [
      `What he missed was one extra heavyweight argument, whether that was an MVP, a better Major or a trophy run built around his numbers.`,
      `The players above him had one more thing to point to: a louder peak, a deeper playoff record or more silverware beside the same level.`,
      `There were not many holes, but there also was not quite enough overwhelming evidence to break into the next tier.`,
    ],
    seed + 4,
  );
}

function compactTopPlayersOfYearAnalysis(sentences: string[]) {
  const seen = new Set<string>();

  return sentences
    .filter((sentence) => {
      const normalized = sentence.trim();

      if (!normalized || seen.has(normalized)) {
        return false;
      }

      seen.add(normalized);
      return true;
    })
    .slice(0, 6)
    .join(' ');
}

function getTopPlayersOfYearOpeningSentence(
  player: TopPlayerOfYearCandidate,
  rank: number,
  year: number,
  seed: number,
) {
  const playerLabel = playerLink({ id: player.playerId, name: player.playerName });
  const teamLabel = player.teamId ? teamLink({ id: player.teamId, name: player.teamName }) : null;
  const roleNoun = getTopPlayersOfYearRoleNoun(player);
  const ageRole = player.playerAge ? `${player.playerAge}-year-old ${roleNoun}` : roleNoun;
  const placement = rank === 1 ? `finishes ${year} as LIGA's No. 1 player` : `places No. ${rank}`;
  const listName = `LIGA's Top 20 players of ${year}`;
  const shortReason = (() => {
    if (player.mvpTournaments.length >= 2) return 'a year stacked with MVP-level peaks';
    if (player.bestEvent) return `his standout run at ${player.bestEvent.name}`;
    if (player.pressureRating >= player.actualRating + 0.03) return 'his late-tournament level';
    if (player.trophies.length >= 2) return 'the trophies that came with his numbers';
    if (player.bigEventRating >= player.actualRating + 0.03)
      return 'how well his level held at bigger events';
    if (!player.trophies.length)
      return 'individual output that outgrew the team results around him';
    return 'a season that kept producing useful evidence';
  })();
  const teamTail = teamLabel ? ` in ${teamLabel} colors` : '';
  const roleTail = `, with the ${ageRole} leaning on ${shortReason}`;

  return pickVariant(
    [
      `${playerLabel} ${placement} in ${listName}${teamTail}${roleTail}.`,
      `${playerLabel} comes in at No. ${rank} in ${listName}${teamTail}, carried by ${shortReason}.`,
      `${playerLabel}'s ${year} campaign earns him No. ${rank} in ${listName}, a spot built on ${shortReason}.`,
      `No. ${rank} in ${listName} goes to ${playerLabel}, whose case rested on ${shortReason}.`,
      `${playerLabel} takes the No. ${rank} spot on ${listName} after a season defined by ${shortReason}.`,
      `${playerLabel} lands at No. ${rank} on the ${year} list, with ${shortReason} at the center of his argument.`,
      `${playerLabel} is ranked No. ${rank} for ${year}, turning ${shortReason} into a Top 20 finish.`,
      `${playerLabel} claims No. ${rank} in ${listName}${teamTail} after making ${shortReason} hard to ignore.`,
      `${playerLabel} settles into No. ${rank} on the year-end list, his place secured by ${shortReason}.`,
      `${playerLabel} reaches No. ${rank} in ${listName}, helped most by ${shortReason}.`,
      `${playerLabel}'s name appears at No. ${rank} on ${listName}, the reward for ${shortReason}.`,
      `${playerLabel} opens his article at No. ${rank} in ${listName}, where ${shortReason} did most of the lifting.`,
      `${playerLabel} is the No. ${rank} player of ${year}, a finish shaped by ${shortReason}.`,
      `${playerLabel} ends the year at No. ${rank}, with ${shortReason} separating him from the next group.`,
      `${playerLabel} breaks into the No. ${rank} slot on ${listName} thanks to ${shortReason}.`,
      `${playerLabel} holds No. ${rank} in the ${year} Top 20, his season pushed forward by ${shortReason}.`,
      `${playerLabel} makes No. ${rank} on ${listName}, and the route there began with ${shortReason}.`,
      `${playerLabel}'s final position is No. ${rank}, a ranking backed by ${shortReason}.`,
      `${playerLabel} finishes No. ${rank} among ${year}'s best, with ${shortReason} giving the year its shape.`,
      `${playerLabel} takes his place at No. ${rank}, where ${shortReason} outweighed the flaws around the year.`,
      `${playerLabel} arrives at No. ${rank} after building a case around ${shortReason}.`,
      `${playerLabel} slots in at No. ${rank} on ${listName}, the product of ${shortReason}.`,
      `${playerLabel} is placed No. ${rank} after a year whose strongest argument was ${shortReason}.`,
      `${playerLabel} finishes the countdown in No. ${rank}, leaning on ${shortReason}.`,
      `${playerLabel} earns the No. ${rank} position as ${shortReason} kept him in the Top 20 conversation.`,
      `${playerLabel}'s No. ${rank} finish comes from ${shortReason}, not from volume alone.`,
      `${playerLabel} takes No. ${rank} in ${listName} after giving the season a clear thread through ${shortReason}.`,
      `${playerLabel} places No. ${rank}, with ${shortReason} making his year read like more than steady numbers.`,
      `${playerLabel} is No. ${rank} for ${year}, a ranking made convincing by ${shortReason}.`,
      `${playerLabel} reaches the No. ${rank} rung after a campaign anchored by ${shortReason}.`,
      `${playerLabel} finishes at No. ${rank} in ${listName}; the headline was ${shortReason}.`,
      `${playerLabel} occupies No. ${rank} after a year in which ${shortReason} kept coming back into view.`,
      `${playerLabel} is the No. ${rank} name on the list, backed first by ${shortReason}.`,
      `${playerLabel} ends up No. ${rank}, with ${shortReason} doing more for his case than volume alone.`,
      `${playerLabel} makes the No. ${rank} spot his own through ${shortReason}.`,
      `${playerLabel} is listed at No. ${rank}, his season held together by ${shortReason}.`,
      `${playerLabel} reaches No. ${rank} after turning ${shortReason} into a year-end argument.`,
      `${playerLabel} closes ${year} at No. ${rank}, with ${shortReason} carrying the clearest weight.`,
      `${playerLabel} is placed No. ${rank} on the year-end ranking after a campaign powered by ${shortReason}.`,
      `${playerLabel} takes the No. ${rank} line in ${listName}${teamTail}, and ${shortReason} explains why.`,
    ],
    seed,
  );
}

function getTopPlayersOfYearRmrSentence(player: TopPlayerOfYearCandidate, seed: number) {
  if (!player.rmrEvent) {
    return null;
  }

  const event = player.rmrEvent;
  const eventLabel = topPlayersCompetitionLink(event.competitionId, event.name);
  const playerLabel = playerLink({ id: player.playerId, name: player.playerName });
  const placementLabel =
    event.placement != null
      ? `${Util.toOrdinalSuffix(event.placement)} place`
      : 'their final place';
  const ratingLabel = `${formatRating(event.rating)} over ${mapCountLabel(event.maps)}`;
  const texture =
    event.placement != null && event.placement <= 3 && event.rating >= 1.05
      ? 'made qualification look controlled'
      : event.placement != null && event.placement >= 8
        ? 'left more tension in the route than the team would have wanted'
        : event.rating < 1
          ? 'was more about surviving than starring'
          : 'kept the Major route on track';

  return pickVariant(
    [
      `The Major path started at ${eventLabel}, where ${playerLabel} posted ${ratingLabel} as ${placementLabel} ${texture}.`,
      `${eventLabel} was the first checkpoint, and ${playerLabel}'s ${ratingLabel} helped turn it into ${placementLabel}.`,
      `Before the Major itself, ${playerLabel} came through ${eventLabel} with ${ratingLabel}, a run that ${texture}.`,
      `${playerLabel}'s RMR did not disappear from the story: ${ratingLabel} at ${eventLabel}, ending in ${placementLabel}.`,
      `The RMR stage gave the year its first pressure test, with ${playerLabel} putting up ${ratingLabel} at ${eventLabel}.`,
      `At ${eventLabel}, ${playerLabel} gave his team ${ratingLabel}; whether smooth or tense, ${placementLabel} kept the campaign alive.`,
      `${eventLabel} set up the Major run, and ${playerLabel}'s ${ratingLabel} meant the qualifier was part of the case rather than a footnote.`,
      `The route through ${eventLabel} ${texture}, with ${playerLabel} averaging ${ratingLabel}.`,
      `${playerLabel} did his RMR work at ${eventLabel}, where ${ratingLabel} was enough for ${placementLabel}.`,
      `The year had an early Major checkpoint at ${eventLabel}: ${ratingLabel} from ${playerLabel} and ${placementLabel} for the team.`,
      `${eventLabel} was not the headline event, but ${playerLabel}'s ${ratingLabel} there helped frame what came next.`,
      `At the RMR, ${playerLabel} kept the story moving with ${ratingLabel} at ${eventLabel}.`,
      `${playerLabel}'s ${eventLabel} showing, ${ratingLabel}, gave the Major campaign a base to work from.`,
      `The Major route went through ${eventLabel}, where ${playerLabel} landed at ${ratingLabel} on the way to ${placementLabel}.`,
      `${eventLabel} mattered because it set the table; ${playerLabel} answered with ${ratingLabel}.`,
      `The qualifier was handled at ${eventLabel}, where ${playerLabel}'s ${ratingLabel} helped deliver ${placementLabel}.`,
      `${playerLabel} came out of ${eventLabel} with ${ratingLabel}, a useful sign before the calendar grew heavier.`,
      `There was RMR evidence too: ${playerLabel} averaged ${ratingLabel} at ${eventLabel}.`,
      `${eventLabel} gave ${playerLabel} an early chance to steady the year, and ${ratingLabel} did the job.`,
      `The first part of the Major story was ${eventLabel}, where ${playerLabel} turned in ${ratingLabel}.`,
      `RMR form can vanish in a Top 20 case, but ${playerLabel}'s ${ratingLabel} at ${eventLabel} belongs in the recap.`,
      `${playerLabel} helped get the Major route through ${eventLabel}, pairing ${ratingLabel} with ${placementLabel}.`,
      `${eventLabel} was either the warning light or the springboard, depending on the read, but ${playerLabel}'s ${ratingLabel} kept it relevant.`,
      `The road to the Major began with ${eventLabel}, and ${playerLabel}'s ${ratingLabel} made that step worth mentioning.`,
      `${playerLabel} did not leave the RMR empty-handed, finishing ${eventLabel} with ${ratingLabel}.`,
      `At ${eventLabel}, ${playerLabel} put down ${ratingLabel}; it was the kind of qualifier work that shaped the later Major story.`,
      `${eventLabel} was not a glamour stop, but ${playerLabel}'s ${ratingLabel} there helped decide how clean the route looked.`,
      `${playerLabel}'s year passed through ${eventLabel}, where ${ratingLabel} was attached to ${placementLabel}.`,
      `The RMR chapter came at ${eventLabel}: ${ratingLabel} for ${playerLabel}, with ${texture}.`,
      `${playerLabel} used ${eventLabel} to keep the Major door open, adding ${ratingLabel} before the bigger stage arrived.`,
      `In the RMR, ${playerLabel} finished ${eventLabel} at ${ratingLabel}, a small but useful piece of the year.`,
      `${eventLabel} gave the campaign its qualifier stress test, and ${playerLabel}'s ${ratingLabel} helped settle it.`,
      `${playerLabel}'s RMR line at ${eventLabel} was ${ratingLabel}, enough to keep the season's Major thread intact.`,
      `The qualifier piece was ${eventLabel}, where ${playerLabel} added ${ratingLabel} to the year-end file.`,
      `${playerLabel} came through the ${eventLabel} checkpoint with ${ratingLabel}, making the route to the Major feel ${event.placement != null && event.placement <= 3 ? 'clean' : 'earned'}.`,
    ],
    seed,
  );
}

function getTopPlayersOfYearWeakEventSentence(player: TopPlayerOfYearCandidate, seed: number) {
  if (!player.weakEvent) {
    return null;
  }

  const event = player.weakEvent;
  const playerLabel = playerLink({ id: player.playerId, name: player.playerName });
  const eventLabel = topPlayersCompetitionLink(event.competitionId, event.name);
  const placementContext = getTopPlayersOfYearPlacementContext(event);
  const ratingLabel = `${formatRating(event.rating)} over ${mapCountLabel(event.maps)}`;

  return pickVariant(
    [
      `The blemish was ${eventLabel}, where ${playerLabel} dropped to ${ratingLabel}${placementContext ? ` ${placementContext}` : ''}.`,
      `${eventLabel} kept the year from looking spotless, with ${playerLabel} finishing that stop at ${ratingLabel}${placementContext ? ` ${placementContext}` : ''}.`,
      `The low point came at ${eventLabel}: ${ratingLabel} from ${playerLabel}${placementContext ? ` ${placementContext}` : ''}.`,
      `${playerLabel}'s roughest tournament was ${eventLabel}, a ${ratingLabel} run that checked the ceiling of his case.`,
      `There was a dip to account for at ${eventLabel}, where ${playerLabel} managed ${ratingLabel}.`,
      `${eventLabel} was the event that pulled against the rest of the resume, as ${playerLabel} posted ${ratingLabel}.`,
      `The year was not clean all the way through; ${eventLabel} left ${playerLabel} with ${ratingLabel}.`,
      `${playerLabel} still had to carry ${eventLabel} in the final read, a ${ratingLabel} showing${placementContext ? ` ${placementContext}` : ''}.`,
      `If there was a counterargument, it started at ${eventLabel}, where ${playerLabel} ended on ${ratingLabel}.`,
      `${eventLabel} gave the ranking a reason to pause, even if ${playerLabel}'s stronger events around it did enough.`,
      `The clearest stumble was ${eventLabel}, where ${playerLabel}'s ${ratingLabel} sat below the rest of his year.`,
      `${playerLabel}'s weaker side showed at ${eventLabel}, a ${ratingLabel} tournament that had to be weighed against his peaks.`,
    ],
    seed,
  );
}

function getTopPlayersOfYearRoundLabel(
  match: NonNullable<TopPlayerOfYearCandidate['signatureMatch']>,
) {
  if (match.round == null) {
    return 'playoff series';
  }

  if (match.totalRounds != null) {
    return Util.parseCupRounds(match.round, match.totalRounds).toLocaleLowerCase();
  }

  return `round ${match.round}`;
}

function getTopPlayersOfYearMatchResultLabel(
  match: NonNullable<TopPlayerOfYearCandidate['signatureMatch']>,
) {
  const opponentLabel = match.opponentTeamName
    ? teamLink({ id: match.opponentTeamId, name: match.opponentTeamName })
    : 'the opposition';
  const scoreline =
    match.teamScore != null && match.opponentScore != null
      ? `${match.teamScore}-${match.opponentScore}`
      : null;

  if (match.won === true) {
    return scoreline ? `${scoreline} win over ${opponentLabel}` : `win over ${opponentLabel}`;
  }

  if (match.won === false) {
    return scoreline ? `${scoreline} loss to ${opponentLabel}` : `loss to ${opponentLabel}`;
  }

  return scoreline
    ? `${scoreline} series against ${opponentLabel}`
    : `series against ${opponentLabel}`;
}

function getTopPlayersOfYearSignatureSentence(player: TopPlayerOfYearCandidate, seed: number) {
  const playerLabel = playerLink({ id: player.playerId, name: player.playerName });

  if (player.signatureMatch) {
    const match = player.signatureMatch;
    const eventLabel = topPlayersCompetitionLink(match.competitionId, match.name);
    const roundLabel = getTopPlayersOfYearRoundLabel(match);
    const resultLabel = getTopPlayersOfYearMatchResultLabel(match);
    const ratingLabel = `${formatRating(match.rating)} over ${mapCountLabel(match.maps)}`;

    return pickVariant(
      [
        `The sharpest playoff snapshot came at ${eventLabel}, where ${playerLabel} posted ${ratingLabel} in a ${roundLabel} ${resultLabel}.`,
        `${eventLabel} supplied the match-level highlight: ${ratingLabel} from ${playerLabel} in a ${roundLabel} ${resultLabel}.`,
        `In the ${eventLabel} ${roundLabel}, ${playerLabel}'s ${ratingLabel} stood out from the ${resultLabel}.`,
        `${playerLabel}'s most useful late-event evidence was a ${ratingLabel} showing in the ${eventLabel} ${roundLabel}, a ${resultLabel}.`,
        `The playoffs gave him a clean reference point at ${eventLabel}: ${ratingLabel} in the ${roundLabel} ${resultLabel}.`,
        `When the bracket tightened at ${eventLabel}, ${playerLabel} answered with ${ratingLabel} in the ${roundLabel} ${resultLabel}.`,
        `${playerLabel} had a playoff line to point at too, putting up ${ratingLabel} during the ${eventLabel} ${roundLabel}.`,
        `The heaviest single series in his case was the ${eventLabel} ${roundLabel}, where ${ratingLabel} came in a ${resultLabel}.`,
        `${eventLabel} gave the article its match beat: ${playerLabel} at ${ratingLabel} in the ${roundLabel} ${resultLabel}.`,
        `${playerLabel}'s late-tournament form showed up in the ${eventLabel} ${roundLabel}, a ${resultLabel} backed by ${ratingLabel}.`,
        `There was a concrete playoff moment behind the numbers, with ${playerLabel} recording ${ratingLabel} in the ${eventLabel} ${roundLabel}.`,
        `The clearest bracket-stage proof came in the ${eventLabel} ${roundLabel}: ${ratingLabel} from ${playerLabel}.`,
        `${playerLabel} did some of his loudest work in a ${roundLabel} ${resultLabel} at ${eventLabel}, finishing it at ${ratingLabel}.`,
        `The ${eventLabel} ${roundLabel} put his year under brighter lights, and ${playerLabel} responded with ${ratingLabel}.`,
        `${playerLabel}'s best pressure series came at ${eventLabel}, where ${ratingLabel} framed the ${roundLabel} ${resultLabel}.`,
        `The story had a playoff anchor in ${eventLabel}'s ${roundLabel}, where ${playerLabel} delivered ${ratingLabel}.`,
        `${eventLabel} was where the match sample became more than background noise: ${ratingLabel} in a ${roundLabel} ${resultLabel}.`,
        `In one of the year's heavier matches, ${playerLabel} hit ${ratingLabel} at ${eventLabel}.`,
        `${playerLabel} found one of his best series under pressure at ${eventLabel}, posting ${ratingLabel} in the ${roundLabel}.`,
        `The ${roundLabel} at ${eventLabel} gave ${playerLabel} a proper article moment, a ${ratingLabel} series in a ${resultLabel}.`,
        `${playerLabel}'s playoff case included ${ratingLabel} at ${eventLabel}, the kind of series that keeps a ranking from feeling abstract.`,
        `At ${eventLabel}, the ${roundLabel} became a showcase for ${playerLabel}: ${ratingLabel} in a ${resultLabel}.`,
        `${playerLabel} added late-event weight with ${ratingLabel} in the ${eventLabel} ${roundLabel}.`,
        `The standout series was not hidden in groups; it came at ${eventLabel}, where ${playerLabel} put up ${ratingLabel}.`,
        `${playerLabel} gave the year a bracket-stage spike at ${eventLabel}, ending the ${roundLabel} at ${ratingLabel}.`,
        `The ${eventLabel} ${roundLabel} was one of the cleaner examples of ${playerLabel}'s level traveling into pressure matches.`,
        `${playerLabel}'s ${ratingLabel} in the ${eventLabel} ${roundLabel} was the sort of detail a Top 20 case needs.`,
        `A ${ratingLabel} ${eventLabel} ${roundLabel} performance gave ${playerLabel}'s year a late-tournament scene.`,
        `${playerLabel} turned the ${eventLabel} ${roundLabel} into a useful reference point with ${ratingLabel}.`,
        `The pressure-match line that jumps out is ${ratingLabel} from ${playerLabel} in the ${eventLabel} ${roundLabel}.`,
        `There was also a direct playoff hook: ${ratingLabel} at ${eventLabel} in a ${roundLabel} ${resultLabel}.`,
        `${playerLabel} did not need the reader to guess at his bracket form; ${eventLabel} gave him ${ratingLabel} in the ${roundLabel}.`,
        `The article's match beat comes from ${eventLabel}, where ${playerLabel}'s ${ratingLabel} carried real playoff weight.`,
      ],
      seed,
    );
  }

  if (player.mvpTournaments.length) {
    const mvpList = formatTopPlayersLinkedCompetitionList(player.mvpTournaments);

    return pickVariant(
      [
        `${mvpList} gave ${playerLabel} award weight, turning his best stretches into more than just strong stat lines.`,
        `The MVP recognition at ${mvpList} supplied the headline moment his season needed.`,
        `${playerLabel}'s MVP work at ${mvpList} made the peak of the year easy to identify.`,
        `The award trail ran through ${mvpList}, where ${playerLabel} converted form into silverware-level recognition.`,
        `His year had an MVP chapter at ${mvpList}, the kind of named peak that separates Top 20 cases.`,
        `${mvpList} was the tournament evidence with an award attached, and ${playerLabel} made it count.`,
        `${playerLabel}'s MVP${player.mvpTournaments.length === 1 ? '' : 's'} at ${mvpList} gave the season its clearest high point.`,
        `The difference between good form and a headline was ${mvpList}, where ${playerLabel} earned MVP honors.`,
      ],
      seed + 1,
    );
  }

  if (player.trophies.length) {
    return pickVariant(
      [
        `The team results gave the numbers weight too, especially the title run${player.trophies.length === 1 ? '' : 's'} at ${formatTopPlayersLinkedCompetitionList(player.trophies)}.`,
        `${playerLabel}'s production came with winning attached, including ${formatTopPlayersLinkedCompetitionList(player.trophies)}.`,
        `The trophy side of the case ran through ${formatTopPlayersLinkedCompetitionList(player.trophies)}, where his form had consequence.`,
        `Winning helped the case, with ${playerLabel} lifting ${formatTopPlayersLinkedCompetitionList(player.trophies)} during the year.`,
      ],
      seed + 2,
    );
  }

  return pickVariant(
    [
      `${playerLabel} did not have one trophy-lifting moment to lean on, so the case had to come from repeated high-level events.`,
      `Without a single defining award run, ${playerLabel}'s year needed its better events to stack up cleanly.`,
      `The thinner trophy record kept the ceiling in check, but ${playerLabel}'s own level still carried enough weight.`,
      `There was no easy award shortcut here; ${playerLabel} made the list through the amount of usable form he produced.`,
    ],
    seed + 3,
  );
}

function getTopPlayersOfYearSeasonSentence(player: TopPlayerOfYearCandidate, seed: number) {
  const playerLabel = playerLink({ id: player.playerId, name: player.playerName });
  const teamSentence = getTopPlayersOfYearTeamStory(player, seed + 1);
  const bestEventLabel = player.bestEvent
    ? topPlayersCompetitionLink(player.bestEvent.competitionId, player.bestEvent.name)
    : null;
  const bestEventText = player.bestEvent
    ? `${formatRating(player.bestEvent.rating)} across ${mapCountLabel(player.bestEvent.maps)} at ${bestEventLabel}`
    : `${formatRating(player.actualRating)} across ${mapCountLabel(player.actualMaps)}`;
  const bigEventText = `${formatRating(player.bigEventRating)} over ${mapCountLabel(player.bigEventMaps)} at big events`;
  const weakText = player.weakEvent
    ? `${topPlayersCompetitionLink(player.weakEvent.competitionId, player.weakEvent.name)} was the low point at ${formatRating(player.weakEvent.rating)}`
    : 'there was no single event that badly bent the year out of shape';

  if (!player.bestEvent) {
    return pickVariant(
      [
        `${teamSentence} Without one runaway tournament, ${playerLabel}'s case came from ${formatRating(player.actualRating)} across ${mapCountLabel(player.actualMaps)} and ${bigEventText}.`,
        `${playerLabel} did not have a single event doing all the work, so the value came from how often he kept the level intact.`,
        `The season was built more on repeat performances than one obvious spike, with ${bigEventText} giving the case its weight.`,
        `There was no one-stop peak to point at, but ${playerLabel} stayed relevant through ${formatRating(player.actualRating)} across ${mapCountLabel(player.actualMaps)}.`,
        `${playerLabel}'s year needed repeated good events to matter, and ${bigEventText} made that pattern credible.`,
        `The appeal was not a single tournament explosion; it was the amount of useful form ${playerLabel} carried through the year.`,
        `${weakText}, but the full read still had ${bigEventText} to support it.`,
        `The case was steadier than spectacular, centered on ${bigEventText} rather than one standout week.`,
        `${playerLabel} kept enough good maps on the board for the year to hold together without a named peak.`,
        `No single event took over the article, which left ${playerLabel}'s full-year ${formatRating(player.actualRating)} and bigger-event form to tell the story.`,
        `This was a volume-and-context case: ${formatRating(player.actualRating)} overall, ${bigEventText}, and enough late-event value to stay on the list.`,
        `${teamSentence} The year then became a question of whether the steady output was enough, and ${bigEventText} answered most of it.`,
      ],
      seed + 4,
    );
  }

  return pickVariant(
    [
      `${teamSentence} The season then found its strongest shape through ${bestEventText}, with ${bigEventText} keeping the wider case alive.`,
      `${playerLabel}'s year reads best as a climb from steady team work into ${bestEventText}.`,
      `The campaign did not rely on empty volume: ${bestEventText} gave it a peak, while ${bigEventText} kept it from being a one-event case.`,
      `Across the year, ${playerLabel} mixed ${bestEventText} with ${bigEventText}.`,
      `The main thread was simple enough: stay useful across the calendar, then spike with ${bestEventText}.`,
      `${playerLabel}'s strongest stretch was ${bestEventText}, but the ranking survived because the bigger-event line stayed at ${bigEventText}.`,
      `The year had a clear middle chapter in ${bestEventText}, and it was backed by ${bigEventText}.`,
      `Rather than one stray hot week, ${playerLabel} paired ${bestEventText} with a bigger-event sample of ${bigEventText}.`,
      `${playerLabel} gave the season a peak in ${bestEventText}; ${weakText}.`,
      `The best version of the year arrived with ${bestEventText}, and the rest of the calendar did enough not to waste it.`,
      `The case sharpened around ${bestEventText}, especially because ${bigEventText} held up behind it.`,
      `${playerLabel}'s year was not perfectly clean, but ${bestEventText} gave it a point of focus.`,
      `A Top 20 case needs a spine, and for ${playerLabel} it was ${bestEventText} plus ${bigEventText}.`,
      `The season moved from baseline value into a real peak through ${bestEventText}.`,
      `${playerLabel} was at his most convincing with ${bestEventText}, a stretch that made the rest of the numbers easier to trust.`,
      `The calendar kept returning to the same idea: ${playerLabel} was useful often, and at his best he reached ${bestEventText}.`,
      `The year did not ask readers to accept one flat rating line; ${bestEventText} was the clearest scene in it.`,
      `${playerLabel}'s best tournament evidence was ${bestEventText}, with ${bigEventText} showing the level traveled beyond that stop.`,
      `The story was strongest when the calendar reached ${bestEventLabel || 'his best events'}, where ${playerLabel} put together ${bestEventText}.`,
      `From event to event, ${playerLabel} kept enough form on the board for ${bestEventText} to become decisive.`,
      `${weakText}, but the better side of the year was still ${bestEventText}.`,
      `The season had texture: ${weakText}, while the high point came through ${bestEventText}.`,
      `${playerLabel}'s case worked because the best event was not isolated from everything else: ${bigEventText} backed it up.`,
      `The strongest proof was ${bestEventText}, and the supporting proof was the ${bigEventText} line.`,
      `The year had a natural peak at ${bestEventLabel || 'his best event'}, where ${playerLabel} reached ${bestEventText}.`,
      `${playerLabel} kept the year moving through ${bigEventText}, then gave it a headline with ${bestEventText}.`,
      `The stronger tournaments did not wash him away, as ${bigEventText} sat close enough to the full-year level.`,
      `There was a proper event story behind the ranking: ${bestEventText}, then enough follow-up form to keep it relevant.`,
      `${playerLabel}'s peak was not mysterious; it was ${bestEventText}.`,
      `The year had more than volume behind it because ${bestEventText} gave it a tournament scene.`,
      `${playerLabel} built his case around ${bestEventText}, while ${weakText}.`,
      `The balance of the year was peak plus survival: ${bestEventText}, with ${weakText}.`,
      `${teamSentence} From there, ${bestEventText} became the article's clearest performance marker.`,
      `The ranking case started with consistency and became convincing through ${bestEventText}.`,
      `${playerLabel}'s year had enough of a route to follow: team context first, ${bestEventText} as the peak, and ${bigEventText} as support.`,
    ],
    seed,
  );
}

export function buildTopPlayersOfYearAnalysis(
  player: TopPlayerOfYearCandidate,
  rank: number,
  year: number,
  history?: TopPlayerOfYearHistory,
  comparison?: TopPlayerOfYearComparison,
) {
  const seed = player.playerId * 31 + rank * 97;
  const openingSentence = getTopPlayersOfYearOpeningSentence(player, rank, year, seed);
  const comparisonSentence = getTopPlayersOfYearComparisonSentence(
    player,
    rank,
    comparison,
    seed + 15,
  );
  const careerSentence = getTopPlayersOfYearCareerArcSentence(
    player,
    rank,
    year,
    history,
    seed,
    year > 2026,
  );
  const rmrSentence = getTopPlayersOfYearRmrSentence(player, seed + 25);
  const weakEventSentence = getTopPlayersOfYearWeakEventSentence(player, seed + 30);
  const seasonSentence = getTopPlayersOfYearSeasonSentence(player, seed + 35);
  const signatureSentence = getTopPlayersOfYearSignatureSentence(player, seed + 45);

  return compactTopPlayersOfYearAnalysis([
    openingSentence,
    ...(careerSentence ? [careerSentence] : []),
    ...(rmrSentence ? [rmrSentence] : []),
    ...(weakEventSentence ? [weakEventSentence] : []),
    seasonSentence,
    signatureSentence,
    comparisonSentence,
  ]);
}

function buildTopPlayersOfYearEntry(_player: TopPlayerOfYearCandidate, rank: number) {
  return `::top-player-ranking{rank=${rank}}`;
}

async function buildTopPlayersOfYearDraft(
  publishedAt: Date,
  allMvps: CompetitionMvpSeed[],
): Promise<NewsDraft | null> {
  if (!isTopPlayersOfYearDate(publishedAt)) {
    return null;
  }

  const year = publishedAt.getFullYear();
  const ranking = await getTopPlayersOfYearCandidates(publishedAt, allMvps);
  const historyByPlayerId = await getTopPlayersOfYearHistory(year);

  if (ranking.length < TOP_PLAYERS_OF_YEAR_SIZE) {
    return null;
  }

  const leader = ranking[0];
  const rankingEntries = ranking.map((player, index) =>
    buildTopPlayersOfYearEntry(player, index + 1),
  );

  return {
    type: 'ARTICLE',
    topic: 'RANKINGS',
    headline: `Top 20 players of ${year}`,
    summary: `${leader.playerName} finishes the year as LIGA's number one player`,
    body: rankingEntries.join('\n\n'),
    image: playerImage(
      { avatar: leader.playerAvatar },
      { blazon: leader.teamBlazon || 'resources://blazonry/noteam.svg' },
    ),
    priority: 96,
    eventKey: `${AUTO_EVENT_PREFIX}:top-players:${year}`,
    payload: {
      flagCode: 'other',
      year,
      methodology: {
        minimumBigEventMaps: TOP_PLAYERS_OF_YEAR_MIN_BIG_EVENT_MAPS,
        minimumMaps: TOP_PLAYERS_OF_YEAR_MIN_MAPS,
        rankingSize: TOP_PLAYERS_OF_YEAR_SIZE,
      },
      relatedPlayers: ranking
        .map((player) =>
          toRelatedPlayer({
            id: player.playerId,
            name: player.playerName,
            avatar: player.playerAvatar,
            country: player.playerCountryCode ? { code: player.playerCountryCode } : null,
          }),
        )
        .filter(Boolean),
      relatedTeams: ranking
        .map((player) =>
          toRelatedTeam({
            id: player.teamId,
            name: player.teamName,
            blazon: player.teamBlazon,
          }),
        )
        .filter(Boolean),
      ranking: ranking.map((player, index) => ({
        rank: index + 1,
        playerId: player.playerId,
        playerName: player.playerName,
        playerAvatar: player.playerAvatar,
        teamId: player.teamId,
        teamName: player.teamName,
        rating: Number(formatRating(player.actualRating)),
        notableRating: Number(formatRating(player.notableRating)),
        bigEventRating: Number(formatRating(player.bigEventRating)),
        pressureRating: Number(formatRating(player.pressureRating)),
        score: Number(player.score.toFixed(2)),
        maps: player.actualMaps,
        notableMaps: player.maps,
        bigEventMaps: player.bigEventMaps,
        eliteMaps: player.eliteMaps,
        mvps: player.mvpCount,
        top20History: historyByPlayerId.get(player.playerId) || null,
        teams: player.teams,
        mvpTournaments: player.mvpTournaments.map((mvp) => ({
          competitionId: mvp.competitionId,
          name: mvp.name,
        })),
        trophies: player.trophies.map((trophy) => ({
          competitionId: trophy.competitionId,
          name: trophy.name,
          teamId: trophy.teamId,
          teamName: trophy.teamName,
        })),
        strongEvents: player.strongEventCount,
        weakEvents: player.weakEventCount,
        bestEvent: player.bestEvent
          ? {
              ...player.bestEvent,
              rating: Number(formatRating(player.bestEvent.rating)),
            }
          : null,
        weakEvent: player.weakEvent
          ? {
              ...player.weakEvent,
              rating: Number(formatRating(player.weakEvent.rating)),
            }
          : null,
        rmrEvent: player.rmrEvent
          ? {
              ...player.rmrEvent,
              rating: Number(formatRating(player.rmrEvent.rating)),
            }
          : null,
        signatureMatch: player.signatureMatch
          ? {
              ...player.signatureMatch,
              rating: Number(formatRating(player.signatureMatch.rating)),
            }
          : null,
        flagCode: toFlagCode(player.playerCountryCode),
        analysis: buildTopPlayersOfYearAnalysis(
          player,
          index + 1,
          year,
          historyByPlayerId.get(player.playerId),
          {
            above: ranking[index - 1] || null,
            below: ranking[index + 1] || null,
          },
        ),
      })),
    },
    publishedAt: new Date(startOfDay(publishedAt).getTime() + 20),
  };
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

  if (startOfDay(storyDate).getTime() !== startOfDay(publishedAt).getTime()) {
    return null;
  }

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

  if (!profile?.simulateNpcMatchStats) {
    return [];
  }

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
  const topPlayersOfYearDraft = includeStatistics
    ? await buildTopPlayersOfYearDraft(publishedAt, allMvps)
    : null;

  return createDrafts([...transferDrafts, ...mvpDrafts, topPlayersOfYearDraft].filter(Boolean));
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
  };
}
