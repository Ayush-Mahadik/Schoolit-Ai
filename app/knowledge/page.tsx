"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { Upload, Trash2, Search, FileText } from "@/components/Icons";

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  Types                                                              */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
interface KnowledgeSource {
  source: string;
  source_name: string;
  count: number;
}

interface KnowledgeEntry {
  id: string;
  source: string;
  source_name: string;
  sender: string | null;
  content: string;
  created_at: string;
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  Page                                                               */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
export default function KnowledgeBasePage() {
  const { data: session, status } = useSession();

  /* ── State ────────────────────────────────────────────────────────── */
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [searchResults, setSearchResults] = useState<KnowledgeEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [tab, setTab] = useState<"sources" | "import" | "search">("sources");
  const [importType, setImportType] = useState<"whatsapp" | "manual">("whatsapp");
  const [manualTitle, setManualTitle] = useState("");
  const [manualContent, setManualContent] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ── Load sources on mount ────────────────────────────────────────── */
  const loadSources = useCallback(async () => {
    try {
      const res = await fetch("/api/knowledge?list=sources");
      if (res.ok) {
        const data = await res.json();
        setSources(data.sources || []);
      }
    } catch {
      // silently fail
    }
  }, []);

  useEffect(() => {
    if (status === "authenticated") loadSources();
  }, [status, loadSources]);

  /* ── Import WhatsApp file ─────────────────────────────────────────── */
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setImportError(null);
    setImportStatus("Reading file...");

    try {
      const text = await file.text();

      if (!text.trim()) {
        setImportError("File is empty.");
        setIsImporting(false);
        return;
      }

      setImportStatus("Uploading and parsing...");
      const res = await fetch("/api/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "whatsapp",
          source_name: file.name.replace(/\.txt$/i, ""),
          content: text,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setImportStatus(
          `✅ Imported ${data.messages_parsed} messages → ${data.entries_stored} knowledge entries from "${data.source_name}"`
        );
        loadSources();
      } else {
        setImportError(data.message || "Failed to import.");
      }
    } catch (err) {
      setImportError("Failed to read or upload file.");
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  /* ── Import manual notes ──────────────────────────────────────────── */
  const handleManualImport = async () => {
    if (!manualContent.trim()) return;

    setIsImporting(true);
    setImportError(null);
    setImportStatus("Storing notes...");

    try {
      const res = await fetch("/api/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "manual",
          source_name: manualTitle || "Untitled Notes",
          content: manualContent,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setImportStatus(`✅ Stored ${data.entries_stored} knowledge entries as "${data.source_name}"`);
        setManualTitle("");
        setManualContent("");
        loadSources();
      } else {
        setImportError(data.message || "Failed to store notes.");
      }
    } catch {
      setImportError("Failed to store notes.");
    } finally {
      setIsImporting(false);
    }
  };

  /* ── Search ───────────────────────────────────────────────────────── */
  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);

    try {
      const res = await fetch(`/api/knowledge?q=${encodeURIComponent(searchQuery)}&limit=25`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.results || []);
      }
    } catch {
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  /* ── Delete source ────────────────────────────────────────────────── */
  const handleDeleteSource = async (sourceName: string) => {
    try {
      const res = await fetch(`/api/knowledge?source=${encodeURIComponent(sourceName)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        loadSources();
        setDeleteConfirm(null);
      }
    } catch {
      // silently fail
    }
  };

  /* ── Delete all ───────────────────────────────────────────────────── */
  const handleDeleteAll = async () => {
    try {
      const res = await fetch(`/api/knowledge?all=true`, { method: "DELETE" });
      if (res.ok) {
        setSources([]);
        setDeleteConfirm(null);
      }
    } catch {}
  };

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  /*  Render                                                           */
  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

  if (status !== "authenticated") {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-surface-0 text-white">
        <div className="text-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-blue-500/20 flex items-center justify-center mx-auto">
            <FileText className="w-7 h-7 text-blue-400" />
          </div>
          <h1 className="text-xl font-bold">Knowledge Base</h1>
          <p className="text-sm text-slate-400">Sign in to manage your knowledge base.</p>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300 mt-2"
          >
            ← Back to chat
          </Link>
        </div>
      </div>
    );
  }

  const totalEntries = sources.reduce((sum, s) => sum + s.count, 0);

  return (
    <div className="flex h-[100dvh] flex-col bg-surface-0 text-white">
      {/* ── Header ────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-4 sm:px-6 h-14 border-b border-surface-3 shrink-0">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="p-2 hover:bg-surface-3 rounded-lg transition-colors text-slate-400 hover:text-white"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </Link>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 flex items-center justify-center">
              <FileText className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-sm font-bold">Knowledge Base</h1>
              <p className="text-[10px] text-slate-500">
                {totalEntries} entries · {sources.length} sources
              </p>
            </div>
          </div>
        </div>

        {sources.length > 0 && (
          <button
            onClick={() =>
              deleteConfirm === "__all__" ? handleDeleteAll() : setDeleteConfirm("__all__")
            }
            className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
              deleteConfirm === "__all__"
                ? "bg-red-500 text-white"
                : "bg-surface-3 text-slate-400 hover:text-red-400"
            }`}
          >
            {deleteConfirm === "__all__" ? "Confirm Delete All" : "Clear All"}
          </button>
        )}
      </header>

      {/* ── Tabs ──────────────────────────────────────────────────── */}
      <div className="flex border-b border-surface-3 px-4 sm:px-6">
        {(["sources", "import", "search"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors capitalize ${
              tab === t
                ? "border-blue-500 text-white"
                : "border-transparent text-slate-500 hover:text-slate-300"
            }`}
          >
            {t === "sources" ? `Sources (${sources.length})` : t}
          </button>
        ))}
      </div>

      {/* ── Content ───────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
        {/* ── Sources Tab ─────────────────────────────────────────── */}
        {tab === "sources" && (
          <div className="space-y-3 max-w-2xl mx-auto">
            {sources.length === 0 ? (
              <div className="text-center py-16 space-y-3">
                <div className="w-16 h-16 rounded-2xl bg-surface-3 flex items-center justify-center mx-auto">
                  <FileText className="w-8 h-8 text-slate-600" />
                </div>
                <h2 className="text-lg font-semibold text-slate-300">No knowledge imported yet</h2>
                <p className="text-sm text-slate-500 max-w-sm mx-auto">
                  Import WhatsApp chat exports or add notes to give the AI access to your group
                  discussions, study materials, and more.
                </p>
                <button
                  onClick={() => setTab("import")}
                  className="mt-4 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm rounded-lg transition-colors inline-flex items-center gap-2"
                >
                  <Upload className="w-4 h-4" />
                  Import Data
                </button>
              </div>
            ) : (
              sources.map((s) => (
                <motion.div
                  key={`${s.source}::${s.source_name}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center justify-between p-3 rounded-xl bg-surface-2 border border-surface-3 hover:border-surface-4 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                        s.source === "whatsapp"
                          ? "bg-green-500/15 text-green-400"
                          : s.source === "document"
                          ? "bg-amber-500/15 text-amber-400"
                          : "bg-blue-500/15 text-blue-400"
                      }`}
                    >
                      {s.source === "whatsapp" ? (
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                        </svg>
                      ) : (
                        <FileText className="w-4 h-4" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white truncate">{s.source_name}</p>
                      <p className="text-[11px] text-slate-500">
                        {s.source} · {s.count} entries
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    <button
                      onClick={() => {
                        setSearchQuery(s.source_name);
                        setTab("search");
                      }}
                      className="p-1.5 hover:bg-surface-4 rounded-lg text-slate-500 hover:text-blue-400 transition-colors"
                      title="Search this source"
                    >
                      <Search className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() =>
                        deleteConfirm === s.source_name
                          ? handleDeleteSource(s.source_name)
                          : setDeleteConfirm(s.source_name)
                      }
                      className={`p-1.5 rounded-lg transition-colors ${
                        deleteConfirm === s.source_name
                          ? "bg-red-500/20 text-red-400"
                          : "hover:bg-surface-4 text-slate-500 hover:text-red-400"
                      }`}
                      title={deleteConfirm === s.source_name ? "Click again to confirm" : "Delete"}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </motion.div>
              ))
            )}
          </div>
        )}

        {/* ── Import Tab ──────────────────────────────────────────── */}
        {tab === "import" && (
          <div className="max-w-2xl mx-auto space-y-6">
            {/* Import type toggle */}
            <div className="flex gap-2">
              <button
                onClick={() => setImportType("whatsapp")}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  importType === "whatsapp"
                    ? "bg-green-500/15 text-green-400 border border-green-500/30"
                    : "bg-surface-2 text-slate-400 border border-surface-3"
                }`}
              >
                📱 WhatsApp Export
              </button>
              <button
                onClick={() => setImportType("manual")}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  importType === "manual"
                    ? "bg-blue-500/15 text-blue-400 border border-blue-500/30"
                    : "bg-surface-2 text-slate-400 border border-surface-3"
                }`}
              >
                📝 Notes / Text
              </button>
            </div>

            {importType === "whatsapp" ? (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-surface-2 border border-surface-3 space-y-3">
                  <h3 className="text-sm font-semibold text-white">Import WhatsApp Chat Export</h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    1. Open the WhatsApp group/chat<br />
                    2. Tap ⋮ → <strong>More</strong> → <strong>Export chat</strong><br />
                    3. Choose <strong>Without media</strong><br />
                    4. Save the <code className="text-blue-400">.txt</code> file and upload it below
                  </p>

                  <div className="flex items-center gap-3 mt-3">
                    <label className="flex-1 cursor-pointer">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".txt,.text"
                        onChange={handleFileUpload}
                        className="hidden"
                        disabled={isImporting}
                      />
                      <div className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-surface-4 hover:border-green-500/40 bg-surface-3/30 hover:bg-green-500/5 transition-colors text-sm text-slate-400 hover:text-green-400">
                        <Upload className="w-4 h-4" />
                        {isImporting ? "Importing..." : "Choose .txt file"}
                      </div>
                    </label>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-surface-2 border border-surface-3 space-y-3">
                  <h3 className="text-sm font-semibold text-white">Add Notes or Documents</h3>
                  <p className="text-xs text-slate-400">
                    Paste study notes, textbook excerpts, or any text you want the AI to remember.
                  </p>

                  <input
                    value={manualTitle}
                    onChange={(e) => setManualTitle(e.target.value)}
                    placeholder="Title (e.g. Physics Chapter 3 Notes)"
                    className="w-full px-3 py-2 rounded-lg bg-surface-3 border border-surface-4 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50"
                  />

                  <textarea
                    value={manualContent}
                    onChange={(e) => setManualContent(e.target.value)}
                    placeholder="Paste your notes, text, or content here..."
                    rows={10}
                    className="w-full px-3 py-2 rounded-lg bg-surface-3 border border-surface-4 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50 resize-none font-mono"
                  />

                  <button
                    onClick={handleManualImport}
                    disabled={!manualContent.trim() || isImporting}
                    className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm rounded-lg transition-colors flex items-center gap-2"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    {isImporting ? "Storing..." : "Store Knowledge"}
                  </button>
                </div>
              </div>
            )}

            {/* Status/Error messages */}
            <AnimatePresence>
              {(importStatus || importError) && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className={`p-3 rounded-xl text-sm ${
                    importError
                      ? "bg-red-500/10 text-red-400 border border-red-500/20"
                      : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                  }`}
                >
                  {importError || importStatus}
                  <button
                    onClick={() => {
                      setImportStatus(null);
                      setImportError(null);
                    }}
                    className="ml-2 text-xs opacity-60 hover:opacity-100"
                  >
                    ✕
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* ── Search Tab ──────────────────────────────────────────── */}
        {tab === "search" && (
          <div className="max-w-2xl mx-auto space-y-4">
            <div className="flex gap-2">
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="Search your knowledge base..."
                className="flex-1 px-3 py-2.5 rounded-lg bg-surface-2 border border-surface-3 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50"
                autoFocus
              />
              <button
                onClick={handleSearch}
                disabled={isSearching || !searchQuery.trim()}
                className="px-4 py-2.5 bg-blue-500 hover:bg-blue-600 disabled:opacity-40 text-white text-sm rounded-lg transition-colors flex items-center gap-1.5"
              >
                <Search className="w-3.5 h-3.5" />
                {isSearching ? "..." : "Search"}
              </button>
            </div>

            {searchResults.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs text-slate-500">{searchResults.length} results</p>
                {searchResults.map((entry) => (
                  <div
                    key={entry.id}
                    className="p-3 rounded-xl bg-surface-2 border border-surface-3 space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded ${
                            entry.source === "whatsapp"
                              ? "bg-green-500/15 text-green-400"
                              : "bg-blue-500/15 text-blue-400"
                          }`}
                        >
                          {entry.source}
                        </span>
                        <span className="text-xs text-slate-500">{entry.source_name}</span>
                        {entry.sender && (
                          <span className="text-xs text-slate-400 font-medium">
                            — {entry.sender}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-600">
                        {new Date(entry.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 whitespace-pre-wrap line-clamp-6">
                      {entry.content}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              searchQuery && !isSearching && (
                <p className="text-center text-sm text-slate-500 py-8">
                  No results found for &quot;{searchQuery}&quot;
                </p>
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}
