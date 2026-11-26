-- Existing careers may already have applied the first performance migration.
CREATE INDEX IF NOT EXISTS "CompetitionToTeam_teamId_position_idx"
ON "CompetitionToTeam"("teamId", "position");

CREATE INDEX IF NOT EXISTS "Offer_createdAt_transferId_idx"
ON "Offer"("createdAt", "transferId");
