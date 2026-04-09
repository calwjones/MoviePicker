/*
  Warnings:

  - You are about to drop the column `couple_id` on the `swipe_sessions` table. All the data in the column will be lost.
  - You are about to drop the `couples` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `list_movies` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `lists` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "couples" DROP CONSTRAINT "couples_user_1_id_fkey";

-- DropForeignKey
ALTER TABLE "couples" DROP CONSTRAINT "couples_user_2_id_fkey";

-- DropForeignKey
ALTER TABLE "list_movies" DROP CONSTRAINT "list_movies_list_id_fkey";

-- DropForeignKey
ALTER TABLE "lists" DROP CONSTRAINT "lists_couple_id_fkey";

-- DropForeignKey
ALTER TABLE "swipe_sessions" DROP CONSTRAINT "swipe_sessions_couple_id_fkey";

-- AlterTable
ALTER TABLE "swipe_sessions" DROP COLUMN "couple_id";

-- DropTable
DROP TABLE "couples";

-- DropTable
DROP TABLE "list_movies";

-- DropTable
DROP TABLE "lists";
