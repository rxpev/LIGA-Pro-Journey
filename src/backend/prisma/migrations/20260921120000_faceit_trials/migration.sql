ALTER TABLE "Profile" ADD COLUMN "trialTeamId" INTEGER;
ALTER TABLE "Profile" ADD COLUMN "trialSeriesTarget" INTEGER;
ALTER TABLE "Profile" ADD COLUMN "trialSeriesPlayed" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Profile" ADD COLUMN "trialGoalType" TEXT;
ALTER TABLE "Profile" ADD COLUMN "trialGoalValue" REAL;
ALTER TABLE "Profile" ADD COLUMN "trialReplacedPlayerId" INTEGER;
ALTER TABLE "Profile" ADD COLUMN "trialStartedAt" DATETIME;

ALTER TABLE "Offer" ADD COLUMN "offerType" TEXT NOT NULL DEFAULT 'PERMANENT';
ALTER TABLE "Offer" ADD COLUMN "trialSeries" INTEGER;
ALTER TABLE "Offer" ADD COLUMN "trialGoalType" TEXT;
ALTER TABLE "Offer" ADD COLUMN "trialGoalValue" REAL;
ALTER TABLE "Offer" ADD COLUMN "trialReplacedPlayerId" INTEGER;

CREATE INDEX "Profile_trialTeamId_idx" ON "Profile"("trialTeamId");
