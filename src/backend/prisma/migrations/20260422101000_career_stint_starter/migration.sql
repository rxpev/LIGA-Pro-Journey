-- Add starter snapshot to career stints.
ALTER TABLE "CareerStint"
ADD COLUMN "starter" BOOLEAN NOT NULL DEFAULT true;
