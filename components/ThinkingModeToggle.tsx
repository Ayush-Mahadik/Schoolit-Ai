"use client";

import { THINKING_MODES, type ThinkingMode } from "@/lib/types";

interface ThinkingModeToggleProps {
  activeMode: ThinkingMode;
  onSelect: (mode: ThinkingMode) => void;
}

export function ThinkingModeToggle({ activeMode, onSelect }: ThinkingModeToggleProps) {
  return (
    <div className="flex items-center bg-surface-3 rounded-lg p-0.5">
      {THINKING_MODES.map((mode) => (
        <button
          key={mode.id}
          onClick={() => onSelect(mode.id)}
          className={`px-2.5 py-1 text-xs rounded-md transition-all duration-200 flex items-center gap-1 ${
            activeMode === mode.id
              ? mode.id === "deep"
                ? "bg-purple-600/30 text-purple-300 border border-purple-500/30 shadow-sm"
                : mode.id === "fast"
                ? "bg-green-600/30 text-green-300 border border-green-500/30 shadow-sm"
                : "bg-blue-600/30 text-blue-300 border border-blue-500/30 shadow-sm"
              : "text-slate-500 hover:text-slate-300"
          }`}
          title={mode.description}
        >
          <span className="text-xs">{mode.icon}</span>
          <span className="hidden sm:inline">{mode.name}</span>
        </button>
      ))}
    </div>
  );
}
