-- Rename display_name → username, normalize to [a-z0-9_-]{3,30}, dedup,
-- and add a unique index. Case-insensitivity is enforced by always
-- lowercasing values before insert/lookup at the app layer.

ALTER TABLE "users" RENAME COLUMN "display_name" TO "username";

UPDATE "users"
SET "username" = CASE
  WHEN length(regexp_replace(lower("username"), '[^a-z0-9_-]', '', 'g')) >= 3
    THEN substring(regexp_replace(lower("username"), '[^a-z0-9_-]', '', 'g') FROM 1 FOR 30)
  ELSE 'user-' || substring(replace("id"::text, '-', '') FROM 1 FOR 8)
END;

WITH dupes AS (
  SELECT "id", "username",
    ROW_NUMBER() OVER (PARTITION BY "username" ORDER BY "created_at" ASC) AS rn
  FROM "users"
)
UPDATE "users" u
SET "username" = substring(u."username" FROM 1 FOR 28) || '-' || dupes.rn
FROM dupes
WHERE u."id" = dupes."id" AND dupes.rn > 1;

CREATE UNIQUE INDEX "users_username_key" ON "users"("username");
