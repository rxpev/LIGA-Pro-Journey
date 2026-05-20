CREATE TABLE "UserTeammateSeasonXp" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "profileId" INTEGER NOT NULL,
    "playerId" INTEGER NOT NULL,
    "season" INTEGER NOT NULL,
    "baselineXp" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "UserTeammateSeasonXp_profileId_playerId_season_key" ON "UserTeammateSeasonXp"("profileId", "playerId", "season");
CREATE INDEX "UserTeammateSeasonXp_profileId_season_idx" ON "UserTeammateSeasonXp"("profileId", "season");
