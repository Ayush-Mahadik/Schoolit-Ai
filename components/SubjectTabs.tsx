"use client";

import { clsx } from "clsx";
import { Icon } from "@/components/Icons";
import type { Subject } from "@/lib/types";

interface SubjectTabsProps {
  subjects: Subject[];
  activeSubject: string;
  onSelect: (id: string) => void;
}

export function SubjectTabs({ subjects, activeSubject, onSelect }: SubjectTabsProps) {
  return (
    <div className="flex items-center gap-1 px-4 py-2 bg-surface-1 border-b border-surface-3 overflow-x-auto">
      {subjects.map((subject) => (
        <button
          key={subject.id}
          onClick={() => onSelect(subject.id)}
          className={clsx(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all duration-150",
            activeSubject === subject.id
              ? "text-white shadow-sm"
              : "text-slate-400 hover:text-slate-200 hover:bg-surface-3"
          )}
          style={
            activeSubject === subject.id
              ? { backgroundColor: `${subject.color}22`, borderColor: `${subject.color}44`, border: "1px solid" }
              : undefined
          }
        >
          <Icon name={subject.icon} className="w-3.5 h-3.5" />
          <span>{subject.name}</span>
        </button>
      ))}
    </div>
  );
}
