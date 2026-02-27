UPDATE "Profile"
SET "settings" = json_set("settings", '$.matchRules.maxRounds', 24)
WHERE json_valid("settings")
  AND (
    json_type("settings", '$.matchRules.maxRounds') IS NULL
    OR json_extract("settings", '$.matchRules.maxRounds') = 6
  );
