"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Persona } from "@/lib/types";

interface PersonaToggleProps {
  personas: Persona[];
  activePersona: string;
  onSelect: (id: string) => void;
}

export function PersonaToggle({ personas, activePersona, onSelect }: PersonaToggleProps) {
  const [open, setOpen] = useState(false);

  const current = personas.find((p) => p.id === activePersona);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="px-3 py-1.5 text-sm bg-surface-3 hover:bg-surface-4 rounded-lg transition-colors flex items-center gap-1.5"
      >
        <span>{current?.icon || "📚"}</span>
        <span className="hidden sm:inline">{current?.name || "Balanced"}</span>
        <svg
          className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`}
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
            {/* Backdrop */}
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

            {/* Dropdown */}
            <motion.div
              initial={{ opacity: 0, y: -5, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -5, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="absolute right-0 top-full mt-2 w-72 bg-surface-2 border border-surface-4 rounded-xl shadow-2xl z-50 overflow-hidden"
            >
              <div className="p-2">
                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold px-3 py-1.5">
                  Teacher Persona
                </p>
                {personas.map((persona) => (
                  <button
                    key={persona.id}
                    onClick={() => {
                      onSelect(persona.id);
                      setOpen(false);
                    }}
                    className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                      activePersona === persona.id
                        ? "bg-brand-600/15 border border-brand-500/20"
                        : "hover:bg-surface-3"
                    }`}
                  >
                    <span className="text-xl mt-0.5">{persona.icon}</span>
                    <div>
                      <p className="text-sm font-medium text-white">{persona.name}</p>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        {persona.description}
                      </p>
                    </div>
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
