-- RedefineTables
PRAGMA foreign_keys=OFF;
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
    "teamId" INTEGER,
    "playerId" INTEGER,
    CONSTRAINT "Profile_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Profile_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Profile" ("date", "id", "issues", "name", "playerId", "season", "settings", "teamId", "trainedAt", "updatedAt") SELECT "date", "id", "issues", "name", "playerId", "season", "settings", "teamId", "trainedAt", "updatedAt" FROM "Profile";
DROP TABLE "Profile";
ALTER TABLE "new_Profile" RENAME TO "Profile";
CREATE UNIQUE INDEX "Profile_name_key" ON "Profile"("name");
CREATE UNIQUE INDEX "Profile_teamId_key" ON "Profile"("teamId");
CREATE UNIQUE INDEX "Profile_playerId_key" ON "Profile"("playerId");
CREATE TABLE "new_Match" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "matchType" TEXT NOT NULL DEFAULT 'LEAGUE',
    "date" DATETIME NOT NULL,
    "payload" TEXT NOT NULL,
    "faceitEloDelta" INTEGER,
    "faceitRating" REAL,
    "faceitIsWin" BOOLEAN,
    "faceitTeammates" TEXT,
    "faceitOpponents" TEXT,
    "round" INTEGER,
    "status" INTEGER NOT NULL,
    "totalRounds" INTEGER,
    "competitionId" INTEGER NOT NULL,
    "profileId" INTEGER,
    CONSTRAINT "Match_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Match_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Match" ("competitionId", "date", "faceitEloDelta", "faceitIsWin", "faceitOpponents", "faceitRating", "faceitTeammates", "id", "matchType", "payload", "round", "status", "totalRounds") SELECT "competitionId", "date", "faceitEloDelta", "faceitIsWin", "faceitOpponents", "faceitRating", "faceitTeammates", "id", "matchType", "payload", "round", "status", "totalRounds" FROM "Match";
DROP TABLE "Match";
ALTER TABLE "new_Match" RENAME TO "Match";
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
