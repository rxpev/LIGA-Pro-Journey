/**
 * Creates or upgrades the default Player Career profile.
 *
 * @module
 */
import { PrismaClient } from '@prisma/client';
import { Constants } from '@liga/shared';

export default async function seedProfile(prisma: PrismaClient) {
  // Look for any existing profile (legacy "Default" or already migrated)
  const existing = await prisma.profile.findFirst();

  if (existing) {
    // If the existing profile already has a player attached, assume it is OK
    if (existing.playerId) {
      return;
    }

    // Otherwise, we're upgrading an old "Default" profile to the new format
    const player = await prisma.player.create({
      data: {
        name: 'Player',
        countryId: 840,
        role: 'RIFLER',
        xp: 0,
        prestige: 0,
        userControlled: true,
      },
    });

    await prisma.profile.update({
      where: { id: existing.id },
      data: {
        // keep the old name if you like, or overwrite:
        name: existing.name || 'Player Career',
        // if date type is DateTime, use new Date(); if it's numeric, adjust accordingly
        date: new Date(),
        settings: existing.settings || JSON.stringify(Constants.Settings),
        faceitElo: existing.faceitElo ?? 1200,
        player: { connect: { id: player.id } },
      },
    });

    return;
  }

  // No profile exists at all → create the initial one
  const player = await prisma.player.create({
    data: {
      name: 'Player',
      countryId: 840,
      role: 'RIFLER',
      xp: 0,
      prestige: 0,
      userControlled: true,
    },
  });

  await prisma.profile.create({
    data: {
      name: 'Player Career',
      date: new Date(),
      settings: JSON.stringify(Constants.Settings),
      faceitElo: 1200,
      player: { connect: { id: player.id } },
    },
  });
}
