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

-- Allow all operations (simple policy for school project)
CREATE POLICY "allow_all" ON conversations FOR ALL USING (true) WITH CHECK (true);
