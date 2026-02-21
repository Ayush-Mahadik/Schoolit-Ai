"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MODEL_OPTIONS, type AIModel } from "@/lib/types";
import { Icon, ChevronDown, Check } from "@/components/Icons";

interface ModelSelectorProps {
  activeModel: AIModel;
  onSelect: (model: AIModel) => void;
}

export function ModelSelector({ activeModel, onSelect }: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const current = MODEL_OPTIONS.find((m) => m.id === activeModel) || MODEL_OPTIONS[1];

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        className="h-8 px-2.5 text-sm bg-surface-3 hover:bg-surface-4 rounded-lg transition-colors flex items-center gap-1.5"
        title="Select AI Model"
      >
        <Icon name={current.icon} className="w-3.5 h-3.5 text-brand-400" />
        <span className="hidden sm:inline text-slate-300 text-xs">{current.name}</span>
        <ChevronDown className={`w-3 h-3 transition-transform text-slate-500 ${open ? "rotate-180" : ""}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.95 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 top-full mt-1.5 w-64 bg-surface-2 border border-surface-4 rounded-xl shadow-2xl z-[100] overflow-hidden"
          >
            <div className="p-1.5">
              <p className="text-[10px] uppercase tracking-wider text-slate-600 font-semibold px-2.5 py-1.5">
                AI Model
              </p>
              {MODEL_OPTIONS.map((model) => (
                <button
                  key={model.id}
                  onClick={() => {
                    onSelect(model.id);
                    setOpen(false);
                  }}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors ${
                    activeModel === model.id
                      ? "bg-brand-600/10"
                      : "hover:bg-surface-3"
                  }`}
                >
                  <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${
                    activeModel === model.id ? "bg-brand-600/20" : "bg-surface-3"
                  }`}>
                    <Icon name={model.icon} className={`w-3.5 h-3.5 ${
                      activeModel === model.id ? "text-brand-400" : "text-slate-400"
                    }`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-medium text-white">{model.name}</p>
                      <SpeedBadge speed={model.speed} />
                    </div>
                    <p className="text-[10px] text-slate-500 leading-snug truncate">
                      {model.description}
                    </p>
                  </div>
                  {activeModel === model.id && (
                    <Check className="w-3.5 h-3.5 text-brand-400 shrink-0" />
                  )}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SpeedBadge({ speed }: { speed: "fast" | "medium" | "slow" }) {
  const config = {
    fast: { label: "Fast", color: "bg-green-500/15 text-green-400" },
    medium: { label: "Balanced", color: "bg-blue-500/15 text-blue-400" },
    slow: { label: "Powerful", color: "bg-purple-500/15 text-purple-400" },
  };
  const c = config[speed];
  return (
    <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-medium ${c.color}`}>
      {c.label}
    </span>
  );
}
