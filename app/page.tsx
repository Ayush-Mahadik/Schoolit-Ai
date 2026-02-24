"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { AnimatePresence } from "framer-motion";
import { Sidebar } from "@/components/Sidebar";
import { ChatInterface } from "@/components/ChatInterface";
import { ModelSelector } from "@/components/ModelSelector";
import { ThinkingModeToggle } from "@/components/ThinkingModeToggle";
import { ConversationHistory } from "@/components/ConversationHistory";
import { sendMessage, fetchPersonas } from "@/lib/api";
import { getUserSettings, saveUserSettings } from "@/lib/store";
import {
  buildMemoryContext,
  saveConversation,
  summarizeConversation,
  extractFactsFromConversation,
  addMemoryFact,
  setMemoryUser,
  isMemoryOwner,
} from "@/lib/memory";
import { Icon, Menu, Globe } from "@/components/Icons";
import type { Message, Persona, Subject, ChatSettings, AIModel, ThinkingMode } from "@/lib/types";
import type { FileAttachment } from "@/components/FileUploadButton";

// ── Helper: read schedule from localStorage ──────────────────────────
function getScheduleContext(): string {
  if (typeof window === "undefined") return "";
  try {
    const data = localStorage.getItem("schoolit-schedule");
    if (!data) return "";
    const items = JSON.parse(data);
    if (!Array.isArray(items) || items.length === 0) return "";
    const now = new Date();
    const upcoming = items
      .filter((i: Record<string, unknown>) => new Date(String(i.startTime)) >= now || !i.completed)
      .slice(0, 20);
    if (upcoming.length === 0) return "";
    return "Student's current schedule:\n" + upcoming.map((i: Record<string, unknown>) =>
      `- ${i.title} (${i.type}, ${i.subject}) — ${new Date(String(i.startTime)).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}${i.completed ? " [DONE]" : ""}`
    ).join("\n");
  } catch {
    return "";
  }
}

// Helper: add items to schedule in localStorage
function addToSchedule(items: Record<string, unknown>[]) {
  if (typeof window === "undefined") return;
  try {
    const existing = JSON.parse(localStorage.getItem("schoolit-schedule") || "[]");
    const updated = [...existing, ...items].sort(
      (a: Record<string, unknown>, b: Record<string, unknown>) =>
        new Date(String(a.startTime)).getTime() - new Date(String(b.startTime)).getTime()
    );
    localStorage.setItem("schoolit-schedule", JSON.stringify(updated));
  } catch {
    // ignore
  }
}

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
  const { data: session } = useSession();
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const [activeSubject, setActiveSubject] = useState<string>("general");
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [settings, setSettings] = useState<ChatSettings>({
    persona: "balanced",
    useWebSearch: true,
    chainOfThought: true,
    model: "claude-3.7-sonnet" as AIModel,
    thinkingMode: "balanced",
  });
  const [contextFiles, setContextFiles] = useState<Record<string, FileAttachment[]>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
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

  // ── Sync memory user with session ───────────────────────────────────
  useEffect(() => {
    setMemoryUser(session?.user?.email || null);
  }, [session]);

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
          schedule_context: getScheduleContext(),
          memory_context: isMemoryOwner() ? buildMemoryContext() : "",
        });

        // Process schedule actions from AI (add items to localStorage)
        if (response.schedule_actions && response.schedule_actions.length > 0) {
          for (const action of response.schedule_actions) {
            if (action.action === "add" && Array.isArray(action.items)) {
              addToSchedule(action.items as Record<string, unknown>[]);
            }
          }
        }

        // Save conversation to admin memory system (ADMIN ONLY)
        if (isMemoryOwner()) {
          const convoId = response.conversation_id || `convo-${Date.now()}`;
          const convoMessages = [
            { role: "user" as const, content: text, timestamp: new Date().toISOString() },
            { role: "assistant" as const, content: response.response, timestamp: new Date().toISOString() },
          ];
          const convoRecord = {
            id: convoId,
            subject: activeSubject,
            messages: convoMessages,
            summary: summarizeConversation(convoMessages),
            createdAt: new Date().toISOString(),
            model: response.model || settings.model,
          };
          saveConversation(convoRecord);

          // Extract and save facts from the conversation
          const newFacts = extractFactsFromConversation(convoMessages, convoId);
          for (const fact of newFacts) {
            addMemoryFact({ fact: fact.fact, category: fact.category, source: fact.source });
          }
        }

        const assistantMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: response.response,
          timestamp: new Date(),
          thinking: response.thinking || undefined,
          animationUrl: response.animation_url || undefined,
          sources: response.sources || [],
          toolCalls: response.tool_calls || [],
          flowcharts: response.flowcharts || undefined,
          manimAnimations: response.manim_animations || undefined,
          generatedImages: response.generated_images || undefined,
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

  // ── Edit a user message and resend ──────────────────────────────────
  const handleEditMessage = useCallback(
    (messageId: string, newContent: string) => {
      const subjectMessages = messages[activeSubject] || [];
      const msgIndex = subjectMessages.findIndex((m) => m.id === messageId);
      if (msgIndex === -1) return;

      // Remove this message and everything after it
      const trimmed = subjectMessages.slice(0, msgIndex);
      setMessages((prev) => ({
        ...prev,
        [activeSubject]: trimmed,
      }));

      // Resend with new content
      setTimeout(() => handleSend(newContent), 100);
    },
    [activeSubject, messages, handleSend]
  );

  // ── Regenerate an assistant response ────────────────────────────────
  const handleRegenerate = useCallback(
    (messageId: string) => {
      const subjectMessages = messages[activeSubject] || [];
      const msgIndex = subjectMessages.findIndex((m) => m.id === messageId);
      if (msgIndex === -1) return;

      // Find the user message before this assistant message
      let userMsg: Message | undefined;
      for (let i = msgIndex - 1; i >= 0; i--) {
        if (subjectMessages[i].role === "user") {
          userMsg = subjectMessages[i];
          break;
        }
      }
      if (!userMsg) return;

      // Remove this assistant message (and anything after)
      const trimmed = subjectMessages.slice(0, msgIndex);
      setMessages((prev) => ({
        ...prev,
        [activeSubject]: trimmed,
      }));

      // Resend the original user message
      setTimeout(() => handleSend(userMsg!.content), 100);
    },
    [activeSubject, messages, handleSend]
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
            messageCount={Object.fromEntries(
              SUBJECTS.map((s) => [s.id, (messages[s.id] || []).length])
            )}
          />
        )}
      </AnimatePresence>

      {/* ── Main Content ─────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* ── Header ─────────────────────────────────────────────── */}
        <header className="flex items-center justify-between px-3 sm:px-5 h-14 border-b border-surface-3 bg-surface-0 shrink-0 z-20">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 hover:bg-surface-3 rounded-lg transition-colors text-slate-400 hover:text-white"
              aria-label="Toggle sidebar"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-blue-500 flex items-center justify-center shrink-0">
                <Icon name="graduation-cap" className="w-4 h-4 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-sm font-bold text-white truncate">SchoolIT AI</h1>
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
                onClick={() => { setSettings((prev) => ({ ...prev, useWebSearch: !prev.useWebSearch })); }}
                className={`px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition-colors ${
                  settings.useWebSearch
                    ? "bg-brand-600/20 text-brand-400"
                    : "bg-surface-3 text-slate-500"
                }`}
              >
                <Globe className="w-3.5 h-3.5" />
                Search {settings.useWebSearch ? "ON" : "OFF"}
              </button>
              <a
                href="/schedule"
                onClick={() => setMobileMenuOpen(false)}
                className="px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 bg-surface-3 text-slate-400"
              >
                <Icon name="calendar" className="w-3.5 h-3.5" />
                Schedule
              </a>
            </div>
          )}
        </AnimatePresence>

        {/* ── Chat + Schedule ──────────────────────────────────── */}
        <div className="flex-1 flex min-h-0">
          <ConversationHistory
            currentMessages={currentMessages}
            onNewChat={() => {
              setMessages((prev) => ({ ...prev, [activeSubject]: [] }));
              setContextFiles((prev) => ({ ...prev, [activeSubject]: [] }));
            }}
          />
          <ChatInterface
            messages={currentMessages}
            isLoading={isLoading}
            onSend={handleSend}
            onEditMessage={handleEditMessage}
            onRegenerate={handleRegenerate}
            subject={activeSubject}
            activeModel={settings.model}
          />
        </div>
      </div>
    </div>
  );
}
