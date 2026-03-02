/**
 * Cloud Storage Service — PROLAI
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
    const res = await fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
    return true;
  } catch (err) {
    console.warn("Cloud save error:", err);
    return false;
  }
}

/**
 * Load all conversations for the current user from the cloud.
 * Returns null if unavailable (caller falls back to localStorage).
 */
export async function cloudLoadConversations(
  userEmail: string
): Promise<CloudConversation[] | null> {
  if (!userEmail) return null;

  try {
    const res = await fetch("/api/conversations");
    if (!res.ok) {
      console.warn("Cloud load failed:", res.status);
      return null;
    }

    const data = await res.json();
    return (data.conversations as CloudConversation[]) || null;
  } catch (err) {
    console.warn("Cloud load error:", err);
    return null;
  }
}

/**
 * Delete a conversation from the cloud.
 */
export async function cloudDeleteConversation(
  userEmail: string,
  convId: string
): Promise<boolean> {
  if (!userEmail) return false;

  try {
    const res = await fetch(`/api/conversations?id=${encodeURIComponent(convId)}`, {
      method: "DELETE",
    });

    if (!res.ok) {
      console.warn("Cloud delete failed:", res.status);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("Cloud delete error:", err);
    return false;
  }
}

/**
 * Clear all conversations for the current user from the cloud.
 */
export async function cloudClearAll(userEmail: string): Promise<boolean> {
  if (!userEmail) return false;

  try {
    const res = await fetch("/api/conversations?clear_all=true", {
      method: "DELETE",
    });

    if (!res.ok) {
      console.warn("Cloud clear failed:", res.status);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("Cloud clear error:", err);
    return false;
  }
}
