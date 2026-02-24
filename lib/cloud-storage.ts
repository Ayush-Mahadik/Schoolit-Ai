/**
 * Cloud Storage Service — SchoolIT AI
 * =====================================
 * Provides cloud CRUD operations for conversation history using Firebase Firestore.
 * All functions gracefully return null/false when Firebase is not configured,
 * allowing seamless fallback to localStorage.
 *
 * Data structure in Firestore:
 *   users/{userEmail}/conversations/{conversationId}
 */

import { db, isFirebaseEnabled } from "./firebase";
import {
  doc,
  setDoc,
  getDocs,
  deleteDoc,
  collection,
  query,
  orderBy,
  limit,
  writeBatch,
} from "firebase/firestore";
import type { Message } from "./types";

// ── Types ──────────────────────────────────────────────────────────────

export interface CloudConversation {
  id: string;
  title: string;
  subject: string;
  timestamp: number;
  messageCount: number;
  preview: string;
  messages: SerializedMessage[];
  updatedAt?: number;
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

function sanitizeEmail(email: string): string {
  // Firestore document IDs can't contain '/'
  return email.replace(/[/.]/g, "_");
}

function serializeMessages(messages: Message[]): SerializedMessage[] {
  return messages.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    timestamp:
      m.timestamp instanceof Date ? m.timestamp.toISOString() : String(m.timestamp),
    thinking: m.thinking || undefined,
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
 * Save a conversation to Firestore.
 * Returns true on success, false if Firebase unavailable or error.
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
  if (!isFirebaseEnabled() || !db || !userEmail) return false;

  try {
    const userId = sanitizeEmail(userEmail);
    const docRef = doc(db, "users", userId, "conversations", conv.id);

    const cloudConv: CloudConversation = {
      id: conv.id,
      title: conv.title,
      subject: conv.subject,
      timestamp: conv.timestamp,
      messageCount: conv.messageCount,
      preview: conv.preview,
      messages: serializeMessages(conv.messages),
      updatedAt: Date.now(),
    };

    // Firestore doc size limit is 1MB. Truncate if needed.
    const json = JSON.stringify(cloudConv);
    if (json.length > 900_000) {
      // Strip message content to fit
      cloudConv.messages = cloudConv.messages.map((m) => ({
        ...m,
        content: m.content.slice(0, 3000),
      }));
    }

    await setDoc(docRef, cloudConv, { merge: true });
    return true;
  } catch (err) {
    console.warn("Cloud save failed:", err);
    return false;
  }
}

/**
 * Load all conversations for a user from Firestore.
 * Returns null if Firebase unavailable or error (caller should fall back to localStorage).
 */
export async function cloudLoadConversations(
  userEmail: string
): Promise<CloudConversation[] | null> {
  if (!isFirebaseEnabled() || !db || !userEmail) return null;

  try {
    const userId = sanitizeEmail(userEmail);
    const q = query(
      collection(db, "users", userId, "conversations"),
      orderBy("timestamp", "desc"),
      limit(50)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => d.data() as CloudConversation);
  } catch (err) {
    console.warn("Cloud load failed:", err);
    return null;
  }
}

/**
 * Delete a conversation from Firestore.
 */
export async function cloudDeleteConversation(
  userEmail: string,
  convId: string
): Promise<boolean> {
  if (!isFirebaseEnabled() || !db || !userEmail) return false;

  try {
    const userId = sanitizeEmail(userEmail);
    await deleteDoc(doc(db, "users", userId, "conversations", convId));
    return true;
  } catch (err) {
    console.warn("Cloud delete failed:", err);
    return false;
  }
}

/**
 * Clear all conversations for a user from Firestore.
 */
export async function cloudClearAll(userEmail: string): Promise<boolean> {
  if (!isFirebaseEnabled() || !db || !userEmail) return false;

  try {
    const userId = sanitizeEmail(userEmail);
    const q = query(collection(db, "users", userId, "conversations"));
    const snapshot = await getDocs(q);

    if (snapshot.empty) return true;

    const batch = writeBatch(db);
    snapshot.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    return true;
  } catch (err) {
    console.warn("Cloud clear failed:", err);
    return false;
  }
}
