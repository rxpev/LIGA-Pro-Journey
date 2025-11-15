-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Bonus" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "type" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "cost" INTEGER,
    "xpBoost" INTEGER DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "profileId" INTEGER,
    CONSTRAINT "Bonus_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Bonus" ("cost", "id", "name", "profileId", "type", "xpBoost") SELECT "cost", "id", "name", "profileId", "type", "xpBoost" FROM "Bonus";
DROP TABLE "Bonus";
ALTER TABLE "new_Bonus" RENAME TO "Bonus";
CREATE UNIQUE INDEX "Bonus_name_key" ON "Bonus"("name");
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
