import { PrismaClient } from "@prisma/client";
import { Constants } from "@liga/shared";

export default async function seedProfile(prisma: PrismaClient) {
  const existing = await prisma.profile.findFirst();

  if (existing) {
    await prisma.profile.update({
      where: { id: existing.id },
      data: {
        name: existing.name || "Player Career",
        settings: existing.settings || JSON.stringify(Constants.Settings),
        faceitElo: existing.faceitElo ?? 1200,
      },
    });
    return;
  }

  await prisma.profile.create({
    data: {
      name: "Player Career",
      date: new Date(),
      settings: JSON.stringify(Constants.Settings),
      faceitElo: 1200,
      playerId: null,
    },
  });
}
