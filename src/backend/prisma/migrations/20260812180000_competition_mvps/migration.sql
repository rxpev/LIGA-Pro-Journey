CREATE TABLE IF NOT EXISTS "CompetitionMvp" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "competitionId" INTEGER NOT NULL,
  "playerId" INTEGER NOT NULL,
  "teamId" INTEGER,
  "score" REAL NOT NULL,
  "rating" REAL NOT NULL,
  "maps" INTEGER NOT NULL,
  "placement" INTEGER NOT NULL,
  "opponentElo" REAL,
  "formulaVersion" INTEGER NOT NULL DEFAULT 2,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CompetitionMvp_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CompetitionMvp_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CompetitionMvp_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "CompetitionMvp_competitionId_key" ON "CompetitionMvp"("competitionId");
CREATE INDEX IF NOT EXISTS "CompetitionMvp_playerId_idx" ON "CompetitionMvp"("playerId");
CREATE INDEX IF NOT EXISTS "CompetitionMvp_teamId_idx" ON "CompetitionMvp"("teamId");
