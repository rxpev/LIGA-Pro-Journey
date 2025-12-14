/**
 * Default map pools per game.
 *
 * @module
 */
import { PrismaClient } from '@prisma/client';
import { flatten } from 'lodash';
import { Constants } from '@liga/shared';

/** @constant */
const data: Record<Constants.Game, Array<string>> = {
  [Constants.Game.CSGO]: [
    // active
    'de_ancient',
    'de_dust2',
    'de_inferno',
    'de_mirage',
    'de_nuke',
    'de_overpass',
    'de_anubis',

    // reserve
    'de_cache',
    'de_train',
  ],
};

/**
 * The main seeder.
 *
 * @param prisma The prisma client.
 * @function
 */
export default async function (prisma: PrismaClient) {
  const gameMaps = await prisma.gameMap.findMany();
  const gameVersions = await prisma.gameVersion.findMany();
  const transaction = Object.keys(data).map((gameVersionSlug: Constants.Game) =>
    data[gameVersionSlug].map((gameMapName, gameMapPosition) =>
      prisma.mapPool.create({
        data: {
          gameMapId: gameMaps.find((gameMap) => gameMap.name === gameMapName).id,
          gameVersionId: gameVersions.find((gameVersion) => gameVersion.slug === gameVersionSlug)
            .id,
          position: gameMapPosition < 7 ? gameMapPosition : null,
        },
      }),
    ),
  );

  return prisma.$transaction(flatten(transaction));
}
