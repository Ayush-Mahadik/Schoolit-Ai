"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { ChartRenderer } from "@/components/ChartRenderer";
import { MermaidRenderer } from "@/components/MermaidRenderer";
import { ManimRenderer } from "@/components/ManimRenderer";
import { ImageRenderer } from "@/components/ImageRenderer";
import { FlashcardRenderer } from "@/components/FlashcardRenderer";
import { QuizRenderer } from "@/components/QuizRenderer";
import { MockTestRenderer } from "@/components/MockTestRenderer";
import { QuestionPaperRenderer } from "@/components/QuestionPaperRenderer";
import { CodeBlock } from "@/components/CodeBlock";
import { FileUploadButton, FileChips, type FileAttachment } from "@/components/FileUploadButton";
import { VoiceInputButton } from "@/components/VoiceInputButton";
import { VideoPlayer } from "@/components/VideoPlayer";
import { Icon, Send, Upload, Bot, Wrench, ExternalLink, Brain, Paperclip, Search, BarChart3, PenLine, Loader, Clock, Check, Sparkles } from "@/components/Icons";
import type { Message, CodeExecutionData } from "@/lib/types";
import { SITE_NAME } from "@/lib/config";

interface ChatInterfaceProps {
  messages: Message[];
  isLoading: boolean;
  onSend: (text: string, files?: FileAttachment[]) => void;
  onEditMessage?: (messageId: string, newContent: string) => void;
  onRegenerate?: (messageId: string) => void;
  subject: string;
  thinkingStatus?: string[];
}

function preprocessLatex(text: string): string {
  // Protect code blocks first
  const blocks: string[] = [];
  text = text.replace(/```[\s\S]*?```/g, m => { blocks.push(m); return `__B${blocks.length-1}__`; });
  const inlineCode: string[] = [];
  text = text.replace(/`[^`]+`/g, m => { inlineCode.push(m); return `__I${inlineCode.length-1}__`; });

  // Strip leaked tool syntax
  text = text.replace(/\[ToolHint:[^\]]*\]/g, "")
             .replace(/<tool_call>[\s\S]*?<\/tool_call>/g, "")
             .replace(/\\text\{[^}]*\([^)]*\)[^}]*\}/g, "");

  // Normalize delimiters
  text = text.replace(/\\\(([^]*?)\\\)/g, (_, c) => `$${c.trim()}$`);
  text = text.replace(/\\\[([^]*?)\\\]/g, (_, c) => `\n$$\n${c.trim()}\n$$\n`);

  // Fix double-escaped backslashes (all common commands)
  text = text.replace(/\\\\(frac|sqrt|sum|int|lim|infty|alpha|beta|gamma|delta|theta|pi|sigma|omega|text|mathrm|mathbf|begin|end|left|right|cdot|times|div|pm|leq|geq|neq|approx|equiv|vec|hat|bar|binom|pmatrix|bmatrix|cases|aligned|sin|cos|tan|log|ln|to|rightarrow|Rightarrow|forall|exists|partial|nabla|mathbb|mathcal)/g, '\\$1');

  // Fix display math spacing
  text = text.replace(/([^\n])\$\$/g, '$1\n$$');
  text = text.replace(/\$\$([^\n])/g, '$$\n$1');
  text = text.replace(/\\frac\s+\{/g, '\\frac{');

  // Restore blocks
  blocks.forEach((b, i) => { text = text.replace(`__B${i}__`, b); });
  inlineCode.forEach((c, i) => { text = text.replace(`__I${i}__`, c); });
  return text;
}

function isMermaidLike(code: string): boolean {
  const normalized = code.trim();
  return /^(graph\s+(TD|LR|RL|BT)|flowchart\s+(TD|LR|RL|BT)|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|mindmap|gantt|journey|pie\s+title|timeline)\b/i.test(normalized);
}

function parseMarkdownTable(code: string): { headers: string[]; rows: string[][] } | null {
  const lines = code
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) return null;
  if (!lines[0].includes("|") || !lines[1].includes("|")) return null;

  const splitRow = (line: string) =>
    line
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((c) => c.trim());

  const headers = splitRow(lines[0]);
  const separator = splitRow(lines[1]);

  const isSeparator = separator.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s/g, "")));
  if (!isSeparator || headers.length === 0) return null;

  const rows = lines.slice(2).map(splitRow).filter((r) => r.length > 0);
  return { headers, rows };
}

function isTextLikeAttachment(file: File): boolean {
  const lower = file.name.toLowerCase();
  const dot = lower.lastIndexOf(".");
  const ext = dot >= 0 ? lower.slice(dot) : "";
  const textExt = new Set([
    ".txt", ".md", ".csv", ".json", ".xml", ".yaml", ".yml", ".toml", ".ini", ".cfg", ".conf",
    ".py", ".js", ".ts", ".jsx", ".tsx", ".html", ".css", ".scss", ".less",
    ".java", ".c", ".cpp", ".h", ".hpp", ".cs", ".go", ".rs", ".rb", ".php", ".swift", ".kt", ".scala", ".r", ".m", ".lua", ".sh", ".bash", ".ps1", ".bat", ".cmd", ".sql", ".graphql", ".proto",
    ".env", ".log", ".jsonl", ".ndjson",
  ]);
  if (file.type.startsWith("text/")) return true;
  if (["application/json", "application/xml", "application/javascript", "application/typescript"].includes(file.type)) return true;
  return textExt.has(ext);
}

function RenderedTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto my-3 rounded-lg border border-surface-3/60">
      <table className="w-full border-collapse">
        <thead className="bg-surface-2">
          <tr>
            {headers.map((h, i) => (
              <th key={i} className="border border-surface-3/60 px-3 py-2 text-xs font-semibold text-slate-200 text-left">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="odd:bg-surface-1/40">
              {headers.map((_, ci) => (
                <td key={ci} className="border border-surface-3/60 px-3 py-2 text-sm text-slate-300 align-top">
                  {row[ci] || ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Code Execution Result component ────────────────────────────────────
function CodeExecutionResult({ execution }: { execution: CodeExecutionData }) {
  const [showCode, setShowCode] = useState(false);

  return (
    <div className={`code-execution-result ${execution.error ? 'error' : ''}`}>
      <div className="exec-header">
        <span className="flex items-center gap-2">
          <svg className="w-4 h-4 text-yellow-500" viewBox="0 0 24 24" fill="currentColor">
            <path d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          {execution.description}
        </span>
        <span className={`exec-status ${execution.success ? 'success' : 'error'}`}>
          {execution.success ? '✓ Ran successfully' : '✗ Error'}
        </span>
      </div>
      {execution.output && (
        <pre className="exec-output">{execution.output}</pre>
      )}
      {execution.error && (
        <pre className="exec-error">{execution.error}</pre>
      )}
      {execution.code && (
        <>
          <div
            className="exec-code-toggle"
            onClick={() => setShowCode(!showCode)}
          >
            {showCode ? '▼ Hide code' : '▶ Show code'}
          </div>
          {showCode && (
            <pre className="exec-code-block">{execution.code}</pre>
          )}
        </>
      )}
    </div>
  );
}

export function ChatInterface({ messages, isLoading, onSend, onEditMessage, onRegenerate, subject, thinkingStatus }: ChatInterfaceProps) {
  const [input, setInput] = useState("");
  const [attachedFiles, setAttachedFiles] = useState<FileAttachment[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [activeAssistantId, setActiveAssistantId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dragCounter = useRef(0);

  const assistantMessages = messages.filter((m) => m.role === "assistant");

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  useEffect(() => {
    const container = messagesScrollRef.current;
    if (!container) return;

    const updateActive = () => {
      const anchors = Array.from(container.querySelectorAll<HTMLElement>("[data-assistant-anchor='true']"));
      if (anchors.length === 0) {
        setActiveAssistantId(null);
        return;
      }

      const containerTop = container.getBoundingClientRect().top;
      let bestId: string | null = null;
      let minDist = Number.POSITIVE_INFINITY;

      for (const el of anchors) {
        const top = el.getBoundingClientRect().top;
        const dist = Math.abs(top - (containerTop + 120));
        if (dist < minDist) {
          minDist = dist;
          bestId = el.getAttribute("data-message-id");
        }
      }

      setActiveAssistantId(bestId);
    };

    updateActive();
    container.addEventListener("scroll", updateActive, { passive: true });
    window.addEventListener("resize", updateActive);
    return () => {
      container.removeEventListener("scroll", updateActive);
      window.removeEventListener("resize", updateActive);
    };
  }, [messages]);

  const handleFilesSelected = useCallback((files: FileAttachment[]) => {
    setAttachedFiles((prev) => [...prev, ...files].slice(0, 10));
  }, []);

  const handleRemoveFile = useCallback((index: number) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const processDroppedFiles = useCallback(
    async (fileList: FileList) => {
      const MAX_SIZE = 10 * 1024 * 1024;
      const results: FileAttachment[] = [];
      for (const file of Array.from(fileList).slice(0, 10)) {
        if (file.size > MAX_SIZE) continue;
        const att = await new Promise<FileAttachment | null>((resolve) => {
          const reader = new FileReader();
          if (file.type.startsWith("image/")) {
            reader.onload = () =>
              resolve({ name: file.name, content: reader.result as string, type: file.type, size: file.size });
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(file);
          } else if (isTextLikeAttachment(file)) {
            reader.onload = () =>
              resolve({ name: file.name, content: reader.result as string, type: file.type || "text/plain", size: file.size });
            reader.onerror = () => resolve(null);
            reader.readAsText(file);
          } else {
            resolve({
              name: file.name,
              content: `[BINARY_FILE]\nname=${file.name}\ntype=${file.type || "application/octet-stream"}\nsize=${file.size}\nThis file is binary. Use analyze_document for metadata-level reasoning.`,
              type: file.type || "application/octet-stream",
              size: file.size,
            });
          }
        });
        if (att) results.push(att);
      }
      if (results.length > 0) handleFilesSelected(results);
    },
    [handleFilesSelected]
  );

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current += 1;
    if (e.dataTransfer.types.includes("Files")) setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current === 0) setIsDragOver(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current = 0;
      setIsDragOver(false);
      if (e.dataTransfer.files?.length) {
        processDroppedFiles(e.dataTransfer.files);
      }
    },
    [processDroppedFiles]
  );

  const handleSubmit = () => {
    if (!input.trim() || isLoading) return;
    onSend(input.trim(), attachedFiles.length > 0 ? attachedFiles : undefined);
    setInput("");
    setAttachedFiles([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const modelInfo = { name: SITE_NAME, icon: "brain" };

  return (
    <div
      className="flex-1 flex flex-col min-h-0 relative overflow-x-hidden"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* ── Drag Overlay ───────────────────────────────────────────── */}
      <AnimatePresence>
        {isDragOver && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 bg-brand-600/5 border-2 border-dashed border-brand-500/30 rounded-xl flex items-center justify-center backdrop-blur-sm"
          >
            <div className="text-center">
              <Upload className="w-10 h-10 text-brand-400 mx-auto" />
              <p className="text-brand-400 font-medium mt-3 text-sm">Drop files here</p>
              <p className="text-slate-500 text-xs mt-1">Images, documents, code</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Messages Area ──────────────────────────────────────────── */}
      <div ref={messagesScrollRef} className="flex-1 overflow-y-auto overflow-x-hidden px-3 sm:px-4 py-6 relative bg-mesh-gradient">
        {messages.length === 0 ? (
          <EmptyState subject={subject} onSuggestion={(text) => onSend(text)} />
        ) : (
          <div className="max-w-3xl mx-auto space-y-5">
            <AnimatePresence initial={false}>
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25 }}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  id={msg.role === "assistant" ? `assistant-${msg.id}` : undefined}
                  data-assistant-anchor={msg.role === "assistant" ? "true" : undefined}
                  data-message-id={msg.role === "assistant" ? msg.id : undefined}
                >
                  {msg.role === "user" ? (
                    <UserBubble message={msg} onEdit={onEditMessage} />
                  ) : (
                    <AssistantBubble message={msg} onRegenerate={onRegenerate} />
                  )}
                </motion.div>
              ))}
            </AnimatePresence>

            {isLoading && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex justify-start"
              >
                <ThinkingIndicator modelInfo={modelInfo} statusMessages={thinkingStatus} />
              </motion.div>
            )}

            {/* Smart follow-up suggestions after last assistant message */}
            {!isLoading && messages.length > 0 && messages[messages.length - 1]?.role === "assistant" && (
              <SmartSuggestions lastMessage={messages[messages.length - 1]} onSend={onSend} subject={subject} />
            )}

            <div ref={messagesEndRef} />
          </div>
        )}

      </div>

      {/* Grok-style right side marker panel (outside scroll area so it stays visible) */}
      {assistantMessages.length >= 1 && (
        <div className="hidden md:flex absolute right-2 top-16 bottom-24 z-20 items-center pointer-events-none">
          <div className="pointer-events-auto flex flex-col gap-2 p-1.5 rounded-xl glass-subtle shadow-lg">
            {assistantMessages.map((m, i) => {
              const isActive = activeAssistantId === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  aria-label={`Jump to response ${i + 1}`}
                  onClick={() => {
                    const el = document.getElementById(`assistant-${m.id}`);
                    el?.scrollIntoView({ behavior: "smooth", block: "center" });
                  }}
                  className={`h-1.5 rounded-full transition-all ${isActive ? "w-8 bg-blue-400" : "w-6 bg-slate-600 hover:bg-slate-400"}`}
                  title={`Response ${i + 1}`}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* ── Input Area ─────────────────────────────────────────────── */}
      <div className="border-t border-glass-border glass-panel px-3 sm:px-4 py-3">
        <div className="max-w-3xl mx-auto">
          <FileChips files={attachedFiles} onRemove={handleRemoveFile} />

          <div className="flex items-end gap-2 glass-input rounded-2xl focus-within:border-blue-500/30 focus-within:shadow-[0_0_20px_rgba(45,122,255,0.1)] transition-all duration-300 px-3 py-2">
            <FileUploadButton
              onFilesSelected={handleFilesSelected}
              disabled={isLoading}
            />
            <VoiceInputButton
              onTranscript={(text) => setInput((prev) => prev + (prev ? " " : "") + text)}
              disabled={isLoading}
            />

            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything..."
              rows={1}
              className="flex-1 bg-transparent resize-none text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none min-h-[24px] max-h-[200px] py-1"
            />
            <button
              onClick={handleSubmit}
              disabled={!input.trim() || isLoading}
              className="p-2 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-400 hover:to-indigo-400 disabled:opacity-20 disabled:from-slate-600 disabled:to-slate-600 text-white transition-all duration-200 shrink-0 font-bold shadow-lg shadow-blue-500/20 hover:shadow-blue-500/30 disabled:shadow-none"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
          <p className="text-[10px] text-slate-600 mt-1.5 text-center font-medium tracking-wide">
            {SITE_NAME} <span className="text-blue-500/60">•</span> Multi-Model Intelligence <span className="text-blue-500/60">•</span> <span className="text-slate-700">Responses may be inaccurate</span>
          </p>
        </div>
      </div>
    </div>
  );
}

// ── User message bubble ──────────────────────────────────────────────
function UserBubble({ message, onEdit }: { message: Message; onEdit?: (id: string, content: string) => void }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(message.content);

  const handleSaveEdit = () => {
    if (editText.trim() && onEdit) {
      onEdit(message.id, editText.trim());
    }
    setIsEditing(false);
  };

  return (
    <div className="max-w-[80%] sm:max-w-[70%] group">
      <div className="glass text-slate-200 rounded-2xl rounded-br-sm px-4 py-2.5">
        {isEditing ? (
          <div className="space-y-2">
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              className="w-full bg-surface-4 rounded-lg px-3 py-2 text-sm text-white resize-none focus:outline-none focus:ring-1 focus:ring-brand-500 min-h-[60px]"
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setIsEditing(false); setEditText(message.content); }}
                className="px-3 py-1 text-xs text-slate-400 hover:text-white rounded-lg hover:bg-surface-4 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                className="px-3 py-1 text-xs text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-colors"
              >
                Save & Resend
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm whitespace-pre-wrap leading-relaxed">{message.content}</p>
        )}
        {message.attachments && message.attachments.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {message.attachments.map((f, i) => (
              <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-surface-4 text-slate-400 flex items-center gap-1">
                <Paperclip className="w-2.5 h-2.5" />
                {f.name}
              </span>
            ))}
          </div>
        )}
      </div>
      {/* Edit button */}
      {!isEditing && onEdit && (
        <div className="flex justify-end mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => setIsEditing(true)}
            className="p-1 text-slate-600 hover:text-slate-300 transition-colors"
            title="Edit message"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

// ── Assistant message bubble ─────────────────────────────────────────
function AssistantBubble({ message, onRegenerate }: { message: Message; onRegenerate?: (id: string) => void }) {
  const [copied, setCopied] = useState(false);
  const [reaction, setReaction] = useState<'up' | 'down' | null>(null);
  const contentHasImageBlocks = /```image\n[\s\S]*?```/i.test(message.content);

  // Feed content directly to ReactMarkdown — it handles all code blocks (mermaid, manim, chart, image)
  // via the code() component override. No pre-parsing needed.
  const latexFixed = preprocessLatex(message.content.replace(/\n{3,}/g, "\n\n").trim());

  const handleCopy = () => {
    // Copy plain text version (strip markdown/html)
    const plainText = message.content
      .replace(/```[\s\S]*?```/g, "")
      .replace(/[#*_~`]/g, "")
      .trim();
    navigator.clipboard.writeText(plainText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="flex items-start gap-2.5 max-w-[90%] sm:max-w-[85%] group">
      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500/20 to-indigo-500/20 border border-blue-500/15 flex items-center justify-center shrink-0 mt-0.5 shadow-[0_0_12px_rgba(45,122,255,0.15)]">
        <Bot className="w-3.5 h-3.5 text-blue-400" />
      </div>
      <div className="space-y-2 min-w-0 flex-1">
        {/* Tool call badges */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {message.toolCalls.map((tool, i) => (
              <span
                key={i}
                className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 flex items-center gap-1 border border-blue-500/20 font-medium"
              >
                <Wrench className="w-2.5 h-2.5" />
                {tool.replace(/_/g, " ")}
              </span>
            ))}
          </div>
        )}

        {/* AI Thinking / Reasoning — Grok-style */}
        {message.thinking && (
          <details className="thinking-block" open={message.thinking.length < 500}>
            <summary className="flex items-center gap-1.5 relative">
              <Brain className="w-3.5 h-3.5" />
              <span>AI Thinking</span>
              {message.thinking.length > 200 && (
                <span className="absolute right-0 text-[10px] text-[#3a3a3a] font-mono mt-1">
                  {Math.ceil(message.thinking.length / 4)} tokens
                </span>
              )}
            </summary>
            <div className="mt-2 prose-chat text-xs leading-relaxed text-slate-400">
              <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[[rehypeKatex, { strict: false, throwOnError: false, macros: { "\\R": "\\mathbb{R}", "\\N": "\\mathbb{N}", "\\Z": "\\mathbb{Z}" } }]]}>  
                {preprocessLatex(message.thinking)}
              </ReactMarkdown>
            </div>
          </details>
        )}

        {/* Main content */}
        <div className="rounded-2xl rounded-tl-sm px-4 py-3">
          <div className="prose-chat text-sm">
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkMath]}
              rehypePlugins={[[rehypeKatex, { strict: false, throwOnError: false, macros: { "\\R": "\\mathbb{R}", "\\N": "\\mathbb{N}", "\\Z": "\\mathbb{Z}" } }]]}  
              components={{
                code({ className, children, ...props }) {
                  const codeStr = String(children).trim();
                  const isInline = !String(children).includes("\n") && !(className || "").startsWith("language-");
                  // Mermaid diagrams — rendered inline where the code block appears
                  if (/language-mermaid/i.test(className || "")) {
                    return <MermaidRenderer code={codeStr} />;
                  }
                  // Mermaid-like code blocks without explicit language tag
                  if (!isInline && isMermaidLike(codeStr)) {
                    return <MermaidRenderer code={codeStr} />;
                  }
                  // Manim animations
                  if (/language-manim/i.test(className || "")) {
                    const classMatch = codeStr.match(/class\s+(\w+)\s*\(/);
                    const sceneName = classMatch ? classMatch[1] : "ManimScene";
                    return <ManimRenderer code={codeStr} sceneName={sceneName} explanation="" />;
                  }
                  // Chart blocks
                  if (/language-chart/i.test(className || "")) {
                    try {
                      const chartData = JSON.parse(codeStr);
                      if (chartData.type && chartData.datasets) {
                        return <ChartRenderer data={chartData} />;
                      }
                    } catch { /* fall through to code block */ }
                  }
                  // Image blocks
                  if (/language-image/i.test(className || "")) {
                    try {
                      const imgData = JSON.parse(codeStr);
                      if (imgData.prompt) {
                        return <ImageRenderer prompt={imgData.prompt} style={imgData.style || "diagram"} subject={imgData.subject} url={imgData.url} />;
                      }
                    } catch { /* fall through to code block */ }
                  }
                  // Render markdown-table-looking code blocks as actual tables
                  if (!isInline) {
                    const parsedTable = parseMarkdownTable(codeStr);
                    if (parsedTable) {
                      return <RenderedTable headers={parsedTable.headers} rows={parsedTable.rows} />;
                    }
                  }
                  // Multi-line code blocks → syntax-highlighted CodeBlock
                  if (!isInline) {
                    return <CodeBlock code={codeStr} language={className} />;
                  }
                  return <code className={className} {...props}>{children}</code>;
                },
                pre({ children, ...props }) {
                  // When code() returns a custom renderer (MermaidRenderer etc.), skip the <pre> wrapper
                  // so the component renders with its own styling instead of monospace pre-formatted text
                  if (React.isValidElement(children) && typeof (children as React.ReactElement).type !== 'string') {
                    return <>{children}</>;
                  }
                  return <pre {...props}>{children}</pre>;
                },
                table({ children }) {
                  return (
                    <div className="overflow-x-auto my-3">
                      <table className="w-full border-collapse">{children}</table>
                    </div>
                  );
                },
              }}
            >
              {latexFixed}
            </ReactMarkdown>

            {/* Flashcard sets from tool calls */}
            {message.flashcardSets?.map((fc, i) => (
              <FlashcardRenderer key={`fc-set-${i}`} topic={fc.topic} cards={fc.cards} />
            ))}

            {/* Quiz sets from tool calls */}
            {message.quizSets?.map((quiz, i) => (
              <QuizRenderer key={`quiz-${i}`} topic={quiz.topic} questions={quiz.questions} difficulty={quiz.difficulty} />
            ))}

            {/* Mock tests from tool calls */}
            {message.mockTests?.map((mt, i) => (
              <MockTestRenderer key={`mock-${i}`} subject={mt.subject} topic={mt.topic} durationMinutes={mt.durationMinutes} totalMarks={mt.totalMarks} difficulty={mt.difficulty} questions={mt.questions} />
            ))}

            {/* Question papers from tool calls */}
            {message.questionPapers?.map((qp, i) => (
              <QuestionPaperRenderer key={`paper-${i}`} subject={qp.subject} subjectLabel={qp.subjectLabel} paperTypeLabel={qp.paperTypeLabel} chapters={qp.chapters} totalMarks={qp.totalMarks} includeAnswers={qp.includeAnswers} sections={qp.sections} />
            ))}

            {/* Code execution results from tool calls */}
            {message.codeExecutions?.map((exec, i) => (
              <CodeExecutionResult key={`exec-${i}`} execution={exec} />
            ))}

            {/* Fallback image renderer when backend returns generated_images without markdown block */}
            {!contentHasImageBlocks && message.generatedImages?.map((img, i) => (
              <ImageRenderer
                key={`generated-img-${i}`}
                prompt={img.prompt}
                style={img.style || "diagram"}
                subject={img.subject}
                url={img.url}
              />
            ))}
          </div>
        </div>

        {/* Video player */}
        {message.animationUrl && <VideoPlayer url={message.animationUrl} />}

        {/* Search images — Grok-style image grid */}
        {message.searchImages && message.searchImages.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
              Images
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
              {message.searchImages.slice(0, 6).map((img, i) => (
                <a
                  key={i}
                  href={img.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group/img relative aspect-square rounded-xl overflow-hidden bg-surface-2 border border-surface-4 hover:border-blue-500/40 transition-all hover:scale-[1.03]"
                >
                  <img
                    src={img.thumbnail}
                    alt={img.title || "Search result"}
                    className="w-full h-full object-cover"
                    loading="lazy"
                    onError={(e) => { (e.target as HTMLImageElement).parentElement!.style.display = "none"; }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover/img:opacity-100 transition-opacity" />
                  <div className="absolute bottom-0 left-0 right-0 p-1.5 opacity-0 group-hover/img:opacity-100 transition-opacity">
                    <p className="text-[9px] text-white/90 line-clamp-2 leading-tight">{img.title}</p>
                    <p className="text-[8px] text-white/50 mt-0.5">{img.source}</p>
                  </div>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Source links — Grok-style source cards */}
        {message.sources && message.sources.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
              <ExternalLink className="w-3 h-3" />
              Sources ({message.sources.length})
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {message.sources.map((src, i) => {
                let hostname = src;
                let displayName = src;
                let snapshotUrl = "";
                try {
                  const u = new URL(src);
                  hostname = u.hostname.replace("www.", "");
                  displayName = hostname;
                  snapshotUrl = `https://image.thum.io/get/width/480/noanimate/${encodeURIComponent(src)}`;
                } catch { /* ignore */ }
                return (
                  <a
                    key={i}
                    href={src}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="overflow-hidden rounded-xl glass-subtle hover:bg-glass-medium hover:border-blue-500/30 transition-all group/src min-w-0 hover-glow"
                  >
                    {snapshotUrl && (
                      <img
                        src={snapshotUrl}
                        alt={displayName}
                        className="w-full h-16 object-cover border-b border-surface-4"
                        loading="lazy"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                    )}
                    <div className="flex items-center gap-2 px-3 py-2">
                      <img
                        src={`https://www.google.com/s2/favicons?domain=${hostname}&sz=32`}
                        alt=""
                        className="w-4 h-4 rounded-sm shrink-0"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium text-slate-300 group-hover/src:text-blue-400 truncate transition-colors">
                          {displayName}
                        </div>
                      </div>
                      <span className="text-[10px] text-slate-600 bg-surface-3 px-1.5 py-0.5 rounded font-mono shrink-0">
                        {i + 1}
                      </span>
                    </div>
                  </a>
                );
              })}
            </div>
          </div>
        )}

        {/* Model badge — shows which AI model(s) generated this response */}
        {message.model && (
          <div className="flex items-center gap-1.5 mt-1">
            <span className="text-[9px] px-2 py-0.5 rounded-full bg-surface-3/60 text-slate-500 font-medium tracking-wide border border-surface-4/40">
              ⚡ {message.model}
            </span>
          </div>
        )}

        {/* Action buttons — Copy / Like / Dislike / Regenerate */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={handleCopy}
            className="p-1.5 text-slate-600 hover:text-slate-300 hover:bg-surface-3 rounded-lg transition-colors"
            title={copied ? "Copied!" : "Copy response"}
          >
            {copied ? (
              <svg className="w-3.5 h-3.5 text-green-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            )}
          </button>
          <button
            onClick={() => setReaction(reaction === 'up' ? null : 'up')}
            className={`p-1.5 rounded-lg transition-colors ${reaction === 'up' ? 'text-green-400 bg-green-500/10' : 'text-slate-600 hover:text-slate-300 hover:bg-surface-3'}`}
            title="Good response"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill={reaction === 'up' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h0a3.13 3.13 0 0 1 3 3.88Z"/>
            </svg>
          </button>
          <button
            onClick={() => setReaction(reaction === 'down' ? null : 'down')}
            className={`p-1.5 rounded-lg transition-colors ${reaction === 'down' ? 'text-red-400 bg-red-500/10' : 'text-slate-600 hover:text-slate-300 hover:bg-surface-3'}`}
            title="Bad response"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill={reaction === 'down' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 14V2"/><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22h0a3.13 3.13 0 0 1-3-3.88Z"/>
            </svg>
          </button>
          {onRegenerate && (
            <button
              onClick={() => onRegenerate(message.id)}
              className="p-1.5 text-slate-600 hover:text-slate-300 hover:bg-surface-3 rounded-lg transition-colors"
              title="Regenerate response"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 4 23 10 17 10" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Professional thinking/loading indicator ───────────────────────────
function ThinkingIndicator({ modelInfo, statusMessages = [] }: { modelInfo: { name: string; icon: string }; statusMessages?: string[] }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex items-start gap-2.5 max-w-[85%]">
      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500/20 to-indigo-500/20 border border-blue-500/15 flex items-center justify-center shrink-0 mt-0.5 shadow-[0_0_12px_rgba(45,122,255,0.15)]">
        <Bot className="w-3.5 h-3.5 text-blue-400" />
      </div>
      <div className="space-y-2.5 min-w-0">
        {/* Main thinking header */}
        <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-surface-2/60 border border-surface-4/30 backdrop-blur-sm shadow-lg shadow-blue-500/[0.03]">
          <div className="relative flex items-center justify-center w-5 h-5">
            <span className="absolute inset-0 rounded-full bg-blue-500/20 animate-ping" />
            <Sparkles className="w-4 h-4 text-blue-400 relative z-10" />
          </div>
          <span className="text-xs font-semibold text-slate-200 tracking-wide">
            {statusMessages.length > 0 ? statusMessages[statusMessages.length - 1] : `${modelInfo.name} is thinking`}
          </span>
          <span className="text-[10px] text-slate-500 font-mono tabular-nums ml-auto">
            {elapsed}s
          </span>
        </div>

        {/* Real-time status steps from backend */}
        {statusMessages.length > 1 && (
          <div className="space-y-1.5 pl-1">
            {statusMessages.slice(0, -1).map((msg, i) => (
              <motion.div
                key={`${i}-${msg}`}
                initial={{ opacity: 0, x: -10, y: -4 }}
                animate={{ opacity: 0.45, x: 0, y: 0 }}
                transition={{ duration: 0.35, ease: "easeOut" }}
                className="flex items-center gap-2 text-[11px]"
              >
                <span className="w-4 h-4 flex items-center justify-center">
                  <Check className="w-3 h-3 text-emerald-500" />
                </span>
                <span className="text-slate-600">
                  {msg}
                </span>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Smart follow-up suggestions ──────────────────────────────────────
function SmartSuggestions({ lastMessage, onSend, subject }: { lastMessage: Message; onSend: (text: string) => void; subject: string }) {
  // Generate contextual follow-up suggestions based on the last response
  const suggestions = React.useMemo(() => {
    const content = lastMessage.content.toLowerCase();
    const has = (kw: string) => content.includes(kw);
    const items: string[] = [];

    // Context-aware suggestions
    if (lastMessage.flashcardSets?.length) {
      items.push("Quiz me on these flashcards");
      items.push("Add more flashcards on this topic");
    }
    if (lastMessage.quizSets?.length) {
      items.push("Give me harder questions");
      items.push("Create flashcards from these topics");
    }
    if (lastMessage.flowcharts?.length) {
      items.push("Explain this in more detail");
      items.push("Create a simpler version");
    }
    if (has("formula") || has("equation") || has("theorem")) {
      items.push("Show me a worked example");
      items.push("What are common mistakes to avoid?");
    }
    if (has("step") || has("steps")) {
      items.push("Can you explain step 2 in more detail?");
      items.push("Give me a similar problem to practice");
    }
    if (has("graph") || has("chart") || has("diagram")) {
      items.push("Explain the trend shown here");
      items.push("What happens if the values change?");
    }

    // Generic follow-ups if we don't have enough contextual ones
    const generics = [
      "Explain this in simpler terms",
      "Give me practice questions on this",
      "Summarize this in bullet points",
      `Create flashcards on this topic`,
      "What are the key points to remember?",
      "How does this apply in real life?",
    ];

    // Fill up to 3 suggestions
    while (items.length < 3 && generics.length > 0) {
      const pick = generics.splice(Math.floor(Math.random() * generics.length), 1)[0];
      if (!items.includes(pick)) items.push(pick);
    }

    return items.slice(0, 3);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastMessage.id]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3, duration: 0.3 }}
      className="flex flex-wrap gap-2 pl-9 mt-1"
    >
      {suggestions.map((s, i) => (
        <button
          key={i}
          onClick={() => onSend(s)}
          className="text-xs px-3 py-1.5 rounded-full glass-subtle hover:bg-glass-medium hover:border-brand-500/30 text-slate-400 hover:text-white transition-all duration-150"
        >
          {s}
        </button>
      ))}
    </motion.div>
  );
}

// ── Empty state ──────────────────────────────────────────────────────
function EmptyState({ subject, onSuggestion }: { subject: string; onSuggestion: (text: string) => void }) {
  const allSuggestions: Record<string, string[]> = {
    math: [
      "Explain the quadratic formula step by step with a graph",
      "Show me the graph of sin(x), cos(x), and tan(x)",
      "Solve: ∫ x²·sin(x) dx using integration by parts",
      "Prove that √2 is irrational",
      "Explain matrices with real-world examples",
      "What is the binomial theorem? Show with expansion",
      "Solve a system of 3 equations with 3 unknowns",
      "Explain the concept of limits with visual graphs",
      "What are complex numbers? Show on Argand diagram",
      "Derive the area of a circle using calculus",
    ],
    physics: [
      "Derive the equations of motion and show a v-t graph",
      "Show projectile motion at 30°, 45°, and 60° on a chart",
      "Explain electromagnetic induction with Faraday's Law",
      "What is Bernoulli's principle? Give real-world examples",
      "Compare series and parallel circuits with diagrams",
      "Explain the Doppler effect with examples",
      "How does a nuclear reactor work?",
      "Derive the formula for time period of a simple pendulum",
      "Explain wave-particle duality of light",
      "What is special relativity? Explain time dilation",
    ],
    chemistry: [
      "Balance: Fe₂O₃ + CO → Fe + CO₂ and show the steps",
      "Compare electronegativity across Period 3 with a chart",
      "What is Le Chatelier's Principle? Give examples",
      "Explain the difference between SN1 and SN2 reactions",
      "How does the periodic table organize elements?",
      "What are hydrogen bonds? Why is water special?",
      "Explain buffer solutions with pH calculations",
      "What is chemical equilibrium? Explain Kc and Kp",
      "Draw the molecular orbital diagram of O₂",
      "Explain electrochemistry and galvanic cells",
    ],
    biology: [
      "Explain the Krebs cycle in simple terms with a table",
      "Compare mitosis and meiosis in a detailed table",
      "How does CRISPR gene editing work?",
      "What is natural selection? Give modern examples",
      "Explain photosynthesis: light and dark reactions",
      "How do vaccines work? mRNA vs traditional",
      "What is the central dogma of molecular biology?",
      "Explain the human immune system simply",
      "What are stem cells? Ethical considerations?",
      "How does the nervous system transmit signals?",
    ],
    cs: [
      "Explain Big-O notation with a comparison chart",
      "Compare sorting algorithms in a table with complexity",
      "Write a merge sort algorithm and explain step by step",
      "What is dynamic programming? Solve fibonacci with it",
      "Explain how the internet works — DNS, HTTP, TCP/IP",
      "What are design patterns? Explain 3 common ones",
      "How does encryption work? RSA vs AES",
      "Explain recursion vs iteration with examples",
      "What is a binary search tree? Show operations",
      "How does Git version control work internally?",
    ],
    english: [
      "How do I write a strong thesis statement?",
      "Analyse the theme of ambition in Macbeth",
      "Explain simile, metaphor, and personification with examples",
      "Write a persuasive essay outline on climate change",
      "What is the difference between active and passive voice?",
      "Explain irony — dramatic, situational, and verbal",
      "How to write a compelling introduction paragraph",
      "Analyse symbolism in The Great Gatsby",
      "What are the rules of using semicolons and colons?",
      "Explain narrative techniques in first-person stories",
    ],
    sst: [
      "Compare the causes of World War I and II in a table",
      "What are the three branches of government?",
      "Show the world's largest economies in a bar chart",
      "Explain the French Revolution and its consequences",
      "What is globalization? Pros and cons",
      "How does the United Nations work?",
      "Explain the Cold War in simple terms",
      "What caused the Industrial Revolution?",
      "Compare democratic vs authoritarian governments",
      "Explain climate change causes and effects with data",
    ],
    sanskrit: [
      "Explain sandhi rules with examples",
      "Translate this shloka and explain its meaning",
      "What are the vibhaktis in Sanskrit? Give a table",
      "Explain dhatu (verb roots) in Sanskrit grammar",
      "What is the structure of a Sanskrit sentence?",
      "List the 10 lakaaras with examples",
      "Explain samasa (compound words) types",
      "What is the Paninian grammar system?",
    ],
    general: [
      "Help me prepare for my upcoming math exam",
      "Explain any scientific concept with charts and visuals",
      "Solve a complex problem step by step",
      "Create a study schedule for my exams next week",
      "Summarize a topic in 5 bullet points",
      "Generate flashcards for any subject",
      "Analyze this document I'm about to upload",
      "Help me understand this screenshot",
      "Create a mind map of a topic using a flowchart",
      "Quiz me on any subject — 10 questions",
    ],
  };

  // Randomize: pick 4 suggestions from the pool
  const [randomSuggestions, setRandomSuggestions] = useState<string[]>([]);

  const reshuffleSuggestions = useCallback(() => {
    const pool = [...(allSuggestions[subject] || allSuggestions.general)];
    // Fisher-Yates shuffle
    for (let i = pool.length - 1; i > 0; i--) {
      const r = typeof crypto !== "undefined" && "getRandomValues" in crypto
        ? crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32
        : Math.random();
      const j = Math.floor(r * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    setRandomSuggestions(pool.slice(0, 4));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject]);

  useEffect(() => {
    reshuffleSuggestions();
  }, [subject, reshuffleSuggestions]);

  return (
    <div className="flex flex-col items-center justify-center h-full max-w-xl mx-auto px-4">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center space-y-6 w-full"
      >
        <div className="relative w-14 h-14 mx-auto">
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-blue-500/25 to-indigo-500/25 blur-xl animate-pulse-glow" />
          <div className="relative w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500/20 to-indigo-500/20 border border-blue-500/25 flex items-center justify-center backdrop-blur-sm shadow-[0_0_20px_rgba(45,122,255,0.2)]">
            <Icon name="graduation-cap" className="w-7 h-7 text-blue-400" />
          </div>
        </div>
        <div>
          <h2 className="text-xl font-bold text-white mb-1.5 tracking-tight">
            What can I help with?
          </h2>
          <p className="text-sm text-slate-500 max-w-sm mx-auto leading-relaxed">
            Search the web, create charts, analyze images,
            solve problems step-by-step, and more.
          </p>
          <button
            type="button"
            onClick={reshuffleSuggestions}
            className="mt-3 text-[11px] px-3 py-1.5 rounded-lg glass-subtle text-slate-400 hover:text-white transition-all duration-200 hover:border-blue-500/20"
          >
            ↻ Shuffle suggestions
          </button>
        </div>

        <div className="grid gap-2 w-full max-w-md mx-auto">
          {randomSuggestions.map((suggestion, i) => (
            <button
              key={i}
              onClick={() => onSuggestion(suggestion)}
              className="text-left px-4 py-3 glass-subtle hover:bg-glass-medium hover:border-blue-500/25 rounded-xl text-sm text-slate-400 hover:text-slate-200 transition-all duration-200 font-medium hover:shadow-[0_0_20px_rgba(45,122,255,0.08)] hover-glow"
            >
              {suggestion}
            </button>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
