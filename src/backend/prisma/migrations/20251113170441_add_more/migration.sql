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
    "faceitLevel" INTEGER NOT NULL DEFAULT 4,
    "careerMode" TEXT NOT NULL DEFAULT 'MANAGER',
    "teamId" INTEGER,
    "playerId" INTEGER,
    CONSTRAINT "Profile_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Profile_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Profile" ("careerMode", "date", "faceitElo", "faceitLevel", "id", "issues", "name", "playerId", "season", "settings", "teamId", "trainedAt", "updatedAt") SELECT "careerMode", "date", "faceitElo", "faceitLevel", "id", "issues", "name", "playerId", "season", "settings", "teamId", "trainedAt", "updatedAt" FROM "Profile";
DROP TABLE "Profile";
ALTER TABLE "new_Profile" RENAME TO "Profile";
CREATE UNIQUE INDEX "Profile_name_key" ON "Profile"("name");
CREATE UNIQUE INDEX "Profile_teamId_key" ON "Profile"("teamId");
CREATE UNIQUE INDEX "Profile_playerId_key" ON "Profile"("playerId");
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
