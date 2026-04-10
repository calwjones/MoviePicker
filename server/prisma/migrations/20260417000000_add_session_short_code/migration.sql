-- AlterTable
ALTER TABLE "swipe_sessions" ADD COLUMN "short_code" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "swipe_sessions_short_code_key" ON "swipe_sessions"("short_code");
