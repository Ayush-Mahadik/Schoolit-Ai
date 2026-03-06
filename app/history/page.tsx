"use client";

import { useSession, signIn } from "next-auth/react";
import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { Icon } from "@/components/Icons";
import Link from "next/link";
import {
  cloudLoadConversations,
  cloudDeleteConversation,
  cloudClearAll,
  type CloudConversation,
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

export default function HistoryPage() {
  const { data: session, status: sessionStatus } = useSession();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [cloudStatus, setCloudStatus] = useState<"idle" | "syncing" | "synced" | "error">("idle");
  const [searchQuery, setSearchQuery] = useState("");
  const userEmail = session?.user?.email || null;
  const isAuthenticated = sessionStatus === "authenticated";

  const loadConversations = useCallback(async () => {
    if (!isAuthenticated || !userEmail) {
      setConversations([]);
      return;
    }

    try {
      setCloudStatus("syncing");
      setIsLoading(true);
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

        entries.sort((a, b) => b.timestamp - a.timestamp);
        setConversations(entries);
        setCloudStatus("synced");
      } else {
        setConversations([]);
        setCloudStatus("synced");
      }
    } catch (err) {
      console.warn("Failed to load conversations:", err);
      setCloudStatus("error");
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, userEmail]);

  useEffect(() => {
    if (sessionStatus !== "loading") {
      loadConversations();
    }
  }, [sessionStatus, loadConversations]);

  async function deleteConversation(id: string) {
    setConversations(prev => prev.filter(c => c.id !== id));
    if (userEmail) {
      cloudDeleteConversation(userEmail, id).catch(() => {});
    }
  }

  function clearAllConversations() {
    if (confirm("Delete all conversation history? This cannot be undone.")) {
      setConversations([]);
      if (userEmail) {
        cloudClearAll(userEmail).catch(() => {});
      }
    }
  }

  const filteredConversations = searchQuery
    ? conversations.filter(
        (c) =>
          c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.preview.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : conversations;

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
    <div className="min-h-screen bg-surface-0">
      {/* Header */}
      <header className="border-b border-glass-border glass-panel sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="p-2 hover:bg-glass-medium rounded-lg transition-colors">
              <Icon name="arrow-left" className="w-5 h-5 text-slate-400 hover:text-white" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-white">Chat History</h1>
              <p className="text-sm text-slate-400">All your conversations in one place</p>
            </div>
          </div>

          <div className="text-right">
            <span className={`text-xs px-2 py-1 rounded-full font-medium uppercase ${
              cloudStatus === "synced" ? "bg-green-500/15 text-green-400" :
              cloudStatus === "syncing" ? "bg-blue-500/15 text-blue-400" :
              cloudStatus === "error" ? "bg-yellow-500/15 text-yellow-400" :
              "bg-slate-500/15 text-slate-400"
            }`}>
              {cloudStatus === "synced" ? "☁️ Synced" : cloudStatus === "syncing" ? "⟳ Syncing" : "⚠ Error"}
            </span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {!isAuthenticated ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-20"
          >
            <div className="w-20 h-20 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mx-auto mb-6">
              <Icon name="cloud" className="w-10 h-10 text-blue-400" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Sign in to view history</h2>
            <p className="text-slate-400 mb-8 max-w-sm mx-auto">
              Your conversations are stored securely in the cloud. Sign in with Google to access them across all your devices.
            </p>
            <button
              onClick={() => signIn("google")}
              className="inline-flex items-center gap-3 px-6 py-3 bg-white text-gray-800 font-semibold rounded-xl hover:bg-gray-100 transition-colors"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
              Continue with Google
            </button>
          </motion.div>
        ) : isLoading ? (
          <div className="text-center py-20">
            <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-400 rounded-full animate-spin mx-auto mb-4" />
            <p className="text-slate-400">Loading your conversations…</p>
          </div>
        ) : conversations.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-20"
          >
            <Icon name="message-square" className="w-16 h-16 mx-auto mb-4 text-slate-600" />
            <h2 className="text-xl font-bold text-white mb-2">No conversations yet</h2>
            <p className="text-slate-400 mb-8">
              {searchQuery ? "No conversations match your search" : "Start a new chat to create your first conversation"}
            </p>
            {!searchQuery && (
              <Link
                href="/"
                className="inline-flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
              >
                <Icon name="plus" className="w-4 h-4" />
                New Chat
              </Link>
            )}
          </motion.div>
        ) : (
          <>
            {/* Search */}
            <div className="mb-8">
              <div className="relative max-w-md">
                <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search conversations…"
                  className="w-full pl-10 pr-4 py-2 glass-input rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>
            </div>

            {/* Conversations by date */}
            <div className="space-y-8">
              {Object.entries(grouped).map(([key, items]) => {
                if (items.length === 0) return null;
                const labels: Record<string, string> = {
                  today: "Today",
                  yesterday: "Yesterday",
                  thisWeek: "This Week",
                  older: "Older",
                };
                return (
                  <div key={key}>
                    <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4 px-1">
                      {labels[key]}
                    </h2>
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                      {items.map((conv) => (
                        <motion.div
                          key={conv.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="group relative p-4 rounded-xl border border-glass-border hover:border-blue-500/30 bg-glass-strong hover:bg-white/[0.08] transition-all duration-200"
                        >
                          <div className="flex items-start justify-between gap-2 mb-3">
                            <div className="flex-1 min-w-0">
                              <h3 className="text-sm font-semibold text-white/90 truncate mb-1">
                                {conv.title}
                              </h3>
                              <p className="text-xs text-slate-400 line-clamp-2 mb-2">
                                {conv.preview}
                              </p>
                            </div>
                            <button
                              onClick={() => deleteConversation(conv.id)}
                              className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-500/20 rounded-lg text-slate-500 hover:text-red-400 transition-all"
                              title="Delete"
                            >
                              <Icon name="trash-2" className="w-4 h-4" />
                            </button>
                          </div>

                          <div className="flex items-center gap-2 text-[10px] text-slate-500 flex-wrap">
                            <span className="px-2 py-1 rounded bg-white/[0.06] text-slate-400 font-medium capitalize">
                              {conv.subject}
                            </span>
                            <span>·</span>
                            <span>{conv.messageCount} messages</span>
                            <span>·</span>
                            <span>{formatTimeAgo(conv.timestamp)}</span>
                          </div>

                          <Link
                            href={`/?conversation=${conv.id}`}
                            className="absolute inset-0 rounded-xl"
                            title="Open conversation"
                          />
                        </motion.div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Clear All Button */}
            {conversations.length > 0 && (
              <div className="mt-12 pt-8 border-t border-glass-border">
                <button
                  onClick={clearAllConversations}
                  className="px-4 py-2 text-sm font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
                >
                  <Icon name="trash-2" className="w-4 h-4 inline mr-2" />
                  Clear All History
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
