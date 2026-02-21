"use client";

import { motion } from "framer-motion";
import { clsx } from "clsx";
import { useSession, signIn, signOut } from "next-auth/react";
import { Icon, GraduationCap, PanelLeftClose, Plus, Calendar, LogOut, Star } from "@/components/Icons";
import type { Subject } from "@/lib/types";

interface SidebarProps {
  subjects: Subject[];
  activeSubject: string;
  onSelectSubject: (id: string) => void;
  onClose: () => void;
  onToggleSchedule: () => void;
  messageCount: Record<string, number>;
}

export function Sidebar({
  subjects,
  activeSubject,
  onSelectSubject,
  onClose,
  onToggleSchedule,
  messageCount,
}: SidebarProps) {
  const { data: session, status } = useSession();
  const user = session?.user;
  const isAdmin = (user as Record<string, unknown>)?.isAdmin === true;

  return (
    <motion.aside
      initial={{ x: -260 }}
      animate={{ x: 0 }}
      exit={{ x: -260 }}
      transition={{ type: "spring", damping: 25, stiffness: 200 }}
      className="w-[260px] h-full bg-surface-1 border-r border-surface-3/60 flex flex-col shrink-0 z-40 fixed lg:relative"
    >
      {/* ── Header ────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 h-14 border-b border-surface-3/60">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-brand-600 flex items-center justify-center">
            <GraduationCap className="w-4 h-4 text-white" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white leading-tight">SchoolIT AI</h2>
            <p className="text-[10px] text-slate-500">v2.0</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 hover:bg-surface-3 rounded-md transition-colors text-slate-500 hover:text-white"
          aria-label="Close sidebar"
        >
          <PanelLeftClose className="w-4 h-4" />
        </button>
      </div>

      {/* ── New Chat + Schedule ────────────────────────────────────── */}
      <div className="p-3 space-y-1.5">
        <button className="w-full py-2 px-3 bg-surface-3 hover:bg-surface-4 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2.5">
          <Plus className="w-4 h-4 text-slate-400" />
          New Conversation
        </button>
        <button
          onClick={onToggleSchedule}
          className="w-full py-2 px-3 hover:bg-surface-3 text-slate-400 text-sm rounded-lg transition-colors flex items-center gap-2.5"
        >
          <Calendar className="w-4 h-4" />
          Schedule
        </button>
      </div>

      {/* ── Subject List ──────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-3 py-1">
        <p className="text-[10px] uppercase tracking-wider text-slate-600 font-semibold px-2 mb-2">
          Subjects
        </p>
        <nav className="space-y-0.5">
          {subjects.map((subject) => (
            <button
              key={subject.id}
              onClick={() => onSelectSubject(subject.id)}
              className={clsx(
                "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-150",
                activeSubject === subject.id
                  ? "bg-surface-3 text-white"
                  : "text-slate-400 hover:bg-surface-3/50 hover:text-slate-200"
              )}
            >
              <Icon
                name={subject.icon}
                className="w-4 h-4 shrink-0"
                style={activeSubject === subject.id ? { color: subject.color } : undefined}
              />
              <span className="flex-1 text-left truncate">{subject.name}</span>
              {(messageCount[subject.id] || 0) > 0 && (
                <span className="text-[10px] text-slate-600 tabular-nums">
                  {messageCount[subject.id]}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* ── Social Links ──────────────────────────────────────────── */}
      <div className="px-3 py-2 border-t border-surface-3/60">
        <div className="flex items-center justify-center gap-2">
          <a
            href="https://github.com/Ayush-Mahadik"
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 hover:bg-surface-3 rounded-lg transition-colors text-slate-600 hover:text-white"
            title="GitHub"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
          </a>
          <a
            href="https://discord.com/users/notleaped84"
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 hover:bg-surface-3 rounded-lg transition-colors text-slate-600 hover:text-[#5865F2]"
            title="Discord: notleaped84"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286z"/>
            </svg>
          </a>
        </div>
      </div>

      {/* ── User Footer ───────────────────────────────────────────── */}
      <div className="p-3 border-t border-surface-3/60">
        {status === "authenticated" && user ? (
          <div className="flex items-center gap-2.5 px-2 py-2 rounded-lg bg-surface-2/50">
            {user.image ? (
              <img
                src={user.image}
                alt={user.name || "User"}
                className="w-7 h-7 rounded-full shrink-0"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-7 h-7 rounded-full bg-brand-600 flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                {(user.name || "U")[0].toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-slate-200 truncate">
                {user.name || "User"}
              </p>
              <p className="text-[10px] text-slate-500 truncate flex items-center gap-1">
                {isAdmin && <Star className="w-2.5 h-2.5 text-amber-400" />}
                {isAdmin ? "Admin" : "Student"}
              </p>
            </div>
            <button
              onClick={() => signOut()}
              className="p-1.5 hover:bg-surface-4 rounded-md text-slate-600 hover:text-red-400 transition-colors"
              title="Sign out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => signIn("google")}
            className="w-full py-2.5 px-3 bg-white/5 hover:bg-white/10 text-white text-sm rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Sign in with Google
          </button>
        )}
      </div>
    </motion.aside>
  );
}
