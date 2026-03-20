-- SchoolIT AI: Cleanup Orphaned Conversations
-- ==============================================
-- Removes conversations with 1 or fewer messages that are older than 24h.
-- These are typically failed conversation starts or incomplete saves.

DELETE FROM conversations
WHERE message_count <= 1
AND updated_at < (
  EXTRACT(EPOCH FROM NOW()) * 1000
)::BIGINT - 86400000;

-- Add index on updated_at for better query performance
CREATE INDEX IF NOT EXISTS idx_conv_updated
ON conversations(user_email, updated_at DESC);
