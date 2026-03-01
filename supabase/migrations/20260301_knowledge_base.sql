-- SchoolIT AI: Knowledge Base for WhatsApp / group / document memory
-- Stores imported content that the AI can search and recall.

CREATE TABLE IF NOT EXISTS knowledge_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',       -- 'whatsapp', 'manual', 'document', 'notes'
  source_name TEXT,                            -- group name, file name, label
  sender TEXT,                                 -- who sent the message (for chat imports)
  content TEXT NOT NULL,
  content_tsv TSVECTOR,                        -- full-text search vector
  metadata JSONB DEFAULT '{}',                 -- extra data: timestamp, media type, etc.
  created_at TIMESTAMPTZ DEFAULT now(),
  imported_at TIMESTAMPTZ DEFAULT now()
);

-- Full-text search index for fast keyword recall
CREATE INDEX IF NOT EXISTS idx_knowledge_tsv ON knowledge_entries USING GIN(content_tsv);

-- User + source lookup
CREATE INDEX IF NOT EXISTS idx_knowledge_user ON knowledge_entries(user_email, source, source_name);

-- Auto-generate tsvector on insert/update
CREATE OR REPLACE FUNCTION knowledge_tsv_trigger() RETURNS trigger AS $$
BEGIN
  NEW.content_tsv := to_tsvector('english', COALESCE(NEW.sender, '') || ' ' || NEW.content);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_knowledge_tsv ON knowledge_entries;
CREATE TRIGGER trg_knowledge_tsv
  BEFORE INSERT OR UPDATE ON knowledge_entries
  FOR EACH ROW EXECUTE FUNCTION knowledge_tsv_trigger();

-- Enable Row Level Security
ALTER TABLE knowledge_entries ENABLE ROW LEVEL SECURITY;

-- Users can only access their own knowledge
DROP POLICY IF EXISTS "user_own_knowledge" ON knowledge_entries;
CREATE POLICY "user_own_knowledge" ON knowledge_entries
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
