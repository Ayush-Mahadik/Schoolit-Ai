/**
 * SchoolIT AI — Content Moderation & Ban System (Supabase-backed)
 * ===============================================================
 * IP/email banning, harassment detection, input sanitization.
 * Persisted to Supabase so bans survive Vercel cold starts.
 * Falls back to in-memory when Supabase is unavailable.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// ── Supabase client (lazy singleton) ──────────────────────────────────
let _sb: SupabaseClient | null | undefined;
function getSupabase(): SupabaseClient | null {
  if (_sb !== undefined) return _sb;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { _sb = null; return null; }
  _sb = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return _sb;
}

// ── Ban Record ────────────────────────────────────────────────────────
export interface BanRecord {
  reason: string;
  bannedAt: number;
  expiresAt: number; // 0 = permanent
  strikes: number;
}

// ── In-memory cache (30s TTL) ─────────────────────────────────────────
const banCache = new Map<string, { record: BanRecord | null; at: number }>();
const BAN_CACHE_TTL = 30_000;

const BAN_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const PERMANENT_BAN_STRIKES = 3;

// ── Ban a user (write to Supabase + cache) ───────────────────────────
export async function banUser(ip: string, email: string, reason: string): Promise<void> {
  const now = Date.now();
  const sb = getSupabase();

  // Determine current strikes from cache or Supabase
  let currentStrikes = 0;
  const existing = await isUserBanned(ip, email);
  if (existing) currentStrikes = existing.strikes;

  const newStrikes = currentStrikes + 1;
  const expiresAt = newStrikes >= PERMANENT_BAN_STRIKES ? 0 : now + BAN_DURATION_MS;

  const record: BanRecord = {
    reason,
    bannedAt: now,
    expiresAt,
    strikes: newStrikes,
  };

  // Update cache
  banCache.set(`ip:${ip}`, { record, at: now });
  if (email) banCache.set(`email:${email}`, { record, at: now });

  // Persist to Supabase
  if (sb) {
    try {
      await sb.from("banned_users").upsert({
        ip,
        email: email || "",
        reason,
        banned_at: new Date(now).toISOString(),
        expires_at: expiresAt === 0 ? null : new Date(expiresAt).toISOString(),
        strikes: newStrikes,
        updated_at: new Date().toISOString(),
      }, { onConflict: "ip" });
    } catch (e) {
      console.warn("[BAN] Supabase sync failed:", e instanceof Error ? e.message : e);
    }
  }

  console.warn(`[BAN] IP=${ip} email=${email || "guest"} strikes=${newStrikes} reason=${reason}`);
}

// ── Check if user is banned ──────────────────────────────────────────
export async function isUserBanned(ip: string, email: string): Promise<BanRecord | null> {
  const now = Date.now();

  // Check email cache first
  if (email) {
    const emailCached = banCache.get(`email:${email}`);
    if (emailCached && now - emailCached.at < BAN_CACHE_TTL) {
      if (emailCached.record && (emailCached.record.expiresAt === 0 || now < emailCached.record.expiresAt)) {
        return emailCached.record;
      }
      if (emailCached.record && emailCached.record.expiresAt > 0 && now >= emailCached.record.expiresAt) {
        banCache.set(`email:${email}`, { record: null, at: now });
      }
    }
  }

  // Check IP cache
  const ipCached = banCache.get(`ip:${ip}`);
  if (ipCached && now - ipCached.at < BAN_CACHE_TTL) {
    if (ipCached.record && (ipCached.record.expiresAt === 0 || now < ipCached.record.expiresAt)) {
      return ipCached.record;
    }
    if (ipCached.record && ipCached.record.expiresAt > 0 && now >= ipCached.record.expiresAt) {
      banCache.set(`ip:${ip}`, { record: null, at: now });
    }
    return null;
  }

  // Not in cache → query Supabase
  const sb = getSupabase();
  if (sb) {
    try {
      // Try email lookup first, then IP
      const queries = [];
      if (email) {
        queries.push(
          sb.from("banned_users")
            .select("reason, banned_at, expires_at, strikes")
            .eq("email", email)
            .single()
        );
      }
      queries.push(
        sb.from("banned_users")
          .select("reason, banned_at, expires_at, strikes")
          .eq("ip", ip)
          .single()
      );

      for (const query of queries) {
        const { data } = await query;
        if (data) {
          const record: BanRecord = {
            reason: data.reason,
            bannedAt: new Date(data.banned_at).getTime(),
            expiresAt: data.expires_at ? new Date(data.expires_at).getTime() : 0,
            strikes: data.strikes,
          };
          // Check if ban is still active
          if (record.expiresAt === 0 || now < record.expiresAt) {
            banCache.set(`ip:${ip}`, { record, at: now });
            if (email) banCache.set(`email:${email}`, { record, at: now });
            return record;
          }
        }
      }
    } catch {
      // Supabase unavailable — fall through to no ban
    }
  }

  // No active ban found
  banCache.set(`ip:${ip}`, { record: null, at: now });
  if (email) banCache.set(`email:${email}`, { record: null, at: now });
  return null;
}

// ── Harassment Detection ─────────────────────────────────────────────
const HARASSMENT_PATTERNS = [
  /ayush.*fem\s*boy/i,
  /fem\s*boy.*ayush/i,
  /is\s+ayush\s+(a|the)\s+fem/i,
  /ayush.*\b(gay|trans|homo|queer|sissy|trap)\b/i,
  /\b(gay|trans|homo|queer|sissy|trap|fem\s*boy)\b.*ayush/i,
];

export function isHarassment(message: string): boolean {
  return HARASSMENT_PATTERNS.some((p) => p.test(message));
}

// ── Input Sanitization ──────────────────────────────────────────────
export function sanitizeString(str: string, maxLen: number): string {
  return str
    .replace(/\x00/g, "")
    .replace(/[\x01-\x08]/g, "")
    .replace(/[\x0E-\x1F]/g, "")
    .trim()
    .slice(0, maxLen);
}

// ── Injection Detection ─────────────────────────────────────────────
// Detect attempts to inject system prompts or override instructions
const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions|prompts|rules)/i,
  /you\s+are\s+now\s+(DAN|jailbreak|unfiltered|unrestricted)/i,
  /system\s*:\s*(you\s+are|override|new\s+instructions)/i,
  /\[\s*SYSTEM\s*\]/i,
  /do\s+anything\s+now/i,
  /pretend\s+(you('re|\s+are)\s+)?(not|no\s+longer)\s+(an?\s+)?AI/i,
  /reveal\s+(your|the)\s+(system|initial|original)\s+prompt/i,
  /what\s+(is|are)\s+your\s+(system|initial)\s+(prompt|instructions)/i,
];

export function detectPromptInjection(message: string): boolean {
  return INJECTION_PATTERNS.some((p) => p.test(message));
}

// ── SQL Injection Detection (for any user-supplied data going to DB) ─
const SQL_PATTERNS = [
  /('\s*OR\s+'.*'\s*=\s*')/i,
  /;\s*(DROP|DELETE|UPDATE|INSERT|ALTER|CREATE)\s/i,
  /UNION\s+(ALL\s+)?SELECT/i,
  /--\s*$/m,
  /\/\*[\s\S]*?\*\//,
];

export function detectSQLInjection(input: string): boolean {
  return SQL_PATTERNS.some((p) => p.test(input));
}
