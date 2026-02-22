/**
 * Contract length generator.
 *
 * @module
 */
import log from 'electron-log';
import { Command } from 'commander';
import { addMonths } from 'date-fns';
import { PrismaClient } from '@prisma/client';
import { Constants, TierSlug } from '@liga/shared';

type ContractRange = {
  minMonths: number;
  maxMonths: number;
  label: string;
};

const prisma = new PrismaClient();

const CONTRACT_RANGES_BY_TIER: Partial<Record<TierSlug, ContractRange>> = {
  [TierSlug.LEAGUE_PRO]: { minMonths: 24, maxMonths: 60, label: 'EPL' },
  [TierSlug.LEAGUE_ADVANCED]: { minMonths: 12, maxMonths: 48, label: 'Advanced' },
  [TierSlug.LEAGUE_MAIN]: { minMonths: 12, maxMonths: 36, label: 'Main' },
  [TierSlug.LEAGUE_INTERMEDIATE]: { minMonths: 12, maxMonths: 24, label: 'Intermediate' },
  [TierSlug.LEAGUE_OPEN]: { minMonths: 6, maxMonths: 24, label: 'Open' },
} as const;

function toTierSlug(teamTier: number | null | undefined): TierSlug | null {
  if (teamTier == null) return null;
  if (teamTier < 0 || teamTier >= Constants.Prestige.length) return null;
  return Constants.Prestige[teamTier] as TierSlug;
}

function randomMonthCount(minMonths: number, maxMonths: number): number {
  return Math.floor(Math.random() * (maxMonths - minMonths + 1)) + minMonths;
}

/**
 * Generates contractEnd values for all players.
 */
export async function generateContracts() {
  const profile = await prisma.profile.findFirst({
    orderBy: { id: 'asc' },
    select: { date: true },
  });
  const baseDate = profile?.date ?? new Date();

  const players = await prisma.player.findMany({
    select: {
      id: true,
      prestige: true,
      team: {
        select: {
          tier: true,
        },
      },
    },
  });

  log.info('Generating contract lengths for %s players...', players.length);

  const appliedByDivision: Record<string, number> = {
    EPL: 0,
    Advanced: 0,
    Main: 0,
    Intermediate: 0,
    Open: 0,
  };

  const updates = players.map((player) => {
    const teamTierSlug = toTierSlug(player.team?.tier);
    const fallbackTierSlug = toTierSlug(player.prestige);
    const tierSlug = teamTierSlug ?? fallbackTierSlug ?? TierSlug.LEAGUE_OPEN;
    const range = CONTRACT_RANGES_BY_TIER[tierSlug] ?? CONTRACT_RANGES_BY_TIER[TierSlug.LEAGUE_OPEN];

    const months = randomMonthCount(range.minMonths, range.maxMonths);
    const contractEnd = addMonths(baseDate, months);
    appliedByDivision[range.label] += 1;

    return prisma.player.update({
      where: { id: player.id },
      data: { contractEnd },
    });
  });

  await prisma.$transaction(updates);

  log.info('Contract generation complete. Base date: %s', baseDate.toISOString());
  Object.entries(appliedByDivision).forEach(([division, count]) => {
    log.info('- %s: %s players', division, count);
  });
}

export default {
  register: (program: Command) => {
    program
      .command('contracts')
      .description('Generates contractEnd dates for all players based on division.')
      .action(generateContracts);
  },
};

