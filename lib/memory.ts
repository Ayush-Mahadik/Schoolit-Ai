/**
 * Admin Memory System — SchoolIT AI
 * ====================================
 * Persists conversation history, key facts, and user data
 * for admin accounts ONLY (configured via ADMIN_EMAILS env var).
 * Data is stored in browser localStorage with email-scoped keys.
 * Memory is ONLY accessible to verified admin users.
 * Data is exported/imported as JSON "text file" format.
 *
 * STORAGE: Browser localStorage (per-browser, per-device).
 * To persist across devices, use Export → Import.
 *
 * SECURITY: No admin emails are hardcoded in source code.
 * Admin status is determined by the NextAuth session which checks
 * the ADMIN_EMAILS environment variable server-side.
 */

const MEMORY_PREFIX = "schoolit_memory_";
const MAX_CONVERSATIONS = 100;
const MAX_MEMORY_FACTS = 200;
const MAX_SUMMARY_LENGTH = 500;

// ── Admin Lock — admin status comes from NextAuth session ─────────────
let _currentUserEmail: string | null = null;
let _isAdmin: boolean = false;

/** Set the current user's email and admin status — call on auth state change */
export function setMemoryUser(email: string | null, isAdmin: boolean = false) {
  _currentUserEmail = email?.toLowerCase() || null;
  _isAdmin = isAdmin;
}

/** Check if the current user is an admin who owns the memory */
export function isMemoryOwner(): boolean {
  return _isAdmin && !!_currentUserEmail;
}

/** Get the current memory user email */
export function getMemoryUser(): string | null {
  return _currentUserEmail;
}

// ── Types ─────────────────────────────────────────────────────────────

export interface ConversationRecord {
  id: string;
  subject: string;
  messages: { role: "user" | "assistant"; content: string; timestamp: string }[];
  summary: string;
  createdAt: string;
  model: string;
}

export interface MemoryFact {
  id: string;
  fact: string;
  category: "preference" | "academic" | "personal" | "project" | "schedule";
  createdAt: string;
  source: string; // which conversation it came from
}

export interface AdminData {
  conversations: ConversationRecord[];
  memoryFacts: MemoryFact[];
  userProfile: {
    name: string;
    email: string;
    timezone: string;
    lastActive: string;
  };
  exportedAt: string;
}

// ── Helpers ───────────────────────────────────────────────────────────

function getItem<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  if (!isMemoryOwner()) return fallback; // Only admin can read memory
  try {
    const raw = localStorage.getItem(MEMORY_PREFIX + key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function setItem(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  if (!isMemoryOwner()) return; // Only admin can write memory
  try {
    localStorage.setItem(MEMORY_PREFIX + key, JSON.stringify(value));
  } catch {
    // Storage full — prune old conversations
    pruneOldConversations();
    try {
      localStorage.setItem(MEMORY_PREFIX + key, JSON.stringify(value));
    } catch {
      // Still full — give up silently
    }
  }
}

function pruneOldConversations() {
  const convos = getConversations();
  if (convos.length > MAX_CONVERSATIONS / 2) {
    setItem("conversations", convos.slice(0, MAX_CONVERSATIONS / 2));
  }
}

// ── Conversation History ──────────────────────────────────────────────

export function getConversations(): ConversationRecord[] {
  return getItem<ConversationRecord[]>("conversations", []);
}

export function saveConversation(record: ConversationRecord) {
  const convos = getConversations();
  const idx = convos.findIndex((c) => c.id === record.id);
  if (idx >= 0) {
    convos[idx] = record;
  } else {
    convos.unshift(record);
  }
  setItem("conversations", convos.slice(0, MAX_CONVERSATIONS));
}

export function getConversation(id: string): ConversationRecord | null {
  return getConversations().find((c) => c.id === id) || null;
}

// ── Memory Facts ──────────────────────────────────────────────────────

export function getMemoryFacts(): MemoryFact[] {
  return getItem<MemoryFact[]>("facts", []);
}

export function addMemoryFact(fact: Omit<MemoryFact, "id" | "createdAt">) {
  const facts = getMemoryFacts();
  // Deduplicate similar facts
  const exists = facts.some(
    (f) => f.fact.toLowerCase().trim() === fact.fact.toLowerCase().trim()
  );
  if (exists) return;

  facts.unshift({
    ...fact,
    id: `fact-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    createdAt: new Date().toISOString(),
  });
  setItem("facts", facts.slice(0, MAX_MEMORY_FACTS));
}

export function removeMemoryFact(id: string) {
  const facts = getMemoryFacts().filter((f) => f.id !== id);
  setItem("facts", facts);
}

// ── Build Memory Context for AI ───────────────────────────────────────

export function buildMemoryContext(): string {
  const facts = getMemoryFacts();
  const convos = getConversations();

  if (facts.length === 0 && convos.length === 0) return "";

  const parts: string[] = [];

  // Add memory facts
  if (facts.length > 0) {
    const grouped: Record<string, string[]> = {};
    for (const f of facts.slice(0, 50)) {
      if (!grouped[f.category]) grouped[f.category] = [];
      grouped[f.category].push(f.fact);
    }

    parts.push("## Remembered Facts About This User:");
    for (const [category, items] of Object.entries(grouped)) {
      parts.push(`### ${category.charAt(0).toUpperCase() + category.slice(1)}:`);
      items.forEach((item) => parts.push(`- ${item}`));
    }
  }

  // Add recent conversation summaries
  if (convos.length > 0) {
    parts.push("\n## Recent Conversation History:");
    const recent = convos.slice(0, 15);
    for (const c of recent) {
      const date = new Date(c.createdAt).toLocaleDateString("en-IN", {
        month: "short",
        day: "numeric",
      });
      const msgPreview = c.summary || c.messages[0]?.content?.slice(0, 100) || "No content";
      parts.push(`- [${date}] (${c.subject}) ${msgPreview}`);
    }
  }

  return parts.join("\n");
}

// ── Summarize a conversation (client-side) ────────────────────────────

export function summarizeConversation(
  messages: { role: string; content: string }[]
): string {
  // Extract the first user message and first assistant response as summary
  const userMsg = messages.find((m) => m.role === "user");
  const assistMsg = messages.find((m) => m.role === "assistant");

  const userPart = userMsg?.content?.slice(0, 150) || "";
  const assistPart = assistMsg?.content?.slice(0, 200) || "";

  return `Q: ${userPart}${userPart.length >= 150 ? "..." : ""} → A: ${assistPart}${assistPart.length >= 200 ? "..." : ""}`.slice(0, MAX_SUMMARY_LENGTH);
}

// ── Extract facts from a conversation (heuristic) ─────────────────────

export function extractFactsFromConversation(
  messages: { role: string; content: string }[],
  conversationId: string
): MemoryFact[] {
  const extracted: MemoryFact[] = [];
  const userMessages = messages.filter((m) => m.role === "user");

  for (const msg of userMessages) {
    const content = msg.content.toLowerCase();

    // Detect preferences
    if (content.includes("i prefer") || content.includes("i like") || content.includes("i want")) {
      const sentence = msg.content.split(/[.!?\n]/).find(
        (s) => /i (prefer|like|want)/i.test(s)
      );
      if (sentence && sentence.length < 200) {
        extracted.push({
          id: `fact-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          fact: sentence.trim(),
          category: "preference",
          createdAt: new Date().toISOString(),
          source: conversationId,
        });
      }
    }

    // Detect projects
    if (content.includes("working on") || content.includes("my project") || content.includes("building")) {
      const sentence = msg.content.split(/[.!?\n]/).find(
        (s) => /working on|my project|building/i.test(s)
      );
      if (sentence && sentence.length < 200) {
        extracted.push({
          id: `fact-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          fact: sentence.trim(),
          category: "project",
          createdAt: new Date().toISOString(),
          source: conversationId,
        });
      }
    }

    // Detect academic info
    if (content.includes("exam") || content.includes("test") || content.includes("homework") || content.includes("studying")) {
      const sentence = msg.content.split(/[.!?\n]/).find(
        (s) => /exam|test|homework|studying/i.test(s)
      );
      if (sentence && sentence.length < 200) {
        extracted.push({
          id: `fact-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          fact: sentence.trim(),
          category: "academic",
          createdAt: new Date().toISOString(),
          source: conversationId,
        });
      }
    }
  }

  return extracted;
}

// ── Export All Admin Data as JSON (downloadable "text file") ──────────

export function exportAdminData(): string {
  const data: AdminData = {
    conversations: getConversations(),
    memoryFacts: getMemoryFacts(),
    userProfile: getItem("profile", {
      name: "",
      email: "",
      timezone: "Asia/Kolkata",
      lastActive: new Date().toISOString(),
    }),
    exportedAt: new Date().toISOString(),
  };
  return JSON.stringify(data, null, 2);
}

// ── Import Admin Data from JSON ──────────────────────────────────────

export function importAdminData(jsonStr: string): boolean {
  try {
    const data: AdminData = JSON.parse(jsonStr);
    if (data.conversations) setItem("conversations", data.conversations);
    if (data.memoryFacts) setItem("facts", data.memoryFacts);
    if (data.userProfile) setItem("profile", data.userProfile);
    return true;
  } catch {
    return false;
  }
}

// ── Download admin data as .txt file ─────────────────────────────────

export function downloadAdminData() {
  const data = exportAdminData();
  const blob = new Blob([data], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `schoolit-admin-data-${new Date().toISOString().split("T")[0]}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Clear all memory ─────────────────────────────────────────────────

export function clearAllMemory() {
  if (typeof window === "undefined") return;
  const keys = Object.keys(localStorage).filter((k) => k.startsWith(MEMORY_PREFIX));
  keys.forEach((k) => localStorage.removeItem(k));
}
