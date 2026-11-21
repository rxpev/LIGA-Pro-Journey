/**
 * Updates the starting CS:GO map pool and moves every other configured map to reserve.
 */

UPDATE "MapPool"
SET "position" = CASE (
  SELECT "name"
  FROM "GameMap"
  WHERE "GameMap"."id" = "MapPool"."gameMapId"
)
  WHEN 'de_cache' THEN 0
  WHEN 'de_dust2' THEN 1
  WHEN 'de_mirage' THEN 2
  WHEN 'de_inferno' THEN 3
  WHEN 'de_nuke' THEN 4
  WHEN 'de_ancient' THEN 5
  WHEN 'de_anubis' THEN 6
  ELSE NULL
END
WHERE "gameVersionId" = (
  SELECT "id"
  FROM "GameVersion"
  WHERE "slug" = 'csgo'
);
