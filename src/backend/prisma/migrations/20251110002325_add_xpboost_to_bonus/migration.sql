/*
  Warnings:

  - You are about to drop the column `active` on the `Bonus` table. All the data in the column will be lost.
  - You are about to drop the column `stats` on the `Bonus` table. All the data in the column will be lost.
  - You are about to drop the column `gains` on the `Player` table. All the data in the column will be lost.
  - You are about to drop the column `stats` on the `Player` table. All the data in the column will be lost.
  - You are about to drop the column `weapon` on the `Player` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Bonus" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "type" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "cost" INTEGER,
    "xpBoost" INTEGER DEFAULT 0,
    "profileId" INTEGER,
    CONSTRAINT "Bonus_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Bonus" ("cost", "id", "name", "profileId", "type") SELECT "cost", "id", "name", "profileId", "type" FROM "Bonus";
DROP TABLE "Bonus";
ALTER TABLE "new_Bonus" RENAME TO "Bonus";
CREATE UNIQUE INDEX "Bonus_name_key" ON "Bonus"("name");
CREATE TABLE "new_Player" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "cost" INTEGER DEFAULT 0,
    "wages" INTEGER DEFAULT 0,
    "starter" BOOLEAN NOT NULL DEFAULT false,
    "transferListed" BOOLEAN NOT NULL DEFAULT false,
    "avatar" TEXT,
    "prestige" INTEGER,
    "personality" TEXT,
    "role" TEXT,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "countryId" INTEGER NOT NULL,
    "teamId" INTEGER,
    CONSTRAINT "Player_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Player_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Player" ("avatar", "cost", "countryId", "id", "name", "personality", "prestige", "role", "starter", "teamId", "transferListed", "wages", "xp") SELECT "avatar", "cost", "countryId", "id", "name", "personality", "prestige", "role", "starter", "teamId", "transferListed", "wages", "xp" FROM "Player";
DROP TABLE "Player";
ALTER TABLE "new_Player" RENAME TO "Player";
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
