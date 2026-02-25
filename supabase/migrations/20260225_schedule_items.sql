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

-- Policy: Users can only access their own schedule items
CREATE POLICY "user_own_schedule" ON public.schedule_items
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

-- Note: API routes using service_role key bypass RLS
-- This is secure because server-side code validates the user session
