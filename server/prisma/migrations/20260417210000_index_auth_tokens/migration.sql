-- CreateIndex
CREATE INDEX "users_password_reset_token_idx" ON "users"("password_reset_token");

-- CreateIndex
CREATE INDEX "users_email_verification_token_idx" ON "users"("email_verification_token");
