/**
 * SchoolIT AI — Content Moderation & Ban System
 * ==========================================
 * IP/email banning, harassment detection, input sanitization.
 * Currently in-memory; designed for easy Supabase migration.
 */

// ── Ban Record ────────────────────────────────────────────────────────
export interface BanRecord {
  reason: string;
  bannedAt: number;
  expiresAt: number; // 0 = permanent
  strikes: number;
}

// In-memory stores (will migrate to Supabase)
const bannedIPs = new Map<string, BanRecord>();
const bannedEmails = new Map<string, BanRecord>();

const BAN_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const PERMANENT_BAN_STRIKES = 3;

// ── Ban a user ────────────────────────────────────────────────────────
export function banUser(ip: string, email: string, reason: string): void {
  const now = Date.now();

  // IP ban
  const ipRecord = bannedIPs.get(ip);
  const ipStrikes = (ipRecord?.strikes || 0) + 1;
  bannedIPs.set(ip, {
    reason,
    bannedAt: now,
    expiresAt: ipStrikes >= PERMANENT_BAN_STRIKES ? 0 : now + BAN_DURATION_MS,
    strikes: ipStrikes,
  });

  // Email ban (if authenticated)
  if (email) {
    const emailRecord = bannedEmails.get(email);
    const emailStrikes = (emailRecord?.strikes || 0) + 1;
    bannedEmails.set(email, {
      reason,
      bannedAt: now,
      expiresAt: emailStrikes >= PERMANENT_BAN_STRIKES ? 0 : now + BAN_DURATION_MS,
      strikes: emailStrikes,
    });
  }
  console.warn(`[BAN] IP=${ip} email=${email || "guest"} strikes=${ipStrikes} reason=${reason}`);
}

// ── Check if user is banned ──────────────────────────────────────────
export function isUserBanned(ip: string, email: string): BanRecord | null {
  const now = Date.now();

  // Check email ban first (more specific)
  if (email) {
    const emailBan = bannedEmails.get(email);
    if (emailBan && (emailBan.expiresAt === 0 || now < emailBan.expiresAt)) {
      return emailBan;
    }
    if (emailBan && now >= emailBan.expiresAt && emailBan.expiresAt > 0) {
      bannedEmails.delete(email);
    }
  }

  // Check IP ban
  const ipBan = bannedIPs.get(ip);
  if (ipBan && (ipBan.expiresAt === 0 || now < ipBan.expiresAt)) {
    return ipBan;
  }
  if (ipBan && now >= ipBan.expiresAt && ipBan.expiresAt > 0) {
    bannedIPs.delete(ip);
  }
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
