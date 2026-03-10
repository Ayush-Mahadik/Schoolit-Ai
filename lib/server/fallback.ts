/**
 * SchoolIT AI — Multi-Provider Fallback Engine
 * =============================================
 * Handles model fallback, provider sorting, rate-limit dodge,
 * Groq truncation, vision stripping, and dynamic timeouts.
 *
 * Extracted from route.ts for maintainability.
 */

import OpenAI from "openai";
import {
  MODEL_MAP, ALL_MODEL_IDS,
  MODEL_COMPLETION_CAPS, THINKING_MODE_MODEL_PRIORITY,
  USES_MAX_COMPLETION_TOKENS,
  getClientForModel, isProviderCoolingDown, markProviderRateLimited,
  isGroqDailyBudgetExhausted, addGroqTokenUsage,
} from "@/lib/server/providers";

export interface SarvamSafetyFlags {
  wantsQuiz: boolean;
  wantsFlashcards: boolean;
  wantsMockTest: boolean;
  wantsQuestionPaper: boolean;
  wantsFlowchart: boolean;
  wantsChart: boolean;
  hasFilesAttached: boolean;
  hasYouTubeUrl: boolean;
  wantsCode: boolean;
}

export function isSarvamSafe(flags: SarvamSafetyFlags): boolean {
  return !Object.values(flags).some(Boolean);
}

// ── Types ─────────────────────────────────────────────────────────────
export interface FallbackParams {
  messages: OpenAI.Chat.ChatCompletionMessageParam[];
  activeModelId: string;
  thinkingMode: "fast" | "balanced" | "deep";
  thinkingModeMax: number;
  tools: OpenAI.Chat.ChatCompletionTool[];
  sarvamFlags: SarvamSafetyFlags;
  allowSarvamFallback: boolean;
  hasImageFiles: boolean;
  wallClockStart: number;
  loopRound: number;
  writeEvent: (type: string, payload: Record<string, unknown>) => Promise<void>;
}

export interface FallbackResult {
  response: OpenAI.Chat.ChatCompletion;
  activeModelId: string;
}

// ── Strip tool messages helper ────────────────────────────────────────
function stripToolMsgs(input: OpenAI.Chat.ChatCompletionMessageParam[]) {
  return input.filter(m => m.role !== "tool").map(m => {
    if (m.role === "assistant" && "tool_calls" in m) {
      const { tool_calls: _tc, ...rest } = m as unknown as Record<string, unknown>;
      return rest as unknown as OpenAI.Chat.ChatCompletionMessageParam;
    }
    return m;
  });
}

// ── Main Fallback Function ────────────────────────────────────────────
export async function callWithFallback(params: FallbackParams): Promise<FallbackResult> {
  const {
    messages: msgs, activeModelId, thinkingMode, thinkingModeMax,
    tools, sarvamFlags, allowSarvamFallback,
    hasImageFiles, wallClockStart, loopRound, writeEvent,
  } = params;
  const canUseSarvam = allowSarvamFallback && isSarvamSafe(sarvamFlags);

  const priorityModels = (THINKING_MODE_MODEL_PRIORITY[thinkingMode] || THINKING_MODE_MODEL_PRIORITY.balanced)
    .filter(m => (m !== "sarvam-m" || canUseSarvam) && getClientForModel(m) !== null);
  const modelsFromPriority = activeModelId !== priorityModels[0]
    ? [activeModelId, ...priorityModels.filter(m => m !== activeModelId)]
    : priorityModels;
  const otherModels = ALL_MODEL_IDS.filter(m => !modelsFromPriority.includes(m) && (m !== "sarvam-m" || canUseSarvam) && getClientForModel(m) !== null);
  let modelsToTry = [...modelsFromPriority, ...otherModels];

  // Sort: penalize rate-limited and budget-exhausted providers
  modelsToTry.sort((a, b) => {
    const aCost = (isProviderCoolingDown(MODEL_MAP[a]?.provider) ? 1 : 0) + (MODEL_MAP[a]?.provider === "groq" && isGroqDailyBudgetExhausted() ? 2 : 0);
    const bCost = (isProviderCoolingDown(MODEL_MAP[b]?.provider) ? 1 : 0) + (MODEL_MAP[b]?.provider === "groq" && isGroqDailyBudgetExhausted() ? 2 : 0);
    return aCost - bCost;
  });

  // Prioritize vision models when images attached
  if (hasImageFiles) {
    modelsToTry.sort((a, b) => (MODEL_MAP[b]?.supportsVision ? 1 : 0) - (MODEL_MAP[a]?.supportsVision ? 1 : 0));
  }

  if (modelsToTry.length === 0) throw new Error("No AI providers configured.");

  let lastError: unknown = null;
  let modelsAttempted = 0;
  let resolvedModelId = activeModelId;

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

      // Groq truncation (except Qwen3/QwQ with 128K context)
      const needsGroqTruncation = 
        modelConfig.provider === "groq" && 
        !["qwen3-32b", "qwq-32b"].includes(tryModelId);
      
      if (needsGroqTruncation) {
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
        filteredMsgs = stripToolMsgs(msgs);
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
      await writeEvent('status', { message: i === 0 ? "SchoolIT AI is thinking..." : "Trying another approach..." });

      const modelMaxTokens = Math.min(thinkingModeMax, MODEL_COMPLETION_CAPS[tryModelId] || thinkingModeMax);
      const tokenParam = USES_MAX_COMPLETION_TOKENS.has(tryModelId)
        ? { max_completion_tokens: modelMaxTokens }
        : { max_tokens: modelMaxTokens };

      // Reasoning effort for Qwen models
      const isQwen = ["qwen3-32b", "qwq-32b"].includes(tryModelId);
      const reasoningEffortParam = isQwen && thinkingMode !== "deep" ? (
        thinkingMode === "fast" ? { reasoning_effort: "low" as const } :
        { reasoning_effort: "medium" as const }
      ) : {};

      const invoke = async (input: OpenAI.Chat.ChatCompletionMessageParam[], allowTools: boolean) =>
        Promise.race([
          modelClient.chat.completions.create({
            model: apiModel, ...tokenParam, messages: input,
            tools: allowTools ? tools : undefined,
            tool_choice: allowTools ? "auto" : undefined,
            ...reasoningEffortParam,
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
        resolvedModelId = tryModelId;
      }
      if (modelConfig.provider === "groq" && response.usage)
        addGroqTokenUsage((response.usage.prompt_tokens || 0) + (response.usage.completion_tokens || 0));

      return { response, activeModelId: resolvedModelId };
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
}
