ALTER TABLE "Team" ADD COLUMN "parentTeamId" INTEGER REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Team_parentTeamId_idx" ON "Team"("parentTeamId");

ALTER TABLE "Offer" ADD COLUMN "academyPromotionClause" TEXT;
ALTER TABLE "Offer" ADD COLUMN "academyPromotionTarget" REAL;
ALTER TABLE "Offer" ADD COLUMN "academyPromotionPlayerId" INTEGER;

ALTER TABLE "Player" ADD COLUMN "academyPromotionClause" TEXT;
ALTER TABLE "Player" ADD COLUMN "academyPromotionTarget" REAL;
ALTER TABLE "Player" ADD COLUMN "academyPromotionPlayerId" INTEGER;

-- Only link academies whose parent club exists in the database. FORZE Reload,
-- VP.Prodigy and vatrushka academy intentionally remain independent teams.
UPDATE "Team" SET "parentTeamId" = (SELECT "id" FROM "Team" WHERE "slug" = 'bestia') WHERE "slug" = 'bestia-academy';
UPDATE "Team" SET "parentTeamId" = (SELECT "id" FROM "Team" WHERE "slug" = 'big') WHERE "slug" = 'big-academy';
UPDATE "Team" SET "parentTeamId" = (SELECT "id" FROM "Team" WHERE "slug" = 'ence') WHERE "slug" = 'ence-academy';
UPDATE "Team" SET "parentTeamId" = (SELECT "id" FROM "Team" WHERE "slug" = 'heroic') WHERE "slug" = 'heroic-academy';
UPDATE "Team" SET "parentTeamId" = (SELECT "id" FROM "Team" WHERE "slug" = 'mibr') WHERE "slug" = 'mibr-academy';
UPDATE "Team" SET "parentTeamId" = (SELECT "id" FROM "Team" WHERE "slug" = 'red-canids') WHERE "slug" = 'red-canids-academy';
UPDATE "Team" SET "parentTeamId" = (SELECT "id" FROM "Team" WHERE "slug" = 'the-mongolz') WHERE "slug" = 'themongolz-academy';
UPDATE "Team" SET "parentTeamId" = (SELECT "id" FROM "Team" WHERE "slug" = 'pain') WHERE "slug" = 'pain-academy';
UPDATE "Team" SET "parentTeamId" = (SELECT "id" FROM "Team" WHERE "slug" = 'aurora') WHERE "slug" = 'aurora-young-blud';
UPDATE "Team" SET "parentTeamId" = (SELECT "id" FROM "Team" WHERE "slug" = 'g2-esports') WHERE "slug" = 'g2-ares';
UPDATE "Team" SET "parentTeamId" = (SELECT "id" FROM "Team" WHERE "slug" = 'mouz') WHERE "slug" = 'mouz-nxt';
