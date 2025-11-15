-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Player" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "gains" TEXT,
    "stats" TEXT,
    "cost" INTEGER DEFAULT 0,
    "wages" INTEGER DEFAULT 0,
    "weapon" TEXT,
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
INSERT INTO "new_Player" ("avatar", "cost", "countryId", "gains", "id", "name", "personality", "prestige", "role", "starter", "stats", "teamId", "transferListed", "wages", "weapon") SELECT "avatar", "cost", "countryId", "gains", "id", "name", "personality", "prestige", "role", "starter", "stats", "teamId", "transferListed", "wages", "weapon" FROM "Player";
DROP TABLE "Player";
ALTER TABLE "new_Player" RENAME TO "Player";
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
