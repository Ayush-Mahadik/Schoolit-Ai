"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sidebar } from "@/components/Sidebar";
import { ChatInterface } from "@/components/ChatInterface";
import { SubjectTabs } from "@/components/SubjectTabs";
import { PersonaToggle } from "@/components/PersonaToggle";
import { PdfUploader } from "@/components/PdfUploader";
import { ModelSelector } from "@/components/ModelSelector";
import { ThinkingModeToggle } from "@/components/ThinkingModeToggle";
import { ScheduleManager } from "@/components/ScheduleManager";
import { sendMessage, fetchPersonas } from "@/lib/api";
import { getUserSettings, saveUserSettings } from "@/lib/store";
import type { Message, Persona, Subject, ChatSettings, AIModel, ThinkingMode } from "@/lib/types";
import type { FileAttachment } from "@/components/FileUploadButton";

// ── Subject definitions ──────────────────────────────────────────────
const SUBJECTS: Subject[] = [
  { id: "math", name: "Mathematics", icon: "📐", color: "#3b82f6" },
  { id: "physics", name: "Physics", icon: "⚛️", color: "#8b5cf6" },
  { id: "chemistry", name: "Chemistry", icon: "🧪", color: "#10b981" },
  { id: "biology", name: "Biology", icon: "🧬", color: "#f59e0b" },
  { id: "cs", name: "Computer Science", icon: "💻", color: "#ef4444" },
  { id: "english", name: "English", icon: "📝", color: "#ec4899" },
  { id: "sst", name: "Social Studies", icon: "🌍", color: "#f97316" },
  { id: "sanskrit", name: "Sanskrit", icon: "🕉️", color: "#a855f7" },
  { id: "general", name: "General", icon: "📚", color: "#6b7280" },
];

export default function Home() {
  // ── State ───────────────────────────────────────────────────────────
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const [activeSubject, setActiveSubject] = useState<string>("general");
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [settings, setSettings] = useState<ChatSettings>({
    persona: "balanced",
    useWebSearch: true,
    chainOfThought: true,
    model: "gpt-4o",
    thinkingMode: "balanced",
  });
  const [contextFiles, setContextFiles] = useState<Record<string, FileAttachment[]>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showPdfUploader, setShowPdfUploader] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);

  // ── Load saved settings & personas on mount ─────────────────────────
  useEffect(() => {
    fetchPersonas().then(setPersonas).catch(console.error);
    const saved = getUserSettings();
    if (saved) {
      setSettings((prev) => ({
        ...prev,
        model: saved.model || prev.model,
        thinkingMode: saved.thinkingMode || prev.thinkingMode,
        persona: saved.persona || prev.persona,
      }));
    }
  }, []);

  // Persist settings whenever they change
  useEffect(() => {
    saveUserSettings(settings);
  }, [settings]);

  const currentMessages = messages[activeSubject] || [];

  // ── Send a message ──────────────────────────────────────────────────
  const handleSend = useCallback(
    async (text: string, files?: FileAttachment[]) => {
      if (!text.trim() || isLoading) return;

      // Merge any attached files into the subject's context
      const currentFiles = [...(contextFiles[activeSubject] || [])];
      if (files && files.length > 0) {
        currentFiles.push(...files);
        setContextFiles((prev) => ({
          ...prev,
          [activeSubject]: currentFiles,
        }));
      }

      const userMsg: Message = {
        id: Date.now().toString(),
        role: "user",
        content: text,
        timestamp: new Date(),
        attachments: files?.map((f) => ({ name: f.name, type: f.type, size: f.size })),
      };

      setMessages((prev) => ({
        ...prev,
        [activeSubject]: [...(prev[activeSubject] || []), userMsg],
      }));

      setIsLoading(true);

      try {
        // Build conversation history for the API
        const history = (messages[activeSubject] || [])
          .slice(-20)
          .map((m) => ({ role: m.role, content: m.content }));

        // Build file context
        const textFiles = currentFiles
          .filter((f) => !f.type.startsWith("image/"))
          .map((f) => ({ name: f.name, content: f.content, type: f.type }));
        const imageFiles = currentFiles
          .filter((f) => f.type.startsWith("image/"))
          .map((f) => ({ name: f.name, content: f.content, type: f.type }));

        const response = await sendMessage({
          message: text,
          subject: activeSubject,
          persona: settings.persona,
          use_web_search: settings.useWebSearch,
          chain_of_thought: settings.chainOfThought,
          model: settings.model,
          thinking_mode: settings.thinkingMode,
          history,
          context_files: [...textFiles, ...imageFiles],
        });

        const assistantMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: response.error
            ? `⚠️ ${response.error}\n\n${response.response}`
            : response.response,
          timestamp: new Date(),
          thinking: response.thinking || undefined,
          animationUrl: response.animation_url || undefined,
          sources: response.sources || [],
          toolCalls: response.tool_calls || [],
          model: (response.model as AIModel) || settings.model,
        };

        setMessages((prev) => ({
          ...prev,
          [activeSubject]: [...(prev[activeSubject] || []), userMsg, assistantMsg].filter(
            (m, i, arr) => arr.findIndex((x) => x.id === m.id) === i
          ),
        }));
      } catch (error) {
        console.error("Chat error:", error);
        const errorMessage =
          error instanceof Error
            ? error.message
            : "Something went wrong. Please check your connection.";
        const errorMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: `⚠️ ${errorMessage}`,
          timestamp: new Date(),
        };
        setMessages((prev) => ({
          ...prev,
          [activeSubject]: [...(prev[activeSubject] || []), errorMsg],
        }));
      } finally {
        setIsLoading(false);
      }
    },
    [activeSubject, contextFiles, isLoading, messages, settings]
  );

  const currentSubjectInfo = SUBJECTS.find((s) => s.id === activeSubject) || SUBJECTS[SUBJECTS.length - 1];

  return (
    <div className="flex h-screen overflow-hidden bg-surface-0">
      {/* ── Sidebar ──────────────────────────────────────────────────── */}
      <AnimatePresence>
        {sidebarOpen && (
          <Sidebar
            subjects={SUBJECTS}
            activeSubject={activeSubject}
            onSelectSubject={setActiveSubject}
            onClose={() => setSidebarOpen(false)}
            onToggleSchedule={() => setShowSchedule((p) => !p)}
            messageCount={Object.fromEntries(
              SUBJECTS.map((s) => [s.id, (messages[s.id] || []).length])
            )}
          />
        )}
      </AnimatePresence>

      {/* ── Main Content ─────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* ── Top Bar ──────────────────────────────────────────────── */}
        <header className="flex items-center justify-between px-4 py-3 border-b border-surface-3 bg-surface-1/80 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            {!sidebarOpen && (
              <button
                onClick={() => setSidebarOpen(true)}
                className="p-2 hover:bg-surface-3 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            )}
            <div className="flex items-center gap-2">
              <span className="text-2xl">{currentSubjectInfo.icon}</span>
              <div>
                <h1 className="text-lg font-semibold text-white">
                  SchoolIT AI
                </h1>
                <p className="text-xs text-slate-400">
                  {currentSubjectInfo.name} · Multi-Model · Charts & Deep Reasoning
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Thinking Mode */}
            <ThinkingModeToggle
              activeMode={settings.thinkingMode}
              onSelect={(mode: ThinkingMode) =>
                setSettings((prev) => ({ ...prev, thinkingMode: mode }))
              }
            />

            {/* Model Selector */}
            <ModelSelector
              activeModel={settings.model}
              onSelect={(model: AIModel) =>
                setSettings((prev) => ({ ...prev, model }))
              }
            />

            <button
              onClick={() => setShowPdfUploader(!showPdfUploader)}
              className="px-3 py-1.5 text-sm bg-surface-3 hover:bg-surface-4 rounded-lg transition-colors flex items-center gap-1.5"
              title="Upload PDF textbooks"
            >
              📄 PDFs
            </button>

            <PersonaToggle
              personas={personas}
              activePersona={settings.persona}
              onSelect={(persona) =>
                setSettings((prev) => ({ ...prev, persona }))
              }
            />

            <button
              onClick={() =>
                setSettings((prev) => ({
                  ...prev,
                  useWebSearch: !prev.useWebSearch,
                }))
              }
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors flex items-center gap-1.5 ${
                settings.useWebSearch
                  ? "bg-brand-600/20 text-brand-400 border border-brand-500/30"
                  : "bg-surface-3 text-slate-400"
              }`}
              title="Toggle autonomous web search"
            >
              🌐 {settings.useWebSearch ? "ON" : "OFF"}
            </button>
          </div>
        </header>

        {/* ── Subject Tabs ─────────────────────────────────────────── */}
        <SubjectTabs
          subjects={SUBJECTS}
          activeSubject={activeSubject}
          onSelect={setActiveSubject}
        />

        {/* ── PDF Uploader ─────────────────────────────────────────── */}
        <AnimatePresence>
          {showPdfUploader && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden border-b border-surface-3"
            >
              <PdfUploader
                subject={activeSubject}
                onClose={() => setShowPdfUploader(false)}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Chat + Schedule side-by-side ─────────────────────────── */}
        <div className="flex-1 flex min-h-0">
          <ChatInterface
            messages={currentMessages}
            isLoading={isLoading}
            onSend={handleSend}
            subject={activeSubject}
            activeModel={settings.model}
          />

          <AnimatePresence>
            {showSchedule && (
              <ScheduleManager onClose={() => setShowSchedule(false)} />
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
