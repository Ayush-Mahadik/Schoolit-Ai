-- Create schedule_items table for cloud schedule sync
CREATE TABLE IF NOT EXISTS public.schedule_items (
  id TEXT PRIMARY KEY,
  user_email TEXT NOT NULL,
  title TEXT NOT NULL,
  subject TEXT DEFAULT 'general',
  start_time TEXT NOT NULL,
  end_time TEXT,
  item_type TEXT DEFAULT 'other',
  completed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast user lookups
CREATE INDEX IF NOT EXISTS idx_schedule_user ON public.schedule_items(user_email);

-- Enable RLS
ALTER TABLE public.schedule_items ENABLE ROW LEVEL SECURITY;

-- Policy: service role can do everything (our API uses service role key)
-- No direct browser access policies needed since all access goes through /api/schedule
