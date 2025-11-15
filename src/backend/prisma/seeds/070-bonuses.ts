/**
 * XP Bonuses Seeder
 * Reworked for XP-only system.
 */
import { Prisma, PrismaClient } from '@prisma/client';
import { Constants } from '@liga/shared';

export const data: Array<Prisma.BonusCreateInput> = [
  {
    type: Constants.BonusType.SERVER,
    name: 'Shared 1',
    xpBoost: 1, // new numeric XP multiplier
  },
  {
    type: Constants.BonusType.SERVER,
    name: 'Shared 2',
    xpBoost: 2,
  },
  {
    type: Constants.BonusType.SERVER,
    name: 'Private 1',
    xpBoost: 4,
    cost: 12000,
  },
  {
    type: Constants.BonusType.SERVER,
    name: 'Private 2',
    xpBoost: 6,
    cost: 12000,
  },
  {
    type: Constants.BonusType.SERVER,
    name: 'Premium 1',
    xpBoost: 8,
    cost: 24000,
  },
  {
    type: Constants.BonusType.FACILITY,
    name: 'Esports Arena',
    xpBoost: 10,
    cost: 750000,
  },
];

export default async function (prisma: PrismaClient) {
  const transaction = data.map((bonus) =>
    prisma.bonus.upsert({
      where: { name: bonus.name },
      update: {
        type: bonus.type,
        name: bonus.name,
        xpBoost: bonus.xpBoost,
        cost: bonus.cost,
      },
      create: {
        type: bonus.type,
        name: bonus.name,
        xpBoost: bonus.xpBoost,
        cost: bonus.cost,
      },
    }),
  );

  return prisma.$transaction(transaction);
}
