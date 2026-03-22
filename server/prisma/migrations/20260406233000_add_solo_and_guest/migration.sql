-- AlterTable
ALTER TABLE "swipe_sessions" ADD COLUMN "type" TEXT NOT NULL DEFAULT 'couple',
ADD COLUMN "user_id" TEXT,
ADD COLUMN "guest_id" TEXT,
ADD COLUMN "guest_name" TEXT,
ALTER COLUMN "couple_id" DROP NOT NULL;

-- DropForeignKey
ALTER TABLE "session_movies" DROP CONSTRAINT "session_movies_session_id_fkey";

-- DropForeignKey
ALTER TABLE "matches" DROP CONSTRAINT "matches_session_id_fkey";

-- DropForeignKey
ALTER TABLE "swipe_sessions" DROP CONSTRAINT "swipe_sessions_couple_id_fkey";

-- AddForeignKey
ALTER TABLE "swipe_sessions" ADD CONSTRAINT "swipe_sessions_couple_id_fkey" FOREIGN KEY ("couple_id") REFERENCES "couples"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "swipe_sessions" ADD CONSTRAINT "swipe_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_movies" ADD CONSTRAINT "session_movies_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "swipe_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "swipe_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
