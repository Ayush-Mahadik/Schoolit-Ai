/**
 * SchoolIT AI — Rate Limiter
 * =======================
 * IP-based rate limiting with admin bypass.
 * Tiered limits based on subscription level.
 * Currently in-memory; designed for Supabase migration.
 */

import { RATE_LIMITS, type TierName } from "@/lib/config";

// ── In-Memory Rate Limit Store ────────────────────────────────────────
interface RateLimitEntry {
  count: number;
  resetAt: number;
  dailyCount: number;
  dailyResetAt: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();
const RATE_WINDOW_MS = 60_000; // 1 minute
const DAILY_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

// Periodic cleanup threshold
const MAX_ENTRIES = 10_000;

function cleanup() {
  if (rateLimitMap.size <= MAX_ENTRIES) return;
  const now = Date.now();
  const toDelete: string[] = [];
  rateLimitMap.forEach((val, key) => {
    if (now > val.resetAt && now > val.dailyResetAt) toDelete.push(key);
  });
  toDelete.forEach((k) => rateLimitMap.delete(k));
}

// ── Check Rate Limit ─────────────────────────────────────────────────
export function checkRateLimit(
  ip: string,
  options: { isAdmin: boolean; tier?: TierName }
): {
  allowed: boolean;
  remaining: number;
  dailyRemaining: number;
  retryAfter?: number;
} {
  // Admins bypass ALL rate limiting
  if (options.isAdmin) {
    return { allowed: true, remaining: 999, dailyRemaining: 999 };
  }

  const now = Date.now();
  const tier = options.tier || "free";
  const limits = RATE_LIMITS[tier] || RATE_LIMITS.free;
  const perMinute = limits.perMinute;
  const perDay = limits.perDay;

  cleanup();

  let entry = rateLimitMap.get(ip);

  // Initialize or reset windows
  if (!entry) {
    entry = {
      count: 0,
      resetAt: now + RATE_WINDOW_MS,
      dailyCount: 0,
      dailyResetAt: now + DAILY_WINDOW_MS,
    };
    rateLimitMap.set(ip, entry);
  }

  // Reset minute window if expired
  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + RATE_WINDOW_MS;
  }

  // Reset daily window if expired
  if (now > entry.dailyResetAt) {
    entry.dailyCount = 0;
    entry.dailyResetAt = now + DAILY_WINDOW_MS;
  }

  // Check daily limit
  if (perDay !== Infinity && entry.dailyCount >= perDay) {
    return {
      allowed: false,
      remaining: 0,
      dailyRemaining: 0,
      retryAfter: Math.ceil((entry.dailyResetAt - now) / 1000),
    };
  }

  // Check per-minute limit
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

  return {
    allowed: true,
    remaining: perMinute === Infinity ? 999 : Math.max(0, perMinute - entry.count),
    dailyRemaining: perDay === Infinity ? 999 : Math.max(0, perDay - entry.dailyCount),
  };
}

// ── Get rate limit info (for headers) ─────────────────────────────────
export function getRateLimitHeaders(
  ip: string,
  options: { isAdmin: boolean; tier?: TierName }
): Record<string, string> {
  const result = checkRateLimit(ip, options);
  return {
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Daily-Remaining": String(result.dailyRemaining),
    ...(result.retryAfter ? { "Retry-After": String(result.retryAfter) } : {}),
  };
}
