-- SchoolIT AI: Conversations table for cloud storage
-- Run this in Supabase SQL Editor or via `supabase db push`

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  user_email TEXT NOT NULL,
  title TEXT,
  subject TEXT,
  timestamp BIGINT,
  message_count INT,
  preview TEXT,
  messages JSONB,
  updated_at BIGINT
);

-- Index for fast lookups by user email
CREATE INDEX IF NOT EXISTS idx_conv_user ON conversations(user_email, timestamp DESC);

-- Enable Row Level Security
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only access their own conversations
-- This uses the JWT email claim from authenticated sessions
CREATE POLICY "user_own_conversations" ON conversations
  FOR ALL
  USING (
    user_email = COALESCE(
      current_setting('request.jwt.claims', true)::json->>'email',
      current_setting('request.headers', true)::json->>'x-user-email'
    )
  )
  WITH CHECK (
    user_email = COALESCE(
      current_setting('request.jwt.claims', true)::json->>'email',
      current_setting('request.headers', true)::json->>'x-user-email'
    )
  );

-- Optional: Admin override policy (if needed for moderation)
-- Uncomment and set your admin email if you need admin access to all conversations
-- CREATE POLICY "admin_all_access" ON conversations
--   FOR ALL
--   USING (
--     current_setting('request.jwt.claims', true)::json->>'email' = 'ayumahadik25@gmail.com'
--   );
