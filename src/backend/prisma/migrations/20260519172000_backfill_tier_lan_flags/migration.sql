-- Backfill LAN metadata for saves created before Tier.lan was populated.
UPDATE "Tier"
SET "lan" = 1
WHERE "slug" IN (
  'blast:finals',
  'cct:global-finals',
  'esl-challenger:group-stage',
  'esl-challenger:playoffs',
  'iem:cologne:group-a',
  'iem:cologne:group-b',
  'iem:cologne:playoffs',
  'iem:krakow:group-a',
  'iem:krakow:group-b',
  'iem:krakow:playoffs',
  'league:pro',
  'league:pro:playoffs',
  'major:americas:rmr',
  'major:asia:rmr',
  'major:challengers-stage',
  'major:champions-stage',
  'major:europe:rmr:a',
  'major:europe:rmr:b',
  'major:legends-stage'
);

UPDATE "Tier"
SET "lan" = 0
WHERE "lan" IS NULL;
