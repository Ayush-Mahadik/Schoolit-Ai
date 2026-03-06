-- ============================================================
-- SchoolIT AI — Rate Limits & Ban System (Supabase Migration)
-- ============================================================
-- Moves in-memory rate limiter and ban system to persistent
-- Supabase storage so they survive Vercel cold starts.
-- ============================================================

-- ── Rate Limits Table ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rate_limits (
  ip              TEXT PRIMARY KEY,
  minute_count    INTEGER NOT NULL DEFAULT 0,
  minute_reset_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  daily_count     INTEGER NOT NULL DEFAULT 0,
  daily_reset_at  TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-cleanup: rows older than 48 hours with zero counts
CREATE INDEX idx_rate_limits_updated ON rate_limits(updated_at);

-- ── Banned Users Table ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS banned_users (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ip         TEXT NOT NULL,
  email      TEXT DEFAULT '',
  reason     TEXT NOT NULL,
  banned_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,            -- NULL = permanent ban
  strikes    INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Unique per IP so we upsert instead of creating duplicates
  UNIQUE(ip)
);

CREATE INDEX idx_banned_users_email ON banned_users(email)
  WHERE email IS NOT NULL AND email != '';
CREATE INDEX idx_banned_users_expires ON banned_users(expires_at)
  WHERE expires_at IS NOT NULL;

-- ── RLS Policies ──────────────────────────────────────────────
-- These tables are only accessed via service_role key (server-side).
-- Disable RLS so the service role can read/write freely.
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE banned_users ENABLE ROW LEVEL SECURITY;

-- Allow service_role full access
CREATE POLICY "service_role_all_rate_limits"
  ON rate_limits FOR ALL
  USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all_banned_users"
  ON banned_users FOR ALL
  USING (true) WITH CHECK (true);

-- ── Cleanup function (optional, call via pg_cron or manually) ─
CREATE OR REPLACE FUNCTION cleanup_expired_rate_limits()
RETURNS void AS $$
BEGIN
  DELETE FROM rate_limits
    WHERE updated_at < NOW() - INTERVAL '48 hours';
  DELETE FROM banned_users
    WHERE expires_at IS NOT NULL AND expires_at < NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
