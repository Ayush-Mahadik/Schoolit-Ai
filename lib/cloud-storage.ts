/**
 * Cloud Storage Service — SchoolIT AI
 * =====================================
 * SECURITY: All database operations go through /api/conversations (server-side).
 * No Supabase credentials are exposed to the browser.
 *
 * The server route validates the user session via NextAuth and uses
 * SUPABASE_SERVICE_ROLE_KEY (server-only) to talk to the database.
 *
 * All functions gracefully return null/false on failure,
 * allowing seamless fallback to localStorage.
 */

import type { Message } from "./types";
import { CSRF_HEADER } from "@/lib/config";
import { conversationCache, getCacheKey, invalidateConversationCache } from "@/lib/cache";

// ── CSRF Token ────────────────────────────────────────────────────────
let _csrfToken: string | null = null;
let _csrfFetchedAt = 0;
const CSRF_TTL_MS = 3 * 60 * 60 * 1000;

async function getCSRFToken(): Promise<string> {
  const now = Date.now();
  if (_csrfToken && now - _csrfFetchedAt < CSRF_TTL_MS) return _csrfToken;
  try {
    const res = await fetch("/api/csrf", { credentials: "same-origin" });
    if (res.ok) {
      const data = await res.json();
      _csrfToken = data.token || "";
      _csrfFetchedAt = now;
      return _csrfToken!;
    }
  } catch { /* ignore */ }
  return _csrfToken || "";
}

// ── Types ──────────────────────────────────────────────────────────────

export interface CloudConversation {
  id: string;
  user_email: string;
  title: string;
  subject: string;
  timestamp: number;
  message_count: number;
  preview: string;
  messages: SerializedMessage[];
  updated_at: number;
}

interface SerializedMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  thinking?: string;
  sources?: string[];
  toolCalls?: string[];
  model?: string;
  flowcharts?: unknown[];
  manimAnimations?: unknown[];
  generatedImages?: unknown[];
  flashcardSets?: unknown[];
  quizSets?: unknown[];
}

// ── Helpers ─────────────────────────────────────────────────────────────

function serializeMessages(messages: Message[]): SerializedMessage[] {
  return messages.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content.slice(0, 8000), // Limit per-message size
    timestamp:
      m.timestamp instanceof Date ? m.timestamp.toISOString() : String(m.timestamp),
    thinking: m.thinking ? m.thinking.slice(0, 2000) : undefined,
    sources: m.sources || undefined,
    toolCalls: m.toolCalls || undefined,
    model: m.model || undefined,
    flowcharts: m.flowcharts || undefined,
    manimAnimations: m.manimAnimations || undefined,
    generatedImages: m.generatedImages || undefined,
    flashcardSets: m.flashcardSets || undefined,
    quizSets: m.quizSets || undefined,
  }));
}

// ── Cloud CRUD (via server-side API route) ──────────────────────────────

/**
 * Save a conversation to the cloud via /api/conversations.
 * The server validates auth and uses the service role key.
 */
export async function cloudSaveConversation(
  userEmail: string,
  conv: {
    id: string;
    title: string;
    subject: string;
    timestamp: number;
    messageCount: number;
    preview: string;
    messages: Message[];
  }
): Promise<boolean> {
  if (!userEmail) return false;

  try {
    const csrfToken = await getCSRFToken();
    const res = await fetch("/api/conversations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [CSRF_HEADER]: csrfToken,
      },
      credentials: "same-origin",
      body: JSON.stringify({
        id: conv.id,
        title: conv.title.slice(0, 200),
        subject: conv.subject,
        timestamp: conv.timestamp,
        message_count: conv.messageCount,
        preview: conv.preview.slice(0, 300),
        messages: serializeMessages(conv.messages),
      }),
    });

    if (!res.ok) {
      console.warn("Cloud save failed:", res.status);
      return false;
    }

    // Invalidate cache after save
    invalidateConversationCache(userEmail);
    return true;
  } catch (err) {
    console.warn("Cloud save error:", err);
    return false;
  }
}

/**
 * Load all conversations for the current user from the cloud.
 * Uses LRU cache with 5-minute TTL and request deduplication.
 * Returns null if unavailable (caller falls back to localStorage).
 */
export async function cloudLoadConversations(
  userEmail: string
): Promise<CloudConversation[] | null> {
  if (!userEmail) return null;

  const cacheKey = getCacheKey("conversations", userEmail);

  try {
    return await conversationCache.get(
      cacheKey,
      async () => {
        const res = await fetch("/api/conversations");
        if (!res.ok) {
          console.warn("Cloud load failed:", res.status);
          return null;
        }

        const data = await res.json();
        return (data.conversations as CloudConversation[]) || null;
      },
      5 * 60 * 1000 // 5 minute TTL
    );
  } catch (err) {
    console.warn("Cloud load error:", err);
    return null;
  }
}

/**
 * Delete a conversation from the cloud.
 * Invalidates cache after deletion.
 */
export async function cloudDeleteConversation(
  userEmail: string,
  convId: string
): Promise<boolean> {
  if (!userEmail) return false;

  try {
    const csrfToken = await getCSRFToken();
    const res = await fetch(`/api/conversations?id=${encodeURIComponent(convId)}`, {
      method: "DELETE",
      headers: { [CSRF_HEADER]: csrfToken },
      credentials: "same-origin",
    });

    if (!res.ok) {
      console.warn("Cloud delete failed:", res.status);
      return false;
    }

    // Invalidate cache after delete
    invalidateConversationCache(userEmail);
    return true;
  } catch (err) {
    console.warn("Cloud delete error:", err);
    return false;
  }
}

/**
 * Clear all conversations for the current user from the cloud.
 * Invalidates cache after deletion.
 */
export async function cloudClearAll(userEmail: string): Promise<boolean> {
  if (!userEmail) return false;

  try {
    const csrfToken = await getCSRFToken();
    const res = await fetch("/api/conversations?clear_all=true", {
      method: "DELETE",
      headers: { [CSRF_HEADER]: csrfToken },
      credentials: "same-origin",
    });

    if (!res.ok) {
      console.warn("Cloud clear failed:", res.status);
      return false;
    }

    // Invalidate cache after clear
    invalidateConversationCache(userEmail);
    return true;
  } catch (err) {
    console.warn("Cloud clear error:", err);
    return false;
  }
}
