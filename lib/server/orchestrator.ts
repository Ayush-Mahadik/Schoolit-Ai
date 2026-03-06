/**
 * SchoolIT AI — Chat Orchestrator
 * ================================
 * Manages the tool-calling loop, result collection, deep-mode review,
 * and final response assembly. Extracted from route.ts.
 */

import OpenAI from "openai";
import {
  MODEL_MAP, ALL_MODEL_IDS, MODEL_NAMES, MODEL_COMPLETION_CAPS,
  THINKING_MODE_MODEL_PRIORITY, TOOL_LABELS,
  getClientForModel, isProviderCoolingDown,
} from "@/lib/server/providers";
import { executeTool } from "@/lib/server/tools";
import { callWithFallback } from "@/lib/server/fallback";

// ── Types ─────────────────────────────────────────────────────────────
export interface OrchestratorParams {
  messages: OpenAI.Chat.ChatCompletionMessageParam[];
  tools: OpenAI.Chat.ChatCompletionTool[];
  activeModelId: string;
  thinkingMode: string;
  thinkingModeMax: number;
  maxTokens: number;
  maxToolRounds: number;
  hasImageFiles: boolean;
  wantsVisual: boolean;
  message: string;         // original user message
  subject: string;
  userEmail: string;
  fileContext?: string;
  conversationId: string;
  rateRemaining: number;
  writeEvent: (type: string, payload: Record<string, unknown>) => Promise<void>;
}

export interface OrchestratorResult {
  sent: boolean;  // true once writeEvent('result', ...) has been called
}

// ── Tracking Collections ──────────────────────────────────────────────
interface Collections {
  sources: string[];
  toolCallsLog: string[];
  charts: unknown[];
  flowcharts: { mermaidCode: string; title?: string; explanation?: string }[];
  manimAnimations: { code: string; sceneName: string; explanation: string }[];
  generatedImages: { prompt: string; style: string; subject?: string; url?: string }[];
  flashcardSets: { topic: string; cards: { front: string; back: string }[] }[];
  quizSets: { topic: string; questions: { question: string; options: string[]; correct: number; explanation: string }[]; difficulty?: string }[];
  scheduleActions: unknown[];
  mockTests: unknown[];
  questionPapers: unknown[];
  searchImages: { url: string; thumbnail: string; title: string; source: string }[];
}

function newCollections(): Collections {
  return {
    sources: [], toolCallsLog: [], charts: [], flowcharts: [],
    manimAnimations: [], generatedImages: [], flashcardSets: [],
    quizSets: [], scheduleActions: [], mockTests: [], questionPapers: [],
    searchImages: [],
  };
}

// ── Build result payload (DRY) ────────────────────────────────────────
function buildPayload(c: Collections, extras: Record<string, unknown>): Record<string, unknown> {
  return {
    sources: Array.from(new Set(c.sources)),
    tool_calls: c.toolCallsLog,
    charts: c.charts,
    flowcharts: c.flowcharts,
    manim_animations: c.manimAnimations,
    generated_images: c.generatedImages,
    flashcard_sets: c.flashcardSets,
    quiz_sets: c.quizSets,
    mock_tests: c.mockTests.length > 0 ? c.mockTests : undefined,
    question_papers: c.questionPapers.length > 0 ? c.questionPapers : undefined,
    schedule_actions: c.scheduleActions,
    search_images: c.searchImages.length > 0 ? c.searchImages : undefined,
    error: null,
    ...extras,
  };
}

// ══════════════════════════════════════════════════════════════════════
//  Main Orchestration Loop
// ══════════════════════════════════════════════════════════════════════
export async function runOrchestrator(params: OrchestratorParams): Promise<OrchestratorResult> {
  const {
    messages, tools, thinkingMode, thinkingModeMax, maxTokens,
    maxToolRounds, hasImageFiles, wantsVisual, message,
    subject, userEmail, fileContext, conversationId,
    rateRemaining, writeEvent,
  } = params;

  let activeModelId = params.activeModelId;
  const c = newCollections();
  const wallClockStart = Date.now();
  const priorityList = THINKING_MODE_MODEL_PRIORITY[thinkingMode] || THINKING_MODE_MODEL_PRIORITY.balanced;

  // ── Main tool loop ──────────────────────────────────────────────────
  for (let round = 0; round < maxToolRounds; round++) {
    // Time-limit check
    if (Date.now() - wallClockStart > 52_000) {
      let partial = "I found some information but ran out of time:\n\n";
      if (c.flashcardSets.length > 0) partial = "";
      for (const ch of c.charts) partial += `\n\n\`\`\`chart\n${JSON.stringify(ch)}\n\`\`\``;
      for (const f of c.flowcharts) partial += `\n\n\`\`\`mermaid\n${f.mermaidCode}\n\`\`\``;
      await writeEvent('status', { message: 'Time limit reached...' });
      await writeEvent('result', { data: buildPayload(c, {
        response: partial || "Request took too long. Try a simpler query.",
        conversation_id: conversationId, thinking: null, animation_url: null,
        model: activeModelId,
      })});
      return { sent: true };
    }

    // Call AI with fallback
    const fallbackResult = await callWithFallback({
      messages, activeModelId, thinkingMode, thinkingModeMax,
      tools, hasImageFiles, wallClockStart, loopRound: round, writeEvent,
    });
    const response = fallbackResult.response;
    activeModelId = fallbackResult.activeModelId;
    const assistantMsg = response.choices[0].message;

    // ── Tool calls ────────────────────────────────────────────────────
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
          c.toolCallsLog.push(name);

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

        if (toolResult.sources) c.sources.push(...toolResult.sources);
        if (toolResult.chartData) c.charts.push(toolResult.chartData);
        if (toolResult.flowchartData) c.flowcharts.push(toolResult.flowchartData as typeof c.flowcharts[0]);
        if (toolResult.manimData) c.manimAnimations.push(toolResult.manimData as typeof c.manimAnimations[0]);
        if (toolResult.imageData) c.generatedImages.push(toolResult.imageData as typeof c.generatedImages[0]);
        if (toolResult.flashcardData) c.flashcardSets.push(toolResult.flashcardData as typeof c.flashcardSets[0]);
        if (toolResult.quizData) c.quizSets.push(toolResult.quizData as typeof c.quizSets[0]);
        if (toolResult.mockTestData) c.mockTests.push(toolResult.mockTestData);
        if (toolResult.questionPaperData) c.questionPapers.push(toolResult.questionPaperData);
        if (toolResult.scheduleData) c.scheduleActions.push(toolResult.scheduleData);

        const rObj = toolResult.result as Record<string, unknown>;
        if (rObj?.images && Array.isArray(rObj.images)) c.searchImages.push(...(rObj.images as typeof c.searchImages));

        const str = JSON.stringify(toolResult.result);
        messages.push({ role: "tool", tool_call_id: tc.id, content: str.length > 25000 ? str.slice(0, 25000) : str });
      }
      continue;
    }

    // ── Final response ────────────────────────────────────────────────
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
    for (const ch of c.charts) finalText += `\n\n\`\`\`chart\n${JSON.stringify(ch)}\n\`\`\``;
    for (const f of c.flowcharts) finalText += `\n\n\`\`\`mermaid\n${f.mermaidCode}\n\`\`\``;
    for (const a of c.manimAnimations) finalText += `\n\n\`\`\`manim\n${a.code}\n\`\`\``;

    // Auto-generate visual
    if (wantsVisual && c.generatedImages.length === 0) {
      try {
        const v = await executeTool("generate_image", { prompt: message.slice(0, 300), style: "diagram", subject });
        if (v.imageData) { c.generatedImages.push(v.imageData as typeof c.generatedImages[0]); c.toolCallsLog.push("generate_image(auto)"); }
      } catch { /* best-effort */ }
    }
    for (const img of c.generatedImages) finalText += `\n\n\`\`\`image\n${JSON.stringify(img)}\n\`\`\``;

    await writeEvent('status', { message: 'Composing final answer...' });

    // ── Deep Mode: Multi-Model Review ─────────────────────────────────
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

    await writeEvent('result', { data: buildPayload(c, {
      response: finalText,
      conversation_id: conversationId,
      thinking: thinkingContent, animation_url: null,
      model: modelsUsed,
      rate_limit_remaining: rateRemaining,
    })});
    return { sent: true };
  }

  // Max rounds exceeded
  await writeEvent('result', { data: buildPayload(c, {
    response: "Multiple research steps completed but couldn't fully resolve. Please rephrase.",
    conversation_id: conversationId,
    model: activeModelId,
  })});
  return { sent: true };
}
