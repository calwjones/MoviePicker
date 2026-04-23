-- AlterTable
ALTER TABLE "users" ADD COLUMN "apple_user_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_apple_user_id_key" ON "users"("apple_user_id");
