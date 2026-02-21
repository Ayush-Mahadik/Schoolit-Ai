"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MODEL_OPTIONS, type AIModel } from "@/lib/types";

interface ModelSelectorProps {
  activeModel: AIModel;
  onSelect: (model: AIModel) => void;
}

export function ModelSelector({ activeModel, onSelect }: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const current = MODEL_OPTIONS.find((m) => m.id === activeModel) || MODEL_OPTIONS[1];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="px-3 py-1.5 text-sm bg-surface-3 hover:bg-surface-4 rounded-lg transition-colors flex items-center gap-1.5"
        title="Select AI Model"
      >
        <span>{current.icon}</span>
        <span className="hidden sm:inline text-slate-300">{current.name}</span>
        <svg
          className={`w-3 h-3 transition-transform text-slate-400 ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -5, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -5, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="absolute right-0 top-full mt-2 w-72 bg-surface-2 border border-surface-4 rounded-xl shadow-2xl z-50 overflow-hidden"
            >
              <div className="p-2">
                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold px-3 py-1.5">
                  AI Model
                </p>
                {MODEL_OPTIONS.map((model) => (
                  <button
                    key={model.id}
                    onClick={() => {
                      onSelect(model.id);
                      setOpen(false);
                    }}
                    className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                      activeModel === model.id
                        ? "bg-brand-600/15 border border-brand-500/20"
                        : "hover:bg-surface-3"
                    }`}
                  >
                    <span className="text-xl mt-0.5">{model.icon}</span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-white">{model.name}</p>
                        <SpeedBadge speed={model.speed} />
                      </div>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        {model.description}
                      </p>
                    </div>
                    {activeModel === model.id && (
                      <svg className="w-4 h-4 text-brand-400 mt-1 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function SpeedBadge({ speed }: { speed: "fast" | "medium" | "slow" }) {
  const config = {
    fast: { label: "Fast", color: "bg-green-500/20 text-green-400 border-green-500/30" },
    medium: { label: "Balanced", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
    slow: { label: "Powerful", color: "bg-purple-500/20 text-purple-400 border-purple-500/30" },
  };
  const c = config[speed];
  return (
    <span className={`text-[9px] px-1.5 py-0.5 rounded-full border ${c.color}`}>
      {c.label}
    </span>
  );
}
