-- Repair saves that received an older nullable CareerStint.starter column.
-- Prisma expects this field to be non-nullable.

UPDATE "CareerStint"
SET "starter" = true
WHERE "starter" IS NULL;
