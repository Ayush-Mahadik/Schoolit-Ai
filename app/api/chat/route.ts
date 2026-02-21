/**
 * Chat API Route — SchoolIT AI
 * ==============================
 * Multi-model support (GPT-4.1, GPT-4o, GPT-4o-mini)
 * Thinking modes (fast, balanced, deep)
 * Admin bypass for rate limiting
 * Agentic tool-use conversation loop
 */

import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getServerSession } from "next-auth";
import { authOptions, isAdminEmail } from "@/lib/auth";
import { buildSystemPrompt, VALID_SUBJECTS, type TeacherStyle } from "@/lib/server/prompts";
import { TOOL_DEFINITIONS, executeTool } from "@/lib/server/tools";

// ── Next.js route config ──────────────────────────────────────────────
export const dynamic = "force-dynamic";
export const maxDuration = 60; // seconds — prevents Vercel from killing AI calls at 10s

// ── Constants ─────────────────────────────────────────────────────────
const MAX_TOOL_ROUNDS = 8;
const MAX_MESSAGE_LENGTH = 12_000;
const MAX_HISTORY_MESSAGES = 30;
const VALID_PERSONAS = ["formal", "creative", "socratic", "balanced", "exam_coach"];

// Model mapping for GitHub Models endpoint
const MODEL_MAP: Record<string, string> = {
  "gpt-4.1": "gpt-4.1",
  "gpt-4o": "gpt-4o",
  "gpt-5-mini": "gpt-5-mini",
};

// Token limits per thinking mode
const THINKING_MODE_TOKENS: Record<string, number> = {
  fast: 2048,
  balanced: 4096,
  deep: 8192,
};

// ── In-Memory Rate Limiter ────────────────────────────────────────────
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_NORMAL = 25; // Authenticated users: 25/min
const RATE_WINDOW_MS = 60_000;

function checkRateLimit(ip: string, isAdmin: boolean): { allowed: boolean; remaining: number } {
  // Admins bypass rate limiting
  if (isAdmin) return { allowed: true, remaining: 999 };

  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  const limit = RATE_LIMIT_NORMAL;

  // Periodic cleanup
  if (rateLimitMap.size > 10_000) {
    const keysToDelete: string[] = [];
    rateLimitMap.forEach((val, key) => {
      if (now > val.resetAt) keysToDelete.push(key);
    });
    keysToDelete.forEach((k) => rateLimitMap.delete(k));
  }

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return { allowed: true, remaining: limit - 1 };
  }
  if (entry.count >= limit) return { allowed: false, remaining: 0 };
  entry.count++;
  return { allowed: true, remaining: limit - entry.count };
}

// ── OpenAI Client ─────────────────────────────────────────────────────
function getClient(): OpenAI | null {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return null;
  return new OpenAI({
    baseURL: process.env.AI_BASE_URL || "https://models.inference.ai.azure.com",
    apiKey: token,
  });
}

// ── Input Sanitization ────────────────────────────────────────────────
function sanitizeString(str: string, maxLen: number): string {
  return str
    .replace(/\x00/g, "")
    .replace(/[\x01-\x08]/g, "")
    .trim()
    .slice(0, maxLen);
}

// ══════════════════════════════════════════════════════════════════════
//  POST /api/chat
// ══════════════════════════════════════════════════════════════════════

export async function POST(req: NextRequest) {
 try {
  // Check auth & admin status
  let isAdmin = false;
  let userEmail = "";
  try {
    const session = await getServerSession(authOptions);
    if (session?.user?.email) {
      userEmail = session.user.email;
      isAdmin = isAdminEmail(userEmail);
    }
  } catch {
    // No session — treat as guest
  }

  // Rate limit (admins bypass)
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rateCheck = checkRateLimit(ip, isAdmin);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: "rate_limited", message: "Too many requests. Please wait a moment and try again." },
      {
        status: 429,
        headers: { "X-RateLimit-Remaining": "0" },
      }
    );
  }

  // Parse body
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "bad_request", message: "Invalid JSON body." },
      { status: 400 }
    );
  }

  // Validate required fields
  const rawMessage = body.message;
  if (!rawMessage || typeof rawMessage !== "string" || rawMessage.trim().length === 0) {
    return NextResponse.json(
      { error: "validation", message: "Message is required." },
      { status: 400 }
    );
  }

  const message = sanitizeString(String(rawMessage), MAX_MESSAGE_LENGTH);
  if (message.length === 0) {
    return NextResponse.json(
      { error: "validation", message: "Message cannot be empty." },
      { status: 400 }
    );
  }

  // Validate optional fields
  const subject = VALID_SUBJECTS.includes(String(body.subject || "").toLowerCase())
    ? String(body.subject).toLowerCase()
    : "general";
  const persona: TeacherStyle = VALID_PERSONAS.includes(String(body.persona || ""))
    ? (String(body.persona) as TeacherStyle)
    : "balanced";
  const useWebSearch = body.use_web_search !== false;

  // Thinking mode
  const thinkingMode = ["fast", "balanced", "deep"].includes(String(body.thinking_mode || ""))
    ? String(body.thinking_mode)
    : "balanced";
  const chainOfThought = thinkingMode === "deep" || body.chain_of_thought === true;
  const maxTokens = THINKING_MODE_TOKENS[thinkingMode] || 4096;

  // Model selection
  const requestedModel = String(body.model || "gpt-4o");
  const modelId = MODEL_MAP[requestedModel] || "gpt-4o";

  const history = Array.isArray(body.history) ? body.history : [];
  const contextFiles = Array.isArray(body.context_files) ? body.context_files : [];

  // Build file context string
  let fileContext: string | undefined;
  if (contextFiles.length > 0) {
    const parts = contextFiles
      .slice(0, 5)
      .map((f: Record<string, unknown>) => {
        const name = sanitizeString(String(f.name || "file"), 200);
        const content = sanitizeString(String(f.content || ""), 15_000);
        return `### File: ${name}\n${content}`;
      });
    fileContext = parts.join("\n\n");
  }

  // Build system prompt
  const systemPrompt = buildSystemPrompt(persona, subject, chainOfThought, fileContext);

  // Get OpenAI client
  const client = getClient();
  if (!client) {
    return NextResponse.json({
      response:
        "The AI service is not configured. Please set the GITHUB_TOKEN environment variable on the server.",
      conversation_id: crypto.randomUUID(),
      error: "GITHUB_TOKEN not configured. Get one at github.com/settings/tokens",
      sources: [],
      tool_calls: [],
      charts: [],
      model: modelId,
    });
  }

  // Build messages array
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
  ];

  // Add conversation history
  const trimmedHistory = history.slice(-MAX_HISTORY_MESSAGES);
  for (const msg of trimmedHistory) {
    const role = String(msg.role || "");
    if (role === "user" || role === "assistant") {
      messages.push({
        role: role as "user" | "assistant",
        content: sanitizeString(String(msg.content || ""), MAX_MESSAGE_LENGTH),
      });
    }
  }

  // Add current user message (with image support)
  const imageFiles = contextFiles.filter(
    (f: Record<string, unknown>) =>
      String(f.type || "").startsWith("image/") && String(f.content || "").startsWith("data:")
  );

  if (imageFiles.length > 0) {
    const contentParts: OpenAI.Chat.ChatCompletionContentPart[] = [
      { type: "text", text: message },
    ];
    for (const img of imageFiles.slice(0, 3)) {
      contentParts.push({
        type: "image_url",
        image_url: { url: String(img.content), detail: "auto" },
      });
    }
    messages.push({ role: "user", content: contentParts });
  } else {
    messages.push({ role: "user", content: message });
  }

  // Build tool list
  const tools = useWebSearch
    ? TOOL_DEFINITIONS
    : TOOL_DEFINITIONS.filter((t) => t.function.name !== "web_search");

  // Tracking
  const sources: string[] = [];
  const toolCallsLog: string[] = [];
  const charts: unknown[] = [];

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await client.chat.completions.create({
        model: modelId,
        max_tokens: maxTokens,
        messages,
        tools: tools.length > 0 ? tools : undefined,
        tool_choice: tools.length > 0 ? "auto" : undefined,
      });

      const choice = response.choices[0];
      const assistantMsg = choice.message;

      // If model wants to call tools
      if (assistantMsg.tool_calls && assistantMsg.tool_calls.length > 0) {
        messages.push({
          role: "assistant",
          content: assistantMsg.content || "",
          tool_calls: assistantMsg.tool_calls.map((tc) => ({
            id: tc.id,
            type: "function" as const,
            function: { name: tc.function.name, arguments: tc.function.arguments },
          })),
        });

        for (const tc of assistantMsg.tool_calls) {
          const toolName = tc.function.name;
          let toolInput: Record<string, unknown> = {};
          try {
            toolInput = JSON.parse(tc.function.arguments);
          } catch {
            toolInput = {};
          }

          toolCallsLog.push(toolName);
          const toolResult = await executeTool(toolName, toolInput);
          if (toolResult.sources) sources.push(...toolResult.sources);
          if (toolResult.chartData) charts.push(toolResult.chartData);

          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: JSON.stringify(toolResult.result),
          });
        }

        continue;
      }

      // Model done — extract final response
      let finalText = assistantMsg.content || "";

      if (charts.length > 0) {
        for (const chart of charts) {
          finalText += `\n\n\`\`\`chart\n${JSON.stringify(chart)}\n\`\`\``;
        }
      }

      return NextResponse.json({
        response: finalText,
        conversation_id: crypto.randomUUID(),
        thinking: chainOfThought ? "Deep reasoning mode was active for this response." : null,
        animation_url: null,
        sources: Array.from(new Set(sources)),
        tool_calls: toolCallsLog,
        charts,
        error: null,
        model: modelId,
        rate_limit_remaining: rateCheck.remaining,
      });
    }

    // Max rounds exceeded
    return NextResponse.json({
      response:
        "I performed multiple research steps but couldn't fully resolve the query. Here's what I found so far — please try rephrasing your question.",
      conversation_id: crypto.randomUUID(),
      sources: Array.from(new Set(sources)),
      tool_calls: toolCallsLog,
      charts,
      error: null,
      model: modelId,
    });
  } catch (error: unknown) {
    console.error("Chat API error:", error);

    const rawMsg = error instanceof Error ? error.message : String(error);
    const msg = rawMsg.toLowerCase();
    const statusCode = (error as { status?: number })?.status;
    let userError = "Something went wrong. Please try again in a moment.";
    let statusHint = "";

    if (statusCode === 429 || msg.includes("rate") || msg.includes("429")) {
      userError = "The AI service is rate-limited. Please wait 30 seconds and try again.";
      statusHint = "rate_limited";
    } else if (statusCode === 401 || msg.includes("auth") || msg.includes("401") || msg.includes("api_key") || msg.includes("unauthorized") || msg.includes("invalid")) {
      userError = "API authentication failed. The server token may be expired — please contact the admin.";
      statusHint = "auth_error";
    } else if (statusCode === 403 || msg.includes("403") || msg.includes("forbidden") || msg.includes("permission")) {
      userError = "Access denied by the AI service. The API token may not have the required permissions.";
      statusHint = "forbidden";
    } else if (msg.includes("quota") || msg.includes("billing") || msg.includes("exceeded") || msg.includes("insufficient")) {
      userError = "API quota exceeded. Please try again later or contact the admin.";
      statusHint = "quota_exceeded";
    } else if (msg.includes("connect") || msg.includes("network") || msg.includes("econnrefused") || msg.includes("fetch") || msg.includes("enotfound")) {
      userError = "Could not reach the AI service. This is usually a temporary issue — please try again.";
      statusHint = "network_error";
    } else if (msg.includes("timeout") || msg.includes("timed out") || msg.includes("deadline")) {
      userError = "The request timed out. Try asking a shorter question or switch to a faster model.";
      statusHint = "timeout";
    } else if (statusCode === 404 || msg.includes("model") || msg.includes("not found") || msg.includes("does not exist") || msg.includes("404")) {
      userError = `Model "${modelId}" is not available right now. Try switching to GPT-4o.`;
      statusHint = "model_not_found";
    } else if (msg.includes("content_filter") || msg.includes("content policy") || msg.includes("safety")) {
      userError = "Your message was flagged by the content safety filter. Please rephrase your question.";
      statusHint = "content_filter";
    } else if (statusCode && statusCode >= 500) {
      userError = "The AI service is experiencing issues. Please try again in a moment.";
      statusHint = "server_error";
    }

    console.error(`Chat error [${statusHint || "unknown"}]: ${rawMsg}`);

    return NextResponse.json({
      response: userError,
      conversation_id: crypto.randomUUID(),
      error: statusHint || "unknown_error",
      error_detail: process.env.NODE_ENV === "development" ? rawMsg : undefined,
      sources: [],
      tool_calls: [],
      charts: [],
      model: modelId,
    });
  }
 } catch (fatal: unknown) {
    // Top-level safety net — ensures we ALWAYS return JSON, never a naked 500
    console.error("FATAL chat route error:", fatal);
    return NextResponse.json(
      {
        response: "An unexpected error occurred. Please try again.",
        conversation_id: crypto.randomUUID(),
        error: "internal_error",
        sources: [],
        tool_calls: [],
        charts: [],
        model: "unknown",
      },
      { status: 200 }
    );
  }
}

