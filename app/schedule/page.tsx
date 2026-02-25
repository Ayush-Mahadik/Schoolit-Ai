"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { Icon, Calendar, Plus, Trash2, Check, Clock } from "@/components/Icons";
import type { ScheduleItem } from "@/lib/types";

const TYPE_COLORS: Record<string, string> = {
  study: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  exam: "bg-red-500/15 text-red-400 border-red-500/20",
  homework: "bg-amber-500/15 text-amber-400 border-amber-500/20",
  class: "bg-green-500/15 text-green-400 border-green-500/20",
  other: "bg-slate-500/15 text-slate-400 border-slate-500/20",
};

const TYPE_ICON_NAMES: Record<string, string> = {
  study: "book-open",
  exam: "file-text",
  homework: "file-text",
  class: "graduation-cap",
  other: "clock",
};

function getStoredSchedule(): ScheduleItem[] {
  if (typeof window === "undefined") return [];
  try {
    const data = localStorage.getItem("schoolit-schedule");
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function saveScheduleLocal(items: ScheduleItem[]) {
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem("schoolit-schedule", JSON.stringify(items));
    } catch { /* ignore */ }
  }
}

// Cloud sync helpers
async function cloudLoadSchedule(): Promise<ScheduleItem[] | null> {
  try {
    const res = await fetch("/api/schedule");
    if (!res.ok) return null;
    const data = await res.json();
    return data.items || null;
  } catch {
    return null;
  }
}

async function cloudSaveSchedule(items: ScheduleItem[]): Promise<boolean> {
  try {
    const res = await fetch("/api/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export default function SchedulePage() {
  const { data: session } = useSession();
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "synced" | "error">("idle");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const [form, setForm] = useState({
    title: "",
    subject: "general",
    startTime: "",
    endTime: "",
    type: "study" as ScheduleItem["type"],
  });

  // Load from localStorage first, then try cloud
  useEffect(() => {
    const localItems = getStoredSchedule();
    setItems(localItems);

    // If logged in, try to load from cloud
    if (session?.user?.email) {
      cloudLoadSchedule().then((cloudItems) => {
        if (cloudItems && cloudItems.length > 0) {
          // Merge: cloud wins for items with same ID, keep unique local items
          const cloudMap = new Map(cloudItems.map(i => [i.id, i]));
          const merged = [...cloudItems];
          for (const local of localItems) {
            if (!cloudMap.has(local.id)) merged.push(local);
          }
          merged.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
          setItems(merged);
          saveScheduleLocal(merged);
          setSyncStatus("synced");
        } else if (localItems.length > 0) {
          // Cloud empty but local has data — push local to cloud
          cloudSaveSchedule(localItems).then(ok => setSyncStatus(ok ? "synced" : "idle"));
        }
      });
    }
  }, [session]);

  // Debounced cloud save
  const saveToCloud = useCallback((updatedItems: ScheduleItem[]) => {
    saveScheduleLocal(updatedItems);
    if (!session?.user?.email) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setSyncStatus("syncing");
    saveTimerRef.current = setTimeout(() => {
      cloudSaveSchedule(updatedItems).then(ok => setSyncStatus(ok ? "synced" : "error"));
    }, 1500);
  }, [session]);

  const handleAdd = () => {
    if (!form.title || !form.startTime) return;
    const newItem: ScheduleItem = {
      id: `sch-${Date.now()}`,
      title: form.title,
      subject: form.subject,
      startTime: form.startTime,
      endTime: form.endTime || form.startTime,
      type: form.type,
      completed: false,
    };
    const updated = [...items, newItem].sort(
      (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    );
    setItems(updated);
    saveToCloud(updated);
    setForm({ title: "", subject: "general", startTime: "", endTime: "", type: "study" });
    setShowForm(false);
  };

  const toggleComplete = (id: string) => {
    const updated = items.map((i) =>
      i.id === id ? { ...i, completed: !i.completed } : i
    );
    setItems(updated);
    saveToCloud(updated);
  };

  const deleteItem = (id: string) => {
    const updated = items.filter((i) => i.id !== id);
    setItems(updated);
    saveToCloud(updated);
  };

  const today = new Date().toISOString().split("T")[0];
  const todayItems = items.filter((i) => i.startTime.startsWith(today));
  const upcomingItems = items.filter(
    (i) => !i.startTime.startsWith(today) && new Date(i.startTime) >= new Date()
  );
  const pastItems = items.filter(
    (i) => !i.startTime.startsWith(today) && new Date(i.startTime) < new Date()
  );

  const stats = {
    total: items.length,
    completed: items.filter((i) => i.completed).length,
    pending: items.filter((i) => !i.completed).length,
    todayCount: todayItems.length,
  };

  return (
    <div className="min-h-screen bg-surface-0">
      {/* Header */}
      <header className="border-b border-surface-3 bg-surface-0 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="p-2 hover:bg-surface-3 rounded-lg transition-colors text-slate-400 hover:text-white"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </Link>
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-brand-400" />
              <h1 className="text-base font-semibold text-white">Schedule</h1>
              {syncStatus === "syncing" && (
                <span className="text-xs text-slate-500 animate-pulse">Saving…</span>
              )}
              {syncStatus === "synced" && (
                <span className="text-xs text-green-500">✓ Synced</span>
              )}
              {syncStatus === "error" && (
                <span className="text-xs text-red-400">Sync failed</span>
              )}
            </div>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-400 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
          >
            {showForm ? (
              <>
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
                Cancel
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                Add Task
              </>
            )}
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { label: "Total", value: stats.total, color: "text-slate-300" },
            { label: "Today", value: stats.todayCount, color: "text-brand-400" },
            { label: "Pending", value: stats.pending, color: "text-amber-400" },
            { label: "Completed", value: stats.completed, color: "text-green-400" },
          ].map((stat) => (
            <div key={stat.label} className="bg-surface-2 rounded-xl border border-surface-3 p-4">
              <p className="text-xs text-slate-500 mb-1">{stat.label}</p>
              <p className={`text-2xl font-semibold ${stat.color}`}>{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Add Task Form */}
        <AnimatePresence>
          {showForm && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden mb-6"
            >
              <div className="bg-surface-2 rounded-xl p-5 border border-surface-3 space-y-3">
                <h3 className="text-sm font-medium text-white">New Task</h3>
                <input
                  type="text"
                  placeholder="Task title..."
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className="w-full bg-surface-3 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">Start</label>
                    <input
                      type="datetime-local"
                      value={form.startTime}
                      onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
                      className="w-full bg-surface-3 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-brand-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">End</label>
                    <input
                      type="datetime-local"
                      value={form.endTime}
                      onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
                      className="w-full bg-surface-3 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-brand-500"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">Type</label>
                    <select
                      value={form.type}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, type: e.target.value as ScheduleItem["type"] }))
                      }
                      className="w-full bg-surface-3 rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
                    >
                      <option value="study">Study</option>
                      <option value="exam">Exam</option>
                      <option value="homework">Homework</option>
                      <option value="class">Class</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">Subject</label>
                    <select
                      value={form.subject}
                      onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                      className="w-full bg-surface-3 rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
                    >
                      <option value="math">Math</option>
                      <option value="physics">Physics</option>
                      <option value="chemistry">Chemistry</option>
                      <option value="biology">Biology</option>
                      <option value="cs">CS</option>
                      <option value="english">English</option>
                      <option value="general">General</option>
                    </select>
                  </div>
                </div>
                <button
                  onClick={handleAdd}
                  disabled={!form.title || !form.startTime}
                  className="w-full py-2.5 bg-blue-500 hover:bg-blue-400 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Add to Schedule
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Schedule Sections */}
        <div className="space-y-6">
          {todayItems.length > 0 && (
            <ScheduleSection
              title="Today"
              items={todayItems}
              onToggle={toggleComplete}
              onDelete={deleteItem}
            />
          )}
          {upcomingItems.length > 0 && (
            <ScheduleSection
              title="Upcoming"
              items={upcomingItems}
              onToggle={toggleComplete}
              onDelete={deleteItem}
            />
          )}
          {pastItems.length > 0 && (
            <ScheduleSection
              title="Past"
              items={pastItems}
              onToggle={toggleComplete}
              onDelete={deleteItem}
            />
          )}
          {items.length === 0 && (
            <div className="text-center py-16">
              <Calendar className="w-12 h-12 text-slate-700 mx-auto" />
              <p className="text-base text-slate-400 mt-4">No tasks yet</p>
              <p className="text-sm text-slate-600 mt-1">
                Add study sessions, exam dates, and deadlines to stay organized.
              </p>
              <button
                onClick={() => setShowForm(true)}
                className="mt-4 px-6 py-2.5 bg-surface-3 hover:bg-surface-4 text-white text-sm rounded-lg transition-colors inline-flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Add Your First Task
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function ScheduleSection({
  title,
  items,
  onToggle,
  onDelete,
}: {
  title: string;
  items: ScheduleItem[];
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div>
      <h2 className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-3">
        {title} <span className="text-slate-600">({items.length})</span>
      </h2>
      <div className="space-y-2">
        {items.map((item) => (
          <motion.div
            key={item.id}
            layout
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex items-start gap-3 p-4 rounded-xl border transition-all ${
              item.completed
                ? "bg-surface-1 border-surface-3 opacity-50"
                : "bg-surface-2 border-surface-3"
            }`}
          >
            <button
              onClick={() => onToggle(item.id)}
              className={`w-5 h-5 mt-0.5 rounded-md border-2 shrink-0 transition-colors flex items-center justify-center ${
                item.completed
                  ? "bg-green-500 border-green-500"
                  : "border-surface-4 hover:border-brand-500"
              }`}
            >
              {item.completed && <Check className="w-3 h-3 text-white" />}
            </button>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium ${item.completed ? "line-through text-slate-600" : "text-white"}`}>
                {item.title}
              </p>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <span className={`text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1 border ${TYPE_COLORS[item.type]}`}>
                  <Icon name={TYPE_ICON_NAMES[item.type] || "clock"} className="w-2.5 h-2.5" />
                  {item.type}
                </span>
                <span className="text-[11px] text-slate-500 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {new Date(item.startTime).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface-3 text-slate-500">
                  {item.subject}
                </span>
              </div>
            </div>
            <button
              onClick={() => onDelete(item.id)}
              className="p-1.5 hover:bg-red-500/15 rounded-lg text-slate-600 hover:text-red-400 transition-colors shrink-0"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
