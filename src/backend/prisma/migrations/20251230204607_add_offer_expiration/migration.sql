-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Offer" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "status" INTEGER NOT NULL,
    "cost" INTEGER DEFAULT 0,
    "wages" INTEGER DEFAULT 0,
    "contractYears" INTEGER DEFAULT 1,
    "expiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "transferId" INTEGER NOT NULL,
    CONSTRAINT "Offer_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "Transfer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Offer" ("contractYears", "cost", "id", "status", "transferId", "wages") SELECT "contractYears", "cost", "id", "status", "transferId", "wages" FROM "Offer";
DROP TABLE "Offer";
ALTER TABLE "new_Offer" RENAME TO "Offer";
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
