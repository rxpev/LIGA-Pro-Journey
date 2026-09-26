ALTER TABLE "Persona" ADD COLUMN "signatureFont" TEXT;

UPDATE "Persona"
SET "signatureFont" = CASE abs(random()) % 3
  WHEN 0 THEN 'ANTICALLY'
  WHEN 1 THEN 'CALVIN_FALLEN'
  ELSE 'EASY_FREE'
END
WHERE "role" IN ('Manager', 'Assistant Manager');
