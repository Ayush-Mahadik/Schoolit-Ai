/**
 * Cloud Storage Service — SchoolIT AI
 * =====================================
 * Uses Supabase (free, GitHub Edu Pack) for persistent cloud storage.
 * All functions gracefully return null/false when Supabase is not configured,
 * allowing seamless fallback to localStorage.
 *
 * Table: conversations
 *   id TEXT PRIMARY KEY
 *   user_email TEXT
 *   title TEXT
 *   subject TEXT
 *   timestamp BIGINT
 *   message_count INT
 *   preview TEXT
 *   messages JSONB
 *   updated_at BIGINT
 */

import { getSupabase, isCloudEnabled } from "./supabase";
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

// ── Cloud CRUD ──────────────────────────────────────────────────────────

/**
 * Save a conversation to Supabase.
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
  const sb = getSupabase();
  if (!sb || !isCloudEnabled() || !userEmail) return false;

  try {
    const row: CloudConversation = {
      id: conv.id,
      user_email: userEmail,
      title: conv.title.slice(0, 200),
      subject: conv.subject,
      timestamp: conv.timestamp,
      message_count: conv.messageCount,
      preview: conv.preview.slice(0, 300),
      messages: serializeMessages(conv.messages),
      updated_at: Date.now(),
    };

    const { error } = await sb
      .from("conversations")
      .upsert(row, { onConflict: "id" });

    if (error) {
      console.warn("Cloud save error:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("Cloud save failed:", err);
    return false;
  }
}

/**
 * Load all conversations for a user from Supabase.
 * Returns null if unavailable (caller falls back to localStorage).
 */
export async function cloudLoadConversations(
  userEmail: string
): Promise<CloudConversation[] | null> {
  const sb = getSupabase();
  if (!sb || !isCloudEnabled() || !userEmail) return null;

  try {
    const { data, error } = await sb
      .from("conversations")
      .select("*")
      .eq("user_email", userEmail)
      .order("timestamp", { ascending: false })
      .limit(50);

    if (error) {
      console.warn("Cloud load error:", error.message);
      return null;
    }

    return (data as CloudConversation[]) || null;
  } catch (err) {
    console.warn("Cloud load failed:", err);
    return null;
  }
}

/**
 * Delete a conversation from Supabase.
 */
export async function cloudDeleteConversation(
  userEmail: string,
  convId: string
): Promise<boolean> {
  const sb = getSupabase();
  if (!sb || !isCloudEnabled() || !userEmail) return false;

  try {
    const { error } = await sb
      .from("conversations")
      .delete()
      .eq("id", convId)
      .eq("user_email", userEmail);

    if (error) {
      console.warn("Cloud delete error:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("Cloud delete failed:", err);
    return false;
  }
}

/**
 * Clear all conversations for a user from Supabase.
 */
export async function cloudClearAll(userEmail: string): Promise<boolean> {
  const sb = getSupabase();
  if (!sb || !isCloudEnabled() || !userEmail) return false;

  try {
    const { error } = await sb
      .from("conversations")
      .delete()
      .eq("user_email", userEmail);

    if (error) {
      console.warn("Cloud clear error:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("Cloud clear failed:", err);
    return false;
  }
}
