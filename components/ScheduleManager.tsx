"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Icon, Calendar, X, Plus, Trash2, Check, Clock, BookOpen } from "@/components/Icons";
import type { ScheduleItem } from "@/lib/types";

interface ScheduleManagerProps {
  onClose: () => void;
}

const TYPE_COLORS: Record<string, string> = {
  study: "bg-blue-500/15 text-blue-400",
  exam: "bg-red-500/15 text-red-400",
  homework: "bg-amber-500/15 text-amber-400",
  class: "bg-green-500/15 text-green-400",
  other: "bg-slate-500/15 text-slate-400",
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
      className="w-[320px] h-full bg-surface-1 border-l border-surface-3/60 flex flex-col shrink-0 overflow-hidden"
    >
      <div className="flex items-center justify-between px-4 h-14 border-b border-surface-3/60">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-brand-400" />
          <div>
            <h2 className="text-sm font-semibold text-white">Schedule</h2>
            <p className="text-[10px] text-slate-500">
              {items.filter((i) => !i.completed).length} pending
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 hover:bg-surface-3 rounded-md transition-colors text-slate-500 hover:text-white"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-3">
        <button
          onClick={() => setShowForm(!showForm)}
          className="w-full py-2 px-3 bg-surface-3 hover:bg-surface-4 text-white text-sm rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          {showForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
          <span>{showForm ? "Cancel" : "Add Task"}</span>
        </button>
      </div>

      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="px-3 pb-3 overflow-hidden"
          >
            <div className="bg-surface-2 rounded-lg p-3 space-y-2 border border-surface-3/60">
              <input
                type="text"
                placeholder="Task title..."
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                className="w-full bg-surface-3 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-brand-500"
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
                  <option value="study">Study</option>
                  <option value="exam">Exam</option>
                  <option value="homework">Homework</option>
                  <option value="class">Class</option>
                  <option value="other">Other</option>
                </select>
                <select
                  value={form.subject}
                  onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                  className="flex-1 bg-surface-3 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none"
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
              <button
                onClick={handleAdd}
                disabled={!form.title || !form.startTime}
                className="w-full py-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white text-sm rounded-lg transition-colors"
              >
                Add to Schedule
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 overflow-y-auto px-3 py-1 space-y-4">
        {todayItems.length > 0 && (
          <ScheduleSection title="Today" items={todayItems} onToggle={toggleComplete} onDelete={deleteItem} />
        )}
        {upcomingItems.length > 0 && (
          <ScheduleSection title="Upcoming" items={upcomingItems} onToggle={toggleComplete} onDelete={deleteItem} />
        )}
        {pastItems.length > 0 && (
          <ScheduleSection title="Past" items={pastItems} onToggle={toggleComplete} onDelete={deleteItem} />
        )}
        {items.length === 0 && (
          <div className="text-center py-8">
            <Calendar className="w-8 h-8 text-slate-600 mx-auto" />
            <p className="text-sm text-slate-500 mt-2">No tasks yet</p>
            <p className="text-xs text-slate-600 mt-1">
              Add study sessions, exam dates, and deadlines
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
      <p className="text-[10px] uppercase tracking-wider text-slate-600 font-semibold px-1 mb-1.5">
        {title}
      </p>
      <div className="space-y-1">
        {items.map((item) => (
          <div
            key={item.id}
            className={`flex items-start gap-2 p-2.5 rounded-lg border transition-all ${
              item.completed
                ? "bg-surface-2/30 border-surface-3/30 opacity-50"
                : "bg-surface-2 border-surface-3/60"
            }`}
          >
            <button
              onClick={() => onToggle(item.id)}
              className={`w-4 h-4 mt-0.5 rounded border-2 shrink-0 transition-colors flex items-center justify-center ${
                item.completed
                  ? "bg-green-500 border-green-500"
                  : "border-slate-600 hover:border-brand-500"
              }`}
            >
              {item.completed && <Check className="w-2.5 h-2.5 text-white" />}
            </button>
            <div className="flex-1 min-w-0">
              <p className={`text-xs font-medium ${item.completed ? "line-through text-slate-600" : "text-white"}`}>
                {item.title}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full flex items-center gap-0.5 ${TYPE_COLORS[item.type]}`}>
                  <Icon name={TYPE_ICON_NAMES[item.type] || "clock"} className="w-2.5 h-2.5" />
                  {item.type}
                </span>
                <span className="text-[9px] text-slate-600 flex items-center gap-0.5">
                  <Clock className="w-2.5 h-2.5" />
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
              className="p-1 hover:bg-red-500/15 rounded text-slate-600 hover:text-red-400 transition-colors shrink-0"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
