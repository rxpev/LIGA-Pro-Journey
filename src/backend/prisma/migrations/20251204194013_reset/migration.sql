-- AlterTable
ALTER TABLE "Tier" ADD COLUMN "lan" BOOLEAN DEFAULT false;

-- CreateTable
CREATE TABLE "Achievement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "award" INTEGER DEFAULT 0,
    "unlocked" BOOLEAN DEFAULT false
);
