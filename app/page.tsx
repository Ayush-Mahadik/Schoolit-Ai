"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSession, signIn } from "next-auth/react";
import { AnimatePresence } from "framer-motion";
import { Sidebar } from "@/components/Sidebar";
import { ChatInterface } from "@/components/ChatInterface";
import { ThinkingModeToggle } from "@/components/ThinkingModeToggle";
import { ConversationHistory } from "@/components/ConversationHistory";
import { sendMessage, fetchPersonas } from "@/lib/api";
import { getUserSettings, saveUserSettings, getScheduleContext, addScheduleItems, runStoreMigrations, hydrateStore } from "@/lib/store";
import {
  buildMemoryContext,
  saveConversation,
  summarizeConversation,
  extractFactsFromConversation,
  addMemoryFact,
  setMemoryUser,
  isMemoryOwner,
  hydrateMemory,
} from "@/lib/memory";
import { Icon, Menu, Globe } from "@/components/Icons";
import type { Message, Persona, Subject, ChatSettings, ThinkingMode, ScheduleItem, MockTestData, QuestionPaperData } from "@/lib/types";
import type { FileAttachment } from "@/components/FileUploadButton";
import { SITE_NAME, SITE_URL } from "@/lib/config";

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
    chainOfThought: false,
    thinkingMode: "balanced",
  });
  const [contextFiles, setContextFiles] = useState<Record<string, FileAttachment[]>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [thinkingStatus, setThinkingStatus] = useState<string[]>([]);
  const [guestMessageCount, setGuestMessageCount] = useState(0);
  const [showAuthWall, setShowAuthWall] = useState(false);

  // ── Load saved settings & personas on mount ─────────────────────────
  useEffect(() => {
    // Hydrate encrypted storage into memory cache, then load settings
    Promise.all([hydrateStore(), hydrateMemory()]).then(() => {
      const saved = getUserSettings();
      if (saved) {
        setSettings((prev) => ({
          ...prev,
          thinkingMode: saved.thinkingMode || prev.thinkingMode,
          persona: saved.persona || prev.persona,
        }));
      }
    }).catch(console.error);

    fetchPersonas().then(setPersonas).catch(console.error);
    // Open sidebar by default on desktop
    if (window.innerWidth >= 1024) setSidebarOpen(true);
  }, []);

  // ── Sync memory user with session ───────────────────────────────────
  useEffect(() => {
    const isAdmin = !!(session?.user as Record<string, unknown>)?.isAdmin;
    setMemoryUser(session?.user?.email || null, isAdmin);
  }, [session]);

  useEffect(() => {
    saveUserSettings(settings);
  }, [settings]);

  // ── Keyboard shortcuts ──────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ctrl+Shift+N or Cmd+Shift+N → New chat
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "N") {
        e.preventDefault();
        setMessages((prev) => ({ ...prev, [activeSubject]: [] }));
        setContextFiles((prev) => ({ ...prev, [activeSubject]: [] }));
      }
      // Ctrl+/ → Toggle web search
      if ((e.ctrlKey || e.metaKey) && e.key === "/") {
        e.preventDefault();
        setSettings((prev) => ({ ...prev, useWebSearch: !prev.useWebSearch }));
      }
      // Ctrl+B → Toggle sidebar
      if ((e.ctrlKey || e.metaKey) && e.key === "b") {
        e.preventDefault();
        setSidebarOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [activeSubject]);

  // ── Persist messages across page navigation (e.g. /schedule → back) ───
  const restoredRef = useRef(false);
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("prolai-messages") || sessionStorage.getItem("schoolit-messages");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === "object" && Object.keys(parsed).length > 0) {
          setMessages(parsed);
        }
      }
    } catch { /* ignore */ }
    restoredRef.current = true;
  }, []);

  useEffect(() => {
    if (!restoredRef.current) return;
    try {
      sessionStorage.setItem("prolai-messages", JSON.stringify(messages));
    } catch { /* ignore */ }
  }, [messages]);

  const currentMessages = messages[activeSubject] || [];

  // ── Send a message ──────────────────────────────────────────────────
  const handleSend = useCallback(
    async (text: string, files?: FileAttachment[]) => {
      if (!text.trim() || isLoading) return;

      // ── Guest auth wall: allow 1 free message, then require sign-in ──
      if (!session?.user) {
        if (guestMessageCount >= 1) {
          setShowAuthWall(true);
          return;
        }
        setGuestMessageCount(prev => prev + 1);
      }

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
      setThinkingStatus([]);

      try {
        const subjectMessages = messages[activeSubject] || [];
        // Auto-routing picks models per thinking mode; use generous defaults
        const recentWindow = 12;
        const perMessageLimit = 1400;

        // Keep only recent dialogue as structured history
        const history = subjectMessages
          .slice(-recentWindow)
          .map((m) => ({ role: m.role, content: m.content.replace(/\s+/g, " ").slice(0, perMessageLimit) }));

        // Compress older dialogue into recall notes (long memory without huge token burn)
        const olderMessages = subjectMessages.slice(0, -recentWindow).slice(-30);
        const sessionRecall = olderMessages
          .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content.replace(/\s+/g, " ").slice(0, 180)}`)
          .join("\n");

        const persistentMemory = isMemoryOwner() ? buildMemoryContext() : "";
        const memory_context = [
          sessionRecall
            ? `## Recent Conversation Recall (compressed)\nUse these notes to remember earlier context:\n${sessionRecall}`
            : "",
          persistentMemory,
        ]
          .filter(Boolean)
          .join("\n\n")
          .slice(0, 4200);

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
          chain_of_thought: settings.thinkingMode === "deep",
          thinking_mode: settings.thinkingMode,
          history,
          context_files: [...textFiles, ...imageFiles],
          schedule_context: getScheduleContext(),
          memory_context,
        }, (status: string) => {
          setThinkingStatus((prev) => [...prev, status]);
        });

        // Process schedule actions from AI (add items via unified store)
        if (response.schedule_actions && response.schedule_actions.length > 0) {
          for (const action of response.schedule_actions) {
            if (action.action === "add" && Array.isArray(action.items)) {
              addScheduleItems(action.items as ScheduleItem[]);
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
            model: response.model || "auto",
          };
          saveConversation(convoRecord);

          // Extract and save facts from the conversation
          const newFacts = extractFactsFromConversation(convoMessages, convoId);
          for (const fact of newFacts) {
            addMemoryFact({ fact: fact.fact, category: fact.category, source: fact.source });
          }
        }

        // Check if the AI response itself contains an error
        if (response.error && response.error !== null) {
          console.warn("API returned error:", response.error, response.error_detail);
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
          flashcardSets: response.flashcard_sets || undefined,
          quizSets: response.quiz_sets || undefined,
          mockTests: response.mock_tests as MockTestData[] || undefined,
          questionPapers: response.question_papers as QuestionPaperData[] || undefined,
          searchImages: response.search_images || undefined,
          model: response.model || undefined,
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
          content: `⚠️ ${errorMessage}\n\n*Tip: Try asking a shorter question or switch to a different thinking mode.*`,
          timestamp: new Date(),
        };
        setMessages((prev) => ({
          ...prev,
          [activeSubject]: [...(prev[activeSubject] || []), errorMsg],
        }));
      } finally {
        setIsLoading(false);
        setThinkingStatus([]);
      }
    },
    [activeSubject, contextFiles, isLoading, messages, settings, session, guestMessageCount]
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
      {/* ── Auth Wall Modal ──────────────────────────────────────── */}
      {showAuthWall && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-surface-1 border border-surface-3/60 rounded-2xl p-6 sm:p-8 max-w-md w-full text-center shadow-2xl shadow-black/40">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500/20 to-indigo-500/20 border border-blue-500/15 flex items-center justify-center mx-auto mb-4">
              <Icon name="lock" className="w-8 h-8 text-blue-400" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Sign in to continue</h2>
            <p className="text-slate-400 text-sm mb-6 leading-relaxed">
              You&apos;ve used your free message! Sign in with Google to get <span className="text-brand-400 font-medium">unlimited access</span> to {SITE_NAME} — flashcards, quizzes, study tools, and more.
            </p>
            <button
              onClick={() => signIn("google")}
              className="w-full flex items-center justify-center gap-3 px-6 py-3 bg-white text-gray-800 font-semibold rounded-xl hover:bg-gray-100 transition-colors mb-3"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
              Continue with Google
            </button>
            <button
              onClick={() => setShowAuthWall(false)}
              className="text-slate-500 text-sm hover:text-slate-300 transition-colors"
            >
              Maybe later
            </button>
          </div>
        </div>
      )}

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
        <header className="flex items-center justify-between px-3 sm:px-5 h-14 border-b border-surface-3/60 bg-surface-0/95 backdrop-blur-xl shrink-0 relative">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 hover:bg-surface-3 rounded-lg transition-colors text-slate-400 hover:text-white"
              aria-label="Toggle sidebar"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0 shadow-lg shadow-blue-500/15">
                <Icon name="graduation-cap" className="w-4 h-4 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-sm font-bold text-white truncate">{SITE_NAME}</h1>
                <p className="text-[10px] text-slate-500 truncate hidden sm:block">
                  <Icon name={currentSubjectInfo.icon} className="w-3 h-3 inline mr-1" />
                  {currentSubjectInfo.name}
                </p>
              </div>
            </div>
          </div>

          {/* ── Desktop Controls ────────────────────────────────── */}
          <div className="hidden md:flex items-center gap-2">
            <ConversationHistory
              currentMessages={currentMessages}
              onLoadConversation={(id: string, loadedMessages: Message[]) => {
                if (loadedMessages && loadedMessages.length > 0) {
                  setMessages((prev) => ({ ...prev, [activeSubject]: loadedMessages }));
                }
              }}
              onNewChat={() => {
                setMessages((prev) => ({ ...prev, [activeSubject]: [] }));
                setContextFiles((prev) => ({ ...prev, [activeSubject]: [] }));
              }}
            />
            <ThinkingModeToggle
              activeMode={settings.thinkingMode}
              onSelect={(mode: ThinkingMode) =>
                setSettings((prev) => ({ ...prev, thinkingMode: mode, chainOfThought: mode === "deep" }))
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
            <ConversationHistory
              currentMessages={currentMessages}
              onLoadConversation={(id: string, loadedMessages: Message[]) => {
                if (loadedMessages && loadedMessages.length > 0) {
                  setMessages((prev) => ({ ...prev, [activeSubject]: loadedMessages }));
                }
              }}
              onNewChat={() => {
                setMessages((prev) => ({ ...prev, [activeSubject]: [] }));
                setContextFiles((prev) => ({ ...prev, [activeSubject]: [] }));
              }}
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
                  setSettings((prev) => ({ ...prev, thinkingMode: mode, chainOfThought: mode === "deep" }));
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
              <a
                href="/knowledge"
                onClick={() => setMobileMenuOpen(false)}
                className="px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 bg-surface-3 text-slate-400"
              >
                <Icon name="book-open" className="w-3.5 h-3.5" />
                Knowledge
              </a>
            </div>
          )}
        </AnimatePresence>

        {/* ── Chat + Schedule ──────────────────────────────────── */}
        <div className="flex-1 flex min-h-0">
          <ChatInterface
            messages={currentMessages}
            isLoading={isLoading}
            onSend={handleSend}
            onEditMessage={handleEditMessage}
            onRegenerate={handleRegenerate}
            subject={activeSubject}
            thinkingStatus={thinkingStatus}
          />
        </div>
      </div>
    </div>
  );
}
