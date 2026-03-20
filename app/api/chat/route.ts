/**
 * Chat API Route — SchoolIT AI v4.0
 * ==================================
 * Thin entry point: auth, validation, security, then delegates to orchestrator.
 *   - fallback.ts — Multi-provider fallback engine
 *   - orchestrator.ts — Tool loop, response assembly, deep review
 *   - providers.ts — AI provider config, model registry, client factory
 *   - moderation.ts — Supabase-backed ban system, harassment detection
 *   - rate-limiter.ts — Supabase-backed tiered rate limiting
 *   - security.ts — CSRF, origin validation
 *   - prompts.ts — System prompt builder, personas
 *   - tools.ts — Tool definitions & executors
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import type OpenAI from "openai";
import { authOptions, isAdminEmail } from "@/lib/auth";
import { buildSystemPrompt, VALID_SUBJECTS, type TeacherStyle } from "@/lib/server/prompts";
import { TOOL_DEFINITIONS } from "@/lib/server/tools";
import {
  MODEL_MAP, ALL_MODEL_IDS,
  THINKING_MODE_TOKENS, THINKING_MODE_MODEL_PRIORITY,
  MODEL_COMPLETION_CAPS,
  getClientForModel, isProviderCoolingDown,
  isGroqDailyBudgetExhausted,
} from "@/lib/server/providers";
import { isSarvamSafe, type SarvamSafetyFlags } from "@/lib/server/fallback";
import {
  banUser, isUserBanned, isHarassment, sanitizeString, detectPromptInjection,
} from "@/lib/server/moderation";
import { checkRateLimit } from "@/lib/server/rate-limiter";
import { validateOrigin, validateCSRFToken, getRequestIP } from "@/lib/server/security";
import { CSRF_HEADER } from "@/lib/config";
import { runOrchestrator } from "@/lib/server/orchestrator";

// ── Next.js route config ──────────────────────────────────────────────
export const dynamic = "force-dynamic";
export const maxDuration = 120; // 2 minutes for complex requests

// ── Constants ─────────────────────────────────────────────────────────
const MAX_TOOL_ROUNDS = 10;
const MAX_MESSAGE_LENGTH = 3_000;   // was 24_000 — prevents context explosion
const MAX_HISTORY_MESSAGES = 10;    // was 40 — keeps context under control
const VALID_PERSONAS = ["formal", "creative", "socratic", "balanced", "exam_coach"];

// ── Qwen3 / QwQ tool-call rescue — strips XML <tool_call> blocks ────
function rescueQwenToolCalls(content: string) {
  const rescued: { name: string; arguments: string }[] = [];
  const xml = /<tool_call>([\s\S]*?)<\/tool_call>/g;
  let m;
  while ((m = xml.exec(content)) !== null) {
    try {
      const p = JSON.parse(m[1].trim());
      if (p.name) rescued.push({
        name: p.name,
        arguments: typeof p.arguments === "string"
          ? p.arguments : JSON.stringify(p.arguments || {}),
      });
    } catch { /* ignore malformed */ }
  }
  return rescued;
}

// ── System prompt cache (TTL 60 s, no file/memory context) ───────────
const _promptCache = new Map<string, { prompt: string; at: number }>();
const PROMPT_CACHE_TTL = 60_000;

// ══════════════════════════════════════════════════════════════════════
//  POST /api/chat
// ══════════════════════════════════════════════════════════════════════

export async function POST(req: NextRequest) {
 let conversationId = "unknown"; // Declare outside try-catch for error handler access
 try {
  // ── CSRF / Origin validation ────────────────────────────────────────
  if (!validateOrigin(req)) {
    return NextResponse.json(
      { error: "forbidden", message: "Invalid request origin." },
      { status: 403 }
    );
  }

  // ── Auth & Admin ────────────────────────────────────────────────────
  let isAdmin = false;
  let userEmail = "";
  let sessionId: string | undefined;
  try {
    const session = await getServerSession(authOptions);
    if (session?.user?.email) {
      userEmail = session.user.email;
      isAdmin = isAdminEmail(userEmail);
      sessionId = (session.user as Record<string, unknown>).id as string | undefined;
    }
  } catch {
    // No session — treat as guest
  }

  // ── CSRF token verification ─────────────────────────────────────────
  const csrfToken = req.headers.get(CSRF_HEADER) || "";
  if (csrfToken) {
    const csrfValid = await validateCSRFToken(csrfToken);
    if (!csrfValid) {
      return NextResponse.json(
        { error: "forbidden", message: "Invalid or expired security token. Please refresh the page." },
        { status: 403 }
      );
    }
  }

  const ip = getRequestIP(req);

  // ── Ban check ───────────────────────────────────────────────────────
  const banRecord = await isUserBanned(ip, userEmail);
  if (banRecord && !isAdmin) {
    const isPermanent = banRecord.expiresAt === 0;
    const remaining = isPermanent
      ? "permanent"
      : `${Math.ceil((banRecord.expiresAt - Date.now()) / (24 * 60 * 60 * 1000))} days remaining`;
    return NextResponse.json({
      response: `⛔ Your access to SchoolIT AI has been suspended (${remaining}). Reason: ${banRecord.reason}. Strikes: ${banRecord.strikes}/3.${isPermanent ? " This ban is permanent due to repeated violations." : " Please conduct yourself appropriately when the ban expires."}`,
      conversation_id: "banned",
      sources: [], tool_calls: [], charts: [],
      model: "moderation",
      moderation_action: "access_banned",
    }, { status: 200 });
  }

  // ── Rate limit (admins bypass) ──────────────────────────────────────
  const rateCheck = await checkRateLimit(ip, { isAdmin, tier: "free" });
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: "rate_limited", message: "Too many requests. Please wait a moment and try again." },
      {
        status: 429,
        headers: {
          "X-RateLimit-Remaining": "0",
          ...(rateCheck.retryAfter ? { "Retry-After": String(rateCheck.retryAfter) } : {}),
        },
      }
    );
  }

  // ── Parse body ──────────────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "bad_request", message: "Invalid JSON body." },
      { status: 400 }
    );
  }

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

  // ── Stable conversation ID (accept from client or generate once) ────
  conversationId =
    typeof body.conversation_id === "string" && body.conversation_id.trim()
      ? body.conversation_id.trim()
      : crypto.randomUUID();

  // ── Prompt injection detection ──────────────────────────────────────
  if (detectPromptInjection(message) && !isAdmin) {
    console.warn(`[SECURITY] Prompt injection attempt: IP=${ip}, email=${userEmail || "guest"}`);
    return NextResponse.json({
      response: "⚠️ Your message was flagged by SchoolIT AI's security system. Please rephrase your question naturally.",
      conversation_id: conversationId,
      sources: [], tool_calls: [], charts: [],
      model: "security",
      moderation_action: "prompt_injection_blocked",
    }, { status: 200 });
  }

  // ── Anti-harassment filter ──────────────────────────────────────────
  if (isHarassment(message)) {
    await banUser(ip, userEmail, "Anti-harassment policy violation");
    const banInfo = await isUserBanned(ip, userEmail);
    console.warn(`[MODERATION] BANNED: IP=${ip}, email=${userEmail || "guest"}, strikes=${banInfo?.strikes || 1}`);
    return NextResponse.json({
      response: `⛔ This message violates SchoolIT AI's anti-harassment policy. Your access has been suspended for 7 days (Strike ${banInfo?.strikes || 1}/3). ${(banInfo?.strikes || 0) >= 2 ? "⚠️ One more violation = PERMANENT ban." : "Harassment and inappropriate remarks are strictly prohibited."}`,
      conversation_id: conversationId,
      sources: [], tool_calls: [], charts: [],
      model: "moderation",
      moderation_action: "access_suspended",
      penalty_days: 7,
    }, { status: 200 });
  }

  // ── Validate optional fields ────────────────────────────────────────
  const rawSubject = typeof body.subject === "string"
    ? body.subject.toLowerCase().trim()
    : "";
  const subject = VALID_SUBJECTS.includes(rawSubject)
    ? rawSubject
    : "general";
  const persona: TeacherStyle = VALID_PERSONAS.includes(String(body.persona || ""))
    ? (String(body.persona) as TeacherStyle)
    : "balanced";
  const useWebSearch = body.use_web_search !== false;

  const thinkingMode = (["fast", "balanced", "deep"].includes(String(body.thinking_mode || ""))
    ? String(body.thinking_mode)
    : "balanced") as "fast" | "balanced" | "deep";
  const chainOfThought = thinkingMode === "deep" || body.chain_of_thought === true;
  const thinkingModeMax = THINKING_MODE_TOKENS[thinkingMode] || 4096;

  const history = Array.isArray(body.history) ? body.history : [];
  const contextFiles = Array.isArray(body.context_files) ? body.context_files : [];
  const scheduleContext = typeof body.schedule_context === "string" ? body.schedule_context : "";
  const memoryContext = typeof body.memory_context === "string" ? body.memory_context : "";

  // ── Intent detection ────────────────────────────────────────────────
  const hasYouTubeUrl = /(https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)[^\s]+)/i.test(message);
  const wantsFlowchart = /(flowchart|diagram|mind ?map|process map)/i.test(message);
  const wantsFlashcards = /(flashcards?|revision cards?|study cards?)/i.test(message);
  const wantsQuiz = /(quiz me|mcq|test me|practice questions?)/i.test(message);
  const wantsQuestionPaper = /(question paper|sample paper|practice paper|mock paper|previous year|model paper)/i.test(message);
  const wantsMockTest = /(mock test|timed test|simulate exam|exam simulation|timed quiz|practice exam)/i.test(message);
  const wantsCBSENews = /(cbse update|cbse notification|date sheet|exam date|syllabus change|board announcement|cbse circular|cbse news)/i.test(message);
  const hasFilesAttached = contextFiles.length > 0;
  const wantsCode = /(write|code|program|script|function|algorithm|implement|debug|fix.*code|class|html|css|javascript|python|java|c\+\+)/i.test(message);
  const wantsChart = /(graph|plot|chart|histogram|distribution|data.*vis|compare.*data|trend|statistics|pie.*chart|bar.*chart|scatter|function.*graph|v-t|s-t|a-t|velocity.*time|distance.*time|acceleration.*time|y\s*=|f\(x\))/i.test(message);
  const wantsVisual = /(\bimage\b|\bdiagram\b|\billustration\b|\bvisuali[sz]e\b|\bdraw\b|\bshow\b.*\bstructure\b|\bshow\b.*\bprocess\b)/i.test(message);
  const wantsCodeExecution = /calculat|comput|simulat|verify|check.*(answer|result)|run.*code|python|numpy|solve.*equation|plot.*graph|what is \d|evaluate|^solve\b/i.test(message);
  const containsDevanagari = /[\u0900-\u097F]/.test(message);
  const sarvamFlags: SarvamSafetyFlags = {
    wantsQuiz,
    wantsFlashcards,
    wantsMockTest,
    wantsQuestionPaper,
    wantsFlowchart,
    wantsChart,
    hasFilesAttached,
    hasYouTubeUrl,
    wantsCode,
    wantsCodeExecution,
  };
  const looksLikePlainTextRequest = !wantsCode && !/```|<\/?[a-z][^>]*>|https?:\/\/[^\s]+/i.test(message);
  const sarvamSubjectEligible = ["english", "general", "sst", "social_science", "hindi"].includes(rawSubject || subject);
  
  // Async cooldown checks
  const githubCoolingDown = await isProviderCoolingDown("github");
  const groqExhausted = await isGroqDailyBudgetExhausted();
  
  const allowSarvamFallback = (
    ["fast", "balanced"].includes(thinkingMode) &&
    githubCoolingDown &&
    isSarvamSafe(sarvamFlags) &&
    looksLikePlainTextRequest &&
    (sarvamSubjectEligible || containsDevanagari) &&
    getClientForModel("sarvam-m") !== null
  );

  // ── Smart Auto-Routing by Thinking Mode ─────────────────────────────
  const priorityList = THINKING_MODE_MODEL_PRIORITY[thinkingMode] || THINKING_MODE_MODEL_PRIORITY.balanced;
  
  // Pre-fetch cooldown states for all priority models
  const cooldownStates = await Promise.all(
    priorityList.map(async m => ({
      model: m,
      coolingDown: await isProviderCoolingDown(MODEL_MAP[m]?.provider),
    }))
  );
  const cooldownMap = new Map(cooldownStates.map(s => [s.model, s.coolingDown]));
  
  const modelId = allowSarvamFallback
    ? "sarvam-m"
    : priorityList.find(m => {
        const cfg = MODEL_MAP[m];
        if (m === "sarvam-m") return false;
        if (!cfg || !getClientForModel(m)) return false;
        if (cooldownMap.get(m)) return false;
        if (cfg.provider === "groq" && groqExhausted) return false;
        return true;
      }) || priorityList.find(m => m !== "sarvam-m" && getClientForModel(m) !== null) || "gpt-4.1";
  const maxTokens = Math.min(thinkingModeMax, MODEL_COMPLETION_CAPS[modelId] || thinkingModeMax);

  // Build tool hints
  let toolHint = "";
  if (hasYouTubeUrl) toolHint += "[ToolHint: Use summarize_video for the provided video URL.]\n";
  if (wantsFlowchart) toolHint += "[ToolHint: Use generate_flowchart and render Mermaid output. ALWAYS use the tool — never output ASCII flowcharts.]\n";
  if (wantsFlashcards) toolHint += "[ToolHint: Use create_flashcards.]\n";
  if (wantsQuiz && !wantsMockTest && !wantsQuestionPaper) toolHint += "[ToolHint: Use generate_quiz.]\n";
  if (wantsQuestionPaper) toolHint += "[ToolHint: Use generate_question_paper to create a full CBSE-style paper with sections and model answers.]\n";
  if (wantsMockTest) toolHint += "[ToolHint: Use generate_mock_test to create a timed mock exam with timer and auto-evaluation.]\n";
  if (wantsCBSENews) toolHint += "[ToolHint: Use cbse_notifications to fetch latest CBSE updates, dates, and circulars.]\n";
  if (wantsCode) toolHint += "[ToolHint: When writing code, ALWAYS use proper markdown code blocks with language tags.]\n";
  if (hasFilesAttached) toolHint += "[ToolHint: Files are attached. Use analyze_document for docs and analyze_screenshot for images.]\n";
  if (wantsChart) toolHint += "[ToolHint: MANDATORY — Use generate_chart tool to create a proper SVG chart. Do NOT describe the chart in text. Do NOT output ASCII art. Call the generate_chart tool with proper chart_data JSON.]\n";
  if (wantsCodeExecution) toolHint += "[ToolHint: For numerical problems, use execute_code to verify answers with real Python calculations. Use sympy for symbolic math, numpy for numerical.]\n";
  // toolHint is now injected into the system prompt, NOT the user message
  const effectiveMessage = message;

  // Build file context
  let fileContext: string | undefined;
  if (contextFiles.length > 0) {
    const parts = contextFiles.slice(0, 5).map((f: Record<string, unknown>) => {
      const name = sanitizeString(String(f.name || "file"), 200);
      const type = String(f.type || "unknown");
      const rawContent = String(f.content || "");
      const isBinaryMarker = rawContent.includes("[BINARY_FILE]") || /^(application\/pdf|application\/zip|application\/octet-stream|application\/msword|application\/vnd\.)/i.test(type);
      if (isBinaryMarker) return `### File: ${name}\nType: ${type}\nBinary file — use analyze_document tool.`;
      const content = sanitizeString(rawContent, 15_000);
      return `### File: ${name}\nType: ${type}\n${content}`;
    });
    fileContext = parts.join("\n\n");
  }

  // Build system prompt (cached when no file/memory context)
  const _cacheKey = `${persona}|${subject}|${thinkingMode}|${isAdmin}`;
  const _cached = _promptCache.get(_cacheKey);
  const usePromptCache = !fileContext && !memoryContext && _cached && Date.now() - _cached.at < PROMPT_CACHE_TTL;
  const systemPrompt = usePromptCache
    ? _cached.prompt
    : buildSystemPrompt(persona, subject, chainOfThought, fileContext, memoryContext || undefined, isAdmin, thinkingMode);
  if (!fileContext && !memoryContext) {
    _promptCache.set(_cacheKey, { prompt: systemPrompt, at: Date.now() });
  }
  let fullSystemPrompt = systemPrompt;
  if (scheduleContext) {
    fullSystemPrompt += `\n\n## Student's Current Schedule:\n${scheduleContext}\n\nUse manage_schedule to add items. Reference existing schedule when relevant.`;
  }
  if (toolHint) {
    fullSystemPrompt += `\n\n## Tool Usage Hints (this turn only):\n${toolHint.trim()}`;
  }

  // Check at least one provider
  const primarySetup = getClientForModel(modelId);
  if (!primarySetup) {
    const anyAvailable = ALL_MODEL_IDS.some(m => getClientForModel(m) !== null);
    if (!anyAvailable) {
      return NextResponse.json({
        response: "The AI service is not configured. Please set at least one API key.",
        conversation_id: conversationId,
        error: "No AI providers configured",
        sources: [], tool_calls: [], charts: [], model: modelId,
      });
    }
  }

  // ── Build messages array ────────────────────────────────────────────
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: fullSystemPrompt },
  ];
  console.log(`[SchoolIT] prompt=${fullSystemPrompt.length}ch model=${modelId} admin=${isAdmin} history=${history.length}`);

  // Add history (truncated for Groq)
  const isGroqPrimary = MODEL_MAP[modelId]?.provider === "groq";
  const maxHistoryMsgs = isGroqPrimary ? 4 : MAX_HISTORY_MESSAGES;
  const maxMsgLen = isGroqPrimary ? 1500 : MAX_MESSAGE_LENGTH;
  for (const msg of history.slice(-maxHistoryMsgs)) {
    const role = String(msg.role || "");
    if (role === "user" || role === "assistant") {
      messages.push({ role: role as "user" | "assistant", content: sanitizeString(String(msg.content || ""), maxMsgLen) });
    }
  }

  // Add current message (with image support)
  const imageFiles = contextFiles.filter(
    (f: Record<string, unknown>) => String(f.type || "").startsWith("image/") && String(f.content || "").startsWith("data:")
  );
  const primaryConfig = MODEL_MAP[modelId];
  const modelSupportsVision = primaryConfig?.supportsVision ?? false;
  const safeImages = imageFiles.filter((f: Record<string, unknown>) => String(f.content || "").length < 2_000_000);
  const oversizedCount = imageFiles.length - safeImages.length;

  if (safeImages.length > 0 && modelSupportsVision) {
    const sizeNote = oversizedCount > 0 ? `\n\n(${oversizedCount} image(s) skipped — too large.)` : "";
    const contentParts: OpenAI.Chat.ChatCompletionContentPart[] = [
      { type: "text", text: effectiveMessage + sizeNote },
    ];
    for (const img of safeImages.slice(0, 3)) {
      contentParts.push({ type: "image_url", image_url: { url: String(img.content), detail: "auto" } });
    }
    messages.push({ role: "user", content: contentParts });
  } else if (imageFiles.length > 0 && !modelSupportsVision) {
    messages.push({ role: "user", content: effectiveMessage + `\n\n[${imageFiles.length} image(s) attached. Use analyze_screenshot tool.]` });
  } else if (oversizedCount > 0) {
    messages.push({ role: "user", content: effectiveMessage + `\n\n[Images too large. Resize to under 1.5MB.]` });
  } else {
    messages.push({ role: "user", content: effectiveMessage });
  }

  // Build tool list
  const requestedTools = useWebSearch ? TOOL_DEFINITIONS : TOOL_DEFINITIONS.filter(t => t.function.name !== "web_search");
  const isSimplePrompt = message.trim().split(/\s+/).length <= 2 && contextFiles.length === 0 && !toolHint && !wantsChart;
  const tools = isSimplePrompt ? [] : requestedTools;

  // ═══════════════════════════════════════════════════════════════════
  //  NDJSON STREAMING RESPONSE
  // ═══════════════════════════════════════════════════════════════════
  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const writeEvent = async (type: string, payload: Record<string, unknown> = {}) => {
    try { await writer.write(encoder.encode(JSON.stringify({ type, ...payload }) + '\n')); } catch {}
  };

  (async () => {
  try {
    let activeModelId = modelId;

    // Swap to tool-reliable model if needed
    const taskNeedsReliableTools = hasFilesAttached || imageFiles.length > 0 || hasYouTubeUrl || wantsFlowchart || wantsFlashcards || wantsQuiz || wantsQuestionPaper || wantsMockTest;
    if (taskNeedsReliableTools && !MODEL_MAP[activeModelId]?.supportsTools) {
      const replacement = ["gpt-4o", "gpt-4.1", "qwen3-32b", "llama-3.1-8b", "gemini-2.0-flash"].find(m => getClientForModel(m) !== null);
      if (replacement) activeModelId = replacement;
    }

    // Delegate to orchestrator (tool loop + fallback + response assembly)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await runOrchestrator({
      messages, tools, activeModelId, thinkingMode, thinkingModeMax, maxTokens,
      maxToolRounds: MAX_TOOL_ROUNDS,
      sarvamFlags, allowSarvamFallback,
      hasImageFiles: imageFiles.length > 0,
      wantsVisual, message, subject, userEmail,
      fileContext, conversationId,
      rateRemaining: rateCheck.remaining,
      writeEvent,
    } as Parameters<typeof runOrchestrator>[0]);
  } catch (error: unknown) {
    console.error("Chat API error:", error);
    const apiErr = error as { status?: number; code?: string };
    const rawMsg = error instanceof Error ? error.message : String(error);
    const msg = rawMsg.toLowerCase();
    const sc = apiErr.status;
    let userError = "Something went wrong. Please try again.";
    let hint = "";

    if (sc === 429 || msg.includes("rate")) { userError = "I'm getting too many requests right now. Please wait a moment and try again."; hint = "rate_limited"; }
    else if (sc === 401 || msg.includes("api_key") || msg.includes("unauthorized")) { userError = "API authentication failed. Please contact support."; hint = "auth_error"; }
    else if (sc === 403) { userError = "Access denied. Please check your permissions."; hint = "forbidden"; }
    else if (msg.includes("quota") || msg.includes("exceeded")) { userError = "API quota has been exceeded. Please try again later."; hint = "quota_exceeded"; }
    else if (msg.includes("connect") || msg.includes("network")) { userError = "Cannot reach the AI service. Please check your connection."; hint = "network_error"; }
    else if (msg.includes("timeout")) { userError = "That took too long to process. Try asking in Fast mode instead."; hint = "timeout"; }
    else if (sc === 404 || msg.includes("not found") || msg.includes("decommissioned")) { userError = "The AI model is temporarily unavailable. Please try again."; hint = "model_not_found"; }
    else if (msg.includes("content_filter") || msg.includes("safety")) { userError = "Your message was flagged by content filters. Please rephrase."; hint = "content_filter"; }
    else if (sc === 400 || msg.includes("bad request")) { userError = "The request was rejected. Try different wording."; hint = "bad_request"; }
    else if (sc === 413 || msg.includes("too large")) { userError = "Your message is too long. Try breaking it into smaller questions."; hint = "payload_too_large"; }
    else if (msg.includes("context") && msg.includes("length")) { userError = "Your conversation is very long. Start a new chat for best results."; hint = "context_length"; }
    else if (sc && sc >= 500) { userError = "AI service is experiencing issues. Please try again in a few moments."; hint = "server_error"; }

    console.error(`[${hint || "unknown"}] ${rawMsg.slice(0, 200)}`);

    await writeEvent('result', { data: {
      response: userError, conversation_id: conversationId,
      error: hint || "unknown_error",
      sources: [], tool_calls: [], charts: [], flowcharts: [],
      generated_images: [], flashcard_sets: [], quiz_sets: [],
      model: modelId,
    }});
  }
  })().catch(e => console.error("Stream error:", e)).finally(() => writer.close().catch(() => {}));

  return new Response(readable, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Content-Type-Options': 'nosniff',
    },
  });
 } catch (fatal: unknown) {
    console.error("FATAL:", fatal);
    return NextResponse.json({
      response: "An unexpected error occurred. Please try again.",
      conversation_id: conversationId,
      error: "internal_error",
      sources: [], tool_calls: [], charts: [], model: "unknown",
    }, { status: 200 });
  }
}
