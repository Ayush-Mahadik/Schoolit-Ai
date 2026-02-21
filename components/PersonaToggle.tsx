"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GraduationCap, Palette, HelpCircle, BookOpen, Trophy, ChevronDown } from "@/components/Icons";
import type { Persona } from "@/lib/types";
import type { FC } from "react";
import type { LucideProps } from "lucide-react";

const PERSONA_ICONS: Record<string, FC<LucideProps>> = {
  formal: GraduationCap,
  creative: Palette,
  socratic: HelpCircle,
  balanced: BookOpen,
  exam_coach: Trophy,
};

interface PersonaToggleProps {
  personas: Persona[];
  activePersona: string;
  onSelect: (id: string) => void;
}

export function PersonaToggle({ personas, activePersona, onSelect }: PersonaToggleProps) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const current = personas.find((p) => p.id === activePersona);
  const CurrentIcon = PERSONA_ICONS[activePersona] || BookOpen;

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

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        className="h-8 px-2.5 text-sm bg-surface-3 hover:bg-surface-4 rounded-lg transition-colors flex items-center gap-1.5"
      >
        <CurrentIcon className="w-3.5 h-3.5 text-slate-400" />
        <span className="hidden sm:inline text-xs text-slate-300">{current?.name || "Balanced"}</span>
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
                Teacher Persona
              </p>
              {personas.map((persona) => {
                const PersonaIcon = PERSONA_ICONS[persona.id] || BookOpen;
                return (
                  <button
                    key={persona.id}
                    onClick={() => {
                      onSelect(persona.id);
                      setOpen(false);
                    }}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors ${
                      activePersona === persona.id
                        ? "bg-brand-600/10"
                        : "hover:bg-surface-3"
                    }`}
                  >
                    <PersonaIcon className={`w-4 h-4 shrink-0 ${
                      activePersona === persona.id ? "text-brand-400" : "text-slate-500"
                    }`} />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-white">{persona.name}</p>
                      <p className="text-[10px] text-slate-500 leading-snug truncate">
                        {persona.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
