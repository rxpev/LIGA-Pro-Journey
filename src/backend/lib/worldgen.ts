/**
 * World generation.
 *
 * @module
 */
import * as Sqrl from 'squirrelly';
import fs from 'node:fs';
import path from 'node:path';
import * as Autofill from './autofill';
import * as Simulator from './simulator';
import * as WindowManager from './window-manager';
import * as Engine from './engine';
import * as News from './news';
import { syncLeagueSchedule } from '@liga/backend/prisma/seeds/030-leagues';
import Tournament from '@liga/shared/tournament';
import DatabaseClient from './database-client';
import { insertScheduledMatches, ScheduledMatch } from './scheduled-match-writes';
import { numericUpdateBatches, matchStatUpsertBatches, matchPlayerLinkBatches, matchEventInsertBatches } from './simulation-bulk-writes';
import getLocale from './locale';
import {
  addDays,
  addWeeks,
  addYears,
  differenceInDays,
  endOfDay,
  format,
  setDay,
  startOfDay,
  subDays,
} from 'date-fns';
import {
  chunk,
  compact,
  differenceBy,
  flatten,
  groupBy,
  random,
  sample,
  shuffle,
  sortBy,
} from 'lodash';
import { Calendar, Prisma, PrismaClient } from '@prisma/client';
import {
  Constants,
  Chance,
  Bot,
  Eagers,
  is,
  Util,
  UserOfferSettings,
  TierSlug,
  UserRole,
} from '@liga/shared';
import { computeLifetimeStats } from './faceitstats';
import { FACEIT_LEVEL_TEN_MIN_ELO } from './levels';
import {
  FaceitRecruitmentPlan,
  getFaceitRecruitmentPlan,
  isFaceitRecruitmentSpotFit,
} from './faceit-recruitment';
import * as LeagueStats from './leaguestats';
import * as XpEconomy from '@liga/backend/lib/xp-economy';
import { getNpcRetirementChance } from '@liga/backend/lib/retirement';
import { backfillCompetitionLocations } from './competition-locations';
import { upsertCompetitionMvp } from './competition-mvps';
import {
  filterNpcTransferCompatibleCandidates,
  getLowerLeaguePromotionCandidateScore,
  getNpcTransferCompatibilityScore,
  getNpcTransferRecruitmentPolicy,
  getNpcTransferTeamIdentity,
  getUserOfferFitBucket,
  getUserOfferFitScore,
  isNpcTransferCisCountry,
  isNpcTransferCompatible,
  sortNpcTransferCandidatesByFit,
  inferNpcTransferRecruitmentPolicy,
  serializeNpcTransferRecruitmentPolicy,
  USER_OFFER_FIT_BUCKET_WEIGHTS,
  UserOfferFitBucket,
} from './npc-transfer-identity';

type SimulatedTeam = {
  id: number;
  players: Array<{
    id: number;
    xp: number;
    starter: boolean;
    role?: string | null;
    careerStints: Array<{
      endedAt?: Date | string | null;
      startedAt: Date | string;
      starter: boolean;
      teamId?: number | null;
    }>;
  }>;
  careerStints?: Array<{
    endedAt?: Date | string | null;
    startedAt: Date | string;
    starter: boolean;
    teamId?: number | null;
    player: {
      id: number;
      xp: number;
      starter: boolean;
      role?: string | null;
      careerStints: Array<{
        endedAt?: Date | string | null;
        startedAt: Date | string;
        starter: boolean;
        teamId?: number | null;
      }>;
    };
  }>;
};

const IEM_QUALIFIER_SIZE: Partial<Record<Constants.FederationSlug, number>> = {
  [Constants.FederationSlug.ESPORTS_EUROPA]: 111,
  [Constants.FederationSlug.ESPORTS_AMERICAS]: 112,
  [Constants.FederationSlug.ESPORTS_ASIA]: 50,
  [Constants.FederationSlug.ESPORTS_OCE]: 36,
};
type SimulatedCompetitor = {
  id: number;
  result?: number | null;
  score?: number | null;
  team: SimulatedTeam;
};

const NPC_MATCHDAY_INCLUDE = {
  competitors: {
    include: {
      team: {
        include: {
          players: {
            include: {
              careerStints: {
                select: { startedAt: true, endedAt: true, starter: true, teamId: true },
              },
            },
          },
        },
      },
    },
  },
  competition: {
    select: {
      season: true,
      federationId: true,
      federation: true,
      tier: { include: { league: true } },
    },
  },
  games: {
    include: { teams: true },
    orderBy: { num: 'asc' as const },
  },
} satisfies Prisma.MatchInclude;

type NpcMatchdayRecord = Prisma.MatchGetPayload<{ include: typeof NPC_MATCHDAY_INCLUDE }>;
type DeferredNpcMatchPersistence = {
  kind: 'deferred-npc-match-persistence';
  matchId: number;
  teamIds: number[];
  createTransaction: () => Prisma.PrismaPromise<unknown>[];
};

function isDeferredNpcMatchPersistence(value: unknown): value is DeferredNpcMatchPersistence {
  return (value as DeferredNpcMatchPersistence | undefined)?.kind === 'deferred-npc-match-persistence';
}

const NPC_TRANSFER_TEAM_INCLUDE = {
  ...Eagers.team.include,
  country: {
    include: {
      continent: true,
    },
  },
  players: {
    include: {
      country: {
        include: {
          continent: true,
        },
      },
    },
  },
} satisfies Prisma.TeamInclude;

type NpcTransferTeam = Prisma.TeamGetPayload<{ include: typeof NPC_TRANSFER_TEAM_INCLUDE }>;

// Teamless NPCs who have never represented a team are only eligible for a
// team when they have reached FACEIT level 10. Regens are created above this
// threshold, while ordinary unproven FACEIT players stay out of team pools.
const NPC_TEAMLESS_CANDIDATE_ELIGIBILITY: Prisma.PlayerWhereInput = {
  OR: [
    { careerStints: { some: { teamId: { not: null } } } },
    { elo: { gte: FACEIT_LEVEL_TEN_MIN_ELO } },
  ],
};

const NPC_RETIREMENT_CHECK_MIN_DAYS = 45;
const NPC_RETIREMENT_CHECK_MAX_DAYS = 75;
const CAREER_COMPLETION_TIER_SLUGS = [
  TierSlug.IEM_COLOGNE_PLAYOFFS,
  TierSlug.IEM_KRAKOW_PLAYOFFS,
  TierSlug.BLAST_FINALS,
  TierSlug.MAJOR_CHAMPIONS_STAGE,
];
const NPC_REGEN_INTAKE_OFFSETS_DAYS = [45, 105, 165, 225, 285, 345];
// Process a demand-sized intake while keeping a pathological backlog from
// monopolising one calendar tick. The old fixed four-player batch could not
// catch up with several simultaneous vacancies and overfilled tiny demands.
const NPC_REGEN_INTAKE_MAX_BATCH_SIZE = 12;
let npcUrgentRegenInProgress = false;
const REGEN_AVATAR_URL_PREFIX = 'resources://regens/';
// Calendar simulation often handles several matchdays from the same
// competition. Reusing its already-restored tournament avoids repeatedly
// parsing and rebuilding the same large snapshot. The serialized value is
// retained as a version check so an out-of-band database update is never
// hidden by the cache.
const recordedTournamentCache = new Map<
  number,
  {
    serialized: string;
    tournament: Tournament;
  }
>();
let recordedTournamentCacheHits = 0;
let recordedTournamentCacheMisses = 0;
const REGEN_REGION_SETTINGS = {
  asia_east: {
    avatarDirectory: 'asia_east',
    countryCodes: ['CN', 'HK', 'JP', 'KR', 'MN', 'TW'],
    elo: [2200, 3150],
    xp: [20, 50],
  },
  asia_southeast: {
    avatarDirectory: 'asia_southeast',
    countryCodes: ['ID', 'MY', 'PH', 'SG'],
    elo: [2200, 3150],
    xp: [20, 50],
  },
  asia_south: {
    avatarDirectory: 'asia_south',
    countryCodes: ['BD', 'IN', 'PK'],
    elo: [2200, 3150],
    xp: [20, 50],
  },
  asia_mena: {
    avatarDirectory: 'asia_mena',
    countryCodes: ['IR', 'IQ', 'JO', 'LB', 'PS'],
    elo: [2200, 3150],
    xp: [20, 50],
  },
  oceania: {
    avatarDirectory: 'oceania',
    countryCodes: ['AU', 'NZ'],
    elo: [2200, 3000],
    xp: [20, 40],
  },
  south_america: {
    avatarDirectory: 'southamerica',
    countryCodes: ['AR', 'BR', 'CL', 'CO', 'CU', 'HN', 'MX', 'PA', 'UY', 'VE'],
    elo: [2300, 3400],
    xp: [20, 60],
  },
  north_america: {
    countryCodes: ['CA', 'US'],
    elo: [2200, 3300],
    xp: [20, 50],
  },
  cis: {
    // Kazakhstan, Uzbekistan, Kyrgyzstan and Azerbaijan are stored in the
    // Asian continent in some saves, but remain valid CIS nationalities.
    countryCodes: ['RU', 'UA', 'BY', 'KZ', 'UZ', 'GE', 'AM', 'AZ', 'TM', 'TJ', 'KG', 'MD'],
    elo: [2200, 3500],
    xp: [20, 55],
  },
  europe: {
    countryCodes: [],
    elo: [2300, 4200],
    xp: [20, 65],
  },
} as const satisfies Record<
  string,
  {
    avatarDirectory?: string;
    countryCodes: readonly string[];
    elo: readonly [number, number];
    xp: readonly [number, number];
  }
>;
type RegenRegion = keyof typeof REGEN_REGION_SETTINGS;
const REGEN_EXPLICIT_COUNTRY_CODES = Object.values(REGEN_REGION_SETTINGS).flatMap(
  (region) => region.countryCodes,
);
const REGEN_COUNTRY_FILTER: Prisma.CountryWhereInput = {
  OR: [
    { code: { in: REGEN_EXPLICIT_COUNTRY_CODES } },
    // "eu" is the game's synthetic mixed-region nationality, not a country.
    { AND: [{ continent: { code: 'EU' } }, { code: { not: 'eu' } }] },
  ],
};
const REGEN_RIFLE_PERSONALITIES = [
  Constants.PersonalityTemplate.LURK,
  Constants.PersonalityTemplate.ALURK,
  Constants.PersonalityTemplate.PLURK,
  Constants.PersonalityTemplate.ARIFLE,
  Constants.PersonalityTemplate.RIFLE,
  Constants.PersonalityTemplate.PRIFLE,
  Constants.PersonalityTemplate.ENTRY,
];
const REGEN_SNIPER_PERSONALITIES = [
  Constants.PersonalityTemplate.ASNIPER,
  Constants.PersonalityTemplate.SNIPER,
  Constants.PersonalityTemplate.PSNIPER,
];
type RegenAvatar = {
  region: RegenRegion;
  url: string;
};
let regenAvatarPool: RegenAvatar[] | null = null;

function getRegenRegionForCountry(country: { code: string; continent: { code: string } }) {
  const countryCode = country.code.toUpperCase();
  const explicitRegion = (Object.keys(REGEN_REGION_SETTINGS) as RegenRegion[]).find((region) => {
    const countryCodes: readonly string[] = REGEN_REGION_SETTINGS[region].countryCodes;
    return countryCodes.includes(countryCode);
  });

  return explicitRegion || (country.continent.code.toUpperCase() === 'EU' ? 'europe' : null);
}
type SimulatedMatch = {
  id: number;
  date: Date;
  competitors: Array<SimulatedCompetitor | null>;
  games: Array<SimulatedGame>;
};
type SimulatedGame = {
  id: number;
  map?: string | null;
  num: number;
  teams: Array<{
    id: number;
    score?: number | null;
    teamId?: number | null;
  }>;
};

type SimulatedMapInput = {
  game: SimulatedGame;
  score: Simulator.MapScore;
};

type SimulatedParticipant = SimulatedTeam['players'][number] & {
  performanceWeight: number;
};

type SimulatedMatchPlayerGameStat = {
  playerId: number;
  matchId: number;
  gameKey: number;
  kills: number;
  assists: number;
  deaths: number;
};

const simulatedMatchCompetitorsSelect = {
  id: true,
  result: true,
  score: true,
  seed: true,
  team: {
    select: {
      id: true,
      players: {
        select: {
          id: true,
          xp: true,
          starter: true,
          role: true,
          careerStints: {
            select: {
              endedAt: true,
              startedAt: true,
              starter: true,
              teamId: true,
            },
          },
        },
      },
      careerStints: {
        select: {
          endedAt: true,
          startedAt: true,
          starter: true,
          teamId: true,
          player: {
            select: {
              id: true,
              xp: true,
              starter: true,
              role: true,
              careerStints: {
                select: {
                  endedAt: true,
                  startedAt: true,
                  starter: true,
                  teamId: true,
                },
              },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.MatchToTeamSelect;

const simulatedMatchGamesSelect = {
  id: true,
  num: true,
  teams: {
    select: {
      id: true,
      score: true,
      teamId: true,
    },
  },
} satisfies Prisma.GameSelect;

const SIMULATED_WEAPONS = [
  'ak47',
  'm4a1',
  'm4a1_silencer',
  'galilar',
  'famas',
  'mp9',
  'mac10',
  'usp_silencer',
  'glock',
];
const SIMULATED_BACKFILL_MATCH_BATCH_SIZE = 25;

function isDateWithinCareerStint(
  date: Date,
  stint: { endedAt?: Date | string | null; startedAt: Date | string; teamId?: number | null },
  teamId: number,
) {
  const start = new Date(stint.startedAt);
  start.setHours(0, 0, 0, 0);
  const end = stint.endedAt ? new Date(stint.endedAt) : null;
  end?.setHours(23, 59, 59, 999);

  return stint.teamId === teamId && start <= date && (!end || end >= date);
}

function getSimulatedLineup(team: SimulatedTeam, matchDate: Date): Array<SimulatedParticipant> {
  const appendUniquePlayers = <T extends { id: number }>(target: T[], candidates: T[]) => {
    const seen = new Set(target.map((player) => player.id));

    for (const player of candidates) {
      if (seen.has(player.id)) continue;
      target.push(player);
      seen.add(player.id);

      if (target.length >= Constants.Application.SQUAD_MIN_LENGTH) {
        break;
      }
    }

    return target;
  };
  const teamStintPlayers = (team.careerStints ?? [])
    .filter((stint) => isDateWithinCareerStint(matchDate, stint, team.id))
    .sort((a, b) => {
      if (Number(b.starter) !== Number(a.starter)) {
        return Number(b.starter) - Number(a.starter);
      }

      return new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime();
    });
  const historicalByPlayer = new Map<number, (typeof teamStintPlayers)[number]>();

  teamStintPlayers.forEach((stint) => {
    if (!historicalByPlayer.has(stint.player.id)) {
      historicalByPlayer.set(stint.player.id, stint);
    }
  });

  const teamHistoricalLineup = Array.from(historicalByPlayer.values())
    .sort((a, b) => {
      if (Number(b.starter) !== Number(a.starter)) {
        return Number(b.starter) - Number(a.starter);
      }

      return (b.player.xp ?? 0) - (a.player.xp ?? 0);
    })
    .map((stint) => ({
      ...stint.player,
      starter: stint.starter,
    }));
  const playerHistoricalLineup = team.players
    .map((player) => ({
      player,
      stint: player.careerStints
        ?.filter((stint) => isDateWithinCareerStint(matchDate, stint, team.id))
        .sort((a, b) => Number(b.starter) - Number(a.starter))[0],
    }))
    .filter((entry): entry is typeof entry & { stint: NonNullable<typeof entry.stint> } =>
      Boolean(entry.stint),
    )
    .sort((a, b) => {
      if (Number(b.stint.starter) !== Number(a.stint.starter)) {
        return Number(b.stint.starter) - Number(a.stint.starter);
      }

      return (b.player.xp ?? 0) - (a.player.xp ?? 0);
    })
    .map((entry) => ({
      ...entry.player,
      starter: entry.stint.starter,
    }));
  const nearbyHistoricalLineup = (team.careerStints ?? [])
    .filter((stint) => stint.teamId === team.id && new Date(stint.startedAt) <= matchDate)
    .sort((a, b) => {
      if (Number(b.starter) !== Number(a.starter)) {
        return Number(b.starter) - Number(a.starter);
      }

      return new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime();
    })
    .reduce<Array<(typeof teamHistoricalLineup)[number]>>((acc, stint) => {
      if (acc.some((player) => player.id === stint.player.id)) {
        return acc;
      }

      acc.push({
        ...stint.player,
        starter: stint.starter,
      });
      return acc;
    }, []);
  const lineup = appendUniquePlayers(
    appendUniquePlayers(
      appendUniquePlayers([...teamHistoricalLineup], playerHistoricalLineup),
      nearbyHistoricalLineup,
    ),
    team.players,
  );
  const sortedPlayers = lineup.sort((a, b) => {
    if (Number(b.starter) !== Number(a.starter)) {
      return Number(b.starter) - Number(a.starter);
    }

    return (b.xp ?? 0) - (a.xp ?? 0);
  });

  return sortedPlayers.slice(0, Constants.Application.SQUAD_MIN_LENGTH).map((player) => {
    const roleBoost = player.role === Constants.PlayerRole.SNIPER ? 1.08 : 1;
    return {
      ...player,
      performanceWeight: Math.max(1, 25 + (player.xp ?? 0) * 1.8) * roleBoost,
    };
  });
}

function rollWeighted<T extends { performanceWeight: number }>(items: Array<T>) {
  const total = items.reduce((sum, item) => sum + item.performanceWeight, 0);
  let roll = random(0, Math.max(1, Math.round(total * 1000))) / 1000;

  for (const item of items) {
    roll -= item.performanceWeight;
    if (roll <= 0) {
      return item;
    }
  }

  return items[items.length - 1];
}

function getRoundWinnerIds(homeId: number, awayId: number, homeScore: number, awayScore: number) {
  const winners = [...Array(homeScore).fill(homeId), ...Array(awayScore).fill(awayId)];

  return shuffle(winners);
}

function getRoundDeaths(isRoundWinner: boolean, lineupLength: number) {
  if (lineupLength <= 0) {
    return 0;
  }

  if (isRoundWinner) {
    const deaths = Chance.roll({
      0: 24,
      1: 28,
      2: 24,
      3: 16,
      4: 8,
    });

    return Math.min(Number(deaths), Math.max(0, lineupLength - 1));
  }

  if (random(0, 100) < 74) {
    return lineupLength;
  }

  return random(Math.max(1, lineupLength - 3), Math.max(1, lineupLength - 1));
}

function buildSimulatedMatchEvents({
  away,
  home,
  maps,
  matchDate,
  matchId,
}: {
  away: SimulatedCompetitor;
  home: SimulatedCompetitor;
  maps: Array<SimulatedMapInput>;
  matchDate: Date;
  matchId: number;
}) {
  const lineups = {
    [home.team.id]: getSimulatedLineup(home.team, matchDate),
    [away.team.id]: getSimulatedLineup(away.team, matchDate),
  };
  const events: Array<Prisma.MatchEventUncheckedCreateInput> = [];

  if (!lineups[home.team.id].length || !lineups[away.team.id].length) {
    return { events, playerIds: [] };
  }

  for (const map of maps) {
    const homeScore = map.score[home.team.id] ?? 0;
    const awayScore = map.score[away.team.id] ?? 0;
    const roundWinnerIds = getRoundWinnerIds(home.id, away.id, homeScore, awayScore);
    const mapStart = new Date(matchDate.getTime() + map.game.num * 2 * 60 * 60 * 1000);

    roundWinnerIds.forEach((winnerId, roundIdx) => {
      events.push({
        half: Math.floor(roundIdx / 12),
        matchId,
        gameId: map.game.id,
        payload: JSON.stringify({
          type: 'simulated_round',
          score: map.score,
        }),
        result: winnerId === home.id ? 'SFUI_Notice_CT_Win' : 'SFUI_Notice_Terrorists_Win',
        timestamp: new Date(mapStart.getTime() + roundIdx * 90 * 1000),
        winnerId,
      });
    });

    roundWinnerIds.forEach((winnerId, roundIdx) => {
      const winnerTeamId = winnerId === home.id ? home.team.id : away.team.id;
      const loserTeamId = winnerTeamId === home.team.id ? away.team.id : home.team.id;
      const roundTeams = [
        {
          attackers: lineups[winnerTeamId].map((player) => ({
            ...player,
            performanceWeight: player.performanceWeight * 1.08,
          })),
          victims: shuffle(lineups[loserTeamId]).slice(
            0,
            getRoundDeaths(false, lineups[loserTeamId].length),
          ),
        },
        {
          attackers: lineups[loserTeamId].map((player) => ({
            ...player,
            performanceWeight: player.performanceWeight * 0.96,
          })),
          victims: shuffle(lineups[winnerTeamId]).slice(
            0,
            getRoundDeaths(true, lineups[winnerTeamId].length),
          ),
        },
      ];

      let killIdx = 0;

      for (const pair of roundTeams) {
        for (const victim of pair.victims) {
          const attacker = rollWeighted(pair.attackers);
          const timestamp = new Date(
            mapStart.getTime() + roundIdx * 90 * 1000 + (killIdx + 1) * 9000,
          );
          const weapon =
            attacker.role === Constants.PlayerRole.SNIPER && random(0, 100) < 55
              ? 'awp'
              : (sample(SIMULATED_WEAPONS) ?? 'ak47');
          const headshot = weapon === 'awp' ? random(0, 100) < 18 : random(0, 100) < 43;

          events.push({
            attackerId: attacker.id,
            half: Math.floor(roundIdx / 12),
            headshot,
            matchId,
            gameId: map.game.id,
            payload: JSON.stringify({
              type: 'playerkilled',
              simulated: true,
            }),
            timestamp,
            victimId: victim.id,
            weapon,
          });

          if (random(0, 100) < 27) {
            const assistPool = pair.attackers.filter((player) => player.id !== attacker.id);
            const assist = assistPool.length ? rollWeighted(assistPool) : null;

            if (assist) {
              events.push({
                assistId: assist.id,
                half: Math.floor(roundIdx / 12),
                matchId,
                gameId: map.game.id,
                payload: JSON.stringify({
                  type: 'playerassisted',
                  simulated: true,
                }),
                timestamp: new Date(timestamp.getTime() + 1000),
                victimId: victim.id,
              });
            }
          }

          killIdx += 1;
        }
      }
    });
  }

  return {
    events,
    playerIds: Array.from(
      new Set([...lineups[home.team.id], ...lineups[away.team.id]].map((player) => player.id)),
    ),
  };
}

/**
 * Persisting the event stream is necessary for detailed match views. Keep the
 * aggregate table in sync here as well so the calendar never has to rescan all
 * completed matches to derive player statistics later.
 */
function buildSimulatedMatchPlayerGameStats(
  events: Array<Prisma.MatchEventUncheckedCreateInput>,
) {
  const statsByPlayerGame = new Map<string, SimulatedMatchPlayerGameStat>();

  const apply = (
    playerId: number | null | undefined,
    event: Prisma.MatchEventUncheckedCreateInput,
    field: 'kills' | 'assists' | 'deaths',
  ) => {
    if (playerId == null) return;

    const gameKey = event.gameId ?? -event.matchId;
    const key = `${playerId}:${event.matchId}:${gameKey}`;
    const stat = statsByPlayerGame.get(key) || {
      playerId,
      matchId: event.matchId,
      gameKey,
      kills: 0,
      assists: 0,
      deaths: 0,
    };
    stat[field] += 1;
    statsByPlayerGame.set(key, stat);
  };

  for (const event of events) {
    apply(event.attackerId, event, 'kills');
    apply(event.assistId, event, 'assists');
    // Assist events share the victim with their kill event, but do not
    // represent an additional death. This deliberately mirrors the legacy SQL
    // backfill calculation.
    if (event.assistId == null) {
      apply(event.victimId, event, 'deaths');
    }
  }

  return Array.from(statsByPlayerGame.values());
}

/**
 * Prisma 5.1 does not expose createMany for this SQLite model. Insert a safe,
 * parameterized batch instead of issuing one SQL statement for every round,
 * kill, and assist event.
 */
function createSimulatedMatchEventBatches(
  events: Array<Prisma.MatchEventUncheckedCreateInput>,
  client: Pick<Prisma.TransactionClient, '$executeRaw'> = DatabaseClient.prisma,
) {
  return matchEventInsertBatches(events).map((statement) => client.$executeRaw(statement));
}

function createSimulatedMatchPlayerGameStatUpserts(
  events: Array<Prisma.MatchEventUncheckedCreateInput>,
  client: Pick<Prisma.TransactionClient, '$executeRaw'> = DatabaseClient.prisma,
) {
  return matchStatUpsertBatches(buildSimulatedMatchPlayerGameStats(events))
    .map((statement) => client.$executeRaw(statement));
}

function getLegacyBackfillMapScores(
  home: SimulatedCompetitor,
  away: SimulatedCompetitor,
  games: Array<SimulatedGame>,
  activeMapNames: Array<string>,
) {
  const uniqueExistingMaps = Array.from(new Set(games.map((game) => game.map).filter(Boolean)));
  const seriesMapNames =
    games.length > 1 && uniqueExistingMaps.length < games.length
      ? shuffle(activeMapNames.length ? activeMapNames : uniqueExistingMaps).slice(0, games.length)
      : games.map((game) => game.map);

  if (games.length === 1) {
    const hasStoredScore = home.score != null && away.score != null;
    const fallbackWinnerId =
      home.result === Constants.MatchResult.WIN ? home.team.id : away.team.id;
    const fallbackLoserRounds = random(0, 11);
    const score = {
      [home.team.id]: hasStoredScore
        ? home.score
        : fallbackWinnerId === home.team.id
          ? 13
          : fallbackLoserRounds,
      [away.team.id]: hasStoredScore
        ? away.score
        : fallbackWinnerId === away.team.id
          ? 13
          : fallbackLoserRounds,
    };

    return [{ game: games[0], map: seriesMapNames[0] || games[0].map || 'de_dust2', score }];
  }

  const mapWinnerIds = getValidSeriesMapWinnerIds(home, away, games.length);

  return mapWinnerIds.map((winnerId, index) => {
    const loserRounds = random(0, 11);

    return {
      game: games[index],
      map: seriesMapNames[index] || games[index].map || 'de_dust2',
      score: {
        [home.team.id]: winnerId === home.team.id ? 13 : loserRounds,
        [away.team.id]: winnerId === away.team.id ? 13 : loserRounds,
      },
    };
  });
}

function getValidSeriesMapWinnerIds(
  home: SimulatedCompetitor,
  away: SimulatedCompetitor,
  maxMaps: number,
) {
  const homeMapWins = home.score ?? (home.result === Constants.MatchResult.WIN ? 1 : 0);
  const awayMapWins = away.score ?? (away.result === Constants.MatchResult.WIN ? 1 : 0);
  const playedMapCount = Math.max(1, Math.min(maxMaps, homeMapWins + awayMapWins));
  const seriesWinnerId =
    homeMapWins === awayMapWins
      ? home.result === Constants.MatchResult.WIN
        ? home.team.id
        : away.team.id
      : homeMapWins > awayMapWins
        ? home.team.id
        : away.team.id;
  const finalMapWinnerId =
    playedMapCount > 1
      ? seriesWinnerId
      : home.result === Constants.MatchResult.WIN
        ? home.team.id
        : away.team.id;
  const remainingHomeWins = Math.max(0, homeMapWins - (finalMapWinnerId === home.team.id ? 1 : 0));
  const remainingAwayWins = Math.max(0, awayMapWins - (finalMapWinnerId === away.team.id ? 1 : 0));
  const priorMapWinnerIds = shuffle([
    ...Array(remainingHomeWins).fill(home.team.id),
    ...Array(remainingAwayWins).fill(away.team.id),
  ]).slice(0, Math.max(0, playedMapCount - 1));

  return [...priorMapWinnerIds, finalMapWinnerId];
}

function getStoredLegacyBackfillMapScores(
  home: SimulatedCompetitor,
  away: SimulatedCompetitor,
  games: Array<SimulatedGame>,
  activeMapNames: Array<string>,
) {
  const storedMaps = games
    .map((game) => {
      const homeTeam = game.teams.find((team) => team.teamId === home.team.id);
      const awayTeam = game.teams.find((team) => team.teamId === away.team.id);

      if (!homeTeam || !awayTeam || homeTeam.score == null || awayTeam.score == null) {
        return null;
      }

      return {
        game,
        score: {
          [home.team.id]: homeTeam.score,
          [away.team.id]: awayTeam.score,
        } as Simulator.MapScore,
      };
    })
    .filter(Boolean);

  if (storedMaps.length) {
    return storedMaps;
  }

  return getLegacyBackfillMapScores(home, away, games, activeMapNames).filter((map) => !!map.game);
}

function getExpectedSimulatedPlayerIds(
  home: SimulatedCompetitor,
  away: SimulatedCompetitor,
  matchDate: Date,
) {
  return Array.from(
    new Set([
      ...getSimulatedLineup(home.team, matchDate).map((player) => player.id),
      ...getSimulatedLineup(away.team, matchDate).map((player) => player.id),
    ]),
  ).sort((a, b) => a - b);
}

function areSameNumberSet(a: Array<number>, b: Array<number>) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function getSimulatedBackfillBatchWhere(
  where: Prisma.MatchWhereInput,
  after?: { date: Date; id: number },
): Prisma.MatchWhereInput {
  if (!after) {
    return where;
  }

  return {
    AND: [
      where,
      {
        OR: [
          {
            date: {
              gt: after.date,
            },
          },
          {
            date: after.date,
            id: {
              gt: after.id,
            },
          },
        ],
      },
    ],
  };
}

export async function legacyBackfillNpcMatchStats(
  onProgress?: (progress: { completed: number; total: number; percent: number }) => void,
) {
  const profile = await DatabaseClient.prisma.profile.findFirst();

  if (!profile || profile.simulateNpcMatchStats) {
    return { completed: 0, total: 0 };
  }

  const configuredGame = Util.loadSettings(profile.settings).general.game;
  const activeMapPool = await DatabaseClient.prisma.mapPool.findMany({
    where: {
      gameVersion: {
        slug: configuredGame,
      },
      position: {
        not: null,
      },
    },
    orderBy: {
      position: 'asc',
    },
    include: {
      gameMap: true,
    },
  });
  const activeMapNames = activeMapPool.map((poolEntry) => poolEntry.gameMap.name);
  const where: Prisma.MatchWhereInput = {
    status: Constants.MatchStatus.COMPLETED,
    competitionId: { not: null },
    events: { none: {} },
  };
  const total = await DatabaseClient.prisma.match.count({ where });
  let completed = 0;
  let after: { date: Date; id: number } | undefined;

  onProgress?.({ completed, total, percent: total ? 0 : 100 });

  while (true) {
    const matches = await DatabaseClient.prisma.match.findMany({
      where: getSimulatedBackfillBatchWhere(where, after),
      select: {
        id: true,
        date: true,
        competitors: {
          select: simulatedMatchCompetitorsSelect,
          orderBy: {
            seed: 'asc',
          },
        },
        games: {
          select: simulatedMatchGamesSelect,
          orderBy: {
            num: 'asc',
          },
        },
      },
      orderBy: [{ date: 'asc' }, { id: 'asc' }],
      take: SIMULATED_BACKFILL_MATCH_BATCH_SIZE,
    });

    if (!matches.length) {
      break;
    }

    for (const match of matches as Array<SimulatedMatch>) {
      after = { date: match.date, id: match.id };
      const [home, away] = match.competitors;

      if (!home?.team || !away?.team || !match.games.length) {
        completed += 1;
        onProgress?.({ completed, total, percent: total ? (completed / total) * 100 : 100 });
        continue;
      }

      const maps = getLegacyBackfillMapScores(home, away, match.games, activeMapNames).filter(
        (map) => !!map.game,
      );
      const simulatedStats = buildSimulatedMatchEvents({
        away,
        home,
        maps,
        matchDate: match.date,
        matchId: match.id,
      });
      const transaction: Prisma.PrismaPromise<unknown>[] = [
        DatabaseClient.prisma.match.update({
          where: { id: match.id },
          data: {
            players: simulatedStats.playerIds.length
              ? {
                  connect: simulatedStats.playerIds.map((id) => ({ id })),
                }
              : undefined,
            games: {
              update: maps.map(({ game, map, score }) => ({
                where: { id: game.id },
                data: {
                  map,
                  status: Constants.MatchStatus.COMPLETED,
                  teams: {
                    update: game.teams.map((team) => ({
                      where: { id: team.id },
                      data: {
                        score: score[team.teamId ?? 0],
                        result: Simulator.getMatchResult(team.teamId ?? 0, score),
                      },
                    })),
                  },
                },
              })),
            },
          },
        }),
      ];

      if (simulatedStats.events.length) {
        transaction.push(
          ...createSimulatedMatchEventBatches(simulatedStats.events),
          ...createSimulatedMatchPlayerGameStatUpserts(simulatedStats.events),
        );
      }

      await DatabaseClient.prisma.$transaction(transaction);

      completed += 1;
      onProgress?.({ completed, total, percent: total ? (completed / total) * 100 : 100 });
    }
  }

  await DatabaseClient.prisma.profile.update({
    where: { id: profile.id },
    data: {
      simulateNpcMatchStats: true,
    },
  });

  return { completed, total };
}

export async function repairMissingLegacyBackfillNpcMatchStats() {
  const profile = await DatabaseClient.prisma.profile.findFirst();

  if (!profile?.simulateNpcMatchStats) {
    return { repaired: 0 };
  }

  const configuredGame = Util.loadSettings(profile.settings).general.game;
  const activeMapPool = await DatabaseClient.prisma.mapPool.findMany({
    where: {
      gameVersion: {
        slug: configuredGame,
      },
      position: {
        not: null,
      },
    },
    orderBy: {
      position: 'asc',
    },
    include: {
      gameMap: true,
    },
  });
  const activeMapNames = activeMapPool.map((poolEntry) => poolEntry.gameMap.name);
  const where: Prisma.MatchWhereInput = {
    status: Constants.MatchStatus.COMPLETED,
    competitionId: { not: null },
    events: { none: {} },
  };
  let repaired = 0;
  let after: { date: Date; id: number } | undefined;

  while (true) {
    const matches = await DatabaseClient.prisma.match.findMany({
      where: getSimulatedBackfillBatchWhere(where, after),
      select: {
        id: true,
        date: true,
        competitors: {
          select: simulatedMatchCompetitorsSelect,
          orderBy: {
            seed: 'asc',
          },
        },
        games: {
          select: simulatedMatchGamesSelect,
          orderBy: {
            num: 'asc',
          },
        },
      },
      orderBy: [{ date: 'asc' }, { id: 'asc' }],
      take: SIMULATED_BACKFILL_MATCH_BATCH_SIZE,
    });

    if (!matches.length) {
      break;
    }

    for (const match of matches as Array<SimulatedMatch>) {
      after = { date: match.date, id: match.id };
      const [home, away] = match.competitors;

      if (!home?.team || !away?.team || !match.games.length) {
        continue;
      }

      const maps = getLegacyBackfillMapScores(home, away, match.games, activeMapNames).filter(
        (map) => !!map.game,
      );
      const simulatedStats = buildSimulatedMatchEvents({
        away,
        home,
        maps,
        matchDate: match.date,
        matchId: match.id,
      });
      const transaction: Prisma.PrismaPromise<unknown>[] = [
        DatabaseClient.prisma.match.update({
          where: { id: match.id },
          data: {
            players: simulatedStats.playerIds.length
              ? {
                  connect: simulatedStats.playerIds.map((id) => ({ id })),
                }
              : undefined,
            games: {
              update: maps.map(({ game, map, score }) => ({
                where: { id: game.id },
                data: {
                  map,
                  status: Constants.MatchStatus.COMPLETED,
                  teams: {
                    update: game.teams.map((team) => ({
                      where: { id: team.id },
                      data: {
                        score: score[team.teamId ?? 0],
                        result: Simulator.getMatchResult(team.teamId ?? 0, score),
                      },
                    })),
                  },
                },
              })),
            },
          },
        }),
      ];

      if (simulatedStats.events.length) {
        transaction.push(
          ...createSimulatedMatchEventBatches(simulatedStats.events),
          ...createSimulatedMatchPlayerGameStatUpserts(simulatedStats.events),
        );
      }

      await DatabaseClient.prisma.$transaction(transaction);
      repaired += 1;
    }
  }

  return { repaired };
}

export async function repairLegacyBackfillSeriesMaps() {
  const profile = await DatabaseClient.prisma.profile.findFirst();

  if (!profile?.simulateNpcMatchStats) {
    return { repaired: 0 };
  }

  const configuredGame = Util.loadSettings(profile.settings).general.game;
  const activeMapPool = await DatabaseClient.prisma.mapPool.findMany({
    where: {
      gameVersion: {
        slug: configuredGame,
      },
      position: {
        not: null,
      },
    },
    orderBy: {
      position: 'asc',
    },
    include: {
      gameMap: true,
    },
  });
  const activeMapNames = activeMapPool.map((poolEntry) => poolEntry.gameMap.name);

  if (!activeMapNames.length) {
    return { repaired: 0 };
  }

  const matches = await DatabaseClient.prisma.match.findMany({
    where: {
      status: Constants.MatchStatus.COMPLETED,
      competitionId: { not: null },
      events: { some: {} },
      games: {
        some: {},
      },
    },
    select: {
      games: {
        select: {
          id: true,
          num: true,
        },
        orderBy: {
          num: 'asc',
        },
      },
    },
  });
  const tx: Prisma.PrismaPromise<unknown>[] = [];

  matches.forEach((match) => {
    if (match.games.length <= 1) {
      return;
    }

    const seriesMapNames = shuffle(activeMapNames).slice(0, match.games.length);

    match.games.forEach((game, index) => {
      tx.push(
        DatabaseClient.prisma.game.update({
          where: { id: game.id },
          data: {
            map:
              seriesMapNames[index] || activeMapNames[index % activeMapNames.length] || 'de_dust2',
          },
        }),
      );
    });
  });

  if (!tx.length) {
    return { repaired: 0 };
  }

  await DatabaseClient.prisma.$transaction(tx);

  return { repaired: tx.length };
}

export async function repairLegacyBackfillSimulatedLineups() {
  const profile = await DatabaseClient.prisma.profile.findFirst();

  if (!profile?.simulateNpcMatchStats) {
    return { repaired: 0 };
  }

  const configuredGame = Util.loadSettings(profile.settings).general.game;
  const activeMapPool = await DatabaseClient.prisma.mapPool.findMany({
    where: {
      gameVersion: {
        slug: configuredGame,
      },
      position: {
        not: null,
      },
    },
    orderBy: {
      position: 'asc',
    },
    include: {
      gameMap: true,
    },
  });
  const activeMapNames = activeMapPool.map((poolEntry) => poolEntry.gameMap.name);
  const where: Prisma.MatchWhereInput = {
    status: Constants.MatchStatus.COMPLETED,
    competitionId: { not: null },
    events: {
      some: {
        payload: {
          contains: 'simulated',
        },
      },
    },
  };
  let repaired = 0;
  let after: { date: Date; id: number } | undefined;

  while (true) {
    const matches = await DatabaseClient.prisma.match.findMany({
      where: getSimulatedBackfillBatchWhere(where, after),
      select: {
        id: true,
        date: true,
        competitors: {
          select: simulatedMatchCompetitorsSelect,
          orderBy: {
            seed: 'asc',
          },
        },
        games: {
          select: simulatedMatchGamesSelect,
          orderBy: {
            num: 'asc',
          },
        },
        players: {
          select: {
            id: true,
          },
        },
      },
      orderBy: [{ date: 'asc' }, { id: 'asc' }],
      take: SIMULATED_BACKFILL_MATCH_BATCH_SIZE,
    });

    if (!matches.length) {
      break;
    }

    for (const match of matches as Array<SimulatedMatch & { players: Array<{ id: number }> }>) {
      after = { date: match.date, id: match.id };
      const [home, away] = match.competitors;

      if (!home?.team || !away?.team || !match.games.length) {
        continue;
      }

      const currentPlayerIds = match.players.map((player) => player.id).sort((a, b) => a - b);
      const expectedPlayerIds = getExpectedSimulatedPlayerIds(home, away, match.date);

      if (!expectedPlayerIds.length || areSameNumberSet(currentPlayerIds, expectedPlayerIds)) {
        continue;
      }

      const maps = getStoredLegacyBackfillMapScores(home, away, match.games, activeMapNames);
      const simulatedStats = buildSimulatedMatchEvents({
        away,
        home,
        maps,
        matchDate: match.date,
        matchId: match.id,
      });

      await DatabaseClient.prisma.$transaction([
        DatabaseClient.prisma.matchEvent.deleteMany({
          where: {
            matchId: match.id,
          },
        }),
        DatabaseClient.prisma.matchPlayerGameStat.deleteMany({
          where: {
            matchId: match.id,
          },
        }),
        DatabaseClient.prisma.match.update({
          where: { id: match.id },
          data: {
            players: {
              set: simulatedStats.playerIds.map((id) => ({ id })),
            },
          },
        }),
        ...createSimulatedMatchEventBatches(simulatedStats.events),
        ...createSimulatedMatchPlayerGameStatUpserts(simulatedStats.events),
      ]);

      repaired += 1;
    }
  }

  return { repaired };
}

/**
 * Bumps the current season number by one.
 *
 * @function
 */
export async function bumpSeasonNumber() {
  const profile = await DatabaseClient.prisma.profile.findFirst();
  return DatabaseClient.prisma.profile.update({
    where: {
      id: profile.id,
    },
    data: {
      season: {
        increment: 1,
      },
    },
  });
}

/**
 * Rotates one active map with one reserve map for the configured game.
 *
 * @function
 */
export async function rotateMapPoolForNewSeason() {
  const profile = await DatabaseClient.prisma.profile.findFirst();

  if (!profile || (profile.season ?? 0) <= 1) {
    Engine.Runtime.Instance.log.info(
      'Season start: skipping map pool rotation for initial season (season=%d).',
      profile?.season ?? 0,
    );
    return Promise.resolve();
  }

  const gameVersionSlug = Util.loadSettings(profile.settings).general.game;
  const mapPool = await DatabaseClient.prisma.mapPool.findMany({
    where: {
      gameVersion: {
        slug: gameVersionSlug,
      },
    },
    include: {
      gameMap: true,
    },
  });

  const activeMaps = mapPool.filter((poolEntry) => poolEntry.position != null);
  const reserveMaps = mapPool.filter((poolEntry) => poolEntry.position == null);

  const demotedMap = sample(activeMaps);
  const promotedMap = sample(reserveMaps);

  if (!demotedMap || !promotedMap) {
    Engine.Runtime.Instance.log.warn(
      'Skipping map pool rotation for %s. Active maps: %d, reserve maps: %d.',
      gameVersionSlug,
      activeMaps.length,
      reserveMaps.length,
    );
    return Promise.resolve();
  }

  await DatabaseClient.prisma.$transaction([
    DatabaseClient.prisma.mapPool.update({
      where: {
        id: demotedMap.id,
      },
      data: {
        position: null,
      },
    }),
    DatabaseClient.prisma.mapPool.update({
      where: {
        id: promotedMap.id,
      },
      data: {
        position: demotedMap.position,
      },
    }),
  ]);

  const updatedActiveMaps = activeMaps
    .filter((map) => map.id !== demotedMap.id)
    .concat({ ...promotedMap, position: demotedMap.position });

  await News.createMapPoolRotationItem({
    activeMaps: updatedActiveMaps,
    demotedMap,
    gameVersionSlug,
    profileSeason: profile.season,
    promotedMap,
    publishedAt: profile.date || new Date(),
  });

  Engine.Runtime.Instance.log.info(
    'Rotated map pool for %s: moved %s into active and %s into reserve.',
    gameVersionSlug,
    promotedMap.gameMap.name,
    demotedMap.gameMap.name,
  );
}

/**
 * Creates competitions at the start of a new season.
 *
 * @function
 */
export async function createCompetitions() {
  // grab current profile
  const profile = await DatabaseClient.prisma.profile.findFirst();
  const today = profile?.date || new Date();

  // loop through autofill entries and create competitions
  const autofill = Autofill.Items.filter((item) => item.on === Constants.CalendarEntry.SEASON_START)
    .map((item, idx) => ({ item, idx }))
    .sort((a, b) => {
      const priority = {
        [Constants.TierSlug.LEAGUE_PRO]: 0,
        [Constants.TierSlug.LEAGUE_ADVANCED]: 1,
        [Constants.TierSlug.LEAGUE_MAIN]: 2,
        [Constants.TierSlug.LEAGUE_INTERMEDIATE]: 3,
        [Constants.TierSlug.LEAGUE_OPEN]: 4,
      } as Partial<Record<Constants.TierSlug, number>>;

      const pa = priority[a.item.tierSlug as Constants.TierSlug] ?? 100;
      const pb = priority[b.item.tierSlug as Constants.TierSlug] ?? 100;
      return pa - pb || a.idx - b.idx;
    })
    .map(({ item }) => item);
  const tiers = await DatabaseClient.prisma.tier.findMany({
    where: {
      slug: {
        in: autofill.map((item) => item.tierSlug),
      },
    },
    include: Eagers.tier.include,
  });

  const competitions = [];

  for (const item of autofill) {
    const tier = tiers.find((tier) => tier.slug === item.tierSlug);
    if (!tier) continue;

    const created = await Promise.all(
      tier.league.federations.map(async (federation) => {
        if (
          tier.league.slug === Constants.LeagueSlug.ESPORTS_LEAGUE &&
          !Util.isLeagueTierEnabledForFederation(
            tier.slug as Constants.TierSlug,
            federation.slug as Constants.FederationSlug,
          )
        ) {
          return Promise.resolve();
        }

        if (
          tier.slug === Constants.TierSlug.MAJOR_ASIA_RMR &&
          federation.slug !== Constants.FederationSlug.ESPORTS_ASIA
        ) {
          return Promise.resolve();
        }

        if (
          tier.slug === Constants.TierSlug.MAJOR_AMERICAS_RMR &&
          federation.slug !== Constants.FederationSlug.ESPORTS_AMERICAS
        ) {
          return Promise.resolve();
        }

        if (
          [Constants.TierSlug.MAJOR_EUROPE_RMR_A, Constants.TierSlug.MAJOR_EUROPE_RMR_B].includes(
            tier.slug as Constants.TierSlug,
          ) &&
          federation.slug !== Constants.FederationSlug.ESPORTS_EUROPA
        ) {
          return Promise.resolve();
        }

        const majorStageTiers = [
          Constants.TierSlug.MAJOR_CHALLENGERS_STAGE,
          Constants.TierSlug.MAJOR_LEGENDS_STAGE,
          Constants.TierSlug.MAJOR_CHAMPIONS_STAGE,
        ];

        if (
          tier.league.slug === Constants.LeagueSlug.ESPORTS_MAJOR &&
          federation.slug === Constants.FederationSlug.ESPORTS_WORLD &&
          !majorStageTiers.includes(tier.slug as Constants.TierSlug)
        ) {
          return Promise.resolve();
        }

        if (
          majorStageTiers.includes(tier.slug as Constants.TierSlug) &&
          federation.slug !== Constants.FederationSlug.ESPORTS_WORLD
        ) {
          return Promise.resolve();
        }

        if (
          [Constants.TierSlug.CCT_SERIES, Constants.TierSlug.CCT_SERIES_PLAYOFFS].includes(
            tier.slug as Constants.TierSlug,
          ) &&
          federation.slug === Constants.FederationSlug.ESPORTS_OCE
        ) {
          return Promise.resolve();
        }

        if (
          [Constants.TierSlug.CCT_OCE_SERIES, Constants.TierSlug.CCT_OCE_PLAYOFFS].includes(
            tier.slug as Constants.TierSlug,
          ) &&
          federation.slug !== Constants.FederationSlug.ESPORTS_OCE
        ) {
          return Promise.resolve();
        }

        // collect teams and create the competition
        const teams = await Autofill.parse(item, tier, federation);
        const competition = await DatabaseClient.prisma.competition.create({
          data: {
            status: Constants.CompetitionStatus.SCHEDULED,
            season: profile.season,
            federation: {
              connect: {
                id: federation.id,
              },
            },
            tier: {
              connect: {
                id: tier.id,
              },
            },
            competitors: {
              create: teams.map((team) => ({ teamId: team.id })),
            },
          },
          include: {
            tier: true,
          },
        });

        // bail early if this competition relies on
        // a trigger to schedule its start date
        if (competition.tier.triggerOffsetDays) {
          return Promise.resolve();
        }

        // create the calendar entry for when this competition starts
        Engine.Runtime.Instance.log.debug(
          'Scheduling start date for %s - %s...',
          federation.name,
          tier.name,
        );

        return DatabaseClient.prisma.calendar.create({
          data: {
            date: addDays(today, tier.league.startOffsetDays).toISOString(),
            type: Constants.CalendarEntry.COMPETITION_START,
            payload: competition.id.toString(),
          },
        });
      }),
    );

    competitions.push(created);
  }

  await backfillCompetitionLocations(DatabaseClient.prisma as unknown as PrismaClient);

  return competitions;
}

function getSwissMatchSeriesLength(match: Clux.Match, tournament: Tournament) {
  if (!tournament.swiss || match.p[1] < 0) {
    return 1;
  }

  const { options, records } = tournament.swiss.metadata();

  const isDeciderMatch = match.p.some((seed) => {
    if (seed < 1) {
      return false;
    }

    const record = records[seed];

    if (!record) {
      return false;
    }

    const canAdvance = record.wins + 1 >= options.maxWins;
    const canBeEliminated = record.losses + 1 >= options.maxLosses;
    return canAdvance || canBeEliminated;
  });

  return isDeciderMatch ? 3 : 1;
}

const SUCCESSIVE_ROUND_TIERS = new Set<Constants.TierSlug>([
  Constants.TierSlug.BLAST_FINALS,
  Constants.TierSlug.CCT_GLOBAL_FINALS,
  Constants.TierSlug.CCT_OCE_PLAYOFFS,
  Constants.TierSlug.CCT_OCE_SERIES,
  Constants.TierSlug.CCT_SERIES_PLAYOFFS,
  Constants.TierSlug.ESEA_CASH_CUP,
  Constants.TierSlug.ESL_CHALLENGER,
  Constants.TierSlug.ESL_CHALLENGER_PLAYOFFS,
  Constants.TierSlug.IEM_COLOGNE_GROUP_A,
  Constants.TierSlug.IEM_COLOGNE_GROUP_B,
  Constants.TierSlug.IEM_COLOGNE_OPEN_QUALIFIER,
  Constants.TierSlug.IEM_COLOGNE_PLAYOFFS,
  Constants.TierSlug.IEM_KRAKOW_GROUP_A,
  Constants.TierSlug.IEM_KRAKOW_GROUP_B,
  Constants.TierSlug.IEM_KRAKOW_OPEN_QUALIFIER,
  Constants.TierSlug.IEM_KRAKOW_PLAYOFFS,
  Constants.TierSlug.LEAGUE_OPEN_PLAYOFFS,
  Constants.TierSlug.LEAGUE_INTERMEDIATE_PLAYOFFS,
  Constants.TierSlug.LEAGUE_MAIN_PLAYOFFS,
  Constants.TierSlug.LEAGUE_ADVANCED_PLAYOFFS,
  Constants.TierSlug.LEAGUE_PRO,
  Constants.TierSlug.LEAGUE_PRO_PLAYOFFS,
  Constants.TierSlug.MAJOR_CHAMPIONS_STAGE,
]);

const THREE_MATCHES_PER_WEEK_TIERS = new Set<Constants.TierSlug>([
  Constants.TierSlug.LEAGUE_OPEN,
  Constants.TierSlug.LEAGUE_INTERMEDIATE,
  Constants.TierSlug.LEAGUE_MAIN,
  Constants.TierSlug.LEAGUE_ADVANCED,
]);

const DOUBLE_ELIMINATION_TIERS = new Set<Constants.TierSlug>([Constants.TierSlug.BLAST_FINALS]);

const IEM_GROUP_TIERS = new Set<Constants.TierSlug>([
  Constants.TierSlug.IEM_COLOGNE_GROUP_A,
  Constants.TierSlug.IEM_COLOGNE_GROUP_B,
  Constants.TierSlug.IEM_KRAKOW_GROUP_A,
  Constants.TierSlug.IEM_KRAKOW_GROUP_B,
  Constants.TierSlug.MAJOR_ASIA_RMR,
]);

const GROUP_SWISS_TIERS = new Set<Constants.TierSlug>([
  Constants.TierSlug.CCT_OCE_SERIES,
  Constants.TierSlug.ESL_CHALLENGER,
  Constants.TierSlug.LEAGUE_PRO,
]);

const SEEDED_TOURNAMENT_TIERS = new Set<Constants.TierSlug>([
  Constants.TierSlug.BLAST_FINALS,
  Constants.TierSlug.CCT_GLOBAL_FINALS,
  Constants.TierSlug.CCT_OCE_PLAYOFFS,
  Constants.TierSlug.CCT_SERIES,
  Constants.TierSlug.CCT_SERIES_PLAYOFFS,
  Constants.TierSlug.ESL_CHALLENGER,
  Constants.TierSlug.ESL_CHALLENGER_PLAYOFFS,
  Constants.TierSlug.IEM_COLOGNE_GROUP_A,
  Constants.TierSlug.IEM_COLOGNE_GROUP_B,
  Constants.TierSlug.IEM_COLOGNE_PLAYOFFS,
  Constants.TierSlug.IEM_KRAKOW_GROUP_A,
  Constants.TierSlug.IEM_KRAKOW_GROUP_B,
  Constants.TierSlug.IEM_KRAKOW_PLAYOFFS,
  Constants.TierSlug.LEAGUE_OPEN_PLAYOFFS,
  Constants.TierSlug.LEAGUE_INTERMEDIATE_PLAYOFFS,
  Constants.TierSlug.LEAGUE_MAIN_PLAYOFFS,
  Constants.TierSlug.LEAGUE_ADVANCED_PLAYOFFS,
  Constants.TierSlug.LEAGUE_PRO,
  Constants.TierSlug.LEAGUE_PRO_PLAYOFFS,
  Constants.TierSlug.MAJOR_ASIA_RMR,
  Constants.TierSlug.MAJOR_AMERICAS_RMR,
  Constants.TierSlug.MAJOR_EUROPE_RMR_A,
  Constants.TierSlug.MAJOR_EUROPE_RMR_B,
  Constants.TierSlug.MAJOR_CHALLENGERS_STAGE,
  Constants.TierSlug.MAJOR_LEGENDS_STAGE,
  Constants.TierSlug.MAJOR_CHAMPIONS_STAGE,
]);

const MAJOR_RMR_TIERS = new Set<Constants.TierSlug>([
  Constants.TierSlug.MAJOR_EUROPE_RMR_A,
  Constants.TierSlug.MAJOR_EUROPE_RMR_B,
  Constants.TierSlug.MAJOR_AMERICAS_RMR,
  Constants.TierSlug.MAJOR_ASIA_RMR,
]);

const ESEA_DIVISION_TIERS = new Set<Constants.TierSlug>([
  Constants.TierSlug.LEAGUE_OPEN,
  Constants.TierSlug.LEAGUE_INTERMEDIATE,
  Constants.TierSlug.LEAGUE_MAIN,
  Constants.TierSlug.LEAGUE_ADVANCED,
  Constants.TierSlug.LEAGUE_OPEN_PLAYOFFS,
  Constants.TierSlug.LEAGUE_INTERMEDIATE_PLAYOFFS,
  Constants.TierSlug.LEAGUE_MAIN_PLAYOFFS,
  Constants.TierSlug.LEAGUE_ADVANCED_PLAYOFFS,
]);

const LEAGUE_PLAYOFF_TIER_TO_DIVISION: Partial<Record<Constants.TierSlug, Constants.TierSlug>> = {
  [Constants.TierSlug.LEAGUE_OPEN_PLAYOFFS]: Constants.TierSlug.LEAGUE_OPEN,
  [Constants.TierSlug.LEAGUE_INTERMEDIATE_PLAYOFFS]: Constants.TierSlug.LEAGUE_INTERMEDIATE,
  [Constants.TierSlug.LEAGUE_MAIN_PLAYOFFS]: Constants.TierSlug.LEAGUE_MAIN,
  [Constants.TierSlug.LEAGUE_ADVANCED_PLAYOFFS]: Constants.TierSlug.LEAGUE_ADVANCED,
  [Constants.TierSlug.LEAGUE_PRO_PLAYOFFS]: Constants.TierSlug.LEAGUE_PRO,
};

type TournamentCompetitor = Prisma.CompetitionToTeamGetPayload<{
  include: {
    team: true;
  };
}>;

function sortCompetitorsByWorldRanking<T extends TournamentCompetitor>(competitors: T[]): T[] {
  return sortBy(competitors, [
    (competitor) => -(competitor.team?.elo ?? 0),
    (competitor) => competitor.teamId,
    (competitor) => competitor.id,
  ]);
}

function seedGroupsByWorldRanking<T extends TournamentCompetitor>(
  competitors: T[],
  groupSize: number,
): T[] {
  const rankedCompetitors = sortCompetitorsByWorldRanking(competitors);
  const groupCount = Math.max(1, Math.ceil(rankedCompetitors.length / groupSize));
  const groups: T[][] = Array.from({ length: groupCount }, (): T[] => []);

  rankedCompetitors.forEach((competitor, index) => {
    const row = Math.floor(index / groupCount);
    const column = index % groupCount;
    const groupIndex = row % 2 === 0 ? column : groupCount - 1 - column;
    groups[groupIndex].push(competitor);
  });

  return flatten(groups);
}

function seedIemPlayoffCompetitors<T extends TournamentCompetitor>(competitors: T[]): T[] {
  if (competitors.length !== 6) {
    return competitors;
  }

  return [
    competitors[0],
    competitors[3],
    competitors[1],
    competitors[2],
    competitors[4],
    competitors[5],
  ].filter(Boolean) as T[];
}

function seedSwissPlayoffCompetitors<T extends TournamentCompetitor>(competitors: T[]): T[] {
  const unbeaten = sortBy(
    competitors.filter((competitor) => (competitor.win ?? 0) === 3 && (competitor.loss ?? 0) === 0),
    ['position', 'id'],
  );
  const twoLosses = sortBy(
    competitors.filter((competitor) => (competitor.win ?? 0) === 3 && (competitor.loss ?? 0) === 2),
    ['position', 'id'],
  );

  if (unbeaten.length < 2 || twoLosses.length < 2) {
    return competitors;
  }

  const middle = sortBy(
    competitors.filter(
      (competitor) => !unbeaten.includes(competitor) && !twoLosses.includes(competitor),
    ),
    ['loss', 'position', 'id'],
  );

  if (competitors.length === 8) {
    return [
      unbeaten[0],
      unbeaten[1],
      middle[0],
      middle[1],
      middle[2],
      middle[3],
      twoLosses[1],
      twoLosses[0],
    ].filter(Boolean) as T[];
  }

  return [...unbeaten, ...middle, ...twoLosses.reverse()];
}

function getFirstRoundSeedPairs(size: number): number[][] {
  const tournament = new Tournament(size, { short: true });
  tournament.start();
  return tournament.brackets.rounds()[0]?.map((match) => match.p) || [];
}

function seedGroupPlayoffCompetitors<T extends TournamentCompetitor>(
  competitors: T[],
  groupCount: number,
): T[] {
  if (competitors.length !== groupCount * 2) {
    return competitors;
  }

  const winners = competitors.slice(0, groupCount);
  const runnersUp = competitors.slice(groupCount);
  const seeded = new Array<T>(competitors.length);

  winners.forEach((winner, index) => {
    seeded[index] = winner;
  });

  getFirstRoundSeedPairs(competitors.length).forEach(([homeSeed, awaySeed]) => {
    const winnerSeed = homeSeed <= groupCount ? homeSeed : awaySeed;
    const runnerSeed = winnerSeed === homeSeed ? awaySeed : homeSeed;
    const winnerIndex = winnerSeed - 1;
    const runnerIndex = winnerIndex % 2 === 0 ? winnerIndex + 1 : winnerIndex - 1;
    seeded[runnerSeed - 1] = runnersUp[runnerIndex] || runnersUp[winnerIndex];
  });

  return seeded.filter(Boolean);
}

function seedTournamentCompetitors<T extends TournamentCompetitor>(
  competitors: T[],
  competition: Prisma.CompetitionGetPayload<{ include: { tier: { include: { league: true } } } }>,
): T[] {
  const tierSlug = competition.tier.slug as Constants.TierSlug;

  if (
    tierSlug === Constants.TierSlug.IEM_COLOGNE_PLAYOFFS ||
    tierSlug === Constants.TierSlug.IEM_KRAKOW_PLAYOFFS
  ) {
    return seedIemPlayoffCompetitors(competitors);
  }

  if (
    tierSlug === Constants.TierSlug.CCT_SERIES_PLAYOFFS ||
    tierSlug === Constants.TierSlug.MAJOR_CHAMPIONS_STAGE
  ) {
    return seedSwissPlayoffCompetitors(competitors);
  }

  if (
    tierSlug === Constants.TierSlug.ESL_CHALLENGER_PLAYOFFS ||
    tierSlug === Constants.TierSlug.CCT_OCE_PLAYOFFS
  ) {
    return seedGroupPlayoffCompetitors(competitors, 2);
  }

  if (tierSlug === Constants.TierSlug.LEAGUE_PRO_PLAYOFFS) {
    return seedGroupPlayoffCompetitors(competitors, 8);
  }

  if (
    tierSlug === Constants.TierSlug.ESL_CHALLENGER ||
    tierSlug === Constants.TierSlug.CCT_OCE_SERIES ||
    tierSlug === Constants.TierSlug.LEAGUE_PRO
  ) {
    return seedGroupsByWorldRanking(competitors, competition.tier.groupSize || competitors.length);
  }

  if (
    tierSlug === Constants.TierSlug.BLAST_FINALS ||
    tierSlug === Constants.TierSlug.CCT_GLOBAL_FINALS ||
    tierSlug === Constants.TierSlug.MAJOR_ASIA_RMR ||
    Constants.TierSwissConfig[tierSlug]
  ) {
    return sortCompetitorsByWorldRanking(competitors);
  }

  return competitors;
}

function getPrestigeIndexForTierSlug(tierSlug?: string | null) {
  const normalizedTierSlug =
    LEAGUE_PLAYOFF_TIER_TO_DIVISION[tierSlug as Constants.TierSlug] ?? tierSlug;

  return Constants.Prestige.findIndex((prestige) => prestige === normalizedTierSlug);
}

async function resolveUserMatchdayConflict(matchday: Date, targetTier: Constants.TierSlug) {
  const existingMatchday = await DatabaseClient.prisma.calendar.findFirst({
    where: {
      type: Constants.CalendarEntry.MATCHDAY_USER,
      date: matchday.toISOString(),
      completed: false,
    },
  });

  if (!existingMatchday) {
    return matchday;
  }

  const existingMatch = await DatabaseClient.prisma.match.findFirst({
    where: {
      id: Number(existingMatchday.payload),
    },
    include: {
      competition: {
        include: {
          tier: {
            include: {
              league: true,
            },
          },
        },
      },
    },
  });

  const existingTier = existingMatch?.competition?.tier?.slug as Constants.TierSlug | undefined;

  if (!existingTier) {
    return addDays(matchday, 1);
  }

  const rescheduleTarget =
    MAJOR_RMR_TIERS.has(existingTier) && ESEA_DIVISION_TIERS.has(targetTier)
      ? targetTier
      : MAJOR_RMR_TIERS.has(targetTier) && ESEA_DIVISION_TIERS.has(existingTier)
        ? existingTier
        : targetTier;

  // Always avoid two user matchdays on the same day.
  // Prefer moving ESEA division matches over RMR matches when they collide.
  if (rescheduleTarget === targetTier) {
    return addDays(matchday, 1);
  }

  await DatabaseClient.prisma.calendar.update({
    where: { id: existingMatchday.id },
    data: {
      date: addDays(matchday, 1).toISOString(),
    },
  });

  await DatabaseClient.prisma.match.update({
    where: { id: Number(existingMatchday.payload) },
    data: {
      date: addDays(matchday, 1).toISOString(),
    },
  });

  return matchday;
}

/**
 * Creates matchdays.
 *
 * @param matches     The array of matches to create matchdays for.
 * @param tournament  The tournament object the matches belong to.
 * @param competition The competition the matches belong to.
 * @param mapName     The round's map name.
 * @param vetoMapName Placeholder map for user matches that should always use veto.
 * @function
 */
async function createMatchdays(
  matches: Clux.Match[],
  tournament: Tournament,
  competition: Prisma.CompetitionGetPayload<{
    include: { tier: { include: { league: true } }; competitors: true };
  }>,
  mapName?: string,
  vetoMapName?: string,
) {
  // grab current profile
  const profile = await DatabaseClient.prisma.profile.findFirst({
    include: { player: true },
  });
  const configuredGame = profile ? Util.loadSettings(profile.settings).general.game : undefined;
  const activeMapPool = await DatabaseClient.prisma.mapPool.findMany({
    where: {
      gameVersion: configuredGame
        ? {
            slug: configuredGame,
          }
        : undefined,
      position: {
        not: null,
      },
    },
    orderBy: {
      position: 'asc',
    },
    include: {
      gameMap: true,
    },
  });
  const activeMapNames = activeMapPool.map((poolEntry) => poolEntry.gameMap.name);

  let resolvedMapName = mapName;
  let resolvedVetoMapName = vetoMapName;

  if (!resolvedMapName || !resolvedVetoMapName) {
    const fallbackMapName = sample(activeMapNames) || activeMapPool[0]?.gameMap.name || 'de_dust2';

    resolvedMapName = resolvedMapName || fallbackMapName;
    resolvedVetoMapName = resolvedVetoMapName || activeMapPool[0]?.gameMap.name || fallbackMapName;
  }

  const today = profile?.date || new Date();

  // grab user seed (teamless players will not match any competitor)
  const userCompetitorId =
    profile?.teamId != null
      ? competition.competitors.find((competitor) => competitor.teamId === profile.teamId)
      : undefined;
  const userSeed = tournament.getSeedByCompetitorId(userCompetitorId?.id);
  // create the matchdays
  const totalRounds = tournament.$base.rounds().length;
  const newNpcMatches: ScheduledMatch[] = [];

  // Resolve the round in bulk. The former per-match Eagers.match lookup
  // hydrated the entire competition, player rosters, maps and event counts.
  // Scheduling only needs existing IDs, dates and participant IDs.
  const existingMatches = (await Promise.all(chunk(matches, 400).map((batch) =>
    DatabaseClient.prisma.match.findMany({
      where: { competitionId: competition.id, payload: { in: batch.map((match) => JSON.stringify(match.id)) } },
      select: {
        id: true, payload: true, date: true, status: true,
        competitors: { select: { teamId: true } },
        games: { select: { id: true } },
      },
      orderBy: { id: 'asc' },
    }),
  ))).flat();
  const existingByPayload = new Map<string, (typeof existingMatches)[number]>();
  for (const match of existingMatches) {
    if (!existingByPayload.has(match.payload)) existingByPayload.set(match.payload, match);
  }
  const existingEntries = (await Promise.all(chunk(existingMatches, 400).map((batch) =>
    DatabaseClient.prisma.calendar.findMany({
      where: {
        payload: { in: batch.map((match) => String(match.id)) },
        type: { in: [Constants.CalendarEntry.MATCHDAY_NPC, Constants.CalendarEntry.MATCHDAY_USER] },
      },
      orderBy: { id: 'asc' },
    }),
  ))).flat();
  const entriesByPayload = new Map<string, (typeof existingEntries)[number]>();
  for (const entry of existingEntries) {
    if (!entriesByPayload.has(entry.payload)) entriesByPayload.set(entry.payload, entry);
  }

  const results = await Promise.all(
    matches.map(async (match) => {
      // build competitors list
      const competitors = compact(
        match.p.map(
          (seed) =>
            seed > 0 && {
              seed,
              teamId: competition.competitors.find(
                (competitor) => tournament.getCompetitorBySeed(seed) === competitor.id,
              ).teamId,
            },
        ),
      );

      // are both teams ready?
      let status: Constants.MatchStatus;

      switch (competitors.length) {
        case 0:
          status = Constants.MatchStatus.LOCKED;
          break;
        case 1:
          status = Constants.MatchStatus.WAITING;
          break;
        default:
          status = Constants.MatchStatus.READY;
          break;
      }

      // if one of the seeds is `-1` then this is
      // a BYE and the match will not be played
      if (match.p.includes(-1)) {
        status = Constants.MatchStatus.COMPLETED;
      }

      // if there's an existing matchday record then we only need
      // update its status and add competitors if necessary
      const existingMatch = existingByPayload.get(JSON.stringify(match.id));

      if (existingMatch) {
        const nextCalendarType =
          userSeed != null && match.p.includes(userSeed)
            ? Constants.CalendarEntry.MATCHDAY_USER
            : Constants.CalendarEntry.MATCHDAY_NPC;
        const existingEntry = entriesByPayload.get(String(existingMatch.id));
        const missingCompetitors = differenceBy(competitors, existingMatch.competitors, 'teamId');

        if (userSeed != null && match.p.includes(userSeed)) {
          Engine.Runtime.Instance.log.debug(
            'User has new match(id=%d) on %s',
            existingEntry?.id ?? existingMatch.id,
            format(
              existingEntry?.date ?? existingMatch.date,
              Constants.Settings.calendar.calendarDateFormat,
            ),
          );
        }

        const tx: Prisma.PrismaPromise<unknown>[] = [];
        if (missingCompetitors.length || existingMatch.status !== status) {
          tx.push(DatabaseClient.prisma.match.update({
            where: { id: existingMatch.id },
            data: {
              status,
              competitors: {
                create: missingCompetitors,
              },
              games: {
                update: existingMatch.games.map((game) => ({
                  where: { id: game.id },
                  data: {
                    teams: {
                      create: missingCompetitors,
                    },
                  },
                })),
              },
            },
          }));
        }

        if (existingEntry && existingEntry.type !== nextCalendarType) {
          tx.unshift(
            DatabaseClient.prisma.calendar.update({
              where: { id: existingEntry.id },
              data: {
                type: nextCalendarType,
              },
            }),
          );
        } else if (!existingEntry) {
          tx.unshift(
            DatabaseClient.prisma.calendar.create({
              data: {
                type: nextCalendarType,
                date: existingMatch.date.toISOString(),
                payload: String(existingMatch.id),
              },
            }),
          );
        }

        return tx.length ? DatabaseClient.prisma.$transaction(tx) : undefined;
      }

      const roundOffset =
        tournament.brackets &&
        tournament.options &&
        'last' in tournament.options &&
        tournament.options.last === Constants.BracketIdentifier.LOWER &&
        match.id.s === Constants.BracketIdentifier.LOWER
          ? match.id.r + 1
          : match.id.r;
      const isMajorQualifier = competition.tier.league.slug === Constants.LeagueSlug.ESPORTS_MAJOR;
      const hasSuccessivePlayoffSchedule = SUCCESSIVE_ROUND_TIERS.has(
        competition.tier.slug as Constants.TierSlug,
      );
      const hasThreeMatchWeeks =
        competition.tier.league.slug === Constants.LeagueSlug.ESPORTS_LEAGUE &&
        THREE_MATCHES_PER_WEEK_TIERS.has(competition.tier.slug as Constants.TierSlug);
      let matchday: Date;

      if (tournament.iemGroup) {
        matchday = addDays(today, 1);
      } else if (tournament.swiss || tournament.groupSwiss) {
        matchday = addDays(today, 1);
      } else if (hasThreeMatchWeeks) {
        const zeroBasedRoundOffset = Math.max(0, roundOffset - 1);
        matchday = addDays(
          today,
          1 + Math.floor(zeroBasedRoundOffset / 3) * 7 + (zeroBasedRoundOffset % 3) * 2,
        );
      } else if (isMajorQualifier || hasSuccessivePlayoffSchedule) {
        matchday = addDays(today, roundOffset);
      } else {
        matchday = setDay(
          addWeeks(today, roundOffset),
          Number(Chance.roll(Constants.MatchDayWeights[competition.tier.league.slug])),
          { weekStartsOn: 1 },
        );
      }

      if (userSeed != null && match.p.includes(userSeed)) {
        matchday = await resolveUserMatchdayConflict(
          matchday,
          competition.tier.slug as Constants.TierSlug,
        );
      }

      const isUserMatch = !!userSeed && match.p.includes(userSeed);
      const roundMapName = isUserMatch ? resolvedVetoMapName || resolvedMapName : resolvedMapName;

      // how many games in this series?
      let num = tournament.swiss ? getSwissMatchSeriesLength(match, tournament) : 1;

      if (!tournament.swiss && Constants.TierMatchConfig[competition.tier.slug]) {
        const seriesByRound = Constants.TierMatchConfig[competition.tier.slug];

        // bracket configs are ordered from grand-final backwards,
        // while non-bracket tiers use a fixed series length
        if (tournament.brackets) {
          const reverseRoundIdx = totalRounds - match.id.r;
          num = seriesByRound[reverseRoundIdx] ?? seriesByRound[seriesByRound.length - 1] ?? num;
        } else {
          num = seriesByRound[0] ?? num;
        }
      }

      // The Asia RMR uses Bo1 opening matches; every subsequent series in its
      // double-elimination bracket is Bo3.
      if (
        competition.tier.slug === Constants.TierSlug.MAJOR_ASIA_RMR &&
        match.id.s === Constants.BracketIdentifier.UPPER &&
        match.id.r === 1
      ) {
        num = 1;
      }

      const seriesMapNames =
        !isUserMatch && num > 1
          ? shuffle(activeMapNames.length ? activeMapNames : [roundMapName]).slice(0, num)
          : Array.from({ length: num }).map(() => roundMapName);

      // assign map to match
      if (!match.data) {
        match.data = { map: seriesMapNames[0] || roundMapName };
      } else {
        match.data['map'] = seriesMapNames[0] || roundMapName;
      }

      // User matches retain immediate scheduling so conflict resolution can
      // observe their calendar entries. NPC/BYE/locked fixtures are batched.
      if (!isUserMatch) {
        newNpcMatches.push({
          status, totalRounds, round: match.id.r, date: matchday,
          payload: JSON.stringify(match.id), competitionId: competition.id,
          competitors,
          maps: Array.from({ length: num }, (_, idx) => seriesMapNames[idx] || roundMapName),
          calendarType: status === Constants.MatchStatus.COMPLETED ? null : Constants.CalendarEntry.MATCHDAY_NPC,
        });
        return;
      }
      // create match record
      const newMatch = await DatabaseClient.prisma.match.create({
        data: {
          status,
          totalRounds,
          round: match.id.r,
          date: matchday.toISOString(),
          payload: JSON.stringify(match.id),
          competition: {
            connect: {
              id: competition.id,
            },
          },
          competitors: {
            create: competitors,
          },
          games: {
            create: Array.from({ length: num }).map((_, idx) => ({
              status,
              map: seriesMapNames[idx] || roundMapName,
              num: idx,
              teams: {
                create: competitors,
              },
            })),
          },
        },
      });

      // don't schedule the match if it's already
      // been completed (e.g.: BYE week)
      if (status === Constants.MatchStatus.COMPLETED) {
        return Promise.resolve();
      }

      // register matchday in the calendar
      return DatabaseClient.prisma.calendar.create({
        data: {
          type:
            userSeed != null && match.p.includes(userSeed)
              ? Constants.CalendarEntry.MATCHDAY_USER
              : Constants.CalendarEntry.MATCHDAY_NPC,
          date: matchday.toISOString(),
          payload: String(newMatch.id),
        },
      });
    }),
  );
  if (newNpcMatches.length) {
    await DatabaseClient.prisma.$transaction((tx) => insertScheduledMatches(tx, newNpcMatches));
  }
  return results;
}

async function syncCompetitionEndDate(competitionId: number) {
  const lastMatchDay = await DatabaseClient.prisma.match.findFirst({
    where: {
      competitionId,
    },
    orderBy: {
      date: 'desc',
    },
  });

  if (!lastMatchDay) {
    return;
  }

  const existingEntries = await DatabaseClient.prisma.calendar.findMany({
    where: {
      type: Constants.CalendarEntry.COMPETITION_END,
      payload: String(competitionId),
    },
  });
  const existingEntry =
    existingEntries.find((entry) => entry.date.getTime() === lastMatchDay.date.getTime()) ||
    existingEntries[0];

  if (existingEntry) {
    const duplicateEntries = existingEntries.filter((entry) => entry.id !== existingEntry.id);

    if (duplicateEntries.length > 0) {
      await DatabaseClient.prisma.calendar.deleteMany({
        where: {
          id: {
            in: duplicateEntries.map((entry) => entry.id),
          },
        },
      });
    }

    return DatabaseClient.prisma.calendar.update({
      where: {
        id: existingEntry.id,
      },
      data: {
        date: lastMatchDay.date.toISOString(),
      },
    });
  }

  return DatabaseClient.prisma.calendar.create({
    data: {
      date: lastMatchDay.date.toISOString(),
      type: Constants.CalendarEntry.COMPETITION_END,
      payload: String(competitionId),
    },
  });
}

/**
 * Sends a welcome e-mail to the user upon creating a new career.
 *
 * A new career is determined by comparing the current
 * year with the profile's current year.
 *
 * @function
 */
export async function createWelcomeEmail() {
  const profile = await DatabaseClient.prisma.profile.findFirst(Eagers.profile);

  // Teamless player: skip team-based welcome email.
  if (!profile || profile.teamId == null || !profile.team) {
    return Promise.resolve();
  }

  const locale = getLocale(profile);

  if (new Date().getFullYear() === profile.date.getFullYear()) {
    const [persona] = profile.team.personas;
    await sendEmail(
      locale.templates.WelcomeEmail.SUBJECT,
      Sqrl.render(locale.templates.WelcomeEmail.CONTENT, {
        profile,
        persona,
      }),
      persona,
      profile.date,
      false,
    );
  }

  return Promise.resolve();
}

/**
 * Distributes prize pool on competition end.
 *
 * @param competition         The competition database record.
 * @param preloadedTournament Tournament instance, if already loaded.
 * @function
 */
export async function distributePrizePool(
  competition: Prisma.CompetitionGetPayload<{
    include: { competitors: true; tier: { include: { league: true } } };
  }>,
  preloadedTournament?: Tournament,
) {
  // bail if competition is not done yet
  const tournament = preloadedTournament || Tournament.restore(JSON.parse(competition.tournament));

  if (!tournament.$base.isDone()) {
    return Promise.resolve();
  }

  // bail if no prize pool
  const prizePool = Constants.PrizePool[competition.tier.slug];

  if (!prizePool || !prizePool.total || !prizePool.distribution.length) {
    return Promise.resolve();
  }

  // loop through positions and assign their award
  const winners: Array<[number, number, number]> = [];
  const standings = new Map(tournament.$base.results().map((result) => [result.seed, result]));

  for (const competitorId of tournament.competitors) {
    const competitor = standings.get(tournament.getSeedByCompetitorId(competitorId));
    const pos = (competitor.gpos || competitor.pos) - 1;
    const prizeMoney = prizePool.total * ((prizePool.distribution[pos] || 0) / 100);
    winners.push([competitorId, prizeMoney, competitor.gpos || competitor.pos]);
  }

  if (!winners.length) {
    return Promise.resolve();
  }

  // assign prize winnings to team earnings
  const seededCompetitors = await DatabaseClient.prisma.competitionToTeam.findMany({
    where: {
      id: { in: winners.map(([id]) => id) },
    },
    include: {
      team: true,
    },
  });

  const seededById = new Map(seededCompetitors.map((item) => [item.id, item]));

  const transaction = winners.map(([id, prizeMoney, placement]) => {
    const seeded = seededById.get(id);
    const currentElo = seeded?.team?.elo ?? 1000;
    const tournamentDelta = Util.getTournamentPlacementRankingDelta({
      currentElo,
      placement,
      totalTeams: tournament.competitors.length,
      tierSlug: competition.tier.slug,
      leagueSlug: competition.tier.league?.slug,
      competitionFederationId: competition.federationId,
    });

    return DatabaseClient.prisma.competitionToTeam.update({
      where: {
        id,
      },
      data: {
        team: {
          update: {
            earnings: {
              increment: prizeMoney,
            },
            elo: Util.clampElo(currentElo + tournamentDelta),
          },
        },
      },
    });
  });

  return DatabaseClient.prisma.$transaction(transaction);
}

async function closeOpenCareerStints(
  prisma: typeof DatabaseClient.prisma,
  playerId: number,
  endedAt: Date,
) {
  const seasonStart = new Date(Constants.NewSaveSeasonStartDate);
  const openStints = await prisma.careerStint.findMany({
    where: { playerId, endedAt: null },
  });

  await prisma.$transaction(
    openStints.map((stint) =>
      prisma.careerStint.update({
        where: { id: stint.id },
        data: {
          endedAt,
          ...(stint.teamId == null && stint.startedAt > endedAt ? { startedAt: seasonStart } : {}),
        },
      }),
    ),
  );
}

async function startCareerStint(
  prisma: typeof DatabaseClient.prisma,
  params: {
    playerId: number;
    teamId: number | null;
    tier: number | null;
    starter: boolean;
    startedAt: Date;
  },
) {
  const { playerId, teamId, tier, starter, startedAt } = params;

  await prisma.careerStint.create({
    data: {
      playerId,
      teamId,
      tier,
      starter,
      startedAt,
    },
  });
}

async function recordPlayerTeamMove(
  prisma: typeof DatabaseClient.prisma,
  params: {
    playerId: number;
    previousTeamId: number | null;
    previousTier: number | null;
    nextTeamId: number | null;
    nextTier: number | null;
    starter: boolean;
    date: Date;
  },
) {
  const { playerId, previousTeamId, previousTier, nextTeamId, nextTier, starter, date } = params;
  const openStints = await prisma.careerStint.findMany({
    where: { playerId, endedAt: null },
  });

  if (!openStints.length && previousTeamId != null && previousTeamId !== nextTeamId) {
    await prisma.careerStint.create({
      data: {
        playerId,
        teamId: previousTeamId,
        tier: previousTier,
        starter: true,
        startedAt: new Date(Constants.NewSaveSeasonStartDate),
        endedAt: date,
      },
    });
  } else {
    await closeOpenCareerStints(prisma, playerId, date);
  }

  await startCareerStint(prisma, {
    playerId,
    teamId: nextTeamId,
    tier: nextTier,
    starter,
    startedAt: date,
  });
}

function getTeamTierSlug(teamTierIdx: number | null | undefined): TierSlug | null {
  if (typeof teamTierIdx !== 'number') return null;
  if (teamTierIdx < 0 || teamTierIdx >= Constants.Prestige.length) return null;
  return Constants.Prestige[teamTierIdx] as TierSlug;
}

function getTeamTierName(teamTierIdx: number | null | undefined): string {
  const slug = getTeamTierSlug(teamTierIdx);
  if (!slug) return 'Unknown';
  return (Constants as any).IdiomaticTier?.[slug] ?? slug;
}
function normalizeRole(r: unknown): string {
  const role = String(r ?? '')
    .trim()
    .toUpperCase()
    .replace(/[\s_-]+/g, '');

  // Older saves and a few import paths use AWPER/AWP/SNIPER interchangeably.
  // Keep one canonical internal role so every signing and promotion path uses
  // the same starter-slot rules.
  if (role === 'AWPER' || role === 'AWP' || role === 'SNIPER' || role === 'SNIPERPLAYER') {
    return 'SNIPER';
  }
  if (role === 'RIFLE' || role === 'RIFLER' || role === 'RIFLEPLAYER') return 'RIFLER';
  if (role === 'IGL' || role === 'IN GAME LEADER' || role === 'INGAMELEADER') return 'IGL';
  return role;
}

function isSniperRole(r: unknown): boolean {
  return normalizeRole(r) === 'SNIPER';
}

function resolveUserRole(profile: any, player: any): UserRole {
  const role = player?.role ?? profile?.player?.role ?? profile?.role;

  if (role === UserRole.IGL) return UserRole.IGL;
  if (role === UserRole.AWPER) return UserRole.AWPER;
  return UserRole.RIFLER;
}

function getRoleOfferTuning(role: UserRole) {
  return (
    UserOfferSettings.ROLE_OFFER_TUNING?.[role] ??
    UserOfferSettings.ROLE_OFFER_TUNING?.[UserRole.RIFLER]
  );
}

function clampPbx(x: number) {
  return Math.max(1, Math.min(95, Math.round(x)));
}

function daysLeftOrHuge(contractEnd: Date | null | undefined, now: Date): number {
  if (!contractEnd) return 999999;
  return Math.max(0, differenceInDays(contractEnd, now));
}

/**
 * - AWPER => bench starter SNIPER
 * - IGL/RIFLER => bench starter RIFLER, preferring low XP; tie-break with shorter contract
 */
async function benchVictim(params: {
  prisma: typeof DatabaseClient.prisma;
  teamId: number;
  userRole: unknown;
  now: Date;
  incomingPlayerId: number;
}) {
  const { prisma, teamId, userRole, now, incomingPlayerId } = params;

  const destTeam = await prisma.team.findFirst({
    where: { id: teamId },
    select: {
      tier: true,
      players: {
        select: {
          id: true,
          role: true,
          starter: true,
          xp: true,
          contractEnd: true,
          transferListed: true,
          userControlled: true,
        },
      },
    },
  });

  if (!destTeam) return;

  const uRole = normalizeRole(userRole);
  const wantsSniperSlot = isSniperRole(uRole);

  const desiredVictimRole = wantsSniperSlot ? 'SNIPER' : 'RIFLER';

  // Candidates: starters with the desired role (excluding the incoming player defensively)
  let candidates = destTeam.players.filter(
    (p) => p.starter && p.id !== incomingPlayerId && normalizeRole(p.role) === desiredVictimRole,
  );

  // Fallback: if no role-matching starter exists, pick any starter (excluding incoming)
  if (!candidates.length) {
    candidates = destTeam.players.filter((p) => p.starter && p.id !== incomingPlayerId);
  }

  if (!candidates.length) return;

  // Selection rule:
  // Find min XP among candidates
  // Allow a small XP tolerance; within tolerance pick the shortest contract remaining
  const XP_TOLERANCE = 5;
  const minXp = Math.min(...candidates.map((c) => c.xp ?? 0));
  const nearMin = candidates.filter((c) => (c.xp ?? 0) <= minXp + XP_TOLERANCE);

  nearMin.sort((a, b) => {
    const aDays = daysLeftOrHuge(a.contractEnd as any, now);
    const bDays = daysLeftOrHuge(b.contractEnd as any, now);

    // Primary: shorter contract first
    if (aDays !== bDays) return aDays - bDays;

    // Secondary: lower XP
    return (a.xp ?? 0) - (b.xp ?? 0);
  });

  const victim = nearMin[0];
  if (!victim) return;

  await prisma.player.update({
    where: { id: victim.id },
    data: {
      starter: false,
      transferListed: true,
    },
  });
  await closeOpenCareerStints(prisma, victim.id, now);
  await startCareerStint(prisma, {
    playerId: victim.id,
    teamId,
    tier: destTeam.tier ?? null,
    starter: false,
    startedAt: now,
  });
  if (!victim.userControlled) {
    await scheduleNpcRetirementCheck(victim.id, now);
  }

  Engine.Runtime.Instance.log.info(
    'Bench victim: teamId=%d victimId=%d victimRole=%s (xp=%d) transferListed=true',
    teamId,
    victim.id,
    normalizeRole(victim.role),
    victim.xp ?? 0,
  );
}

/**
 * Promotes a benched/transfer-listed player to starter to fill the vacancy.
 *
 * - If outgoing user is AWPER => promote highest XP SNIPER
 * - Otherwise => promote highest XP RIFLER
 *
 * Prefer transferListed players first
 * fallback to any non-starter of the desired role.
 */
async function promoteReplacement(params: {
  prisma: typeof DatabaseClient.prisma;
  teamId: number;
  outgoingUserRole: unknown;
  now: Date;
  outgoingPlayerId: number;
  outgoingWasStarter: boolean;
}) {
  const { prisma, teamId, outgoingUserRole, now, outgoingPlayerId, outgoingWasStarter } = params;

  // No vacancy if the outgoing player wasn't a starter
  if (!outgoingWasStarter) return;

  const team = await prisma.team.findFirst({
    where: { id: teamId },
    select: {
      tier: true,
      players: {
        select: {
          id: true,
          role: true,
          starter: true,
          xp: true,
          contractEnd: true,
          transferListed: true,
        },
      },
    },
  });

  if (!team) return;

  const uRole = normalizeRole(outgoingUserRole);
  const outgoingWasAwper = isSniperRole(uRole);

  const desiredRole = outgoingWasAwper ? 'SNIPER' : 'RIFLER';

  let candidates = team.players.filter(
    (p) =>
      p.id !== outgoingPlayerId &&
      !p.starter &&
      p.transferListed &&
      normalizeRole(p.role) === desiredRole,
  );

  if (!candidates.length) {
    candidates = team.players.filter(
      (p) => p.id !== outgoingPlayerId && !p.starter && normalizeRole(p.role) === desiredRole,
    );
  }
  if (!candidates.length) {
    candidates = team.players.filter(
      (p) => p.id !== outgoingPlayerId && !p.starter && p.transferListed,
    );
  }

  if (!candidates.length) return;

  // Selection rule:
  // Highest XP first; tie-break with longer contract remaining
  candidates.sort((a, b) => {
    const aXp = a.xp ?? 0;
    const bXp = b.xp ?? 0;
    if (aXp !== bXp) return bXp - aXp;

    const aDays = daysLeftOrHuge(a.contractEnd as any, now);
    const bDays = daysLeftOrHuge(b.contractEnd as any, now);
    return bDays - aDays;
  });

  const promoted = candidates[0];
  if (!promoted) return;

  await prisma.player.update({
    where: { id: promoted.id },
    data: {
      starter: true,
      transferListed: false,
      lastOfferAt: null,
    },
  });
  await closeOpenCareerStints(prisma, promoted.id, now);
  await startCareerStint(prisma, {
    playerId: promoted.id,
    teamId,
    tier: team.tier ?? null,
    starter: true,
    startedAt: now,
  });

  Engine.Runtime.Instance.log.info(
    'Promoted replacement: teamId=%d promotedId=%d promotedRole=%s (xp=%d) starter=true transferListed=false',
    teamId,
    promoted.id,
    normalizeRole(promoted.role),
    promoted.xp ?? 0,
  );
}

/**
 * Accepts a transfer offer that targets the user player.
 *
 * @param transferId The transfer offer to parse.
 * @param locale      The locale.
 * @param status      Force accepts or rejects the offer.
 * @function
 */
export async function acceptTransferOffer(transferId: number) {
  const profile = await DatabaseClient.prisma.profile.findFirst(Eagers.profile);
  if (!profile) return Promise.resolve();
  const oldTeamId = profile.teamId;

  const transfer = await DatabaseClient.prisma.transfer.findFirst({
    where: { id: transferId },
    include: {
      ...Eagers.transfer.include,
      offers: { orderBy: { id: 'desc' } },
    },
  });

  if (!transfer) return Promise.resolve();

  const latestPending = transfer.offers.find(
    (o) => o.status === Constants.TransferStatus.PLAYER_PENDING,
  );

  if (latestPending?.expiresAt && latestPending.expiresAt <= profile.date) {
    await onTransferOfferExpiryCheck({
      ...({} as any),
      payload: String(transfer.id),
    } as any);
    return Promise.resolve();
  }

  const fromTeamId = transfer.from?.id;
  if (!fromTeamId) {
    Engine.Runtime.Instance.log.warn(
      'acceptUserPlayerTransfer: transfer %d has no from team loaded. Skipping.',
      transferId,
    );
    return Promise.resolve();
  }

  // Only handle invites that target our user player.
  if (transfer.playerId !== profile.playerId) {
    Engine.Runtime.Instance.log.warn(
      'acceptUserPlayerTransfer: transfer %d does not target user player. Skipping.',
      transferId,
    );
    return Promise.resolve();
  }

  const [offer] = transfer.offers;

  // Extension detection:
  // If the offer comes from the user's CURRENT team, we treat it as a contract extension.
  const isExtension = profile.teamId != null && fromTeamId === profile.teamId;

  const mainWindow = WindowManager.get(Constants.WindowIdentifier.Main, false)?.webContents;

  // Update transfer & this offer to accepted.
  await DatabaseClient.prisma.transfer.update({
    where: { id: transfer.id },
    data: {
      status: Constants.TransferStatus.PLAYER_ACCEPTED,
      offers: {
        update: {
          where: { id: offer.id },
          data: {
            status: Constants.TransferStatus.PLAYER_ACCEPTED,
          },
        },
      },
    },
  });

  // NOTE: For extensions we extend from max(now, current contract end).
  // For new signings we use "now".
  const years = offer.contractYears ?? 1;

  if (isExtension) {
    // Extension path: do NOT bench anyone, do NOT move teams, do NOT write a new stint.
    // We only extend the contract and reschedule contract-related calendar entries.

    // Load current player to base the extension on the current contract end (if still active).
    const currentPlayer = await DatabaseClient.prisma.player.findFirst({
      where: { id: transfer.playerId },
      select: {
        id: true,
        teamId: true,
        contractEnd: true,
        wages: true,
        cost: true,
      },
    });

    if (!currentPlayer) return Promise.resolve();

    if (currentPlayer.teamId !== profile.teamId) {
      Engine.Runtime.Instance.log.warn(
        'acceptTransferOffer: extension offer mismatch (player.teamId=%s profile.teamId=%s). Skipping.',
        String(currentPlayer.teamId),
        String(profile.teamId),
      );
      return Promise.resolve();
    }

    const baseDate =
      currentPlayer.contractEnd && currentPlayer.contractEnd > profile.date
        ? currentPlayer.contractEnd
        : profile.date;

    const contractEnd = addYears(baseDate, years);

    await DatabaseClient.prisma.player.update({
      where: { id: transfer.playerId },
      data: {
        contractEnd,
        // keep current starter/transferListed/teamId as-is for an extension
      },
    });

    // Schedule contract expiry event in the calendar.
    await DatabaseClient.prisma.calendar.deleteMany({
      where: {
        type: Constants.CalendarEntry.PLAYER_CONTRACT_EXPIRE,
        completed: false,
        payload: String(transfer.playerId),
        date: { gte: profile.date.toISOString() },
      },
    });
    await DatabaseClient.prisma.calendar.create({
      data: {
        type: Constants.CalendarEntry.PLAYER_CONTRACT_EXPIRE,
        date: contractEnd.toISOString(),
        payload: String(transfer.playerId),
      },
    });

    const EXT_DAYS = Constants.PlayerContractSettings.EXTENSION_EVAL_DAYS_BEFORE_END;
    const extensionEvalDate = addDays(contractEnd, -EXT_DAYS);
    if (extensionEvalDate > profile.date) {
      await DatabaseClient.prisma.calendar.deleteMany({
        where: {
          type: Constants.CalendarEntry.PLAYER_CONTRACT_EXTENSION_EVAL,
          completed: false,
          payload: String(transfer.playerId),
          date: { gte: profile.date.toISOString() },
        },
      });
      await DatabaseClient.prisma.calendar.create({
        data: {
          type: Constants.CalendarEntry.PLAYER_CONTRACT_EXTENSION_EVAL,
          date: extensionEvalDate.toISOString(),
          payload: String(transfer.playerId),
        },
      });
    }

    // Schedule weekly contract review (bench/kick evaluation)
    const firstReviewDate = addDays(profile.date, 7);
    await DatabaseClient.prisma.calendar.deleteMany({
      where: {
        type: Constants.CalendarEntry.PLAYER_CONTRACT_REVIEW,
        completed: false,
        payload: String(transfer.playerId),
        date: { gte: profile.date.toISOString() },
      },
    });
    await DatabaseClient.prisma.calendar.create({
      data: {
        type: Constants.CalendarEntry.PLAYER_CONTRACT_REVIEW,
        date: firstReviewDate.toISOString(),
        payload: String(transfer.playerId),
      },
    });

    // Reject any other pending offers for this player.
    const otherTransfers = await DatabaseClient.prisma.transfer.findMany({
      where: {
        id: { not: transfer.id },
        playerId: transfer.playerId,
        status: {
          in: [Constants.TransferStatus.TEAM_PENDING, Constants.TransferStatus.PLAYER_PENDING],
        },
      },
    });

    if (otherTransfers.length) {
      await Promise.all([
        DatabaseClient.prisma.transfer.updateMany({
          where: { id: { in: otherTransfers.map((t) => t.id) } },
          data: { status: Constants.TransferStatus.PLAYER_REJECTED },
        }),
        DatabaseClient.prisma.offer.updateMany({
          where: { transferId: { in: otherTransfers.map((t) => t.id) } },
          data: { status: Constants.TransferStatus.PLAYER_REJECTED },
        }),
      ]);
    }

    // Extension accepted email.
    const updatedPlayer = await DatabaseClient.prisma.player.findFirst({
      where: { id: transfer.playerId },
    });

    const locale = getLocale(profile);
    const persona =
      transfer.from?.personas?.find(
        (p) =>
          p.role === Constants.PersonaRole.MANAGER || p.role === Constants.PersonaRole.ASSISTANT,
      ) ?? transfer.from?.personas?.[0];
    if (!persona) return Promise.resolve();

    const team = transfer.from;
    const contractEndDate = format(contractEnd, Constants.Settings.calendar.calendarDateFormat);

    await sendEmail(
      Sqrl.render(locale.templates.ContractExtensionAccepted.SUBJECT, {
        profile,
        team,
        transfer,
      }),
      Sqrl.render(locale.templates.ContractExtensionAccepted.CONTENT, {
        profile,
        team,
        transfer,
        years,
        contractEndDate,
      }),
      persona,
      profile.date,
      true,
    );

    const refreshedProfile = await DatabaseClient.prisma.profile.findFirst(Eagers.profile);
    mainWindow?.send(Constants.IPCRoute.PROFILES_CURRENT, refreshedProfile);

    WindowManager.sendAll(Constants.IPCRoute.TRANSFER_UPDATE);

    Engine.Runtime.Instance.log.info(
      '%s accepted a contract extension at %s (years=%d).',
      profile.name,
      transfer.from.name,
      years,
    );

    return Promise.resolve();
  }

  // Normal signing path
  const contractEnd = addYears(profile.date, years);

  await benchVictim({
    prisma: DatabaseClient.prisma,
    teamId: fromTeamId,
    userRole: (profile as any)?.player?.role,
    now: profile.date,
    incomingPlayerId: transfer.playerId,
  });

  const now = profile.date;
  const destTeam = await DatabaseClient.prisma.team.findFirst({
    where: { id: fromTeamId },
    select: { tier: true },
  });
  const destTierIdx = typeof destTeam?.tier === 'number' ? destTeam.tier : null;

  await recordPlayerTeamMove(DatabaseClient.prisma, {
    playerId: transfer.playerId,
    previousTeamId: oldTeamId,
    previousTier: profile.team?.tier ?? null,
    nextTeamId: fromTeamId,
    nextTier: destTierIdx,
    starter: true,
    date: now,
  });

  //Connect the player to the new team.
  await DatabaseClient.prisma.player.update({
    where: { id: transfer.playerId },
    data: {
      transferListed: false,
      starter: true,
      team: { connect: { id: fromTeamId } },
      contractEnd,
    },
  });

  // Update profile.teamId so the game knows you're now on a team.
  const updatedProfile = await DatabaseClient.prisma.profile.update({
    where: { id: profile.id },
    data: {
      team: {
        connect: { id: fromTeamId },
      },
    },
    include: { player: true, team: true },
  });

  // Notify renderer so UI updates immediately.
  if (mainWindow) {
    mainWindow.send(Constants.IPCRoute.PROFILES_CURRENT, updatedProfile);
  }

  await recalculateTeamCountryIdentity(fromTeamId);

  // Schedule contract expiry event in the calendar.
  await DatabaseClient.prisma.calendar.deleteMany({
    where: {
      type: Constants.CalendarEntry.PLAYER_CONTRACT_EXPIRE,
      completed: false,
      payload: String(transfer.playerId),
      date: { gte: profile.date.toISOString() },
    },
  });
  await DatabaseClient.prisma.calendar.create({
    data: {
      type: Constants.CalendarEntry.PLAYER_CONTRACT_EXPIRE,
      date: contractEnd.toISOString(),
      payload: String(transfer.playerId),
    },
  });

  const EXT_DAYS = Constants.PlayerContractSettings.EXTENSION_EVAL_DAYS_BEFORE_END;
  const extensionEvalDate = addDays(contractEnd, -EXT_DAYS);
  if (extensionEvalDate > profile.date) {
    await DatabaseClient.prisma.calendar.deleteMany({
      where: {
        type: Constants.CalendarEntry.PLAYER_CONTRACT_EXTENSION_EVAL,
        completed: false,
        payload: String(transfer.playerId),
        date: { gte: profile.date.toISOString() },
      },
    });
    await DatabaseClient.prisma.calendar.create({
      data: {
        type: Constants.CalendarEntry.PLAYER_CONTRACT_EXTENSION_EVAL,
        date: extensionEvalDate.toISOString(),
        payload: String(transfer.playerId),
      },
    });
  }

  // Schedule weekly contract review (bench/kick evaluation)
  const firstReviewDate = addDays(profile.date, 7);
  await DatabaseClient.prisma.calendar.deleteMany({
    where: {
      type: Constants.CalendarEntry.PLAYER_CONTRACT_REVIEW,
      completed: false,
      payload: String(transfer.playerId),
      date: { gte: profile.date.toISOString() },
    },
  });
  await DatabaseClient.prisma.calendar.create({
    data: {
      type: Constants.CalendarEntry.PLAYER_CONTRACT_REVIEW,
      date: firstReviewDate.toISOString(),
      payload: String(transfer.playerId),
    },
  });

  const scoutingDate = addDays(profile.date, 7);
  // Remove any existing future scouting checks for this player
  await DatabaseClient.prisma.calendar.deleteMany({
    where: {
      type: Constants.CalendarEntry.PLAYER_SCOUTING_CHECK,
      completed: false,
      payload: String(profile.playerId),
      date: { gte: profile.date.toISOString() },
    },
  });
  // Create the first scouting check
  await DatabaseClient.prisma.calendar.create({
    data: {
      type: Constants.CalendarEntry.PLAYER_SCOUTING_CHECK,
      date: scoutingDate.toISOString(),
      payload: String(profile.playerId),
    },
  });

  // Mark future matches for this team as user matchdays.
  const today = profile.date;
  const futureMatches = await DatabaseClient.prisma.match.findMany({
    where: {
      date: { gte: today.toISOString() },
      competitors: {
        some: { teamId: fromTeamId },
      },
    },
  });

  // If we switched teams, revert the old teams remaining USER matchdays back to NPC
  if (oldTeamId != null && oldTeamId !== fromTeamId) {
    const oldFutureMatches = await DatabaseClient.prisma.match.findMany({
      where: {
        date: { gte: today.toISOString() },
        competitors: { some: { teamId: oldTeamId } },
      },
      select: { id: true },
    });

    const oldMatchIds = oldFutureMatches.map((m) => String(m.id));

    if (oldMatchIds.length) {
      await DatabaseClient.prisma.calendar.updateMany({
        where: {
          payload: { in: oldMatchIds },
          date: { gte: today.toISOString() },
          type: Constants.CalendarEntry.MATCHDAY_USER,
        },
        data: { type: Constants.CalendarEntry.MATCHDAY_NPC },
      });
    }
  }

  if (futureMatches.length) {
    const matchIds = futureMatches.map((m) => String(m.id));

    await DatabaseClient.prisma.calendar.updateMany({
      where: {
        payload: { in: matchIds },
        date: { gte: today.toISOString() },
        type: {
          in: [Constants.CalendarEntry.MATCHDAY_NPC, Constants.CalendarEntry.MATCHDAY_USER],
        },
      },
      data: { type: Constants.CalendarEntry.MATCHDAY_USER },
    });
  }

  // Reject any other pending offers for this player.
  const otherTransfers = await DatabaseClient.prisma.transfer.findMany({
    where: {
      id: { not: transfer.id },
      playerId: transfer.playerId,
      status: {
        in: [Constants.TransferStatus.TEAM_PENDING, Constants.TransferStatus.PLAYER_PENDING],
      },
    },
  });

  if (otherTransfers.length) {
    await Promise.all([
      DatabaseClient.prisma.transfer.updateMany({
        where: { id: { in: otherTransfers.map((t) => t.id) } },
        data: { status: Constants.TransferStatus.PLAYER_REJECTED },
      }),
      DatabaseClient.prisma.offer.updateMany({
        where: { transferId: { in: otherTransfers.map((t) => t.id) } },
        data: { status: Constants.TransferStatus.PLAYER_REJECTED },
      }),
    ]);
  }

  // Welcome email
  const updatedPlayer = await DatabaseClient.prisma.player.findFirst({
    where: { id: transfer.playerId },
  });
  const locale = getLocale(profile);
  const persona =
    transfer.from?.personas?.find(
      (p) => p.role === Constants.PersonaRole.MANAGER || p.role === Constants.PersonaRole.ASSISTANT,
    ) ?? transfer.from?.personas?.[0];
  if (!persona) return Promise.resolve();

  await sendEmail(
    Sqrl.render(locale.templates.OfferAcceptedUser.SUBJECT, {
      transfer,
      profile,
      player: updatedPlayer,
    }),
    Sqrl.render(locale.templates.OfferAcceptedUser.CONTENT, {
      transfer,
      profile,
      player: updatedPlayer,
    }),
    persona,
    profile.date,
    true,
  );

  Engine.Runtime.Instance.log.info(
    '%s joined %s via player-career invite.',
    profile.name,
    transfer.from.name,
  );

  return Promise.resolve();
}

/**
 * Reject a transfer offer that targets the user player.
 */
export async function rejectTransferOffer(transferId: number) {
  const profile = await DatabaseClient.prisma.profile.findFirst(Eagers.profile);
  if (!profile) return Promise.resolve();

  const transfer = await DatabaseClient.prisma.transfer.findFirst({
    where: { id: transferId },
    include: {
      ...Eagers.transfer.include,
      offers: { orderBy: { id: 'desc' } },
    },
  });

  if (!transfer) return Promise.resolve();

  const latestPending = transfer.offers.find(
    (o) => o.status === Constants.TransferStatus.PLAYER_PENDING,
  );

  if (latestPending?.expiresAt && latestPending.expiresAt <= profile.date) {
    await onTransferOfferExpiryCheck({
      ...({} as any),
      payload: String(transfer.id),
    } as any);
    return Promise.resolve();
  }

  if (transfer.playerId !== profile.playerId) {
    Engine.Runtime.Instance.log.warn(
      'rejectUserPlayerTransfer: transfer %d does not target user player. Skipping.',
      transferId,
    );
    return Promise.resolve();
  }

  // Extension detection:
  // If the offer comes from the user's CURRENT team, we treat it as a contract extension.
  const fromTeamId = transfer.from?.id;
  const isExtension = profile.teamId != null && fromTeamId != null && fromTeamId === profile.teamId;

  const [offer] = transfer.offers;

  await DatabaseClient.prisma.transfer.update({
    where: { id: transfer.id },
    data: {
      status: Constants.TransferStatus.PLAYER_REJECTED,
      offers: {
        update: {
          where: { id: offer.id },
          data: {
            status: Constants.TransferStatus.PLAYER_REJECTED,
          },
        },
      },
    },
  });

  const persona =
    transfer.from.personas.find(
      (p) => p.role === Constants.PersonaRole.MANAGER || p.role === Constants.PersonaRole.ASSISTANT,
    ) ?? transfer.from.personas[0];

  // Different email content for extensions vs new-team offers.
  const locale = getLocale(profile);

  if (isExtension) {
    if ((locale.templates as any).ContractExtensionRejected) {
      await sendEmail(
        Sqrl.render((locale.templates as any).ContractExtensionRejected.SUBJECT, {
          transfer,
          profile,
        }),
        Sqrl.render((locale.templates as any).ContractExtensionRejected.CONTENT, {
          transfer,
          profile,
          offer,
        }),
        persona,
        profile.date,
        true,
      );
    }

    Engine.Runtime.Instance.log.info(
      'User rejected contract extension from %s (transfer %d).',
      transfer.from.name,
      transfer.id,
    );

    return Promise.resolve();
  }
  await sendEmail(
    Sqrl.render(locale.templates.OfferRejectedUser.SUBJECT, {
      transfer,
      profile,
      offer,
    }),
    Sqrl.render(locale.templates.OfferRejectedUser.CONTENT, {
      transfer,
      profile,
      offer,
    }),
    persona,
    profile.date,
    true,
  );

  Engine.Runtime.Instance.log.info(
    'User rejected invite from %s (transfer %d).',
    transfer.from.name,
    transfer.id,
  );
  return Promise.resolve();
}

/**
 * Benches the user player
 * - starter=false, transferListed=true
 * - convert future MATCHDAY_USER -> MATCHDAY_NPC for this team
 * - send PlayerBenched email (tier name + KD + team standing/form + reason)
 */
export async function benchUserPlayer(params: {
  teamId: number;
  playerId: number;
  now: Date;
  reason?: string;
}) {
  const { teamId, playerId, now, reason } = params;
  const prisma = DatabaseClient.prisma;

  const profile = await prisma.profile.findFirst(Eagers.profile);
  if (!profile) return Promise.resolve();

  // Safety: only act on the user player + current team context
  if (profile.playerId !== playerId) return Promise.resolve();
  if (profile.teamId !== teamId) return Promise.resolve();

  // Load team for tier/personas
  const team = await prisma.team.findFirst({
    where: { id: teamId },
    include: { personas: true },
  });
  if (!team) return Promise.resolve();

  const outgoing = await prisma.player.findFirst({
    where: { id: playerId },
    select: { starter: true, role: true },
  });

  // Update player status
  await prisma.player.update({
    where: { id: playerId },
    data: {
      starter: false,
      transferListed: true,
    },
  });
  await closeOpenCareerStints(prisma, playerId, now);
  await startCareerStint(prisma, {
    playerId,
    teamId,
    tier: team.tier ?? null,
    starter: false,
    startedAt: now,
  });

  await promoteReplacement({
    prisma,
    teamId,
    outgoingUserRole: outgoing?.role ?? (profile as any)?.player?.role,
    now,
    outgoingPlayerId: playerId,
    outgoingWasStarter: !!outgoing?.starter,
  });

  // Convert future matchdays for this team from USER -> NPC
  const futureMatches = await prisma.match.findMany({
    where: {
      date: { gte: now.toISOString() },
      competitors: { some: { teamId } },
    },
    select: { id: true },
  });

  const matchIds = futureMatches.map((m) => String(m.id));
  if (matchIds.length) {
    await prisma.calendar.updateMany({
      where: {
        payload: { in: matchIds },
        date: { gte: now.toISOString() },
        type: Constants.CalendarEntry.MATCHDAY_USER,
      },
      data: { type: Constants.CalendarEntry.MATCHDAY_NPC },
    });
  }

  const tierName = getTeamTierName(team.tier);

  let kd = 1;
  let matchesPlayed = 0;
  try {
    const leagueRecent = await LeagueStats.computeLeagueLifetimeStats(teamId, playerId, 30);
    kd = leagueRecent.kdRatio ?? 1;
    matchesPlayed = leagueRecent.matchesPlayed ?? 0;
  } catch (_) {
    // If stats fail, email still sends with defaults.
  }

  const standingScore = await computeTeamStandingScore({ ...profile, teamId });
  const formScore = await computeTeamFormScore({ ...profile, teamId }, 5);

  // Email
  const locale = getLocale(profile);
  const persona =
    team.personas.find(
      (p) => p.role === Constants.PersonaRole.MANAGER || p.role === Constants.PersonaRole.ASSISTANT,
    ) ?? team.personas[0];

  const kdFmt = Number.isFinite(kd) ? Number(kd).toFixed(2) : '1.00';

  if (persona && (locale.templates as any).PlayerBenched) {
    await sendEmail(
      Sqrl.render((locale.templates as any).PlayerBenched.SUBJECT, {
        profile,
        team,
      }),
      Sqrl.render((locale.templates as any).PlayerBenched.CONTENT, {
        profile,
        team,
        tierName,
        kd: kdFmt,
      }),
      persona,
      now,
      true,
    );
  }

  const refreshedProfile = await prisma.profile.findFirst(Eagers.profile);
  const mainWindow = WindowManager.get(Constants.WindowIdentifier.Main, false)?.webContents;
  if (mainWindow && refreshedProfile) {
    mainWindow.send(Constants.IPCRoute.PROFILES_CURRENT, refreshedProfile);
  }

  Engine.Runtime.Instance.log.info(
    'benchUserPlayer: playerId=%d teamId=%d tier=%s kd=%s standing=%s form=%s reason=%s',
    playerId,
    teamId,
    tierName,
    Number(kd).toFixed(2),
    Number(standingScore).toFixed(2),
    Number(formScore).toFixed(2),
    reason ?? '',
  );

  return Promise.resolve();
}

/**
 * Kicks the user player
 * - profile.teamId=null
 * - close open career stints
 * - revert future matchdays for old team to NPC
 * - delete future contract calendar entries
 */
export async function kickUserPlayer(params: {
  teamId: number;
  playerId: number;
  now: Date;
  currentEntryId?: number;
  reason?: string;
}) {
  const { teamId, playerId, now, reason } = params;
  const prisma = DatabaseClient.prisma;

  const profile = await prisma.profile.findFirst(Eagers.profile);
  if (!profile) return Promise.resolve();

  // Safety: only act on the user player + current team context
  if (profile.playerId !== playerId) return Promise.resolve();
  if (profile.teamId !== teamId) return Promise.resolve();

  // Load team context for email/persona before we detach
  const team = await prisma.team.findFirst({
    where: { id: teamId },
    include: { personas: true },
  });

  const tierName = team ? getTeamTierName(team.tier) : 'Unknown';

  const outgoing = await prisma.player.findFirst({
    where: { id: playerId },
    select: { starter: true, role: true },
  });

  // Detach player from team and wipe contract
  await prisma.player.update({
    where: { id: playerId },
    data: {
      teamId: null,
      contractEnd: null,
      transferListed: true,
      starter: false,
    },
  });

  await promoteReplacement({
    prisma,
    teamId,
    outgoingUserRole: outgoing?.role ?? (profile as any)?.player?.role,
    now,
    outgoingPlayerId: playerId,
    outgoingWasStarter: !!outgoing?.starter,
  });

  // Update profile teamId
  const updatedProfile = await prisma.profile.update({
    where: { id: profile.id },
    data: { teamId: null },
    include: { player: true, team: true },
  });

  // Close open career stints
  await closeOpenCareerStints(prisma, playerId, now);

  // Revert future matchdays for old team back to NPC
  const oldFutureMatches = await prisma.match.findMany({
    where: {
      date: { gte: now.toISOString() },
      competitors: { some: { teamId } },
    },
    select: { id: true },
  });

  const oldMatchIds = oldFutureMatches.map((m) => String(m.id));
  if (oldMatchIds.length) {
    await prisma.calendar.updateMany({
      where: {
        payload: { in: oldMatchIds },
        date: { gte: now.toISOString() },
        type: Constants.CalendarEntry.MATCHDAY_USER,
      },
      data: { type: Constants.CalendarEntry.MATCHDAY_NPC },
    });
  }

  // Delete any future contract-related calendar entries for this player
  const nowIso = now.toISOString();
  await prisma.calendar.updateMany({
    where: {
      completed: false,
      payload: String(playerId),
      type: {
        in: [
          Constants.CalendarEntry.PLAYER_CONTRACT_EXPIRE,
          Constants.CalendarEntry.PLAYER_CONTRACT_EXTENSION_EVAL,
          Constants.CalendarEntry.PLAYER_CONTRACT_REVIEW,
        ],
      },
      date: { gt: nowIso },
    },
    data: { completed: true },
  });

  // Push profile update to renderer
  const mainWindow = WindowManager.get(Constants.WindowIdentifier.Main, false)?.webContents;
  if (mainWindow) {
    mainWindow.send(Constants.IPCRoute.PROFILES_CURRENT, updatedProfile);
  }

  // Email
  let kd = 1;
  let matchesPlayed = 0;
  let standingScore = 0.5;
  let formScore = 0.5;

  try {
    const leagueRecent = await LeagueStats.computeLeagueLifetimeStats(teamId, playerId, 30);
    kd = leagueRecent.kdRatio ?? 1;
    matchesPlayed = leagueRecent.matchesPlayed ?? 0;
  } catch (_) {}

  try {
    standingScore = await computeTeamStandingScore({ ...profile, teamId });
    formScore = await computeTeamFormScore({ ...profile, teamId }, 5);
  } catch (_) {}

  if (team?.personas?.length) {
    const persona =
      team.personas.find(
        (p) =>
          p.role === Constants.PersonaRole.MANAGER || p.role === Constants.PersonaRole.ASSISTANT,
      ) ?? team.personas[0];

    const locale = getLocale(profile);

    const tpl =
      (locale.templates as any).PlayerKicked ?? (locale.templates as any).ContractTerminatedEarly;

    if (persona && tpl) {
      await sendEmail(
        Sqrl.render(tpl.SUBJECT, { profile, team, tierName }),
        Sqrl.render(tpl.CONTENT, {
          profile,
          team,
          tierName,
        }),
        persona,
        now,
        true,
      );
    }
  }

  Engine.Runtime.Instance.log.info(
    'kickUserPlayer: playerId=%d oldTeamId=%d tier=%s kd=%s standing=%s form=%s reason=%s',
    playerId,
    teamId,
    tierName,
    Number(kd).toFixed(2),
    Number(standingScore).toFixed(2),
    Number(formScore).toFixed(2),
  );

  return Promise.resolve();
}

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

function kdToScore(kd: number) {
  const lo = 0.8;
  const hi = 1.8;
  const clamped = Math.max(lo, Math.min(hi, kd));
  return clamp01((clamped - lo) / (hi - lo));
}

async function computeTeamStandingScore(profile: any) {
  const prisma = DatabaseClient.prisma;

  // Find the active league competition that includes the user's team
  const competition = await prisma.competition.findFirst({
    where: {
      season: profile.season,
      status: {
        in: [Constants.CompetitionStatus.STARTED, Constants.CompetitionStatus.COMPLETED],
      },
      tier: {
        league: { slug: Constants.LeagueSlug.ESPORTS_LEAGUE },
      },
      competitors: {
        some: { teamId: profile.teamId },
      },
    },
    include: {
      competitors: true,
      tier: true,
    },
    orderBy: { id: 'desc' },
  });

  if (!competition || !competition.competitors?.length) {
    return 0.5;
  }

  const me = competition.competitors.find((c) => c.teamId === profile.teamId);
  if (!me || !me.position) {
    return 0.5;
  }

  const teamCount = competition.competitors.length;
  if (teamCount <= 1) return 0.5;

  const pos = me.position;
  const standing = 1 - (pos - 1) / (teamCount - 1);
  return clamp01(standing);
}

async function computeTeamFormScore(profile: any, take = 5) {
  const prisma = DatabaseClient.prisma;

  const matches = await prisma.match.findMany({
    where: {
      status: Constants.MatchStatus.COMPLETED,
      competitionId: { not: null },
      competitors: { some: { teamId: profile.teamId } },
    },
    include: { competitors: true },
    orderBy: { date: 'desc' },
    take,
  });

  if (!matches.length) return 0.5;

  let sum = 0;
  for (const m of matches) {
    const me = m.competitors.find((c) => c.teamId === profile.teamId);
    if (!me) continue;

    if (me.result === Constants.MatchResult.WIN) sum += 1;
    else if (me.result === Constants.MatchResult.DRAW) sum += 0.5;
    else sum += 0;
  }

  return clamp01(sum / matches.length);
}

/**
 * Attempts to scout the user player periodically.
 */
export async function onPlayerScoutingCheck(entry: Calendar) {
  const playerId = Number(entry.payload);

  const prisma = DatabaseClient.prisma;
  const [profile] = await prisma.profile.findMany({
    take: 1,
    include: {
      team: true,
      player: {
        include: {
          country: {
            include: {
              continent: {
                include: { federation: true },
              },
            },
          },
        },
      },
    },
  });
  if (!profile) return Promise.resolve();
  if (profile.playerId !== playerId) return Promise.resolve();

  // Load user player snapshot.
  const player = await prisma.player.findFirst({
    where: { id: profile.playerId },
    select: {
      id: true,
      teamId: true,
      starter: true,
      transferListed: true,
      wages: true,
      cost: true,
      contractEnd: true,
      countryId: true,
      lastOfferAt: true,
      role: true,
    },
  });
  if (!player) return Promise.resolve();
  const { hasWonMajorAnyTeam } = await getUserMajorWinFlags({
    prisma,
    playerId: profile.playerId,
    currentTeamId: profile.teamId,
  });

  // If teamless, try to use most recent stint team for league stats & context.
  const cutoff = addDays(profile.date, -180);
  const lastStintWithTeam = await prisma.careerStint.findFirst({
    where: {
      playerId: profile.playerId,
      teamId: { not: null },
      tier: { not: null },
      OR: [{ endedAt: null }, { endedAt: { gte: cutoff } }],
    },
    orderBy: [{ endedAt: 'desc' }, { startedAt: 'desc' }],
    select: { teamId: true, tier: true },
  });

  const effectiveTeamId = profile.teamId ?? lastStintWithTeam?.teamId ?? null;

  // Resolve tier index boundaries from your Prestige ordering
  const idxOpen = Constants.Prestige.findIndex((t) => t === TierSlug.LEAGUE_OPEN);
  const idxInter = Constants.Prestige.findIndex((t) => t === TierSlug.LEAGUE_INTERMEDIATE);
  const idxMain = Constants.Prestige.findIndex((t) => t === TierSlug.LEAGUE_MAIN);
  const idxAdv = Constants.Prestige.findIndex((t) => t === TierSlug.LEAGUE_ADVANCED);
  const idxPro = Constants.Prestige.findIndex((t) => t === TierSlug.LEAGUE_PRO);

  // Current tier from team; if teamless fall back to last stint tier; otherwise Open.
  const profileTeamTier = (profile as any)?.team?.tier;
  const currentTierIdx =
    typeof profileTeamTier === 'number' && profileTeamTier >= 0
      ? profileTeamTier
      : typeof lastStintWithTeam?.tier === 'number' && lastStintWithTeam.tier >= 0
        ? lastStintWithTeam.tier
        : idxOpen;

  // Recent peak tier from CareerStints (last 180 days, includes ongoing stints)
  const stints = await prisma.careerStint.findMany({
    where: {
      playerId: profile.playerId,
      OR: [{ endedAt: null }, { endedAt: { gte: cutoff } }],
      tier: { not: null },
    },
    select: { tier: true, startedAt: true, endedAt: true },
    orderBy: { startedAt: 'desc' },
  });

  let recentPeakTierIdx = currentTierIdx;
  for (const s of stints) {
    if (typeof s.tier === 'number') {
      recentPeakTierIdx = Math.max(recentPeakTierIdx, s.tier);
    }
  }

  const baselineTierIdx = Math.max(currentTierIdx, recentPeakTierIdx);

  // If teamless, only allow scouting if the player recently played ADVANCED/PRO.
  // (Open/Intermediate/Main free agents should primarily be handled by FACEIT/offers.)
  const isTeamless = profile.teamId == null;
  if (isTeamless && baselineTierIdx < idxAdv && !hasWonMajorAnyTeam) {
    // Schedule next weekly check (recurring)
    const nextDate = addDays(profile.date, 7);
    await prisma.calendar.create({
      data: {
        type: Constants.CalendarEntry.PLAYER_SCOUTING_CHECK,
        date: nextDate.toISOString(),
        payload: String(playerId),
      },
    });
    return Promise.resolve();
  }

  // Need an effective team to compute league stats + context.
  if (!effectiveTeamId && !hasWonMajorAnyTeam) {
    const nextDate = addDays(profile.date, 7);
    await prisma.calendar.create({
      data: {
        type: Constants.CalendarEntry.PLAYER_SCOUTING_CHECK,
        date: nextDate.toISOString(),
        payload: String(playerId),
      },
    });
    return Promise.resolve();
  }

  // League performance inputs (per-player + team context)
  let kd = 1;
  let standingScore = 0.5;
  let formScore = 0.5;
  let leagueSignal = 0.5;
  if (effectiveTeamId) {
    const leagueRecent = await LeagueStats.computeLeagueLifetimeStats(
      effectiveTeamId,
      profile.playerId,
      30,
    );

    kd = leagueRecent.kdRatio ?? 1;
    const playerScore = kdToScore(kd);

    // Team context score (standing + form)
    standingScore = await computeTeamStandingScore({ ...profile, teamId: effectiveTeamId });
    formScore = await computeTeamFormScore({ ...profile, teamId: effectiveTeamId }, 5);

    // Weighting: KD matters most
    const teamContextScore = clamp01(0.6 * standingScore + 0.4 * formScore);
    leagueSignal = clamp01(0.8 * playerScore + 0.2 * teamContextScore);
  } else if (hasWonMajorAnyTeam) {
    // Teamless fallback: major champions remain highly marketable even without recent league sample.
    leagueSignal = 0.82;
  }

  Engine.Runtime.Instance.log.debug(
    'PlayerScoutingCheck: kd=%s standing=%s form=%s leagueSignal=%s majorWinner=%s',
    kd.toFixed(2),
    standingScore.toFixed(2),
    formScore.toFixed(2),
    leagueSignal.toFixed(2),
    hasWonMajorAnyTeam ? 'true' : 'false',
  );

  // Helper: add tier idx safely
  const eligible = new Set<number>();
  const addTier = (idx: number) => {
    if (typeof idx !== 'number') return;
    if (idx < 0) return;
    if (idx >= Constants.Prestige.length) return;
    eligible.add(idx);
  };

  // Always: lateral at baseline
  addTier(baselineTierIdx);

  // Pro: always pro offers
  if (currentTierIdx >= idxPro) addTier(idxPro);
  if (hasWonMajorAnyTeam) {
    addTier(idxAdv);
    addTier(idxPro);
  }

  // Upward movement rules
  // - If baseline/current >= MAIN: allow MAIN lateral + occasional ADVANCED
  // - If baseline/current >= ADVANCED: allow ADVANCED lateral + rare low-ranked PRO
  // - If current tier OPEN/INTERMEDIATE: allow MAIN only on exceptional performance
  let proLowRankOnly = false;

  // User federation (prefer the profile include; fallback to country lookup)
  let userFedId: number | null =
    (profile as any)?.team?.competitionFederationId ??
    (profile as any)?.player?.country?.continent?.federationId ??
    null;

  const userFederation = await prisma.federation.findFirst({
    where: { id: userFedId },
    select: { slug: true },
  });
  const userFedSlug = userFederation?.slug as Constants.FederationSlug | undefined;
  const disabledTiers = userFedSlug
    ? (Constants.LeagueTierDisabledByFederation[userFedSlug] ?? [])
    : [];
  const midTiersDisabled =
    disabledTiers.includes(TierSlug.LEAGUE_INTERMEDIATE) &&
    disabledTiers.includes(TierSlug.LEAGUE_MAIN);

  const isLowTier = currentTierIdx <= idxInter;
  if (isLowTier) {
    const exceptional = leagueSignal >= 0.9;
    if (exceptional) {
      if (midTiersDisabled) {
        const rareJump = leagueSignal >= 0.93 && Chance.rollD2(15);
        if (rareJump) addTier(idxAdv);
      } else {
        addTier(idxMain);
      }
    }
  } else {
    if (baselineTierIdx >= idxMain && baselineTierIdx < idxAdv) {
      if (leagueSignal >= 0.75) addTier(idxAdv);
    }
    if (baselineTierIdx >= idxAdv && baselineTierIdx < idxPro) {
      if (leagueSignal >= 0.85) {
        addTier(idxPro);
        proLowRankOnly = true;
      }
    }
  }

  // Downward offers if performance isn't good
  if (leagueSignal <= 0.45) addTier(baselineTierIdx - 1);
  if (leagueSignal <= 0.3) addTier(baselineTierIdx - 2);

  const eligibleTierIdxs = Array.from(eligible).sort((a, b) => a - b);
  const eligibleTierSlugs = eligibleTierIdxs.map((i) => Constants.Prestige[i]);

  Engine.Runtime.Instance.log.debug(
    'PlayerScoutingCheck: currentTier=%s recentPeak=%s baseline=%s eligible=%s proLowRankOnly=%s',
    Constants.Prestige[currentTierIdx],
    Constants.Prestige[recentPeakTierIdx],
    Constants.Prestige[baselineTierIdx],
    eligibleTierSlugs.join(','),
    proLowRankOnly ? 'true' : 'false',
  );

  try {
    const role = resolveUserRole(profile, player);
    const tuning = getRoleOfferTuning(role);

    const baseCooldownDays = isTeamless
      ? UserOfferSettings.TEAMLESS_OFFER_COOLDOWN_DAYS
      : UserOfferSettings.TEAM_OFFER_COOLDOWN_DAYS;

    const cooldownDays = Math.max(
      1,
      Math.round(
        baseCooldownDays * (isTeamless ? tuning.cooldownMultTeamless : tuning.cooldownMultTeam),
      ),
    );

    if (player.lastOfferAt) {
      const daysSinceLast = differenceInDays(profile.date, player.lastOfferAt);
      if (daysSinceLast < cooldownDays) {
        Engine.Runtime.Instance.log.debug(
          'PlayerScoutingCheck: cooldown active (daysSinceLast=%d < cooldown=%d) role=%s',
          daysSinceLast,
          cooldownDays,
          role,
        );
        return Promise.resolve();
      }
    }

    // Eligibility checks: pending cap
    const pendingCount = await prisma.transfer.count({
      where: {
        playerId: profile.playerId,
        status: Constants.TransferStatus.PLAYER_PENDING,
      },
    });

    if (pendingCount >= UserOfferSettings.TEAMLESS_MAX_PENDING_OFFERS) {
      Engine.Runtime.Instance.log.debug(
        'PlayerScoutingCheck: pending offer cap hit (%d).',
        pendingCount,
      );
      return Promise.resolve();
    }

    // Contract gating
    const CONTRACT_SOFT_GATE_DAYS = (UserOfferSettings as any).CONTRACT_SOFT_GATE_DAYS ?? 180;
    const CONTRACT_HOT_WINDOW_DAYS = (UserOfferSettings as any).CONTRACT_HOT_WINDOW_DAYS ?? 120;

    let contractMult = 1.0;
    if (player.contractEnd) {
      const daysLeft = differenceInDays(player.contractEnd as any, profile.date);
      if (daysLeft > CONTRACT_SOFT_GATE_DAYS) contractMult = 0.25;
      else if (daysLeft <= CONTRACT_HOT_WINDOW_DAYS) contractMult = 1.25;
    }

    // Starter / transferListed modifiers
    const starterMult = player.starter ? 1.0 : 0.85;
    const listedMult = player.transferListed ? 0.9 : 1.0;

    // Pick a target tier (weighted among eligible tiers)
    const tierWeights: Record<string, number> = {};
    for (const tIdx of eligibleTierIdxs) {
      const delta = tIdx - baselineTierIdx;
      let w = 0;

      if (delta === 0) w = 70;
      else if (delta === -1) w = 20;
      else if (delta <= -2) w = 10;
      else if (delta === 1) w = 10;
      else if (delta >= 2) w = 4;

      // Performance shaping
      if (delta > 0) w = Math.round(w * Math.max(0.15, leagueSignal));
      if (delta < 0) w = Math.round(w * Math.max(0.15, 1 - leagueSignal + 0.1));

      // Non-starter: rarely move up; more likely "rescue" down
      if (!player.starter && delta > 0) w = Math.round(w * 0.35);
      if (!player.starter && delta < 0) w = Math.round(w * 1.25);

      // Transfer-listed: reduce upward, slightly increase downward
      if (player.transferListed && delta > 0) w = Math.round(w * 0.6);
      if (player.transferListed && delta < 0) w = Math.round(w * 1.15);

      if (w < 1) w = 1;
      tierWeights[String(tIdx)] = w;
    }

    if (Object.keys(tierWeights).length === 0) {
      Engine.Runtime.Instance.log.debug('PlayerScoutingCheck: no eligible tiers; skipping offer.');
      return Promise.resolve();
    }

    const pickedTierIdx = Number(Chance.roll(tierWeights));
    const pickedTierSlug = Constants.Prestige[pickedTierIdx] as TierSlug;

    // Probability model (weekly)
    const basePbxByTier: Partial<Record<TierSlug, number>> = {
      [TierSlug.LEAGUE_OPEN]: 35,
      [TierSlug.LEAGUE_INTERMEDIATE]: 28,
      [TierSlug.LEAGUE_MAIN]: 18,
      [TierSlug.LEAGUE_ADVANCED]: 12,
      [TierSlug.LEAGUE_PRO]: 8,
    };

    const base = basePbxByTier[pickedTierSlug] ?? 12;

    let pbx = base * (0.75 + leagueSignal * 0.75);
    pbx *= contractMult;
    pbx *= starterMult;
    pbx *= listedMult;

    // Teamless Advanced/Pro League scouting should be a bit rarer than contracted scouting
    if (isTeamless) pbx *= 0.85;
    if (
      hasWonMajorAnyTeam &&
      (pickedTierSlug === TierSlug.LEAGUE_ADVANCED || pickedTierSlug === TierSlug.LEAGUE_PRO)
    ) {
      pbx *= 1.5;
    }

    pbx *= tuning.pbxMultLeague;
    pbx = clampPbx(pbx);

    Engine.Runtime.Instance.log.debug(
      'PlayerScoutingCheck: role=%s pbxAfterRole=%d (roleMult=%s)',
      role,
      pbx,
      tuning.pbxMultLeague.toFixed(2),
    );

    Engine.Runtime.Instance.log.debug(
      'PlayerScoutingCheck: pickedTier=%s base=%d pbx=%d contractMult=%s starter=%s listed=%s',
      pickedTierSlug,
      base,
      pbx,
      contractMult.toFixed(2),
      player.starter ? 'true' : 'false',
      player.transferListed ? 'true' : 'false',
    );

    if (!Chance.rollD2(pbx)) {
      Engine.Runtime.Instance.log.debug('PlayerScoutingCheck: roll failed (pbx=%d).', pbx);
      return Promise.resolve();
    }

    const playerCountryContext = player.countryId
      ? await prisma.country.findFirst({
          where: { id: player.countryId },
          include: { continent: true },
        })
      : null;

    if (!userFedId && player.countryId) {
      userFedId = playerCountryContext?.continent?.federationId ?? null;
    }

    // If we cannot determine federation, safest is to skip (prevents invalid cross-region offers)
    if (!userFedId) {
      Engine.Runtime.Instance.log.debug('PlayerScoutingCheck: userFedId missing; skipping offer.');
      return Promise.resolve();
    }

    // Cross-federation chance depends on user's level (baseline tier)
    // - Open/Intermediate/Main: never
    // - Advanced: 15%
    // - Pro: 25%
    const crossFedPbx = pickedTierIdx >= idxPro ? 25 : pickedTierIdx >= idxAdv ? 15 : 0;

    const wantCrossFederation = crossFedPbx > 0 && Chance.rollD2(crossFedPbx);

    const teamWhere: any = {
      tier: pickedTierIdx,
      profile: null,
    };

    // Don't offer from the current team when user is contracted
    if (profile.teamId) {
      teamWhere.id = { not: profile.teamId };
    }

    // Federation restriction:
    // - default: same federation
    // - rare: other federations ONLY
    const federationFilter = wantCrossFederation ? { not: userFedId } : userFedId;
    teamWhere.competitionFederationId = federationFilter;

    const teams = await prisma.team.findMany({
      where: teamWhere,
      include: {
        personas: true,
        country: {
          include: {
            continent: true,
          },
        },
        players: {
          include: {
            country: {
              include: {
                continent: true,
              },
            },
          },
        },
      },
    });

    if (!teams.length) {
      Engine.Runtime.Instance.log.debug(
        'PlayerScoutingCheck: no teams found for tier=%s (crossFed=%s)',
        pickedTierSlug,
        wantCrossFederation ? 'true' : 'false',
      );
      return Promise.resolve();
    }

    const lastOfferTeamId = await getLastOfferTeamId(player.id);
    let pool = selectCountryAwareOfferPool(
      teams,
      player.countryId,
      playerCountryContext?.code ?? null,
      playerCountryContext?.continent?.code ?? null,
      userFedId,
      lastOfferTeamId,
    );

    if (proLowRankOnly && pickedTierIdx === idxPro) {
      const sortedAsc = [...pool].sort((a, b) => (a.elo ?? 0) - (b.elo ?? 0));
      const bottomCount = Math.max(3, Math.floor(sortedAsc.length * 0.3));
      pool = sortedAsc.slice(0, bottomCount);
    } else if (hasWonMajorAnyTeam && (pickedTierIdx === idxAdv || pickedTierIdx === idxPro)) {
      const sortedDesc = [...pool].sort((a, b) => (b.elo ?? 0) - (a.elo ?? 0));
      const topCount = Math.max(3, Math.floor(sortedDesc.length * 0.2));
      pool = sortedDesc.slice(0, topCount);
    } else if (leagueSignal >= 0.75) {
      // Strong performance: bias toward top teams in that tier
      const sortedDesc = [...pool].sort((a, b) => (b.elo ?? 0) - (a.elo ?? 0));
      const topCount = Math.max(3, Math.floor(sortedDesc.length * 0.25));
      pool = sortedDesc.slice(0, topCount);
    }

    const from = sample(pool);
    if (!from) return Promise.resolve();

    // Create transfer + offer
    let contractYears = rollContractYears(pickedTierSlug);
    const offerExpiresAt = addDays(profile.date, 7);
    if (!player.starter && contractYears > 1) contractYears -= 1;
    if (player.transferListed && contractYears > 1) contractYears -= 1;

    const baseWages = player.wages ?? 0;
    const baseCost = player.cost ?? 0;

    let wageMult = 0.9 + leagueSignal * 0.25; // 0.90..1.15
    if (!player.starter) wageMult *= 0.9;
    if (player.transferListed) wageMult *= 0.85;

    const wages = Math.max(0, Math.round(baseWages * wageMult));
    const cost = Math.max(0, Math.round(baseCost * (0.95 + leagueSignal * 0.15)));

    const transfer = await prisma.transfer.create({
      data: {
        status: Constants.TransferStatus.PLAYER_PENDING,
        from: { connect: { id: from.id } },
        target: { connect: { id: player.id } },
        offers: {
          create: [
            {
              status: Constants.TransferStatus.PLAYER_PENDING,
              wages,
              cost,
              contractYears,
              expiresAt: offerExpiresAt,
            },
          ],
        },
      },
      include: Eagers.transfer.include,
    });

    await prisma.calendar.create({
      data: {
        type: Constants.CalendarEntry.TRANSFER_OFFER_EXPIRY_CHECK,
        date: offerExpiresAt.toISOString(),
        payload: String(transfer.id),
      },
    });

    await prisma.player.update({
      where: { id: player.id },
      data: { lastOfferAt: profile.date },
    });

    const locale = getLocale(profile);
    const persona =
      from.personas.find(
        (p) =>
          p.role === Constants.PersonaRole.MANAGER || p.role === Constants.PersonaRole.ASSISTANT,
      ) ?? from.personas[0];
    const fromTierName = getTeamTierName(transfer.from?.tier);

    await sendEmail(
      Sqrl.render(locale.templates.OfferIncoming.SUBJECT, { transfer, profile }),
      Sqrl.render(locale.templates.OfferIncoming.CONTENT, { transfer, profile, fromTierName }),
      persona,
      profile.date,
      true,
    );

    WindowManager.sendAll(Constants.IPCRoute.TRANSFER_UPDATE);

    await scheduleOfferPauseAndExpiry(transfer.id, offerExpiresAt);
    Engine.Runtime.Instance.stop();

    Engine.Runtime.Instance.log.info(
      'League-based offer: %s -> %s (tier=%s years=%d wages=%d cost=%d pbx=%d)',
      from.name,
      (profile as any)?.player?.name ?? 'USER',
      pickedTierSlug,
      contractYears,
      wages,
      cost,
      pbx,
    );

    return Promise.resolve(transfer);
  } finally {
    // Schedule next weekly check (recurring)
    const nextDate = addDays(profile.date, 7);
    await schedulePlayerScoutingCheck(prisma, nextDate, playerId);
  }
}

async function schedulePlayerScoutingCheck(
  prisma: typeof DatabaseClient.prisma,
  date: Date,
  playerId: number,
) {
  const payload = String(playerId);
  return prisma.calendar.upsert({
    where: {
      date_type_payload: {
        date,
        type: Constants.CalendarEntry.PLAYER_SCOUTING_CHECK,
        payload,
      },
    },
    update: {},
    create: {
      type: Constants.CalendarEntry.PLAYER_SCOUTING_CHECK,
      date,
      payload,
    },
  });
}

/**
 * Weekly contract review (bench + kick) for the user player.
 *
 * Payload: playerId (stringified)
 */
async function schedulePlayerContractReview(
  prisma: typeof DatabaseClient.prisma,
  date: Date,
  playerId: number,
) {
  const payload = String(playerId);
  return prisma.calendar.upsert({
    where: {
      date_type_payload: {
        date,
        type: Constants.CalendarEntry.PLAYER_CONTRACT_REVIEW,
        payload,
      },
    },
    update: {},
    create: {
      type: Constants.CalendarEntry.PLAYER_CONTRACT_REVIEW,
      date,
      payload,
    },
  });
}

export async function onPlayerContractReview(entry: Calendar) {
  const prisma = DatabaseClient.prisma;
  const playerId = Number(entry.payload);

  // Load profile with team+player context (must exist and match payload)
  const profile = await prisma.profile.findFirst(Eagers.profile);
  if (!profile) return Promise.resolve();
  if (profile.playerId !== playerId) return Promise.resolve();

  // Must currently be on a team
  if (!profile.teamId || !profile.team) {
    return Promise.resolve();
  }

  const now = profile.date;
  const teamId = profile.teamId;

  // Load the user player state to prevent repeated benching + repeated emails.
  const userPlayer = await prisma.player.findFirst({
    where: { id: playerId },
    select: {
      id: true,
      teamId: true,
      starter: true,
      transferListed: true,
    },
  });

  if (!userPlayer) return Promise.resolve();

  // Safety: ensure we're still evaluating the same team context
  if (userPlayer.teamId !== teamId) return Promise.resolve();

  // If already benched/transfer-listed, do NOT bench again
  const isBenched = userPlayer.transferListed === true;

  // Tier slug from team tier idx
  const tierSlug = getTeamTierSlug(profile.team.tier);
  if (!tierSlug) {
    Engine.Runtime.Instance.log.warn(
      'onPlayerContractReview: could not resolve tierSlug (team.tier=%s). Skipping.',
      String(profile.team.tier),
    );
    // still reschedule
    const nextDate = addDays(now, 7);
    await schedulePlayerContractReview(prisma, nextDate, playerId);
    return Promise.resolve();
  }

  // Load active stint (contract start proxy)
  const activeStint = await prisma.careerStint.findFirst({
    where: { playerId, endedAt: null },
    orderBy: { startedAt: 'desc' },
    select: { startedAt: true, teamId: true, tier: true },
  });

  // If we cannot find an active stint, we still can run logic but we lose the kick window condition.
  const contractStart = activeStint?.startedAt ?? now;
  const daysInContract = differenceInDays(now, contractStart);

  // League stats for the last 30 league matches
  let kd = 0;
  let matchesPlayed = 0;
  try {
    const leagueRecent = await LeagueStats.computeLeagueLifetimeStats(
      teamId,
      playerId,
      30,
      contractStart,
    );
    kd = leagueRecent.kdRatio ?? 0;
    matchesPlayed = leagueRecent.matchesPlayed ?? 0;
  } catch (e) {
    Engine.Runtime.Instance.log.warn(
      'onPlayerContractReview: failed to compute league stats (teamId=%d playerId=%d).',
      teamId,
      playerId,
    );
  }

  // Team context scores
  const standingScore = await computeTeamStandingScore(profile);
  const formScore = await computeTeamFormScore(profile, 5);

  // Settings
  const S = Constants.PlayerContractSettings;

  const benchMinMatches = S.BENCH_MIN_LEAGUE_MATCHES;
  const kickWindowDays = S.KICK_WINDOW_DAYS;
  const kickMinMatches = S.KICK_MIN_LEAGUE_MATCHES;
  const benchKdMin = (S.BENCH_KD_MIN_BY_TIER as Record<string, number>)[tierSlug];
  const benchBasePbx = (S.BENCH_PBX_BY_TIER as Record<string, number>)[tierSlug];

  const kickKdMax = (S.KICK_KD_MAX_BY_TIER as Record<string, number>)[tierSlug];
  const kickBasePbx = (S.KICK_PBX_BY_TIER as Record<string, number>)[tierSlug];

  // Probability shaping based on form: (1 + (0.5 - formScore)) => [~0.5..~1.5] if formScore in [0..1]
  const formMult = 1 + (0.5 - formScore);

  Engine.Runtime.Instance.log.debug(
    `onPlayerContractReview: teamId=${teamId} tier=${tierSlug} daysInContract=${daysInContract} ` +
      `kd=${kd.toFixed(2)} matches=${matchesPlayed} standing=${standingScore.toFixed(2)} form=${formScore.toFixed(2)}`,
  );

  // Off-season / inactivity block: require at least 3 matches in the last 30 days
  const reviewMinRecentMatches = S.REVIEW_MIN_MATCHES_LAST_30_DAYS ?? 3;

  // Use a true last-30-days window (optionally clamped to contractStart)
  const since30d = subDays(now, 30);
  const activitySince = contractStart > since30d ? contractStart : since30d;

  let matchesPlayed30d = 0;
  try {
    matchesPlayed30d = await prisma.match.count({
      where: {
        status: Constants.MatchStatus.COMPLETED,
        competitionId: { not: null },
        date: { gte: activitySince.toISOString() },
        competitors: { some: { teamId } },
        events: {
          some: {
            OR: [{ attackerId: playerId }, { victimId: playerId }, { assistId: playerId }],
          },
        },
      },
    });
  } catch (_) {
    matchesPlayed30d = 0;
  }
  const hasRecentActivity = matchesPlayed30d >= reviewMinRecentMatches;

  if (!hasRecentActivity) {
    Engine.Runtime.Instance.log.debug(
      'onPlayerContractReview: skipping kick/bench; only %d user-played matches in last 30 days (min=%d).',
      matchesPlayed30d,
      reviewMinRecentMatches,
    );
  } else {
    // Kick logic
    const inKickWindow = daysInContract <= kickWindowDays;
    const eligibleForKick =
      !isBenched && inKickWindow && matchesPlayed >= kickMinMatches && kd <= kickKdMax;

    if (eligibleForKick) {
      let pbx = kickBasePbx * formMult;
      pbx = Math.max(1, Math.min(95, Math.round(pbx)));

      Engine.Runtime.Instance.log.debug(
        `onPlayerContractReview: kick check eligible (kd<=${kickKdMax.toFixed(
          2,
        )}, matches>=${kickMinMatches}, days<=${kickWindowDays}). pbx=${pbx}`,
      );

      if (Chance.rollD2(pbx)) {
        await kickUserPlayer({
          teamId,
          playerId,
          now,
          reason: `Performance below standard (KD ${kd.toFixed(
            2,
          )} <= ${kickKdMax.toFixed(2)}) within first ${kickWindowDays} days. Form=${formScore.toFixed(
            2,
          )}.`,
        });

        return Promise.resolve();
      }
    }

    // Bench logic
    const eligibleForBench = !isBenched && matchesPlayed >= benchMinMatches && kd < benchKdMin;

    if (eligibleForBench) {
      let pbx = benchBasePbx * formMult;
      pbx = Math.max(1, Math.min(95, Math.round(pbx)));

      Engine.Runtime.Instance.log.debug(
        'onPlayerContractReview: bench check eligible (kd<%.2f, matches>=%d). pbx=%d',
        benchKdMin,
        benchMinMatches,
        pbx,
      );

      if (Chance.rollD2(pbx)) {
        await benchUserPlayer({
          teamId,
          playerId,
          now,
          reason: `Underperforming (KD ${kd.toFixed(2)} < ${benchKdMin.toFixed(
            2,
          )}) after ${matchesPlayed} matches. Form=${formScore.toFixed(2)}.`,
        });
        // Continue through to reschedule (bench does not remove contract)
      }
    }
  }

  // Reschedule weekly review if still on a team
  const freshProfile = await prisma.profile.findFirst(Eagers.profile);
  if (freshProfile?.playerId === playerId && freshProfile.teamId) {
    const nextDate = addDays(now, 7);
    await schedulePlayerContractReview(prisma, nextDate, playerId);
  }

  return Promise.resolve();
}

async function getUserMajorWinFlags(params: {
  prisma: typeof DatabaseClient.prisma;
  playerId: number;
  currentTeamId?: number | null;
}) {
  const { prisma, playerId, currentTeamId = null } = params;

  const majorWinWithPlayer = await prisma.competitionToTeam.findFirst({
    where: {
      position: 1,
      teamId: { not: null },
      competition: {
        tier: { slug: TierSlug.MAJOR_CHAMPIONS_STAGE },
        matches: {
          some: {
            players: {
              some: { id: playerId },
            },
          },
        },
      },
    },
    select: { teamId: true },
  });

  const hasWonMajorAnyTeam = Boolean(majorWinWithPlayer?.teamId);

  const hasWonMajorWithCurrentTeam =
    currentTeamId != null
      ? (await prisma.competitionToTeam.count({
          where: {
            position: 1,
            teamId: currentTeamId,
            competition: {
              tier: { slug: TierSlug.MAJOR_CHAMPIONS_STAGE },
              matches: {
                some: {
                  players: {
                    some: { id: playerId },
                  },
                },
              },
            },
          },
        })) > 0
      : false;

  return {
    hasWonMajorAnyTeam,
    hasWonMajorWithCurrentTeam,
  };
}

/**
 * One-shot contract extension evaluation.
 *
 * Payload: playerId (stringified)
 */
export async function onPlayerContractExtensionEval(entry: Calendar) {
  const prisma = DatabaseClient.prisma;
  const playerId = Number(entry.payload);
  const logExit = (reason: string) => {
    Engine.Runtime.Instance.log.info(
      'onPlayerContractExtensionEval exit: playerId=%d entryId=%d reason=%s',
      playerId,
      entry.id,
      reason,
    );
    return Promise.resolve();
  };
  if (!Number.isFinite(playerId) || playerId <= 0) {
    return logExit(`invalid-payload=${String(entry.payload)}`);
  }

  const profile = await prisma.profile.findFirst(Eagers.profile);
  if (!profile) return logExit('profile-missing');
  if (profile.playerId !== playerId) return logExit('not-user-player');

  // Must be on a team
  if (!profile.teamId || !profile.team) return logExit('profile-team-missing');

  const now = profile.date;
  const teamId = profile.teamId;
  const { hasWonMajorWithCurrentTeam } = await getUserMajorWinFlags({
    prisma,
    playerId,
    currentTeamId: teamId,
  });

  // Load the current player to check contract end
  const player = await prisma.player.findFirst({
    where: { id: playerId },
    select: {
      id: true,
      teamId: true,
      contractEnd: true,
      starter: true,
      transferListed: true,
      wages: true,
      cost: true,
    },
  });
  if (!player) return logExit('player-missing');
  if (player.teamId !== teamId) return logExit('player-team-mismatch');
  if (!player.contractEnd) return logExit('contract-end-missing');
  if (player.transferListed) {
    Engine.Runtime.Instance.log.debug(
      'onPlayerContractExtensionEval: playerId=%d is transferListed; skipping extension offer.',
      playerId,
    );
    return logExit('transfer-listed');
  }

  // Window check: 0 < daysLeft <= 30
  const daysLeft = differenceInDays(player.contractEnd, now);
  if (
    !(
      daysLeft > 0 &&
      daysLeft <= (Constants.PlayerContractSettings.EXTENSION_EVAL_DAYS_BEFORE_END ?? 30)
    )
  ) {
    return logExit(`outside-window-days-left=${daysLeft}`);
  }

  // Determine tier slug
  const tierSlug = getTeamTierSlug(profile.team.tier);
  if (!tierSlug) return logExit('tier-slug-missing');

  // Prevent duplicate extension offers (pending)
  const existingPendingExtension = await prisma.transfer.findFirst({
    where: {
      playerId,
      status: Constants.TransferStatus.PLAYER_PENDING,
      teamIdFrom: teamId,
      offers: {
        some: {
          status: Constants.TransferStatus.PLAYER_PENDING,
        },
      },
    },
    select: { id: true },
  });

  if (existingPendingExtension) {
    Engine.Runtime.Instance.log.debug(
      'onPlayerContractExtensionEval: pending extension offer already exists (transferId=%d).',
      existingPendingExtension.id,
    );
    return logExit(`pending-extension-transfer-id=${existingPendingExtension.id}`);
  }

  // Pull league stats
  let kd = 0;
  let matchesPlayed = 0;
  try {
    const leagueRecent = await LeagueStats.computeLeagueLifetimeStats(teamId, playerId, 30);
    kd = leagueRecent.kdRatio ?? 0;
    matchesPlayed = leagueRecent.matchesPlayed ?? 0;
  } catch (_) {
    // If stats fail, do not offer an extension.
    return logExit('league-stats-failed');
  }

  // Team context
  const standingScore = await computeTeamStandingScore(profile);
  const formScore = await computeTeamFormScore(profile, 5);

  const S = Constants.PlayerContractSettings;

  const extMinMatches = S.EXTENSION_MIN_MATCHES ?? 7;

  // Tier-indexed extension thresholds
  const extOkKd = (S.EXTENSION_PLAYER_OK_KD_BY_TIER as Record<string, number>)[tierSlug] ?? 1.0;

  // "Good team" and "good/ok player"
  const goodTeam = formScore >= 0.5; // optionally also check standingScore >= 0.5
  const goodPlayer = matchesPlayed >= extMinMatches && kd >= extOkKd;

  // "Ok player" bucket (for the goodTeam+okPlayer case)
  // Slightly below "good", but not bench-worthy.
  const okKdFloor = extOkKd * 0.95;
  const okPlayer = matchesPlayed >= extMinMatches && kd >= okKdFloor;

  // Choose probability bucket
  let pbx = 0;

  if (goodTeam && goodPlayer) {
    pbx = S.EXTENSION_PBX_GOOD_TEAM_GOOD_PLAYER ?? 85;
  } else if (!goodTeam && goodPlayer) {
    pbx = S.EXTENSION_PBX_BAD_TEAM_GOOD_PLAYER ?? 45;
  } else if (goodTeam && okPlayer) {
    pbx = S.EXTENSION_PBX_GOOD_TEAM_OK_PLAYER ?? 55;
  } else {
    pbx = 0;
  }

  if (hasWonMajorWithCurrentTeam) {
    pbx = Math.max(pbx, 85);
    Engine.Runtime.Instance.log.info(
      'onPlayerContractExtensionEval: major winner with current team, forcing min extension pbx=85.',
    );
  }

  // Additional small decline chance even when conditions are good
  const declinePbx = S.EXTENSION_DECLINE_PBX_EVEN_IF_GOOD ?? 10;
  if (pbx > 0 && declinePbx > 0 && Chance.rollD2(declinePbx)) {
    Engine.Runtime.Instance.log.debug(
      'onPlayerContractExtensionEval: declined to offer despite eligibility (declinePbx=%d).',
      declinePbx,
    );
    return logExit(`declined-by-roll-pbx=${declinePbx}`);
  }

  if (pbx <= 0) return logExit('pbx-zero');

  // Roll whether we offer
  pbx = Math.max(1, Math.min(95, Math.round(pbx)));
  if (!Chance.rollD2(pbx)) {
    Engine.Runtime.Instance.log.debug(
      'onPlayerContractExtensionEval: offer roll failed (pbx=%d).',
      pbx,
    );
    return logExit(`offer-roll-failed-pbx=${pbx}`);
  }

  const contractYears = rollContractYears(tierSlug);
  const rawExpiry = addDays(now, 30);
  const offerExpiresAt = player.contractEnd
    ? player.contractEnd < rawExpiry
      ? player.contractEnd
      : rawExpiry
    : rawExpiry;

  // Create transfer-like "extension offer"
  const transfer = await prisma.transfer.create({
    data: {
      status: Constants.TransferStatus.PLAYER_PENDING,
      from: { connect: { id: teamId } },
      target: { connect: { id: playerId } },
      offers: {
        create: [
          {
            status: Constants.TransferStatus.PLAYER_PENDING,
            wages: player.wages ?? 0,
            cost: player.cost ?? 0,
            contractYears,
            expiresAt: offerExpiresAt,
          },
        ],
      },
    },
    include: Eagers.transfer.include,
  });

  await prisma.calendar.create({
    data: {
      type: Constants.CalendarEntry.TRANSFER_OFFER_EXPIRY_CHECK,
      date: offerExpiresAt.toISOString(),
      payload: String(transfer.id),
    },
  });

  // Email
  const locale = getLocale(profile);
  const persona =
    profile.team.personas.find(
      (p) => p.role === Constants.PersonaRole.MANAGER || p.role === Constants.PersonaRole.ASSISTANT,
    ) ?? profile.team.personas[0];

  const tierName = getTeamTierName(profile.team.tier);

  if ((locale.templates as any).ContractExtensionOffer) {
    await sendEmail(
      Sqrl.render((locale.templates as any).ContractExtensionOffer.SUBJECT, {
        profile,
        transfer,
        tierName,
      }),
      Sqrl.render((locale.templates as any).ContractExtensionOffer.CONTENT, {
        profile,
        transfer,
        daysLeft,
        contractYears,
      }),
      persona,
      now,
      true,
    );
  }

  WindowManager.sendAll(Constants.IPCRoute.TRANSFER_UPDATE);

  await scheduleOfferPauseAndExpiry(transfer.id, offerExpiresAt);
  Engine.Runtime.Instance.stop();

  Engine.Runtime.Instance.log.info(
    'Contract extension offer created: teamId=%d playerId=%d tier=%s years=%d pbx=%d kd=%.2f matches=%d form=%.2f standing=%.2f daysLeft=%d',
    teamId,
    playerId,
    tierSlug,
    contractYears,
    pbx,
    kd,
    matchesPlayed,
    formScore,
    standingScore,
    daysLeft,
  );
  Engine.Runtime.Instance.log.info(
    'onPlayerContractExtensionEval exit: playerId=%d entryId=%d reason=offer-created transferId=%d',
    playerId,
    entry.id,
    transfer.id,
  );

  return Promise.resolve();
}

function isExtensionOffer(params: {
  profile: Prisma.ProfileGetPayload<typeof Eagers.profile>;
  transfer: Prisma.TransferGetPayload<typeof Eagers.transfer>;
}) {
  const { profile, transfer } = params;

  const fromTeamId = transfer.from?.id ?? null;
  if (!fromTeamId) return false;

  // Must currently be on a team and the offer must come from that same team.
  if (!profile.teamId) return false;
  if (fromTeamId !== profile.teamId) return false;

  const playerTeamId = (profile as any)?.player?.teamId ?? null;
  if (playerTeamId != null && playerTeamId !== profile.teamId) return false;

  return true;
}

/**
 * Records the match results for the day by updating
 * their respective tournament object entries.
 *
 * Also checks whether any competitions are set to start
 * after the completion of a dependent competition and
 * creates their calendar entry database record.
 *
 * @function
 */
function phaseClock(report?: (phase: string, elapsedMs: number) => void) {
  let started = performance.now();
  return (phase: string) => {
    const now = performance.now();
    report?.(phase, now - started);
    started = now;
  };
}

export async function recordMatchResults(report?: (phase: string, elapsedMs: number) => void) {
  const readPhase = phaseClock(report);
  // get today's match results
  const profile = await DatabaseClient.prisma.profile.findFirst();
  const today = profile?.date || new Date();
  const from = startOfDay(today);
  const to = endOfDay(today);
  const allMatches = await DatabaseClient.prisma.match.findMany({
    where: {
      date: {
        gte: from.toISOString(),
        lte: to.toISOString(),
      },
      matchType: { not: 'FACEIT_PUG' },
      status: Constants.MatchStatus.COMPLETED,
    },
    include: {
      competitors: true,
    },
  });

  // group them together by competition id
  const groupedMatches = groupBy(allMatches, 'competitionId');
  const competitionIds = Object.keys(groupedMatches);
  if (!competitionIds.length) {
    readPhase('results-read');
    return [];
  }
  // Fetch each tournament blob once, not as a nested object repeated on
  // every match. The persisted format and dependent-round ordering stay intact.
  const competitions = await DatabaseClient.prisma.competition.findMany({
    where: { id: { in: competitionIds.map(Number) } },
    include: {
      competitors: true,
      tier: { include: { league: true } },
      federation: true,
    },
  });
  const competitionsById = new Map(competitions.map((competition) => [competition.id, competition]));
  readPhase('results-read');

  // record results for all competitions
  return Promise.all(
    competitionIds.map(async (competitionId) => {
      const phase = phaseClock(report);
      const numericCompetitionId = Number(competitionId);
      // restore tournament object
      const matches = groupedMatches[competitionId];
      const competition = competitionsById.get(numericCompetitionId);
      if (!competition) throw new Error(`Missing competition ${competitionId} while recording results`);
      const cachedTournament = recordedTournamentCache.get(numericCompetitionId);
      const isCacheHit = cachedTournament?.serialized === competition.tournament;
      if (isCacheHit) {
        recordedTournamentCacheHits += 1;
      } else {
        recordedTournamentCacheMisses += 1;
      }
      const tournament =
        isCacheHit
          ? cachedTournament.tournament
          : Tournament.restore(
              JSON.parse(competition.tournament) as ReturnType<Tournament['save']>,
            );
      // The cached object is mutated below. Remove it until the database
      // update succeeds so a failed result write can never leave stale state
      // available to a later retry.
      recordedTournamentCache.delete(numericCompetitionId);

      // record match results with tourney
      matches.forEach((match) => {
        const cluxMatch = tournament.$base.findMatch(JSON.parse(match.payload));

        // skip if this match is a BYE
        if (cluxMatch.p.includes(-1)) {
          return;
        }

        // get home and away scores based off of their seeds since
        // the competitors array is not in the correct order
        const [home, away] = cluxMatch.p;
        const homeScore = match.competitors.find((competitor) => home === competitor.seed);
        const awayScore = match.competitors.find((competitor) => away === competitor.seed);

        // record the score
        tournament.$base.score(cluxMatch.id, [homeScore.score, awayScore.score]);
      });
      phase('results-score');

      // check if a new cup round must be generated
      //
      // this is done by checking if all
      // matches have not been scored
      const upperMatches = tournament.$base.currentRound(Constants.BracketIdentifier.UPPER);
      const lowerMatches = tournament.$base.currentRound(Constants.BracketIdentifier.LOWER);
      const upperRoundReady =
        Array.isArray(upperMatches) && upperMatches.every((match) => !match.m);
      const lowerRoundReady =
        Array.isArray(lowerMatches) && lowerMatches.every((match) => !match.m);

      let generatedNewMatches = false;

      if (tournament.brackets && !tournament.iemGroup && upperRoundReady) {
        Engine.Runtime.Instance.log.info('Generating next round of upper bracket matches...');
        await createMatchdays(upperMatches, tournament, competition);
        generatedNewMatches = true;
      }

      if (tournament.brackets && !tournament.iemGroup && lowerRoundReady) {
        Engine.Runtime.Instance.log.info('Generating next round of lower bracket matches...');
        await createMatchdays(lowerMatches, tournament, competition);
        generatedNewMatches = true;
      }

      if (tournament.iemGroup) {
        const groupMatches = tournament.iemGroup.generateNextRound();

        if (groupMatches.length > 0) {
          Engine.Runtime.Instance.log.info('Generating next IEM group bracket matches...');
          await createMatchdays(groupMatches, tournament, competition);
          generatedNewMatches = true;
        }
      }

      if (tournament.groupSwiss && upperRoundReady) {
        const groupSwissMatches = tournament.groupSwiss.generateNextRound();

        if (groupSwissMatches.length > 0) {
          Engine.Runtime.Instance.log.info('Generating next group swiss round matches...');
          await createMatchdays(groupSwissMatches, tournament, competition);
          generatedNewMatches = true;
        }
      }

      if (tournament.swiss && upperRoundReady) {
        const swissMatches = tournament.swiss.generateNextRound();

        if (swissMatches.length > 0) {
          Engine.Runtime.Instance.log.info('Generating next swiss round matches...');
          await createMatchdays(swissMatches, tournament, competition);
          generatedNewMatches = true;
        }
      }

      if (generatedNewMatches || tournament.$base.isDone()) {
        await syncCompetitionEndDate(Number(competitionId));
      }

      // check if competition is done and a start date must
      // be scheduled for a dependent competition
      if (tournament.$base.isDone() && competition.tier.triggerTierSlug) {
        const majorStageTiers = [
          Constants.TierSlug.MAJOR_CHALLENGERS_STAGE,
          Constants.TierSlug.MAJOR_LEGENDS_STAGE,
          Constants.TierSlug.MAJOR_CHAMPIONS_STAGE,
        ];
        const triggeredCompetition = await DatabaseClient.prisma.competition.findFirst({
          where: {
            season: competition.season,
            tier: {
              slug: competition.tier.triggerTierSlug,
            },
            ...(majorStageTiers.includes(competition.tier.triggerTierSlug as Constants.TierSlug)
              ? {}
              : {
                  federation: {
                    OR: [
                      { slug: competition.federation.slug },
                      { slug: Constants.FederationSlug.ESPORTS_WORLD },
                      ...(competition.tier.triggerTierSlug === Constants.TierSlug.MAJOR_ASIA_RMR
                        ? [{ slug: Constants.FederationSlug.ESPORTS_ASIA }]
                        : []),
                    ],
                  },
                }),
          },
          include: {
            federation: true,
            tier: true,
          },
        });

        if (triggeredCompetition) {
          const date = addDays(today, triggeredCompetition.tier.triggerOffsetDays);
          const scheduleCompetitionStart = async (
            targetCompetition: typeof triggeredCompetition,
            scheduledDate: Date,
          ) => {
            const existingEntry = await DatabaseClient.prisma.calendar.findFirst({
              where: {
                date: {
                  gte: today.toISOString(),
                  lte: scheduledDate.toISOString(),
                },
                type: Constants.CalendarEntry.COMPETITION_START,
                payload: targetCompetition.id.toString(),
              },
            });

            if (existingEntry) {
              return;
            }

            Engine.Runtime.Instance.log.debug(
              'Scheduling start date for %s on %s...',
              targetCompetition.tier.name,
              format(scheduledDate, Constants.Settings.calendar.calendarDateFormat),
            );

            try {
              await DatabaseClient.prisma.calendar.create({
                data: {
                  date: scheduledDate.toISOString(),
                  type: Constants.CalendarEntry.COMPETITION_START,
                  payload: targetCompetition.id.toString(),
                },
              });
            } catch (_) {
              Engine.Runtime.Instance.log.warn(
                'Existing start date for %s found. Skipping...',
                targetCompetition.tier.name,
              );
            }
          };

          await scheduleCompetitionStart(triggeredCompetition, date);

          if (competition.tier.triggerTierSlug === Constants.TierSlug.MAJOR_EUROPE_RMR_A) {
            const europeRmrBCompetition = await DatabaseClient.prisma.competition.findFirst({
              where: {
                season: competition.season,
                tier: {
                  slug: Constants.TierSlug.MAJOR_EUROPE_RMR_B,
                },
                federation: {
                  slug: Constants.FederationSlug.ESPORTS_EUROPA,
                },
              },
              include: {
                federation: true,
                tier: true,
              },
            });

            if (europeRmrBCompetition) {
              await scheduleCompetitionStart(europeRmrBCompetition, date);
            }
          }
        }
      }

      phase('results-progression');
      const isCompetitionDone = tournament.$base.isDone();
      const serializedTournament = JSON.stringify(tournament.save());
      const competitorsById = new Map(
        competition.competitors.map((competitor) => [competitor.id, competitor]),
      );
      // resultsFor() rebuilds and sorts the complete standings on every call.
      // Build the standings once per competition instead; this is especially
      // important for large league tournaments where this runs once per team.
      const standingsBySeed = new Map(
        tournament.$base.results().map((result) => [result.seed, result]),
      );
      const standingUpdates = tournament.competitors.flatMap((id) => {
        const result = standingsBySeed.get(tournament.getSeedByCompetitorId(id));
        if (!result) {
          throw new Error(`Missing tournament standing for competitor ${id}`);
        }
        const nextStanding = {
          position: result.gpos || result.pos,
          win: result.wins,
          loss: result.losses,
          draw: result.draws,
        };
        const currentStanding = competitorsById.get(id);

        // A result only changes the standings of the teams that played. Avoid
        // rewriting every other competitor in a league on each matchday.
        if (
          currentStanding &&
          currentStanding.position === nextStanding.position &&
          currentStanding.win === nextStanding.win &&
          currentStanding.loss === nextStanding.loss &&
          currentStanding.draw === nextStanding.draw
        ) {
          return [];
        }

        return [
          {
            where: { id },
            data: nextStanding,
          },
        ];
      });

      phase('results-serialize-standings');
      // update the competition database record
      const updatedCompetition = await DatabaseClient.prisma.$transaction(async (tx) => {
        // Keep the same missing/wrong-competition guard as a nested update.
        if (standingUpdates.some((update) => !competitorsById.has(update.where.id))) {
          throw new Error(`Invalid competitor in competition ${numericCompetitionId}`);
        }
        let changed = 0;
        for (const statement of numericUpdateBatches('CompetitionToTeam', standingUpdates.map((update) => ({
          id: update.where.id, data: update.data,
        })))) {
          changed += await tx.$executeRaw(statement);
        }
        if (changed !== standingUpdates.length) throw new Error('Competition standing disappeared during update');
        return tx.competition.update({
        where: { id: numericCompetitionId },
        data: {
          status: isCompetitionDone
            ? Constants.CompetitionStatus.COMPLETED
            : Constants.CompetitionStatus.STARTED,
          tournament: serializedTournament,
        },
        });
      });

      phase('results-persist');
      // awards and prize pool distribution
      await Promise.all([
        sendUserAward(competition, tournament),
        distributePrizePool(competition, tournament),
        isCompetitionDone
          ? DatabaseClient.prisma.profile
              .findFirst({ select: { simulateNpcMatchStats: true } })
              .then((profile) =>
                profile?.simulateNpcMatchStats ? upsertCompetitionMvp(Number(competitionId)) : null,
              )
          : Promise.resolve(),
      ]);

      phase('results-awards');
      if (isCompetitionDone) {
        recordedTournamentCache.delete(numericCompetitionId);
      } else {
        recordedTournamentCache.set(numericCompetitionId, {
          serialized: serializedTournament,
          tournament,
        });
      }

      return updatedCompetition;
    }),
  );
}

/**
 * Tournament state is persisted after every match result, so this cache is
 * only an in-memory acceleration for a single calendar run. Clear it after a
 * loop to release memory and ensure a later run always starts from SQLite.
 */
export function clearRecordMatchResultsCache() {
  const stats = {
    hits: recordedTournamentCacheHits,
    misses: recordedTournamentCacheMisses,
  };
  recordedTournamentCache.clear();
  recordedTournamentCacheHits = 0;
  recordedTournamentCacheMisses = 0;
  return stats;
}

/**
 * Creates a calendar entry to start
 * the next season a year from today.
 *
 * @function
 */
export async function scheduleNextSeasonStart() {
  const profile = await DatabaseClient.prisma.profile.findFirst();
  const date = addYears(profile.date, 1);
  const existingEntry = await DatabaseClient.prisma.calendar.findFirst({
    where: {
      date: date.toISOString(),
      type: Constants.CalendarEntry.SEASON_START,
    },
  });

  if (existingEntry) {
    return existingEntry;
  }

  return DatabaseClient.prisma.calendar.create({
    data: {
      date: date.toISOString(),
      type: Constants.CalendarEntry.SEASON_START,
    },
  });
}

/**
 * Sends an e-mail to the user and notifies the main
 * window process to render a toast notification.
 *
 * @param subject   The subject.
 * @param content   The content.
 * @param persona   The persona.
 * @param sentAt    The sent at date.
 * @param notify    Notify the main window.
 * @function
 */
export async function sendEmail(
  subject: string,
  content: string,
  persona: Prisma.PersonaGetPayload<unknown>,
  sentAt: Date,
  notify = true,
) {
  const dialogues: Prisma.EmailUpsertArgs['create']['dialogues'] = {
    create: {
      sentAt,
      content,
      from: {
        connect: { id: persona.id },
      },
    },
  };
  const email = await DatabaseClient.prisma.email.upsert({
    where: { subject },
    update: {
      dialogues,
      read: false,
    },
    create: {
      subject,
      dialogues,
      sentAt,
      from: {
        connect: {
          id: persona.id,
        },
      },
    },
    include: Eagers.email.include,
  });

  // let the renderer know a new e-mail came in
  if (notify) {
    const mainWindow = WindowManager.get(Constants.WindowIdentifier.Main).webContents;
    mainWindow.send(Constants.IPCRoute.EMAILS_NEW, email);
  }

  return Promise.resolve(email);
}

/**
 * Determine whether to send the user an award.
 *
 * @param competition         The competition database record.
 * @param preloadedTournament Tournament instance, if already loaded.
 * @function
 */
export async function sendUserAward(
  competition: Prisma.CompetitionGetPayload<{ include: { competitors: true; tier: true } }>,
  preloadedTournament?: Tournament,
) {
  // Restore/check completion before loading the large profile eager graph.
  // Most competitions are unfinished on a given matchday and cannot produce
  // an award, so this avoids a costly database query for those competitions.
  const tournament = preloadedTournament || Tournament.restore(JSON.parse(competition.tournament));

  if (!tournament.$base.isDone()) {
    return Promise.resolve();
  }

  const profile = await DatabaseClient.prisma.profile.findFirst(Eagers.profile);

  // Teamless player: no user awards.
  if (!profile || profile.teamId == null || !profile.team) {
    return Promise.resolve();
  }

  // check if user is participating in competition
  const userCompetitorId = competition.competitors.find(
    (competitor) => competitor.teamId === profile.teamId,
  );
  const userSeed = tournament.getSeedByCompetitorId(userCompetitorId?.id);

  if (!userSeed) {
    return Promise.resolve();
  }

  // check if competition has any awards
  const awards = Constants.Awards.filter(
    (award) =>
      award.target === competition.tier.slug &&
      award.on === Constants.CalendarEntry.COMPETITION_END,
  );

  if (!awards.length) {
    return Promise.resolve();
  }

  // now check if user placed
  const result = tournament.$base.resultsFor(userSeed);
  const position = result.gpos || result.pos;
  const [award] = awards.filter((award) =>
    !award.end ? position === award.start : position > award.start && position <= award.end,
  );

  if (!award || !award.action) {
    return Promise.resolve();
  }

  // figure out the type of e-mail to send
  const locale = getLocale(profile);
  let email: (typeof locale.templates)[keyof typeof locale.templates];

  switch (award.type) {
    case Constants.AwardType.CHAMPION:
      email = locale.templates.AwardTypeChampion;
      break;
    case Constants.AwardType.PROMOTION:
      email = locale.templates.AwardTypePromotion;
      break;
    case Constants.AwardType.QUALIFY:
      email = locale.templates.AwardTypeQualify;
      break;
    default:
      Engine.Runtime.Instance.log.warn('Award type %s not implemented.', award.type);
      break;
  }

  // run the actions (email, confetti, etc)
  return Promise.all(
    award.action.map((action) => {
      switch (action) {
        case Constants.AwardAction.EMAIL:
          return sendEmail(
            Sqrl.render(email.SUBJECT, { profile }),
            Sqrl.render(email.CONTENT, {
              profile,
              competition: Constants.IdiomaticTier[competition.tier.slug],
            }),
            profile.team.personas[0],
            profile.date,
          );
        case Constants.AwardAction.CONFETTI:
          WindowManager.get(Constants.WindowIdentifier.Main).webContents?.send(
            Constants.IPCRoute.CONFETTI_START,
          );
          return Promise.resolve();
        default:
          return Promise.resolve();
      }
    }),
  );
}

async function getLastOfferTeamId(playerId: number) {
  const latestTransfer = await DatabaseClient.prisma.transfer.findFirst({
    where: { playerId },
    orderBy: { id: 'desc' },
    select: { teamIdFrom: true },
  });

  return latestTransfer?.teamIdFrom ?? null;
}

function filterRepeatedOfferTeam<T extends { id: number }>(
  teams: T[],
  lastOfferTeamId: number | null,
) {
  if (!lastOfferTeamId || teams.length <= 1) return teams;

  const filteredTeams = teams.filter((team) => team.id !== lastOfferTeamId);
  return filteredTeams.length ? filteredTeams : teams;
}

const MIXED_REGION_COUNTRY_CODES = new Set(['EU', 'NA', 'XSA', 'AS']);
const MIXED_REGION_STORAGE_CODES: Record<string, string> = {
  eu: 'EU',
  na: 'NA',
  xsa: 'SA',
  sa: 'SA',
  as: 'AS',
};
const OTHER_TEAM_COUNTRY_CODE = 'other';

function getTeamRegionCode(team: {
  countryId: number;
  country?: { code?: string | null; continent?: { code?: string | null } | null } | null;
}) {
  const teamCountryCode = team.country?.code ?? null;
  const storedRegionCode = teamCountryCode ? MIXED_REGION_STORAGE_CODES[teamCountryCode] : null;

  if (storedRegionCode) {
    return storedRegionCode;
  }

  return team.country?.continent?.code?.toUpperCase() ?? null;
}

function matchesTeamCountryPreference(
  team: {
    countryId: number;
    competitionFederationId?: number | null;
    country?: { code?: string | null; continent?: { code?: string | null } | null } | null;
  },
  candidate: {
    countryId?: number | null;
    country?: { continent?: { code?: string | null } | null } | null;
  },
) {
  const teamRegionCode = getTeamRegionCode(team);

  if (teamRegionCode && MIXED_REGION_COUNTRY_CODES.has(teamRegionCode)) {
    return candidate.country?.continent?.code?.toUpperCase() === teamRegionCode;
  }

  return candidate.countryId === team.countryId;
}

function isInternationalTeamCountry(team: {
  countryId: number;
  country?: { code?: string | null; continent?: { code?: string | null } | null } | null;
}) {
  // A real national country also has a continent code (for example Sweden is
  // in EU). Only the synthetic mixed-region country rows represent an
  // international team.
  const countryCode = team.country?.code?.toLowerCase() ?? null;
  return Boolean(countryCode && MIXED_REGION_STORAGE_CODES[countryCode]);
}

function getTeamNationalityCohesion(team: {
  countryId: number;
  players?: Array<{
    starter?: boolean | null;
    countryId?: number | null;
    country?: { continent?: { code?: string | null } | null } | null;
  }> | null;
  country?: { code?: string | null; continent?: { code?: string | null } | null } | null;
}) {
  const players = (team.players || []).filter((player) => player.starter !== false);
  if (!players.length) return 0;

  const identity = getNpcTransferTeamIdentity(team);
  const preferredCount = players.filter((player) => {
    if (identity.type === 'national-lock' || identity.type === 'national-core') {
      return player.countryId === identity.countryId;
    }
    if (identity.type === 'cis-core') {
      return isNpcTransferCisCountry(player);
    }

    return matchesTeamCountryPreference(team, player);
  }).length;
  return preferredCount / players.length;
}

function getAgeReplacementBonus(
  incoming: { age?: number | null },
  victim: { age?: number | null },
) {
  const incomingAge = incoming.age ?? 24;
  const victimAge = victim.age ?? 24;

  if (incomingAge <= 23 && victimAge >= 30) return 10;
  if (incomingAge <= 25 && victimAge >= 32) return 8;
  if (incomingAge <= 27 && victimAge >= 35) return 6;
  return 0;
}

function getVeteranOfferPenalty(player: { age?: number | null; xp?: number | null }) {
  const age = player.age ?? 24;
  if (age < 35) return 0;

  const xp = player.xp ?? 0;
  const eliteMitigation = Math.max(0, xp - 80);
  return Math.max(10, 35 - eliteMitigation);
}

function getNationalReplacementXpTolerance(team: {
  countryId: number;
  players?: Array<{
    starter?: boolean | null;
    countryId?: number | null;
    country?: { continent?: { code?: string | null } | null } | null;
  }> | null;
  country?: { code?: string | null; continent?: { code?: string | null } | null } | null;
}) {
  if (isInternationalTeamCountry(team)) return 0;

  const cohesion = getTeamNationalityCohesion(team);
  if (cohesion >= 0.95) return 22;
  if (cohesion >= 0.8) return 18;
  if (cohesion >= 0.6) return 14;
  return 10;
}

function getNPCFreeAgentSignChance(team: {
  tier?: number | null;
  players?: Array<{ starter?: boolean | null; countryId?: number | null }> | null;
}) {
  const baseChance = Constants.TransferSettings.PBX_NPC_FREE_AGENT_SIGN;
  const advancedTierIdx = Constants.Prestige.findIndex((p) => p === TierSlug.LEAGUE_ADVANCED);
  const proTierIdx = Constants.Prestige.findIndex((p) => p === TierSlug.LEAGUE_PRO);
  const teamTier = team.tier ?? 0;
  const identity = getNpcTransferTeamIdentity(team);
  const nationalActivityBoost =
    identity.type === 'national-core' ? 6 : identity.type === 'national-lock' ? 3 : 0;

  if (teamTier >= proTierIdx) return Math.max(3, baseChance - 5 + nationalActivityBoost);
  if (teamTier >= advancedTierIdx) return Math.max(4, baseChance - 3 + nationalActivityBoost);
  return baseChance + nationalActivityBoost;
}

function getMissingIntermediateLeagueTierCount(params: {
  federationSlug?: string | null;
  sourceTier?: number | null;
  destinationTier?: number | null;
}) {
  const { federationSlug, sourceTier, destinationTier } = params;
  if (
    !federationSlug ||
    typeof sourceTier !== 'number' ||
    typeof destinationTier !== 'number' ||
    sourceTier >= destinationTier
  ) {
    return 0;
  }

  const disabledTiers =
    Constants.LeagueTierDisabledByFederation[federationSlug as Constants.FederationSlug] ?? [];

  let missingCount = 0;
  for (let tier = sourceTier + 1; tier < destinationTier; tier += 1) {
    const tierSlug = Constants.Prestige[tier] as TierSlug | undefined;
    if (tierSlug && disabledTiers.includes(tierSlug)) {
      missingCount += 1;
    }
  }

  return missingCount;
}

function getLowerLeagueTransferBoost(params: {
  from: {
    tier?: number | null;
    competitionFederation?: { slug?: string | null } | null;
    competitionFederationId?: number | null;
    countryId?: number | null;
    country?: {
      code?: string | null;
      continent?: { code?: string | null; federationId?: number | null } | null;
    } | null;
    players?: Array<{
      starter?: boolean | null;
      countryId?: number | null;
      country?: {
        continent?: { code?: string | null; federationId?: number | null } | null;
      } | null;
    }> | null;
  };
  player: {
    xp?: number | null;
    countryId?: number | null;
    country?: { continent?: { code?: string | null; federationId?: number | null } | null } | null;
  };
  sourceTier?: number | null;
}) {
  const advancedTierIdx = Constants.Prestige.findIndex((p) => p === TierSlug.LEAGUE_ADVANCED);
  const proTierIdx = Constants.Prestige.findIndex((p) => p === TierSlug.LEAGUE_PRO);
  return getLowerLeaguePromotionCandidateScore(params.from, params.player, {
    destinationTier: params.from.tier,
    sourceTier: params.sourceTier,
    advancedTier: advancedTierIdx,
    proTier: proTierIdx,
    missingIntermediateTiers: getMissingIntermediateLeagueTierCount({
      federationSlug: params.from.competitionFederation?.slug ?? null,
      sourceTier: params.sourceTier,
      destinationTier: params.from.tier,
    }),
  });
}

function getNPCBuyerActivityWeight(team: {
  tier?: number | null;
  competitionFederation?: { slug?: string | null } | null;
  players?: Array<{ starter?: boolean | null; countryId?: number | null }> | null;
}) {
  const advancedTierIdx = Constants.Prestige.findIndex((p) => p === TierSlug.LEAGUE_ADVANCED);
  const proTierIdx = Constants.Prestige.findIndex((p) => p === TierSlug.LEAGUE_PRO);
  const tier = team.tier ?? 0;
  const identity = getNpcTransferTeamIdentity(team);

  let weight = 100;
  if (tier >= advancedTierIdx) weight += 35;
  if (tier >= proTierIdx) weight += 35;
  if (identity.type === 'national-core') weight += 75;
  if (identity.type === 'national-lock') weight += 65;

  const disabledTiers =
    Constants.LeagueTierDisabledByFederation[
      team.competitionFederation?.slug as Constants.FederationSlug
    ] ?? [];
  const missingMainPath = disabledTiers.filter(
    (tierSlug) => tierSlug === TierSlug.LEAGUE_INTERMEDIATE || tierSlug === TierSlug.LEAGUE_MAIN,
  ).length;
  if (tier >= advancedTierIdx) weight += missingMainPath * 25;

  return Math.max(1, Math.round(weight));
}

function sampleNPCBuyer<T extends { id: number } & Parameters<typeof getNPCBuyerActivityWeight>[0]>(
  buyers: T[],
) {
  if (!buyers.length) return undefined;

  const byId = new Map(buyers.map((team) => [String(team.id), team]));
  const pickedId = String(
    Chance.roll(
      Object.fromEntries(
        buyers.map((team) => [String(team.id), getNPCBuyerActivityWeight(team)]),
      ) as Record<string, number>,
    ),
  );

  return byId.get(pickedId) ?? sample(buyers);
}

function canReplaceStarterWithPlayer(params: {
  team: {
    countryId: number;
    players?: Array<{
      starter?: boolean | null;
      countryId?: number | null;
      country?: { continent?: { code?: string | null } | null } | null;
    }> | null;
    country?: { code?: string | null; continent?: { code?: string | null } | null } | null;
  };
  incoming: {
    xp?: number | null;
    age?: number | null;
    userControlled?: boolean;
    countryId?: number | null;
    country?: { continent?: { code?: string | null } | null } | null;
  };
  victim: {
    xp?: number | null;
    age?: number | null;
    userControlled?: boolean;
    countryId?: number | null;
    country?: { continent?: { code?: string | null } | null } | null;
  };
}) {
  const { team, incoming, victim } = params;
  const incomingXp = incoming.xp ?? 0;
  const victimXp = victim.xp ?? 0;

  if (!isNpcTransferCompatible(team, incoming)) {
    return false;
  }

  if (incomingXp > victimXp) return true;

  const incomingFit = getNpcTransferCompatibilityScore(team, incoming);
  const victimFit = getNpcTransferCompatibilityScore(team, victim);
  if (incomingFit > victimFit && incomingXp >= victimXp - getNationalReplacementXpTolerance(team)) {
    return true;
  }

  return incomingXp + getAgeReplacementBonus(incoming, victim) > victimXp;
}

function selectNPCFreeAgentCandidatesByCountryPreference<
  T extends {
    id: number;
    countryId?: number | null;
    country?: {
      continent?: { code?: string | null; federationId?: number | null } | null;
    } | null;
  },
>(
  team: {
    countryId: number;
    competitionFederationId?: number | null;
    country?: {
      code?: string | null;
      continent?: { code?: string | null; federationId?: number | null } | null;
    } | null;
  },
  candidates: T[],
) {
  if (!candidates.length) return candidates;

  const compatibleCandidates = filterNpcTransferCompatibleCandidates(team, candidates);
  if (!compatibleCandidates.length) return [];

  const identity = getNpcTransferTeamIdentity(team);
  const sameCountryCandidates = compatibleCandidates.filter((candidate) => {
    if (identity.type === 'cis-core') return candidate.countryId === identity.dominantCountryId;
    if (identity.type === 'national-core') return candidate.countryId === identity.countryId;
    return matchesTeamCountryPreference(team, candidate);
  });
  const crossCisCandidates =
    identity.type === 'cis-core'
      ? compatibleCandidates.filter(
          (candidate) =>
            candidate.countryId !== identity.dominantCountryId &&
            isNpcTransferCisCountry(candidate),
        )
      : [];
  const cohesion = getTeamNationalityCohesion(team as any);
  const sameCountryChance = Math.min(
    100,
    Math.round(Constants.TransferSettings.PBX_NPC_FREE_AGENT_SAME_COUNTRY + cohesion * 18),
  );
  if (sameCountryCandidates.length && Chance.rollD2(sameCountryChance)) {
    return sameCountryCandidates;
  }

  if (crossCisCandidates.length && Chance.rollD2(35)) {
    return crossCisCandidates;
  }

  const teamFederationId = team.competitionFederationId ?? null;
  const sameFederationCandidates =
    teamFederationId == null
      ? []
      : compatibleCandidates.filter((candidate) => {
          if (
            sameCountryCandidates.some(
              (sameCountryCandidate) => sameCountryCandidate.id === candidate.id,
            )
          ) {
            return false;
          }

          return candidate.country?.continent?.federationId === teamFederationId;
        });

  if (
    sameFederationCandidates.length &&
    Chance.rollD2(Constants.TransferSettings.PBX_NPC_FREE_AGENT_SAME_FED)
  ) {
    return sameFederationCandidates;
  }

  return sameCountryCandidates.length
    ? sameCountryCandidates
    : crossCisCandidates.length
      ? crossCisCandidates
      : sameFederationCandidates.length
        ? sameFederationCandidates
        : compatibleCandidates;
}

function selectNPCTargetCandidatesByCountryPreference<
  T extends {
    id: number;
    countryId?: number | null;
    country?: {
      continent?: { federationId?: number | null } | null;
    } | null;
  },
>(
  team: {
    countryId: number;
    competitionFederationId?: number | null;
    country?: {
      code?: string | null;
      continent?: { code?: string | null; federationId?: number | null } | null;
    } | null;
  },
  candidates: T[],
) {
  if (!candidates.length) return candidates;

  const compatibleCandidates = filterNpcTransferCompatibleCandidates(team, candidates);
  if (!compatibleCandidates.length) return [];

  const teamRegionCode = getTeamRegionCode(team);
  const teamFederationId = team.competitionFederationId ?? null;
  const isInternationalTeam = isInternationalTeamCountry(team);
  const identity = getNpcTransferTeamIdentity(team);

  const sameCountryCandidates = compatibleCandidates.filter((candidate) => {
    if (identity.type === 'cis-core') return candidate.countryId === identity.dominantCountryId;
    if (identity.type === 'national-core') return candidate.countryId === identity.countryId;
    return candidate.countryId === team.countryId;
  });
  const federationInternationalCandidates = isInternationalTeam
    ? compatibleCandidates.filter((candidate) => {
        if (
          sameCountryCandidates.some(
            (sameCountryCandidate) => sameCountryCandidate.id === candidate.id,
          )
        ) {
          return false;
        }

        if (teamFederationId == null) {
          return false;
        }

        return candidate.country?.continent?.federationId === teamFederationId;
      })
    : [];
  const otherCountryCandidates = compatibleCandidates.filter(
    (candidate) =>
      !sameCountryCandidates.some(
        (sameCountryCandidate) => sameCountryCandidate.id === candidate.id,
      ) &&
      !federationInternationalCandidates.some(
        (internationalCandidate) => internationalCandidate.id === candidate.id,
      ),
  );

  const weightedBuckets = {
    sameCountry: sameCountryCandidates,
    federationInternational: federationInternationalCandidates,
    otherCountry: otherCountryCandidates,
  } as const;

  const cohesion = getTeamNationalityCohesion(team as any);
  const sameCountryCutoff = isInternationalTeam ? 30 : Math.min(96, Math.round(70 + cohesion * 25));
  const internationalCutoff = isInternationalTeam
    ? 98
    : Math.min(99, sameCountryCutoff + Math.max(2, Math.round(20 - cohesion * 16)));
  const roll = random(1, 100);
  const pickedBucket =
    roll <= sameCountryCutoff
      ? 'sameCountry'
      : roll <= internationalCutoff
        ? 'federationInternational'
        : 'otherCountry';

  if (weightedBuckets[pickedBucket].length) {
    return weightedBuckets[pickedBucket];
  }

  if (pickedBucket === 'sameCountry') {
    return weightedBuckets.federationInternational;
  }

  if (pickedBucket === 'federationInternational') {
    return weightedBuckets.sameCountry;
  }

  if (weightedBuckets.sameCountry.length) {
    return weightedBuckets.sameCountry;
  }

  return weightedBuckets.federationInternational;
}

async function recalculateTeamCountryIdentity(teamId: number) {
  const team = await DatabaseClient.prisma.team.findFirst({
    where: { id: teamId },
    include: {
      country: {
        include: {
          continent: true,
        },
      },
      players: {
        where: { starter: true },
        include: {
          country: {
            include: {
              continent: true,
            },
          },
        },
      },
    },
  });

  if (!team || team.players.length < 3) {
    return Promise.resolve();
  }

  const currentPolicy = getNpcTransferRecruitmentPolicy(team as any);
  const inferredPolicy = inferNpcTransferRecruitmentPolicy(team as any);
  if (
    inferredPolicy.type === 'national-lock' &&
    (!currentPolicy ||
      currentPolicy.type !== 'national-lock' ||
      currentPolicy.countryId !== inferredPolicy.countryId)
  ) {
    await DatabaseClient.prisma.team.update({
      where: { id: team.id },
      data: { npcRecruitmentPolicy: serializeNpcTransferRecruitmentPolicy(inferredPolicy) },
    });
    team.npcRecruitmentPolicy = serializeNpcTransferRecruitmentPolicy(inferredPolicy);
  }

  const countryCounts = new Map<number, number>();
  const continentCounts = new Map<string, number>();

  for (const player of team.players) {
    countryCounts.set(player.countryId, (countryCounts.get(player.countryId) ?? 0) + 1);

    const continentCode = player.country?.continent?.code?.toUpperCase();
    if (continentCode) {
      continentCounts.set(continentCode, (continentCounts.get(continentCode) ?? 0) + 1);
    }
  }

  const dominantCountry = [...countryCounts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0] - b[0],
  )[0];

  let nextCountryId = dominantCountry?.[1] >= 3 ? dominantCountry[0] : null;

  if (!nextCountryId) {
    const dominantContinent = [...continentCounts.entries()]
      .filter(([code]) => MIXED_REGION_COUNTRY_CODES.has(code))
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];

    if (dominantContinent?.[1] >= 3) {
      const regionCountry = await DatabaseClient.prisma.country.findUnique({
        where: { code: dominantContinent[0].toLowerCase() },
        select: { id: true },
      });
      nextCountryId = regionCountry?.id ?? null;
    }
  }

  if (!nextCountryId) {
    const otherCountry = await DatabaseClient.prisma.country.findUnique({
      where: { code: OTHER_TEAM_COUNTRY_CODE },
      select: { id: true },
    });
    nextCountryId = otherCountry?.id ?? null;
  }

  if (!nextCountryId || nextCountryId === team.countryId) {
    return Promise.resolve();
  }

  await DatabaseClient.prisma.team.update({
    where: { id: team.id },
    data: { countryId: nextCountryId },
  });

  const nextCountry = await DatabaseClient.prisma.country.findUnique({
    where: { id: nextCountryId },
    select: { name: true, code: true },
  });

  Engine.Runtime.Instance.log.info(
    'Updated team country identity: %s -> %s (%s)',
    team.name,
    nextCountry?.name ?? nextCountryId,
    nextCountry?.code ?? 'unknown',
  );

  return Promise.resolve();
}

export async function recalculateAllTeamCountryIdentities() {
  // This is an integrity sweep for roster changes which were not handled by a
  // direct recalculation hook. Read every roster in one relation query and
  // update only identities that are actually stale; the former implementation
  // performed the same nested query once per team on every calendar day.
  const [teams, identityCountries, starters, countries] = await Promise.all([
    DatabaseClient.prisma.team.findMany({
      select: {
        id: true,
        name: true,
        countryId: true,
      },
    }),
    DatabaseClient.prisma.country.findMany({
      where: {
        code: {
          in: [...MIXED_REGION_COUNTRY_CODES, OTHER_TEAM_COUNTRY_CODE].map((code) =>
            code.toLowerCase(),
          ),
        },
      },
      select: { id: true, code: true, name: true },
    }),
    DatabaseClient.prisma.player.findMany({
      where: { starter: true, teamId: { not: null } },
      select: { teamId: true, countryId: true },
    }),
    DatabaseClient.prisma.country.findMany({
      select: { id: true, continent: { select: { code: true } } },
    }),
  ]);
  const continentByCountry = new Map(countries.map((country) => [country.id, country.continent.code]));
  const startersByTeam = new Map<number, typeof starters>();
  for (const player of starters) {
    const roster = startersByTeam.get(player.teamId!) ?? [];
    roster.push(player);
    startersByTeam.set(player.teamId!, roster);
  }
  const identityCountryByCode = new Map(
    identityCountries.map((country) => [country.code.toUpperCase(), country]),
  );
  const updates: Array<{ id: number; name: string; nextCountryId: number }> = [];

  for (const team of teams) {
    const players = startersByTeam.get(team.id) ?? [];
    if (players.length < 3) continue;

    const countryCounts = new Map<number, number>();
    const continentCounts = new Map<string, number>();
    for (const player of players) {
      countryCounts.set(player.countryId, (countryCounts.get(player.countryId) ?? 0) + 1);
      const continentCode = continentByCountry.get(player.countryId)?.toUpperCase();
      if (continentCode) {
        continentCounts.set(continentCode, (continentCounts.get(continentCode) ?? 0) + 1);
      }
    }

    const dominantCountry = [...countryCounts.entries()].sort(
      (a, b) => b[1] - a[1] || a[0] - b[0],
    )[0];
    let nextCountryId = dominantCountry?.[1] >= 3 ? dominantCountry[0] : null;

    if (!nextCountryId) {
      const dominantContinent = [...continentCounts.entries()]
        .filter(([code]) => MIXED_REGION_COUNTRY_CODES.has(code))
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
      nextCountryId = dominantContinent
        ? (identityCountryByCode.get(dominantContinent[0])?.id ?? null)
        : null;
    }

    if (!nextCountryId) {
      nextCountryId = identityCountryByCode.get(OTHER_TEAM_COUNTRY_CODE.toUpperCase())?.id ?? null;
    }

    if (nextCountryId && nextCountryId !== team.countryId) {
      updates.push({ id: team.id, name: team.name, nextCountryId });
    }
  }

  if (!updates.length) return Promise.resolve();

  await DatabaseClient.prisma.$transaction(
    updates.map((team) =>
      DatabaseClient.prisma.team.update({
        where: { id: team.id },
        data: { countryId: team.nextCountryId },
      }),
    ),
  );

  updates.forEach((team) => {
    const country = identityCountries.find((item) => item.id === team.nextCountryId);
    Engine.Runtime.Instance.log.info(
      'Updated team country identity: %s -> %s (%s)',
      team.name,
      country?.name ?? team.nextCountryId,
      country?.code ?? 'unknown',
    );
  });

  return Promise.resolve();
}

function expandWeightedUserOfferPool<T>(entries: Array<{ team: T; score: number }>) {
  if (!entries.length) return [];

  const minScore = Math.min(...entries.map((entry) => entry.score));
  return entries.flatMap((entry) => {
    const normalizedScore = Math.max(1, Math.round(entry.score - minScore + 1));
    const copies = Math.max(1, Math.min(20, Math.ceil(normalizedScore / 12)));
    return Array.from({ length: copies }, () => entry.team);
  });
}

function selectCountryAwareOfferPool<
  T extends {
    id: number;
    countryId: number;
    competitionFederationId?: number | null;
    country?: {
      code?: string | null;
      continent?: { code?: string | null; federationId?: number | null } | null;
    } | null;
    players?: Array<{
      starter?: boolean | null;
      countryId?: number | null;
      country?: {
        continent?: { code?: string | null; federationId?: number | null } | null;
      } | null;
    }> | null;
  },
>(
  teams: T[],
  playerCountryId: number | null | undefined,
  playerCountryCode: string | null | undefined,
  playerCountryContinentCode: string | null | undefined,
  playerFederationId: number | null | undefined,
  lastOfferTeamId: number | null,
) {
  const repeatSafeTeams = filterRepeatedOfferTeam(teams, lastOfferTeamId);

  if (!playerCountryId) return repeatSafeTeams;

  const playerCandidate = {
    countryId: playerCountryId,
    country: {
      code: playerCountryCode ?? null,
      continent: {
        code: playerCountryContinentCode ?? null,
        federationId: playerFederationId ?? null,
      },
    },
  };
  const compatibleTeams = repeatSafeTeams.filter((team) =>
    isNpcTransferCompatible(team, playerCandidate),
  );
  if (!compatibleTeams.length) return [];

  const scoredTeams = compatibleTeams
    .map((team) => ({
      team,
      bucket: getUserOfferFitBucket(team, playerCandidate),
      score: getUserOfferFitScore(team, playerCandidate),
    }))
    .filter((entry) => Number.isFinite(entry.score));

  const weightedBuckets: Record<UserOfferFitBucket, { teams: typeof scoredTeams; weight: number }> =
    {
      national: {
        teams: scoredTeams.filter((entry) => entry.bucket === 'national'),
        weight: USER_OFFER_FIT_BUCKET_WEIGHTS.national,
      },
      regional: {
        teams: scoredTeams.filter((entry) => entry.bucket === 'regional'),
        weight: USER_OFFER_FIT_BUCKET_WEIGHTS.regional,
      },
      other: {
        teams: scoredTeams.filter((entry) => entry.bucket === 'other'),
        weight: USER_OFFER_FIT_BUCKET_WEIGHTS.other,
      },
    };

  const availableBuckets = Object.entries(weightedBuckets).filter(
    ([, bucket]) => bucket.teams.length,
  );

  if (!availableBuckets.length) {
    return compatibleTeams.sort(
      (a, b) =>
        getNpcTransferCompatibilityScore(b, playerCandidate) -
        getNpcTransferCompatibilityScore(a, playerCandidate),
    );
  }

  const pickedBucket = String(
    Chance.roll(
      Object.fromEntries(
        availableBuckets.map(([bucketName, bucket]) => [bucketName, bucket.weight]),
      ) as Record<string, number>,
    ),
  ) as UserOfferFitBucket;

  if (weightedBuckets[pickedBucket]?.teams.length) {
    return expandWeightedUserOfferPool(weightedBuckets[pickedBucket].teams);
  }

  return expandWeightedUserOfferPool(availableBuckets[0]?.[1].teams ?? scoredTeams);
}

/**
 * Creates a team invite (transfer) targeting the user player when they are teamless.
 *
 * This is used by Player Career after FACEIT PUGs.
 */
export async function sendPlayerInviteForUser() {
  const profile = await DatabaseClient.prisma.profile.findFirst(Eagers.profile);

  // Only if we have a profile and the user is teamless.
  if (!profile || profile.teamId != null || !profile.player) {
    return Promise.resolve();
  }

  const prisma = DatabaseClient.prisma;

  const teams = await prisma.team.findMany({
    include: {
      personas: true,
      country: {
        include: {
          continent: true,
        },
      },
      players: {
        include: {
          country: {
            include: {
              continent: true,
            },
          },
        },
      },
    },
  });

  if (!teams.length) return Promise.resolve();

  const playerCountryContext = profile.player.countryId
    ? await prisma.country.findFirst({
        where: { id: profile.player.countryId },
        include: { continent: true },
      })
    : null;

  const lastOfferTeamId = await getLastOfferTeamId(profile.playerId!);
  const offerPool = selectCountryAwareOfferPool(
    teams,
    profile.player.countryId,
    playerCountryContext?.code ?? null,
    playerCountryContext?.continent?.code ?? null,
    playerCountryContext?.continent?.federationId ?? null,
    lastOfferTeamId,
  );

  const from = sample(offerPool);
  const target = profile.player;

  // Basic wages/cost – for now we just reuse whatever the player currently has.
  const wages = target.wages ?? 0;
  const cost = target.cost ?? 0;

  const transfer = await prisma.transfer.create({
    data: {
      status: Constants.TransferStatus.PLAYER_PENDING,
      from: { connect: { id: from.id } },
      target: { connect: { id: target.id } },
      offers: {
        create: [
          {
            status: Constants.TransferStatus.PLAYER_PENDING,
            wages,
            cost,
          },
        ],
      },
    },
    include: Eagers.transfer.include,
  });

  const locale = getLocale(profile);

  const persona =
    from.personas.find(
      (p) => p.role === Constants.PersonaRole.MANAGER || p.role === Constants.PersonaRole.ASSISTANT,
    ) ?? from.personas[0];

  await sendEmail(
    // SUBJECT with template
    Sqrl.render(locale.templates.OfferIncoming.SUBJECT, { transfer, profile }),
    // CONTENT with buttons, also template
    Sqrl.render(locale.templates.OfferIncoming.CONTENT, { transfer, profile }),
    persona,
    profile.date,
    true,
  );

  WindowManager.sendAll(Constants.IPCRoute.TRANSFER_UPDATE);

  Engine.Runtime.Instance.log.info('%s sent a player-career invite to %s', from.name, target.name);

  return Promise.resolve(transfer);
}

// Blend helper (80% recent, 20% lifetime)
function blendFaceitMetric(recent: number, lifetime: number) {
  return recent * 0.8 + lifetime * 0.2;
}

type ContractYearWeight = { years: number; weight: number };
const ContractYearsWeights = UserOfferSettings.CONTRACT_YEARS_WEIGHTS as Partial<
  Record<TierSlug, ContractYearWeight[]>
>;

function rollContractYears(tier: TierSlug): number {
  const options: ContractYearWeight[] = ContractYearsWeights[tier] ?? [{ years: 1, weight: 100 }];

  const pbx: Record<string, number> = {};
  options.forEach((o: ContractYearWeight, idx: number) => {
    pbx[String(idx)] = o.weight;
  });
  const pickedIdx = Number(Chance.roll(pbx));
  return options[pickedIdx]?.years ?? 1;
}

type FaceitRegionalFederationSlug =
  | Constants.FederationSlug.ESPORTS_EUROPA
  | Constants.FederationSlug.ESPORTS_AMERICAS
  | Constants.FederationSlug.ESPORTS_ASIA
  | Constants.FederationSlug.ESPORTS_OCE;

function isFaceitRegionalFederationSlug(
  slug: Constants.FederationSlug,
): slug is FaceitRegionalFederationSlug {
  return (
    slug === Constants.FederationSlug.ESPORTS_EUROPA ||
    slug === Constants.FederationSlug.ESPORTS_AMERICAS ||
    slug === Constants.FederationSlug.ESPORTS_ASIA ||
    slug === Constants.FederationSlug.ESPORTS_OCE
  );
}

type FaceitRecruitmentRosterPlayer = {
  id: number;
  starter?: boolean | null;
  role?: string | null;
  xp?: number | null;
};

type OfficialRecruitmentRating = { maps: number; rating: number };

function getFaceitRecruitmentRoleCandidates(
  team: { players?: FaceitRecruitmentRosterPlayer[] | null },
  userRole: UserRole,
) {
  const starters = (team.players ?? []).filter((player) => player.starter !== false);
  const normalizedUserRole = normalizeRole(userRole);
  const roleCandidates = starters.filter((player) => {
    const role = normalizeRole(player.role);
    if (normalizedUserRole === 'SNIPER') return role === 'SNIPER';
    if (normalizedUserRole === 'IGL') return role === 'IGL' || role === 'RIFLER';
    return role === 'RIFLER' || role === 'IGL';
  });
  return roleCandidates.length ? roleCandidates : starters;
}

async function getRecentOfficialRecruitmentRatings(playerIds: number[]) {
  if (!playerIds.length) return new Map<number, OfficialRecruitmentRating>();

  const rows = await DatabaseClient.prisma.$queryRaw<
    Array<{ playerId: number; kills: number; deaths: number; assists: number }>
  >(Prisma.sql`
    SELECT "RecentStats"."playerId", "RecentStats"."kills", "RecentStats"."deaths", "RecentStats"."assists"
    FROM (
      SELECT
        "MatchPlayerGameStat"."playerId",
        "MatchPlayerGameStat"."kills",
        "MatchPlayerGameStat"."deaths",
        "MatchPlayerGameStat"."assists",
        ROW_NUMBER() OVER (
          PARTITION BY "MatchPlayerGameStat"."playerId"
          ORDER BY "Match"."date" DESC, "MatchPlayerGameStat"."matchId" DESC, "MatchPlayerGameStat"."gameKey" DESC
        ) AS "rowNumber"
      FROM "MatchPlayerGameStat"
      INNER JOIN "Match" ON "Match"."id" = "MatchPlayerGameStat"."matchId"
      WHERE "MatchPlayerGameStat"."playerId" IN (${Prisma.join(playerIds)})
        AND "Match"."status" = ${Constants.MatchStatus.COMPLETED}
        AND "Match"."competitionId" IS NOT NULL
        AND ("Match"."matchType" IS NULL OR "Match"."matchType" <> 'FACEIT_PUG')
    ) AS "RecentStats"
    WHERE "RecentStats"."rowNumber" <= 20
  `);

  const totals = new Map<number, { maps: number; ratingSum: number }>();
  for (const row of rows) {
    const playerId = Number(row.playerId);
    const rating = Util.getPlayerRating(
      Number(row.kills),
      Number(row.deaths),
      Number(row.assists),
    );
    if (!Number.isFinite(rating)) continue;
    const current = totals.get(playerId) ?? { maps: 0, ratingSum: 0 };
    current.maps += 1;
    current.ratingSum += rating;
    totals.set(playerId, current);
  }

  return new Map(
    Array.from(totals.entries()).map(([playerId, total]) => [
      playerId,
      { maps: total.maps, rating: total.ratingSum / total.maps },
    ]),
  );
}

function isFaceitRecruitmentRosterFit(
  team: { players?: FaceitRecruitmentRosterPlayer[] | null },
  userRole: UserRole,
  plan: FaceitRecruitmentPlan,
  officialRatings: Map<number, OfficialRecruitmentRating>,
) {
  const candidates = getFaceitRecruitmentRoleCandidates(team, userRole);
  return isFaceitRecruitmentSpotFit(
    plan,
    candidates.map((player) => {
      const official = officialRatings.get(player.id);
      return {
        xp: Number(player.xp ?? 0),
        officialMaps: official?.maps ?? 0,
        officialRating: official?.rating ?? null,
      };
    }),
  );
}

function getFaceitRecruitmentTeamNeed(
  team: { players?: FaceitRecruitmentRosterPlayer[] | null },
  userRole: UserRole,
  officialRatings: Map<number, OfficialRecruitmentRating>,
) {
  const candidates = getFaceitRecruitmentRoleCandidates(team, userRole);
  const sampledRatings = candidates
    .map((player) => officialRatings.get(player.id))
    .filter((sample): sample is OfficialRecruitmentRating => sample != null && sample.maps >= 5)
    .map((sample) => sample.rating);
  if (sampledRatings.length) return Math.min(...sampledRatings);

  const xpValues = candidates.map((player) => Number(player.xp ?? 0));
  return 2 + Math.min(...(xpValues.length ? xpValues : [999])) / 100;
}

export async function sendUserFaceitOffer() {
  const prisma = DatabaseClient.prisma;

  const [profile] = await prisma.profile.findMany({
    take: 1,
    include: {
      player: {
        include: {
          country: {
            include: {
              continent: {
                include: { federation: true },
              },
            },
          },
        },
      },
    },
  });

  if (!profile || !profile.player) return Promise.resolve();
  if (profile.teamId != null) return Promise.resolve();

  const role = resolveUserRole(profile, profile.player);
  const tuning = getRoleOfferTuning(role);

  // Pending offers cap
  const pendingCount = await prisma.transfer.count({
    where: {
      playerId: profile.playerId,
      status: Constants.TransferStatus.PLAYER_PENDING,
    },
  });

  if (pendingCount >= UserOfferSettings.TEAMLESS_MAX_PENDING_OFFERS) {
    return Promise.resolve();
  }

  const last = profile.player.lastOfferAt;
  const cooldownDays = Math.max(
    1,
    Math.round(UserOfferSettings.TEAMLESS_OFFER_COOLDOWN_DAYS * tuning.cooldownMultTeamless),
  );

  if (last) {
    if (differenceInDays(profile.date, last) < cooldownDays) {
      return Promise.resolve();
    }
  }

  const lifetime = await computeLifetimeStats(profile.id, profile.playerId);
  const recent20 = await computeLifetimeStats(profile.id, profile.playerId, 20);

  const lifetimeMatches = lifetime.matchesPlayed ?? 0;
  const recentMatches = recent20.matchesPlayed ?? 0;
  const matchCount = Math.max(lifetimeMatches, recentMatches);

  const userFederationSlug = profile.player.country?.continent?.federation?.slug as
    | Constants.FederationSlug
    | undefined;

  if (!userFederationSlug || !isFaceitRegionalFederationSlug(userFederationSlug)) {
    return Promise.resolve();
  }

  const lifetimeKd = lifetime.kdRatio ?? 1;
  const recentKd = recent20.kdRatio ?? 1;
  const kd = blendFaceitMetric(recentKd, lifetimeKd);

  const lifetimeWinratePct = lifetime.winRate ?? 50;
  const recentWinratePct = recent20.winRate ?? 50;
  const winratePct = blendFaceitMetric(recentWinratePct, lifetimeWinratePct);

  const elo = profile.faceitElo ?? 0;
  const recruitmentPlan = getFaceitRecruitmentPlan({
    federation: userFederationSlug,
    matchCount,
    elo,
    xp: profile.player.xp ?? 0,
    kd,
    winRatePct: winratePct,
  });
  if (!recruitmentPlan?.eligible) return Promise.resolve();

  // Role scarcity is handled by actual roster fit below instead of applying a
  // blanket penalty to all IGL/AWPer prospects.
  const pbx = recruitmentPlan.offerChance;
  if (!recruitmentPlan.guaranteed && !Chance.rollD2(pbx)) return Promise.resolve();

  // Federation restriction (own federation)
  const userFedId = profile.player.country?.continent?.federationId ?? null;
  const eligibleTierEntries = Object.entries(recruitmentPlan.tierWeights)
    .map(([tier, weight]) => ({
      tier: tier as TierSlug,
      weight: Number(weight ?? 0),
      index: Constants.Prestige.findIndex((item) => item === tier),
    }))
    .filter((entry) => entry.weight > 0 && entry.index >= 0);
  const eligibleTierIndexes = eligibleTierEntries.map((entry) => entry.index);
  if (!eligibleTierIndexes.length) return Promise.resolve();

  const teams = await prisma.team.findMany({
    where: {
      tier: { in: eligibleTierIndexes },
      profile: null,
      ...(userFedId
        ? {
            competitionFederationId: userFedId,
          }
        : {}),
    },
    include: {
      personas: true,
      country: {
        include: {
          continent: true,
        },
      },
      players: {
        include: {
          country: {
            include: {
              continent: true,
            },
          },
        },
      },
    },
  });

  if (!teams.length) return Promise.resolve();

  const officialRatings = await getRecentOfficialRecruitmentRatings(
    teams.flatMap((team) => team.players.map((player) => player.id)),
  );
  const rosterFitTeams = teams.filter((team) =>
    isFaceitRecruitmentRosterFit(team, role, recruitmentPlan, officialRatings),
  );
  // At the regional ceiling, a credible prospect gets a final route into the
  // weakest suitable part of the market even if they narrowly miss every
  // ordinary starter comparison. Nationality/roster-identity rules still apply.
  const recruitmentTeams = rosterFitTeams.length
    ? rosterFitTeams
    : recruitmentPlan.guaranteed
      ? [...teams]
          .sort((a, b) => {
            return (
              getFaceitRecruitmentTeamNeed(a, role, officialRatings) -
              getFaceitRecruitmentTeamNeed(b, role, officialRatings)
            );
          })
          .slice(0, Math.max(3, Math.ceil(teams.length * 0.2)))
      : [];
  if (!recruitmentTeams.length) return Promise.resolve();

  const lastOfferTeamId = await getLastOfferTeamId(profile.playerId!);
  const poolsByTier = new Map<TierSlug, typeof recruitmentTeams>();
  for (const entry of eligibleTierEntries) {
    const tierTeams = recruitmentTeams.filter((team) => team.tier === entry.index);
    const tierPool = selectCountryAwareOfferPool(
      tierTeams,
      profile.player.countryId,
      profile.player.country?.code ?? null,
      profile.player.country?.continent?.code ?? null,
      userFedId,
      lastOfferTeamId,
    );
    if (tierPool.length) poolsByTier.set(entry.tier, tierPool);
  }

  const availableTierEntries = eligibleTierEntries.filter((entry) =>
    poolsByTier.has(entry.tier),
  );
  if (!availableTierEntries.length) return Promise.resolve();

  const targetTier = String(
    Chance.roll(
      Object.fromEntries(
        availableTierEntries.map((entry) => [entry.tier, entry.weight]),
      ) as Record<string, number>,
    ),
  ) as TierSlug;
  let pool = poolsByTier.get(targetTier) ?? [];

  if (recruitmentPlan.band === 'absurd') {
    const sorted = [...pool].sort((a, b) => (b.elo ?? 0) - (a.elo ?? 0));
    const topCount = Math.max(3, Math.floor(sorted.length * 0.2)); // top 20%, min 3
    pool = sorted.slice(0, topCount);
  }

  const from = sample(pool);
  if (!from) return Promise.resolve();

  const contractYears = rollContractYears(targetTier);

  // Create transfer + offer
  const target = profile.player;
  const wages = target.wages ?? 0;
  const cost = target.cost ?? 0;
  const offerExpiresAt = addDays(profile.date, 7);

  const transfer = await prisma.transfer.create({
    data: {
      status: Constants.TransferStatus.PLAYER_PENDING,
      from: { connect: { id: from.id } },
      target: { connect: { id: target.id } },
      offers: {
        create: [
          {
            status: Constants.TransferStatus.PLAYER_PENDING,
            wages,
            cost,
            contractYears,
            expiresAt: offerExpiresAt,
          },
        ],
      },
    },
    include: Eagers.transfer.include,
  });

  await prisma.calendar.create({
    data: {
      type: Constants.CalendarEntry.TRANSFER_OFFER_EXPIRY_CHECK,
      date: offerExpiresAt.toISOString(),
      payload: String(transfer.id),
    },
  });

  await prisma.player.update({
    where: { id: profile.playerId! },
    data: { lastOfferAt: profile.date },
  });

  const locale = getLocale(profile);

  const persona =
    from.personas.find(
      (p) => p.role === Constants.PersonaRole.MANAGER || p.role === Constants.PersonaRole.ASSISTANT,
    ) ?? from.personas[0];
  const fromTierName = getTeamTierName(transfer.from?.tier);

  await sendEmail(
    Sqrl.render(locale.templates.OfferIncoming.SUBJECT, { transfer, profile }),
    Sqrl.render(locale.templates.OfferIncoming.CONTENT, { transfer, profile, fromTierName }),
    persona,
    profile.date,
    true,
  );

  WindowManager.sendAll(Constants.IPCRoute.TRANSFER_UPDATE);

  await scheduleOfferPauseAndExpiry(transfer.id, offerExpiresAt);
  Engine.Runtime.Instance.stop();

  Engine.Runtime.Instance.log.info(
    '%s sent FACEIT-based offer to %s (tier=%s, years=%d, pbx=%d, band=%s, projectedXp=%d, guaranteed=%s)',
    from.name,
    target.name,
    targetTier,
    contractYears,
    pbx,
    recruitmentPlan.band,
    recruitmentPlan.projectedXp,
    recruitmentPlan.guaranteed ? 'true' : 'false',
  );

  return Promise.resolve(transfer);
}

function getTierContractYears(tierIdx: number | null | undefined) {
  const tierSlug = getTeamTierSlug(tierIdx);
  if (!tierSlug) return 1;
  return rollContractYears(tierSlug);
}

function countStarterSnipers(players: Array<{ starter?: boolean; role?: string | null }>) {
  return players.filter((p) => p.starter && isSniperRole(p.role)).length;
}
function ensureTeamFloorAndSniper(params: {
  players: Array<{ role?: string | null; starter?: boolean | null }>;
  minPlayers?: number;
}) {
  const { players, minPlayers = Constants.Application.SQUAD_MIN_LENGTH } = params;
  const starters = players.filter((player) => player.starter === true);
  return starters.length >= minPlayers && countStarterSnipers(starters as any) === 1;
}

type NpcRosterRepairOptions = {
  preferredRole?: string | null;
  blockedPlayerIds?: Set<number>;
  excludedPlayerId?: number | null;
  maxMoves?: number;
  market?: NpcRosterMarket;
};

/**
 * A single repair pass shares this market snapshot between teams. Ownership
 * is still reserved conditionally in moveNpcPlayerInTransaction, so stale
 * entries are harmless and a failed claim simply advances to the next one.
 * Donor starters are loaded lazily only if free agents and benches cannot
 * satisfy a vacancy.
 */
type NpcRosterMarket = {
  freeAgents: any[];
  benched: any[];
  donorTeams?: any[];
};

function sortNpcRosterCandidates<T extends { id: number; xp?: number | null; role?: string | null }>(
  team: NpcTransferTeam,
  candidates: T[],
  desiredRole?: string | null,
) {
  const normalizedDesiredRole = desiredRole ? normalizeRole(desiredRole) : '';
  return [...candidates]
    .filter((candidate) =>
      normalizedDesiredRole ? normalizeRole(candidate.role) === normalizedDesiredRole : true,
    )
    .filter((candidate) => isNpcTransferCompatible(team, candidate as any))
    .map((player) => ({
      player,
      score: (player.xp ?? 0) + getNpcTransferCompatibilityScore(team, player as any),
    }))
    .sort((a, b) =>
      b.score - a.score ||
      (b.player.xp ?? 0) - (a.player.xp ?? 0) ||
      a.player.id - b.player.id,
    )
    .map(({ player }) => player);
}

async function loadNpcRosterTeam(teamId: number) {
  return DatabaseClient.prisma.team.findFirst({
    where: { id: teamId },
    include: NPC_TRANSFER_TEAM_INCLUDE,
  });
}

async function loadNpcRosterMarket(): Promise<NpcRosterMarket> {
  const [freeAgents, benched] = await Promise.all([
    DatabaseClient.prisma.player.findMany({
      where: {
        teamId: null,
        userControlled: false,
        retiredAt: null,
        ...NPC_TEAMLESS_CANDIDATE_ELIGIBILITY,
      },
      include: { country: { include: { continent: true } } },
      orderBy: { id: 'asc' },
    }),
    DatabaseClient.prisma.player.findMany({
      where: {
        teamId: { not: null },
        starter: false,
        userControlled: false,
        retiredAt: null,
        team: { profile: null },
      },
      include: { country: { include: { continent: true } } },
      orderBy: { id: 'asc' },
    }),
  ]);
  return { freeAgents, benched };
}

async function loadNpcRosterDonorTeams() {
  return DatabaseClient.prisma.team.findMany({
    where: {
      profile: null,
      players: { some: { starter: true, userControlled: false } },
    },
    select: {
      id: true,
      tier: true,
      players: {
        where: { starter: true, userControlled: false, retiredAt: null },
        include: { country: { include: { continent: true } } },
      },
    },
    orderBy: { id: 'asc' },
  });
}

/**
 * Move one NPC in a single database transaction. The conditional update is a
 * lightweight ownership reservation, so stale candidate snapshots cannot move
 * a player twice or move a player after another path has claimed them.
 */
async function moveNpcPlayerInTransaction(
  tx: any,
  params: {
    playerId: number;
    expectedTeamId: number | null;
    targetTeam: NpcTransferTeam;
    date: Date;
    victimId?: number | null;
    createTransfer?: boolean;
    contractEnd?: Date;
    wages?: number | null;
    expectedRole?: string | null;
    allowPlannedDonorShortage?: boolean;
  },
) {
  const {
    playerId,
    expectedTeamId,
    targetTeam,
    date,
    victimId = null,
    createTransfer = true,
    contractEnd: requestedContractEnd,
    wages: requestedWages,
    expectedRole,
    allowPlannedDonorShortage = false,
  } = params;
  const candidate = await tx.player.findFirst({
    where: {
      id: playerId,
      teamId: expectedTeamId,
      userControlled: false,
      retiredAt: null,
    },
    select: {
      id: true,
      teamId: true,
      starter: true,
      role: true,
      wages: true,
      cost: true,
      countryId: true,
      country: { include: { continent: true } },
    },
  });
  if (!candidate) return false;

  const liveTargetTeam = await tx.team.findFirst({
    where: { id: targetTeam.id },
    include: NPC_TRANSFER_TEAM_INCLUDE,
  });
  if (!liveTargetTeam) return false;

  const normalizedExpectedRole = expectedRole ? normalizeRole(expectedRole) : null;
  if (normalizedExpectedRole && normalizeRole(candidate.role) !== normalizedExpectedRole) {
    throw new Error('NPC candidate role changed before move');
  }
  if (!isNpcTransferCompatible(liveTargetTeam, candidate as any)) {
    throw new Error('NPC candidate is no longer compatible with target policy');
  }

  const isOwnPromotion = expectedTeamId === liveTargetTeam.id;
  const targetStarters = (liveTargetTeam.players || []).filter((player: any) => player.starter);
  const targetSnipers = countStarterSnipers(targetStarters as any);
  const isIncomingSniper = isSniperRole(candidate.role);

  // A starter donor may be used only when the live donor remains healthy. The
  // pre-pass market snapshot is advisory; this check closes the race window
  // before ownership changes are committed.
  if (
    expectedTeamId != null &&
    !isOwnPromotion &&
    candidate.starter &&
    !allowPlannedDonorShortage
  ) {
    const donor = await tx.team.findFirst({
      where: { id: expectedTeamId },
      select: {
        id: true,
        players: {
          where: { starter: true, retiredAt: null },
          select: { id: true, role: true, starter: true, userControlled: true },
        },
      },
    });
    if (!donor) return false;
    const donorAfterSale = donor.players.filter((player: any) => player.id !== candidate.id);
    if (
      donorAfterSale.length < Constants.Application.SQUAD_MIN_LENGTH ||
      countStarterSnipers(donorAfterSale as any) !== 1
    ) {
      throw new Error('NPC donor would become unhealthy after move');
    }
  }

  if (
    targetStarters.length + 1 - (victimId != null ? 1 : 0) >
    Constants.Application.SQUAD_MIN_LENGTH
  ) {
    throw new Error('NPC target would exceed the starting roster limit');
  }
  if (victimId == null && targetSnipers + (isIncomingSniper ? 1 : 0) > 1) {
    throw new Error('NPC target already has too many starting AWPers');
  }

  const years = getTierContractYears(liveTargetTeam.tier);
  const contractEnd = requestedContractEnd ?? addYears(date, years);
  // Transfer.from is the buyer and Transfer.to is the seller in this codebase.
  const fromTeamId = targetTeam.id;
  const toTeamId = expectedTeamId ?? liveTargetTeam.id;

  if (victimId != null) {
    const victim = await tx.player.findFirst({
      where: {
        id: victimId,
        teamId: liveTargetTeam.id,
        starter: true,
      },
      select: { id: true, role: true, userControlled: true },
    });
    if (!victim) throw new Error('NPC bench victim changed before move');
    const victimIsSniper = isSniperRole(victim.role);
    if (
      isIncomingSniper
        ? targetSnipers > 0
          ? !victimIsSniper
          : victimIsSniper
        : normalizeRole(victim.role) !== normalizeRole(candidate.role)
    ) {
      throw new Error('NPC bench victim role changed before move');
    }
    // A sniper replaces an existing sniper during a normal upgrade, but
    // replaces a rifler when repairing a team whose AWP slot is vacant.
    const resultingStarters = targetStarters.length;
    const resultingSnipers =
      targetSnipers - (victimIsSniper ? 1 : 0) + (isIncomingSniper ? 1 : 0);
    if (
      resultingSnipers > 1 ||
      (resultingStarters >= Constants.Application.SQUAD_MIN_LENGTH && resultingSnipers !== 1)
    ) {
      throw new Error('NPC target would violate its starting AWP invariant');
    }
    await tx.player.update({
      where: { id: victim.id },
      data: { starter: false, transferListed: true, lastOfferAt: date },
    });
    const victimStints = await tx.careerStint.findMany({
      where: { playerId: victim.id, endedAt: null },
      select: { id: true },
    });
    for (const stint of victimStints) {
      await tx.careerStint.update({ where: { id: stint.id }, data: { endedAt: date } });
    }
    await tx.careerStint.create({
      data: {
        playerId: victim.id,
        teamId: liveTargetTeam.id,
        tier: liveTargetTeam.tier ?? null,
        starter: false,
        startedAt: date,
      },
    });
  }

  const claimed = await tx.player.updateMany({
    where: {
      id: playerId,
      teamId: expectedTeamId,
      userControlled: false,
      retiredAt: null,
    },
    data: {
      // `toTeamId` is the seller used for Transfer.to. Ownership always
      // moves to the destination team represented by targetTeam.
      teamId: liveTargetTeam.id,
      starter: true,
      transferListed: false,
      ...(isOwnPromotion ? {} : { contractEnd }),
      lastOfferAt: null,
      ...(requestedWages !== undefined ? { wages: requestedWages } : {}),
      role: normalizeRole(candidate.role) || candidate.role,
    },
  });
  if (claimed.count !== 1) throw new Error('NPC player ownership changed before move');

  const openStints = await tx.careerStint.findMany({
    where: { playerId, endedAt: null },
    select: { id: true },
  });
  for (const stint of openStints) {
    await tx.careerStint.update({ where: { id: stint.id }, data: { endedAt: date } });
  }
  await tx.careerStint.create({
    data: {
      playerId,
      teamId: liveTargetTeam.id,
      tier: liveTargetTeam.tier ?? null,
      starter: true,
      startedAt: date,
    },
  });

  if (!isOwnPromotion && createTransfer) {
    await tx.transfer.create({
      data: {
        status: Constants.TransferStatus.TEAM_ACCEPTED,
        from: { connect: { id: fromTeamId } },
        to: { connect: { id: toTeamId } },
        target: { connect: { id: playerId } },
        offers: {
          create: [
            {
              status: Constants.TransferStatus.TEAM_ACCEPTED,
              cost: expectedTeamId == null ? 0 : candidate.cost || 0,
              wages: candidate.wages || 0,
              contractYears: years,
            },
          ],
        },
      },
    });
  }

  return true;
}

async function moveNpcPlayerAtomic(params: {
  playerId: number;
  expectedTeamId: number | null;
  targetTeam: NpcTransferTeam;
  date: Date;
  victimId?: number | null;
  createTransfer?: boolean;
  contractEnd?: Date;
  wages?: number | null;
  expectedRole?: string | null;
  allowPlannedDonorShortage?: boolean;
}) {
  const prisma = DatabaseClient.prisma;
  try {
    return await prisma.$transaction((tx) => moveNpcPlayerInTransaction(tx, params));
  } catch (error) {
    Engine.Runtime.Instance.log.debug(
      'NPC roster move skipped for player %d: %s',
      params.playerId,
      (error as Error).message,
    );
    return false;
  }
}

async function findNpcRosterCandidate(params: {
  team: NpcTransferTeam;
  desiredRole?: string | null;
  blockedPlayerIds: Set<number>;
  excludedPlayerIds?: Set<number>;
  market?: NpcRosterMarket;
}) {
  const {
    team,
    desiredRole,
    blockedPlayerIds,
    excludedPlayerIds = new Set<number>(),
    market,
  } = params;
  const matchesRole = (player: { role?: string | null }) =>
    !desiredRole || normalizeRole(player.role) === normalizeRole(desiredRole);
  const compatible = (player: { id: number; role?: string | null }) =>
    !blockedPlayerIds.has(player.id) &&
    !excludedPlayerIds.has(player.id) &&
    matchesRole(player) &&
    isNpcTransferCompatible(team, player as any);

  const ownBench = sortNpcRosterCandidates(
    team,
    (team.players || []).filter(
      (player) =>
        !player.starter && !player.userControlled && compatible(player),
    ),
    desiredRole,
  )[0];
  if (ownBench) return { player: ownBench, fromTeamId: team.id };

  // Do not apply a SQL LIMIT before nationality/role filtering. On mature
  // saves the valid player can be well beyond the first few hundred rows.
  const loadedMarket = market ?? (await loadNpcRosterMarket());
  const freeAgents = loadedMarket.freeAgents;
  const freeAgent = sortNpcRosterCandidates(
    team,
    freeAgents.filter((player) => compatible(player)),
    desiredRole,
  )[0];
  if (freeAgent) return { player: freeAgent, fromTeamId: null };

  const benched = loadedMarket.benched.filter((player) => player.teamId !== team.id);
  const benchedCandidate = sortNpcRosterCandidates(
    team,
    benched.filter((player) => compatible(player)),
    desiredRole,
  )[0];
  if (benchedCandidate) return { player: benchedCandidate, fromTeamId: benchedCandidate.teamId };

  // A starter may move only when the donor remains healthy after the move.
  // This bounded one-hop fallback avoids cascading shortages between teams;
  // subsequent ticks can repair the donor independently if needed.
  let donorTeams = market?.donorTeams;
  if (!donorTeams) {
    donorTeams = await loadNpcRosterDonorTeams();
    if (market) market.donorTeams = donorTeams;
  }
  const safeStarterCandidates = donorTeams
    .filter((donor: any) => donor.id !== team.id)
    .flatMap((donor: any) => {
    const donorPlayers = donor.players || [];
    return donorPlayers
      .filter((player: any) => compatible(player))
      .filter((player: any) => {
        const afterSale = donorPlayers.filter((item: any) => item.id !== player.id);
        return afterSale.length >= Constants.Application.SQUAD_MIN_LENGTH &&
          countStarterSnipers(afterSale as any) >= 1;
      })
      .map((player: any) => ({ player, fromTeamId: donor.id }));
  });
  return sortNpcRosterCandidates(
    team,
    safeStarterCandidates.map((entry) => entry.player),
    desiredRole,
  ).map((player) => ({
    player,
    fromTeamId: safeStarterCandidates.find((entry) => entry.player.id === player.id)?.fromTeamId ?? null,
  }))[0];
}

async function repairNpcTeamRoster(teamId: number, date: Date, options: NpcRosterRepairOptions = {}) {
  const blockedPlayerIds = options.blockedPlayerIds ?? new Set<number>();
  if (options.excludedPlayerId != null) blockedPlayerIds.add(options.excludedPlayerId);
  const maxMoves = Math.max(1, options.maxMoves ?? Constants.Application.SQUAD_MIN_LENGTH + 1);
  let market = options.market;
  let moves = 0;

  while (moves < maxMoves) {
    const team = await loadNpcRosterTeam(teamId);
    if (!team) return false;

    // First remove excess starters and duplicate AWPers when they exist. A
    // short roster does not need this extra read: the already-loaded snapshot
    // is exactly the state repair needs. The enforcement path still reloads
    // after its writes so its candidate selection sees the committed roster.
    const initialStarters = (team.players || []).filter((player) => player.starter);
    const needsStarterLimitEnforcement =
      initialStarters.length > Constants.Application.SQUAD_MIN_LENGTH ||
      countStarterSnipers(initialStarters as any) > 1;
    let refreshed = team;
    if (needsStarterLimitEnforcement) {
      await enforceStarterLimit({ teamId, date });
      const reloaded = await loadNpcRosterTeam(teamId);
      if (!reloaded) return false;
      refreshed = reloaded;
    }
    const starters = (refreshed.players || []).filter((player) => player.starter);
    const sniperCount = countStarterSnipers(starters as any);
    if (starters.length >= Constants.Application.SQUAD_MIN_LENGTH && sniperCount === 1) {
      return true;
    }

    const needsSniper = sniperCount === 0;
    const preferredRole = normalizeRole(options.preferredRole || '');
    let desiredRole: string | null = needsSniper ? 'SNIPER' : 'RIFLER';
    if (!needsSniper && preferredRole && !isSniperRole(preferredRole)) desiredRole = preferredRole;
    if (!market) market = await loadNpcRosterMarket();

    let candidate = await findNpcRosterCandidate({
      team: refreshed,
      desiredRole,
      blockedPlayerIds,
      market,
    });
    // Missing AWPers must not block available rifler vacancies. If no sniper
    // exists in the compatible market, fill a starter slot and retry the AWP.
    if (!candidate && needsSniper && starters.length < Constants.Application.SQUAD_MIN_LENGTH) {
      candidate = await findNpcRosterCandidate({
        team: refreshed,
        desiredRole: 'RIFLER',
        blockedPlayerIds,
        market,
      });
    }
    // When the only missing role is the AWP and no compatible sniper exists,
    // keep the current five starters intact. Adding a rifler here would make
    // a six-player starting roster and still leave the actual vacancy open;
    // the urgent regen retry will supply the sniper instead.
    if (
      !candidate &&
      desiredRole !== 'RIFLER' &&
      (!needsSniper || starters.length < Constants.Application.SQUAD_MIN_LENGTH)
    ) {
      candidate = await findNpcRosterCandidate({
        team: refreshed,
        desiredRole: 'RIFLER',
        blockedPlayerIds,
        market,
      });
    }
    if (!candidate) return false;

    const incomingIsSniper = isSniperRole(candidate.player.role);
    let victimId: number | null = null;
    if (incomingIsSniper && starters.length >= Constants.Application.SQUAD_MIN_LENGTH) {
      const victim = starters
        .filter((player) => !isSniperRole(player.role) && !player.userControlled)
        .sort((a, b) => (a.xp || 0) - (b.xp || 0) || a.id - b.id)[0];
      if (!victim) return false;
      victimId = victim.id;
    }

    const moved = await moveNpcPlayerAtomic({
      playerId: candidate.player.id,
      expectedTeamId: candidate.fromTeamId,
      targetTeam: refreshed,
      date,
      victimId,
      // The fallback path may intentionally choose a rifler while the team is
      // still waiting for a missing AWP. Validate the candidate actually
      // selected, rather than the role that was requested first.
      expectedRole: candidate.player.role,
    });
    if (!moved) {
      blockedPlayerIds.add(candidate.player.id);
      continue;
    }
    moves += 1;

    // Shared snapshots otherwise keep offering already-signed players to
    // every later team, each time paying for a transaction that must fail.
    // Remove only the successfully claimed player; live transaction checks
    // still validate every future move.
    market.freeAgents = market.freeAgents.filter((player) => player.id !== candidate.player.id);
    market.benched = market.benched.filter((player) => player.id !== candidate.player.id);
    if (market.donorTeams) {
      for (const donor of market.donorTeams) {
        donor.players = donor.players.filter((player: any) => player.id !== candidate.player.id);
      }
    }

    if (victimId != null) await scheduleNpcRetirementCheck(victimId, date);
    blockedPlayerIds.add(candidate.player.id);
  }

  const finalTeam = await loadNpcRosterTeam(teamId);
  return Boolean(
    finalTeam &&
      ensureTeamFloorAndSniper({ players: finalTeam.players as any }),
  );
}

async function isUserBenchWorthyForReplacement(params: {
  profile: any;
  teamId: number;
  now: Date;
}) {
  const { profile, teamId, now } = params;
  const playerId = profile?.playerId;
  if (!playerId || !teamId || profile?.teamId !== teamId) return false;

  const teamTier =
    profile?.teamId === teamId
      ? profile?.team?.tier
      : (
          await DatabaseClient.prisma.team.findFirst({
            where: { id: teamId },
            select: { tier: true },
          })
        )?.tier;

  const tierSlug = getTeamTierSlug(teamTier);
  if (!tierSlug) return false;

  const S = Constants.PlayerContractSettings;
  const benchMinMatches = S.BENCH_MIN_LEAGUE_MATCHES;
  const benchKdMin = (S.BENCH_KD_MIN_BY_TIER as Record<string, number>)[tierSlug];

  const activeStint = await DatabaseClient.prisma.careerStint.findFirst({
    where: { playerId, endedAt: null, teamId },
    orderBy: { startedAt: 'desc' },
    select: { startedAt: true },
  });
  const contractStart = activeStint?.startedAt ?? subDays(now, 365);

  try {
    const leagueRecent = await LeagueStats.computeLeagueLifetimeStats(
      teamId,
      playerId,
      30,
      contractStart,
    );

    const kd = leagueRecent.kdRatio ?? 0;
    const matchesPlayed = leagueRecent.matchesPlayed ?? 0;
    return matchesPlayed >= benchMinMatches && kd < benchKdMin;
  } catch (_) {
    return false;
  }
}

async function selectBenchVictim(params: {
  teamPlayers: Array<{
    id: number;
    role?: string | null;
    starter?: boolean;
    xp?: number | null;
    age?: number | null;
    userControlled?: boolean;
    countryId?: number | null;
    country?: { continent?: { code?: string | null } | null } | null;
  }>;
  teamId: number;
  profile?: any;
  now?: Date;
  incomingPlayerId: number;
  incomingRole: string;
  incomingXp: number;
  incomingAge?: number | null;
  incomingCountryId?: number | null;
  incomingCountry?: { continent?: { code?: string | null } | null } | null;
}) {
  const {
    teamPlayers,
    teamId,
    profile,
    now,
    incomingPlayerId,
    incomingRole,
    incomingXp,
    incomingAge,
    incomingCountryId,
    incomingCountry,
  } = params;

  const userId = profile?.playerId;
  const userTeamId = profile?.teamId;
  const userPlayer =
    userId && userTeamId === teamId ? teamPlayers.find((p) => p.id === userId) : null;
  const isUserStarter = !!userPlayer?.starter;
  const userRole = normalizeRole(userPlayer?.role);

  // Hard rule for snipers: bench a starter sniper so teams don't field two starter snipers.
  if (isSniperRole(incomingRole)) {
    if (isUserStarter && isSniperRole(userRole)) {
      return userPlayer;
    }

    const starterSnipers = teamPlayers
      .filter((p) => p.starter && p.id !== incomingPlayerId && isSniperRole(p.role))
      .sort((a, b) => (a.xp ?? 0) - (b.xp ?? 0));

    return starterSnipers[0] ?? null;
  }

  let candidates = teamPlayers.filter(
    (p) => p.starter && p.id !== incomingPlayerId && normalizeRole(p.role) === incomingRole,
  );

  if (isUserStarter && userRole === incomingRole) {
    const benchWorthy = await isUserBenchWorthyForReplacement({
      profile,
      teamId,
      now: now ?? new Date(),
    });
    const shouldBenchUser = benchWorthy || Chance.rollD2(5);

    if (shouldBenchUser) {
      return userPlayer;
    }

    const npcStarters = candidates
      .filter((p) => p.id !== userPlayer.id)
      .sort((a, b) => (a.xp ?? 0) - (b.xp ?? 0));

    if (npcStarters.length) {
      return npcStarters[0];
    }

    return userPlayer;
  }

  // Hard rule for riflers: rifler must replace rifler.
  if (!candidates.length && incomingRole === 'RIFLER') {
    return null;
  }

  if (!candidates.length) {
    candidates = teamPlayers.filter((p) => p.starter && p.id !== incomingPlayerId);
  }

  const team = await DatabaseClient.prisma.team.findFirst({
    where: { id: teamId },
    include: { country: { include: { continent: true } } },
  });
  if (!team) return null;
  const teamContext = {
    ...team,
    players: teamPlayers,
  };

  const incoming = {
    xp: incomingXp,
    age: incomingAge,
    countryId: incomingCountryId,
    country: incomingCountry,
  };

  const lowerXp = candidates
    .filter((victim) =>
      canReplaceStarterWithPlayer({
        team: teamContext,
        incoming,
        victim,
      }),
    )
    .sort((a, b) => {
      const aNationalUpgrade =
        getNpcTransferCompatibilityScore(teamContext, incoming) >
        getNpcTransferCompatibilityScore(teamContext, a)
          ? 1
          : 0;
      const bNationalUpgrade =
        getNpcTransferCompatibilityScore(teamContext, incoming) >
        getNpcTransferCompatibilityScore(teamContext, b)
          ? 1
          : 0;
      if (aNationalUpgrade !== bNationalUpgrade) return bNationalUpgrade - aNationalUpgrade;

      const aAgeBonus = getAgeReplacementBonus(incoming, a);
      const bAgeBonus = getAgeReplacementBonus(incoming, b);
      if (aAgeBonus !== bAgeBonus) return bAgeBonus - aAgeBonus;

      return (a.xp ?? 0) - (b.xp ?? 0);
    });

  return lowerXp[0] ?? null;
}

async function enforceStarterLimit(params: { teamId: number; date: Date; maxStarters?: number }) {
  const { teamId, date, maxStarters = Constants.Application.SQUAD_MIN_LENGTH } = params;

  const team = await DatabaseClient.prisma.team.findFirst({
    where: { id: teamId },
    select: {
      tier: true,
      players: {
        where: { teamId, starter: true },
        select: {
          id: true,
          xp: true,
          role: true,
          userControlled: true,
          contractEnd: true,
        },
      },
    },
  });
  if (!team) return;

  const starters = [...(team.players || [])];
  const starterSnipers = starters.filter((p) => isSniperRole(p.role)).length;
  const benchCount = Math.max(0, starters.length - maxStarters);
  const duplicateSniperCount = Math.max(0, starterSnipers - 1);
  const totalToBench = Math.max(benchCount, duplicateSniperCount);
  if (totalToBench === 0) return;

  let removableSnipers = duplicateSniperCount;
  const benched: Array<(typeof starters)[number]> = [];

  for (let i = 0; i < totalToBench; i += 1) {
    const candidates = starters.filter((player) => !benched.some((b) => b.id === player.id));
    if (!candidates.length) break;

    // Remove duplicate snipers first. Otherwise a low-XP rifler can be
    // benched while two AWPers remain in the starting five.
    const duplicateSniperPool =
      removableSnipers > 0 ? candidates.filter((player) => isSniperRole(player.role)) : [];
    const keepOneStarterSniper = candidates.filter((player) => !isSniperRole(player.role));

    const victimPool = duplicateSniperPool.length
      ? duplicateSniperPool
      : keepOneStarterSniper.length
        ? keepOneStarterSniper
        : candidates;
    const victim = victimPool.sort((a, b) => {
      if (!!a.userControlled !== !!b.userControlled) {
        return a.userControlled ? 1 : -1;
      }

      const xpDiff = (a.xp || 0) - (b.xp || 0);
      if (xpDiff !== 0) return xpDiff;

      const aEnd = a.contractEnd ? new Date(a.contractEnd).getTime() : Number.MAX_SAFE_INTEGER;
      const bEnd = b.contractEnd ? new Date(b.contractEnd).getTime() : Number.MAX_SAFE_INTEGER;
      return aEnd - bEnd;
    })[0];

    if (!victim) break;

    if (isSniperRole(victim.role) && removableSnipers > 0) {
      removableSnipers -= 1;
    }

    benched.push(victim);
  }

  if (!benched.length) return;

  for (const victim of benched) {
    await DatabaseClient.prisma.player.update({
      where: { id: victim.id },
      data: {
        starter: false,
        transferListed: true,
        lastOfferAt: date,
      },
    });
    await closeOpenCareerStints(DatabaseClient.prisma, victim.id, date);
    await startCareerStint(DatabaseClient.prisma, {
      playerId: victim.id,
      teamId,
      tier: team.tier ?? null,
      starter: false,
      startedAt: date,
    });
    if (!victim.userControlled) {
      await scheduleNpcRetirementCheck(victim.id, date);
    }
  }
}

async function getCareerPeakTier(playerId: number) {
  const peak = await DatabaseClient.prisma.careerStint.findFirst({
    where: { playerId, tier: { not: null } },
    orderBy: { tier: 'desc' },
    select: { tier: true },
  });

  return typeof peak?.tier === 'number' ? peak.tier : null;
}

function getExpiryBoost(contractEnd: Date | null | undefined, now: Date) {
  if (!contractEnd) return 0;

  const daysLeft = Math.max(0, differenceInDays(contractEnd, now));
  const minDays = Constants.TransferSettings.PBX_NPC_EXPIRY_WINDOW_MIN_DAYS;
  const maxDays = Constants.TransferSettings.PBX_NPC_EXPIRY_WINDOW_MAX_DAYS;

  if (daysLeft < minDays || daysLeft > maxDays) return 0;
  return 20;
}

function getListedDays(player: { transferListed?: boolean; lastOfferAt?: Date | null }, now: Date) {
  if (!player.transferListed || !player.lastOfferAt) return 0;
  return Math.max(0, differenceInDays(now, player.lastOfferAt));
}

// Read the roster as a flat table instead of hydrating a players relation for
// every team. Keep role normalization in JS for legacy save compatibility.
// This is a fresh snapshot per sweep, not a cross-day cache: transfers, user
// actions and expiring contracts are visible on the same day.
async function loadNpcRosterHealth(npcOnly: boolean) {
  const prisma = DatabaseClient.prisma;
  const [teams, starters] = await Promise.all([
    prisma.team.findMany({
      where: npcOnly ? { profile: null } : {},
      select: { id: true },
      orderBy: { id: 'asc' },
    }),
    prisma.player.findMany({
      where: { starter: true, teamId: { not: null } },
      select: { teamId: true, role: true },
    }),
  ]);
  const health = new Map(teams.map((team) => [team.id, { id: team.id, count: 0, snipers: 0 }]));
  for (const player of starters) {
    const team = health.get(player.teamId!);
    if (!team) continue;
    team.count += 1;
    if (isSniperRole(player.role)) team.snipers += 1;
  }
  return [...health.values()];
}

async function processNPCContractExtensions() {
  const profile = await DatabaseClient.prisma.profile.findFirst();
  if (!profile) return Promise.resolve();

  const now = profile.date;
  const prisma = DatabaseClient.prisma;
  const blockedRejoinByTeam = new Map<number, Set<number>>();

  const teams = await loadNpcRosterHealth(false);

  // Most ticks have no roster overflow. Avoid one extra read/write cycle per
  // team while still handling a five-starter duplicate-AWP roster.
  for (const team of teams.filter(
    (candidate) =>
      candidate.count > Constants.Application.SQUAD_MIN_LENGTH ||
      candidate.snipers > 1,
  )) {
    await enforceStarterLimit({
      teamId: team.id,
      date: now,
    });
  }

  async function ensureNPCStarterFloorAndAwper(teamId: number, preferredRole?: string | null) {
    const blockedRejoin = blockedRejoinByTeam.get(teamId) || new Set<number>();
    await repairNpcTeamRoster(teamId, now, {
      preferredRole,
      blockedPlayerIds: blockedRejoin,
    });
    await recalculateTeamCountryIdentity(teamId);
  }

  const expired = await prisma.player.findMany({
    where: {
      teamId: { not: null },
      contractEnd: { lte: now },
      userControlled: false,
    },
    include: { country: { include: { continent: true } }, team: true },
    take: 40,
  });

  for (const expiredPlayer of expired) {
    // The expiry query is a batch snapshot. Other expirations in this pass can
    // move a player or change their contract, so validate ownership and expiry
    // again immediately before mutating anything.
    const player = await prisma.player.findFirst({
      where: {
        id: expiredPlayer.id,
        teamId: { not: null },
        contractEnd: { lte: now },
        userControlled: false,
      },
      include: { country: { include: { continent: true } }, team: true },
    });
    if (!player || !player.teamId || !player.team) continue;

    await closeOpenCareerStints(prisma, player.id, now);

    await prisma.player.update({
      where: { id: player.id },
      data: {
        teamId: null,
        contractEnd: null,
        starter: false,
        transferListed: true,
        lastOfferAt: now,
      },
    });

    const teamBlocked = blockedRejoinByTeam.get(player.teamId) || new Set<number>();
    teamBlocked.add(player.id);
    blockedRejoinByTeam.set(player.teamId, teamBlocked);

    await prisma.transfer.create({
      data: {
        status: Constants.TransferStatus.EXPIRED,
        from: { connect: { id: player.teamId } },
        target: { connect: { id: player.id } },
        offers: {
          create: [
            {
              status: Constants.TransferStatus.EXPIRED,
              cost: 0,
              wages: player.wages || 0,
              contractYears: 0,
            },
          ],
        },
      },
    });

    const retired = await evaluateNpcRetirement({
      playerId: player.id,
      date: now,
      requireNoRecentOffers: false,
      previousStarter: player.starter,
    });
    if (retired) {
      if (player.starter) {
        await ensureNPCStarterFloorAndAwper(player.teamId, player.role);
      }
      await recalculateTeamCountryIdentity(player.teamId);
      continue;
    }

    await tryPlaceEliteNPCFreeAgent({
      player,
      date: now,
      previousTeamId: player.teamId,
    });

    if (player.starter) {
      await ensureNPCStarterFloorAndAwper(player.teamId, player.role);
    }

    await recalculateTeamCountryIdentity(player.teamId);
  }

  // Failed repairs are retryable. Sweep all NPC teams after the expiry batch so
  // a team can recover as soon as a compatible player becomes available.
  const npcTeams = await loadNpcRosterHealth(true);
  const unhealthyNpcTeams = npcTeams.filter(
    (team) =>
      team.count !== Constants.Application.SQUAD_MIN_LENGTH ||
      team.snipers !== 1,
  );
  const unresolvedNpcTeamIds: number[] = [];
  const repairMarket = unhealthyNpcTeams.length ? await loadNpcRosterMarket() : undefined;
  for (const team of unhealthyNpcTeams) {
    const repaired = await repairNpcTeamRoster(team.id, now, {
      maxMoves: Constants.Application.SQUAD_MIN_LENGTH + 1,
      market: repairMarket,
    });
    await recalculateTeamCountryIdentity(team.id);
    if (!repaired) unresolvedNpcTeamIds.push(team.id);
  }

  // A vacancy with no compatible domestic market supply should not wait for
  // the next six-times-per-season intake. Generate only the currently acute
  // role requests, then retry those teams once. The guard prevents this
  // recovery pass from re-entering itself through calendar side effects.
  if (unresolvedNpcTeamIds.length && !npcUrgentRegenInProgress) {
    npcUrgentRegenInProgress = true;
    try {
      await generateNpcRegenIntake(true, new Set(unresolvedNpcTeamIds));
    } finally {
      npcUrgentRegenInProgress = false;
    }
  }

  const horizon = addDays(
    now,
    Constants.PlayerContractSettings.EXTENSION_EVAL_DAYS_BEFORE_END ?? 30,
  );

  const expiring = await DatabaseClient.prisma.player.findMany({
    where: {
      teamId: { not: null },
      contractEnd: { gt: now, lte: horizon },
      userControlled: false,
    },
    include: {
      team: { include: { country: { include: { continent: true } } } },
    },
    take: 20,
  });

  if (!expiring.length) return Promise.resolve();

  for (const player of shuffle(expiring).slice(0, 5)) {
    if (!player.teamId || !player.team || player.transferListed || !player.starter) continue;

    const isNationalTeam = !isInternationalTeamCountry(player.team as any);
    const betterNationalTeams = isNationalTeam
      ? await DatabaseClient.prisma.team.count({
          where: {
            id: { not: player.team.id },
            countryId: player.team.countryId,
            elo: { gt: player.team.elo || 0 },
            tier: { gte: player.team.tier ?? 0 },
          },
        })
      : 0;
    const hasBetterNationalPath = betterNationalTeams > 0;

    const tierTeams = await DatabaseClient.prisma.team.findMany({
      where: { tier: player.team.tier, profile: null },
      select: { elo: true },
      take: 100,
    });
    const avgElo = tierTeams.length
      ? tierTeams.reduce((sum, t) => sum + (t.elo || 0), 0) / tierTeams.length
      : player.team.elo || 0;

    let teamOfferPbx = (player.team.elo || 0) >= avgElo ? 82 : 30;
    const daysLeft = differenceInDays(player.contractEnd!, now);
    if (daysLeft <= 14) teamOfferPbx += 10;
    if (isNationalTeam && !hasBetterNationalPath) teamOfferPbx += 18;

    if (!Chance.rollD2(Math.max(5, Math.min(95, Math.round(teamOfferPbx))))) {
      continue;
    }

    const peakTier = await getCareerPeakTier(player.id);
    let playerAcceptPbx = 65;
    if (typeof peakTier === 'number' && peakTier < player.team.tier) {
      playerAcceptPbx -= 20;
    }
    if (isNationalTeam && !hasBetterNationalPath) {
      playerAcceptPbx += 20;
    }

    if (!Chance.rollD2(Math.max(5, Math.min(95, Math.round(playerAcceptPbx))))) {
      await DatabaseClient.prisma.player.update({
        where: { id: player.id },
        data: { transferListed: true, lastOfferAt: now },
      });
      continue;
    }

    const years = getTierContractYears(player.team.tier);
    const baseDate = player.contractEnd && player.contractEnd > now ? player.contractEnd : now;
    await DatabaseClient.prisma.player.update({
      where: { id: player.id },
      data: { contractEnd: addYears(baseDate, years), transferListed: false },
    });
  }

  return Promise.resolve();
}

async function trySignNPCFreeAgent(params: { from: NpcTransferTeam; date: Date }) {
  const { from, date } = params;

  const profile = await DatabaseClient.prisma.profile.findFirst(Eagers.profile);

  // Vacancy repair has priority over upgrades. A healthy roster may still use
  // the probabilistic upgrade path below, but a short roster is repaired even
  // when the normal signing roll fails.
  const currentTeam = await loadNpcRosterTeam(from.id);
  if (currentTeam) {
    const currentStarters = (currentTeam.players || []).filter((player) => player.starter);
    if (
      currentStarters.length < Constants.Application.SQUAD_MIN_LENGTH ||
      countStarterSnipers(currentStarters as any) !== 1
    ) {
      return repairNpcTeamRoster(from.id, date, {
        maxMoves: Constants.Application.SQUAD_MIN_LENGTH + 1,
      });
    }
  }

  if (!Chance.rollD2(getNPCFreeAgentSignChance(from))) {
    return Promise.resolve(false);
  }

  // keep at least one awper/sniper in team and respect role upgrade logic
  const freeAgents = await DatabaseClient.prisma.player.findMany({
    where: {
      teamId: null,
      userControlled: false,
      retiredAt: null,
      ...NPC_TEAMLESS_CANDIDATE_ELIGIBILITY,
    },
    include: {
      country: {
        include: {
          continent: true,
        },
      },
    },
    orderBy: { id: 'asc' },
  });

  if (!freeAgents.length) {
    return Promise.resolve(false);
  }

  const advancedTierIdx = Constants.Prestige.findIndex((p) => p === TierSlug.LEAGUE_ADVANCED);
  const roleCandidates = freeAgents.filter((player) => {
    if (!isNpcTransferCompatible(from, player)) {
      return false;
    }

    if ((player.xp || 0) >= 80 && (from.tier ?? 0) < advancedTierIdx) {
      return false;
    }

    const role = normalizeRole(player.role);
    // A sniper may still be an upgrade when the team already has an AWP: the
    // atomic movement will replace that starter sniper. It only rejects a
    // second AWP when no valid victim is available.
    const sameRole = (from.players || []).filter(
      (p) => p.starter && normalizeRole(p.role) === role,
    );

    if (role === 'RIFLER' && !sameRole.length) {
      return false;
    }

    return (
      sameRole.length === 0 ||
      sameRole.some((victim) =>
        canReplaceStarterWithPlayer({
          team: from,
          incoming: player,
          victim,
        }),
      )
    );
  });

  if (!roleCandidates.length) {
    return Promise.resolve(false);
  }

  const candidates = selectNPCFreeAgentCandidatesByCountryPreference(from, roleCandidates);

  if (!candidates.length) {
    return Promise.resolve(false);
  }

  const sortedCandidates = [...candidates].sort((a, b) => {
    const cohesion = getTeamNationalityCohesion(from);
    const aScore =
      (a.xp || 0) +
      getNpcTransferCompatibilityScore(from, a) +
      (matchesTeamCountryPreference(from, a) ? 45 + Math.round(cohesion * 50) : 0) -
      getVeteranOfferPenalty(a);
    const bScore =
      (b.xp || 0) +
      getNpcTransferCompatibilityScore(from, b) +
      (matchesTeamCountryPreference(from, b) ? 45 + Math.round(cohesion * 50) : 0) -
      getVeteranOfferPenalty(b);
    return bScore - aScore;
  });
  const target = sample(
    sortedCandidates.slice(0, Math.max(1, Math.min(12, sortedCandidates.length))),
  );
  if (!target) return Promise.resolve(false);

  const victim = await selectBenchVictim({
    teamPlayers: from.players as any,
    teamId: from.id,
    profile,
    now: date,
    incomingPlayerId: target.id,
    incomingRole: normalizeRole(target.role),
    incomingXp: target.xp || 0,
    incomingAge: target.age,
    incomingCountryId: target.countryId,
    incomingCountry: target.country,
  });

  if (!victim) {
    return Promise.resolve(false);
  }

  const moved = await moveNpcPlayerAtomic({
    playerId: target.id,
    expectedTeamId: null,
    targetTeam: from,
    date,
    victimId: victim.id,
    expectedRole: target.role,
  });
  if (!moved) return false;
  await scheduleNpcRetirementCheck(victim.id, date);
  const years = getTierContractYears(from.tier);

  await recalculateTeamCountryIdentity(from.id);

  Engine.Runtime.Instance.log.info(
    '%s signed free agent %s (years=%d)',
    from.name,
    target.name,
    years,
  );

  return Promise.resolve(true);
}

async function tryPlaceEliteNPCFreeAgent(params: {
  player: {
    id: number;
    name: string;
    xp?: number | null;
    age?: number | null;
    role?: string | null;
    wages?: number | null;
    countryId?: number | null;
    country?: { continent?: { code?: string | null; federationId?: number | null } | null } | null;
  };
  date: Date;
  previousTeamId?: number | null;
}) {
  const { player, date, previousTeamId } = params;

  if ((player.xp || 0) < 80) return Promise.resolve(false);

  const profile = await DatabaseClient.prisma.profile.findFirst(Eagers.profile);
  const advancedTierIdx = Constants.Prestige.findIndex((p) => p === TierSlug.LEAGUE_ADVANCED);

  const topTeams = await DatabaseClient.prisma.team.findMany({
    where: {
      id: previousTeamId ? { not: previousTeamId } : undefined,
      tier: { gte: advancedTierIdx },
      OR: [{ profile: null }, ...(profile?.teamId ? [{ id: profile.teamId }] : [])],
    },
    orderBy: { elo: 'desc' },
    take: 20,
    include: NPC_TRANSFER_TEAM_INCLUDE,
  });

  if (!topTeams.length) return Promise.resolve(false);

  const scoredTeams: Array<{ team: NpcTransferTeam; score: number }> = [];
  for (const team of topTeams) {
    if (!isNpcTransferCompatible(team, player)) {
      continue;
    }

    const victim = await selectBenchVictim({
      teamPlayers: team.players as any,
      teamId: team.id,
      profile,
      now: date,
      incomingPlayerId: player.id,
      incomingRole: normalizeRole(player.role),
      incomingXp: player.xp || 0,
      incomingAge: player.age,
      incomingCountryId: player.countryId,
      incomingCountry: player.country,
    });

    if (!victim) continue;

    let score = (team.elo || 0) / 10 + getNpcTransferCompatibilityScore(team, player);

    score -= getVeteranOfferPenalty(player);
    scoredTeams.push({ team, score });
  }

  scoredTeams.sort((a, b) => b.score - a.score);
  const topSlice = scoredTeams.slice(0, Math.max(1, Math.min(5, scoredTeams.length)));
  const targetTeam = sample(topSlice.map((entry) => entry.team));
  if (!targetTeam) return Promise.resolve(false);

  const victim = await selectBenchVictim({
    teamPlayers: targetTeam.players as any,
    teamId: targetTeam.id,
    profile,
    now: date,
    incomingPlayerId: player.id,
    incomingRole: normalizeRole(player.role),
    incomingXp: player.xp || 0,
    incomingAge: player.age,
    incomingCountryId: player.countryId,
    incomingCountry: player.country,
  });

  if (!victim || victim.userControlled) return Promise.resolve(false);

  const moved = await moveNpcPlayerAtomic({
    playerId: player.id,
    expectedTeamId: null,
    targetTeam,
    date,
    victimId: victim.id,
    expectedRole: player.role,
  });
  if (!moved) return Promise.resolve(false);
  await scheduleNpcRetirementCheck(victim.id, date);

  const years = getTierContractYears(targetTeam.tier);

  await recalculateTeamCountryIdentity(targetTeam.id);

  Engine.Runtime.Instance.log.info(
    'Elite free agent placed: %s -> %s (xp=%d, years=%d)',
    player.name,
    targetTeam.name,
    player.xp || 0,
    years,
  );

  return Promise.resolve(true);
}

export async function sendNPCTransferOffer(
  measure: <T>(phase: string, callback: () => Promise<T>) => Promise<T> =
    (_phase, callback) => callback(),
) {
  await measure('npc-contracts-and-roster-repair', () => processNPCContractExtensions());
  await measure('npc-retirement-scheduling', () => scheduleExistingNpcFreeAgentRetirementChecks());

  if (!Chance.rollD2(Constants.TransferSettings.PBX_NPC_CONSIDER)) {
    return Promise.resolve();
  }

  const profile = await DatabaseClient.prisma.profile.findFirst();
  const now = profile?.date || new Date();

  const tierSlug = Chance.pluck(Constants.Prestige, Constants.TransferSettings.PBX_NPC_TIER);
  const tierIdx = Constants.Prestige.findIndex((p) => p === tierSlug);

  const buyers = await DatabaseClient.prisma.team.findMany({
    where: {
      tier: tierIdx,
      OR: [{ profile: null }, ...(profile?.teamId ? [{ id: profile.teamId }] : [])],
    },
    include: NPC_TRANSFER_TEAM_INCLUDE,
  });

  if (!buyers.length) return Promise.resolve();

  const from = sampleNPCBuyer(buyers);
  if (!from) return Promise.resolve();

  if (await trySignNPCFreeAgent({ from, date: now })) {
    return Promise.resolve();
  }

  const sellersPool = await DatabaseClient.prisma.team.findMany({
    where: {
      id: { not: from.id },
      tier: { lte: from.tier },
      OR: [{ profile: null }, ...(profile?.teamId ? [{ id: profile.teamId }] : [])],
    },
    include: NPC_TRANSFER_TEAM_INCLUDE,
  });

  const sellers = sellersPool.filter(
    (team) => team.players.length >= Constants.Application.SQUAD_MIN_LENGTH,
  );

  if (!sellers.length) return Promise.resolve();

  const rankedSellers = sellers
    .map((team) => {
      const topXp = Math.max(...(team.players || []).map((p) => p.xp || 0), 0);
      let score = 0;

      if (matchesTeamCountryPreference(from, team)) {
        score += 50 + Math.round(getTeamNationalityCohesion(from) * 35);
      }

      if (team.tier === from.tier) {
        score +=
          from.tier >= Constants.Prestige.findIndex((p) => p === TierSlug.LEAGUE_ADVANCED)
            ? 35
            : 15;
      }

      // lower-division same-country high-XP talent bias
      if (team.tier < from.tier) {
        const tierGap = (from.tier || 0) - (team.tier || 0);
        score += tierGap === 1 ? 34 : 12;
        score += Math.round(topXp / 500);
        const promotionCandidateBoost = Math.max(
          ...(team.players || []).map((player) =>
            getLowerLeagueTransferBoost({
              from,
              player,
              sourceTier: team.tier,
            }),
          ),
          0,
        );
        score += promotionCandidateBoost;
      }

      // keep top-tier market healthy by preferring near-tier sellers
      const tierGap = Math.abs((from.tier || 0) - (team.tier || 0));
      score -= tierGap * 12;

      return { team, score };
    })
    .sort((a, b) => b.score - a.score);

  const topSlice = rankedSellers.slice(0, Math.max(1, Math.min(8, rankedSellers.length)));
  const to = sample(topSlice.map((x) => x.team));
  if (!to) return Promise.resolve();

  const created = await sendTransferOffer(from, to);
  if (created) return Promise.resolve(created);

  // fallback: if ranked pick failed (often due XP fit), try same-tier sellers
  const sameTierSellers = sellers.filter((team) => team.tier === from.tier && team.id !== to.id);
  if (!sameTierSellers.length) return Promise.resolve();

  const fallbackTo = sample(sameTierSellers);
  if (!fallbackTo) return Promise.resolve();

  return sendTransferOffer(from, fallbackTo);
}

export async function sendTransferOffer(from: NpcTransferTeam, to: NpcTransferTeam) {
  if (!from || !to || from.id === to.id) {
    return Promise.resolve();
  }

  const profile = await DatabaseClient.prisma.profile.findFirst(Eagers.profile);
  if (!profile) return Promise.resolve();

  if (to.players.length < Constants.Application.SQUAD_MIN_LENGTH) return Promise.resolve();

  const preCandidates = (to.players || [])
    .filter((player) => player.id !== profile.playerId)
    .filter((player) => isNpcTransferCompatible(from, player))
    .filter((player) => {
      const role = normalizeRole(player.role);

      // selling team must keep at least one sniper after sale
      if (role === 'SNIPER') {
        return true;
      }

      return true;
    })
    .filter((player) => {
      const role = normalizeRole(player.role);
      const sameRoleFrom = (from.players || []).filter((p) => normalizeRole(p.role) === role);

      // rifler always replaces rifler
      if (role === 'RIFLER' && !sameRoleFrom.length) {
        return false;
      }

      return (
        sameRoleFrom.length === 0 ||
        sameRoleFrom.some((victim) =>
          canReplaceStarterWithPlayer({
            team: from,
            incoming: player,
            victim,
          }),
        )
      );
    });

  const candidates: typeof preCandidates = [];
  for (const player of preCandidates) {
    // destination must keep at least 5 players and at least one sniper after benching/replacement
    const role = normalizeRole(player.role);
    const victim = await selectBenchVictim({
      teamPlayers: from.players as any,
      teamId: from.id,
      profile,
      now: profile.date,
      incomingPlayerId: player.id,
      incomingRole: role,
      incomingXp: player.xp || 0,
      incomingAge: player.age,
      incomingCountryId: player.countryId,
      incomingCountry: player.country,
    });

    if (!victim) {
      continue;
    }

    if (!ensureTeamFloorAndSniper({ players: from.players as any })) {
      continue;
    }

    candidates.push(player);
  }

  if (!candidates.length) return Promise.resolve();

  const scored = await Promise.all(
    candidates.map(async (player) => {
      let score = player.transferListed ? 85 : 0;
      score += getExpiryBoost(player.contractEnd as any, profile.date);

      const listedDays = getListedDays(player as any, profile.date);
      if (player.transferListed) {
        score += 20;
      }
      if (listedDays >= 90) {
        score += 25;
      }

      const peakTier = await getCareerPeakTier(player.id);
      if (typeof peakTier === 'number' && peakTier < from.tier) {
        score += 20;
      }

      score += getLowerLeagueTransferBoost({
        from,
        player,
        sourceTier: to.tier,
      });

      const compatibilityScore = getNpcTransferCompatibilityScore(from, player);
      if (!Number.isFinite(compatibilityScore)) {
        score = Number.NEGATIVE_INFINITY;
      } else {
        score += compatibilityScore;
      }

      if (matchesTeamCountryPreference(from, player)) {
        score +=
          Constants.TransferSettings.PBX_NPC_SAME_COUNTRY_BOOST +
          Math.round(getTeamNationalityCohesion(from) * 45);

        // allow picking strong same-country players from lower divisions
        if (to.tier < from.tier && (player.xp || 0) >= 70) {
          score += 30;
        }
      }

      score -= getVeteranOfferPenalty(player);

      if ((to.elo || 0) > (from.elo || 0)) {
        score -= Constants.TransferSettings.PBX_NPC_SELLING_TEAM_PERFORMANCE_DAMPENER;
      }

      return { player, score };
    }),
  );

  scored.sort((a, b) => b.score - a.score || (b.player.xp || 0) - (a.player.xp || 0));

  const preferredCandidates = selectNPCTargetCandidatesByCountryPreference(
    from,
    scored.map(({ player }) => player),
  );
  if (!preferredCandidates.length) return Promise.resolve();

  const target = scored.find((entry) =>
    preferredCandidates.some((player) => player.id === entry.player.id),
  )?.player;
  if (!target) return Promise.resolve();

  const sellerPlayersAfterSale = (to.players || []).filter((player) => player.id !== target.id);
  if (!ensureTeamFloorAndSniper({ players: sellerPlayersAfterSale as any })) {
    // Use the same one-hop, role-aware plan that the acceptance path commits.
    // This keeps offer creation from promising a transfer that can only be
    // completed by recursively starving another team.
    const backfillPlan = await findNpcSellerBackfillAfterSale({
      team: to,
      soldPlayerId: target.id,
      soldRole: target.role || '',
    });
    if (!backfillPlan) return Promise.resolve();
  }

  const fromFed = from.competitionFederationId ?? null;
  const toFed = to.competitionFederationId ?? null;
  const sameFed = fromFed && toFed ? fromFed === toFed : true;

  const peakTier = await getCareerPeakTier(target.id);
  const topProfile =
    typeof peakTier === 'number' &&
    peakTier >= Constants.Prestige.findIndex((p) => p === TierSlug.LEAGUE_ADVANCED);
  if (
    !sameFed &&
    !(topProfile && Chance.rollD2(Constants.TransferSettings.PBX_NPC_CROSS_FED_TOP))
  ) {
    return Promise.resolve();
  }

  const offerPercent = random(95, 115) / 100;
  const cost = Math.max(0, Math.round((target.cost || 0) * offerPercent));
  const wages = Math.max(0, Math.round(((target.wages || 0) * random(95, 120)) / 100));
  const contractYears = getTierContractYears(from.tier);

  const transfer = await DatabaseClient.prisma.transfer.create({
    data: {
      status: Constants.TransferStatus.TEAM_PENDING,
      from: { connect: { id: from.id } },
      to: { connect: { id: to.id } },
      target: { connect: { id: target.id } },
      offers: {
        create: [
          {
            status: Constants.TransferStatus.TEAM_PENDING,
            cost,
            wages,
            contractYears,
          },
        ],
      },
    },
    include: Eagers.transfer.include,
  });

  await DatabaseClient.prisma.calendar.create({
    data: {
      type: Constants.CalendarEntry.TRANSFER_PARSE,
      date: addDays(
        profile.date,
        random(
          Constants.TransferSettings.RESPONSE_MIN_DAYS,
          Constants.TransferSettings.RESPONSE_MAX_DAYS,
        ),
      ).toISOString(),
      payload: String(transfer.id),
    },
  });

  Engine.Runtime.Instance.log.info(
    '%s sent npc offer to %s for %s (years=%d)',
    from.name,
    to.name,
    target.name,
    contractYears,
  );

  return Promise.resolve(transfer);
}

async function findNpcSellerBackfillAfterSale(params: {
  team: NpcTransferTeam;
  soldPlayerId: number;
  soldRole: string;
}) {
  const { team, soldPlayerId, soldRole } = params;
  const activePlayers = (team.players || []).filter((player) => player.id !== soldPlayerId);
  if (ensureTeamFloorAndSniper({ players: activePlayers as any })) {
    return { candidate: null, victimId: null };
  }

  const needsSniper = countStarterSnipers(activePlayers as any) === 0;
  const preferredRole = normalizeRole(soldRole);
  const desiredRole = needsSniper
    ? 'SNIPER'
    : preferredRole && !isSniperRole(preferredRole)
      ? preferredRole
      : 'RIFLER';
  const blockedPlayerIds = new Set<number>([soldPlayerId]);
  let candidate = await findNpcRosterCandidate({
    team,
    desiredRole,
    blockedPlayerIds,
    excludedPlayerIds: new Set([soldPlayerId]),
  });
  if (!candidate && needsSniper) {
    candidate = await findNpcRosterCandidate({
      team,
      desiredRole: 'RIFLER',
      blockedPlayerIds,
      excludedPlayerIds: new Set([soldPlayerId]),
    });
  }
  if (!candidate) return null;

  let victimId: number | null = null;
  if (isSniperRole(candidate.player.role) && activePlayers.filter((p) => p.starter).length >= 5) {
    victimId = activePlayers
      .filter((player) => player.starter && !isSniperRole(player.role) && !player.userControlled)
      .sort((a, b) => (a.xp || 0) - (b.xp || 0) || a.id - b.id)[0]?.id ?? null;
    if (victimId == null) return null;
  }

  const activeStarters = activePlayers.filter((player) => player.starter);
  const victim = victimId == null ? null : activeStarters.find((player) => player.id === victimId);
  const finalStarters = activeStarters.length + 1 - (victimId == null ? 0 : 1);
  const finalSnipers =
    countStarterSnipers(activeStarters as any) - (victim && isSniperRole(victim.role) ? 1 : 0) +
    (isSniperRole(candidate.player.role) ? 1 : 0);
  if (finalStarters < Constants.Application.SQUAD_MIN_LENGTH || finalSnipers !== 1) return null;

  return { candidate, victimId };
}

export async function onTransferParse(entry: Calendar) {
  const transferId = Number(entry.payload || 0);
  if (!transferId) return Promise.resolve();

  const transfer = await DatabaseClient.prisma.transfer.findFirst({
    where: { id: transferId },
    include: Eagers.transfer.include,
  });

  if (
    !transfer ||
    transfer.status !== Constants.TransferStatus.TEAM_PENDING ||
    !transfer.to ||
    transfer.from.id === transfer.to.id
  ) {
    return Promise.resolve();
  }

  const [offer] = transfer.offers;
  if (!offer) return Promise.resolve();

  const profile = await DatabaseClient.prisma.profile.findFirst(Eagers.profile);
  if (!profile) return Promise.resolve();

  let teamAcceptPbx = 60;
  if (transfer.target.transferListed) teamAcceptPbx += 20;
  const toElo = transfer.to.elo || 0;
  const fromElo = transfer.from.elo || 0;
  if (toElo > fromElo) {
    teamAcceptPbx -= Constants.TransferSettings.PBX_NPC_SELLING_TEAM_PERFORMANCE_DAMPENER;
  }

  if (!Chance.rollD2(Math.max(5, Math.min(95, teamAcceptPbx)))) {
    await DatabaseClient.prisma.transfer.update({
      where: { id: transfer.id },
      data: {
        status: Constants.TransferStatus.TEAM_REJECTED,
        offers: {
          updateMany: {
            where: { transferId: transfer.id, status: Constants.TransferStatus.TEAM_PENDING },
            data: { status: Constants.TransferStatus.TEAM_REJECTED },
          },
        },
      },
    });
    return Promise.resolve();
  }

  let playerAcceptPbx = 60;
  playerAcceptPbx += getExpiryBoost(transfer.target.contractEnd as any, profile.date);
  if (matchesTeamCountryPreference(transfer.from as any, transfer.target as any))
    playerAcceptPbx += 10;

  const listedDays = getListedDays(transfer.target as any, profile.date);
  const lowerTierOffer = transfer.from.tier < transfer.to.tier;
  if (lowerTierOffer && listedDays >= 90) {
    playerAcceptPbx = Math.max(playerAcceptPbx, 92);
  }

  if (!Chance.rollD2(Math.max(5, Math.min(95, playerAcceptPbx)))) {
    await DatabaseClient.prisma.transfer.update({
      where: { id: transfer.id },
      data: {
        status: Constants.TransferStatus.PLAYER_REJECTED,
        offers: {
          updateMany: {
            where: { transferId: transfer.id, status: Constants.TransferStatus.TEAM_PENDING },
            data: { status: Constants.TransferStatus.PLAYER_REJECTED },
          },
        },
      },
    });
    return Promise.resolve();
  }

  const fromTeam = await DatabaseClient.prisma.team.findFirst({
    where: { id: transfer.from.id },
    include: NPC_TRANSFER_TEAM_INCLUDE,
  });
  const toTeam = await DatabaseClient.prisma.team.findFirst({
    where: { id: transfer.to.id },
    include: NPC_TRANSFER_TEAM_INCLUDE,
  });
  if (!fromTeam || !toTeam) return Promise.resolve();

  const liveTarget = await DatabaseClient.prisma.player.findFirst({
    where: {
      id: transfer.target.id,
      teamId: toTeam.id,
      retiredAt: null,
      userControlled: false,
    },
    include: { country: { include: { continent: true } } },
  });
  if (!liveTarget) {
    // The recorded seller no longer owns the player. Leave the pending offer
    // untouched so a later consistency pass can reject it safely.
    return Promise.resolve();
  }

  if (!isNpcTransferCompatible(fromTeam, liveTarget)) {
    await DatabaseClient.prisma.transfer.update({
      where: { id: transfer.id },
      data: {
        status: Constants.TransferStatus.TEAM_REJECTED,
        offers: {
          updateMany: {
            where: { transferId: transfer.id, status: Constants.TransferStatus.TEAM_PENDING },
            data: { status: Constants.TransferStatus.TEAM_REJECTED },
          },
        },
      },
    });
    return Promise.resolve();
  }

  // keep both teams valid after trade (>=5 players and at least one sniper each)
  if (!ensureTeamFloorAndSniper({ players: fromTeam.players as any })) {
    return Promise.resolve();
  }

  const role = normalizeRole(liveTarget.role);
  const sellerBackfillPlan = await findNpcSellerBackfillAfterSale({
    team: toTeam,
    soldPlayerId: liveTarget.id,
    soldRole: liveTarget.role || '',
  });
  if (!sellerBackfillPlan) return Promise.resolve();

  const victim = await selectBenchVictim({
    teamPlayers: fromTeam.players as any,
    teamId: fromTeam.id,
    profile,
    now: profile.date,
    incomingPlayerId: liveTarget.id,
    incomingRole: role,
    incomingXp: liveTarget.xp || 0,
    incomingAge: liveTarget.age,
    incomingCountryId: liveTarget.countryId,
    incomingCountry: liveTarget.country,
  });

  // strict rule: incoming non-snipers must bench one lower-XP player at destination
  // (snipers always replace a starter sniper to keep a single starter sniper)
  if (!victim) {
    return Promise.resolve();
  }

  const years = offer.contractYears ?? 1;
  const contractEnd = addYears(profile.date, years);
  try {
    await DatabaseClient.prisma.$transaction(async (tx) => {
      const movedTarget = await moveNpcPlayerInTransaction(tx, {
        playerId: liveTarget.id,
        expectedTeamId: toTeam.id,
        targetTeam: fromTeam,
        date: profile.date,
        victimId: victim.id,
        createTransfer: false,
        contractEnd,
        wages: offer.wages ?? liveTarget.wages,
        expectedRole: liveTarget.role,
        allowPlannedDonorShortage: Boolean(sellerBackfillPlan.candidate),
      });
      if (!movedTarget) throw new Error('NPC target ownership changed before transfer commit');

      const pendingTransfer = await tx.transfer.findFirst({
        where: { id: transfer.id, status: Constants.TransferStatus.TEAM_PENDING },
        select: { id: true },
      });
      if (!pendingTransfer) throw new Error('NPC transfer was resolved concurrently');
      await tx.transfer.update({
        where: { id: transfer.id },
        data: {
          status: Constants.TransferStatus.PLAYER_ACCEPTED,
          offers: {
            updateMany: {
              where: { transferId: transfer.id, status: Constants.TransferStatus.TEAM_PENDING },
              data: { status: Constants.TransferStatus.PLAYER_ACCEPTED },
            },
          },
        },
      });

      if (sellerBackfillPlan.candidate) {
        const movedSeller = await moveNpcPlayerInTransaction(tx, {
          playerId: sellerBackfillPlan.candidate.player.id,
          expectedTeamId: sellerBackfillPlan.candidate.fromTeamId,
          targetTeam: toTeam,
          date: profile.date,
          victimId: sellerBackfillPlan.victimId,
          expectedRole: sellerBackfillPlan.candidate.player.role,
        });
        if (!movedSeller) throw new Error('NPC seller backfill candidate changed before transfer commit');
      }

      const finalSeller = await tx.team.findFirst({
        where: { id: toTeam.id },
        include: NPC_TRANSFER_TEAM_INCLUDE,
      });
      if (!finalSeller || !ensureTeamFloorAndSniper({ players: finalSeller.players as any })) {
        throw new Error('NPC seller would remain unhealthy after transfer commit');
      }
    });
  } catch (error) {
    Engine.Runtime.Instance.log.debug(
      'NPC transfer %d left pending after validation failure: %s',
      transfer.id,
      (error as Error).message,
    );
    return Promise.resolve();
  }

  await scheduleNpcRetirementCheck(victim.id, profile.date);
  if (sellerBackfillPlan.victimId != null) {
    await scheduleNpcRetirementCheck(sellerBackfillPlan.victimId, profile.date);
  }

  await recalculateTeamCountryIdentity(transfer.from.id);
  await recalculateTeamCountryIdentity(transfer.to.id);

  await DatabaseClient.prisma.calendar.deleteMany({
    where: {
      completed: false,
      payload: String(transfer.target.id),
      type: {
        in: [
          Constants.CalendarEntry.PLAYER_CONTRACT_EXPIRE,
          Constants.CalendarEntry.PLAYER_CONTRACT_EXTENSION_EVAL,
          Constants.CalendarEntry.PLAYER_CONTRACT_REVIEW,
        ],
      },
      date: { gte: profile.date.toISOString() },
    },
  });
  await DatabaseClient.prisma.calendar.create({
    data: {
      type: Constants.CalendarEntry.PLAYER_CONTRACT_EXPIRE,
      date: contractEnd.toISOString(),
      payload: String(transfer.target.id),
    },
  });

  Engine.Runtime.Instance.log.info(
    'NPC transfer accepted: %s -> %s (%s, years=%d)',
    transfer.to.name,
    transfer.from.name,
    transfer.target.name,
    years,
  );

  return Promise.resolve();
}

/**
 * Sync teams to their current tier.
 *
 * By the time this function runs, the new season's league
 * competitions should have already been started and the
 * teams placed in their corresponding tier.
 *
 * @function
 */
export async function syncTiers() {
  // get the current season's league competitions
  const profile = await DatabaseClient.prisma.profile.findFirst();
  const competitions = await DatabaseClient.prisma.competition.findMany({
    where: {
      season: profile.season,
      tier: {
        league: {
          slug: Constants.LeagueSlug.ESPORTS_LEAGUE,
        },
      },
    },
    include: {
      competitors: true,
      tier: true,
    },
  });

  // build a transaction for all the updates
  const transaction: Prisma.PrismaPromise<Prisma.BatchPayload>[] = competitions.reduce(
    (queries: Prisma.PrismaPromise<Prisma.BatchPayload>[], competition) => {
      const prestigeIdx = getPrestigeIndexForTierSlug(competition.tier.slug);
      if (prestigeIdx < 0) {
        return queries;
      }

      queries.push(
        DatabaseClient.prisma.team.updateMany({
          where: {
            id: { in: competition.competitors.map((competitor) => competitor.teamId) },
          },
          data: {
            tier: prestigeIdx,
            prestige: prestigeIdx,
          },
        }),
      );

      return queries;
    },
    [],
  );

  // run the transaction
  return DatabaseClient.prisma.$transaction(transaction);
}

/**
 * Sync player wages.
 *
 * Currently, only the user's players can gain XP throughout the season
 * but this may change in the future. At which point this function
 * would be a mirror of the `061-wages.ts` seeder.
 *
 * @todo move the transaction logic to a shared function
 * @function
 */
export async function syncWages() {
  // get the user's squad
  const profile = await DatabaseClient.prisma.profile.findFirst(Eagers.profile);

  // Teamless player: no user squad wage syncing.
  if (!profile || profile.teamId == null || !profile.team) {
    return Promise.resolve();
  }

  // build a transaction for all the updates
  const transaction = profile.team.players.map((player) => {
    const xp = new Bot.Exp(player);
    const tier = Constants.Prestige[xp.getBotTemplate().prestige];
    const wageConfigs = Constants.PlayerWages[tier as keyof typeof Constants.PlayerWages];

    if (!wageConfigs) {
      return DatabaseClient.prisma.player.update({
        where: { id: player.id },
        data: { cost: 0, wages: 0 },
      });
    }

    // build probability weights
    const wagePbxWeight = {} as Parameters<typeof Chance.roll>[number];
    wageConfigs.forEach((weight, idx) => (wagePbxWeight[idx] = weight.percent));

    // pick the wage range for the player
    const wageConfigIdx = Chance.roll(wagePbxWeight);
    const wageConfig = wageConfigs[Number(wageConfigIdx)];

    // calculate cost from wage
    const wages = random(wageConfig.low, wageConfig.high);
    const cost = wages * wageConfig.multiplier;

    return DatabaseClient.prisma.player.update({
      where: { id: player.id },
      data: { cost, wages },
    });
  });

  // run the transaction
  return DatabaseClient.prisma.$transaction(transaction);
}

async function incrementAgesSeasonal() {
  const profile = await DatabaseClient.prisma.profile.findFirst();

  if (!profile || profile.season <= 1) {
    Engine.Runtime.Instance.log.info(
      'Season start: skipping age increment for first season (season=%d).',
      profile?.season ?? 0,
    );
    return;
  }

  const res = await DatabaseClient.prisma.player.updateMany({
    where: { age: { not: null } },
    data: { age: { increment: 1 } },
  });

  Engine.Runtime.Instance.log.info('Season start: incremented age for %d players.', res.count);
}

function getSeasonalXpRegression(player: {
  age: number | null;
  starter: boolean;
  teamId: number | null;
  transferListed: boolean;
}) {
  const age = player.age ?? 0;
  const inactive = player.teamId == null || !player.starter || player.transferListed;

  if (age <= 31) return 0;
  if (age <= 33) return 1;
  if (age <= 35) return inactive ? 4 : 2;
  return inactive ? 6 : 3;
}

async function applySeasonalXpRegression() {
  const profile = await DatabaseClient.prisma.profile.findFirst();
  if (!profile || profile.season <= 1) return;

  const players = await DatabaseClient.prisma.player.findMany({
    where: {
      age: { gte: 32 },
      retiredAt: null,
    },
    select: {
      id: true,
      xp: true,
      age: true,
      starter: true,
      teamId: true,
      transferListed: true,
    },
  });

  const updates = players
    .map((player) => ({
      id: player.id,
      xp: Math.max(0, (player.xp ?? 0) - getSeasonalXpRegression(player)),
    }))
    .filter((update, index) => update.xp !== (players[index].xp ?? 0));

  if (!updates.length) return;

  await DatabaseClient.prisma.$transaction(
    updates.map((update) =>
      DatabaseClient.prisma.player.update({
        where: { id: update.id },
        data: { xp: update.xp },
      }),
    ),
  );

  Engine.Runtime.Instance.log.info('Season start: applied XP regression to %d veteran players.', updates.length);
}

async function scheduleNpcRetirementCheck(playerId: number, fromDate: Date) {
  const prisma = DatabaseClient.prisma;
  const inactivityDays = random(NPC_RETIREMENT_CHECK_MIN_DAYS, NPC_RETIREMENT_CHECK_MAX_DAYS);
  await prisma.calendar.deleteMany({
    where: {
      type: Constants.CalendarEntry.NPC_RETIREMENT_CHECK,
      completed: false,
      date: { gt: fromDate.toISOString() },
      OR: [
        { payload: String(playerId) },
        { payload: { startsWith: `${playerId}:` } },
      ],
    },
  });
  await prisma.calendar.create({
    data: {
      type: Constants.CalendarEntry.NPC_RETIREMENT_CHECK,
      date: addDays(fromDate, inactivityDays).toISOString(),
      payload: `${playerId}:${inactivityDays}`,
    },
  });
}

async function scheduleExistingNpcFreeAgentRetirementChecks() {
  const prisma = DatabaseClient.prisma;
  const profile = await prisma.profile.findFirst();
  if (!profile) return;

  const [freeAgents, scheduledChecks] = await Promise.all([
    prisma.player.findMany({
      where: {
        teamId: null,
        userControlled: false,
        retiredAt: null,
        age: { gte: 30 },
      },
      select: { id: true },
    }),
    prisma.calendar.findMany({
      where: {
        type: Constants.CalendarEntry.NPC_RETIREMENT_CHECK,
        completed: false,
      },
      select: { payload: true },
    }),
  ]);
  const scheduledPlayerIds = new Set(
    scheduledChecks
      .map((entry) => Number(String(entry.payload ?? '').split(':')[0]))
      .filter((playerId) => Number.isFinite(playerId) && playerId > 0),
  );

  // Existing saves can already contain veteran free agents. Give each one an
  // individual, randomized check without retiring the group as a batch.
  await Promise.all(
    freeAgents
      .filter((player) => !scheduledPlayerIds.has(player.id))
      .map((player) => scheduleNpcRetirementCheck(player.id, profile.date)),
  );
}

function getRegenAssetsPath() {
  // The CLI has no Electron `resourcesPath`; keep the same source-tree asset
  // lookup used by development so urgent intake/repair can run in tests and
  // headless simulations as well as in the packaged app.
  const resourcesRoot =
    is.dev() || process.env['NODE_ENV'] === 'cli'
      ? path.join(process.env.INIT_CWD || process.cwd(), 'src', 'resources')
      : process.resourcesPath || path.join(process.cwd(), 'src', 'resources');
  return path.join(resourcesRoot, 'regens');
}

async function getRegenAvatarPool() {
  if (regenAvatarPool) return regenAvatarPool;

  const assetsPath = getRegenAssetsPath();
  const regions = (Object.keys(REGEN_REGION_SETTINGS) as RegenRegion[])
    .map((region) => ({
      region,
      directory: (REGEN_REGION_SETTINGS[region] as { avatarDirectory?: string }).avatarDirectory,
    }))
    .filter((region): region is { region: RegenRegion; directory: string } => !!region.directory);
  const entries = await Promise.all(
    regions.map(async ({ region, directory }) => {
      try {
        const files = await fs.promises.readdir(path.join(assetsPath, directory));
        return files
          .filter((file) => /\.(png|jpe?g|webp)$/i.test(file))
          .map((file) => ({
            region,
            url: `${REGEN_AVATAR_URL_PREFIX}${directory}/${file}`,
          }));
      } catch (error) {
        Engine.Runtime.Instance.log.warn(
          'Unable to load regen avatars from %s: %s',
          path.join(assetsPath, directory),
          (error as Error).message,
        );
        return [];
      }
    }),
  );

  regenAvatarPool = entries.flat();
  return regenAvatarPool;
}

async function scheduleNpcRegenIntakes() {
  const profile = await DatabaseClient.prisma.profile.findFirst({ select: { date: true } });
  if (!profile) return;

  const seasonStart = startOfDay(profile.date);
  const intakeDates = NPC_REGEN_INTAKE_OFFSETS_DAYS.map((offset) => addDays(seasonStart, offset));
  const existing = await DatabaseClient.prisma.calendar.findMany({
    where: {
      type: Constants.CalendarEntry.NPC_REGEN_INTAKE,
      date: { in: intakeDates.map((date) => date.toISOString()) },
    },
    select: { date: true },
  });
  const scheduledDates = new Set(existing.map((entry) => entry.date.toISOString()));
  const missingDates = intakeDates.filter((date) => !scheduledDates.has(date.toISOString()));

  if (!missingDates.length) return;

  await DatabaseClient.prisma.$transaction(
    missingDates.map((date) =>
      DatabaseClient.prisma.calendar.create({
        data: {
          date: date.toISOString(),
          type: Constants.CalendarEntry.NPC_REGEN_INTAKE,
        },
      }),
    ),
  );
}

function getNextRegenNumber(names: string[]) {
  return (
    names.reduce((highest, name) => {
      const match = /^Regen\s+(\d+)$/i.exec(name.trim());
      return match ? Math.max(highest, Number(match[1])) : highest;
    }, 0) + 1
  );
}

/**
 * Creates a small, staggered, country-specific intake. Retirements are the
 * demand signal, so no players appear merely because the season has advanced.
 */
async function generateNpcRegenIntake(urgentOnly = false, repairTeamIds?: Set<number>) {
  const prisma = DatabaseClient.prisma;
  type RegenRole = 'SNIPER' | 'RIFLER';
  type RoleCounts = Record<RegenRole, number>;
  type RegionalVacancyRequest = {
    role: RegenRole;
    preferredCountryId?: number;
  };
  const [
    retiredPlayers,
    regens,
    availableFreeAgents,
    countries,
    usedAvatars,
    existingNames,
  ] = await Promise.all([
    // Keep retirement demand by country. A Chinese retirement must produce a
    // Chinese regen; the portrait pool must never decide the nationality.
    prisma.player.findMany({
      where: {
        userControlled: false,
        retiredAt: { not: null },
        country: REGEN_COUNTRY_FILTER,
        // A free agent who never represented a team has not left a competitive
        // career slot behind, so they must not create a regen replacement.
        careerStints: { some: { teamId: { not: null } } },
      },
      select: { countryId: true, role: true },
    }),
    prisma.player.findMany({
      where: {
        isRegen: true,
        country: REGEN_COUNTRY_FILTER,
      },
      select: { countryId: true, role: true },
    }),
    // Existing compatible free agents already represent supply. Counting
    // them before creating regens prevents every intake from adding another
    // player for the same long-lived vacancy.
    prisma.player.findMany({
      where: {
        teamId: null,
        userControlled: false,
        retiredAt: null,
        country: REGEN_COUNTRY_FILTER,
        ...NPC_TEAMLESS_CANDIDATE_ELIGIBILITY,
      },
      select: {
        countryId: true,
        role: true,
        country: { select: { code: true, continent: { select: { code: true } } } },
      },
    }),
    prisma.country.findMany({
      where: REGEN_COUNTRY_FILTER,
      select: { id: true, code: true, continent: { select: { code: true } } },
    }),
    prisma.player.findMany({
      where: {
        isRegen: true,
        avatar: { startsWith: REGEN_AVATAR_URL_PREFIX },
      },
      select: { avatar: true },
    }),
    prisma.player.findMany({
      where: { name: { startsWith: 'Regen ' } },
      select: { name: true },
    }),
  ]);
  const countryRegionById = new Map<number, RegenRegion>();
  for (const country of countries) {
    const region = getRegenRegionForCountry(country);
    if (region) {
      countryRegionById.set(country.id, region);
    }
  }
  const retiredRolesByCountryId = new Map<number, Map<RegenRole, number>>();
  const regenRolesByCountryId = new Map<number, Map<RegenRole, number>>();
  const freeSupplyByCountryId = new Map<number, RoleCounts>();
  const freeSupplyByRegion = new Map<RegenRegion, RoleCounts>();
  const countryIdsByRegion = new Map<RegenRegion, number[]>();
  const getRole = (role?: string | null): RegenRole =>
    normalizeRole(role) === 'SNIPER' ? 'SNIPER' : 'RIFLER';
  const addRoleCount = (
    countsByCountry: Map<number, Map<RegenRole, number>>,
    countryId: number,
    role: RegenRole,
  ) => {
    const counts = countsByCountry.get(countryId) || new Map<RegenRole, number>();
    counts.set(role, (counts.get(role) || 0) + 1);
    countsByCountry.set(countryId, counts);
  };
  const roleCounts = (source?: Map<RegenRole, number>): RoleCounts => ({
    SNIPER: source?.get('SNIPER') || 0,
    RIFLER: source?.get('RIFLER') || 0,
  });
  const addSupply = (countryId: number, region: RegenRegion, role: RegenRole) => {
    const countryCounts = freeSupplyByCountryId.get(countryId) || { SNIPER: 0, RIFLER: 0 };
    countryCounts[role] += 1;
    freeSupplyByCountryId.set(countryId, countryCounts);
    const regionCounts = freeSupplyByRegion.get(region) || { SNIPER: 0, RIFLER: 0 };
    regionCounts[role] += 1;
    freeSupplyByRegion.set(region, regionCounts);
  };

  retiredPlayers.forEach((player) =>
    addRoleCount(retiredRolesByCountryId, player.countryId, getRole(player.role)),
  );
  regens.forEach((player) => {
    addRoleCount(regenRolesByCountryId, player.countryId, getRole(player.role));
  });
  availableFreeAgents.forEach((player) => {
    const region = countryRegionById.get(player.countryId);
    if (region) addSupply(player.countryId, region, getRole(player.role));
  });

  // Vacancies are a demand signal alongside retirement replacement. Locked
  // and national-core teams request their identity nationality; CIS teams use
  // their dominant CIS nationality when one is available. Regional teams use
  // a current starter nationality when possible, otherwise they retain a
  // region-level request which is assigned to a deterministic country below.
  const vacancyRequestsByCountryId = new Map<number, RegenRole[]>();
  const vacancyRequestsByRegion = new Map<RegenRegion, RegionalVacancyRequest[]>();
  const vacancyTeams = await prisma.team.findMany({
    where: { profile: null },
    select: {
      id: true,
      countryId: true,
      country: { select: { code: true, continent: { select: { code: true } } } },
      npcRecruitmentPolicy: true,
      players: {
        where: { starter: true },
        select: { starter: true, countryId: true, role: true, country: { select: { code: true } } },
      },
    },
  });
  const addVacancyRequest = (
    role: RegenRole,
    countryId: number | null,
    region: RegenRegion | null,
    preferredCountryId?: number,
  ) => {
    if (countryId != null && countryRegionById.has(countryId)) {
      const requests = vacancyRequestsByCountryId.get(countryId) || [];
      requests.push(role);
      vacancyRequestsByCountryId.set(countryId, requests);
      return;
    }
    if (region) {
      const requests = vacancyRequestsByRegion.get(region) || [];
      requests.push({ role, preferredCountryId });
      vacancyRequestsByRegion.set(region, requests);
    }
  };
  const regenRegionForIdentity = (identityRegion: string): RegenRegion | null => {
    // Asia is split for portraits, so use its stable east pool as the
    // deterministic fallback when a synthetic Asian team has no starter
    // nationality from which to choose. Teams with starters are assigned to
    // their actual country region above.
    return (
      {
        Europe: 'europe',
        Asia: 'asia_east',
        'South America': 'south_america',
        'North America': 'north_america',
        Other: null,
      } as Record<string, RegenRegion | null>
    )[identityRegion] ?? null;
  };

  for (const team of vacancyTeams) {
    const starters = team.players || [];
    const sniperCount = countStarterSnipers(starters as any);
    const missingSlots = Math.max(0, Constants.Application.SQUAD_MIN_LENGTH - starters.length);
    const requestedRoles: RegenRole[] = [];
    if (missingSlots > 0) {
      for (let slot = 0; slot < missingSlots; slot += 1) {
        requestedRoles.push(slot === 0 && sniperCount === 0 ? 'SNIPER' : 'RIFLER');
      }
    } else if (sniperCount === 0) {
      requestedRoles.push('SNIPER');
    }
    if (!requestedRoles.length) continue;

    const identity = getNpcTransferTeamIdentity(team as any);
    let countryId: number | null = null;
    if (identity.type === 'national-lock' || identity.type === 'national-core') {
      countryId = identity.countryId;
    } else if (identity.type === 'cis-core') {
      const dominant = starters
        .filter((player) => isNpcTransferCisCountry(player as any))
        .reduce<Map<number, number>>((counts, player) => {
          counts.set(player.countryId, (counts.get(player.countryId) || 0) + 1);
          return counts;
        }, new Map()) as Map<number, number>;
      countryId = [...dominant.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? null;
    } else {
      const teamCountryCode = team.country?.code?.toLowerCase() ?? '';
      const isSyntheticRegion =
        teamCountryCode === OTHER_TEAM_COUNTRY_CODE ||
        Boolean(MIXED_REGION_STORAGE_CODES[teamCountryCode]);
      if (!isSyntheticRegion && countryRegionById.has(team.countryId)) {
        countryId = team.countryId;
      } else {
        const starterCountryCounts = new Map<number, number>();
        starters.forEach((player) => {
          if (countryRegionById.has(player.countryId)) {
            starterCountryCounts.set(
              player.countryId,
              (starterCountryCounts.get(player.countryId) || 0) + 1,
            );
          }
        });
        countryId =
          [...starterCountryCounts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ??
          null;
      }
    }
    const region =
      (countryId != null && countryRegionById.get(countryId)) ||
      regenRegionForIdentity(identity.region);
    for (const role of requestedRoles) {
      addVacancyRequest(role, countryId, region, countryId ?? undefined);
    }
  }

  const pendingRequests: Array<{
    countryId: number;
    role: RegenRole;
    urgent?: boolean;
  }> = [];
  const consumeCountrySupply = (countryId: number, role: RegenRole, amount: number) => {
    const counts = freeSupplyByCountryId.get(countryId);
    const consumed = Math.min(amount, counts?.[role] || 0);
    if (!consumed) return 0;
    counts![role] -= consumed;
    const region = countryRegionById.get(countryId);
    if (region) {
      const regionCounts = freeSupplyByRegion.get(region);
      if (regionCounts) regionCounts[role] = Math.max(0, regionCounts[role] - consumed);
    }
    return consumed;
  };
  const consumeRegionSupply = (region: RegenRegion, role: RegenRole, amount: number) => {
    let remaining = amount;
    for (const countryId of countryIdsByRegion.get(region) || []) {
      if (!remaining) break;
      remaining -= consumeCountrySupply(countryId, role, remaining);
    }
    return amount - remaining;
  };
  const addCountryDemand = (
    countryId: number,
    role: RegenRole,
    required: number,
    urgentCount = 0,
  ) => {
    if (!required) return;
    const supplied = consumeCountrySupply(countryId, role, required);
    for (let index = supplied; index < required; index += 1) {
      pendingRequests.push({
        countryId,
        role,
        urgent: index - supplied < urgentCount,
      });
    }
  };

  for (const country of countries) {
    const region = countryRegionById.get(country.id);
    if (!region) continue;
    const retired = roleCounts(retiredRolesByCountryId.get(country.id));
    const existingRegens = roleCounts(regenRolesByCountryId.get(country.id));
    const vacancy = vacancyRequestsByCountryId.get(country.id) || [];
    const vacancyCounts: RoleCounts = {
      SNIPER: vacancy.filter((role) => role === 'SNIPER').length,
      RIFLER: vacancy.filter((role) => role === 'RIFLER').length,
    };
    for (const role of ['SNIPER', 'RIFLER'] as RegenRole[]) {
      const retirementShortage = Math.max(0, retired[role] - existingRegens[role]);
      const required = Math.max(retirementShortage, vacancyCounts[role]);
      addCountryDemand(country.id, role, required, vacancyCounts[role]);
    }
    if (!countryIdsByRegion.has(region)) countryIdsByRegion.set(region, []);
    countryIdsByRegion.get(region)!.push(country.id);
  }
  for (const ids of countryIdsByRegion.values()) ids.sort((a, b) => a - b);

  for (const [region, requests] of vacancyRequestsByRegion.entries()) {
    const requestCounts: RoleCounts = {
      SNIPER: requests.filter((request) => request.role === 'SNIPER').length,
      RIFLER: requests.filter((request) => request.role === 'RIFLER').length,
    };
    for (const role of ['SNIPER', 'RIFLER'] as RegenRole[]) {
      const required = requestCounts[role];
      if (!required) continue;
      const supplied = consumeRegionSupply(region, role, required);
      const preferredCountries = requests
        .filter((request) => request.role === role && request.preferredCountryId != null)
        .map((request) => request.preferredCountryId!)
        .filter((countryId, index, all) => all.indexOf(countryId) === index)
        .sort((a, b) => a - b);
      const fallbackCountries = countryIdsByRegion.get(region) || [];
      const targetCountries = preferredCountries.length ? preferredCountries : fallbackCountries;
      if (!targetCountries.length) continue;
      for (let index = supplied; index < required; index += 1) {
        pendingRequests.push({
          countryId: targetCountries[index % targetCountries.length],
          role,
          urgent: true,
        });
      }
    }
  }
  const pendingReplacements = pendingRequests.length;
  // Vacancy requests are acute and are serviced in this same intake. Routine
  // historical retirement demand is deliberately chunked so a large backlog
  // cannot create an unbounded burst, while the shortage remains visible to
  // the next scheduled intake.
  const urgentRequests = pendingRequests.filter((request) => request.urgent);
  const routineRequests = pendingRequests.filter((request) => !request.urgent);
  const requestsToCreate = [
    ...urgentRequests,
    ...(urgentOnly ? [] : routineRequests.slice(0, NPC_REGEN_INTAKE_MAX_BATCH_SIZE)),
  ];
  const intakeSize = requestsToCreate.length;
  if (!intakeSize) return;

  const usedAvatarUrls = new Set(usedAvatars.flatMap((player) => (player.avatar ? [player.avatar] : [])));
  const availableAvatars = (await getRegenAvatarPool()).filter((avatar) => !usedAvatarUrls.has(avatar.url));
  const profile = await prisma.profile.findFirst({ select: { date: true } });
  if (!profile) return;

  let nextRegenNumber = getNextRegenNumber(existingNames.map((player) => player.name));
  const createData: Prisma.PlayerUncheckedCreateInput[] = [];
  for (let index = 0; index < intakeSize; index += 1) {
    const request = requestsToCreate[index];
    const countryId = request.countryId;
    const country = countries.find((item) => item.id === countryId);
    const region = countryRegionById.get(countryId);
    if (!country || !region) continue;

    const regionalAvatarIndexes = availableAvatars
      .map((avatar, avatarIndex) => (avatar.region === region ? avatarIndex : -1))
      .filter((avatarIndex) => avatarIndex >= 0);
    const avatarIndex = regionalAvatarIndexes.length
      ? sample(regionalAvatarIndexes)!
      : -1;
    const avatar = avatarIndex >= 0 ? availableAvatars.splice(avatarIndex, 1)[0] : null;
    const regionSettings = REGEN_REGION_SETTINGS[region];

    const isSniper = request.role === 'SNIPER';
    createData.push({
      name: `Regen ${nextRegenNumber++}`,
      countryId: country.id,
      avatar: avatar?.url || null,
      age: random(16, 19),
      xp: random(regionSettings.xp[0], regionSettings.xp[1]),
      elo: random(regionSettings.elo[0], regionSettings.elo[1]),
      role: isSniper ? Constants.PlayerRole.SNIPER : Constants.PlayerRole.RIFLER,
      personality: sample(isSniper ? REGEN_SNIPER_PERSONALITIES : REGEN_RIFLE_PERSONALITIES),
      starter: false,
      transferListed: true,
      isRegen: true,
      generatedAt: profile.date,
    });
  }

  if (!createData.length) return;
  await prisma.$transaction(createData.map((data) => prisma.player.create({ data })));
  const repairTeams = await prisma.team.findMany({
    where: {
      profile: null,
      ...(repairTeamIds?.size ? { id: { in: [...repairTeamIds] } } : {}),
    },
    select: { id: true },
    orderBy: { id: 'asc' },
  });
  const repairMarket = await loadNpcRosterMarket();
  for (const team of repairTeams) {
    await repairNpcTeamRoster(team.id, profile.date, {
      maxMoves: Constants.Application.SQUAD_MIN_LENGTH + 1,
      market: repairMarket,
    });
    await recalculateTeamCountryIdentity(team.id);
  }
  Engine.Runtime.Instance.log.info(
    'Generated %d regen%s (%d pending replacement%s remain).',
    createData.length,
    createData.length === 1 ? '' : 's',
    Math.max(0, pendingReplacements - createData.length),
    pendingReplacements - createData.length === 1 ? '' : 's',
  );
}

export async function onNpcRegenIntake(_: Calendar) {
  await generateNpcRegenIntake(false);
}

// Kept private to normal game flows but exposed for deterministic integration
// tests that exercise the real Prisma transaction and repair paths.
export const __npcWorldgenTest = {
  createMatchdays,
  loadNpcRosterHealth,
  moveNpcPlayerAtomic,
  processNPCContractExtensions,
  repairNpcTeamRoster,
  generateNpcRegenIntake,
  trySignNPCFreeAgent,
  tryPlaceEliteNPCFreeAgent,
};

async function evaluateNpcRetirement(params: {
  playerId: number;
  date: Date;
  requireNoRecentOffers: boolean;
  inactivityDays?: number;
  previousStarter?: boolean;
}) {
  const {
    playerId,
    date,
    requireNoRecentOffers,
    inactivityDays = 60,
    previousStarter,
  } = params;
  const prisma = DatabaseClient.prisma;
  const player = await prisma.player.findFirst({
    where: { id: playerId, userControlled: false, retiredAt: null },
    select: {
      id: true,
      name: true,
      age: true,
      xp: true,
      starter: true,
      teamId: true,
      countryId: true,
      transferListed: true,
      team: { select: { tier: true } },
      careerStints: { select: { tier: true } },
    },
  });

  if (!player || (player.age ?? 0) < 30) return false;

  const inactive = player.teamId == null || (!player.starter && player.transferListed);
  if (!inactive) return false;

  if (requireNoRecentOffers) {
    const recentOffer = await prisma.offer.findFirst({
      where: {
        createdAt: { gt: subDays(date, inactivityDays) },
        transfer: { playerId: player.id },
      },
      select: { id: true },
    });
    if (recentOffer) {
      await scheduleNpcRetirementCheck(player.id, date);
      return false;
    }
  }

  const peakTier = Math.max(
    player.team?.tier ?? -1,
    ...player.careerStints.map((stint) => stint.tier ?? -1),
  );
  const nationalTeams = await prisma.team.findMany({
    where: { profile: null, countryId: player.countryId },
    select: {
      id: true,
      tier: true,
      players: {
        where: { starter: true },
        select: { xp: true },
      },
    },
  });
  const hasViableNationalContinuation = nationalTeams.some(
    (team) =>
      team.id !== player.teamId &&
      team.tier <= peakTier &&
      team.players.some((starter) => (starter.xp ?? 0) <= (player.xp ?? 0) - 5),
  );
  const trophyWins = await prisma.competitionToTeam.findMany({
    where: {
      position: 1,
      teamId: { not: null },
      competition: {
        OR: [
          { tier: { slug: { in: CAREER_COMPLETION_TIER_SLUGS } } },
          { tier: { league: { slug: Constants.LeagueSlug.ESPORTS_PRO_LEAGUE } } },
        ],
        matches: {
          some: {
            players: {
              some: { id: player.id },
            },
          },
        },
      },
    },
    select: { competition: { select: { tier: { select: { slug: true } } } } },
  });
  const careerTrophyPoints = trophyWins.reduce(
    (total, win) =>
      total + (win.competition.tier.slug === TierSlug.MAJOR_CHAMPIONS_STAGE ? 3 : 1),
    0,
  );
  const retirementChance = getNpcRetirementChance({
    ...player,
    starter: previousStarter ?? player.starter,
    hasViableNationalContinuation,
    careerTrophyPoints,
  });

  if (!Chance.rollD2(retirementChance)) {
    await scheduleNpcRetirementCheck(player.id, date);
    return false;
  }

  await closeOpenCareerStints(prisma, player.id, date);
  // Build the story before the team link is cleared. The news classifier needs
  // the player's final bench/team state to decide between a farewell article,
  // a title-based article, and a lower-division short.
  const retirementNewsItem = await News.createNpcRetirementItem({
    playerId: player.id,
    publishedAt: date,
  });
  await prisma.player.update({
    where: { id: player.id },
    data: {
      teamId: null,
      contractEnd: null,
      starter: false,
      transferListed: false,
      lastOfferAt: null,
      retiredAt: date,
    },
  });
  if (retirementNewsItem) {
    WindowManager.get(Constants.WindowIdentifier.Main, false)?.webContents.send(
      Constants.IPCRoute.NEWS_ITEMS_UPDATED,
    );
  }
  Engine.Runtime.Instance.log.info(
    'Retired NPC %s (id=%d age=%d xp=%d chance=%d nationalContinuation=%s trophyPoints=%d).',
    player.name,
    player.id,
    player.age ?? 0,
    player.xp ?? 0,
    retirementChance,
    hasViableNationalContinuation,
    careerTrophyPoints,
  );
  return true;
}

export async function onNpcRetirementCheck(entry: Calendar) {
  const [rawPlayerId, rawInactivityDays] = String(entry.payload ?? '').split(':');
  const playerId = Number(rawPlayerId);
  const parsedInactivityDays = Number(rawInactivityDays);
  const inactivityDays = Number.isFinite(parsedInactivityDays)
    ? Math.max(
        NPC_RETIREMENT_CHECK_MIN_DAYS,
        Math.min(NPC_RETIREMENT_CHECK_MAX_DAYS, parsedInactivityDays),
      )
    : 60;
  const profile = await DatabaseClient.prisma.profile.findFirst();
  if (!profile || !Number.isFinite(playerId) || playerId <= 0) return;

  await evaluateNpcRetirement({
    playerId,
    date: profile.date,
    requireNoRecentOffers: true,
    inactivityDays,
  });
}

/**
 * Engine loop handler.
 *
 * Starts the provided competition.
 *
 * @param entry Engine loop input data.
 * @function
 */
export async function onCompetitionStart(entry: Calendar) {
  const startTime = performance.now();
  // find the competition for this calendar entry item
  let competition = await DatabaseClient.prisma.competition.findFirst({
    where: {
      id: parseInt(entry.payload),
    },
    include: Eagers.competition.include,
  });

  Engine.Runtime.Instance.log.debug('Starting %s...', competition.tier.name);

  // if autofill was triggered then we must reload the competition
  // model with the updated competitor relationships
  const autofill = Autofill.Items.filter(
    (item) =>
      item.on === Constants.CalendarEntry.COMPETITION_START &&
      item.tierSlug === competition.tier.slug,
  );
  const tiers = await DatabaseClient.prisma.tier.findMany({
    where: {
      slug: competition.tier.slug,
    },
    include: Eagers.tier.include,
  });
  const teams = flatten(
    await Promise.all(
      autofill.map(async (item) => {
        const tier = tiers.find((tier) => tier.slug === item.tierSlug);
        return Autofill.parse(item, tier, competition.federation);
      }),
    ),
  );

  if (teams.length > 0) {
    competition = await DatabaseClient.prisma.competition.update({
      where: { id: competition.id },
      data: {
        competitors: {
          create: teams.map((team) => ({ teamId: team.id })),
        },
      },
      include: Eagers.competition.include,
    });
  }

  if (competition.tier.slug === Constants.TierSlug.LEAGUE_PRO) {
    const proPrestige = Constants.Prestige.findIndex(
      (prestige) => prestige === Constants.TierSlug.LEAGUE_PRO,
    );
    const eplTeams = await DatabaseClient.prisma.team.findMany({
      where: {
        id: { in: competition.competitors.map((competitor) => competitor.teamId) },
      },
      select: {
        id: true,
      },
    });
    await DatabaseClient.prisma.$transaction(
      eplTeams.map((team) =>
        DatabaseClient.prisma.team.update({
          where: { id: team.id },
          data: {
            tier: proPrestige,
            prestige: proPrestige,
          },
        }),
      ),
    );
  }

  // create and start the tournament
  const isIemRegionalQualifier =
    competition.tier.slug === Constants.TierSlug.IEM_COLOGNE_OPEN_QUALIFIER ||
    competition.tier.slug === Constants.TierSlug.IEM_KRAKOW_OPEN_QUALIFIER;
  const tierSize = isIemRegionalQualifier
    ? IEM_QUALIFIER_SIZE[competition.federation.slug as Constants.FederationSlug] ||
      competition.tier.size
    : competition.tier.league.slug === Constants.LeagueSlug.ESPORTS_LEAGUE
      ? Util.getLeagueTierSize(
          competition.tier.slug as Constants.TierSlug,
          competition.federation.slug as Constants.FederationSlug,
          competition.tier.size,
        )
      : competition.tier.size;
  const competitorCount = competition.competitors.length;
  const swissConfig = Constants.TierSwissConfig[competition.tier.slug as Constants.TierSlug];
  const swissTierSize = swissConfig ? Math.min(swissConfig.maxTeams, tierSize) : tierSize;
  const tournamentSize = Math.min(swissTierSize, competitorCount);
  if (tournamentSize < 4) {
    Engine.Runtime.Instance.log.warn(
      'Skipping %s - %s due to insufficient competitors (%d).',
      competition.federation.name,
      competition.tier.name,
      competitorCount,
    );
    return DatabaseClient.prisma.competition.update({
      where: { id: competition.id },
      data: { status: Constants.CompetitionStatus.COMPLETED },
    });
  }
  const tournamentOptions:
    | Clux.GroupStageOptions
    | Clux.DuelOptions
    | {
        iemGroup: true;
        last: Constants.BracketIdentifier.LOWER;
        short: true;
        skipUpperFinal?: boolean;
      }
    | {
        groupSize: number;
        groupSwiss: true;
        maxLosses: number;
        maxRounds: number;
        maxWins: number;
      }
    | {
        swiss: {
          maxLosses: number;
          maxRounds: number;
          maxWins: number;
        };
      } = swissConfig
    ? {
        swiss: {
          maxLosses: swissConfig.maxLosses,
          maxRounds: swissConfig.maxRounds,
          maxWins: swissConfig.maxWins,
        },
      }
    : competition.tier.groupSize &&
        GROUP_SWISS_TIERS.has(competition.tier.slug as Constants.TierSlug)
      ? {
          groupSize: Math.min(competition.tier.groupSize, tournamentSize),
          groupSwiss: true,
          maxLosses: 2,
          maxRounds: 3,
          maxWins: 2,
        }
      : competition.tier.groupSize
        ? {
            groupSize: Math.min(competition.tier.groupSize, tournamentSize),
            meetTwice: false,
          }
        : IEM_GROUP_TIERS.has(competition.tier.slug as Constants.TierSlug)
          ? {
              iemGroup: true,
              last: Constants.BracketIdentifier.LOWER,
              short: true,
              ...(competition.tier.slug === Constants.TierSlug.MAJOR_ASIA_RMR
                ? { skipUpperFinal: true }
                : {}),
            }
          : DOUBLE_ELIMINATION_TIERS.has(competition.tier.slug as Constants.TierSlug)
            ? {
                last: Constants.BracketIdentifier.LOWER,
                short: true,
              }
            : {
                short: true,
                ...(competition.tier.slug === Constants.TierSlug.LEAGUE_ADVANCED_PLAYOFFS &&
                competition.federation.slug === Constants.FederationSlug.ESPORTS_ASIA
                  ? { last: Constants.BracketIdentifier.LOWER }
                  : {}),
              };
  const tournament = new Tournament(tournamentSize, tournamentOptions);
  const tournamentCompetitors = SEEDED_TOURNAMENT_TIERS.has(
    competition.tier.slug as Constants.TierSlug,
  )
    ? seedTournamentCompetitors(competition.competitors, competition).slice(0, tournamentSize)
    : shuffle(competition.competitors).slice(0, tournamentSize);

  tournament.addCompetitors(tournamentCompetitors.map((competitor) => competitor.id));
  tournament.start();

  // collect map pool
  const profile = await DatabaseClient.prisma.profile.findFirst();
  const mapPool = await DatabaseClient.prisma.mapPool.findMany({
    where: {
      gameVersion: {
        slug: Util.loadSettings(profile.settings).general.game,
      },
      position: {
        not: null,
      },
    },
    orderBy: {
      position: 'asc',
    },
    include: Eagers.mapPool.include,
  });

  // register matches
  await Promise.all(
    tournament.$base.rounds().map((round) => {
      const randomRoundMap = sample(mapPool)?.gameMap.name || mapPool[0]?.gameMap.name;
      const vetoPlaceholderMap = mapPool[0]?.gameMap.name || randomRoundMap;
      return createMatchdays(round, tournament, competition, randomRoundMap, vetoPlaceholderMap);
    }),
  );

  await syncCompetitionEndDate(competition.id);

  // Persist seed/group assignments in bulk with the tournament state.
  const result = await DatabaseClient.prisma.$transaction(async (tx) => {
    const seeded = tournament.competitors.map((id) => ({ id, data: {
      seed: tournament.getSeedByCompetitorId(id), group: tournament.getGroupByCompetitorId(id),
    } }));
    let updated = 0;
    for (const statement of numericUpdateBatches('CompetitionToTeam', seeded)) updated += await tx.$executeRaw(statement);
    if (updated !== seeded.length) throw new Error('Missing competitor while starting tournament');
    return tx.competition.update({
    where: { id: competition.id },
    data: {
      status: Constants.CompetitionStatus.STARTED,
      tournament: JSON.stringify(tournament.save()),
    },
    });
  });
  const elapsed = performance.now() - startTime;
  if (elapsed >= 100) Engine.Runtime.Instance.log.info(
    'Competition start %s / %s: %dms, %d competitors, %d bracket matches',
    competition.tier.slug, competition.federation.slug, Math.round(elapsed),
    tournament.competitors.length, tournament.$base.rounds().flat().length,
  );
  return result;
}

/**
 * Engine loop handler.
 *
 * Sends a scheduled e-mail.
 *
 * @param entry Engine loop input data.
 * @function
 */
export async function onEmailSend(entry: Calendar) {
  const payload = JSON.parse(entry.payload) as Parameters<typeof sendEmail>;
  return sendEmail(...payload);
}

/**
 * Engine loop handler.
 *
 * Runs all actionable items that are required
 * when starting a new season.
 *
 * @function
 */
export async function onSeasonStart() {
  Engine.Runtime.Instance.log.info('Starting the season...');
  return createWelcomeEmail()
    .then(scheduleNextSeasonStart)
    .then(bumpSeasonNumber)
    .then(rotateMapPoolForNewSeason)
    .then(() => syncLeagueSchedule(DatabaseClient.prisma as unknown as PrismaClient))
    .then(createCompetitions)
    .then(incrementAgesSeasonal)
    .then(applySeasonalXpRegression)
    .then(scheduleNpcRegenIntakes)
    .then(syncTiers)
    .then(syncWages);
}

/**
 * Engine loop handler.
 *
 * Simulates an NPC match.
 *
 * @param entry Engine loop input data.
 * @function
 */
export async function onMatchdayNPC(
  entry: Calendar,
  report?: (phase: string, elapsedMs: number) => void,
  options: {
    deferPersistence?: boolean;
    match?: NpcMatchdayRecord;
    forcedSeriesScore?: { home: number; away: number };
  } = {},
) {
  const phase = phaseClock(report);
  const match = options.match ?? await DatabaseClient.prisma.match.findFirst({
    where: { id: Number(entry.payload) },
    include: NPC_MATCHDAY_INCLUDE,
  });

  phase('match-read');
  if (!match) {
    Engine.Runtime.Instance.log.warn('Cannot simulate missing match id=%s. Skipping.', entry.payload);
    return Promise.resolve();
  }
  if (entry.type === Constants.CalendarEntry.MATCHDAY_USER) {
    Engine.Runtime.Instance.log.debug('Found match(id=%d) with status: %s', match.id, match.status);
  }

  if (match.status !== Constants.MatchStatus.READY) {
    Engine.Runtime.Instance.log.warn(
      'Cannot simulate match. Invalid match state: %s. Skipping.',
      match.status,
    );
    return Promise.resolve();
  }

  // load sim settings if this is a user matchday
  const simulator = new Simulator.Score();
  const careerProfile = await DatabaseClient.prisma.profile.findFirst();
  const simulateNpcMatchStats =
    entry.type === Constants.CalendarEntry.MATCHDAY_NPC &&
    Boolean(careerProfile?.simulateNpcMatchStats);
  let userMatchdayProfile: Awaited<ReturnType<typeof DatabaseClient.prisma.profile.findFirst>>;

  if (entry.type === Constants.CalendarEntry.MATCHDAY_USER) {
    userMatchdayProfile = careerProfile;
    const settings = Util.loadSettings(careerProfile.settings);
    simulator.mode = settings.general.simulationMode;
    simulator.userPlayerId = careerProfile.playerId;
    simulator.userTeamId = careerProfile.teamId;
  }

  // are draws allowed?
  if (!match.competition.tier.groupSize) {
    simulator.allowDraw = false;
  }

  // sim the game
  const [home, away] = match.competitors;
  const simulation =
    match.games.length === 1
      ? {
          maps: [simulator.generate([home.team, away.team])],
          score: null as Simulator.MapScore | null,
        }
      : simulator.generateSeriesDetailed([home.team, away.team], match.games.length);
  if (options.forcedSeriesScore) {
    const requestedHomeWins = Math.max(0, Math.trunc(options.forcedSeriesScore.home));
    const requestedAwayWins = Math.max(0, Math.trunc(options.forcedSeriesScore.away));
    const requiredMaps = Math.min(
      match.games.length,
      Math.max(1, requestedHomeWins + requestedAwayWins),
    );
    const winners = [
      ...Array.from({ length: requestedHomeWins }, () => home.team.id),
      ...Array.from({ length: requestedAwayWins }, () => away.team.id),
    ].slice(0, requiredMaps);
    simulation.maps = winners.map((winnerId, index) => {
      const loserId = winnerId === home.team.id ? away.team.id : home.team.id;
      const loserScore = Math.max(4, 9 - index);
      return { [winnerId]: 13, [loserId]: loserScore };
    });
    simulation.score = {
      [home.team.id]: winners.filter((id) => id === home.team.id).length,
      [away.team.id]: winners.filter((id) => id === away.team.id).length,
    };
  }
  const simulationResult =
    simulation.score ??
    ({
      [home.team.id]: simulation.maps[0][home.team.id],
      [away.team.id]: simulation.maps[0][away.team.id],
    } as Simulator.MapScore);

  // Defensive guard: cup matches cannot end in a draw. In edge cases where
  // sim inputs produce an equal scoreline (e.g. malformed probability table),
  // force a 1-score margin so the bracket can progress deterministically.
  if (!simulator.allowDraw && simulationResult[home.team.id] === simulationResult[away.team.id]) {
    const homeWinsTiebreak = home.team.elo >= away.team.elo;
    if (homeWinsTiebreak) {
      simulationResult[home.team.id] += 1;
    } else {
      simulationResult[away.team.id] += 1;
    }

    if (match.games.length === 1) {
      simulation.maps[0] = { ...simulationResult };
    }
  }

  const simulatedMaps = simulation.maps
    .map((score, idx) => ({
      game: match.games[idx],
      score,
    }))
    .filter((map) => !!map.game);
  const simulatedStats = simulateNpcMatchStats
    ? buildSimulatedMatchEvents({
        away,
        home,
        maps: simulatedMaps,
        matchDate: match.date,
        matchId: match.id,
      })
    : { events: [], playerIds: [] };

  // check if we need to award earnings to user for a win (only if user has a team)
  if (
    entry.type === Constants.CalendarEntry.MATCHDAY_USER &&
    simulator.userTeamId != null &&
    Simulator.getMatchResult(simulator.userTeamId, simulationResult) === Constants.MatchResult.WIN
  ) {
    const profile = await DatabaseClient.prisma.profile.findFirst();
    if (profile.teamId != null) {
      await DatabaseClient.prisma.team.update({
        where: {
          id: profile.teamId,
        },
        data: {
          earnings: {
            increment: Constants.GameSettings.WIN_AWARD_AMOUNT,
          },
        },
      });
    }
  }

  // apply elo deltas
  const homeActualScore =
    Constants.EloScore[Simulator.getMatchResult(home.team.id, simulationResult)];
  const awayActualScore =
    Constants.EloScore[Simulator.getMatchResult(away.team.id, simulationResult)];
  const deltas = [
    Util.getTeamRankingPointDelta(home.team.elo, away.team.elo, homeActualScore, {
      tierSlug: match.competition?.tier?.slug,
      leagueSlug: match.competition?.tier?.league?.slug,
      competitionFederationId: match.competition?.federationId,
      ownCompetitionFederationId: home.team.competitionFederationId,
      opponentCompetitionFederationId: away.team.competitionFederationId,
      ownTier: home.team.tier,
      opponentTier: away.team.tier,
    }),
    Util.getTeamRankingPointDelta(away.team.elo, home.team.elo, awayActualScore, {
      tierSlug: match.competition?.tier?.slug,
      leagueSlug: match.competition?.tier?.league?.slug,
      competitionFederationId: match.competition?.federationId,
      ownCompetitionFederationId: away.team.competitionFederationId,
      opponentCompetitionFederationId: home.team.competitionFederationId,
      ownTier: away.team.tier,
      opponentTier: home.team.tier,
    }),
  ];

  phase('match-simulation');
  await XpEconomy.applyMatchXpFromSim({
    matchContext: match,
    matchId: match.id,
    homeTeam: home.team,
    awayTeam: away.team,
    simulationResult,
    allowDraw: simulator.allowDraw,
    profile:
      entry.type === Constants.CalendarEntry.MATCHDAY_USER
        ? {
            id: userMatchdayProfile?.id,
            teamId: simulator.userTeamId,
            playerId: simulator.userPlayerId,
          }
        : undefined,
  });

  phase('match-xp');
  const buildWrites = (client: Pick<typeof DatabaseClient.prisma, 'team' | 'match' | 'game' | '$executeRaw'>) => {
  const transaction: Prisma.PrismaPromise<unknown>[] = [
    ...deltas.map((delta, teamIdx) =>
      client.team.update({
        where: {
          id: match.competitors[teamIdx].team.id,
        },
        data: {
          elo: Util.clampElo(match.competitors[teamIdx].team.elo + delta),
        },
      }),
    ),
    client.match.update({
      where: {
        id: Number(entry.payload),
      },
      data: {
        status: Constants.MatchStatus.COMPLETED,
      },
    }),
  ];

  transaction.push(...numericUpdateBatches('MatchToTeam', match.competitors.map((competitor) => ({
    id: competitor.id,
    data: {
      score: simulationResult[competitor.team.id],
      result: Simulator.getMatchResult(competitor.team.id, simulationResult),
    },
  }))).map((statement) => client.$executeRaw(statement)));
  if (simulateNpcMatchStats) {
    transaction.push(...matchPlayerLinkBatches(match.id, simulatedStats.playerIds)
      .map((statement) => client.$executeRaw(statement)));
  }
  if (simulateNpcMatchStats && simulatedMaps.length) {
    transaction.push(client.game.updateMany({
      where: { id: { in: simulatedMaps.map(({ game }) => game.id) }, matchId: match.id },
      data: { status: Constants.MatchStatus.COMPLETED },
    }));
    transaction.push(...numericUpdateBatches('GameToTeam', simulatedMaps.flatMap(({ game, score }) =>
      game.teams.map((team) => ({
        id: team.id,
        data: { score: score[team.teamId ?? 0], result: Simulator.getMatchResult(team.teamId ?? 0, score) },
      })),
    )).map((statement) => client.$executeRaw(statement)));
  }

  const scoresEnd = transaction.length;
  transaction.push(...createSimulatedMatchEventBatches(simulatedStats.events, client));
  const eventsEnd = transaction.length;
  transaction.push(...createSimulatedMatchPlayerGameStatUpserts(simulatedStats.events, client));
  return { transaction, scoresEnd, eventsEnd };
  };

  // Profile only a small deterministic sample, keeping the fast array
  // transaction path for the other matches. Both paths remain atomic.
  if (options.deferPersistence) {
    const deferred: DeferredNpcMatchPersistence = {
      kind: 'deferred-npc-match-persistence',
      matchId: match.id,
      teamIds: match.competitors.flatMap((competitor) =>
        competitor.teamId == null ? [] : [competitor.teamId]),
      createTransaction: () => buildWrites(DatabaseClient.prisma).transaction,
    };
    phase('match-build-writes');
    return deferred;
  }

  const samplePersistence = Boolean(report) && match.id % 100 === 0;
  const writes = samplePersistence ? undefined : buildWrites(DatabaseClient.prisma);
  phase('match-build-writes');
  const persistenceStarted = performance.now();
  const result = samplePersistence
    ? await DatabaseClient.prisma.$transaction(async (tx) => {
        const { transaction, scoresEnd, eventsEnd } = buildWrites(tx);
        let started = performance.now();
        const results: unknown[] = [];
        for (let index = 0; index < transaction.length; index += 1) {
          results.push(await transaction[index]);
          if (index + 1 === scoresEnd || index + 1 === eventsEnd || index + 1 === transaction.length) {
            const now = performance.now();
            report?.(index + 1 === scoresEnd ? 'sample-persist-scores-links' :
              index + 1 === eventsEnd ? 'sample-persist-events' : 'sample-persist-stats', now - started);
            started = now;
          }
        }
        return results;
      })
    : await DatabaseClient.prisma.$transaction(writes!.transaction);
  if (samplePersistence) report?.('sample-persist-total', performance.now() - persistenceStarted);
  phase('match-persist');
  return result;
}

/**
 * Simulate an adjacent run of NPC matchdays in calendar order, then commit
 * independent matches together. A repeated team is a hard boundary: its first
 * match is committed before the second one is even read, so Elo, lineups and
 * every other live database value retain their existing sequential semantics.
 */
export async function onMatchdayNPCBatch(
  entries: Calendar[],
  report?: (phase: string, elapsedMs: number) => void,
) {
  if (!entries.length) return Promise.resolve();
  const matchIds = entries.map((entry) => Number(entry.payload)).filter(Number.isFinite);
  const preflightStarted = performance.now();
  const preflight = await DatabaseClient.prisma.match.findMany({
    where: { id: { in: matchIds } },
    select: { id: true, competitors: { select: { teamId: true } } },
  });
  report?.('match-batch-preflight', performance.now() - preflightStarted);
  const teamIdsByMatchId = new Map(preflight.map((match) => [
    match.id,
    match.competitors.flatMap((competitor) => competitor.teamId == null ? [] : [competitor.teamId]),
  ]));

  const segments: Calendar[][] = [];
  let segment: Calendar[] = [];
  let segmentTeamIds = new Set<number>();
  for (const entry of entries) {
    const teamIds = teamIdsByMatchId.get(Number(entry.payload)) ?? [];
    if (segment.length && teamIds.some((teamId) => segmentTeamIds.has(teamId))) {
      segments.push(segment);
      segment = [];
      segmentTeamIds = new Set<number>();
    }
    segment.push(entry);
    teamIds.forEach((teamId) => segmentTeamIds.add(teamId));
  }
  if (segment.length) segments.push(segment);

  for (const currentSegment of segments) {
    const ids = currentSegment.map((entry) => Number(entry.payload)).filter(Number.isFinite);
    const readStarted = performance.now();
    const matches = await DatabaseClient.prisma.match.findMany({
      where: { id: { in: ids } },
      include: NPC_MATCHDAY_INCLUDE,
    });
    const matchesById = new Map(matches.map((match) => [match.id, match]));
    const readElapsed = performance.now() - readStarted;
    report?.('match-read', readElapsed);
    report?.('match-batch-read', readElapsed);

    const deferred: DeferredNpcMatchPersistence[] = [];
    for (const entry of currentSegment) {
      const result = await onMatchdayNPC(entry, report, {
        deferPersistence: true,
        match: matchesById.get(Number(entry.payload)),
      });
      if (isDeferredNpcMatchPersistence(result)) deferred.push(result);
    }
    if (!deferred.length) continue;

    for (const persistenceBatch of chunk(deferred, 25)) {
      const persistStarted = performance.now();
      try {
        await DatabaseClient.prisma.$transaction(
          persistenceBatch.flatMap((match) => match.createTransaction()),
        );
      } catch (error) {
        // The batch is atomic. Retry match-by-match so a malformed/stale row
        // keeps the former failure isolation rather than blocking unrelated
        // simulated matches from the same calendar run.
        Engine.Runtime.Instance.log.warn(
          'NPC match batch commit failed (%d matches); retrying sequentially: %s',
          persistenceBatch.length,
          (error as Error).message,
        );
        for (const match of persistenceBatch) {
          await DatabaseClient.prisma.$transaction(match.createTransaction());
        }
      }
      const elapsed = performance.now() - persistStarted;
      report?.('match-persist', elapsed);
      report?.('match-batch-persist', elapsed);
    }
  }

  return Promise.resolve();
}

export async function onPlayerContractExpire(entry: Calendar) {
  const playerId = Number(entry.payload);
  const profile = await DatabaseClient.prisma.profile.findFirst(Eagers.profile);
  if (!profile) return Promise.resolve();

  const player = await DatabaseClient.prisma.player.findFirst({
    where: { id: playerId },
    include: { team: { include: { personas: true } } },
  });
  if (!player) return Promise.resolve();

  if (player.id !== profile.playerId) return Promise.resolve();

  const oldTeamId = player.teamId;
  const today = profile.date;

  await closeOpenCareerStints(DatabaseClient.prisma, player.id, today);

  // Make user free agent again
  await DatabaseClient.prisma.player.update({
    where: { id: player.id },
    data: { teamId: null, contractEnd: null },
  });

  const updatedProfile = await DatabaseClient.prisma.profile.update({
    where: { id: profile.id },
    data: { teamId: null },
    include: { player: true, team: true },
  });

  // Revert remaining USER matchdays for the old team back to NPC
  if (oldTeamId != null) {
    await recalculateTeamCountryIdentity(oldTeamId);
    const futureMatches = await DatabaseClient.prisma.match.findMany({
      where: {
        date: { gte: today.toISOString() },
        competitors: { some: { teamId: oldTeamId } },
      },
      select: { id: true },
    });

    const matchIds = futureMatches.map((m) => String(m.id));

    if (matchIds.length) {
      await DatabaseClient.prisma.calendar.updateMany({
        where: {
          payload: { in: matchIds },
          date: { gte: today.toISOString() },
          type: Constants.CalendarEntry.MATCHDAY_USER,
        },
        data: { type: Constants.CalendarEntry.MATCHDAY_NPC },
      });
    }
  }

  // Push profile update to renderer
  const mainWindow = WindowManager.get(Constants.WindowIdentifier.Main, false)?.webContents;
  if (mainWindow) {
    mainWindow.send(Constants.IPCRoute.PROFILES_CURRENT, updatedProfile);
  }

  const locale = getLocale(profile);
  const team = player.team;
  const persona = team?.personas?.[0];

  if (persona && team) {
    await sendEmail(
      Sqrl.render(locale.templates.ContractExpiredPlayer.SUBJECT, {
        profile,
        player,
        team,
      }),
      Sqrl.render(locale.templates.ContractExpiredPlayer.CONTENT, {
        profile,
        player,
        team,
      }),
      persona,
      profile.date,
      true,
    );
  }

  return Promise.resolve();
}

/**
 * Engine loop handler.
 *
 * Stops the engine loop when the user has a
 * match to play and lets the renderer know.
 *
 * @param entry Engine loop input data.
 * @function
 */
export async function onMatchdayUser(entry: Calendar) {
  // Load profile (still useful for logging / future logic).
  const profile = await DatabaseClient.prisma.profile.findFirst();
  if (!profile) {
    return Promise.resolve();
  }

  // Skip if this match has already been played.
  const match = await DatabaseClient.prisma.match.findFirst({
    where: {
      id: Number(entry.payload),
    },
  });

  if (!match || match.status === Constants.MatchStatus.COMPLETED) {
    return Promise.resolve();
  }

  Engine.Runtime.Instance.log.info(
    'User matchday detected on %s (player career). Stopping engine loop...',
    format(entry.date, Constants.Settings.calendar.calendarDateFormat),
  );

  // Returning false tells the engine loop to halt and hand control to the renderer.
  return Promise.resolve(false);
}

export async function onTransferOfferExpiryCheck(entry: Calendar) {
  const prisma = DatabaseClient.prisma;

  const profile = await prisma.profile.findFirst(Eagers.profile);
  if (!profile) return Promise.resolve();

  const now = profile.date;
  const transferId = Number(entry.payload || 0);
  if (!transferId) return Promise.resolve();

  const transfer = await prisma.transfer.findFirst({
    where: { id: transferId },
    include: {
      ...Eagers.transfer.include,
      offers: { orderBy: { id: 'desc' } },
      from: { include: { personas: true } },
    },
  });
  if (!transfer) return Promise.resolve();

  // Only handle user-targeted pending transfers
  if (transfer.playerId !== profile.playerId) return Promise.resolve();
  if (transfer.status !== Constants.TransferStatus.PLAYER_PENDING) return Promise.resolve();

  const pendingOffer = transfer.offers.find(
    (o) => o.status === Constants.TransferStatus.PLAYER_PENDING,
  );
  if (!pendingOffer?.expiresAt) return Promise.resolve();

  const daysLeft = differenceInDays(pendingOffer.expiresAt, now);

  if (daysLeft > 1) return Promise.resolve();

  // Exactly 1 day before expiry: pause the calendar loop
  if (daysLeft === 1) {
    Engine.Runtime.Instance.stop();
    return Promise.resolve();
  }

  const isExtension = profile.teamId != null && transfer.from?.id === profile.teamId;

  await prisma.$transaction(async (tx) => {
    await tx.offer.updateMany({
      where: {
        id: pendingOffer.id,
        status: Constants.TransferStatus.PLAYER_PENDING,
      },
      data: { status: Constants.TransferStatus.EXPIRED },
    });

    await tx.transfer.updateMany({
      where: {
        id: transfer.id,
        status: Constants.TransferStatus.PLAYER_PENDING,
      },
      data: { status: Constants.TransferStatus.EXPIRED },
    });
  });

  const locale = getLocale(profile);

  const persona =
    transfer.from?.personas?.find(
      (p) => p.role === Constants.PersonaRole.MANAGER || p.role === Constants.PersonaRole.ASSISTANT,
    ) ?? transfer.from?.personas?.[0];

  if (persona) {
    const subject = isExtension
      ? Sqrl.render((locale.templates as any).ContractExtensionOffer.SUBJECT, { profile, transfer })
      : Sqrl.render(locale.templates.OfferIncoming.SUBJECT, { profile, transfer });

    const content = isExtension
      ? Sqrl.render((locale.templates as any).ContractExtensionExpired.CONTENT, {
          profile,
          transfer,
        })
      : Sqrl.render((locale.templates as any).OfferExpiredUser.CONTENT, { profile, transfer });

    await sendEmail(subject, content, persona, now, true);
  }

  WindowManager.sendAll(Constants.IPCRoute.TRANSFER_UPDATE);
  return Promise.resolve();
}

async function scheduleOfferPauseAndExpiry(transferId: number, expiresAt: Date) {
  const prisma = DatabaseClient.prisma;

  const type = Constants.CalendarEntry.TRANSFER_OFFER_EXPIRY_CHECK;
  const payload = String(transferId);

  const pauseAt = addDays(expiresAt, -1);

  await prisma.calendar.upsert({
    where: {
      date_type_payload: {
        date: pauseAt.toISOString(),
        type,
        payload,
      },
    },
    update: {},
    create: {
      date: pauseAt.toISOString(),
      type,
      payload,
    },
  });

  await prisma.calendar.upsert({
    where: {
      date_type_payload: {
        date: expiresAt.toISOString(),
        type,
        payload,
      },
    },
    update: {},
    create: {
      date: expiresAt.toISOString(),
      type,
      payload,
    },
  });
}
