"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useSession } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import { Icon } from "@/components/Icons";
import { isCloudEnabled } from "@/lib/supabase";
import {
  cloudSaveConversation,
  cloudLoadConversations,
  cloudDeleteConversation,
  cloudClearAll,
} from "@/lib/cloud-storage";
import type { Message } from "@/lib/types";

interface Conversation {
  id: string;
  title: string;
  subject: string;
  timestamp: number;
  messageCount: number;
  preview: string;
}

interface ConversationHistoryProps {
  currentMessages: Message[];
  onLoadConversation?: (id: string, messages: Message[]) => void;
  onNewChat?: () => void;
}

/**
 * Grok-style conversation history sidebar with panels and navigation
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
  const [cloudStatus, setCloudStatus] = useState<"idle" | "syncing" | "synced" | "offline">("idle");
  const { data: session } = useSession();
  const userEmail = session?.user?.email || null;
  const cloudEnabled = isCloudEnabled() && !!userEmail;
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load conversations from localStorage
  useEffect(() => {
    loadConversations();
  }, []);

  // Auto-save current conversation
  useEffect(() => {
    if (currentMessages.length > 0) {
      saveCurrentConversation();
    }
  }, [currentMessages]);

  // Load from localStorage first, then try cloud and merge
  async function loadConversations() {
    // 1. Load from localStorage (fast, always available)
    let localConversations: Conversation[] = [];
    try {
      const stored = localStorage.getItem("schoolit_conversations");
      if (stored) {
        localConversations = JSON.parse(stored) as Conversation[];
      }
    } catch { /* ignore */ }

    setConversations(localConversations.sort((a, b) => b.timestamp - a.timestamp));

    // 2. Try cloud sync (async, merges with local)
    if (cloudEnabled && userEmail) {
      try {
        setCloudStatus("syncing");
        const cloudData = await cloudLoadConversations(userEmail);
        if (cloudData && cloudData.length > 0) {
          // Merge: cloud data takes priority for newer entries
          const merged = new Map<string, Conversation>();
          for (const local of localConversations) {
            merged.set(local.id, local);
          }
          for (const cloud of cloudData) {
            const existing = merged.get(cloud.id);
            if (!existing || cloud.timestamp > existing.timestamp) {
              merged.set(cloud.id, {
                id: cloud.id,
                title: cloud.title,
                subject: cloud.subject,
                timestamp: cloud.timestamp,
                messageCount: cloud.message_count,
                preview: cloud.preview,
              });
              // Also save cloud messages to localStorage for offline access
              if (cloud.messages && cloud.messages.length > 0) {
                try {
                  const msgJson = JSON.stringify(cloud.messages);
                  if (msgJson.length < 500_000) {
                    localStorage.setItem(`schoolit_msgs_${cloud.id}`, msgJson);
                  }
                } catch { /* ignore */ }
              }
            }
          }
          const mergedList = Array.from(merged.values()).sort((a, b) => b.timestamp - a.timestamp);
          setConversations(mergedList);
          localStorage.setItem("schoolit_conversations", JSON.stringify(mergedList));
          setCloudStatus("synced");
        } else {
          setCloudStatus("synced");
        }
      } catch {
        setCloudStatus("offline");
      }
    }
  }

  function saveCurrentConversation() {
    if (currentMessages.length === 0) return;

    const userMessages = currentMessages.filter((m) => m.role === "user");
    if (userMessages.length === 0) return;

    const firstUserMsg = userMessages[0].content;
    const title = firstUserMsg.slice(0, 60) + (firstUserMsg.length > 60 ? "..." : "");
    const preview = firstUserMsg.slice(0, 120);

    const conversationId = activeId || `conv-${Date.now()}`;
    const subject = (currentMessages[0] as { subject?: string }).subject || "general";

    const newConv: Conversation = {
      id: conversationId,
      title,
      subject,
      timestamp: Date.now(),
      messageCount: currentMessages.length,
      preview,
    };

    const stored = localStorage.getItem("schoolit_conversations");
    let existing: Conversation[] = [];
    try {
      if (stored) existing = JSON.parse(stored);
    } catch {
      // Ignore
    }

    // Update or add
    const idx = existing.findIndex((c) => c.id === conversationId);
    if (idx >= 0) {
      existing[idx] = newConv;
    } else {
      existing.unshift(newConv);
    }

    // Keep max 50 conversations
    if (existing.length > 50) {
      // Also clean up message storage for removed conversations
      const removedIds = existing.slice(50).map((c) => c.id);
      for (const rid of removedIds) {
        localStorage.removeItem(`schoolit_msgs_${rid}`);
      }
      existing = existing.slice(0, 50);
    }

    localStorage.setItem("schoolit_conversations", JSON.stringify(existing));

    // Save actual messages for this conversation
    try {
      const serializableMessages = currentMessages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: m.timestamp instanceof Date ? m.timestamp.toISOString() : m.timestamp,
        thinking: m.thinking || undefined,
        sources: m.sources || undefined,
        toolCalls: m.toolCalls || undefined,
        model: m.model || undefined,
        flowcharts: m.flowcharts || undefined,
        manimAnimations: m.manimAnimations || undefined,
        generatedImages: m.generatedImages || undefined,
        flashcardSets: m.flashcardSets || undefined,
        quizSets: m.quizSets || undefined,
      }));
      const msgJson = JSON.stringify(serializableMessages);
      // Only save if under 500KB per conversation
      if (msgJson.length < 500_000) {
        localStorage.setItem(`schoolit_msgs_${conversationId}`, msgJson);
      }

      // Cloud sync — debounced to avoid excessive writes
      if (cloudEnabled && userEmail) {
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
          }).catch(() => {});
        }, 2000); // Debounce 2 seconds
      }
    } catch {
      // localStorage might be full — ignore
    }

    setConversations(existing);
    setActiveId(conversationId);
  }

  function deleteConversation(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    const updated = conversations.filter((c) => c.id !== id);
    localStorage.setItem("schoolit_conversations", JSON.stringify(updated));
    localStorage.removeItem(`schoolit_msgs_${id}`);
    // Also delete from cloud (fire-and-forget)
    if (cloudEnabled && userEmail) {
      cloudDeleteConversation(userEmail, id).catch(() => {});
    }
    setConversations(updated);
    if (activeId === id) {
      setActiveId(null);
      onNewChat?.();
    }
  }

  function clearAllConversations() {
    if (confirm("Delete all conversation history? This cannot be undone.")) {
      // Clean up all stored messages
      for (const conv of conversations) {
        localStorage.removeItem(`schoolit_msgs_${conv.id}`);
      }
      localStorage.removeItem("schoolit_conversations");
      // Also clear from cloud (fire-and-forget)
      if (cloudEnabled && userEmail) {
        cloudClearAll(userEmail).catch(() => {});
      }
      setConversations([]);
      setActiveId(null);
    }
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
            : "hover:bg-surface-3 text-slate-400 hover:text-white border border-transparent"
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
              className="fixed left-0 top-0 bottom-0 w-80 bg-surface-1 border-r border-surface-4 z-[70] flex flex-col"
            >
              {/* Header */}
              <div className="p-4 border-b border-surface-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <Icon name="history" className="w-5 h-5 text-blue-400" />
                    History
                    {cloudEnabled && (
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium uppercase tracking-wide ${
                        cloudStatus === "synced" ? "bg-green-500/15 text-green-400 border border-green-500/30" :
                        cloudStatus === "syncing" ? "bg-blue-500/15 text-blue-400 border border-blue-500/30" :
                        "bg-yellow-500/15 text-yellow-400 border border-yellow-500/30"
                      }`}>
                        {cloudStatus === "synced" ? "☁️ Cloud" : cloudStatus === "syncing" ? "⟳ Syncing" : "⚠ Offline"}
                      </span>
                    )}
                  </h2>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="p-1 hover:bg-surface-3 rounded-lg text-slate-500 hover:text-white transition-colors"
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
                    className="w-full pl-10 pr-3 py-2 bg-surface-2 border border-surface-4 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50"
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
                  className="w-full mt-3 px-3 py-2 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 rounded-lg text-sm font-medium text-blue-400 hover:text-blue-300 transition-colors flex items-center justify-center gap-2"
                >
                  <Icon name="plus" className="w-4 h-4" />
                  New Chat
                </button>
              </div>

              {/* Conversations List */}
              <div className="flex-1 overflow-y-auto p-2">
                {filteredConversations.length === 0 ? (
                  <div className="text-center py-12 px-4">
                    <Icon name="message-square" className="w-12 h-12 mx-auto mb-3 text-slate-600" />
                    <p className="text-sm text-slate-500">
                      {searchQuery ? "No matching conversations" : "No conversations yet"}
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
                          <div className="px-2 py-1 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                            {labels[key]}
                          </div>
                          <div className="space-y-1">
                            {items.map((conv) => (
                              <button
                                key={conv.id}
                                onClick={() => {
                                  // Save current conversation BEFORE switching to prevent data loss
                                  saveCurrentConversation();
                                  // Load actual messages from localStorage
                                  try {
                                    const storedMsgs = localStorage.getItem(`schoolit_msgs_${conv.id}`);
                                    if (storedMsgs) {
                                      const parsed = JSON.parse(storedMsgs) as Message[];
                                      // Restore Date objects from ISO strings
                                      const restored = parsed.map((m) => ({
                                        ...m,
                                        timestamp: new Date(m.timestamp),
                                      }));
                                      onLoadConversation?.(conv.id, restored);
                                    } else {
                                      onLoadConversation?.(conv.id, []);
                                    }
                                  } catch {
                                    onLoadConversation?.(conv.id, []);
                                  }
                                  setActiveId(conv.id);
                                  setIsOpen(false);
                                }}
                                className={`w-full text-left p-3 rounded-lg transition-all duration-150 group relative ${
                                  conv.id === activeId
                                    ? "bg-blue-500/10 border border-blue-500/30"
                                    : "hover:bg-surface-3 border border-transparent"
                                }`}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium text-white truncate mb-1">
                                      {conv.title}
                                    </div>
                                    <div className="text-xs text-slate-500 truncate mb-1">
                                      {conv.preview}
                                    </div>
                                    <div className="flex items-center gap-2 text-xs text-slate-600">
                                      <span className="capitalize">{conv.subject}</span>
                                      <span>•</span>
                                      <span>{conv.messageCount} msgs</span>
                                    </div>
                                  </div>
                                  <button
                                    onClick={(e) => deleteConversation(conv.id, e)}
                                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-500/20 rounded text-slate-500 hover:text-red-400 transition-all"
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
              {conversations.length > 0 && (
                <div className="p-3 border-t border-surface-4">
                  <button
                    onClick={clearAllConversations}
                    className="w-full px-3 py-2 text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors flex items-center justify-center gap-2"
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
