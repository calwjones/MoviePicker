-- AlterTable
ALTER TABLE "movies" ADD COLUMN "trailer_key" TEXT,
ADD COLUMN "tmdb_synced_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "movies_title_year_idx" ON "movies"("title", "year");
