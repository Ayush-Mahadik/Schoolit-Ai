"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { ScheduleItem } from "@/lib/types";

interface ScheduleManagerProps {
  onClose: () => void;
}

const TYPE_COLORS: Record<string, string> = {
  study: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  exam: "bg-red-500/20 text-red-400 border-red-500/30",
  homework: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  class: "bg-green-500/20 text-green-400 border-green-500/30",
  other: "bg-slate-500/20 text-slate-400 border-slate-500/30",
};

const TYPE_ICONS: Record<string, string> = {
  study: "📖",
  exam: "📝",
  homework: "📋",
  class: "🏫",
  other: "📌",
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

function saveSchedule(items: ScheduleItem[]) {
  if (typeof window !== "undefined") {
    localStorage.setItem("schoolit-schedule", JSON.stringify(items));
  }
}

export function ScheduleManager({ onClose }: ScheduleManagerProps) {
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    title: "",
    subject: "general",
    startTime: "",
    endTime: "",
    type: "study" as ScheduleItem["type"],
  });

  useEffect(() => {
    setItems(getStoredSchedule());
  }, []);

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
    saveSchedule(updated);
    setForm({ title: "", subject: "general", startTime: "", endTime: "", type: "study" });
    setShowForm(false);
  };

  const toggleComplete = (id: string) => {
    const updated = items.map((i) =>
      i.id === id ? { ...i, completed: !i.completed } : i
    );
    setItems(updated);
    saveSchedule(updated);
  };

  const deleteItem = (id: string) => {
    const updated = items.filter((i) => i.id !== id);
    setItems(updated);
    saveSchedule(updated);
  };

  const today = new Date().toISOString().split("T")[0];
  const todayItems = items.filter((i) => i.startTime.startsWith(today));
  const upcomingItems = items.filter(
    (i) => !i.startTime.startsWith(today) && new Date(i.startTime) >= new Date()
  );
  const pastItems = items.filter(
    (i) => !i.startTime.startsWith(today) && new Date(i.startTime) < new Date()
  );

  return (
    <motion.div
      initial={{ opacity: 0, x: 300 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 300 }}
      className="w-[360px] h-full bg-surface-1 border-l border-surface-3 flex flex-col shrink-0 overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-surface-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">📅</span>
          <div>
            <h2 className="text-sm font-semibold text-white">Schedule Manager</h2>
            <p className="text-[10px] text-slate-500">
              {items.filter((i) => !i.completed).length} pending tasks
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 hover:bg-surface-3 rounded-md transition-colors text-slate-400 hover:text-white"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Add Button */}
      <div className="p-3">
        <button
          onClick={() => setShowForm(!showForm)}
          className="w-full py-2 px-3 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          <span>{showForm ? "✕ Cancel" : "+ Add Task"}</span>
        </button>
      </div>

      {/* Add Form */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="px-3 pb-3 overflow-hidden"
          >
            <div className="bg-surface-2 rounded-lg p-3 space-y-2 border border-surface-4">
              <input
                type="text"
                placeholder="Task title..."
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                className="w-full bg-surface-3 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="datetime-local"
                  value={form.startTime}
                  onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
                  className="bg-surface-3 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
                <input
                  type="datetime-local"
                  value={form.endTime}
                  onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
                  className="bg-surface-3 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
              <div className="flex gap-2">
                <select
                  value={form.type}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, type: e.target.value as ScheduleItem["type"] }))
                  }
                  className="flex-1 bg-surface-3 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none"
                >
                  <option value="study">📖 Study</option>
                  <option value="exam">📝 Exam</option>
                  <option value="homework">📋 Homework</option>
                  <option value="class">🏫 Class</option>
                  <option value="other">📌 Other</option>
                </select>
                <select
                  value={form.subject}
                  onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                  className="flex-1 bg-surface-3 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none"
                >
                  <option value="math">📐 Math</option>
                  <option value="physics">⚛️ Physics</option>
                  <option value="chemistry">🧪 Chemistry</option>
                  <option value="biology">🧬 Biology</option>
                  <option value="cs">💻 CS</option>
                  <option value="english">📝 English</option>
                  <option value="general">📚 General</option>
                </select>
              </div>
              <button
                onClick={handleAdd}
                disabled={!form.title || !form.startTime}
                className="w-full py-2 bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white text-sm rounded-lg transition-colors"
              >
                Add to Schedule
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Schedule List */}
      <div className="flex-1 overflow-y-auto px-3 py-1 space-y-4">
        {todayItems.length > 0 && (
          <ScheduleSection title="📌 Today" items={todayItems} onToggle={toggleComplete} onDelete={deleteItem} />
        )}
        {upcomingItems.length > 0 && (
          <ScheduleSection title="📅 Upcoming" items={upcomingItems} onToggle={toggleComplete} onDelete={deleteItem} />
        )}
        {pastItems.length > 0 && (
          <ScheduleSection title="✅ Past" items={pastItems} onToggle={toggleComplete} onDelete={deleteItem} />
        )}
        {items.length === 0 && (
          <div className="text-center py-8">
            <span className="text-4xl">📅</span>
            <p className="text-sm text-slate-500 mt-2">No tasks yet</p>
            <p className="text-xs text-slate-600 mt-1">
              Add study sessions, exam dates, and homework deadlines
            </p>
          </div>
        )}
      </div>
    </motion.div>
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
      <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold px-1 mb-1.5">
        {title}
      </p>
      <div className="space-y-1">
        {items.map((item) => (
          <div
            key={item.id}
            className={`flex items-start gap-2 p-2.5 rounded-lg border transition-all ${
              item.completed
                ? "bg-surface-2/50 border-surface-4/50 opacity-60"
                : "bg-surface-2 border-surface-4"
            }`}
          >
            <button
              onClick={() => onToggle(item.id)}
              className={`w-4 h-4 mt-0.5 rounded border-2 shrink-0 transition-colors ${
                item.completed
                  ? "bg-green-500 border-green-500"
                  : "border-slate-500 hover:border-brand-500"
              }`}
            >
              {item.completed && (
                <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </button>
            <div className="flex-1 min-w-0">
              <p className={`text-xs font-medium ${item.completed ? "line-through text-slate-500" : "text-white"}`}>
                {item.title}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full border ${TYPE_COLORS[item.type]}`}>
                  {TYPE_ICONS[item.type]} {item.type}
                </span>
                <span className="text-[9px] text-slate-500">
                  {new Date(item.startTime).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            </div>
            <button
              onClick={() => onDelete(item.id)}
              className="p-1 hover:bg-red-500/20 rounded text-slate-500 hover:text-red-400 transition-colors shrink-0"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
