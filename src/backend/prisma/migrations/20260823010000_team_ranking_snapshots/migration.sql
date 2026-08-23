CREATE TABLE IF NOT EXISTS "TeamRankingSnapshot" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "date" DATETIME NOT NULL,
  "rank" INTEGER NOT NULL,
  "teamId" INTEGER NOT NULL,
  CONSTRAINT "TeamRankingSnapshot_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "TeamRankingSnapshot_teamId_date_key" ON "TeamRankingSnapshot"("teamId", "date");
CREATE INDEX IF NOT EXISTS "TeamRankingSnapshot_date_idx" ON "TeamRankingSnapshot"("date");
