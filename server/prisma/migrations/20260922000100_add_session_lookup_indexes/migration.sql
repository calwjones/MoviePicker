-- CreateIndex
CREATE INDEX "session_participants_user_id_idx" ON "session_participants"("user_id");

-- CreateIndex
CREATE INDEX "session_swipes_session_id_participant_id_idx" ON "session_swipes"("session_id", "participant_id");

-- CreateIndex
CREATE INDEX "swipe_sessions_user_id_type_status_idx" ON "swipe_sessions"("user_id", "type", "status");

