ALTER TABLE "users" ADD COLUMN "onboarded_at" TIMESTAMP(3);

-- Existing users have already been using the app, so treat them as onboarded.
-- Only new registrations (onboarded_at IS NULL) will see the wizard.
UPDATE "users" SET "onboarded_at" = "created_at";
