/**
 * Seeds the database using Prisma Client and
 * Prisma's integrated seeding functionality.
 *
 * Extended functionality includes the ability
 * to dynamically call all seeder files
 * from the current working directory.
 *
 * @see https://www.prisma.io/docs/guides/database/seed-database
 * @module
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import log from "electron-log";
import { PrismaClient } from "@prisma/client";
import { program } from "commander";

/**
 * Initialize the local prisma client.
 */
const prisma = new PrismaClient();

/**
 * Configure known args for seeders.
 */
program
  .argument("[seeder]", "Run a specific seeder (optional)")
  .option("-t, --token <token>", "Pandascore Access Token")
  .option("--playerName <name>", "Player name")
  .option("--countryId <id>", "Country ID", (v) => parseInt(v, 10))
  .option("--role <role>", "Player role (RIFLER | AWPER | IGL)");

program.parse(process.argv);
const opts = program.opts();
const args = program.args;   
const [seederOverride] = args;

/**
 * Runs all of the known seeder functions sorted by creation date.
 */
async function main() {
  log.info("Seeder options: %O", opts);

  // collect seed files
  const seeders = fs
    .readdirSync(__dirname)
    .filter((seeder) =>
      fs.statSync(path.join(__dirname, seeder)).isFile() && seederOverride
        ? seeder === seederOverride
        : seeder !== path.basename(__filename)
    )
    .map((seeder) => ({
      name: seeder,
      func: require("./" + seeder),
    }));

  for (const seeder of seeders) {
    const name = seeder.name.replace(/(?:\d+)-(.+)\.ts/, "$1");

    // Skip unwanted seeders
    if (["game-versions", "game-maps", "game-map-pool"].includes(name)) {
      log.warn(`Skipping Seeder: ${name} (disabled for now)`);
      continue;
    }

    log.info("Running Seeder: %s", name);
    await seeder.func.default(prisma, opts);
  }

  return Promise.resolve();
}

/**
 * Self-invoking bootstrapping logic.
 */
(async () => {
  try {
    await main();
    await prisma.$disconnect();
  } catch (error) {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  }
})();
