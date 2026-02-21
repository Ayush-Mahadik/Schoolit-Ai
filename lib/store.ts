/**
 * User Data Store — SchoolIT AI
 * ===============================
 * Persists user preferences, chat history metadata, and settings
 * using localStorage on the client side.
 * 
 * For a production DB, replace localStorage calls with fetch() to
 * a /api/user-data endpoint backed by Vercel KV / Postgres / etc.
 */

import type { AIModel, ThinkingMode, ChatSettings, ScheduleItem } from "@/lib/types";

const PREFIX = "schoolit_";

// ── Helpers ───────────────────────────────────────────────────────────

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

// ── User Preferences ─────────────────────────────────────────────────

export function getUserSettings(): ChatSettings {
  return getItem<ChatSettings>("settings", {
    persona: "balanced",
    useWebSearch: true,
    chainOfThought: false,
    model: "gpt-4o",
    thinkingMode: "balanced",
  });
}

export function saveUserSettings(settings: ChatSettings) {
  setItem("settings", settings);
}

// ── Chat History (metadata only — actual messages are in-memory) ─────

export interface ChatHistoryEntry {
  id: string;
  subject: string;
  title: string;
  messageCount: number;
  lastActive: string;
  model: AIModel;
}

export function getChatHistory(): ChatHistoryEntry[] {
  return getItem<ChatHistoryEntry[]>("chat_history", []);
}

export function saveChatHistoryEntry(entry: ChatHistoryEntry) {
  const history = getChatHistory();
  const idx = history.findIndex((h) => h.id === entry.id);
  if (idx >= 0) {
    history[idx] = entry;
  } else {
    history.unshift(entry);
  }
  // Keep only last 50 conversations
  setItem("chat_history", history.slice(0, 50));
}

export function deleteChatHistoryEntry(id: string) {
  const history = getChatHistory().filter((h) => h.id !== id);
  setItem("chat_history", history);
}

// ── Schedule Items ───────────────────────────────────────────────────

export function getScheduleItems(): ScheduleItem[] {
  return getItem<ScheduleItem[]>("schedule", []);
}

export function saveScheduleItems(items: ScheduleItem[]) {
  setItem("schedule", items);
}

// ── User Profile Cache ───────────────────────────────────────────────

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

// ── Clear all user data ──────────────────────────────────────────────

export function clearAllUserData() {
  if (typeof window === "undefined") return;
  const keys = Object.keys(localStorage).filter((k) => k.startsWith(PREFIX));
  keys.forEach((k) => localStorage.removeItem(k));
}
