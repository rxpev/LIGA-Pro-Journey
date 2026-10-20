ALTER TABLE "Profile" ADD COLUMN "faceitRecruitmentOutcome" TEXT;
ALTER TABLE "Profile" ADD COLUMN "faceitRecruitmentMatches" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Profile" ADD COLUMN "faceitRecruitmentMinimumMatches" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Profile" ADD COLUMN "faceitRecruitmentOutcomeBoost" INTEGER NOT NULL DEFAULT 0;
