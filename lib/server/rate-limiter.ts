/**
 * SchoolIT AI — Rate Limiter (Supabase-backed)
 * =============================================
 * IP-based rate limiting with admin bypass.
 * Persisted to Supabase so limits survive Vercel cold starts.
 * Falls back to in-memory when Supabase is unavailable.
 *
 * Design: 30-second in-memory TTL cache → Supabase upsert.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { RATE_LIMITS, type TierName } from "@/lib/config";

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

// ── In-Memory Cache (30s TTL) ─────────────────────────────────────────
interface RateLimitEntry {
  count: number;
  resetAt: number;
  dailyCount: number;
  dailyResetAt: number;
  syncedAt: number;
}

const cache = new Map<string, RateLimitEntry>();
const CACHE_TTL = 30_000;
const RATE_WINDOW_MS = 60_000;
const DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 5_000;

function cleanup() {
  if (cache.size <= MAX_ENTRIES) return;
  const now = Date.now();
  const toDelete: string[] = [];
  cache.forEach((val, key) => {
    if (now > val.resetAt && now > val.dailyResetAt) toDelete.push(key);
  });
  toDelete.forEach((k) => cache.delete(k));
}

// ── Sync entry to Supabase (fire-and-forget) ─────────────────────────
async function syncToSupabase(ip: string, entry: RateLimitEntry) {
  const sb = getSupabase();
  if (!sb) return;
  try {
    await sb.from("rate_limits").upsert({
      ip,
      minute_count: entry.count,
      minute_reset_at: new Date(entry.resetAt).toISOString(),
      daily_count: entry.dailyCount,
      daily_reset_at: new Date(entry.dailyResetAt).toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "ip" });
  } catch (e) {
    console.warn("[RateLimit] Supabase sync failed:", e instanceof Error ? e.message : e);
  }
}

// ── Load entry from Supabase ─────────────────────────────────────────
async function loadFromSupabase(ip: string): Promise<RateLimitEntry | null> {
  const sb = getSupabase();
  if (!sb) return null;
  try {
    const { data } = await sb
      .from("rate_limits")
      .select("minute_count, minute_reset_at, daily_count, daily_reset_at")
      .eq("ip", ip)
      .single();
    if (!data) return null;
    return {
      count: data.minute_count ?? 0,
      resetAt: new Date(data.minute_reset_at).getTime(),
      dailyCount: data.daily_count ?? 0,
      dailyResetAt: new Date(data.daily_reset_at).getTime(),
      syncedAt: Date.now(),
    };
  } catch {
    return null;
  }
}

// ── Check Rate Limit ─────────────────────────────────────────────────
export async function checkRateLimit(
  ip: string,
  options: { isAdmin: boolean; tier?: TierName }
): Promise<{
  allowed: boolean;
  remaining: number;
  dailyRemaining: number;
  retryAfter?: number;
}> {
  if (options.isAdmin) {
    return { allowed: true, remaining: 999, dailyRemaining: 999 };
  }

  const now = Date.now();
  const tier = options.tier || "free";
  const limits = RATE_LIMITS[tier] || RATE_LIMITS.free;
  const perMinute = limits.perMinute;
  const perDay = limits.perDay;

  cleanup();

  let entry = cache.get(ip);

  // If not in cache or cache expired, try loading from Supabase
  if (!entry || now - entry.syncedAt > CACHE_TTL) {
    const remote = await loadFromSupabase(ip);
    if (remote) {
      entry = remote;
      cache.set(ip, entry);
    }
  }

  if (!entry) {
    entry = {
      count: 0,
      resetAt: now + RATE_WINDOW_MS,
      dailyCount: 0,
      dailyResetAt: now + DAILY_WINDOW_MS,
      syncedAt: now,
    };
    cache.set(ip, entry);
  }

  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + RATE_WINDOW_MS;
  }

  if (now > entry.dailyResetAt) {
    entry.dailyCount = 0;
    entry.dailyResetAt = now + DAILY_WINDOW_MS;
  }

  if (perDay !== Infinity && entry.dailyCount >= perDay) {
    return {
      allowed: false,
      remaining: 0,
      dailyRemaining: 0,
      retryAfter: Math.ceil((entry.dailyResetAt - now) / 1000),
    };
  }

  if (perMinute !== Infinity && entry.count >= perMinute) {
    return {
      allowed: false,
      remaining: 0,
      dailyRemaining: Math.max(0, perDay === Infinity ? 999 : perDay - entry.dailyCount),
      retryAfter: Math.ceil((entry.resetAt - now) / 1000),
    };
  }

  entry.count++;
  entry.dailyCount++;
  entry.syncedAt = now;

  // Fire-and-forget sync to Supabase
  syncToSupabase(ip, entry).catch(() => {});

  return {
    allowed: true,
    remaining: perMinute === Infinity ? 999 : Math.max(0, perMinute - entry.count),
    dailyRemaining: perDay === Infinity ? 999 : Math.max(0, perDay - entry.dailyCount),
  };
}

// ── Get rate limit info (for headers) ─────────────────────────────────
export async function getRateLimitHeaders(
  ip: string,
  options: { isAdmin: boolean; tier?: TierName }
): Promise<Record<string, string>> {
  const result = await checkRateLimit(ip, options);
  return {
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Daily-Remaining": String(result.dailyRemaining),
    ...(result.retryAfter ? { "Retry-After": String(result.retryAfter) } : {}),
  };
}
