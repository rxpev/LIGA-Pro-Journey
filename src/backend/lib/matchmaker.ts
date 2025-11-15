import type { PrismaClient, Player } from "@prisma/client";
import { shuffle } from "lodash";
import { levelFromElo } from "@liga/backend/lib/levels";

export interface MatchPlayer {
  id: number;
  name: string;
  elo: number;
  level: number;
  role: string | null;
  personality: string | null;
  userControlled: boolean;
  countryId: number;
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
  static BASE_ELO_RANGE = 300;

  private static async getBotsNearElo(
    prisma: PrismaClient,
    targetElo: number,
    needed: number,
    federationId: number
  ): Promise<(Player & { country: { code: string } })[]> {

    let range = this.BASE_ELO_RANGE;
    let bots: (Player & { country: { code: string } })[] = [];

    while (bots.length < needed && range <= 2000) {
      bots = await prisma.player.findMany({
        where: {
          userControlled: false,
          elo: {
            gte: targetElo - range,
            lte: targetElo + range,
          },
          country: {
            continent: {
              federationId,
            },
          },
        },
        include: { country: true },
        take: needed * 5,
      });

      if (bots.length >= needed) break;
      range += 200;
    }

    return bots;
  }

  private static expectedWin(eloA: number, eloB: number) {
    return 1 / (1 + Math.pow(10, (eloB - eloA) / 400));
  }

  private static calcEloAdjustment(expWin: number) {
    let gain = 25;
    let loss = 25;

    if (expWin > 0.6) {
      gain = 20;
      loss = 30;
    } else if (expWin < 0.4) {
      gain = 30;
      loss = 20;
    }

    return { gain, loss };
  }

  static async createMatchRoom(
    prisma: any,
    user: { id: number }
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
      },
    });

    if (!fullPlayer) throw new Error("Player not found");

    const userDb = fullPlayer;
    const userElo = baseProfile.faceitElo;
    const federationId = userDb.country.continent.federation.id;

    // -------------------------------------------------
    // 3. Get bots in region & Elo range
    // -------------------------------------------------
    const bots = await this.getBotsNearElo(prisma, userElo, 20, federationId);

    if (bots.length < 10) {
      throw new Error("Not enough regional players to create a match");
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
    const convert = (b: Player): MatchPlayer => ({
      id: b.id,
      name: b.name,
      elo: b.elo,
      level: levelFromElo(b.elo),
      role: b.role,
      personality: b.personality,
      userControlled: false,
      countryId: b.countryId,
    });

    const userPlayer: MatchPlayer = {
      id: userDb.id,
      name: userDb.name,
      elo: userElo,
      level: levelFromElo(userElo),
      role: userDb.role,
      personality: userDb.personality,
      userControlled: true,
      countryId: userDb.countryId,
    };

    const teamA: MatchPlayer[] = [
      userPlayer,
      ...userTeamSnipers.map(convert),
      ...userTeamRiflers.map(convert),
    ];

    const teamB: MatchPlayer[] = [
      ...enemyTeamSnipers.map(convert),
      ...enemyTeamRiflers.map(convert),
    ];

    // -------------------------------------------------
    // 9. Elo math
    // -------------------------------------------------
    const avgA = teamA.reduce((s, p) => s + p.elo, 0) / teamA.length;
    const avgB = teamB.reduce((s, p) => s + p.elo, 0) / teamB.length;

    const expectedA = this.expectedWin(avgA, avgB);
    const { gain, loss } = this.calcEloAdjustment(expectedA);

    return {
      matchId: `${Date.now()}`,
      teamA,
      teamB,
      expectedWinA: expectedA,
      expectedWinB: 1 - expectedA,
      eloGain: gain,
      eloLoss: loss,
    };
  }
}
