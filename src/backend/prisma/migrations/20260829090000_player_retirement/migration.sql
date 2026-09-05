ALTER TABLE "Player" ADD COLUMN "retiredAt" DATETIME;

CREATE INDEX "Player_retiredAt_idx" ON "Player"("retiredAt");
