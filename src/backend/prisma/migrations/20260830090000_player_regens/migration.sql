ALTER TABLE "Player" ADD COLUMN "isRegen" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Player" ADD COLUMN "generatedAt" DATETIME;

CREATE INDEX "Player_isRegen_generatedAt_idx" ON "Player"("isRegen", "generatedAt");
