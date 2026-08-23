/**
 * Seeds the database with countries.
 *
 * @module
 */
import { PrismaClient } from '@prisma/client';
import { countries } from 'countries-list';

/** @type {CountryCode} */
type CountryCode = keyof typeof countries;

/**
 * Non-player territories which are not meaningful Counter-Strike nationalities.
 */
const excludedCountryCodes = new Set<CountryCode>([
  'AI',
  'AQ',
  'AS',
  'AW',
  'AX',
  'BL',
  'BM',
  'BQ',
  'BV',
  'CC',
  'CW',
  'CX',
  'FK',
  'FO',
  'GF',
  'GG',
  'GI',
  'GL',
  'GP',
  'GS',
  'GU',
  'HM',
  'IM',
  'JE',
  'KY',
  'MF',
  'MO',
  'MP',
  'MQ',
  'MS',
  'NC',
  'NF',
  'PF',
  'PM',
  'PN',
  'RE',
  'SH',
  'SJ',
  'SX',
  'TC',
  'TF',
  'TK',
  'UM',
  'VG',
  'VI',
  'WF',
  'YT',
]);

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
    ...Object.keys(countries)
      .filter((code): code is CountryCode => !excludedCountryCodes.has(code as CountryCode))
      .map((code) =>
        prisma.country.upsert({
          where: { code },
          update: {
            code,
            name: countries[code].name,
            continent: {
              connect: {
                id: continents.find(
                  (continent) =>
                    continent.code === (continentOverrides[code] || countries[code].continent),
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
                  (continent) =>
                    continent.code === (continentOverrides[code] || countries[code].continent),
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
