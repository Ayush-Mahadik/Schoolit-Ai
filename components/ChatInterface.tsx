"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { ChartRenderer, parseChartBlocks, type ChartSpec } from "@/components/ChartRenderer";
import { FileUploadButton, FileChips, type FileAttachment } from "@/components/FileUploadButton";
import { VideoPlayer } from "@/components/VideoPlayer";
import { Icon, Send, Upload, Bot, Wrench, ExternalLink, Brain, Paperclip } from "@/components/Icons";
import type { Message, AIModel } from "@/lib/types";
import { MODEL_OPTIONS } from "@/lib/types";

interface ChatInterfaceProps {
  messages: Message[];
  isLoading: boolean;
  onSend: (text: string, files?: FileAttachment[]) => void;
  subject: string;
  activeModel?: AIModel;
}

function preprocessLatex(text: string): string {
  text = text.replace(/\\\(([\s\S]+?)\\\)/g, (_, content) => `$${content}$`);
  text = text.replace(/\\\[([\s\S]+?)\\\]/g, (_, content) => `$$${content}$$`);
  return text;
}

export function ChatInterface({ messages, isLoading, onSend, subject, activeModel }: ChatInterfaceProps) {
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

  const modelInfo = MODEL_OPTIONS.find((m) => m.id === activeModel) || MODEL_OPTIONS[1];

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
            className="absolute inset-0 z-50 bg-brand-600/5 border-2 border-dashed border-brand-500/40 rounded-xl flex items-center justify-center backdrop-blur-sm"
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
                    <UserBubble message={msg} />
                  ) : (
                    <AssistantBubble message={msg} />
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
                  <div className="w-7 h-7 rounded-lg bg-surface-3 flex items-center justify-center shrink-0 mt-0.5">
                    <Bot className="w-3.5 h-3.5 text-brand-400" />
                  </div>
                  <div className="bg-surface-2 rounded-2xl rounded-tl-md px-4 py-3">
                    <div className="flex items-center gap-2 text-slate-400 text-sm">
                      <span className="typing-dot w-1.5 h-1.5 bg-brand-400 rounded-full" />
                      <span className="typing-dot w-1.5 h-1.5 bg-brand-400 rounded-full" />
                      <span className="typing-dot w-1.5 h-1.5 bg-brand-400 rounded-full" />
                      <span className="ml-1.5 text-xs text-slate-500">
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
      <div className="border-t border-surface-3/50 bg-surface-0 px-3 sm:px-4 py-3">
        <div className="max-w-3xl mx-auto">
          <FileChips files={attachedFiles} onRemove={handleRemoveFile} />

          <div className="flex items-end gap-2 bg-surface-2 rounded-2xl border border-surface-3 focus-within:border-brand-500/40 transition-colors px-3 py-2">
            <FileUploadButton
              onFilesSelected={handleFilesSelected}
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
              className="p-2 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-30 disabled:hover:bg-brand-600 text-white transition-colors shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
          <p className="text-[10px] text-slate-600 mt-1.5 text-center">
            SchoolIT AI · {modelInfo.name} via GitHub Models · Responses may not always be accurate
          </p>
        </div>
      </div>
    </div>
  );
}

// ── User message bubble ──────────────────────────────────────────────
function UserBubble({ message }: { message: Message }) {
  return (
    <div className="max-w-[80%] sm:max-w-[70%]">
      <div className="bg-brand-600/15 text-slate-200 rounded-2xl rounded-br-md px-4 py-2.5">
        <p className="text-sm whitespace-pre-wrap leading-relaxed">{message.content}</p>
        {message.attachments && message.attachments.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {message.attachments.map((f, i) => (
              <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-brand-500/15 text-brand-300 flex items-center gap-1">
                <Paperclip className="w-2.5 h-2.5" />
                {f.name}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Assistant message bubble ─────────────────────────────────────────
function AssistantBubble({ message }: { message: Message }) {
  const { text: processedText, charts: inlineCharts } = parseChartBlocks(message.content);
  const latexFixed = preprocessLatex(processedText);

  return (
    <div className="flex items-start gap-2.5 max-w-[90%] sm:max-w-[85%]">
      <div className="w-7 h-7 rounded-lg bg-surface-3 flex items-center justify-center shrink-0 mt-0.5">
        <Bot className="w-3.5 h-3.5 text-brand-400" />
      </div>
      <div className="space-y-2 min-w-0 flex-1">
        {/* Tool call badges */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {message.toolCalls.map((tool, i) => (
              <span
                key={i}
                className="text-[10px] px-2 py-0.5 rounded-full bg-surface-3 text-slate-500 flex items-center gap-1"
              >
                <Wrench className="w-2.5 h-2.5" />
                {tool.replace(/_/g, " ")}
              </span>
            ))}
          </div>
        )}

        {/* Chain of Thought */}
        {message.thinking && (
          <details className="thinking-block">
            <summary className="flex items-center gap-1.5">
              <Brain className="w-3.5 h-3.5" />
              Chain of Thought
            </summary>
            <div className="mt-2 prose-chat text-xs">
              <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                {preprocessLatex(message.thinking)}
              </ReactMarkdown>
            </div>
          </details>
        )}

        {/* Main content */}
        <div className="bg-surface-2 rounded-2xl rounded-tl-md px-4 py-3 border border-surface-3/50">
          <div className="prose-chat text-sm">
            <ReactMarkdown
              remarkPlugins={[remarkMath]}
              rehypePlugins={[rehypeKatex]}
              components={{
                code({ className, children, ...props }) {
                  const match = /language-chart/.exec(className || "");
                  if (match) {
                    try {
                      const chartData = JSON.parse(String(children).trim());
                      if (chartData.type && chartData.datasets) {
                        return <ChartRenderer data={chartData} />;
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
          </div>
        </div>

        {/* Video player */}
        {message.animationUrl && <VideoPlayer url={message.animationUrl} />}

        {/* Source links */}
        {message.sources && message.sources.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {message.sources.map((src, i) => {
              let hostname = src;
              try { hostname = new URL(src).hostname; } catch { /* ignore */ }
              return (
                <a
                  key={i}
                  href={src}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] px-2 py-0.5 rounded-full bg-surface-3 text-brand-400 hover:text-brand-300 transition-colors truncate max-w-[200px] flex items-center gap-1"
                >
                  <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                  {hostname}
                </a>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Empty state ──────────────────────────────────────────────────────
function EmptyState({ subject, onSuggestion }: { subject: string; onSuggestion: (text: string) => void }) {
  const suggestions: Record<string, string[]> = {
    math: [
      "Explain the quadratic formula step by step with a graph",
      "Show me the graph of sin(x), cos(x), and tan(x)",
      "Solve: ∫ x²·sin(x) dx using integration by parts",
    ],
    physics: [
      "Derive the equations of motion and show a v-t graph",
      "Show projectile motion at 30°, 45°, and 60° on a chart",
      "Explain electromagnetic induction with Faraday's Law",
    ],
    chemistry: [
      "Balance: Fe₂O₃ + CO → Fe + CO₂ and show the steps",
      "Compare electronegativity across Period 3 with a chart",
      "What is Le Chatelier's Principle? Give examples.",
    ],
    biology: [
      "Explain the Krebs cycle in simple terms with a table",
      "Compare mitosis and meiosis in a detailed table",
      "How does CRISPR gene editing work?",
    ],
    cs: [
      "Explain Big-O notation with a comparison chart",
      "Compare sorting algorithms in a table with time complexity",
      "Write a merge sort algorithm and explain it step by step",
    ],
    english: [
      "How do I write a strong thesis statement?",
      "Analyse the theme of ambition in Macbeth",
      "Explain simile, metaphor, and personification with examples",
    ],
    sst: [
      "Compare the causes of World War I and II in a table",
      "What are the three branches of government?",
      "Show the world's largest economies in a bar chart",
    ],
    sanskrit: [
      "Explain sandhi rules with examples",
      "Translate this shloka and explain its meaning",
      "What are the vibhaktis in Sanskrit? Give a table.",
    ],
    general: [
      "Help me prepare for my upcoming math exam",
      "Explain any scientific concept with charts and visuals",
      "Solve a complex problem step by step",
    ],
  };

  const subjectSuggestions = suggestions[subject] || suggestions.general;

  return (
    <div className="flex flex-col items-center justify-center h-full max-w-xl mx-auto px-4">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center space-y-6 w-full"
      >
        <div className="w-14 h-14 mx-auto rounded-2xl bg-brand-600/15 flex items-center justify-center">
          <Icon name="graduation-cap" className="w-7 h-7 text-brand-400" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-white mb-1">
            How can I help you today?
          </h2>
          <p className="text-sm text-slate-500 max-w-sm mx-auto">
            Ask me anything — I can search the web, create charts,
            generate flowcharts, and solve problems step by step.
          </p>
        </div>

        <div className="grid gap-2 w-full max-w-md mx-auto">
          {subjectSuggestions.map((suggestion, i) => (
            <button
              key={i}
              onClick={() => onSuggestion(suggestion)}
              className="text-left px-4 py-3 bg-surface-2 hover:bg-surface-3 border border-surface-3/60 rounded-xl text-sm text-slate-400 hover:text-white transition-all duration-150"
            >
              {suggestion}
            </button>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
