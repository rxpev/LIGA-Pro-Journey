/*
  Warnings:

  - You are about to drop the `Sponsor` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Sponsorship` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `SponsorshipOffer` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `_SponsorToTeam` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Sponsor";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Sponsorship";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "SponsorshipOffer";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "_SponsorToTeam";
PRAGMA foreign_keys=on;
