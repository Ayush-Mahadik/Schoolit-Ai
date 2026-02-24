/**
 * API Client — SchoolIT AI (v3.0)
 *
 * Uses relative URLs so it works on both Vercel and localhost.
 * Supports model selection, thinking modes, and file attachments.
 */

import type { AIModel, ThinkingMode } from "@/lib/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

// ── Timeout wrapper ──────────────────────────────────────────────────

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number = 120_000
): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("Request timed out. The server may be busy — please try again.");
    }
    throw err;
  } finally {
    clearTimeout(id);
  }
}

// ── Chat ─────────────────────────────────────────────────────────────

export interface ChatRequest {
  message: string;
  subject: string;
  persona: string;
  conversation_id?: string;
  use_web_search: boolean;
  chain_of_thought: boolean;
  model: AIModel;
  thinking_mode: ThinkingMode;
  history?: { role: string; content: string }[];
  context_files?: { name: string; content: string; type: string }[];
  schedule_context?: string;
  memory_context?: string;
}

export interface ChatResponse {
  response: string;
  conversation_id: string;
  thinking: string | null;
  animation_url: string | null;
  sources: string[];
  tool_calls: string[];
  charts?: unknown[];
  flowcharts?: { mermaidCode: string; title?: string; explanation?: string }[];
  manim_animations?: { code: string; sceneName: string; explanation: string }[];
  generated_images?: { prompt: string; style: string; subject?: string; url?: string }[];
  flashcard_sets?: { topic: string; cards: { front: string; back: string }[] }[];
  quiz_sets?: { topic: string; questions: { question: string; options: string[]; correct: number; explanation: string }[]; difficulty?: string }[];
  schedule_actions?: { action: string; items?: unknown[] }[];
  error: string | null;
  model?: string;
  rate_limit_remaining?: number;
}

export async function sendMessage(request: ChatRequest): Promise<ChatResponse> {
  let res: Response;
  try {
    res = await fetchWithTimeout(`${API_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
  } catch (err) {
    // Network-level failure (offline, DNS, CORS, timeout, Vercel 504)
    const msg = err instanceof Error ? err.message : "Network error";
    if (msg.includes("timed out") || msg.includes("abort")) {
      throw new Error("The request timed out. Try a shorter question or switch to a faster model.");
    }
    throw new Error("Could not connect to the server. Please check your connection and try again.");
  }

  // Try to parse JSON regardless of status code — our API always returns JSON
  let body: ChatResponse | null = null;
  try {
    body = await res.json();
  } catch {
    // Server returned non-JSON (e.g. Vercel 502/504 HTML page)
    throw new Error(`Server error (${res.status}). The service may be temporarily unavailable.`);
  }

  if (!res.ok && !body?.response) {
    const b = body as unknown as Record<string, unknown>;
    const msg = b?.message || b?.detail || `Server error (${res.status})`;
    throw new Error(String(msg));
  }

  return body!;
}

// ── Personas ─────────────────────────────────────────────────────────────────

export interface PersonaInfo {
  id: string;
  name: string;
  icon: string;
  description: string;
}

export async function fetchPersonas(): Promise<PersonaInfo[]> {
  try {
    const res = await fetch(`${API_URL}/api/personas`);
    if (!res.ok) throw new Error("Failed to fetch personas");
    const data = await res.json();
    return data.personas;
  } catch {
    return [
      { id: "formal", name: "Professor Precise", icon: "graduation-cap", description: "Strict, formal, textbook-accurate." },
      { id: "creative", name: "Ms. Visual", icon: "palette", description: "Uses analogies and visual thinking." },
      { id: "socratic", name: "Socrates", icon: "help-circle", description: "Guides through questions." },
      { id: "balanced", name: "Teacher AI", icon: "book-open", description: "Clear and balanced teaching." },
      { id: "exam_coach", name: "Exam Crusher", icon: "trophy", description: "Focused on exam technique." },
    ];
  }
}

// ── PDF Upload ───────────────────────────────────────────────────────────────

export async function uploadPdf(
  file: File,
  subject: string
): Promise<{ pdf_id: string; filename: string }> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("subject", subject);

  const res = await fetchWithTimeout(`${API_URL}/api/upload-pdf`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: "Upload failed" }));
    throw new Error(error.detail || `HTTP ${res.status}`);
  }

  return res.json();
}

export async function listPdfs(
  subject: string
): Promise<{ pdf_id: string; filename: string; pages: number }[]> {
  try {
    const res = await fetch(`${API_URL}/api/pdfs/${encodeURIComponent(subject)}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.pdfs || [];
  } catch {
    return [];
  }
}

export async function deletePdf(pdfId: string): Promise<void> {
  await fetch(`${API_URL}/api/pdfs/${encodeURIComponent(pdfId)}`, { method: "DELETE" });
}

// ── Manim (code generation) ──────────────────────────────────────────────────

export async function renderManim(
  code: string,
  sceneName?: string,
  quality: string = "medium_quality"
): Promise<{ video_url: string; scene_name: string; render_time: number }> {
  const res = await fetchWithTimeout(`${API_URL}/api/render-manim`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, scene_name: sceneName, quality }),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: "Render failed" }));
    throw new Error(error.detail || `HTTP ${res.status}`);
  }

  return res.json();
}

// ── Google Calendar ──────────────────────────────────────────────────────────

export async function getCalendarAuthUrl(): Promise<string | null> {
  try {
    const res = await fetch(`${API_URL}/api/calendar/auth-url`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.auth_url;
  } catch {
    return null;
  }
}

export async function listCalendarEvents(
  maxResults: number = 10
): Promise<{ id: string; title: string; start: string; end: string; link: string }[]> {
  try {
    const res = await fetch(`${API_URL}/api/calendar/events?max_results=${maxResults}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.events || [];
  } catch {
    return [];
  }
}

