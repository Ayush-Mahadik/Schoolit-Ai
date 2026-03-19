/**
 * SchoolIT AI — AI Provider Configuration & Client Factory
 * =====================================================
 * Manages multi-provider setup: GitHub → Groq → Gemini
 * Handles provider cooldowns, client caching, and model configuration.
 * Uses Upstash Redis for persistent cooldowns across serverless instances.
 */

import OpenAI from "openai";
import { Redis } from "@upstash/redis";

// ── Provider Types ────────────────────────────────────────────────────
export type ProviderName = "github" | "groq" | "gemini" | "sarvam";

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

// ── Upstash Redis Client (lazy init) ──────────────────────────────────
let _redis: Redis | null = null;
function getRedis(): Redis | null {
  if (_redis) return _redis;
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  _redis = new Redis({ url, token });
  return _redis;
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
  sarvam: {
    name: "sarvam",
    baseURL: "https://api.sarvam.ai/v1",
    getApiKey: () => process.env.SARVAM_API_KEY?.trim(),
  },
};

// ── Model Registry ────────────────────────────────────────────────────
export const MODEL_MAP: Record<string, ModelConfig> = {
  "gpt-5":            { provider: "github",     apiModel: "gpt-5",                      supportsTools: true,  supportsVision: true  },
  "gpt-4.1":          { provider: "github",     apiModel: "gpt-4.1",                    supportsTools: true,  supportsVision: true  },
  "gpt-4o":           { provider: "github",     apiModel: "gpt-4o",                     supportsTools: true,  supportsVision: true  },
  "gpt-oss-120b":     { provider: "github",     apiModel: "gpt-oss-120b",               supportsTools: true,  supportsVision: false },
  "llama-4-scout":    { provider: "groq",       apiModel: "meta-llama/llama-4-scout-17b-16e-instruct", supportsTools: true, supportsVision: true },
  "llama-3.3-70b":    { provider: "groq",       apiModel: "llama-3.3-70b-versatile",    supportsTools: true,  supportsVision: false },
  "qwen3-32b":        { provider: "groq",       apiModel: "qwen/qwen3-32b",             supportsTools: true,  supportsVision: false },
  "qwq-32b":          { provider: "groq",       apiModel: "qwen-qwq-32b",               supportsTools: true,  supportsVision: false },
  "llama-3.1-8b":     { provider: "groq",       apiModel: "llama-3.1-8b-instant",       supportsTools: true,  supportsVision: false },
  "gemini-2.0-flash": { provider: "gemini",     apiModel: "gemini-2.0-flash",           supportsTools: true,  supportsVision: true  },
  "sarvam-m":         { provider: "sarvam",     apiModel: "sarvam-m",                   supportsTools: false, supportsVision: false },
};

export const ALL_MODEL_IDS = [
  "gpt-5", "gpt-4o", "gpt-4.1", "gpt-oss-120b",
  "llama-4-scout", "llama-3.3-70b", "qwen3-32b", "qwq-32b", "llama-3.1-8b",
  "gemini-2.0-flash",
  "sarvam-m",
];

export const MODEL_NAMES: Record<string, string> = {
  "gpt-5": "GPT-5",
  "gpt-4.1": "GPT-4.1",
  "gpt-4o": "GPT-4o",
  "gpt-oss-120b": "GPT-OSS 120B",
  "llama-4-scout": "Llama 4 Scout",
  "llama-3.3-70b": "Llama 3.3 70B",
  "qwen3-32b": "Qwen3-32B",
  "qwq-32b": "QwQ-32B (Reasoning)",
  "llama-3.1-8b": "Llama 3.1 8B",
  "gemini-2.0-flash": "Gemini 2.0 Flash",
  "sarvam-m": "Sarvam-M (India)",
};

// Models that require max_completion_tokens instead of max_tokens
export const USES_MAX_COMPLETION_TOKENS = new Set<string>();

// Models that return reasoning_content (grok-3-mini style thinking)
export const HAS_REASONING_CONTENT = new Set<string>([]);

// Per-model completion caps
export const MODEL_COMPLETION_CAPS: Record<string, number> = {
  "gpt-5": 4096,
  "gpt-4o": 8192,
  "gpt-4.1": 8192,
  "gpt-oss-120b": 8192,
  "llama-4-scout": 8192,
  "llama-3.3-70b": 8192,
  "qwen3-32b": 8192,
  "qwq-32b": 8192,
  "llama-3.1-8b": 4096,
  "gemini-2.0-flash": 8192,
  "sarvam-m": 8192,
};

// Token limits per thinking mode
export const THINKING_MODE_TOKENS: Record<string, number> = {
  fast: 8192,
  balanced: 16384,
  deep: 16384,
};

// Thinking-mode model priority lists (updated with new models)
export const THINKING_MODE_MODEL_PRIORITY: Record<string, string[]> = {
  fast:     ["llama-4-scout", "gpt-4.1", "llama-3.3-70b", "gemini-2.0-flash", "gpt-4o", "llama-3.1-8b", "sarvam-m"],
  balanced: ["gpt-4o", "llama-4-scout", "llama-3.3-70b", "qwen3-32b", "gemini-2.0-flash", "gpt-4.1", "llama-3.1-8b", "sarvam-m"],
  deep:     ["gpt-5", "gpt-oss-120b", "qwq-32b", "qwen3-32b", "gpt-4.1", "gpt-4o", "llama-3.3-70b", "gemini-2.0-flash", "llama-3.1-8b"],
};

// Tool status labels
export const TOOL_LABELS: Record<string, string> = {
  web_search: "Searching the web",
  execute_code: "Running calculation",
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

// ── Provider-Level Rate-Limit Cooldown (Upstash Redis or fallback Map) ─
const COOLDOWN_MS: Record<ProviderName, number> = {
  github: 30_000,
  groq: 90_000,
  gemini: 30_000,
  sarvam: 30_000,
};

// Fallback in-memory map when Redis not available
const _memCooldown = new Map<ProviderName, number>();

export async function isProviderCoolingDown(provider: ProviderName): Promise<boolean> {
  const redis = getRedis();
  if (redis) {
    const key = `cooldown:${provider}`;
    const until = await redis.get<number>(key);
    if (!until) return false;
    if (Date.now() > until) { await redis.del(key); return false; }
    return true;
  }
  // Fallback to in-memory
  const until = _memCooldown.get(provider);
  if (!until) return false;
  if (Date.now() > until) { _memCooldown.delete(provider); return false; }
  return true;
}

export async function markProviderRateLimited(provider: ProviderName, retryAfterMs?: number) {
  const cooldownMs = retryAfterMs ?? COOLDOWN_MS[provider] ?? 30_000;
  const until = Date.now() + cooldownMs;
  const redis = getRedis();
  if (redis) {
    const key = `cooldown:${provider}`;
    const ttlSec = Math.ceil(cooldownMs / 1000);
    await redis.set(key, until, { ex: ttlSec });
  } else {
    _memCooldown.set(provider, until);
  }
}

// ── Groq Daily Token Budget (Upstash Redis backed) ──────────────────
const GROQ_DAILY_LIMIT = 85_000;

async function getGroqBudget(): Promise<{ used: number; resetAt: number }> {
  const redis = getRedis();
  const now = Date.now();
  const tomorrow = new Date();
  tomorrow.setUTCHours(24, 0, 0, 0);
  const defaultResetAt = tomorrow.getTime();

  if (redis) {
    const data = await redis.get<{ used: number; resetAt: number }>("groq:daily");
    if (!data || now > data.resetAt) {
      const fresh = { used: 0, resetAt: defaultResetAt };
      await redis.set("groq:daily", fresh, { ex: Math.ceil((defaultResetAt - now) / 1000) });
      return fresh;
    }
    return data;
  }
  // Fallback to module-level state (resets per instance)
  return { used: 0, resetAt: defaultResetAt };
}

export async function getGroqDailyUsage(): Promise<number> {
  const budget = await getGroqBudget();
  return budget.used;
}

export async function addGroqTokenUsage(tokens: number) {
  const redis = getRedis();
  if (redis) {
    const budget = await getGroqBudget();
    budget.used += tokens;
    const ttlSec = Math.ceil((budget.resetAt - Date.now()) / 1000);
    if (ttlSec > 0) await redis.set("groq:daily", budget, { ex: ttlSec });
  }
}

export async function isGroqDailyBudgetExhausted(): Promise<boolean> {
  const used = await getGroqDailyUsage();
  return used >= GROQ_DAILY_LIMIT;
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
