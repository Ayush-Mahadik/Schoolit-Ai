"use client";

import { THINKING_MODES, type ThinkingMode } from "@/lib/types";
import { Icon } from "@/components/Icons";

interface ThinkingModeToggleProps {
  activeMode: ThinkingMode;
  onSelect: (mode: ThinkingMode) => void;
}

export function ThinkingModeToggle({ activeMode, onSelect }: ThinkingModeToggleProps) {
  return (
    <div className="flex items-center bg-surface-3 rounded-lg p-0.5 h-8">
      {THINKING_MODES.map((mode) => (
        <button
          key={mode.id}
          onClick={() => onSelect(mode.id)}
          className={`px-2 py-1 text-[11px] rounded-md transition-all duration-200 flex items-center gap-1 ${
            activeMode === mode.id
              ? mode.id === "deep"
                ? "bg-purple-600/25 text-purple-300 shadow-sm"
                : mode.id === "fast"
                ? "bg-green-600/25 text-green-300 shadow-sm"
                : "bg-blue-600/25 text-blue-300 shadow-sm"
              : "text-slate-500 hover:text-slate-300"
          }`}
          title={mode.description}
        >
          <Icon name={mode.icon} className="w-3 h-3" />
          <span className="hidden sm:inline">{mode.name}</span>
        </button>
      ))}
    </div>
  );
}
