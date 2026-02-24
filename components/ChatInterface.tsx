"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { ChartRenderer, parseChartBlocks, type ChartSpec } from "@/components/ChartRenderer";
import { MermaidRenderer, parseMermaidBlocks } from "@/components/MermaidRenderer";
import { ManimRenderer, parseManimBlocks } from "@/components/ManimRenderer";
import { ImageRenderer, parseImageBlocks } from "@/components/ImageRenderer";
import { FlashcardRenderer } from "@/components/FlashcardRenderer";
import { QuizRenderer } from "@/components/QuizRenderer";
import { FileUploadButton, FileChips, type FileAttachment } from "@/components/FileUploadButton";
import { VoiceInputButton } from "@/components/VoiceInputButton";
import { VideoPlayer } from "@/components/VideoPlayer";
import { Icon, Send, Upload, Bot, Wrench, ExternalLink, Brain, Paperclip } from "@/components/Icons";
import type { Message, AIModel } from "@/lib/types";
import { MODEL_OPTIONS } from "@/lib/types";

interface ChatInterfaceProps {
  messages: Message[];
  isLoading: boolean;
  onSend: (text: string, files?: FileAttachment[]) => void;
  onEditMessage?: (messageId: string, newContent: string) => void;
  onRegenerate?: (messageId: string) => void;
  subject: string;
  activeModel?: AIModel;
}

function preprocessLatex(text: string): string {
  // Convert \( ... \) to $ ... $ (inline math)
  text = text.replace(/\\\(([\s\S]+?)\\\)/g, (_, content) => `$${content.trim()}$`);
  // Convert \[ ... \] to $$ ... $$ (display math)
  text = text.replace(/\\\[([\s\S]+?)\\\]/g, (_, content) => `\n$$${content.trim()}$$\n`);
  // Fix double-escaped backslashes in common LaTeX commands
  text = text.replace(/\\\\(frac|sqrt|sum|int|prod|lim|infty|alpha|beta|gamma|delta|theta|pi|sigma|omega|text|mathrm|mathbf|mathit|begin|end|left|right|cdot|times|div|pm|leq|geq|neq|approx|equiv|subset|supset|cap|cup|forall|exists|nabla|partial|log|ln|sin|cos|tan|sec|csc|cot|vec|hat|bar|dot|ddot|tilde|overline|underline|overbrace|underbrace|binom|choose|pmatrix|bmatrix|vmatrix|cases|aligned|matrix|array)/g, '\\$1');
  // Fix common broken patterns: _{ } where content got split
  text = text.replace(/\$\s+/g, '$');
  text = text.replace(/\s+\$/g, '$');
  // Ensure display math has proper newlines
  text = text.replace(/([^\n])\$\$/g, '$1\n$$');
  text = text.replace(/\$\$([^\n])/g, '$$\n$1');
  return text;
}

export function ChatInterface({ messages, isLoading, onSend, onEditMessage, onRegenerate, subject, activeModel }: ChatInterfaceProps) {
  const [input, setInput] = useState("");
  const [attachedFiles, setAttachedFiles] = useState<FileAttachment[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dragCounter = useRef(0);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

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
          } else {
            reader.onload = () =>
              resolve({ name: file.name, content: reader.result as string, type: file.type || "text/plain", size: file.size });
            reader.onerror = () => resolve(null);
            reader.readAsText(file);
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

  const modelInfo = MODEL_OPTIONS.find((m) => m.id === activeModel) || MODEL_OPTIONS[0];

  return (
    <div
      className="flex-1 flex flex-col min-h-0 relative"
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
      <div className="flex-1 overflow-y-auto px-3 sm:px-4 py-6">
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
                <div className="flex items-start gap-2.5 max-w-[85%]">
                  <div className="w-7 h-7 rounded-full bg-surface-3 flex items-center justify-center shrink-0 mt-0.5">
                    <Bot className="w-3.5 h-3.5 text-brand-400" />
                  </div>
                  <div className="px-4 py-3">
                    <div className="flex items-center gap-2 text-slate-400 text-sm">
                      <span className="typing-dot w-1.5 h-1.5 bg-brand-400 rounded-full" />
                      <span className="typing-dot w-1.5 h-1.5 bg-brand-400 rounded-full" />
                      <span className="typing-dot w-1.5 h-1.5 bg-brand-400 rounded-full" />
                      <span className="ml-1.5 text-xs text-slate-600">
                        <Icon name={modelInfo.icon} className="w-3 h-3 inline mr-1" />
                        {modelInfo.name}
                      </span>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* ── Input Area ─────────────────────────────────────────────── */}
      <div className="border-t border-surface-3 bg-surface-0 px-3 sm:px-4 py-3">
        <div className="max-w-3xl mx-auto">
          <FileChips files={attachedFiles} onRemove={handleRemoveFile} />

          <div className="flex items-end gap-2 bg-surface-2 rounded-2xl border border-surface-3 focus-within:border-surface-4 transition-colors px-3 py-2">
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
              className="p-2 rounded-xl bg-blue-500 hover:bg-blue-400 disabled:opacity-20 disabled:hover:bg-blue-500 text-white transition-colors shrink-0 font-bold"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
          <p className="text-[10px] text-slate-600 mt-1.5 text-center font-medium">
            SchoolIT AI <span className="text-blue-500">·</span> {modelInfo.name} via GitHub Models <span className="text-blue-500">·</span> Responses may not always be accurate
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
      <div className="bg-surface-3 text-slate-200 rounded-2xl rounded-br-sm px-4 py-2.5">
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

  // Parse all rich content blocks from the message
  const { text: afterCharts, charts: inlineCharts } = parseChartBlocks(message.content);
  const { text: afterMermaid, diagrams: inlineDiagrams } = parseMermaidBlocks(afterCharts);
  const { text: afterManim, animations: inlineAnimations } = parseManimBlocks(afterMermaid);
  const { text: processedText, images: inlineImages } = parseImageBlocks(afterManim);

  // Clean up rendering placeholders (HTML comments that ReactMarkdown won't render)
  const cleanedText = processedText
    .replace(/<!--(?:chart|mermaid|manim|image):\d+-->/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const latexFixed = preprocessLatex(cleanedText);

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
      <div className="w-7 h-7 rounded-full bg-surface-3 flex items-center justify-center shrink-0 mt-0.5">
        <Bot className="w-3.5 h-3.5 text-brand-400" />
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
            <summary className="flex items-center gap-1.5">
              <Brain className="w-3.5 h-3.5" />
              <span>AI Thinking</span>
              <span className="text-[10px] text-slate-600 font-normal normal-case tracking-normal ml-1">
                {message.thinking.length > 200 ? `${Math.ceil(message.thinking.length / 4)} tokens` : ""}
              </span>
            </summary>
            <div className="mt-2 prose-chat text-xs leading-relaxed text-slate-400">
              <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                {preprocessLatex(message.thinking)}
              </ReactMarkdown>
            </div>
          </details>
        )}

        {/* Main content */}
        <div className="rounded-2xl rounded-tl-sm px-4 py-3">
          <div className="prose-chat text-sm">
            <ReactMarkdown
              remarkPlugins={[remarkMath]}
              rehypePlugins={[rehypeKatex]}
              components={{
                code({ className, children, ...props }) {
                  const codeStr = String(children).trim();
                  // Chart blocks
                  const chartMatch = /language-chart/.exec(className || "");
                  if (chartMatch) {
                    try {
                      const chartData = JSON.parse(codeStr);
                      if (chartData.type && chartData.datasets) {
                        return <ChartRenderer data={chartData} />;
                      }
                    } catch {
                      // Fall through
                    }
                  }
                  // Mermaid blocks
                  const mermaidMatch = /language-mermaid/.exec(className || "");
                  if (mermaidMatch) {
                    return <MermaidRenderer code={codeStr} />;
                  }
                  // Manim blocks
                  const manimMatch = /language-manim/.exec(className || "");
                  if (manimMatch) {
                    const classMatch = codeStr.match(/class\s+(\w+)\s*\(/);
                    const sceneName = classMatch ? classMatch[1] : "ManimScene";
                    return <ManimRenderer code={codeStr} sceneName={sceneName} explanation="" />;
                  }
                  // Image blocks
                  const imageMatch = /language-image/.exec(className || "");
                  if (imageMatch) {
                    try {
                      const imgData = JSON.parse(codeStr);
                      if (imgData.prompt) {
                        return <ImageRenderer prompt={imgData.prompt} style={imgData.style || "diagram"} subject={imgData.subject} url={imgData.url} />;
                      }
                    } catch {
                      // Fall through
                    }
                  }
                  return <code className={className} {...props}>{children}</code>;
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

            {inlineCharts.map((chart: ChartSpec, i: number) => (
              <ChartRenderer key={`chart-${i}`} data={chart} />
            ))}

            {inlineDiagrams.map((diagram, i) => (
              <MermaidRenderer key={`mermaid-${i}`} code={diagram.code} title={diagram.title} />
            ))}

            {inlineAnimations.map((anim, i) => (
              <ManimRenderer key={`manim-${i}`} code={anim.code} sceneName={anim.sceneName} explanation={anim.explanation} />
            ))}

            {inlineImages.map((img, i) => (
              <ImageRenderer key={`img-${i}`} prompt={img.prompt} style={img.style} subject={img.subject} url={img.url} />
            ))}

            {/* Structured data from tool calls */}
            {message.flowcharts?.map((fc, i) => (
              <MermaidRenderer key={`fc-${i}`} code={fc.mermaidCode} title={fc.title} />
            ))}

            {message.manimAnimations?.map((anim, i) => (
              <ManimRenderer key={`ma-${i}`} code={anim.code} sceneName={anim.sceneName} explanation={anim.explanation} />
            ))}

            {message.generatedImages?.map((img, i) => (
              <ImageRenderer key={`gi-${i}`} prompt={img.prompt} style={img.style} subject={img.subject} url={img.url} />
            ))}

            {/* Flashcard sets from tool calls */}
            {message.flashcardSets?.map((fc, i) => (
              <FlashcardRenderer key={`fc-set-${i}`} topic={fc.topic} cards={fc.cards} />
            ))}

            {/* Quiz sets from tool calls */}
            {message.quizSets?.map((quiz, i) => (
              <QuizRenderer key={`quiz-${i}`} topic={quiz.topic} questions={quiz.questions} difficulty={quiz.difficulty} />
            ))}
          </div>
        </div>

        {/* Video player */}
        {message.animationUrl && <VideoPlayer url={message.animationUrl} />}

        {/* Source links — Grok-style source cards */}
        {message.sources && message.sources.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
              <ExternalLink className="w-3 h-3" />
              Sources ({message.sources.length})
            </div>
            <div className="flex flex-wrap gap-2">
              {message.sources.map((src, i) => {
                let hostname = src;
                let displayName = src;
                try {
                  const u = new URL(src);
                  hostname = u.hostname.replace("www.", "");
                  displayName = hostname;
                } catch { /* ignore */ }
                return (
                  <a
                    key={i}
                    href={src}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface-2 hover:bg-surface-3 border border-surface-4 hover:border-blue-500/30 transition-all group/src max-w-[280px]"
                  >
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
                  </a>
                );
              })}
            </div>
          </div>
        )}

        {/* Action buttons — Copy / Regenerate */}
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

  useEffect(() => {
    const pool = allSuggestions[subject] || allSuggestions.general;
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    setRandomSuggestions(shuffled.slice(0, 4));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject]);

  return (
    <div className="flex flex-col items-center justify-center h-full max-w-xl mx-auto px-4">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center space-y-6 w-full"
      >
        <div className="w-12 h-12 mx-auto rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
          <Icon name="graduation-cap" className="w-6 h-6 text-blue-400" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white mb-1">
            What can I help with?
          </h2>
          <p className="text-sm text-slate-500 max-w-sm mx-auto">
            Ask anything — I search the web, create charts, analyze screenshots,
            solve problems step-by-step, and more. Try 🎤 voice input!
          </p>
        </div>

        <div className="grid gap-2 w-full max-w-md mx-auto">
          {randomSuggestions.map((suggestion, i) => (
            <button
              key={i}
              onClick={() => onSuggestion(suggestion)}
              className="text-left px-4 py-3 bg-surface-2 hover:bg-surface-3 border border-surface-3 hover:border-blue-500/30 rounded-xl text-sm text-slate-400 hover:text-white transition-all duration-150 font-medium"
            >
              {suggestion}
            </button>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
