/**
 * Chat API Route — SchoolIT AI
 * ==============================
 * Multi-provider support: GitHub Models → Groq → Google Gemini
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

// ── Provider Configuration ────────────────────────────────────────────
type ProviderName = "github" | "groq" | "gemini";

interface ProviderConfig {
  name: ProviderName;
  baseURL: string;
  getApiKey: () => string | undefined;
}

const PROVIDERS: Record<ProviderName, ProviderConfig> = {
  github: {
    name: "github",
    baseURL: "https://models.inference.ai.azure.com",
    getApiKey: () => process.env.GITHUB_TOKEN?.trim(),
  },
  groq: {
    name: "groq",
    baseURL: "https://api.groq.com/openai/v1",
    getApiKey: () => process.env.GROQ_API_KEY?.trim(),
  },
  gemini: {
    name: "gemini",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    getApiKey: () => process.env.GEMINI_API_KEY?.trim(),
  },
};

// Model → provider + actual API model name
interface ModelConfig {
  provider: ProviderName;
  apiModel: string;       // the model name sent to the API
  supportsTools: boolean;
  supportsVision: boolean;
}

const MODEL_MAP: Record<string, ModelConfig> = {
  "gpt-4.1":          { provider: "github", apiModel: "gpt-4.1",                    supportsTools: true,  supportsVision: true  },
  "gpt-4o":           { provider: "github", apiModel: "gpt-4o",                     supportsTools: true,  supportsVision: true  },
  "llama-3.3-70b":    { provider: "groq",   apiModel: "llama-3.3-70b-versatile",    supportsTools: true,  supportsVision: false },
  "gemma2-9b":        { provider: "groq",   apiModel: "gemma2-9b-it",              supportsTools: true,  supportsVision: false },
  "gemini-2.0-flash": { provider: "gemini", apiModel: "gemini-2.0-flash",           supportsTools: true,  supportsVision: true  },
  "gemini-1.5-flash": { provider: "gemini", apiModel: "gemini-1.5-flash",           supportsTools: true,  supportsVision: true  },
};

// Ordered fallback preference: GitHub → Groq → Gemini (ALL FREE)
const ALL_MODEL_IDS = ["gpt-4o", "gpt-4.1", "llama-3.3-70b", "gemma2-9b", "gemini-2.0-flash", "gemini-1.5-flash"];

// Models that require max_completion_tokens instead of max_tokens
const USES_MAX_COMPLETION_TOKENS = new Set<string>();

// Models that return reasoning_content (grok-3-mini style thinking)
const HAS_REASONING_CONTENT = new Set<string>([]);

// Token limits per thinking mode — generous to avoid truncation
const THINKING_MODE_TOKENS: Record<string, number> = {
  fast: 16384,
  balanced: 16384,
  deep: 16384,
};

// Per-model completion caps (controls output token burn)
const MODEL_COMPLETION_CAPS: Record<string, number> = {
  "llama-3.3-70b": 4096,
  "gemma2-9b": 4096,
  "gpt-4o": 8192,
  "gpt-4.1": 8192,
  "gemini-2.0-flash": 8192,
  "gemini-1.5-flash": 8192,
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

// ── Multi-Provider Client Factory ─────────────────────────────────────
const clientCache = new Map<ProviderName, OpenAI>();

function getClientForProvider(provider: ProviderName): OpenAI | null {
  const cached = clientCache.get(provider);
  if (cached) return cached;

  const config = PROVIDERS[provider];
  const apiKey = config.getApiKey();
  if (!apiKey) return null;

  const client = new OpenAI({
    baseURL: config.baseURL,
    apiKey,
  });
  clientCache.set(provider, client);
  return client;
}

function getClientForModel(modelId: string): { client: OpenAI; apiModel: string; config: ModelConfig } | null {
  const config = MODEL_MAP[modelId];
  if (!config) return null;
  const client = getClientForProvider(config.provider);
  if (!client) return null;
  return { client, apiModel: config.apiModel, config };
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
    "https://frontend-",  // Vercel preview deployments for this project
    "http://localhost:3000",
    "http://localhost:3001",
  ];
  return allowed.some((a) => origin.startsWith(a) || referer.startsWith(a));
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

  // ── Anti-harassment content filter ──────────────────────────────────
  // Block harassing/derogatory messages about the creator or students
  const lowerMsg = message.toLowerCase();
  const harassmentPatterns = [
    /ayush.*fem\s*boy/i,
    /fem\s*boy.*ayush/i,
    /is\s+ayush\s+(a|the)\s+fem/i,
    /ayush.*\b(gay|trans|homo|queer|sissy|trap)\b/i,
    /\b(gay|trans|homo|queer|sissy|trap|fem\s*boy)\b.*ayush/i,
  ];
  const isHarassment = harassmentPatterns.some(p => p.test(message));
  if (isHarassment) {
    // Log the violation
    console.warn(`[MODERATION] Harassment blocked from IP: ${ip}, email: ${userEmail || "guest"}`);
    return NextResponse.json({
      response: "⛔ This message violates SchoolIT AI's anti-harassment policy. Your access has been suspended for 7 days. Harassment, bullying, and inappropriate personal remarks are strictly prohibited.",
      conversation_id: crypto.randomUUID(),
      sources: [],
      tool_calls: [],
      charts: [],
      model: "moderation",
      moderation_action: "access_suspended",
      penalty_days: 7,
    }, { status: 200 }); // 200 so frontend renders the message
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
  const thinkingModeMax = THINKING_MODE_TOKENS[thinkingMode] || 4096;

  // ── Smart Auto-Routing by Thinking Mode ──────────────────────────────
  // Instead of user-selected models, the system picks the best model(s)
  // based on thinking mode and falls back silently across all providers.
  //
  // Fast:     Groq (fastest inference) → Gemini Flash → GitHub
  // Balanced: GPT-4.1 (best quality) → GPT-4o → Llama → Gemini
  // Deep:     GPT-4.1 (primary) + review pass by a second model
  const THINKING_MODE_MODEL_PRIORITY: Record<string, string[]> = {
    fast:     ["llama-3.3-70b", "gemma2-9b", "gemini-1.5-flash", "gemini-2.0-flash", "gpt-4o", "gpt-4.1"],
    balanced: ["gpt-4.1", "gpt-4o", "llama-3.3-70b", "gemini-2.0-flash", "gemma2-9b", "gemini-1.5-flash"],
    deep:     ["gpt-4.1", "gpt-4o", "gemini-2.0-flash", "llama-3.3-70b", "gemini-1.5-flash", "gemma2-9b"],
  };

  // Pick the first available model from the priority list
  const priorityList = THINKING_MODE_MODEL_PRIORITY[thinkingMode] || THINKING_MODE_MODEL_PRIORITY.balanced;
  const modelId = priorityList.find(m => getClientForModel(m) !== null) || "gpt-4.1";
  const maxTokens = Math.min(thinkingModeMax, MODEL_COMPLETION_CAPS[modelId] || thinkingModeMax);
  const wantsVisual = /(\bimage\b|\bdiagram\b|\billustration\b|\bvisuali[sz]e\b|\bdraw\b|\bshow\b.*\bstructure\b|\bshow\b.*\bprocess\b)/i.test(message);

  const history = Array.isArray(body.history) ? body.history : [];
  const contextFiles = Array.isArray(body.context_files) ? body.context_files : [];
  const scheduleContext = typeof body.schedule_context === "string" ? body.schedule_context : "";
  const memoryContext = typeof body.memory_context === "string" ? body.memory_context : "";

  const hasYouTubeUrl = /(https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)[^\s]+)/i.test(message);
  const wantsFlowchart = /(flowchart|diagram|mind ?map|process map)/i.test(message);
  const wantsFlashcards = /(flashcards?|revision cards?|study cards?)/i.test(message);
  const wantsQuiz = /(quiz me|mcq|test me|practice questions?)/i.test(message);
  const wantsQuestionPaper = /(question paper|sample paper|practice paper|mock paper|previous year|model paper)/i.test(message);
  const wantsMockTest = /(mock test|timed test|simulate exam|exam simulation|timed quiz|practice exam)/i.test(message);
  const wantsCBSENews = /(cbse update|cbse notification|date sheet|exam date|syllabus change|board announcement|cbse circular|cbse news)/i.test(message);
  const hasFilesAttached = contextFiles.length > 0;

  let toolHint = "";
  if (hasYouTubeUrl) toolHint += "[ToolHint: Use summarize_video for the provided video URL.]\n";
  if (wantsFlowchart) toolHint += "[ToolHint: Use generate_flowchart and render Mermaid output.]\n";
  if (wantsFlashcards) toolHint += "[ToolHint: Use create_flashcards.]\n";
  if (wantsQuiz && !wantsMockTest && !wantsQuestionPaper) toolHint += "[ToolHint: Use generate_quiz.]\n";
  if (wantsQuestionPaper) toolHint += "[ToolHint: Use generate_question_paper to create a full CBSE-style paper with sections and model answers.]\n";
  if (wantsMockTest) toolHint += "[ToolHint: Use generate_mock_test to create a timed mock exam with timer and auto-evaluation.]\n";
  if (wantsCBSENews) toolHint += "[ToolHint: Use cbse_notifications to fetch latest CBSE updates, dates, and circulars.]\n";
  if (hasFilesAttached) {
    toolHint += "[ToolHint: Files are attached. Use analyze_document for docs and analyze_screenshot for images.]\n";
  }
  const effectiveMessage = toolHint ? `${message}\n\n${toolHint.trim()}` : message;

  // Build file context string
  let fileContext: string | undefined;
  if (contextFiles.length > 0) {
    const parts = contextFiles
      .slice(0, 5)
      .map((f: Record<string, unknown>) => {
        const name = sanitizeString(String(f.name || "file"), 200);
        const type = String(f.type || "unknown");
        const rawContent = String(f.content || "");
        const isBinaryMarker = rawContent.includes("[BINARY_FILE]") || /^(application\/pdf|application\/zip|application\/octet-stream|application\/msword|application\/vnd\.)/i.test(type);
        if (isBinaryMarker) {
          return `### File: ${name}\nType: ${type}\nBinary file attached. Use analyze_document tool for metadata-aware help.`;
        }
        const content = sanitizeString(rawContent, 15_000);
        return `### File: ${name}\nType: ${type}\n${content}`;
      });
    fileContext = parts.join("\n\n");
  }

  // Build system prompt (with memory context for admin, admin PII only for admin)
  const systemPrompt = buildSystemPrompt(persona, subject, chainOfThought, fileContext, memoryContext || undefined, isAdmin);

  // Append schedule context if available
  const fullSystemPrompt = scheduleContext
    ? systemPrompt + `\n\n## Student's Current Schedule:\n${scheduleContext}\n\nWhen the student asks about scheduling, planning, or study sessions, use the manage_schedule tool to add items. Reference their existing schedule when relevant.`
    : systemPrompt;

  // Get AI client for requested model
  const primarySetup = getClientForModel(modelId);
  if (!primarySetup) {
    // Check if ANY provider is configured
    const anyAvailable = ALL_MODEL_IDS.some(m => getClientForModel(m) !== null);
    if (!anyAvailable) {
      return NextResponse.json({
        response:
          "The AI service is not configured. Please set at least one API key (GITHUB_TOKEN, GROQ_API_KEY, GEMINI_API_KEY, or OPENROUTER_API_KEY) in environment variables.",
        conversation_id: crypto.randomUUID(),
        error: "No AI providers configured",
        sources: [],
        tool_calls: [],
        charts: [],
        model: modelId,
      });
    }
  }

  // Build messages array
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: fullSystemPrompt },
  ];

  // Log system prompt size for debugging
  console.log(`System prompt size: ${fullSystemPrompt.length} chars, model: ${modelId}, isAdmin: ${isAdmin}, historyLen: ${history.length}`);

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
  const primaryConfig = MODEL_MAP[modelId];
  const modelSupportsVision = primaryConfig?.supportsVision ?? false;

  // Filter oversized images (>2MB base64 ≈ 1.5MB actual) to prevent API failures
  const safeImages = imageFiles.filter((f: Record<string, unknown>) => String(f.content || "").length < 2_000_000);
  const oversizedCount = imageFiles.length - safeImages.length;

  if (safeImages.length > 0 && modelSupportsVision) {
    const sizeNote = oversizedCount > 0 ? `\n\n(${oversizedCount} image(s) skipped — too large. Please resize to under 1.5MB.)` : "";
    const contentParts: OpenAI.Chat.ChatCompletionContentPart[] = [
      { type: "text", text: effectiveMessage + sizeNote },
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
    const imageNote = `\n\n[The user attached ${imageFiles.length} image(s): ${imageFiles.map((f: Record<string, unknown>) => String(f.name || "image")).join(", ")}. This model doesn't support direct image analysis. Please let the user know you can see they attached images but recommend switching to GPT-4.1, GPT-4o, or Gemini for image/screenshot analysis.]`;
    messages.push({ role: "user", content: effectiveMessage + imageNote });
  } else if (oversizedCount > 0) {
    messages.push({ role: "user", content: effectiveMessage + `\n\n[The uploaded image(s) were too large to process. Please resize to under 1.5MB per image and try again.]` });
  } else {
    messages.push({ role: "user", content: effectiveMessage });
  }

  // Build tool list
  const requestedTools = useWebSearch
    ? TOOL_DEFINITIONS
    : TOOL_DEFINITIONS.filter((t) => t.function.name !== "web_search");
  const isSimplePrompt = message.trim().split(/\s+/).length <= 3 && contextFiles.length === 0;
  const tools = isSimplePrompt ? [] : requestedTools;

  // === NDJSON STREAMING RESPONSE ===
  // Streams real-time status updates + final result as newline-delimited JSON.
  const encoder = new TextEncoder();
  const MODEL_NAMES: Record<string, string> = {
    "gpt-4.1": "GPT-4.1", "gpt-4o": "GPT-4o",
    "llama-3.3-70b": "Llama 3.3 70B", "gemma2-9b": "Gemma 2 9B",
    "gemini-2.0-flash": "Gemini 2.0 Flash", "gemini-1.5-flash": "Gemini 1.5 Flash",
  };
  const TOOL_LABELS: Record<string, string> = {
    web_search: "Searching the web", generate_chart: "Generating chart",
    generate_flowchart: "Creating flowchart", create_flashcards: "Creating flashcards",
    generate_quiz: "Generating quiz", manage_schedule: "Managing schedule",
    manage_calendar: "Updating calendar",
    analyze_document: "Analyzing document", analyze_screenshot: "Analyzing image",
    summarize_video: "Analyzing video",
    generate_image: "Generating image", create_manim_animation: "Creating animation",
    search_knowledge_base: "Searching knowledge base",
    generate_question_paper: "Generating question paper",
    generate_mock_test: "Creating mock test",
    cbse_notifications: "Fetching CBSE updates",
  };

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const writeEvent = async (type: string, payload: Record<string, unknown> = {}) => {
    try { await writer.write(encoder.encode(JSON.stringify({ type, ...payload }) + '\n')); } catch {}
  };

  // Fire-and-forget: AI logic runs async, pushes events to stream
  (async () => {
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
  const mockTests: unknown[] = [];
  const questionPapers: unknown[] = [];
  const searchImages: { url: string; thumbnail: string; title: string; source: string }[] = [];

  try {
    let activeModelId = modelId;

    // Prefer tool/vision-reliable models for analyzer-heavy requests
    const taskNeedsReliableTools =
      hasFilesAttached ||
      imageFiles.length > 0 ||
      hasYouTubeUrl ||
      wantsFlowchart ||
      wantsFlashcards ||
      wantsQuiz ||
      wantsQuestionPaper ||
      wantsMockTest;

    if (taskNeedsReliableTools) {
      const currentConfig = MODEL_MAP[activeModelId];
      const needsToolCapable = !currentConfig?.supportsTools;
      if (needsToolCapable) {
        const preferredToolModels = ["gpt-4o", "gpt-4.1", "llama-3.3-70b", "gemma2-9b", "gemini-2.0-flash"];
        const replacement = preferredToolModels.find((m) => getClientForModel(m) !== null);
        if (replacement) {
          activeModelId = replacement;
        }
      }
    }

    // Newer models require max_completion_tokens, older ones use max_tokens
    const tokenParam = USES_MAX_COMPLETION_TOKENS.has(modelId)
      ? { max_completion_tokens: maxTokens }
      : { max_tokens: maxTokens };

    // Track which round we're on for smarter timeout management
    let loopRound = 0;

    // Wall-clock start time — MUST return before Vercel's 60s limit
    const wallClockStart = Date.now();

    // Helper: attempt an API call with automatic multi-provider fallback
    // Uses thinking-mode priority list for model ordering
    const callWithFallback = async (msgs: OpenAI.Chat.ChatCompletionMessageParam[]) => {
      // Build model list from thinking mode priority, then fill in remaining
      const priorityModels = (THINKING_MODE_MODEL_PRIORITY[thinkingMode] || THINKING_MODE_MODEL_PRIORITY.balanced)
        .filter(m => getClientForModel(m) !== null);
      // If activeModelId was swapped (e.g., for tool-heavy tasks), ensure it's first
      const modelsFromPriority = activeModelId !== priorityModels[0]
        ? [activeModelId, ...priorityModels.filter(m => m !== activeModelId)]
        : priorityModels;
      const otherModels = ALL_MODEL_IDS.filter(m => !modelsFromPriority.includes(m) && getClientForModel(m) !== null);
      const imageAttached = imageFiles.length > 0;

      let modelsToTry = [...modelsFromPriority, ...otherModels];

      // If user attached images, prioritize vision-capable models first
      if (imageAttached) {
        modelsToTry = modelsToTry.sort((a, b) => {
          const av = MODEL_MAP[a]?.supportsVision ? 1 : 0;
          const bv = MODEL_MAP[b]?.supportsVision ? 1 : 0;
          return bv - av;
        });
      }

      if (modelsToTry.length === 0) {
        throw new Error("No AI providers are configured. Set GITHUB_TOKEN, GROQ_API_KEY, GEMINI_API_KEY, or OPENROUTER_API_KEY.");
      }

      let lastError: unknown = null;
      let modelsAttempted = 0;

      for (let i = 0; i < modelsToTry.length; i++) {
        const tryModelId = modelsToTry[i];
        const setup = getClientForModel(tryModelId);
        if (!setup) continue;

        const { client: modelClient, apiModel, config: modelConfig } = setup;

        // Dynamic timeout based on how many models we might still try
        const elapsed = Date.now() - wallClockStart;
        const remaining = Math.max(54_000 - elapsed, 8_000);

        // First model gets generous time; fallbacks split the rest
        let callTimeout: number;
        if (i === 0) {
          callTimeout = Math.min(Math.floor(remaining * 0.6), 35_000);
        } else {
          const fallbacksLeft = modelsToTry.length - i;
          callTimeout = Math.max(Math.floor((remaining - 2_000) / fallbacksLeft), 8_000);
        }

        // Skip if we're almost out of time
        if (remaining < 6_000 && i > 0) break;

        try {
          // Disable tools for models that don't support function-calling
          const useTools = modelConfig.supportsTools && tools.length > 0;

          // Filter out tool messages if switching to a no-tool model
          let filteredMsgs = msgs;
          if (!modelConfig.supportsTools) {
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
          if (!modelConfig.supportsVision) {
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

          console.log(`[${modelConfig.provider}] Trying ${apiModel} (timeout=${callTimeout}ms, round=${loopRound})`);

          // Stream status: show friendly thinking message (hide model internals from user)
          const thinkingLabel = i === 0 ? "SchoolIT AI is thinking..." : "Trying another approach...";
          await writeEvent('status', { message: thinkingLabel });

          const stripToolMsgs = (inputMsgs: OpenAI.Chat.ChatCompletionMessageParam[]) =>
            inputMsgs
              .filter((m) => m.role !== "tool")
              .map((m) => {
                if (m.role === "assistant" && "tool_calls" in m) {
                  // eslint-disable-next-line @typescript-eslint/no-unused-vars
                  const { tool_calls: _tc, ...rest } = m as unknown as Record<string, unknown>;
                  return rest as unknown as OpenAI.Chat.ChatCompletionMessageParam;
                }
                return m;
              });

          const invoke = async (inputMsgs: OpenAI.Chat.ChatCompletionMessageParam[], allowTools: boolean) =>
            await Promise.race([
              modelClient.chat.completions.create({
                model: apiModel,
                ...tokenParam,
                messages: inputMsgs,
                tools: allowTools ? tools : undefined,
                tool_choice: allowTools ? "auto" : undefined,
              }),
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error(`Model ${apiModel} timed out after ${callTimeout / 1000}s`)), callTimeout)
              ),
            ]);

          // First attempt (with tools if enabled)
          let response: OpenAI.Chat.ChatCompletion;
          try {
            response = await invoke(filteredMsgs, useTools);
          } catch (firstErr: unknown) {
            const status = (firstErr as { status?: number })?.status;
            const errMsg = firstErr instanceof Error ? firstErr.message.toLowerCase() : "";
            const looksLikeBadRequest = status === 400 || errMsg.includes("bad request") || errMsg.includes("invalid");

            // Retry same model without tools for compatibility/smaller payload
            if (useTools && looksLikeBadRequest) {
              await writeEvent("status", { message: "Retrying in lightweight mode..." });
              response = await invoke(stripToolMsgs(filteredMsgs), false);
            } else {
              throw firstErr;
            }
          }

          // If we fell back to a different model, remember it (silent to user)
          if (tryModelId !== activeModelId) {
            console.log(`Model fallback: ${activeModelId} → ${tryModelId} [${modelConfig.provider}]`);
            activeModelId = tryModelId;
          }
          return response;
        } catch (err: unknown) {
          const status = (err as { status?: number })?.status;
          const errMsg = err instanceof Error ? err.message.toLowerCase() : "";
          const isLastModel = i === modelsToTry.length - 1;
          const isFatal = errMsg.includes("api_key") || errMsg.includes("unauthorized") || status === 401;
          const isPayloadTooLarge = status === 413 || errMsg.includes("too large");
          const isRateLimited = status === 429 || errMsg.includes("rate limit");
          const isModelMissing = status === 404 || errMsg.includes("not found") || errMsg.includes("does not exist");

          console.warn(`[${modelConfig.provider}] ${apiModel} failed (status=${status}, rateLimited=${isRateLimited}, msg="${(err instanceof Error ? err.message : "").slice(0, 150)}"), isLast=${isLastModel}`);
          lastError = err;
          modelsAttempted++;

          // Fatal auth errors for a specific provider: skip to next provider's models
          if (isFatal && !isLastModel) {
            await new Promise((r) => setTimeout(r, 50));
            continue;
          }
          if (isFatal && isLastModel) throw err;

          // Payload too large: skip to next model (might have larger context)
          if (isPayloadTooLarge && !isLastModel) {
            await new Promise((r) => setTimeout(r, 50));
            continue;
          }
          if (isPayloadTooLarge && isLastModel) throw err;

          // Model missing: always try next model
          if (isModelMissing && !isLastModel) {
            await new Promise((r) => setTimeout(r, 50));
            continue;
          }
          if (isModelMissing && isLastModel) throw err;

          // Rate limited: ALWAYS try next model (each provider has separate quota)
          if (isRateLimited && !isLastModel) {
            await new Promise((r) => setTimeout(r, 100));
            continue;
          }

          // Non-rate-limit errors: try up to 5 fallbacks before giving up
          if (!isRateLimited && !isModelMissing && modelsAttempted >= 5) throw err;
          if (isLastModel) throw err;

          // Brief pause before trying next model
          await new Promise((r) => setTimeout(r, 150));
          continue;
        }
      }
      throw lastError;
    };

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      // Bail out if we're running out of time (52s limit, leaves 8s safety)
      if (Date.now() - wallClockStart > 52_000) {
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
        await writeEvent('status', { message: 'Time limit reached, returning partial results...' });
        await writeEvent('result', { data: {
          response: partialText || "The request took too long. Please try again with a simpler query.",
          conversation_id: crypto.randomUUID(),
          thinking: null,
          animation_url: null,
          model: activeModelId,
          tool_calls: toolCallsLog,
          sources: Array.from(new Set(sources)),
          charts,
          flowcharts,
          flashcard_sets: flashcardSets,
          quiz_sets: quizSets,
          mock_tests: mockTests.length > 0 ? mockTests : undefined,
          question_papers: questionPapers.length > 0 ? questionPapers : undefined,
          manim_animations: manimAnimations,
          generated_images: generatedImages,
          schedule_actions: scheduleActions,
          search_images: searchImages.length > 0 ? searchImages : undefined,
          error: null,
        }});
        return;
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
        // Stream status for each tool being called
        for (const tc of assistantMsg.tool_calls) {
          const tName = tc.function.name;
          await writeEvent('status', { message: TOOL_LABELS[tName] || `Using ${tName.replace(/_/g, ' ')}...` });
        }
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
          // Inject user email for knowledge base search
          if (toolName === "search_knowledge_base") {
            toolInput._user_email = userEmail;
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
          if (toolResult.mockTestData) mockTests.push(toolResult.mockTestData);
          if (toolResult.questionPaperData) questionPapers.push(toolResult.questionPaperData);
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

      // ── Strip hallucinated image markdown ───────────────────────
      // Models often generate ![Image](url) with non-existent URLs.
      // Real images come from the ImageRenderer component, not markdown.
      finalText = finalText.replace(/!\[([^\]]*)\]\((?!https:\/\/image\.pollinations\.ai)[^)]+\)/g, "**$1**");

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

      // If user asked for a visual but the model didn't call generate_image,
      // create one automatically so the UI always has something renderable.
      if (wantsVisual && generatedImages.length === 0) {
        try {
          const fallbackVisual = await executeTool("generate_image", {
            prompt: message.slice(0, 300),
            style: "diagram",
            subject,
          });
          if (fallbackVisual.imageData) {
            generatedImages.push(fallbackVisual.imageData as { prompt: string; style: string; subject?: string; url?: string });
            toolCallsLog.push("generate_image(auto)");
          }
        } catch {
          // best-effort only
        }
      }

      // Append image blocks
      if (generatedImages.length > 0) {
        for (const img of generatedImages) {
          finalText += `\n\n\`\`\`image\n${JSON.stringify(img)}\n\`\`\``;
        }
      }

      await writeEvent('status', { message: 'Composing final answer...' });

      // ── Deep Mode: Multi-Model Review Pass ────────────────────────
      // In deep mode, after the primary model finishes, send the response
      // to a DIFFERENT model for accuracy review and refinement.
      // This combines the strengths of multiple models.
      let reviewModelUsed: string | null = null;
      if (thinkingMode === "deep" && finalText.length > 100) {
        const timeLeft = 54_000 - (Date.now() - wallClockStart);
        // Only attempt review if we have at least 12s left
        if (timeLeft > 12_000) {
          // Pick a review model from a different provider than the primary
          const primaryProvider = MODEL_MAP[activeModelId]?.provider;
          const reviewCandidates = priorityList.filter(m => {
            const cfg = MODEL_MAP[m];
            return cfg && cfg.provider !== primaryProvider && getClientForModel(m) !== null;
          });
          // Fallback: any model that's different from primary
          const allCandidates = reviewCandidates.length > 0
            ? reviewCandidates
            : ALL_MODEL_IDS.filter(m => m !== activeModelId && getClientForModel(m) !== null);

          if (allCandidates.length > 0) {
            const reviewModelId = allCandidates[0];
            const reviewSetup = getClientForModel(reviewModelId);

            if (reviewSetup) {
              try {
                await writeEvent('status', { message: `Cross-checking with ${MODEL_NAMES[reviewModelId] || reviewModelId}...` });

                const reviewTimeout = Math.min(timeLeft - 3_000, 20_000);
                const reviewMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
                  {
                    role: "system",
                    content: `You are a senior academic reviewer for CBSE students. You've been given a student's question and another AI's response. Your job:

1. CHECK for factual errors, wrong formulas, incorrect calculations, or misleading statements.
2. CHECK for missing important steps, concepts, or edge cases.
3. IMPROVE clarity, add any missing LaTeX formatting (use $inline$ and $$display$$), and enhance explanations.
4. KEEP the same structure and tone — don't rewrite from scratch unless the original is seriously flawed.
5. If the original response is already excellent, return it with only minor polish.
6. PRESERVE all markdown formatting, code blocks, mermaid blocks, chart blocks, and image blocks exactly as they are.
7. Do NOT add meta-commentary like "The original response was good". Just output the final improved answer directly.`
                  },
                  {
                    role: "user",
                    content: `Student's question: ${message}\n\n---\n\nAI Response to review:\n${finalText.slice(0, 12000)}`
                  }
                ];

                const reviewResponse = await Promise.race([
                  reviewSetup.client.chat.completions.create({
                    model: reviewSetup.apiModel,
                    max_tokens: Math.min(maxTokens, MODEL_COMPLETION_CAPS[reviewModelId] || 8192),
                    messages: reviewMessages,
                  }),
                  new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error("Review timed out")), reviewTimeout)
                  ),
                ]);

                const reviewText = reviewResponse.choices[0]?.message?.content?.trim();
                if (reviewText && reviewText.length > 80) {
                  // Strip any meta-commentary the reviewer might add
                  const cleaned = reviewText
                    .replace(/^(The original response|Here is the reviewed|I've reviewed|After reviewing)[\s\S]*?\n\n/i, "")
                    .trim();

                  if (cleaned.length > finalText.length * 0.3) {
                    finalText = cleaned;
                    reviewModelUsed = reviewModelId;
                    console.log(`Deep mode review: ${activeModelId} → reviewed by ${reviewModelId}`);
                  }
                }
              } catch (reviewErr) {
                // Review is best-effort — if it fails, use the original response
                console.warn("Deep mode review failed (using original):", reviewErr instanceof Error ? reviewErr.message : reviewErr);
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
        mock_tests: mockTests.length > 0 ? mockTests : undefined,
        question_papers: questionPapers.length > 0 ? questionPapers : undefined,
        schedule_actions: scheduleActions,
        search_images: searchImages.length > 0 ? searchImages : undefined,
        error: null,
        model: modelsUsed,
        rate_limit_remaining: rateCheck.remaining,
      }});
      return;
    }

    // Max rounds exceeded
    await writeEvent('result', { data: {
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
      mock_tests: mockTests.length > 0 ? mockTests : undefined,
      question_papers: questionPapers.length > 0 ? questionPapers : undefined,
      schedule_actions: scheduleActions,
      error: null,
      model: activeModelId,
    }});
  } catch (error: unknown) {
    console.error("Chat API error:", error);
    console.error("Error type:", typeof error);
    console.error("Error constructor:", error?.constructor?.name);
    if (error instanceof Error) {
      console.error("Error stack:", error.stack);
    }
    // Log OpenAI-specific error properties
    const apiErr = error as { status?: number; code?: string; type?: string; headers?: Record<string, string> };
    console.error("Status:", apiErr.status, "Code:", apiErr.code, "Type:", apiErr.type);

    const rawMsg = error instanceof Error ? error.message : String(error);
    const msg = rawMsg.toLowerCase();
    const statusCode = (error as { status?: number })?.status;
    let userError = "Something went wrong. Please try again in a moment.";
    let statusHint = "";

    if (statusCode === 429 || msg.includes("rate") || msg.includes("429")) {
      userError = "All AI providers are rate-limited right now. GitHub Models allows 50/day, Groq and Gemini have per-minute limits. Please try again in a minute.";
      statusHint = "rate_limited";
    } else if (statusCode === 401 || msg.includes("auth") || msg.includes("401") || msg.includes("api_key") || msg.includes("unauthorized") || msg.includes("invalid")) {
      userError = "API authentication failed. The server token may need to be refreshed — please contact the admin.";
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
      userError = "The request took too long. Try asking a shorter question or switching to Fast mode.";
      statusHint = "timeout";
    } else if (statusCode === 404 || msg.includes("not found") || msg.includes("does not exist") || msg.includes("404")) {
      userError = "The AI model isn't available right now. The system will auto-retry with alternatives — please try again.";
      statusHint = "model_not_found";
    } else if (msg.includes("content_filter") || msg.includes("content policy") || msg.includes("safety")) {
      userError = "Your message was flagged by the content safety filter. Please rephrase your question.";
      statusHint = "content_filter";
    } else if (statusCode === 400 || msg.includes("bad request") || msg.includes("bad_request")) {
      userError = "The AI model rejected this request. Try a shorter message or different wording.";
      statusHint = "bad_request";
    } else if (statusCode === 413 || msg.includes("too large") || msg.includes("413")) {
      userError = "The request was too large for the AI model. Try a shorter message or fewer attachments.";
      statusHint = "payload_too_large";
    } else if (statusCode && statusCode >= 500) {
      userError = "The AI service is experiencing issues. Please try again in a moment.";
      statusHint = "server_error";
    }

    console.error(`Chat error [${statusHint || "unknown"}]: ${rawMsg}`);

    const hasUsefulData =
      (charts?.length || 0) > 0 ||
      (flowcharts?.length || 0) > 0 ||
      (generatedImages?.length || 0) > 0 ||
      (flashcardSets?.length || 0) > 0 ||
      (quizSets?.length || 0) > 0 ||
      (mockTests?.length || 0) > 0 ||
      (questionPapers?.length || 0) > 0 ||
      (searchImages?.length || 0) > 0;

    let partialResponse = userError;
    if (hasUsefulData) {
      partialResponse =
        "I hit a model error while finalizing the text response, but I already prepared useful results below.";

      if (charts.length > 0) {
        for (const chart of charts) {
          partialResponse += `\n\n\`\`\`chart\n${JSON.stringify(chart)}\n\`\`\``;
        }
      }
      if (flowcharts.length > 0) {
        for (const fc of flowcharts) {
          partialResponse += `\n\n\`\`\`mermaid\n${fc.mermaidCode}\n\`\`\``;
        }
      }
      if (generatedImages.length > 0) {
        for (const img of generatedImages) {
          partialResponse += `\n\n\`\`\`image\n${JSON.stringify(img)}\n\`\`\``;
        }
      }
    }

    await writeEvent('result', { data: {
      response: partialResponse,
      conversation_id: crypto.randomUUID(),
      error: hasUsefulData ? null : (statusHint || "unknown_error"),
      sources: Array.from(new Set(sources || [])),
      tool_calls: toolCallsLog || [],
      charts: charts || [],
      flowcharts: flowcharts || [],
      generated_images: generatedImages || [],
      flashcard_sets: flashcardSets || [],
      quiz_sets: quizSets || [],
      mock_tests: (mockTests?.length || 0) > 0 ? mockTests : undefined,
      question_papers: (questionPapers?.length || 0) > 0 ? questionPapers : undefined,
      search_images: searchImages.length > 0 ? searchImages : undefined,
      model: modelId,
    }});
  }
  })().catch((e) => {
    console.error("Stream async error:", e);
  }).finally(() => {
    writer.close().catch(() => {});
  });

  return new Response(readable, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Content-Type-Options': 'nosniff',
    },
  });
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
