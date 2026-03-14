-- Add email verification + password reset columns to users
ALTER TABLE "users" ADD COLUMN "email_verified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN "email_verification_token" TEXT;
ALTER TABLE "users" ADD COLUMN "password_reset_token" TEXT;
ALTER TABLE "users" ADD COLUMN "password_reset_expires_at" TIMESTAMP(3);

-- Mark existing users as verified so they aren't locked out
UPDATE "users" SET "email_verified" = true;

-- Add cascade delete from user relations for GDPR compliance
ALTER TABLE "user_movies" DROP CONSTRAINT "user_movies_user_id_fkey";
ALTER TABLE "user_movies" ADD CONSTRAINT "user_movies_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "swipe_sessions" DROP CONSTRAINT "swipe_sessions_user_id_fkey";
ALTER TABLE "swipe_sessions" ADD CONSTRAINT "swipe_sessions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "swipe_sessions" DROP CONSTRAINT "swipe_sessions_user_2_id_fkey";
ALTER TABLE "swipe_sessions" ADD CONSTRAINT "swipe_sessions_user_2_id_fkey"
  FOREIGN KEY ("user_2_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
