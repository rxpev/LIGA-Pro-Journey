CREATE TABLE "TeammateMood" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "profileId" INTEGER NOT NULL,
    "playerId" INTEGER NOT NULL,
    "teamId" INTEGER NOT NULL,
    "confidence" INTEGER NOT NULL DEFAULT 50,
    "roleSatisfaction" INTEGER NOT NULL DEFAULT 50,
    "trust" INTEGER NOT NULL DEFAULT 50,
    "lastStarter" BOOLEAN NOT NULL,
    "winStreak" INTEGER NOT NULL DEFAULT 0,
    "lossStreak" INTEGER NOT NULL DEFAULT 0,
    "lastMessageKey" TEXT,
    "lastMessageAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TeammateMood_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TeammateMood_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "TeammateMood_profileId_playerId_key" ON "TeammateMood"("profileId", "playerId");
CREATE INDEX "TeammateMood_profileId_teamId_idx" ON "TeammateMood"("profileId", "teamId");
