/**
 * Chat API Route — PROLAI v3.0
 * ==============================
 * Clean orchestrator importing from modular server-side files:
 *   - providers.ts — AI provider config, model registry, client factory
 *   - moderation.ts — Ban system, harassment detection, sanitization
 *   - rate-limiter.ts — Tiered rate limiting with admin bypass
 *   - security.ts — CSRF, origin validation, request fingerprinting
 *   - prompts.ts — System prompt builder, personas
 *   - tools.ts — Tool definitions & executors
 */

import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getServerSession } from "next-auth";
import { authOptions, isAdminEmail } from "@/lib/auth";
import { buildSystemPrompt, VALID_SUBJECTS, type TeacherStyle } from "@/lib/server/prompts";
import { TOOL_DEFINITIONS, executeTool } from "@/lib/server/tools";
import {
  MODEL_MAP, ALL_MODEL_IDS, MODEL_NAMES, MODEL_COMPLETION_CAPS,
  THINKING_MODE_TOKENS, THINKING_MODE_MODEL_PRIORITY,
  USES_MAX_COMPLETION_TOKENS, TOOL_LABELS,
  getClientForModel, isProviderCoolingDown, markProviderRateLimited,
  isGroqDailyBudgetExhausted, addGroqTokenUsage,
} from "@/lib/server/providers";
import {
  banUser, isUserBanned, isHarassment, sanitizeString, detectPromptInjection,
} from "@/lib/server/moderation";
import { checkRateLimit } from "@/lib/server/rate-limiter";
import { validateOrigin, validateCSRFToken, getRequestIP } from "@/lib/server/security";
import { CSRF_HEADER } from "@/lib/config";

// ── Next.js route config ──────────────────────────────────────────────
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ── Constants ─────────────────────────────────────────────────────────
const MAX_TOOL_ROUNDS = 8;
const MAX_MESSAGE_LENGTH = 12_000;
const MAX_HISTORY_MESSAGES = 30;
const VALID_PERSONAS = ["formal", "creative", "socratic", "balanced", "exam_coach"];

// ══════════════════════════════════════════════════════════════════════
//  POST /api/chat
// ══════════════════════════════════════════════════════════════════════

export async function POST(req: NextRequest) {
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
  const csrfValid = await validateCSRFToken(csrfToken, sessionId);
  if (!csrfValid) {
    return NextResponse.json(
      { error: "forbidden", message: "Invalid or expired security token. Please refresh the page." },
      { status: 403 }
    );
  }

  const ip = getRequestIP(req);

  // ── Ban check ───────────────────────────────────────────────────────
  const banRecord = isUserBanned(ip, userEmail);
  if (banRecord && !isAdmin) {
    const isPermanent = banRecord.expiresAt === 0;
    const remaining = isPermanent
      ? "permanent"
      : `${Math.ceil((banRecord.expiresAt - Date.now()) / (24 * 60 * 60 * 1000))} days remaining`;
    return NextResponse.json({
      response: `⛔ Your access to PROLAI has been suspended (${remaining}). Reason: ${banRecord.reason}. Strikes: ${banRecord.strikes}/3.${isPermanent ? " This ban is permanent due to repeated violations." : " Please conduct yourself appropriately when the ban expires."}`,
      conversation_id: crypto.randomUUID(),
      sources: [], tool_calls: [], charts: [],
      model: "moderation",
      moderation_action: "access_banned",
    }, { status: 200 });
  }

  // ── Rate limit (admins bypass) ──────────────────────────────────────
  const rateCheck = checkRateLimit(ip, { isAdmin, tier: "free" });
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

  // ── Prompt injection detection ──────────────────────────────────────
  if (detectPromptInjection(message) && !isAdmin) {
    console.warn(`[SECURITY] Prompt injection attempt: IP=${ip}, email=${userEmail || "guest"}`);
    return NextResponse.json({
      response: "⚠️ Your message was flagged by PROLAI's security system. Please rephrase your question naturally.",
      conversation_id: crypto.randomUUID(),
      sources: [], tool_calls: [], charts: [],
      model: "security",
      moderation_action: "prompt_injection_blocked",
    }, { status: 200 });
  }

  // ── Anti-harassment filter ──────────────────────────────────────────
  if (isHarassment(message)) {
    banUser(ip, userEmail, "Anti-harassment policy violation");
    const banInfo = isUserBanned(ip, userEmail);
    console.warn(`[MODERATION] BANNED: IP=${ip}, email=${userEmail || "guest"}, strikes=${banInfo?.strikes || 1}`);
    return NextResponse.json({
      response: `⛔ This message violates PROLAI's anti-harassment policy. Your access has been suspended for 7 days (Strike ${banInfo?.strikes || 1}/3). ${(banInfo?.strikes || 0) >= 2 ? "⚠️ One more violation = PERMANENT ban." : "Harassment and inappropriate remarks are strictly prohibited."}`,
      conversation_id: crypto.randomUUID(),
      sources: [], tool_calls: [], charts: [],
      model: "moderation",
      moderation_action: "access_suspended",
      penalty_days: 7,
    }, { status: 200 });
  }

  // ── Validate optional fields ────────────────────────────────────────
  const subject = VALID_SUBJECTS.includes(String(body.subject || "").toLowerCase())
    ? String(body.subject).toLowerCase()
    : "general";
  const persona: TeacherStyle = VALID_PERSONAS.includes(String(body.persona || ""))
    ? (String(body.persona) as TeacherStyle)
    : "balanced";
  const useWebSearch = body.use_web_search !== false;

  const thinkingMode = ["fast", "balanced", "deep"].includes(String(body.thinking_mode || ""))
    ? String(body.thinking_mode)
    : "balanced";
  const chainOfThought = thinkingMode === "deep" || body.chain_of_thought === true;
  const thinkingModeMax = THINKING_MODE_TOKENS[thinkingMode] || 4096;

  // ── Smart Auto-Routing by Thinking Mode ─────────────────────────────
  const priorityList = THINKING_MODE_MODEL_PRIORITY[thinkingMode] || THINKING_MODE_MODEL_PRIORITY.balanced;
  const modelId = priorityList.find(m => {
    const cfg = MODEL_MAP[m];
    if (!cfg || !getClientForModel(m)) return false;
    if (isProviderCoolingDown(cfg.provider)) return false;
    if (cfg.provider === "groq" && isGroqDailyBudgetExhausted()) return false;
    return true;
  }) || priorityList.find(m => getClientForModel(m) !== null) || "gpt-4.1";
  const maxTokens = Math.min(thinkingModeMax, MODEL_COMPLETION_CAPS[modelId] || thinkingModeMax);
  const wantsVisual = /(\bimage\b|\bdiagram\b|\billustration\b|\bvisuali[sz]e\b|\bdraw\b|\bshow\b.*\bstructure\b|\bshow\b.*\bprocess\b)/i.test(message);

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
  const effectiveMessage = toolHint ? `${message}\n\n${toolHint.trim()}` : message;

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

  // Build system prompt
  const systemPrompt = buildSystemPrompt(persona, subject, chainOfThought, fileContext, memoryContext || undefined, isAdmin);
  const fullSystemPrompt = scheduleContext
    ? systemPrompt + `\n\n## Student's Current Schedule:\n${scheduleContext}\n\nUse manage_schedule to add items. Reference existing schedule when relevant.`
    : systemPrompt;

  // Check at least one provider
  const primarySetup = getClientForModel(modelId);
  if (!primarySetup) {
    const anyAvailable = ALL_MODEL_IDS.some(m => getClientForModel(m) !== null);
    if (!anyAvailable) {
      return NextResponse.json({
        response: "The AI service is not configured. Please set at least one API key.",
        conversation_id: crypto.randomUUID(),
        error: "No AI providers configured",
        sources: [], tool_calls: [], charts: [], model: modelId,
      });
    }
  }

  // ── Build messages array ────────────────────────────────────────────
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: fullSystemPrompt },
  ];
  console.log(`[PROLAI] prompt=${fullSystemPrompt.length}ch model=${modelId} admin=${isAdmin} history=${history.length}`);

  // Add history (truncated for Groq)
  const isGroqPrimary = MODEL_MAP[modelId]?.provider === "groq";
  const maxHistoryMsgs = isGroqPrimary ? 6 : MAX_HISTORY_MESSAGES;
  const maxMsgLen = isGroqPrimary ? 2000 : MAX_MESSAGE_LENGTH;
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
  // Tracking collections
  const sources: string[] = [];
  const toolCallsLog: string[] = [];
  const charts: unknown[] = [];
  const flowcharts: { mermaidCode: string; title?: string; explanation?: string }[] = [];
  const manimAnimations: { code: string; sceneName: string; explanation: string }[] = [];
  const generatedImages: { prompt: string; style: string; subject?: string; url?: string }[] = [];
  const flashcardSets: { topic: string; cards: { front: string; back: string }[] }[] = [];
  const quizSets: { topic: string; questions: { question: string; options: string[]; correct: number; explanation: string }[]; difficulty?: string }[] = [];
  const scheduleActions: unknown[] = [];
  const mockTests: unknown[] = [];
  const questionPapers: unknown[] = [];
  const searchImages: { url: string; thumbnail: string; title: string; source: string }[] = [];

  try {
    let activeModelId = modelId;

    // Swap to tool-reliable model if needed
    const taskNeedsReliableTools = hasFilesAttached || imageFiles.length > 0 || hasYouTubeUrl || wantsFlowchart || wantsFlashcards || wantsQuiz || wantsQuestionPaper || wantsMockTest;
    if (taskNeedsReliableTools && !MODEL_MAP[activeModelId]?.supportsTools) {
      const replacement = ["gpt-4o", "gpt-4.1", "llama-3.1-8b", "llama-3.3-70b", "gemini-2.0-flash"].find(m => getClientForModel(m) !== null);
      if (replacement) activeModelId = replacement;
    }

    let loopRound = 0;
    const wallClockStart = Date.now();

    // ── Multi-provider fallback ───────────────────────────────────────
    const callWithFallback = async (msgs: OpenAI.Chat.ChatCompletionMessageParam[]) => {
      const priorityModels = (THINKING_MODE_MODEL_PRIORITY[thinkingMode] || THINKING_MODE_MODEL_PRIORITY.balanced)
        .filter(m => getClientForModel(m) !== null);
      const modelsFromPriority = activeModelId !== priorityModels[0]
        ? [activeModelId, ...priorityModels.filter(m => m !== activeModelId)]
        : priorityModels;
      const otherModels = ALL_MODEL_IDS.filter(m => !modelsFromPriority.includes(m) && getClientForModel(m) !== null);
      let modelsToTry = [...modelsFromPriority, ...otherModels];

      // Sort: penalize rate-limited and budget-exhausted providers
      modelsToTry.sort((a, b) => {
        const aCost = (isProviderCoolingDown(MODEL_MAP[a]?.provider) ? 1 : 0) + (MODEL_MAP[a]?.provider === "groq" && isGroqDailyBudgetExhausted() ? 2 : 0);
        const bCost = (isProviderCoolingDown(MODEL_MAP[b]?.provider) ? 1 : 0) + (MODEL_MAP[b]?.provider === "groq" && isGroqDailyBudgetExhausted() ? 2 : 0);
        return aCost - bCost;
      });

      // Prioritize vision models when images attached
      if (imageFiles.length > 0) {
        modelsToTry.sort((a, b) => (MODEL_MAP[b]?.supportsVision ? 1 : 0) - (MODEL_MAP[a]?.supportsVision ? 1 : 0));
      }

      if (modelsToTry.length === 0) throw new Error("No AI providers configured.");

      let lastError: unknown = null;
      let modelsAttempted = 0;

      for (let i = 0; i < modelsToTry.length; i++) {
        const tryModelId = modelsToTry[i];
        const setup = getClientForModel(tryModelId);
        if (!setup) continue;
        const { client: modelClient, apiModel, config: modelConfig } = setup;

        // Dynamic timeout
        const elapsed = Date.now() - wallClockStart;
        const remaining = Math.max(54_000 - elapsed, 8_000);
        const callTimeout = i === 0
          ? Math.min(Math.floor(remaining * 0.6), 35_000)
          : Math.max(Math.floor((remaining - 2_000) / (modelsToTry.length - i)), 8_000);

        if (remaining < 6_000 && i > 0) break;

        try {
          const useTools = modelConfig.supportsTools && tools.length > 0;
          let filteredMsgs = msgs;

          // Groq truncation
          if (modelConfig.provider === "groq") {
            filteredMsgs = filteredMsgs.map(m => {
              if (m.role === "system" && typeof m.content === "string" && m.content.length > 4000)
                return { ...m, content: m.content.slice(0, 4000) + "\n\n[Truncated]" };
              if ((m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.length > 2000)
                return { ...m, content: m.content.slice(0, 2000) + "..." };
              return m;
            });
            const sys = filteredMsgs.filter(m => m.role === "system");
            const tl = filteredMsgs.filter(m => m.role === "tool");
            const cv = filteredMsgs.filter(m => m.role === "user" || m.role === "assistant");
            filteredMsgs = [...sys, ...cv.slice(-6), ...tl.slice(-4)];
          }

          // Strip tool messages for non-tool models
          if (!modelConfig.supportsTools) {
            filteredMsgs = msgs.filter(m => m.role !== "tool").map(m => {
              if (m.role === "assistant" && "tool_calls" in m) {
                const { tool_calls: _tc, ...rest } = m as unknown as Record<string, unknown>;
                return rest as unknown as OpenAI.Chat.ChatCompletionMessageParam;
              }
              return m;
            });
          }

          // Strip images for non-vision models
          if (!modelConfig.supportsVision) {
            filteredMsgs = filteredMsgs.map(m => {
              if (m.role === "user" && Array.isArray(m.content)) {
                const texts = (m.content as OpenAI.Chat.ChatCompletionContentPart[])
                  .filter(p => p.type === "text")
                  .map(p => (p as { type: "text"; text: string }).text);
                return { ...m, content: texts.join("\n") || "Analyze the attached content" };
              }
              return m;
            });
          }

          console.log(`[${modelConfig.provider}] ${apiModel} (timeout=${callTimeout}ms, round=${loopRound})`);
          await writeEvent('status', { message: i === 0 ? "PROLAI is thinking..." : "Trying another approach..." });

          const stripToolMsgs = (input: OpenAI.Chat.ChatCompletionMessageParam[]) =>
            input.filter(m => m.role !== "tool").map(m => {
              if (m.role === "assistant" && "tool_calls" in m) {
                const { tool_calls: _tc, ...rest } = m as unknown as Record<string, unknown>;
                return rest as unknown as OpenAI.Chat.ChatCompletionMessageParam;
              }
              return m;
            });

          const modelMaxTokens = Math.min(thinkingModeMax, MODEL_COMPLETION_CAPS[tryModelId] || thinkingModeMax);
          const tokenParam = USES_MAX_COMPLETION_TOKENS.has(tryModelId)
            ? { max_completion_tokens: modelMaxTokens }
            : { max_tokens: modelMaxTokens };

          const invoke = async (input: OpenAI.Chat.ChatCompletionMessageParam[], allowTools: boolean) =>
            Promise.race([
              modelClient.chat.completions.create({
                model: apiModel, ...tokenParam, messages: input,
                tools: allowTools ? tools : undefined,
                tool_choice: allowTools ? "auto" : undefined,
              }),
              new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`${apiModel} timed out`)), callTimeout)),
            ]);

          let response: OpenAI.Chat.ChatCompletion;
          try {
            response = await invoke(filteredMsgs, useTools);
          } catch (firstErr: unknown) {
            const st = (firstErr as { status?: number })?.status;
            const em = firstErr instanceof Error ? firstErr.message.toLowerCase() : "";
            if (useTools && (st === 400 || em.includes("bad request") || em.includes("invalid"))) {
              await writeEvent("status", { message: "Retrying in lightweight mode..." });
              response = await invoke(stripToolMsgs(filteredMsgs), false);
            } else throw firstErr;
          }

          if (tryModelId !== activeModelId) {
            console.log(`Fallback: ${activeModelId} → ${tryModelId}`);
            activeModelId = tryModelId;
          }
          if (modelConfig.provider === "groq" && response.usage)
            addGroqTokenUsage((response.usage.prompt_tokens || 0) + (response.usage.completion_tokens || 0));

          return response;
        } catch (err: unknown) {
          const st = (err as { status?: number })?.status;
          const em = err instanceof Error ? err.message.toLowerCase() : "";
          const isLast = i === modelsToTry.length - 1;
          console.warn(`[${modelConfig.provider}] ${apiModel} failed (${st}): ${(err instanceof Error ? err.message : "").slice(0, 120)}`);
          lastError = err;
          modelsAttempted++;

          if (st === 429 || em.includes("rate limit")) {
            markProviderRateLimited(modelConfig.provider);
            if (modelConfig.provider === "groq" && em.includes("tokens per day")) addGroqTokenUsage(85_000);
          }

          if (isLast) throw err;
          if (!em.includes("rate limit") && modelsAttempted >= 5) throw err;
          await new Promise(r => setTimeout(r, em.includes("rate limit") ? 100 : 150));
        }
      }
      throw lastError;
    };

    // ── Main tool loop ────────────────────────────────────────────────
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      if (Date.now() - wallClockStart > 52_000) {
        let partial = "I found some information but ran out of time:\n\n";
        if (flashcardSets.length > 0) partial = "";
        for (const c of charts) partial += `\n\n\`\`\`chart\n${JSON.stringify(c)}\n\`\`\``;
        for (const f of flowcharts) partial += `\n\n\`\`\`mermaid\n${f.mermaidCode}\n\`\`\``;
        await writeEvent('status', { message: 'Time limit reached...' });
        await writeEvent('result', { data: {
          response: partial || "Request took too long. Try a simpler query.",
          conversation_id: crypto.randomUUID(), thinking: null, animation_url: null,
          model: activeModelId, tool_calls: toolCallsLog, sources: Array.from(new Set(sources)),
          charts, flowcharts, flashcard_sets: flashcardSets, quiz_sets: quizSets,
          mock_tests: mockTests.length > 0 ? mockTests : undefined,
          question_papers: questionPapers.length > 0 ? questionPapers : undefined,
          manim_animations: manimAnimations, generated_images: generatedImages,
          schedule_actions: scheduleActions,
          search_images: searchImages.length > 0 ? searchImages : undefined, error: null,
        }});
        return;
      }

      loopRound = round;
      const response = await callWithFallback(messages);
      const assistantMsg = response.choices[0].message;

      // ── Tool calls ──────────────────────────────────────────────────
      if (assistantMsg.tool_calls?.length) {
        messages.push({
          role: "assistant", content: assistantMsg.content || "",
          tool_calls: assistantMsg.tool_calls.map(tc => ({
            id: tc.id, type: "function" as const,
            function: { name: tc.function.name, arguments: tc.function.arguments },
          })),
        });

        for (const tc of assistantMsg.tool_calls)
          await writeEvent('status', { message: TOOL_LABELS[tc.function.name] || `Using ${tc.function.name.replace(/_/g, ' ')}...` });

        const results = await Promise.allSettled(
          assistantMsg.tool_calls.map(async tc => {
            const name = tc.function.name;
            let input: Record<string, unknown> = {};
            try { input = JSON.parse(tc.function.arguments); } catch { input = {}; }
            toolCallsLog.push(name);

            if (name === "analyze_document" && fileContext && !input.content) input.content = fileContext;
            if (name === "analyze_screenshot" && fileContext && !input.description) input.description = `Uploaded:\n${fileContext.slice(0, 5000)}`;
            if (name === "search_knowledge_base") input._user_email = userEmail;

            try {
              return { tc, name, result: await executeTool(name, input), error: null };
            } catch (e) {
              console.error(`Tool ${name} failed:`, e);
              return { tc, name, result: null, error: e };
            }
          })
        );

        for (const settled of results) {
          if (settled.status === "rejected") continue;
          const { tc, name, result: toolResult, error: toolErr } = settled.value;
          if (toolErr || !toolResult) {
            messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify({ error: `Tool "${name}" failed.` }) });
            continue;
          }

          if (toolResult.sources) sources.push(...toolResult.sources);
          if (toolResult.chartData) charts.push(toolResult.chartData);
          if (toolResult.flowchartData) flowcharts.push(toolResult.flowchartData as typeof flowcharts[0]);
          if (toolResult.manimData) manimAnimations.push(toolResult.manimData as typeof manimAnimations[0]);
          if (toolResult.imageData) generatedImages.push(toolResult.imageData as typeof generatedImages[0]);
          if (toolResult.flashcardData) flashcardSets.push(toolResult.flashcardData as typeof flashcardSets[0]);
          if (toolResult.quizData) quizSets.push(toolResult.quizData as typeof quizSets[0]);
          if (toolResult.mockTestData) mockTests.push(toolResult.mockTestData);
          if (toolResult.questionPaperData) questionPapers.push(toolResult.questionPaperData);
          if (toolResult.scheduleData) scheduleActions.push(toolResult.scheduleData);

          const rObj = toolResult.result as Record<string, unknown>;
          if (rObj?.images && Array.isArray(rObj.images)) searchImages.push(...(rObj.images as typeof searchImages));

          const str = JSON.stringify(toolResult.result);
          messages.push({ role: "tool", tool_call_id: tc.id, content: str.length > 25000 ? str.slice(0, 25000) : str });
        }
        continue;
      }

      // ── Final response ──────────────────────────────────────────────
      let finalText = assistantMsg.content || "";

      // Strip hallucinated images
      finalText = finalText.replace(/!\[([^\]]*)\]\((?!https:\/\/image\.pollinations\.ai)[^)]+\)/g, "**$1**");

      // Extract thinking content
      let thinkingContent: string | null = null;
      const rawMsg = assistantMsg as unknown as Record<string, unknown>;
      if (rawMsg.reasoning_content && typeof rawMsg.reasoning_content === "string")
        thinkingContent = String(rawMsg.reasoning_content).trim();

      const thinkMatch = finalText.match(/<think>([\s\S]*?)<\/think>/);
      if (thinkMatch) {
        if (!thinkingContent) thinkingContent = thinkMatch[1].trim();
        finalText = finalText.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
      }
      if (finalText.includes("<think>")) {
        const idx = finalText.indexOf("<think>");
        const end = finalText.indexOf("</think>", idx);
        if (end === -1) {
          if (!thinkingContent) thinkingContent = finalText.slice(idx + 7).trim();
          finalText = finalText.slice(0, idx).trim();
        }
      }

      // Append rich blocks
      for (const c of charts) finalText += `\n\n\`\`\`chart\n${JSON.stringify(c)}\n\`\`\``;
      for (const f of flowcharts) finalText += `\n\n\`\`\`mermaid\n${f.mermaidCode}\n\`\`\``;
      for (const a of manimAnimations) finalText += `\n\n\`\`\`manim\n${a.code}\n\`\`\``;

      // Auto-generate visual
      if (wantsVisual && generatedImages.length === 0) {
        try {
          const v = await executeTool("generate_image", { prompt: message.slice(0, 300), style: "diagram", subject });
          if (v.imageData) { generatedImages.push(v.imageData as typeof generatedImages[0]); toolCallsLog.push("generate_image(auto)"); }
        } catch { /* best-effort */ }
      }
      for (const img of generatedImages) finalText += `\n\n\`\`\`image\n${JSON.stringify(img)}\n\`\`\``;

      await writeEvent('status', { message: 'Composing final answer...' });

      // ── Deep Mode: Multi-Model Review ───────────────────────────────
      let reviewModelUsed: string | null = null;
      if (thinkingMode === "deep" && finalText.length > 100) {
        const timeLeft = 54_000 - (Date.now() - wallClockStart);
        if (timeLeft > 12_000) {
          const primaryProvider = MODEL_MAP[activeModelId]?.provider;
          const candidates = priorityList.filter(m => {
            const cfg = MODEL_MAP[m];
            return cfg && cfg.provider !== primaryProvider && cfg.supportsTools && getClientForModel(m) !== null && !isProviderCoolingDown(cfg.provider);
          });
          const allCandidates = candidates.length > 0 ? candidates : ALL_MODEL_IDS.filter(m => m !== activeModelId && getClientForModel(m) !== null);

          if (allCandidates.length > 0) {
            const revId = allCandidates[0];
            const revSetup = getClientForModel(revId);
            if (revSetup) {
              try {
                await writeEvent('status', { message: 'Cross-checking with second AI...' });
                const revTimeout = Math.min(timeLeft - 3_000, 20_000);
                const revResp = await Promise.race([
                  revSetup.client.chat.completions.create({
                    model: revSetup.apiModel,
                    max_tokens: Math.min(maxTokens, MODEL_COMPLETION_CAPS[revId] || 8192),
                    messages: [
                      { role: "system", content: "You are a senior academic reviewer. Check for errors, improve clarity, preserve all formatting blocks. Output the improved answer directly." },
                      { role: "user", content: `Question: ${message}\n\n---\n\nResponse to review:\n${finalText.slice(0, 12000)}` },
                    ],
                  }),
                  new Promise<never>((_, rej) => setTimeout(() => rej(new Error("Review timeout")), revTimeout)),
                ]);
                const revText = revResp.choices[0]?.message?.content?.trim();
                if (revText && revText.length > 80) {
                  const cleaned = revText.replace(/^(The original|Here is|I've reviewed|After reviewing)[\s\S]*?\n\n/i, "").trim();
                  if (cleaned.length > finalText.length * 0.3) {
                    finalText = cleaned;
                    reviewModelUsed = revId;
                    console.log(`Deep review: ${activeModelId} → ${revId}`);
                  }
                }
              } catch (e) {
                console.warn("Deep review failed:", e instanceof Error ? e.message : e);
              }
            }
          }
        }
      }

      const modelsUsed = reviewModelUsed
        ? `${MODEL_NAMES[activeModelId] || activeModelId} + ${MODEL_NAMES[reviewModelUsed] || reviewModelUsed}`
        : MODEL_NAMES[activeModelId] || activeModelId;

      await writeEvent('result', { data: {
        response: finalText,
        conversation_id: crypto.randomUUID(),
        thinking: thinkingContent, animation_url: null,
        sources: Array.from(new Set(sources)), tool_calls: toolCallsLog,
        charts, flowcharts, manim_animations: manimAnimations,
        generated_images: generatedImages, flashcard_sets: flashcardSets,
        quiz_sets: quizSets,
        mock_tests: mockTests.length > 0 ? mockTests : undefined,
        question_papers: questionPapers.length > 0 ? questionPapers : undefined,
        schedule_actions: scheduleActions,
        search_images: searchImages.length > 0 ? searchImages : undefined,
        error: null, model: modelsUsed,
        rate_limit_remaining: rateCheck.remaining,
      }});
      return;
    }

    // Max rounds exceeded
    await writeEvent('result', { data: {
      response: "Multiple research steps completed but couldn't fully resolve. Please rephrase.",
      conversation_id: crypto.randomUUID(),
      sources: Array.from(new Set(sources)), tool_calls: toolCallsLog,
      charts, flowcharts, manim_animations: manimAnimations,
      generated_images: generatedImages, flashcard_sets: flashcardSets, quiz_sets: quizSets,
      mock_tests: mockTests.length > 0 ? mockTests : undefined,
      question_papers: questionPapers.length > 0 ? questionPapers : undefined,
      schedule_actions: scheduleActions, error: null, model: activeModelId,
    }});
  } catch (error: unknown) {
    console.error("Chat API error:", error);
    const apiErr = error as { status?: number; code?: string };
    const rawMsg = error instanceof Error ? error.message : String(error);
    const msg = rawMsg.toLowerCase();
    const sc = apiErr.status;
    let userError = "Something went wrong. Please try again.";
    let hint = "";

    if (sc === 429 || msg.includes("rate")) { userError = "All AI providers are temporarily rate-limited. Please wait 30 seconds."; hint = "rate_limited"; }
    else if (sc === 401 || msg.includes("api_key") || msg.includes("unauthorized")) { userError = "API auth failed. Contact admin."; hint = "auth_error"; }
    else if (sc === 403) { userError = "Access denied."; hint = "forbidden"; }
    else if (msg.includes("quota") || msg.includes("exceeded")) { userError = "API quota exceeded."; hint = "quota_exceeded"; }
    else if (msg.includes("connect") || msg.includes("network")) { userError = "Cannot reach AI service."; hint = "network_error"; }
    else if (msg.includes("timeout")) { userError = "Request took too long. Try Fast mode."; hint = "timeout"; }
    else if (sc === 404 || msg.includes("not found") || msg.includes("decommissioned")) { userError = "AI model unavailable. Try again."; hint = "model_not_found"; }
    else if (msg.includes("content_filter") || msg.includes("safety")) { userError = "Content flagged. Please rephrase."; hint = "content_filter"; }
    else if (sc === 400 || msg.includes("bad request")) { userError = "Request rejected. Try different wording."; hint = "bad_request"; }
    else if (sc === 413) { userError = "Request too large. Reduce attachments."; hint = "payload_too_large"; }
    else if (sc && sc >= 500) { userError = "AI service issues. Try again."; hint = "server_error"; }

    console.error(`[${hint || "unknown"}] ${rawMsg.slice(0, 200)}`);

    const hasData = [charts, flowcharts, generatedImages, flashcardSets, quizSets, mockTests, questionPapers, searchImages].some(a => (a?.length || 0) > 0);
    let resp = userError;
    if (hasData) {
      resp = "Model error but results prepared below.";
      for (const c of charts) resp += `\n\n\`\`\`chart\n${JSON.stringify(c)}\n\`\`\``;
      for (const f of flowcharts) resp += `\n\n\`\`\`mermaid\n${f.mermaidCode}\n\`\`\``;
      for (const img of generatedImages) resp += `\n\n\`\`\`image\n${JSON.stringify(img)}\n\`\`\``;
    }

    await writeEvent('result', { data: {
      response: resp, conversation_id: crypto.randomUUID(),
      error: hasData ? null : (hint || "unknown_error"),
      sources: Array.from(new Set(sources || [])), tool_calls: toolCallsLog || [],
      charts: charts || [], flowcharts: flowcharts || [],
      generated_images: generatedImages || [], flashcard_sets: flashcardSets || [],
      quiz_sets: quizSets || [],
      mock_tests: (mockTests?.length || 0) > 0 ? mockTests : undefined,
      question_papers: (questionPapers?.length || 0) > 0 ? questionPapers : undefined,
      search_images: searchImages.length > 0 ? searchImages : undefined,
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
      conversation_id: crypto.randomUUID(),
      error: "internal_error",
      sources: [], tool_calls: [], charts: [], model: "unknown",
    }, { status: 200 });
  }
}
