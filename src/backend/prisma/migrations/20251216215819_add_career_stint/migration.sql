-- CreateTable
CREATE TABLE "CareerStint" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "playerId" INTEGER NOT NULL,
    "teamId" INTEGER,
    "tier" INTEGER,
    "startedAt" DATETIME NOT NULL,
    "endedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CareerStint_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CareerStint_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CareerStint_playerId_endedAt_idx" ON "CareerStint"("playerId", "endedAt");

-- CreateIndex
CREATE INDEX "CareerStint_teamId_startedAt_idx" ON "CareerStint"("teamId", "startedAt");

-- CreateIndex
CREATE INDEX "CareerStint_tier_startedAt_idx" ON "CareerStint"("tier", "startedAt");
