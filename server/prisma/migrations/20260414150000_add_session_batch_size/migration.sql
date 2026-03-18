-- Add batch_size column to swipe_sessions for batch-based swipe flow
ALTER TABLE "swipe_sessions" ADD COLUMN "batch_size" INTEGER;
