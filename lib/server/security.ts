/**
 * PROLAI — Security Utilities
 * =============================
 * CSRF token generation/validation, origin checking, request signing.
 * Provides defense-in-depth against common web attacks.
 */

import { NextRequest, NextResponse } from "next/server";
import { CSRF_HEADER } from "@/lib/config";

// ── CSRF Token Management ─────────────────────────────────────────────
// Server-generated tokens validated on every mutating request.
// Tokens are short-lived and bound to the user session.

const CSRF_SECRET = process.env.CSRF_SECRET || process.env.NEXTAUTH_SECRET || "prolai-csrf-fallback-secret";
const CSRF_TOKEN_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

/**
 * Generate a CSRF token.
 * Format: timestamp.hash — where hash = HMAC(timestamp, secret)
 */
export async function generateCSRFToken(sessionId?: string): Promise<string> {
  const timestamp = Date.now().toString(36);
  const payload = `${timestamp}:${sessionId || "anon"}`;

  // Use Web Crypto API (available in Edge Runtime)
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(CSRF_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  const hash = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);

  return `${timestamp}.${hash}`;
}

/**
 * Validate a CSRF token from the request header.
 */
export async function validateCSRFToken(token: string, sessionId?: string): Promise<boolean> {
  if (!token || !token.includes(".")) return false;

  const [timestamp, providedHash] = token.split(".");
  if (!timestamp || !providedHash) return false;

  // Check token age
  const tokenAge = Date.now() - parseInt(timestamp, 36);
  if (tokenAge > CSRF_TOKEN_TTL_MS || tokenAge < 0) return false;

  // Recompute hash
  const payload = `${timestamp}:${sessionId || "anon"}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(CSRF_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  const expectedHash = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);

  // Constant-time comparison
  if (providedHash.length !== expectedHash.length) return false;
  let mismatch = 0;
  for (let i = 0; i < providedHash.length; i++) {
    mismatch |= providedHash.charCodeAt(i) ^ expectedHash.charCodeAt(i);
  }
  return mismatch === 0;
}

// ── Origin Validation ─────────────────────────────────────────────────
function normalizeOrigin(url: string | undefined | null): string {
  if (!url) return "";
  return url.replace(/\/$/, "");
}

const PRIMARY_ORIGIN = normalizeOrigin(process.env.NEXT_PUBLIC_SITE_URL);
const LEGACY_ORIGIN =
  normalizeOrigin(process.env.NEXT_PUBLIC_OLD_SITE_URL) ||
  "https://schoolit-ai.vercel.app";

export function validateOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin") || "";
  const referer = req.headers.get("referer") || "";

  // Allow same-origin and server-side requests
  if (!origin && !referer) return true;

  const allowed = [
    PRIMARY_ORIGIN,
    LEGACY_ORIGIN,
    "https://frontend-", // Vercel preview deployments
    "http://localhost:3000",
    "http://localhost:3001",
  ].filter(Boolean);

  return allowed.some((a) => origin.startsWith(a) || referer.startsWith(a));
}

// ── Request Fingerprinting ────────────────────────────────────────────
export function getRequestIP(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

// ── Security Response Helpers ─────────────────────────────────────────
export function forbiddenResponse(message: string = "Forbidden"): NextResponse {
  return NextResponse.json(
    { error: "forbidden", message },
    { status: 403 }
  );
}

export function rateLimitedResponse(retryAfter?: number): NextResponse {
  return NextResponse.json(
    { error: "rate_limited", message: "Too many requests. Please wait and try again." },
    {
      status: 429,
      headers: {
        "X-RateLimit-Remaining": "0",
        ...(retryAfter ? { "Retry-After": String(retryAfter) } : {}),
      },
    }
  );
}

// ── API Key Validation (for self-hosted LLM endpoints) ────────────────
export function validateAPIKey(req: NextRequest, expectedKey: string): boolean {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return false;

  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;

  // Constant-time comparison
  if (token.length !== expectedKey.length) return false;
  let mismatch = 0;
  for (let i = 0; i < token.length; i++) {
    mismatch |= token.charCodeAt(i) ^ expectedKey.charCodeAt(i);
  }
  return mismatch === 0;
}

// ── CSRF Token API Route Helper ───────────────────────────────────────
export function createCSRFEndpointHandler() {
  return async function GET() {
    const token = await generateCSRFToken();
    return NextResponse.json({ token }, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "X-Content-Type-Options": "nosniff",
      },
    });
  };
}
