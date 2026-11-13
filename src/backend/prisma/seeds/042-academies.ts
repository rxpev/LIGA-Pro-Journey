import { PrismaClient } from '@prisma/client';

const ACADEMY_LINKS = [
  ['bestia-academy', 'bestia'],
  ['big-academy', 'big'],
  ['ence-academy', 'ence'],
  ['heroic-academy', 'heroic'],
  ['mibr-academy', 'mibr'],
  ['red-canids-academy', 'red-canids'],
  ['themongolz-academy', 'the-mongolz'],
  ['pain-academy', 'pain'],
  ['aurora-young-blud', 'aurora'],
  ['g2-ares', 'g2-esports'],
  ['mouz-nxt', 'mouz'],
] as const;

export default async function (prisma: PrismaClient) {
  for (const [academySlug, parentSlug] of ACADEMY_LINKS) {
    const parent = await prisma.team.findUnique({
      where: { slug: parentSlug },
      select: { id: true },
    });
    const academy = await prisma.team.findUnique({
      where: { slug: academySlug },
      select: { id: true },
    });
    if (!parent || !academy) continue;
    await prisma.team.update({
      where: { id: academy.id },
      data: { parentTeamId: parent.id },
    });
  }
}
