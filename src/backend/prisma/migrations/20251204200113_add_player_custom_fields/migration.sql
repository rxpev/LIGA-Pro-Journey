/*
  Warnings:

  - You are about to drop the column `gains` on the `Player` table. All the data in the column will be lost.
  - You are about to drop the column `stats` on the `Player` table. All the data in the column will be lost.
  - You are about to drop the column `weapon` on the `Player` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Player" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "personality" TEXT,
    "role" TEXT,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "elo" INTEGER NOT NULL DEFAULT 0,
    "cost" INTEGER DEFAULT 0,
    "wages" INTEGER DEFAULT 0,
    "starter" BOOLEAN NOT NULL DEFAULT false,
    "transferListed" BOOLEAN NOT NULL DEFAULT false,
    "avatar" TEXT,
    "prestige" INTEGER,
    "userControlled" BOOLEAN NOT NULL DEFAULT false,
    "countryId" INTEGER NOT NULL,
    "teamId" INTEGER,
    CONSTRAINT "Player_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Player_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Player" ("avatar", "cost", "countryId", "id", "name", "prestige", "starter", "teamId", "transferListed", "wages") SELECT "avatar", "cost", "countryId", "id", "name", "prestige", "starter", "teamId", "transferListed", "wages" FROM "Player";
DROP TABLE "Player";
ALTER TABLE "new_Player" RENAME TO "Player";
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
