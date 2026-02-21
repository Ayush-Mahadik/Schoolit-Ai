"use client";

import { useState, useEffect, useCallback } from "react";
import { AnimatePresence } from "framer-motion";
import { Sidebar } from "@/components/Sidebar";
import { ChatInterface } from "@/components/ChatInterface";
import { ModelSelector } from "@/components/ModelSelector";
import { ThinkingModeToggle } from "@/components/ThinkingModeToggle";
import { ScheduleManager } from "@/components/ScheduleManager";
import { sendMessage, fetchPersonas } from "@/lib/api";
import { getUserSettings, saveUserSettings } from "@/lib/store";
import { Icon, Menu, Globe } from "@/components/Icons";
import type { Message, Persona, Subject, ChatSettings, AIModel, ThinkingMode } from "@/lib/types";
import type { FileAttachment } from "@/components/FileUploadButton";

// ── Subject definitions (now with Lucide icon names) ─────────────────
const SUBJECTS: Subject[] = [
  { id: "math", name: "Mathematics", icon: "calculator", color: "#3b82f6" },
  { id: "physics", name: "Physics", icon: "atom", color: "#8b5cf6" },
  { id: "chemistry", name: "Chemistry", icon: "flask-conical", color: "#10b981" },
  { id: "biology", name: "Biology", icon: "dna", color: "#f59e0b" },
  { id: "cs", name: "Computer Science", icon: "code-2", color: "#ef4444" },
  { id: "english", name: "English", icon: "book-open", color: "#ec4899" },
  { id: "sst", name: "Social Studies", icon: "globe", color: "#f97316" },
  { id: "sanskrit", name: "Sanskrit", icon: "scroll-text", color: "#a855f7" },
  { id: "general", name: "General", icon: "library", color: "#6b7280" },
];

export default function Home() {
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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
    // Open sidebar by default on desktop
    if (window.innerWidth >= 1024) setSidebarOpen(true);
  }, []);

  useEffect(() => {
    saveUserSettings(settings);
  }, [settings]);

  const currentMessages = messages[activeSubject] || [];

  // ── Send a message ──────────────────────────────────────────────────
  const handleSend = useCallback(
    async (text: string, files?: FileAttachment[]) => {
      if (!text.trim() || isLoading) return;

      const currentFiles = [...(contextFiles[activeSubject] || [])];
      if (files && files.length > 0) {
        currentFiles.push(...files);
        setContextFiles((prev) => ({ ...prev, [activeSubject]: currentFiles }));
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
        const history = (messages[activeSubject] || [])
          .slice(-20)
          .map((m) => ({ role: m.role, content: m.content }));

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
    <div className="flex h-[100dvh] overflow-hidden bg-surface-0">
      {/* ── Mobile overlay ─────────────────────────────────────────── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar ──────────────────────────────────────────────── */}
      <AnimatePresence>
        {sidebarOpen && (
          <Sidebar
            subjects={SUBJECTS}
            activeSubject={activeSubject}
            onSelectSubject={(id) => {
              setActiveSubject(id);
              if (window.innerWidth < 1024) setSidebarOpen(false);
            }}
            onClose={() => setSidebarOpen(false)}
            onToggleSchedule={() => setShowSchedule((p) => !p)}
            messageCount={Object.fromEntries(
              SUBJECTS.map((s) => [s.id, (messages[s.id] || []).length])
            )}
          />
        )}
      </AnimatePresence>

      {/* ── Main Content ─────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* ── Header ─────────────────────────────────────────────── */}
        <header className="flex items-center justify-between px-3 sm:px-5 h-14 border-b border-surface-3/60 bg-surface-0/90 backdrop-blur-md shrink-0 z-20">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 hover:bg-surface-3 rounded-lg transition-colors text-slate-400 hover:text-white"
              aria-label="Toggle sidebar"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-brand-600 flex items-center justify-center shrink-0">
                <Icon name="graduation-cap" className="w-4 h-4 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-sm font-semibold text-white truncate">SchoolIT AI</h1>
                <p className="text-[10px] text-slate-500 truncate hidden sm:block">
                  <Icon name={currentSubjectInfo.icon} className="w-3 h-3 inline mr-1" />
                  {currentSubjectInfo.name}
                </p>
              </div>
            </div>
          </div>

          {/* ── Desktop Controls ────────────────────────────────── */}
          <div className="hidden md:flex items-center gap-2">
            <ThinkingModeToggle
              activeMode={settings.thinkingMode}
              onSelect={(mode: ThinkingMode) =>
                setSettings((prev) => ({ ...prev, thinkingMode: mode }))
              }
            />
            <ModelSelector
              activeModel={settings.model}
              onSelect={(model: AIModel) =>
                setSettings((prev) => ({ ...prev, model }))
              }
            />
            <button
              onClick={() => setSettings((prev) => ({ ...prev, useWebSearch: !prev.useWebSearch }))}
              className={`p-2 rounded-lg transition-colors ${
                settings.useWebSearch
                  ? "bg-brand-600/20 text-brand-400"
                  : "bg-surface-3 text-slate-500"
              }`}
              title={`Web search ${settings.useWebSearch ? "ON" : "OFF"}`}
            >
              <Globe className="w-4 h-4" />
            </button>
          </div>

          {/* ── Mobile Controls ─────────────────────────────────── */}
          <div className="flex md:hidden items-center gap-1">
            <ModelSelector
              activeModel={settings.model}
              onSelect={(model: AIModel) =>
                setSettings((prev) => ({ ...prev, model }))
              }
            />
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 hover:bg-surface-3 rounded-lg transition-colors text-slate-400"
              aria-label="More options"
            >
              <Icon name="settings" className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* ── Mobile Menu Dropdown ──────────────────────────────── */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <div className="md:hidden border-b border-surface-3 bg-surface-1 px-3 py-2 flex flex-wrap items-center gap-2 z-10">
              <ThinkingModeToggle
                activeMode={settings.thinkingMode}
                onSelect={(mode: ThinkingMode) => {
                  setSettings((prev) => ({ ...prev, thinkingMode: mode }));
                }}
              />
              <button
                onClick={() => setSettings((prev) => ({ ...prev, useWebSearch: !prev.useWebSearch }))}
                className={`px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition-colors ${
                  settings.useWebSearch
                    ? "bg-brand-600/20 text-brand-400"
                    : "bg-surface-3 text-slate-500"
                }`}
              >
                <Globe className="w-3.5 h-3.5" />
                Search {settings.useWebSearch ? "ON" : "OFF"}
              </button>
              <button
                onClick={() => { setShowSchedule((p) => !p); setMobileMenuOpen(false); }}
                className="px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 bg-surface-3 text-slate-400"
              >
                <Icon name="calendar" className="w-3.5 h-3.5" />
                Schedule
              </button>
            </div>
          )}
        </AnimatePresence>

        {/* ── Chat + Schedule ──────────────────────────────────── */}
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
