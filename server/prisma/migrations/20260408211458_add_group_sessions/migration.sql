-- AlterTable
ALTER TABLE "swipe_sessions" ADD COLUMN     "user_2_id" TEXT,
ALTER COLUMN "status" SET DEFAULT 'waiting',
ALTER COLUMN "type" SET DEFAULT 'group';

-- AddForeignKey
ALTER TABLE "swipe_sessions" ADD CONSTRAINT "swipe_sessions_user_2_id_fkey" FOREIGN KEY ("user_2_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
