/**
 * Supabase Configuration — SchoolIT AI
 * ======================================
 * Free cloud storage backend for conversation history.
 * Supabase is part of the GitHub Student Developer Pack — 100% free.
 * Falls back to localStorage when Supabase is not configured.
 *
 * SETUP (5 minutes):
 * ─────────────────
 * 1. Go to https://supabase.com → Sign up (free, no credit card)
 * 2. Create a new project (any name, pick a region near you)
 * 3. Go to Project Settings → API → copy "Project URL" and "anon public" key
 * 4. Go to SQL Editor → paste and run this:
 *
 *    CREATE TABLE conversations (
 *      id TEXT PRIMARY KEY,
 *      user_email TEXT NOT NULL,
 *      title TEXT,
 *      subject TEXT,
 *      timestamp BIGINT,
 *      message_count INT,
 *      preview TEXT,
 *      messages JSONB,
 *      updated_at BIGINT
 *    );
 *    CREATE INDEX idx_conv_user ON conversations(user_email, timestamp DESC);
 *    ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
 *    CREATE POLICY "allow_all" ON conversations FOR ALL USING (true) WITH CHECK (true);
 *
 * 5. Add these env vars to Vercel (Settings → Environment Variables):
 *    NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
 *    NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
 *
 * 6. Redeploy — cloud sync activates automatically ✨
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let supabase: SupabaseClient | null = null;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

if (typeof window !== "undefined" && supabaseUrl && supabaseAnonKey) {
  try {
    supabase = createClient(supabaseUrl, supabaseAnonKey);
  } catch (err) {
    console.warn("Supabase initialization failed:", err);
    supabase = null;
  }
}

export function getSupabase(): SupabaseClient | null {
  return supabase;
}

export function isCloudEnabled(): boolean {
  return !!supabase;
}
