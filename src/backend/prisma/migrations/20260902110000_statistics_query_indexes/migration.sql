-- Supports season-scoped Top 20/MVP reads without changing match outcomes or data.
CREATE INDEX IF NOT EXISTS "Competition_season_status_federationId_idx"
ON "Competition"("season", "status", "federationId");

CREATE INDEX IF NOT EXISTS "Match_competitionId_status_date_idx"
ON "Match"("competitionId", "status", "date");

CREATE INDEX IF NOT EXISTS "CareerStint_playerId_starter_startedAt_endedAt_idx"
ON "CareerStint"("playerId", "starter", "startedAt", "endedAt");
