-- Clean up orphaned 1-message conversations from the UUID bug
-- Run AFTER deploying the fix so new convos save correctly
DELETE FROM conversations 
WHERE message_count <= 1 
AND updated_at < (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT - 86400000;
-- Only deletes orphans older than 24 hours — keeps today's data

-- Add index on updated_at for history page performance
CREATE INDEX IF NOT EXISTS idx_conv_updated 
ON conversations(user_email, updated_at DESC);
