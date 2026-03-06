import type { PrismaClient, Player, Prisma } from "@prisma/client";
import { shuffle } from "lodash";
import { levelFromElo } from "@liga/backend/lib/levels";

type BotCandidate = Player & {
  country: { code: string; continent: { federationId: number } };
  team: null | { countryId: number; country: { continent: { federationId: number } } };
};

export interface MatchPlayer {
  id: number;
  name: string;
  xp: number;
  elo: number;
  level: number;
  role: string | null;
  personality: string | null;
  userControlled: boolean;
  countryId: number;
  teamId: number | null;
  queueId?: string;
  queueType?: "COUNTRY" | "TEAM" | "BOTH";
  teamCountryId?: number | null;
}

export interface MatchRoom {
  matchId: string;
  teamA: MatchPlayer[];
  teamB: MatchPlayer[];
  expectedWinA: number;
  expectedWinB: number;
  eloGain: number;
  eloLoss: number;
}

export class FaceitMatchmaker {
  static BASE_ELO_RANGE = 250;
  static MAX_ELO_RANGE = 700;
  static ELO_RANGE_STEP = 100;

  private static async getBotsNearElo(
    prisma: PrismaClient,
    targetElo: number,
    needed: number,
    federationId: number
  ): Promise<BotCandidate[]> {

    const regionalWhere: Prisma.PlayerWhereInput = {
      OR: [
        {
          team: {
            country: {
              continent: {
                federationId,
              },
            },
          },
        },
        {
          teamId: null,
          country: {
            continent: {
              federationId,
            },
          },
        },
      ],
    };

    const [lowestEloBot, highestEloBot] = await Promise.all([
      prisma.player.findFirst({
        where: {
          userControlled: false,
          ...regionalWhere,
        },
        select: { elo: true },
        orderBy: { elo: "asc" },
      }),
      prisma.player.findFirst({
        where: {
          userControlled: false,
          ...regionalWhere,
        },
        select: { elo: true },
        orderBy: { elo: "desc" },
      }),
    ]);

    if (!lowestEloBot || !highestEloBot) return [];

    const maxNeededRange = Math.max(
      Math.abs(targetElo - lowestEloBot.elo),
      Math.abs(highestEloBot.elo - targetElo)
    );

    let range = this.BASE_ELO_RANGE;
    let bots: BotCandidate[] = [];

    while (bots.length < needed) {
      const candidates = await prisma.player.findMany({
        where: {
          userControlled: false,
          ...regionalWhere,
          elo: {
            gte: targetElo - range,
            lte: targetElo + range,
          },
        },
        include: {
          country: {
            include: {
              continent: true,
            },
          },
          team: {
            include: {
              country: {
                include: {
                  continent: true,
                },
              },
            },
          },
        },
        take: needed * 30,
      });

      bots = [...candidates].sort(
        (a, b) => Math.abs(a.elo - targetElo) - Math.abs(b.elo - targetElo)
      );

      if (bots.length >= needed) break;
      if (range >= maxNeededRange) break;

      const nextRange =
        range < this.MAX_ELO_RANGE
          ? Math.min(range + this.ELO_RANGE_STEP, this.MAX_ELO_RANGE)
          : range + this.ELO_RANGE_STEP;

      range = Math.min(nextRange, maxNeededRange);
    }

    return bots;
  }

  private static expectedWin(eloA: number, eloB: number) {
    return 1 / (1 + Math.pow(10, (eloB - eloA) / 400));
  }

  private static calcEloAdjustment(expWin: number, maxPartyEloDelta?: number) {
    if (Number.isFinite(maxPartyEloDelta) && (maxPartyEloDelta as number) >= 1500) {
      return { gain: 15, loss: 35 };
    }

    let gain = 25;
    let loss = 25;

    if (expWin > 0.8) {
      gain = 10;
      loss = 40;
    } else if (expWin > 0.7) {
      gain = 15;
      loss = 35;
    } else if (expWin > 0.6) {
      gain = 20;
      loss = 30;
    } else if (expWin < 0.4) {
      gain = 30;
      loss = 20;
    }

    return { gain, loss };
  }

  private static annotateStacks(team: MatchPlayer[], teamTag: "A" | "B") {
    const queueByPlayer = new Map<number, { id: string; type: "COUNTRY" | "TEAM" | "BOTH" }>();
    const used = new Set<number>();

    const findGroups = (
      keyFn: (p: MatchPlayer) => string | null,
      type: "COUNTRY" | "TEAM" | "BOTH"
    ) => {
      const grouped = new Map<string, MatchPlayer[]>();

      for (const player of team) {
        if (used.has(player.id)) continue;
        if (player.userControlled) continue;
        const key = keyFn(player);
        if (!key) continue;
        const bucket = grouped.get(key) ?? [];
        bucket.push(player);
        grouped.set(key, bucket);
      }

      const groups = [...grouped.values()]
        .filter((group) => group.length >= 2)
        .sort((a, b) => b.length - a.length)
        .map((group) => group.slice(0, 5));

      return { groups, type };
    };

    const priority = [
      findGroups((p) => (p.teamId ? `${p.teamCountryId ?? p.countryId}:${p.teamId}` : null), "BOTH"),
      findGroups((p) => (p.teamId ? `${p.teamId}` : null), "TEAM"),
      findGroups((p) => `${p.teamCountryId ?? p.countryId}`, "COUNTRY"),
    ];

    let queueIndex = 1;

    for (const entry of priority) {
      for (const group of entry.groups) {
        const available = group.filter((p) => !used.has(p.id));
        if (available.length < 2) continue;

        const queueId = `${teamTag}-Q${queueIndex++}`;
        for (const player of available) {
          used.add(player.id);
          queueByPlayer.set(player.id, { id: queueId, type: entry.type });
        }
      }
    }

    return team.map((player) => {
      const queue = queueByPlayer.get(player.id);
      if (!queue) return player;
      return {
        ...player,
        queueId: queue.id,
        queueType: queue.type,
      };
    });
  }

  static async createMatchRoom(
    prisma: any,
    user: { id: number; queueElo?: number; maxPartyEloDelta?: number }
  ): Promise<MatchRoom> {

    // -------------------------------------------------
    // 1. Load cached profile
    // -------------------------------------------------
    const baseProfile = await prisma.profile.findFirst();
    if (!baseProfile) throw new Error("Profile not found");

    // -------------------------------------------------
    // 2. Load full uncached player
    // -------------------------------------------------
    const fullPlayer = await prisma.player.findFirst({
      where: { id: baseProfile.playerId },
      include: {
        country: {
          include: {
            continent: {
              include: {
                federation: true,
              },
            },
          },
        },
        team: {
          include: {
            country: {
              include: {
                continent: {
                  include: {
                    federation: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!fullPlayer) throw new Error("Player not found");

    const userDb = fullPlayer;
    const userElo = baseProfile.faceitElo;
    const queueElo = Number.isFinite(user.queueElo) ? Math.round(user.queueElo as number) : userElo;
    const federationId =
      userDb.team?.country?.continent?.federation?.id ??
      userDb.country.continent.federation.id;

    // -------------------------------------------------
    // 3. Get bots in region & Elo range
    // -------------------------------------------------
    const bots = await this.getBotsNearElo(prisma, queueElo, 20, federationId);

    if (bots.length < 10) {
      throw new Error("FACEIT_NOT_ENOUGH_SIMILAR_SKILL_PLAYERS");
    }

    // -------------------------------------------------
    // 4. Split snipers vs riflers
    // -------------------------------------------------
    const snipers = bots.filter((b) => b.role === "SNIPER");
    const riflers = bots.filter((b) => b.role !== "SNIPER");

    // -------------------------------------------------
    // 5. Determine sniper requirements based on player role
    // -------------------------------------------------
    const userRole = userDb.role;
    let snipersForUserTeam = 0;
    let snipersForEnemyTeam = 1;

    if (userRole === "AWPER") {
      snipersForUserTeam = 0;
      snipersForEnemyTeam = 1;
    } else if (userRole === "IGL" || userRole === "RIFLER") {
      snipersForUserTeam = 1;
      snipersForEnemyTeam = 1;
    }

    const totalSnipersNeeded = snipersForUserTeam + snipersForEnemyTeam;

    if (snipers.length < totalSnipersNeeded) {
      throw new Error(
        `Not enough snipers in your region (needed ${totalSnipersNeeded}, found ${snipers.length})`
      );
    }

    // -------------------------------------------------
    // 6. Pick EXACT snipers needed
    // -------------------------------------------------
    const selectedSnipers = shuffle(snipers).slice(0, totalSnipersNeeded);

    const userTeamSnipers = selectedSnipers.slice(0, snipersForUserTeam);
    const enemyTeamSnipers = selectedSnipers.slice(snipersForUserTeam);

    // -------------------------------------------------
    // 7. Fill remaining slots with riflers
    // -------------------------------------------------
    const remainingUserSlots = 4 - userTeamSnipers.length;
    const remainingEnemySlots = 5 - enemyTeamSnipers.length;

    const shuffledRiflers = shuffle(riflers);

    const userTeamRiflers = shuffledRiflers.slice(0, remainingUserSlots);
    const enemyTeamRiflers = shuffledRiflers.slice(
      remainingUserSlots,
      remainingUserSlots + remainingEnemySlots
    );

    // -------------------------------------------------
    // 8. Build final teams
    // -------------------------------------------------

    // Convert all bot objects into MatchPlayer
    const convert = (b: BotCandidate): MatchPlayer => ({
      id: b.id,
      name: b.name,
      xp: b.xp,
      elo: b.elo,
      level: levelFromElo(b.elo),
      role: b.role,
      personality: b.personality,
      userControlled: false,
      countryId: b.countryId,
      teamId: b.teamId,
      teamCountryId: b.team?.countryId ?? null,
    });

    const userPlayer: MatchPlayer = {
      id: userDb.id,
      name: userDb.name,
      xp: userDb.xp,
      elo: userElo,
      level: levelFromElo(userElo),
      role: userDb.role,
      personality: userDb.personality,
      userControlled: true,
      countryId: userDb.countryId,
      teamId: userDb.teamId,
      teamCountryId: userDb.team?.countryId ?? null,
    };

    const rawTeamA: MatchPlayer[] = [
      userPlayer,
      ...userTeamSnipers.map(convert),
      ...userTeamRiflers.map(convert),
    ];

    const rawTeamB: MatchPlayer[] = [
      ...enemyTeamSnipers.map(convert),
      ...enemyTeamRiflers.map(convert),
    ];

    const teamA = this.annotateStacks(rawTeamA, "A");
    const teamB = this.annotateStacks(rawTeamB, "B");

    // -------------------------------------------------
    // 9. Elo math
    // -------------------------------------------------
    const avgA = teamA.reduce((s, p) => s + p.elo, 0) / teamA.length;
    const avgB = teamB.reduce((s, p) => s + p.elo, 0) / teamB.length;

    const expectedA = this.expectedWin(avgA, avgB);
    const expectedB = 1 - expectedA;

    const userIsTeamA = true;

    const userExpected = userIsTeamA ? expectedA : expectedB;

    const { gain, loss } = this.calcEloAdjustment(userExpected, user.maxPartyEloDelta);

    return {
      matchId: `${Date.now()}`,
      teamA,
      teamB,
      expectedWinA: expectedA,
      expectedWinB: expectedB,

      eloGain: gain,
      eloLoss: loss,
    };
  }
}
