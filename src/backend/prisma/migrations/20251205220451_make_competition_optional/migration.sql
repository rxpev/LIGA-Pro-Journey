-- RedefineTables
PRAGMA foreign_keys=OFF;
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
    "competitionId" INTEGER,
    "profileId" INTEGER,
    CONSTRAINT "Match_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Match_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Match" ("competitionId", "date", "faceitEloDelta", "faceitIsWin", "faceitOpponents", "faceitRating", "faceitTeammates", "id", "matchType", "payload", "profileId", "round", "status", "totalRounds") SELECT "competitionId", "date", "faceitEloDelta", "faceitIsWin", "faceitOpponents", "faceitRating", "faceitTeammates", "id", "matchType", "payload", "profileId", "round", "status", "totalRounds" FROM "Match";
DROP TABLE "Match";
ALTER TABLE "new_Match" RENAME TO "Match";
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
