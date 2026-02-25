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

// Model mapping — ALL verified working on GitHub Models (models.inference.ai.azure.com)
const MODEL_MAP: Record<string, string> = {
  "gpt-4.1": "gpt-4.1",
  "gpt-4o": "gpt-4o",
  "grok-3": "grok-3",
  "grok-3-mini": "grok-3-mini",
};

// Models that require max_completion_tokens instead of max_tokens
const USES_MAX_COMPLETION_TOKENS = new Set<string>();

// Models that do NOT support function calling (tools)
const NO_TOOL_SUPPORT = new Set<string>([]);

// Models that do NOT support vision (image_url content parts)
const NO_VISION_SUPPORT = new Set<string>(["grok-3", "grok-3-mini"]);

// Models that return reasoning_content (grok-3-mini style thinking)
const HAS_REASONING_CONTENT = new Set<string>(["grok-3-mini"]);

// Token limits per thinking mode — generous to avoid truncation
const THINKING_MODE_TOKENS: Record<string, number> = {
  fast: 16384,
  balanced: 16384,
  deep: 16384,
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

  // Only send image_url parts to models that support vision
  const modelSupportsVision = !NO_VISION_SUPPORT.has(modelId);

  // Filter oversized images (>2MB base64 ≈ 1.5MB actual) to prevent API failures
  const safeImages = imageFiles.filter((f: Record<string, unknown>) => String(f.content || "").length < 2_000_000);
  const oversizedCount = imageFiles.length - safeImages.length;

  if (safeImages.length > 0 && modelSupportsVision) {
    const sizeNote = oversizedCount > 0 ? `\n\n(${oversizedCount} image(s) skipped — too large. Please resize to under 1.5MB.)` : "";
    const contentParts: OpenAI.Chat.ChatCompletionContentPart[] = [
      { type: "text", text: message + sizeNote },
    ];
    for (const img of safeImages.slice(0, 3)) {
      contentParts.push({
        type: "image_url",
        image_url: { url: String(img.content), detail: "auto" },
      });
    }
    messages.push({ role: "user", content: contentParts });
  } else if (imageFiles.length > 0 && !modelSupportsVision) {
    // Model doesn't support vision — add image context as text description
    const imageNote = `\n\n[The user attached ${imageFiles.length} image(s): ${imageFiles.map((f: Record<string, unknown>) => String(f.name || "image")).join(", ")}. This model doesn't support direct image analysis. Please let the user know you can see they attached images but recommend switching to GPT-4.1 or GPT-4o for image/screenshot analysis.]`;
    messages.push({ role: "user", content: message + imageNote });
  } else if (oversizedCount > 0) {
    messages.push({ role: "user", content: message + `\n\n[The uploaded image(s) were too large to process. Please resize to under 1.5MB per image and try again.]` });
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
  const generatedImages: { prompt: string; style: string; subject?: string; url?: string }[] = [];
  const flashcardSets: { topic: string; cards: { front: string; back: string }[] }[] = [];
  const quizSets: { topic: string; questions: { question: string; options: string[]; correct: number; explanation: string }[]; difficulty?: string }[] = [];
  const scheduleActions: unknown[] = [];
  const searchImages: { url: string; thumbnail: string; title: string; source: string }[] = [];

  try {
    // Model fallback chains — all verified on GitHub Models endpoint
    const FALLBACK_CHAIN: Record<string, string[]> = {
      "gpt-4.1": ["gpt-4o", "grok-3", "grok-3-mini"],
      "gpt-4o": ["gpt-4.1", "grok-3", "grok-3-mini"],
      "grok-3": ["grok-3-mini", "gpt-4.1", "gpt-4o"],
      "grok-3-mini": ["grok-3", "gpt-4.1", "gpt-4o"],
    };

    let activeModelId = modelId;

    // Newer models (gpt-5-mini) require max_completion_tokens, older ones use max_tokens
    const tokenParam = USES_MAX_COMPLETION_TOKENS.has(modelId)
      ? { max_completion_tokens: maxTokens }
      : { max_tokens: maxTokens };

    // Track which round we're on for smarter timeout management
    let loopRound = 0;

    // Helper: attempt an API call, with automatic model fallback on 404/rate-limit
    // Uses per-call timeout to prevent burning through the 60s Vercel limit
    const callWithFallback = async (msgs: OpenAI.Chat.ChatCompletionMessageParam[]) => {
      // After first success, only try 1 fallback (save time for tool-loop rounds)
      const chain = FALLBACK_CHAIN[activeModelId] || [];
      const maxFallbacks = loopRound === 0 ? 2 : 1;
      const modelsToTry = [activeModelId, ...chain.slice(0, maxFallbacks)];
      let lastError: unknown = null;
      // Per-call timeout: 25s on first round, 20s on subsequent (leave room for Vercel 60s)
      const callTimeout = loopRound === 0 ? 25_000 : 20_000;

      for (const tryModel of modelsToTry) {
        try {
          // Disable tools for models that don't support OpenAI function-calling
          const modelSupportsTools = !NO_TOOL_SUPPORT.has(tryModel);
          const useTools = modelSupportsTools && tools.length > 0;

          // Filter out tool messages if switching to a no-tool model
          let filteredMsgs = msgs;
          if (!modelSupportsTools) {
            filteredMsgs = msgs.filter((m) => m.role !== "tool");
            filteredMsgs = filteredMsgs.map((m) => {
              if (m.role === "assistant" && "tool_calls" in m) {
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const { tool_calls: _tc, ...rest } = m as unknown as Record<string, unknown>;
                return rest as unknown as OpenAI.Chat.ChatCompletionMessageParam;
              }
              return m;
            });
          }

          // Strip image_url parts from messages for models that don't support vision
          if (NO_VISION_SUPPORT.has(tryModel)) {
            filteredMsgs = filteredMsgs.map((m) => {
              if (m.role === "user" && Array.isArray(m.content)) {
                const textParts = (m.content as OpenAI.Chat.ChatCompletionContentPart[])
                  .filter((p) => p.type === "text")
                  .map((p) => (p as { type: "text"; text: string }).text);
                return { ...m, content: textParts.join("\n") || "Analyze the attached content" };
              }
              return m;
            });
          }

          // Use AbortSignal.timeout to prevent a single model call from eating all 60s
          const response = await Promise.race([
            client!.chat.completions.create({
              model: tryModel,
              ...tokenParam,
              messages: filteredMsgs,
              tools: useTools ? tools : undefined,
              tool_choice: useTools ? "auto" : undefined,
            }),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error(`Model ${tryModel} timed out after ${callTimeout / 1000}s`)), callTimeout)
            ),
          ]);
          // If we fell back to a different model, remember it
          if (tryModel !== activeModelId) {
            console.log(`Model fallback: ${activeModelId} → ${tryModel}`);
            activeModelId = tryModel;
          }
          return response;
        } catch (err: unknown) {
          const status = (err as { status?: number })?.status;
          const msg = err instanceof Error ? err.message.toLowerCase() : "";
          const isLastModel = tryModel === modelsToTry[modelsToTry.length - 1];
          const isFatal = msg.includes("api_key") || msg.includes("unauthorized") || status === 401;

          if (!isFatal && !isLastModel) {
            console.warn(`Model ${tryModel} failed (status=${status}, msg="${msg.slice(0, 80)}"), trying fallback...`);
            lastError = err;
            await new Promise((r) => setTimeout(r, 200));
            continue;
          }
          throw err;
        }
      }
      throw lastError;
    }

    // Wall-clock start time — we MUST return before Vercel's 60s limit
    const wallClockStart = Date.now();
    const WALL_CLOCK_LIMIT_MS = 52_000; // 52s — leaves 8s safety margin

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      // Bail out if we're running out of time
      if (Date.now() - wallClockStart > WALL_CLOCK_LIMIT_MS) {
        console.warn(`Wall-clock limit reached after ${round} rounds, returning partial results`);
        // Return whatever tool results we've collected so far
        let partialText = "I found some information but ran out of processing time. Here's what I have:\n\n";
        if (flashcardSets.length > 0) partialText = ""; // Flashcards are self-contained
        if (flowcharts.length > 0) partialText = "Here's the flowchart:\n\n";
        if (charts.length > 0) {
          for (const chart of charts) partialText += `\n\n\`\`\`chart\n${JSON.stringify(chart)}\n\`\`\``;
        }
        if (flowcharts.length > 0) {
          for (const fc of flowcharts) partialText += `\n\n\`\`\`mermaid\n${fc.mermaidCode}\n\`\`\``;
        }
        return NextResponse.json({
          response: partialText || "The request took too long. Please try again with a simpler query.",
          model: activeModelId,
          toolsUsed: toolCallsLog,
          sources,
          charts,
          flowcharts,
          flashcardSets,
          quizSets,
          manimAnimations,
          generatedImages,
          scheduleActions,
          search_images: searchImages.length > 0 ? searchImages : undefined,
        });
      }

      loopRound = round;
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

        // Execute ALL tool calls in PARALLEL for speed
        // (prevents timeout when model calls multiple tools like flowchart + flashcards)
        const toolPromises = assistantMsg.tool_calls.map(async (tc) => {
          const toolName = tc.function.name;
          let toolInput: Record<string, unknown> = {};
          try {
            toolInput = JSON.parse(tc.function.arguments);
          } catch {
            toolInput = {};
          }

          toolCallsLog.push(toolName);

          // Auto-inject file context for document/screenshot analyzers
          if (toolName === "analyze_document" && fileContext && !toolInput.content) {
            toolInput.content = fileContext;
          }
          if (toolName === "analyze_screenshot" && fileContext && !toolInput.description) {
            toolInput.description = `Uploaded file content:\n${fileContext.slice(0, 5000)}`;
          }

          try {
            const toolResult = await executeTool(toolName, toolInput);
            return { tc, toolName, toolResult, error: null };
          } catch (toolErr) {
            console.error(`Tool ${toolName} execution failed:`, toolErr);
            return { tc, toolName, toolResult: null, error: toolErr };
          }
        });

        const toolResults = await Promise.allSettled(toolPromises);

        for (const settled of toolResults) {
          if (settled.status === "rejected") continue;
          const { tc, toolName, toolResult, error: toolErr } = settled.value;

          if (toolErr || !toolResult) {
            messages.push({
              role: "tool",
              tool_call_id: tc.id,
              content: JSON.stringify({ error: `Tool "${toolName}" failed. Continue without it.` }),
            });
            continue;
          }

          if (toolResult.sources) sources.push(...toolResult.sources);
          if (toolResult.chartData) charts.push(toolResult.chartData);
          if (toolResult.flowchartData) flowcharts.push(toolResult.flowchartData as { mermaidCode: string; title?: string; explanation?: string });
          if (toolResult.manimData) manimAnimations.push(toolResult.manimData as { code: string; sceneName: string; explanation: string });
          if (toolResult.imageData) generatedImages.push(toolResult.imageData as { prompt: string; style: string; subject?: string; url?: string });
          if (toolResult.flashcardData) flashcardSets.push(toolResult.flashcardData as { topic: string; cards: { front: string; back: string }[] });
          if (toolResult.quizData) quizSets.push(toolResult.quizData as { topic: string; questions: { question: string; options: string[]; correct: number; explanation: string }[]; difficulty?: string });
          if (toolResult.scheduleData) scheduleActions.push(toolResult.scheduleData);

          // Capture search images from web_search results
          const resultObj = toolResult.result as Record<string, unknown>;
          if (resultObj?.images && Array.isArray(resultObj.images)) {
            searchImages.push(...(resultObj.images as { url: string; thumbnail: string; title: string; source: string }[]));
          }

          const toolResultStr = JSON.stringify(toolResult.result);
          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: toolResultStr.length > 25000 ? toolResultStr.slice(0, 25000) : toolResultStr,
          });
        }

        continue;
      }

      // Model done — extract final response
      let finalText = assistantMsg.content || "";

      // ── Extract thinking/reasoning content ──────────────────────
      let thinkingContent: string | null = null;

      // 1. Capture reasoning_content from Grok-3-mini style models
      const rawMsg = assistantMsg as unknown as Record<string, unknown>;
      if (rawMsg.reasoning_content && typeof rawMsg.reasoning_content === "string") {
        thinkingContent = String(rawMsg.reasoning_content).trim();
      }

      // 2. Strip <think>...</think> tags from content (DeepSeek-R1, etc.)
      const thinkMatch = finalText.match(/<think>([\s\S]*?)<\/think>/);
      if (thinkMatch) {
        if (!thinkingContent) {
          thinkingContent = thinkMatch[1].trim();
        }
        finalText = finalText.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
      }

      // 3. Also strip any remaining <think> without closing tag
      if (finalText.includes("<think>")) {
        const idx = finalText.indexOf("<think>");
        const endIdx = finalText.indexOf("</think>", idx);
        if (endIdx === -1) {
          // Unclosed think tag — extract and remove
          const thinkText = finalText.slice(idx + 7).trim();
          if (!thinkingContent && thinkText) thinkingContent = thinkText;
          finalText = finalText.slice(0, idx).trim();
        }
      }

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
        thinking: thinkingContent,
        animation_url: null,
        sources: Array.from(new Set(sources)),
        tool_calls: toolCallsLog,
        charts,
        flowcharts,
        manim_animations: manimAnimations,
        generated_images: generatedImages,
        flashcard_sets: flashcardSets,
        quiz_sets: quizSets,
        schedule_actions: scheduleActions,
        search_images: searchImages.length > 0 ? searchImages : undefined,
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
      flashcard_sets: flashcardSets,
      quiz_sets: quizSets,
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
    } else if (statusCode === 404 || msg.includes("not found") || msg.includes("does not exist") || msg.includes("404")) {
      userError = `The model "${modelId}" isn't available right now. Try switching to GPT-4.1 or GPT-4o.`;
      statusHint = "model_not_found";
    } else if (msg.includes("content_filter") || msg.includes("content policy") || msg.includes("safety")) {
      userError = "Your message was flagged by the content safety filter. Please rephrase your question.";
      statusHint = "content_filter";
    } else if (statusCode === 400 || msg.includes("bad request") || msg.includes("bad_request")) {
      userError = "The AI model rejected this request. Try a shorter message or different wording.";
      statusHint = "bad_request";
    } else if (statusCode && statusCode >= 500) {
      userError = "The AI service is experiencing issues. Please try again in a moment.";
      statusHint = "server_error";
    }

    console.error(`Chat error [${statusHint || "unknown"}]: ${rawMsg}`);

    return NextResponse.json({
      response: userError,
      conversation_id: crypto.randomUUID(),
      error: statusHint || "unknown_error",
      error_detail: rawMsg,
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

