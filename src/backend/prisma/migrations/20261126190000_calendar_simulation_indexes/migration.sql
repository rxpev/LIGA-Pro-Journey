-- Index the predicates used by every calendar tick and the NPC lifecycle sweeps.
-- These indexes only change query access paths; simulation ordering and results
-- remain unchanged.
CREATE INDEX "Calendar_type_completed_date_idx"
ON "Calendar"("type", "completed", "date");

CREATE INDEX "Calendar_type_completed_payload_idx"
ON "Calendar"("type", "completed", "payload");

CREATE INDEX "Player_teamId_starter_idx"
ON "Player"("teamId", "starter");

CREATE INDEX "Player_teamId_userControlled_contractEnd_idx"
ON "Player"("teamId", "userControlled", "contractEnd");

CREATE INDEX "Player_teamId_userControlled_retiredAt_age_idx"
ON "Player"("teamId", "userControlled", "retiredAt", "age");

CREATE INDEX "Transfer_playerId_status_idx"
ON "Transfer"("playerId", "status");

CREATE INDEX "Offer_transferId_offerType_idx"
ON "Offer"("transferId", "offerType");

CREATE INDEX "CareerStint_starter_endedAt_startedAt_idx"
ON "CareerStint"("starter", "endedAt", "startedAt");

CREATE INDEX "CareerStint_teamId_starter_isTrial_startedAt_idx"
ON "CareerStint"("teamId", "starter", "isTrial", "startedAt");

