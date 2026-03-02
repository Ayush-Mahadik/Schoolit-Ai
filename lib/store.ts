/**
 * Unified Data Store — PROLAI
 * ============================
 * SINGLE SOURCE OF TRUTH for all localStorage operations.
 *
 * All keys use the consistent prefix "prolai_" with underscores.
 * This module handles: settings, conversations (metadata + messages),
 * schedule items, and user profile cache.
 *
 * Cloud sync goes through /api/conversations (server-side route).
 * This module is the only place that reads/writes localStorage for
 * user data — no other file should call localStorage directly.
 *
 * KEY MAP:
 *   prolai_settings           → ChatSettings (model, persona, etc.)
 *   prolai_conversations      → Conversation[] metadata list
 *   prolai_msgs_{id}          → Serialized Message[] for a conversation
 *   prolai_schedule           → ScheduleItem[] list
 *   prolai_profile            → CachedProfile (name, email, isAdmin)
 */

import type { ChatSettings, ScheduleItem } from "@/lib/types";

const PREFIX = "prolai_";

// ── Core Helpers ──────────────────────────────────────────────────────

function getItem<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function setItem(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Storage full or blocked — silently ignore
  }
}

function removeItem(key: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(PREFIX + key);
  } catch { /* ignore */ }
}

function getRaw(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
}

function setRaw(key: string, value: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PREFIX + key, value);
  } catch { /* ignore */ }
}

// ══════════════════════════════════════════════════════════════════════
//  Migration — run once on first load to normalize old key formats
// ══════════════════════════════════════════════════════════════════════

let _migrated = false;

export function runStoreMigrations() {
  if (typeof window === "undefined" || _migrated) return;
  _migrated = true;

  try {
    // Migrate "schoolit_*" prefix → "prolai_*" prefix (rebrand migration)
    const oldPrefix = "schoolit_";
    const keysToMigrate = Object.keys(localStorage).filter((k) => k.startsWith(oldPrefix));
    for (const oldKey of keysToMigrate) {
      const newKey = PREFIX + oldKey.slice(oldPrefix.length);
      if (!localStorage.getItem(newKey)) {
        const value = localStorage.getItem(oldKey);
        if (value) localStorage.setItem(newKey, value);
      }
      localStorage.removeItem(oldKey);
    }

    // Migrate "schoolit-schedule" (hyphen) → "prolai_schedule" (underscore)
    const oldSchedule = localStorage.getItem("schoolit-schedule");
    if (oldSchedule && !localStorage.getItem(PREFIX + "schedule")) {
      localStorage.setItem(PREFIX + "schedule", oldSchedule);
      localStorage.removeItem("schoolit-schedule");
    } else if (oldSchedule) {
      // Both exist — merge (old into new, dedup by id)
      try {
        const oldItems = JSON.parse(oldSchedule) as ScheduleItem[];
        const newItems = JSON.parse(localStorage.getItem(PREFIX + "schedule") || "[]") as ScheduleItem[];
        const merged = new Map<string, ScheduleItem>();
        for (const item of newItems) merged.set(item.id, item);
        for (const item of oldItems) {
          if (!merged.has(item.id)) merged.set(item.id, item);
        }
        localStorage.setItem(PREFIX + "schedule", JSON.stringify(Array.from(merged.values())));
        localStorage.removeItem("schoolit-schedule");
      } catch { /* ignore merge errors */ }
    }
  } catch { /* ignore migration errors */ }
}

// ══════════════════════════════════════════════════════════════════════
//  User Settings (persona, model, thinking mode, etc.)
// ══════════════════════════════════════════════════════════════════════

export function getUserSettings(): ChatSettings {
  return getItem<ChatSettings>("settings", {
    persona: "balanced",
    useWebSearch: true,
    chainOfThought: false,
    thinkingMode: "balanced",
  });
}

export function saveUserSettings(settings: ChatSettings) {
  setItem("settings", settings);
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
  return getItem<ConversationMeta[]>("conversations", []);
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
      removeItem(`msgs_${r.id}`);
    }
  }

  setItem("conversations", list.slice(0, MAX_CONVERSATIONS));
}

/** Overwrite the entire conversation list (used after merge/sort) */
export function setConversationList(list: ConversationMeta[]) {
  setItem("conversations", list.slice(0, MAX_CONVERSATIONS));
}

/** Delete a conversation (metadata + messages) */
export function deleteConversationById(id: string) {
  const list = getConversationList().filter((c) => c.id !== id);
  setItem("conversations", list);
  removeItem(`msgs_${id}`);
}

/** Delete ALL conversations */
export function clearAllConversations() {
  const list = getConversationList();
  for (const c of list) {
    removeItem(`msgs_${c.id}`);
  }
  removeItem("conversations");
}

/** Get stored messages for a specific conversation */
export function getConversationMessages(id: string): string | null {
  return getRaw(`msgs_${id}`);
}

/** Save messages for a specific conversation (raw JSON string) */
export function saveConversationMessages(id: string, messagesJson: string) {
  // Only save if under 500KB per conversation
  if (messagesJson.length < 500_000) {
    setRaw(`msgs_${id}`, messagesJson);
  }
}

/** Remove messages for a specific conversation */
export function removeConversationMessages(id: string) {
  removeItem(`msgs_${id}`);
}

// ══════════════════════════════════════════════════════════════════════
//  Schedule Items (unified key: prolai_schedule)
// ══════════════════════════════════════════════════════════════════════

export function getScheduleItems(): ScheduleItem[] {
  return getItem<ScheduleItem[]>("schedule", []);
}

export function saveScheduleItems(items: ScheduleItem[]) {
  setItem("schedule", items);
}

export function addScheduleItems(newItems: ScheduleItem[]) {
  const existing = getScheduleItems();
  const updated = [...existing, ...newItems].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  );
  setItem("schedule", updated);
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
  return getItem<CachedProfile | null>("profile", null);
}

export function saveCachedProfile(profile: CachedProfile) {
  setItem("profile", profile);
}

// ══════════════════════════════════════════════════════════════════════
//  Clear All User Data
// ══════════════════════════════════════════════════════════════════════

export function clearAllUserData() {
  if (typeof window === "undefined") return;
  const keys = Object.keys(localStorage).filter(
    (k) => k.startsWith(PREFIX) || k.startsWith("schoolit_") || k.startsWith("schoolit-")
  );
  keys.forEach((k) => localStorage.removeItem(k));
  sessionStorage.removeItem("prolai-messages");
  sessionStorage.removeItem("schoolit-messages");
}

