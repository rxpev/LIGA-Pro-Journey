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
    "competitionId" INTEGER NOT NULL,
    CONSTRAINT "Match_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Match" ("competitionId", "date", "id", "payload", "round", "status", "totalRounds") SELECT "competitionId", "date", "id", "payload", "round", "status", "totalRounds" FROM "Match";
DROP TABLE "Match";
ALTER TABLE "new_Match" RENAME TO "Match";
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
