/**
 * Unified Data Store — SchoolIT AI v3.0
 * ==================================
 * SINGLE SOURCE OF TRUTH for all client-side data operations.
 *
 * Storage strategy:
 *   - AES-256-GCM encrypted via lib/secure-storage.ts (Web Crypto)
 *   - Automatic migration from unencrypted prolai_ and schoolit_ keys
 *   - All data encrypted at rest — no plain-text JSON in localStorage
 *
 * KEY MAP (encrypted with pe_ prefix internally):
 *   settings           → ChatSettings (model, persona, etc.)
 *   conversations      → Conversation[] metadata list
 *   msgs_{id}          → Serialized Message[] for a conversation
 *   schedule           → ScheduleItem[] list
 *   profile            → CachedProfile (name, email, isAdmin)
 */

import type { ChatSettings, ScheduleItem } from "@/lib/types";
import {
  secureGet,
  secureSet,
  secureRemove,
  secureGetRaw,
  secureSetRaw,
  secureClearAll,
  isSecureStorageAvailable,
} from "@/lib/secure-storage";

// ── Synchronous fallback for SSR / initial render ─────────────────────
// On first render we need sync data. We cache the last-loaded values
// in memory and hydrate async after mount.

const _cache = new Map<string, unknown>();

function getCached<T>(key: string, fallback: T): T {
  if (_cache.has(key)) return _cache.get(key) as T;
  return fallback;
}

/**
 * Hydrate encrypted storage into memory cache.
 * Call this ONCE in the root layout/page useEffect.
 */
export async function hydrateStore(): Promise<void> {
  if (typeof window === "undefined") return;

  // Run legacy migrations first (sync)
  runStoreMigrations();

  // Load all data into memory cache
  const [settings, conversations, schedule, profile] = await Promise.all([
    secureGet<ChatSettings>("settings", {
      persona: "balanced",
      useWebSearch: true,
      chainOfThought: false,
      thinkingMode: "balanced",
    }),
    secureGet<ConversationMeta[]>("conversations", []),
    secureGet<ScheduleItem[]>("schedule", []),
    secureGet<CachedProfile | null>("profile", null),
  ]);

  _cache.set("settings", settings);
  _cache.set("conversations", conversations);
  _cache.set("schedule", schedule);
  _cache.set("profile", profile);
}

// ══════════════════════════════════════════════════════════════════════
//  Legacy Migration — run once to move unencrypted keys to encrypted
// ══════════════════════════════════════════════════════════════════════

let _migrated = false;

export function runStoreMigrations() {
  if (typeof window === "undefined" || _migrated) return;
  _migrated = true;

  try {
    // Migrate "schoolit_*" prefix → "prolai_*" prefix first (these will then
    // be picked up by secure-storage's automatic migration to pe_ prefix)
    const oldPrefix = "schoolit_";
    const keysToMigrate = Object.keys(localStorage).filter((k) => k.startsWith(oldPrefix));
    for (const oldKey of keysToMigrate) {
      const newKey = "prolai_" + oldKey.slice(oldPrefix.length);
      if (!localStorage.getItem(newKey)) {
        const value = localStorage.getItem(oldKey);
        if (value) localStorage.setItem(newKey, value);
      }
      localStorage.removeItem(oldKey);
    }

    // Migrate "schoolit-schedule" (hyphen) → "prolai_schedule" (underscore)
    const oldSchedule = localStorage.getItem("schoolit-schedule");
    if (oldSchedule && !localStorage.getItem("prolai_schedule")) {
      localStorage.setItem("prolai_schedule", oldSchedule);
      localStorage.removeItem("schoolit-schedule");
    } else if (oldSchedule) {
      try {
        const oldItems = JSON.parse(oldSchedule) as ScheduleItem[];
        const newItems = JSON.parse(localStorage.getItem("prolai_schedule") || "[]") as ScheduleItem[];
        const merged = new Map<string, ScheduleItem>();
        for (const item of newItems) merged.set(item.id, item);
        for (const item of oldItems) {
          if (!merged.has(item.id)) merged.set(item.id, item);
        }
        localStorage.setItem("prolai_schedule", JSON.stringify(Array.from(merged.values())));
        localStorage.removeItem("schoolit-schedule");
      } catch { /* ignore merge errors */ }
    }
  } catch { /* ignore migration errors */ }
}

// ══════════════════════════════════════════════════════════════════════
//  User Settings (persona, model, thinking mode, etc.)
// ══════════════════════════════════════════════════════════════════════

export function getUserSettings(): ChatSettings {
  return getCached<ChatSettings>("settings", {
    persona: "balanced",
    useWebSearch: true,
    chainOfThought: false,
    thinkingMode: "balanced",
  });
}

export function saveUserSettings(settings: ChatSettings) {
  _cache.set("settings", settings);
  secureSet("settings", settings);
}

// ══════════════════════════════════════════════════════════════════════
//  Conversation Storage (metadata list + per-conversation messages)
// ══════════════════════════════════════════════════════════════════════

export interface ConversationMeta {
  id: string;
  title: string;
  subject: string;
  timestamp: number;
  messageCount: number;
  preview: string;
}

const MAX_CONVERSATIONS = 50;

/** Get the list of conversation metadata */
export function getConversationList(): ConversationMeta[] {
  return getCached<ConversationMeta[]>("conversations", []);
}

/** Save or update conversation metadata in the list */
export function saveConversationMeta(conv: ConversationMeta) {
  const list = getConversationList();
  const idx = list.findIndex((c) => c.id === conv.id);
  if (idx >= 0) {
    list[idx] = conv;
  } else {
    list.unshift(conv);
  }

  // Prune old conversations beyond the limit
  if (list.length > MAX_CONVERSATIONS) {
    const removed = list.slice(MAX_CONVERSATIONS);
    for (const r of removed) {
      secureRemove(`msgs_${r.id}`);
    }
  }

  const trimmed = list.slice(0, MAX_CONVERSATIONS);
  _cache.set("conversations", trimmed);
  secureSet("conversations", trimmed);
}

/** Overwrite the entire conversation list (used after merge/sort) */
export function setConversationList(list: ConversationMeta[]) {
  const trimmed = list.slice(0, MAX_CONVERSATIONS);
  _cache.set("conversations", trimmed);
  secureSet("conversations", trimmed);
}

/** Delete a conversation (metadata + messages) */
export function deleteConversationById(id: string) {
  const list = getConversationList().filter((c) => c.id !== id);
  _cache.set("conversations", list);
  secureSet("conversations", list);
  secureRemove(`msgs_${id}`);
}

/** Delete ALL conversations */
export function clearAllConversations() {
  const list = getConversationList();
  for (const c of list) {
    secureRemove(`msgs_${c.id}`);
  }
  _cache.set("conversations", []);
  secureRemove("conversations");
}

/** Get stored messages for a specific conversation (async — encrypted) */
export async function getConversationMessages(id: string): Promise<string | null> {
  return secureGetRaw(`msgs_${id}`);
}

/** Save messages for a specific conversation (async — encrypted) */
export async function saveConversationMessages(id: string, messagesJson: string) {
  if (messagesJson.length < 500_000) {
    await secureSetRaw(`msgs_${id}`, messagesJson);
  }
}

/** Remove messages for a specific conversation */
export function removeConversationMessages(id: string) {
  secureRemove(`msgs_${id}`);
}

// ══════════════════════════════════════════════════════════════════════
//  Schedule Items (unified key: prolai_schedule)
// ══════════════════════════════════════════════════════════════════════

export function getScheduleItems(): ScheduleItem[] {
  return getCached<ScheduleItem[]>("schedule", []);
}

export function saveScheduleItems(items: ScheduleItem[]) {
  _cache.set("schedule", items);
  secureSet("schedule", items);
}

export function addScheduleItems(newItems: ScheduleItem[]) {
  const existing = getScheduleItems();
  const updated = [...existing, ...newItems].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  );
  _cache.set("schedule", updated);
  secureSet("schedule", updated);
}

/** Read schedule context string for AI prompt injection */
export function getScheduleContext(): string {
  const items = getScheduleItems();
  if (items.length === 0) return "";
  const now = new Date();
  const upcoming = items
    .filter((i) => new Date(i.startTime) >= now || !i.completed)
    .slice(0, 20);
  if (upcoming.length === 0) return "";
  return (
    "Student's current schedule:\n" +
    upcoming
      .map(
        (i) =>
          `- ${i.title} (${i.type}, ${i.subject}) — ${new Date(i.startTime).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}${i.completed ? " [DONE]" : ""}`
      )
      .join("\n")
  );
}

// ══════════════════════════════════════════════════════════════════════
//  User Profile Cache
// ══════════════════════════════════════════════════════════════════════

export interface CachedProfile {
  name: string;
  email: string;
  image?: string;
  isAdmin: boolean;
  lastSeen: string;
}

export function getCachedProfile(): CachedProfile | null {
  return getCached<CachedProfile | null>("profile", null);
}

export function saveCachedProfile(profile: CachedProfile) {
  _cache.set("profile", profile);
  secureSet("profile", profile);
}

// ══════════════════════════════════════════════════════════════════════
//  Clear All User Data
// ══════════════════════════════════════════════════════════════════════

export function clearAllUserData() {
  _cache.clear();
  secureClearAll();
}
