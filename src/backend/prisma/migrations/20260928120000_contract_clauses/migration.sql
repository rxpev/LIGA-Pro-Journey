ALTER TABLE "Offer" ADD COLUMN "postBenchTerminationClause" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Offer" ADD COLUMN "rosterStabilityClause" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Player" ADD COLUMN "postBenchTerminationClause" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Player" ADD COLUMN "rosterStabilityClause" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Player" ADD COLUMN "contractBenchStartedAt" DATETIME;
ALTER TABLE "Player" ADD COLUMN "contractRosterBaseline" TEXT;
