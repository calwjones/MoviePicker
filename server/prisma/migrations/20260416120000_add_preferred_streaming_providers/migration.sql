ALTER TABLE "users"
ADD COLUMN "preferred_streaming_provider_ids" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];
