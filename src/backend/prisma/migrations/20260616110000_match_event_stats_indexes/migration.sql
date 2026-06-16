CREATE INDEX IF NOT EXISTS "MatchEvent_matchId_gameId_idx" ON "MatchEvent"("matchId", "gameId");
CREATE INDEX IF NOT EXISTS "MatchEvent_attackerId_matchId_idx" ON "MatchEvent"("attackerId", "matchId");
CREATE INDEX IF NOT EXISTS "MatchEvent_assistId_matchId_idx" ON "MatchEvent"("assistId", "matchId");
CREATE INDEX IF NOT EXISTS "MatchEvent_victimId_matchId_idx" ON "MatchEvent"("victimId", "matchId");
CREATE INDEX IF NOT EXISTS "Match_status_matchType_competitionId_date_idx" ON "Match"("status", "matchType", "competitionId", "date");
CREATE INDEX IF NOT EXISTS "MatchToTeam_matchId_teamId_idx" ON "MatchToTeam"("matchId", "teamId");
CREATE INDEX IF NOT EXISTS "MatchToTeam_teamId_matchId_idx" ON "MatchToTeam"("teamId", "matchId");

CREATE TABLE IF NOT EXISTS "MatchPlayerGameStat" (
  "playerId" INTEGER NOT NULL,
  "matchId" INTEGER NOT NULL,
  "gameKey" INTEGER NOT NULL,
  "kills" INTEGER NOT NULL DEFAULT 0,
  "assists" INTEGER NOT NULL DEFAULT 0,
  "deaths" INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY ("playerId", "matchId", "gameKey")
);
CREATE INDEX IF NOT EXISTS "MatchPlayerGameStat_matchId_idx" ON "MatchPlayerGameStat"("matchId");
CREATE INDEX IF NOT EXISTS "MatchPlayerGameStat_playerId_idx" ON "MatchPlayerGameStat"("playerId");
