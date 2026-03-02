/**
 * PROLAI — AI Provider Configuration & Client Factory
 * =====================================================
 * Manages multi-provider setup: Self-hosted → GitHub → Groq → Gemini
 * Handles provider cooldowns, client caching, and model configuration.
 */

import OpenAI from "openai";

// ── Provider Types ────────────────────────────────────────────────────
export type ProviderName = "github" | "groq" | "gemini" | "selfhosted";

export interface ProviderConfig {
  name: ProviderName;
  baseURL: string;
  getApiKey: () => string | undefined;
}

export interface ModelConfig {
  provider: ProviderName;
  apiModel: string;
  supportsTools: boolean;
  supportsVision: boolean;
}

// ── Provider Registry ─────────────────────────────────────────────────
export const PROVIDERS: Record<ProviderName, ProviderConfig> = {
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
  selfhosted: {
    name: "selfhosted",
    baseURL: process.env.SELF_HOSTED_LLM_URL?.trim() || "",
    getApiKey: () => process.env.SELF_HOSTED_LLM_API_KEY?.trim() || "prolai-selfhosted",
  },
};

// ── Model Registry ────────────────────────────────────────────────────
export const MODEL_MAP: Record<string, ModelConfig> = {
  "gpt-4.1":          { provider: "github",     apiModel: "gpt-4.1",                    supportsTools: true,  supportsVision: true  },
  "gpt-4o":           { provider: "github",     apiModel: "gpt-4o",                     supportsTools: true,  supportsVision: true  },
  "llama-3.3-70b":    { provider: "groq",       apiModel: "llama-3.3-70b-versatile",    supportsTools: true,  supportsVision: false },
  "llama-3.1-8b":     { provider: "groq",       apiModel: "llama-3.1-8b-instant",       supportsTools: true,  supportsVision: false },
  "gemini-2.0-flash": { provider: "gemini",     apiModel: "gemini-2.0-flash",           supportsTools: true,  supportsVision: true  },
  "gemini-1.5-flash": { provider: "gemini",     apiModel: "gemini-1.5-flash",           supportsTools: true,  supportsVision: true  },
  "prolai-llm":       { provider: "selfhosted", apiModel: process.env.SELF_HOSTED_LLM_MODEL_ID?.trim() || "prolai-llm", supportsTools: false, supportsVision: false },
};

export const ALL_MODEL_IDS = [
  "prolai-llm", "gpt-4o", "gpt-4.1",
  "llama-3.3-70b", "llama-3.1-8b",
  "gemini-2.0-flash", "gemini-1.5-flash",
];

export const MODEL_NAMES: Record<string, string> = {
  "gpt-4.1": "GPT-4.1",
  "gpt-4o": "GPT-4o",
  "llama-3.3-70b": "Llama 3.3 70B",
  "llama-3.1-8b": "Llama 3.1 8B",
  "gemini-2.0-flash": "Gemini 2.0 Flash",
  "gemini-1.5-flash": "Gemini 1.5 Flash",
  "prolai-llm": "PROLAI LLM",
};

// Models that require max_completion_tokens instead of max_tokens
export const USES_MAX_COMPLETION_TOKENS = new Set<string>();

// Models that return reasoning_content (grok-3-mini style thinking)
export const HAS_REASONING_CONTENT = new Set<string>([]);

// Per-model completion caps
export const MODEL_COMPLETION_CAPS: Record<string, number> = {
  "llama-3.3-70b": 8192,
  "llama-3.1-8b": 4096,
  "gpt-4o": 8192,
  "gpt-4.1": 8192,
  "gemini-2.0-flash": 8192,
  "gemini-1.5-flash": 8192,
  "prolai-llm": 4096,
};

// Token limits per thinking mode
export const THINKING_MODE_TOKENS: Record<string, number> = {
  fast: 8192,
  balanced: 16384,
  deep: 16384,
};

// Thinking-mode model priority lists
export const THINKING_MODE_MODEL_PRIORITY: Record<string, string[]> = {
  fast:     ["prolai-llm", "gpt-4o", "gemini-2.0-flash", "llama-3.1-8b", "gpt-4.1", "gemini-1.5-flash", "llama-3.3-70b"],
  balanced: ["prolai-llm", "gpt-4.1", "gemini-2.0-flash", "gpt-4o", "llama-3.1-8b", "gemini-1.5-flash", "llama-3.3-70b"],
  deep:     ["prolai-llm", "gpt-4.1", "gpt-4o", "gemini-2.0-flash", "llama-3.3-70b", "gemini-1.5-flash", "llama-3.1-8b"],
};

// Tool status labels
export const TOOL_LABELS: Record<string, string> = {
  web_search: "Searching the web",
  generate_chart: "Generating chart",
  generate_flowchart: "Creating flowchart",
  create_flashcards: "Creating flashcards",
  generate_quiz: "Generating quiz",
  manage_schedule: "Managing schedule",
  manage_calendar: "Updating calendar",
  analyze_document: "Analyzing document",
  analyze_screenshot: "Analyzing image",
  summarize_video: "Analyzing video",
  generate_image: "Generating image",
  create_manim_animation: "Creating animation",
  search_knowledge_base: "Searching knowledge base",
  generate_question_paper: "Generating question paper",
  generate_mock_test: "Creating mock test",
  cbse_notifications: "Fetching CBSE updates",
};

// ── Provider-Level Rate-Limit Cooldown ────────────────────────────────
const providerCooldown = new Map<ProviderName, number>();
const COOLDOWN_MS: Record<ProviderName, number> = {
  github: 30_000,
  groq: 90_000,
  gemini: 30_000,
  selfhosted: 10_000,
};

export function isProviderCoolingDown(provider: ProviderName): boolean {
  const until = providerCooldown.get(provider);
  if (!until) return false;
  if (Date.now() > until) { providerCooldown.delete(provider); return false; }
  return true;
}

export function markProviderRateLimited(provider: ProviderName) {
  providerCooldown.set(provider, Date.now() + (COOLDOWN_MS[provider] || 30_000));
}

// ── Groq Daily Token Budget ──────────────────────────────────────────
const groqDailyTokens = { used: 0, resetAt: 0 };
const GROQ_DAILY_LIMIT = 85_000;

export function getGroqDailyUsage(): number {
  const now = Date.now();
  if (now > groqDailyTokens.resetAt) {
    const tomorrow = new Date();
    tomorrow.setUTCHours(24, 0, 0, 0);
    groqDailyTokens.used = 0;
    groqDailyTokens.resetAt = tomorrow.getTime();
  }
  return groqDailyTokens.used;
}

export function addGroqTokenUsage(tokens: number) {
  getGroqDailyUsage();
  groqDailyTokens.used += tokens;
}

export function isGroqDailyBudgetExhausted(): boolean {
  return getGroqDailyUsage() >= GROQ_DAILY_LIMIT;
}

// ── Client Factory ────────────────────────────────────────────────────
const clientCache = new Map<ProviderName, OpenAI>();

export function getClientForProvider(provider: ProviderName): OpenAI | null {
  const cached = clientCache.get(provider);
  if (cached) return cached;

  const config = PROVIDERS[provider];
  const apiKey = config.getApiKey();
  if (!apiKey) return null;

  const client = new OpenAI({ baseURL: config.baseURL, apiKey });
  clientCache.set(provider, client);
  return client;
}

export function getClientForModel(modelId: string): { client: OpenAI; apiModel: string; config: ModelConfig } | null {
  const config = MODEL_MAP[modelId];
  if (!config) return null;
  const client = getClientForProvider(config.provider);
  if (!client) return null;
  return { client, apiModel: config.apiModel, config };
}
