/**
 * Seeds the database with countries.
 *
 * @module
 */
import { PrismaClient } from '@prisma/client';
import { countries } from 'countries-list';

/** @type {CountryCode} */
type CountryCode = keyof typeof countries;

const mixedRegionCountries = [
  { code: 'eu', name: 'Europe', continentCode: 'EU' },
  { code: 'na', name: 'North America', continentCode: 'NA' },
  { code: 'sa', name: 'South America', continentCode: 'SA' },
  { code: 'as', name: 'Asia', continentCode: 'AS' },
  { code: 'other', name: 'Other', continentCode: '' },
] as const;

const continentOverrides: Partial<Record<CountryCode, string>> = {
  TR: 'EU',
};

/**
 * The main seeder.
 *
 * @param prisma The prisma client.
 * @function
 */
export default async function (prisma: PrismaClient) {
  // grab continents
  const continents = await prisma.continent.findMany();

  // build the transaction
  const transaction = [
    ...Object.keys(countries).map((code: CountryCode) =>
      prisma.country.upsert({
      where: { code },
      update: {
        code,
        name: countries[code].name,
        continent: {
          connect: {
            id: continents.find(
              (continent) => continent.code === (continentOverrides[code] || countries[code].continent),
            ).id,
          },
        },
      },
      create: {
        code,
        name: countries[code].name,
        continent: {
          connect: {
            id: continents.find(
              (continent) => continent.code === (continentOverrides[code] || countries[code].continent),
            ).id,
          },
        },
      },
        include: {
          continent: true,
        },
      }),
    ),
    ...mixedRegionCountries.map((country) =>
      prisma.country.upsert({
        where: { code: country.code },
        update: {
          code: country.code,
          name: country.name,
          continent: {
            connect: {
              id: continents.find((continent) => continent.code === country.continentCode)!.id,
            },
          },
        },
        create: {
          code: country.code,
          name: country.name,
          continent: {
            connect: {
              id: continents.find((continent) => continent.code === country.continentCode)!.id,
            },
          },
        },
        include: {
          continent: true,
        },
      }),
    ),
  ];

  // run the transaction
  return prisma.$transaction(transaction);
}
