-- CreateTable
CREATE TABLE "session_participants" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "user_id" TEXT,
    "guest_token" TEXT,
    "display_name" TEXT NOT NULL,
    "is_host" BOOLEAN NOT NULL DEFAULT false,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMP(3),

    CONSTRAINT "session_participants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "session_participants_session_id_idx" ON "session_participants"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "session_participants_session_id_user_id_key" ON "session_participants"("session_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "session_participants_session_id_guest_token_key" ON "session_participants"("session_id", "guest_token");

-- AddForeignKey
ALTER TABLE "session_participants" ADD CONSTRAINT "session_participants_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "swipe_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_participants" ADD CONSTRAINT "session_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "session_swipes" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "movie_id" TEXT NOT NULL,
    "participant_id" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "swiped_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_swipes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "session_swipes_session_id_movie_id_idx" ON "session_swipes"("session_id", "movie_id");

-- CreateIndex
CREATE UNIQUE INDEX "session_swipes_session_id_movie_id_participant_id_key" ON "session_swipes"("session_id", "movie_id", "participant_id");

-- AddForeignKey
ALTER TABLE "session_swipes" ADD CONSTRAINT "session_swipes_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "session_participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: hosts (userId) as participants
INSERT INTO "session_participants" ("id", "session_id", "user_id", "display_name", "is_host", "joined_at")
SELECT
  gen_random_uuid()::text,
  s."id",
  s."user_id",
  COALESCE(u."username", 'Host'),
  true,
  s."created_at"
FROM "swipe_sessions" s
LEFT JOIN "users" u ON u."id" = s."user_id"
WHERE s."user_id" IS NOT NULL;

-- Backfill: second user (user2Id) as participants
INSERT INTO "session_participants" ("id", "session_id", "user_id", "display_name", "is_host", "joined_at")
SELECT
  gen_random_uuid()::text,
  s."id",
  s."user_2_id",
  COALESCE(u."username", 'Player'),
  false,
  s."created_at"
FROM "swipe_sessions" s
LEFT JOIN "users" u ON u."id" = s."user_2_id"
WHERE s."user_2_id" IS NOT NULL;

-- Backfill: guests as participants (guestId used as guest_token for legacy rows)
INSERT INTO "session_participants" ("id", "session_id", "guest_token", "display_name", "is_host", "joined_at")
SELECT
  gen_random_uuid()::text,
  s."id",
  s."guest_id",
  COALESCE(s."guest_name", 'Guest'),
  false,
  s."created_at"
FROM "swipe_sessions" s
WHERE s."guest_id" IS NOT NULL;

-- Backfill session_swipes from legacy user_1_swipe (host)
INSERT INTO "session_swipes" ("id", "session_id", "movie_id", "participant_id", "direction", "swiped_at")
SELECT
  gen_random_uuid()::text,
  sm."session_id",
  sm."movie_id",
  sp."id",
  sm."user_1_swipe",
  NOW()
FROM "session_movies" sm
JOIN "swipe_sessions" s ON s."id" = sm."session_id"
JOIN "session_participants" sp ON sp."session_id" = s."id" AND sp."is_host" = true
WHERE sm."user_1_swipe" IS NOT NULL;

-- Backfill session_swipes from legacy user_2_swipe (user2 or guest)
INSERT INTO "session_swipes" ("id", "session_id", "movie_id", "participant_id", "direction", "swiped_at")
SELECT
  gen_random_uuid()::text,
  sm."session_id",
  sm."movie_id",
  sp."id",
  sm."user_2_swipe",
  NOW()
FROM "session_movies" sm
JOIN "swipe_sessions" s ON s."id" = sm."session_id"
JOIN "session_participants" sp ON sp."session_id" = s."id"
  AND sp."is_host" = false
  AND (
    (s."user_2_id" IS NOT NULL AND sp."user_id" = s."user_2_id")
    OR (s."user_2_id" IS NULL AND s."guest_id" IS NOT NULL AND sp."guest_token" = s."guest_id")
  )
WHERE sm."user_2_swipe" IS NOT NULL;
