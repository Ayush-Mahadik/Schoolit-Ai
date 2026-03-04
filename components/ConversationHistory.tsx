"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useSession } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import { Icon } from "@/components/Icons";
import {
  cloudSaveConversation,
  cloudLoadConversations,
  cloudDeleteConversation,
  cloudClearAll,
  type CloudConversation,
} from "@/lib/cloud-storage";
import type { Message } from "@/lib/types";

// ── Types ─────────────────────────────────────────────────────────────
interface Conversation {
  id: string;
  title: string;
  subject: string;
  timestamp: number;
  messageCount: number;
  preview: string;
}

/**
 * Generate a smart, concise title from conversation messages.
 * Removes question prefixes, extracts key topics, and formats nicely.
 */
function generateSmartTitle(messages: Message[]): string {
  const userMessages = messages.filter(m => m.role === "user");
  const assistantMessages = messages.filter(m => m.role === "assistant");
  if (userMessages.length === 0) return "New Chat";

  const firstMsg = userMessages[0].content;

  // Remove common prefixes and filler words
  let title = firstMsg
    .replace(/^(can you |please |help me |explain |what is |what are |how to |how do |how does |show me |tell me |teach me |i want to |i need to |i'd like to |could you )/i, "")
    .replace(/[?!.]+$/, "")
    .replace(/\s+/g, " ")
    .trim();

  // Extract key subject/topic from the AI response if user message is too vague
  if (title.length < 10 && assistantMessages.length > 0) {
    const aiContent = assistantMessages[0].content;
    // Try to extract a topic heading from the AI response
    const headingMatch = aiContent.match(/^#+\s+(.+)/m);
    if (headingMatch) {
      title = headingMatch[1].replace(/[*_#]/g, "").trim();
    }
  }

  // Capitalize first letter
  title = title.charAt(0).toUpperCase() + title.slice(1);

  // Truncate smartly at word boundary
  if (title.length > 55) {
    title = title.slice(0, 52);
    const lastSpace = title.lastIndexOf(" ");
    if (lastSpace > 30) title = title.slice(0, lastSpace);
    title += "...";
  }

  return title || "New Chat";
}

/**
 * Generate a brief AI-style content summary from conversation messages.
 * Shows topics discussed, tools used, and key outcomes.
 */
function generateConversationSummary(messages: Message[]): string {
  const parts: string[] = [];
  const userMsgs = messages.filter(m => m.role === "user");
  const assistantMsgs = messages.filter(m => m.role === "assistant");

  // Count topics discussed
  if (userMsgs.length > 1) {
    parts.push(`${userMsgs.length} questions`);
  }

  // Detect tool usage
  const allTools = new Set<string>();
  assistantMsgs.forEach(m => m.toolCalls?.forEach(t => allTools.add(t)));
  if (allTools.size > 0) {
    const toolLabels: Record<string, string> = {
      web_search: "Web search", generate_chart: "Charts",
      generate_flowchart: "Flowcharts", create_flashcards: "Flashcards",
      generate_quiz: "Quiz", generate_question_paper: "Question paper",
      generate_mock_test: "Mock test", summarize_video: "Video",
      generate_image: "Images", create_manim_animation: "Animation",
    };
    const usedLabels = Array.from(allTools)
      .map(t => toolLabels[t])
      .filter(Boolean)
      .slice(0, 3);
    if (usedLabels.length > 0) parts.push(usedLabels.join(", "));
  }

  // Check for special content
  if (assistantMsgs.some(m => m.flashcardSets && m.flashcardSets.length > 0)) parts.push("📇 Flashcards");
  if (assistantMsgs.some(m => m.quizSets && m.quizSets.length > 0)) parts.push("✅ Quiz");
  if (assistantMsgs.some(m => m.mockTests && m.mockTests.length > 0)) parts.push("📝 Mock test");
  if (assistantMsgs.some(m => m.sources && m.sources.length > 0)) parts.push("🔗 Sources");

  if (parts.length === 0) {
    // Fallback: use first few words of first assistant response
    const firstResponse = assistantMsgs[0]?.content || "";
    const preview = firstResponse.replace(/[#*_`]/g, "").replace(/\s+/g, " ").trim().slice(0, 80);
    return preview ? preview + (preview.length >= 80 ? "..." : "") : "Chat conversation";
  }

  return parts.join(" · ");
}

interface ConversationHistoryProps {
  currentMessages: Message[];
  onLoadConversation?: (id: string, messages: Message[]) => void;
  onNewChat?: () => void;
}

/** Format timestamp as relative time (e.g., "2h ago", "3d ago") */
function formatTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;
  return new Date(timestamp).toLocaleDateString("en-IN", { month: "short", day: "numeric" });
}

/**
 * Cloud-only conversation history sidebar.
 * All data is stored and retrieved from Supabase via /api/conversations.
 * No localStorage is used.
 */
export function ConversationHistory({
  currentMessages,
  onLoadConversation,
  onNewChat,
}: ConversationHistoryProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [cloudStatus, setCloudStatus] = useState<"idle" | "syncing" | "synced" | "error">("idle");
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const { data: session, status: sessionStatus } = useSession();
  const userEmail = session?.user?.email || null;
  const isAuthenticated = sessionStatus === "authenticated";
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const cloudCacheRef = useRef<Map<string, Message[]>>(new Map());

  // ── Load conversations from cloud when authenticated ────────────────
  const loadConversations = useCallback(async () => {
    if (!isAuthenticated || !userEmail) {
      setConversations([]);
      setCloudStatus("idle");
      return;
    }

    try {
      setCloudStatus("syncing");
      setIsLoadingHistory(true);
      const cloudData = await cloudLoadConversations(userEmail);

      if (cloudData && cloudData.length > 0) {
        const entries: Conversation[] = cloudData.map((c: CloudConversation) => ({
          id: c.id,
          title: c.title || "Untitled Chat",
          subject: c.subject || "general",
          timestamp: c.timestamp,
          messageCount: c.message_count || 0,
          preview: c.preview || "Chat conversation",
        }));

        // Cache messages in memory for quick access
        for (const c of cloudData) {
          if (c.messages && c.messages.length > 0) {
            const hydrated: Message[] = c.messages.map((m) => ({
              id: m.id,
              role: m.role,
              content: m.content,
              timestamp: new Date(m.timestamp),
              thinking: m.thinking || undefined,
              sources: m.sources || undefined,
              toolCalls: m.toolCalls || undefined,
              model: m.model || undefined,
              flowcharts: m.flowcharts as Message["flowcharts"],
              manimAnimations: m.manimAnimations as Message["manimAnimations"],
              generatedImages: m.generatedImages as Message["generatedImages"],
              flashcardSets: m.flashcardSets as Message["flashcardSets"],
              quizSets: m.quizSets as Message["quizSets"],
            }));
            cloudCacheRef.current.set(c.id, hydrated);
          }
        }

        entries.sort((a, b) => b.timestamp - a.timestamp);
        setConversations(entries);
        setCloudStatus("synced");
      } else {
        setConversations([]);
        setCloudStatus("synced");
      }
    } catch (err) {
      console.warn("Failed to load cloud conversations:", err);
      setCloudStatus("error");
    } finally {
      setIsLoadingHistory(false);
    }
  }, [isAuthenticated, userEmail]);

  // Reload when session resolves
  useEffect(() => {
    if (sessionStatus !== "loading") {
      loadConversations();
    }
  }, [sessionStatus, loadConversations]);

  // Reload fresh data when panel opens
  useEffect(() => {
    if (isOpen && isAuthenticated) {
      loadConversations();
    }
  }, [isOpen, isAuthenticated, loadConversations]);

  // Auto-save current conversation to cloud
  useEffect(() => {
    if (currentMessages.length > 0 && isAuthenticated && userEmail) {
      saveCurrentConversation();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMessages, isAuthenticated, userEmail]);

  function saveCurrentConversation() {
    if (currentMessages.length === 0 || !isAuthenticated || !userEmail) return;

    const userMessages = currentMessages.filter((m) => m.role === "user");
    if (userMessages.length === 0) return;

    const title = generateSmartTitle(currentMessages);
    const preview = generateConversationSummary(currentMessages);
    const conversationId = activeId || `conv-${Date.now()}`;
    const subject = "general";

    // Deduplication: skip if a very similar conversation was saved in the last 30s
    const isDuplicate = conversations.some(c => {
      if (c.id === conversationId) return false;
      const timeDiff = Date.now() - c.timestamp;
      if (timeDiff > 30_000) return false;
      return c.title.slice(0, 40) === title.slice(0, 40) && c.messageCount === currentMessages.length;
    });
    if (isDuplicate && !activeId) return;

    // Update local state immediately for responsiveness
    const newConv: Conversation = {
      id: conversationId,
      title,
      subject,
      timestamp: Date.now(),
      messageCount: currentMessages.length,
      preview,
    };

    setConversations(prev => {
      const idx = prev.findIndex(c => c.id === conversationId);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = newConv;
        return updated.sort((a, b) => b.timestamp - a.timestamp);
      }
      return [newConv, ...prev];
    });

    // Cache messages in memory
    cloudCacheRef.current.set(conversationId, [...currentMessages]);

    // Debounced cloud save (2s)
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      cloudSaveConversation(userEmail!, {
        id: conversationId,
        title,
        subject,
        timestamp: Date.now(),
        messageCount: currentMessages.length,
        preview,
        messages: currentMessages,
      }).then((ok) => {
        if (ok) setCloudStatus("synced");
      }).catch(() => {
        setCloudStatus("error");
      });
    }, 2000);

    setActiveId(conversationId);
  }

  function deleteConversation(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setConversations(prev => prev.filter(c => c.id !== id));
    cloudCacheRef.current.delete(id);

    if (userEmail) {
      cloudDeleteConversation(userEmail, id).catch(() => {});
    }

    if (activeId === id) {
      setActiveId(null);
      onNewChat?.();
    }
  }

  function clearAllConversations() {
    if (confirm("Delete all conversation history? This cannot be undone.")) {
      setConversations([]);
      cloudCacheRef.current.clear();
      setActiveId(null);
      if (userEmail) {
        cloudClearAll(userEmail).catch(() => {});
      }
    }
  }

  async function loadConversationMessages(conv: Conversation) {
    saveCurrentConversation();

    // Check in-memory cache first
    const cached = cloudCacheRef.current.get(conv.id);
    if (cached && cached.length > 0) {
      onLoadConversation?.(conv.id, cached);
      setActiveId(conv.id);
      setIsOpen(false);
      return;
    }

    // Fallback: reload from cloud
    if (userEmail) {
      try {
        const cloudData = await cloudLoadConversations(userEmail);
        const found = cloudData?.find(c => c.id === conv.id);
        if (found?.messages && found.messages.length > 0) {
          const hydrated: Message[] = found.messages.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            timestamp: new Date(m.timestamp),
            thinking: m.thinking || undefined,
            sources: m.sources || undefined,
            toolCalls: m.toolCalls || undefined,
            model: m.model || undefined,
            flowcharts: m.flowcharts as Message["flowcharts"],
            manimAnimations: m.manimAnimations as Message["manimAnimations"],
            generatedImages: m.generatedImages as Message["generatedImages"],
            flashcardSets: m.flashcardSets as Message["flashcardSets"],
            quizSets: m.quizSets as Message["quizSets"],
          }));
          cloudCacheRef.current.set(conv.id, hydrated);
          onLoadConversation?.(conv.id, hydrated);
        } else {
          onLoadConversation?.(conv.id, []);
        }
      } catch {
        onLoadConversation?.(conv.id, []);
      }
    } else {
      onLoadConversation?.(conv.id, []);
    }

    setActiveId(conv.id);
    setIsOpen(false);
  }

  const filteredConversations = searchQuery
    ? conversations.filter(
        (c) =>
          c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.preview.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : conversations;

  // Group by date
  const today = new Date().setHours(0, 0, 0, 0);
  const yesterday = today - 86400000;
  const weekAgo = today - 7 * 86400000;

  const grouped = {
    today: filteredConversations.filter((c) => c.timestamp >= today),
    yesterday: filteredConversations.filter((c) => c.timestamp >= yesterday && c.timestamp < today),
    thisWeek: filteredConversations.filter((c) => c.timestamp >= weekAgo && c.timestamp < yesterday),
    older: filteredConversations.filter((c) => c.timestamp < weekAgo),
  };

  return (
    <>
      {/* Toggle Button — rendered inline (not fixed), placed by parent layout */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`p-2 rounded-xl transition-all duration-200 shrink-0 ${
          isOpen
            ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
            : "hover:bg-glass-medium text-slate-400 hover:text-white border border-transparent"
        }`}
        title={isOpen ? "Close history" : "Chat history"}
      >
        <Icon name={isOpen ? "x" : "history"} className="w-4 h-4" />
      </button>

      {/* Sidebar */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60]"
            />

            {/* Panel */}
            <motion.div
              initial={{ x: -320 }}
              animate={{ x: 0 }}
              exit={{ x: -320 }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed left-0 top-0 bottom-0 w-80 glass-strong z-[70] flex flex-col"
            >
              {/* Header */}
              <div className="p-4 border-b border-glass-border">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <Icon name="history" className="w-5 h-5 text-blue-400" />
                    History
                    {isAuthenticated && (
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium uppercase tracking-wide ${
                        cloudStatus === "synced" ? "bg-green-500/15 text-green-400 border border-green-500/30" :
                        cloudStatus === "syncing" ? "bg-blue-500/15 text-blue-400 border border-blue-500/30" :
                        cloudStatus === "error" ? "bg-yellow-500/15 text-yellow-400 border border-yellow-500/30" :
                        "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                      }`}>
                        {cloudStatus === "synced" ? "☁️ Cloud" : cloudStatus === "syncing" ? "⟳ Syncing" : cloudStatus === "error" ? "⚠ Retry" : "☁️ Cloud"}
                      </span>
                    )}
                  </h2>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="p-1 hover:bg-glass-medium rounded-lg text-slate-400 hover:text-white transition-colors"
                  >
                    <Icon name="x" className="w-4 h-4" />
                  </button>
                </div>

                {/* Search */}
                <div className="relative">
                  <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search conversations..."
                    className="w-full pl-10 pr-3 py-2 glass-input rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none"
                  />
                </div>

                {/* New Chat Button */}
                <button
                  onClick={() => {
                    saveCurrentConversation(); // Save current before clearing
                    onNewChat?.();
                    setActiveId(null);
                    setIsOpen(false);
                  }}
                  className="w-full mt-3 px-3 py-2 btn-glass rounded-lg text-sm font-medium text-blue-400 hover:text-blue-300 transition-colors flex items-center justify-center gap-2"
                >
                  <Icon name="plus" className="w-4 h-4" />
                  New Chat
                </button>
              </div>

              {/* Conversations List */}
              <div className="flex-1 overflow-y-auto p-2">
                {/* Not authenticated — show sign-in prompt */}
                {!isAuthenticated ? (
                  <div className="text-center py-12 px-4">
                    <div className="w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mx-auto mb-4">
                      <Icon name="cloud" className="w-7 h-7 text-blue-400" />
                    </div>
                    <p className="text-sm font-medium text-slate-300 mb-1">Sign in to save history</p>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      Your conversations are stored securely in the cloud. Sign in with Google to access them across all your devices.
                    </p>
                  </div>
                ) : isLoadingHistory ? (
                  <div className="text-center py-12 px-4">
                    <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-400 rounded-full animate-spin mx-auto mb-3" />
                    <p className="text-sm text-slate-400">Loading history…</p>
                  </div>
                ) : filteredConversations.length === 0 ? (
                  <div className="text-center py-12 px-4">
                    <Icon name="message-square" className="w-12 h-12 mx-auto mb-3 text-slate-600" />
                    <p className="text-sm text-slate-400">
                      {searchQuery ? "No matching conversations" : "No conversations yet"}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      {searchQuery ? "Try a different search term" : "Start chatting to see your history here"}
                    </p>
                  </div>
                ) : (
                  <>
                    {Object.entries(grouped).map(([key, items]) => {
                      if (items.length === 0) return null;
                      const labels: Record<string, string> = {
                        today: "Today",
                        yesterday: "Yesterday",
                        thisWeek: "This Week",
                        older: "Older",
                      };
                      return (
                        <div key={key} className="mb-4">
                          <div className="px-2 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                            {labels[key]}
                          </div>
                          <div className="space-y-1">
                            {items.map((conv) => (
                              <button
                                key={conv.id}
                                onClick={() => loadConversationMessages(conv)}
                                className={`w-full text-left p-3 rounded-xl transition-all duration-150 group relative ${
                                  conv.id === activeId
                                    ? "bg-blue-500/10 border border-blue-500/25 shadow-sm shadow-blue-500/5"
                                    : "hover:bg-white/[0.04] border border-transparent hover:border-white/[0.06]"
                                }`}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1 min-w-0">
                                    <div className="text-[13px] font-semibold text-white/90 truncate mb-1 leading-snug">
                                      {conv.title}
                                    </div>
                                    <div className="text-[11px] text-slate-400 line-clamp-2 mb-1.5 leading-relaxed">
                                      {conv.preview}
                                    </div>
                                    <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                                      <span className="capitalize px-1.5 py-0.5 rounded-md bg-white/[0.06] text-slate-400 font-medium">
                                        {conv.subject}
                                      </span>
                                      <span className="text-slate-600">·</span>
                                      <span>{conv.messageCount} msgs</span>
                                      <span className="text-slate-600">·</span>
                                      <span>{formatTimeAgo(conv.timestamp)}</span>
                                    </div>
                                  </div>
                                  <button
                                    onClick={(e) => deleteConversation(conv.id, e)}
                                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-500/20 rounded-lg text-slate-500 hover:text-red-400 transition-all"
                                    title="Delete"
                                  >
                                    <Icon name="trash-2" className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>

              {/* Footer */}
              {conversations.length > 0 && isAuthenticated && (
                <div className="p-3 border-t border-glass-border">
                  <button
                    onClick={clearAllConversations}
                    className="w-full px-3 py-2 text-xs font-medium text-red-400/80 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    <Icon name="trash-2" className="w-3.5 h-3.5" />
                    Clear All History
                  </button>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
