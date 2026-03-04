/**
 * SchoolIT AI — Encrypted Client Storage Engine
 * ==========================================
 * Professional-grade encrypted storage using AES-GCM via Web Crypto API.
 * All user data is encrypted at rest in localStorage — no plain-text JSON.
 *
 * Key derivation: PBKDF2(SHA-256, 100k iterations) from a per-browser
 * fingerprint + salt. The encryption key never leaves the browser.
 *
 * This module wraps localStorage so that callers work with plain objects
 * but data is stored as base64-encoded AES-GCM ciphertext.
 */

const STORAGE_VERSION = 1;
const SALT_KEY = "__prolai_s";
const VERSION_KEY = "__prolai_v";

// ── Browser fingerprint for key derivation ────────────────────────────
function getBrowserFingerprint(): string {
  if (typeof window === "undefined") return "ssr";
  const nav = window.navigator;
  const parts = [
    nav.userAgent,
    nav.language,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    screen.width + "x" + screen.height,
    screen.colorDepth?.toString(),
    nav.hardwareConcurrency?.toString(),
  ].filter(Boolean);
  return parts.join("|");
}

// ── Stable salt (generated once per browser, stored unencrypted) ──────
function getOrCreateSalt(): Uint8Array {
  if (typeof window === "undefined") return new Uint8Array(16);
  try {
    const existing = localStorage.getItem(SALT_KEY);
    if (existing) {
      return Uint8Array.from(atob(existing), (c) => c.charCodeAt(0));
    }
    const salt = crypto.getRandomValues(new Uint8Array(16));
    localStorage.setItem(SALT_KEY, btoa(String.fromCharCode.apply(null, Array.from(salt))));
    localStorage.setItem(VERSION_KEY, String(STORAGE_VERSION));
    return salt;
  } catch {
    return crypto.getRandomValues(new Uint8Array(16));
  }
}

// ── Key derivation (PBKDF2 → AES-GCM key) ────────────────────────────
let _cachedKey: CryptoKey | null = null;

async function deriveKey(): Promise<CryptoKey> {
  if (_cachedKey) return _cachedKey;

  const fingerprint = getBrowserFingerprint();
  const salt = getOrCreateSalt();
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(fingerprint),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  _cachedKey = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt.buffer as ArrayBuffer, iterations: 100_000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
  return _cachedKey;
}

// ── Encrypt / Decrypt ─────────────────────────────────────────────────
async function encrypt(plaintext: string): Promise<string> {
  const key = await deriveKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoded
  );
  // Format: base64(iv + ciphertext)
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return btoa(String.fromCharCode.apply(null, Array.from(combined)));
}

async function decrypt(stored: string): Promise<string> {
  const key = await deriveKey();
  const combined = Uint8Array.from(atob(stored), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext
  );
  return new TextDecoder().decode(plaintext);
}

// ── Public API ────────────────────────────────────────────────────────
const PREFIX = "pe_"; // "prolai encrypted"

/**
 * Read an encrypted value. Falls back to reading unencrypted prolai_ key
 * for migration, then encrypts it and removes the old key.
 */
export async function secureGet<T>(key: string, fallback: T): Promise<T> {
  if (typeof window === "undefined") return fallback;

  try {
    // Try encrypted key first
    const raw = localStorage.getItem(PREFIX + key);
    if (raw) {
      const json = await decrypt(raw);
      return JSON.parse(json) as T;
    }

    // Fallback: migrate from unencrypted prolai_ prefix
    const legacyRaw = localStorage.getItem("prolai_" + key);
    if (legacyRaw) {
      const parsed = JSON.parse(legacyRaw) as T;
      // Migrate to encrypted storage
      await secureSet(key, parsed);
      localStorage.removeItem("prolai_" + key);
      return parsed;
    }

    return fallback;
  } catch {
    // Decryption failed (different browser/device) — clear and return fallback
    localStorage.removeItem(PREFIX + key);
    return fallback;
  }
}

/**
 * Write an encrypted value to localStorage.
 */
export async function secureSet(key: string, value: unknown): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const json = JSON.stringify(value);
    const encrypted = await encrypt(json);
    localStorage.setItem(PREFIX + key, encrypted);
  } catch {
    // Storage full or crypto unavailable — silently ignore
  }
}

/**
 * Remove an encrypted value.
 */
export function secureRemove(key: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(PREFIX + key);
    localStorage.removeItem("prolai_" + key); // also clean legacy
  } catch { /* ignore */ }
}

/**
 * Get raw encrypted string (for large data like messages).
 */
export async function secureGetRaw(key: string): Promise<string | null> {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw) return await decrypt(raw);

    // Fallback: legacy unencrypted
    const legacy = localStorage.getItem("prolai_" + key);
    if (legacy) {
      // Migrate
      const encrypted = await encrypt(legacy);
      localStorage.setItem(PREFIX + key, encrypted);
      localStorage.removeItem("prolai_" + key);
      return legacy;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Set raw encrypted string.
 */
export async function secureSetRaw(key: string, value: string): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    // Only store if under 500KB (prevent storage quota issues)
    if (value.length > 500_000) return;
    const encrypted = await encrypt(value);
    localStorage.setItem(PREFIX + key, encrypted);
  } catch { /* ignore */ }
}

/**
 * Clear ALL SchoolIT AI data from storage (logout/wipe).
 */
export function secureClearAll(): void {
  if (typeof window === "undefined") return;
  const keys = Object.keys(localStorage).filter(
    (k) =>
      k.startsWith(PREFIX) ||
      k.startsWith("prolai_") ||
      k.startsWith("schoolit_") ||
      k.startsWith("schoolit-")
  );
  keys.forEach((k) => localStorage.removeItem(k));
  sessionStorage.removeItem("prolai-messages");
  sessionStorage.removeItem("schoolit-messages");
  _cachedKey = null;
}

/**
 * Check if Web Crypto is available (for graceful degradation).
 */
export function isSecureStorageAvailable(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof crypto !== "undefined" &&
    typeof crypto.subtle !== "undefined" &&
    typeof crypto.subtle.deriveKey === "function"
  );
}
