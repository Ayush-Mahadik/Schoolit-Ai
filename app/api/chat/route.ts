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

// Model mapping for GitHub Models endpoint — all models support function calling
const MODEL_MAP: Record<string, string> = {
  "gpt-4.1": "gpt-4.1",
  "gpt-4o": "gpt-4o",
  "gpt-4o-mini": "gpt-4o-mini",
  "Mistral-large-2411": "Mistral-large-2411",
  "xai/grok-3-mini": "xai/grok-3-mini",
};

// Models that require max_completion_tokens instead of max_tokens
const USES_MAX_COMPLETION_TOKENS = new Set<string>();

// All current models support function calling — no exclusions needed
const NO_TOOL_SUPPORT = new Set<string>();

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
  const token = process.env.GITHUB_TOKEN?.trim();
  if (!token) return null;
  return new OpenAI({
    baseURL: (process.env.AI_BASE_URL || "https://models.inference.ai.azure.com").trim(),
    apiKey: token,
  });
}

// ── Input Sanitization ────────────────────────────────────────────────
function sanitizeString(str: string, maxLen: number): string {
  return str
    .replace(/\x00/g, "")
    .replace(/[\x01-\x08]/g, "")
    .replace(/[\x0E-\x1F]/g, "") // Remove more control chars
    .trim()
    .slice(0, maxLen);
}

// ── Request validation ────────────────────────────────────────────────
function validateOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin") || "";
  const referer = req.headers.get("referer") || "";
  // Allow same-origin and Vercel preview deployments
  if (!origin && !referer) return true; // Server-side or non-browser
  const allowed = [
    "https://schoolit-ai.vercel.app",
    "http://localhost:3000",
    "http://localhost:3001",
  ];
  return allowed.some((a) => origin.startsWith(a) || referer.startsWith(a)) ||
    origin.includes(".vercel.app") || referer.includes(".vercel.app");
}

// ══════════════════════════════════════════════════════════════════════
//  POST /api/chat
// ══════════════════════════════════════════════════════════════════════

export async function POST(req: NextRequest) {
 try {
  // Validate request origin (CSRF protection)
  if (!validateOrigin(req)) {
    return NextResponse.json(
      { error: "forbidden", message: "Invalid request origin." },
      { status: 403 }
    );
  }

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
  const requestedModel = String(body.model || "gpt-4.1");
  const modelId = MODEL_MAP[requestedModel] || "gpt-4.1";

  const history = Array.isArray(body.history) ? body.history : [];
  const contextFiles = Array.isArray(body.context_files) ? body.context_files : [];
  const scheduleContext = typeof body.schedule_context === "string" ? body.schedule_context : "";
  const memoryContext = typeof body.memory_context === "string" ? body.memory_context : "";

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

  // Build system prompt (with memory context for admin)
  const systemPrompt = buildSystemPrompt(persona, subject, chainOfThought, fileContext, memoryContext || undefined);

  // Append schedule context if available
  const fullSystemPrompt = scheduleContext
    ? systemPrompt + `\n\n## Student's Current Schedule:\n${scheduleContext}\n\nWhen the student asks about scheduling, planning, or study sessions, use the manage_schedule tool to add items. Reference their existing schedule when relevant.`
    : systemPrompt;

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
    { role: "system", content: fullSystemPrompt },
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
  const flowcharts: { mermaidCode: string; title?: string; explanation?: string }[] = [];
  const manimAnimations: { code: string; sceneName: string; explanation: string }[] = [];
  const generatedImages: { prompt: string; style: string; subject?: string }[] = [];
  const scheduleActions: unknown[] = [];

  try {
    // Model fallback chain: try requested model, then fallback options
    const FALLBACK_CHAIN: Record<string, string[]> = {
      "gpt-4.1": ["gpt-4o", "Mistral-large-2411", "gpt-4o-mini"],
      "gpt-4o": ["gpt-4.1", "Mistral-large-2411", "gpt-4o-mini"],
      "gpt-4o-mini": ["gpt-4o", "gpt-4.1"],
      "Mistral-large-2411": ["gpt-4.1", "gpt-4o", "gpt-4o-mini"],
      "xai/grok-3-mini": ["gpt-4.1", "gpt-4o", "Mistral-large-2411"],
    };

    let activeModelId = modelId;

    // Newer models (gpt-5-mini) require max_completion_tokens, older ones use max_tokens
    const tokenParam = USES_MAX_COMPLETION_TOKENS.has(modelId)
      ? { max_completion_tokens: maxTokens }
      : { max_tokens: maxTokens };

    // Helper: attempt an API call, with automatic model fallback on 404/rate-limit
    const callWithFallback = async (msgs: OpenAI.Chat.ChatCompletionMessageParam[]) => {
      const modelsToTry = [activeModelId, ...(FALLBACK_CHAIN[activeModelId] || [])];
      let lastError: unknown = null;

      for (const tryModel of modelsToTry) {
        try {
          // Disable tools for models that don't support OpenAI function-calling
          const modelSupportsTools = !NO_TOOL_SUPPORT.has(tryModel);
          const useTools = modelSupportsTools && tools.length > 0;

          // Filter out tool messages if switching to a no-tool model
          let filteredMsgs = msgs;
          if (!modelSupportsTools) {
            filteredMsgs = msgs.filter((m) => m.role !== "tool");
            // Also strip tool_calls from assistant messages
            filteredMsgs = filteredMsgs.map((m) => {
              if (m.role === "assistant" && "tool_calls" in m) {
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const { tool_calls: _tc, ...rest } = m as unknown as Record<string, unknown>;
                return rest as unknown as OpenAI.Chat.ChatCompletionMessageParam;
              }
              return m;
            });
          }

          const response = await client!.chat.completions.create({
            model: tryModel,
            ...tokenParam,
            messages: filteredMsgs,
            tools: useTools ? tools : undefined,
            tool_choice: useTools ? "auto" : undefined,
          });
          // If we fell back to a different model, remember it
          if (tryModel !== activeModelId) {
            console.log(`Model fallback: ${activeModelId} → ${tryModel}`);
            activeModelId = tryModel;
          }
          return response;
        } catch (err: unknown) {
          const status = (err as { status?: number })?.status;
          const msg = err instanceof Error ? err.message.toLowerCase() : "";
          const isRetryable = status === 404 || status === 429 || msg.includes("not found") || msg.includes("model") || msg.includes("rate");

          if (isRetryable && tryModel !== modelsToTry[modelsToTry.length - 1]) {
            console.warn(`Model ${tryModel} failed (${status}), trying next fallback...`);
            lastError = err;
            // Brief delay before retry
            await new Promise((r) => setTimeout(r, 500));
            continue;
          }
          throw err;
        }
      }
      throw lastError;
    }

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await callWithFallback(messages);

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
          if (toolResult.flowchartData) flowcharts.push(toolResult.flowchartData as { mermaidCode: string; title?: string; explanation?: string });
          if (toolResult.manimData) manimAnimations.push(toolResult.manimData as { code: string; sceneName: string; explanation: string });
          if (toolResult.imageData) generatedImages.push(toolResult.imageData as { prompt: string; style: string; subject?: string });
          if (toolResult.scheduleData) scheduleActions.push(toolResult.scheduleData);

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

      // Append flowchart mermaid blocks
      if (flowcharts.length > 0) {
        for (const fc of flowcharts) {
          finalText += `\n\n\`\`\`mermaid\n${fc.mermaidCode}\n\`\`\``;
        }
      }

      // Append manim code blocks
      if (manimAnimations.length > 0) {
        for (const anim of manimAnimations) {
          finalText += `\n\n\`\`\`manim\n${anim.code}\n\`\`\``;
        }
      }

      // Append image blocks
      if (generatedImages.length > 0) {
        for (const img of generatedImages) {
          finalText += `\n\n\`\`\`image\n${JSON.stringify(img)}\n\`\`\``;
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
        flowcharts,
        manim_animations: manimAnimations,
        generated_images: generatedImages,
        schedule_actions: scheduleActions,
        error: null,
        model: activeModelId,
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
      flowcharts,
      manim_animations: manimAnimations,
      generated_images: generatedImages,
      schedule_actions: scheduleActions,
      error: null,
      model: activeModelId,
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
      userError = `The model "${modelId}" isn't available right now. Try switching to GPT-4.1 or Grok 3 Mini.`;
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

