-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Match" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "matchType" TEXT NOT NULL DEFAULT 'LEAGUE',
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" TEXT NOT NULL,
    "round" INTEGER,
    "status" INTEGER NOT NULL,
    "totalRounds" INTEGER,
    "faceitEloDelta" INTEGER,
    "faceitRating" REAL,
    "faceitIsWin" BOOLEAN,
    "faceitTeammates" TEXT,
    "faceitOpponents" TEXT,
    "competitionId" INTEGER,
    "profileId" INTEGER,
    CONSTRAINT "Match_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Match_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Match" ("competitionId", "date", "id", "payload", "round", "status", "totalRounds") SELECT "competitionId", "date", "id", "payload", "round", "status", "totalRounds" FROM "Match";
DROP TABLE "Match";
ALTER TABLE "new_Match" RENAME TO "Match";
CREATE TABLE "new_Profile" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "issues" TEXT,
    "season" INTEGER DEFAULT 0,
    "settings" TEXT,
    "trainedAt" DATETIME,
    "updatedAt" DATETIME DEFAULT CURRENT_TIMESTAMP,
    "faceitElo" INTEGER NOT NULL DEFAULT 1200,
    "faceitLevel" INTEGER NOT NULL DEFAULT 4,
    "careerMode" TEXT NOT NULL DEFAULT 'MANAGER',
    "teamId" INTEGER,
    "playerId" INTEGER,
    CONSTRAINT "Profile_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Profile_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Profile" ("careerMode", "date", "id", "issues", "name", "playerId", "season", "settings", "teamId", "trainedAt", "updatedAt") SELECT "careerMode", "date", "id", "issues", "name", "playerId", "season", "settings", "teamId", "trainedAt", "updatedAt" FROM "Profile";
DROP TABLE "Profile";
ALTER TABLE "new_Profile" RENAME TO "Profile";
CREATE UNIQUE INDEX "Profile_name_key" ON "Profile"("name");
CREATE UNIQUE INDEX "Profile_teamId_key" ON "Profile"("teamId");
CREATE UNIQUE INDEX "Profile_playerId_key" ON "Profile"("playerId");
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
    "elo" INTEGER NOT NULL DEFAULT 0,
    "userControlled" BOOLEAN NOT NULL DEFAULT false,
    "countryId" INTEGER NOT NULL,
    "teamId" INTEGER,
    CONSTRAINT "Player_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Player_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Player" ("avatar", "cost", "countryId", "id", "name", "personality", "prestige", "role", "starter", "teamId", "transferListed", "userControlled", "wages", "xp") SELECT "avatar", "cost", "countryId", "id", "name", "personality", "prestige", "role", "starter", "teamId", "transferListed", "userControlled", "wages", "xp" FROM "Player";
DROP TABLE "Player";
ALTER TABLE "new_Player" RENAME TO "Player";
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
