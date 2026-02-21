/**
 * Shared TypeScript types for SchoolIT AI
 */

// ── AI Model & Thinking Mode ──────────────────────────────────────────

export type AIModel = "gpt-4.1" | "gpt-4o" | "gpt-5-mini";

export interface ModelOption {
  id: AIModel;
  name: string;
  description: string;
  icon: string;
  speed: "fast" | "medium" | "slow";
}

export const MODEL_OPTIONS: ModelOption[] = [
  {
    id: "gpt-4.1",
    name: "GPT-4.1",
    description: "Most capable — deep reasoning & complex tasks",
    icon: "🧠",
    speed: "slow",
  },
  {
    id: "gpt-4o",
    name: "GPT-4o",
    description: "Balanced — fast with great quality",
    icon: "⚡",
    speed: "medium",
  },
  {
    id: "gpt-5-mini",
    name: "GPT-5 Mini",
    description: "Lightning fast — quick answers & simple tasks",
    icon: "🚀",
    speed: "fast",
  },
];

export type ThinkingMode = "fast" | "balanced" | "deep";

export interface ThinkingModeOption {
  id: ThinkingMode;
  name: string;
  description: string;
  icon: string;
  chainOfThought: boolean;
  maxTokens: number;
}

export const THINKING_MODES: ThinkingModeOption[] = [
  {
    id: "fast",
    name: "Fast",
    description: "Quick, direct answers",
    icon: "⚡",
    chainOfThought: false,
    maxTokens: 2048,
  },
  {
    id: "balanced",
    name: "Balanced",
    description: "Good quality with moderate speed",
    icon: "⚖️",
    chainOfThought: false,
    maxTokens: 4096,
  },
  {
    id: "deep",
    name: "Deep Think",
    description: "Rigorous step-by-step reasoning",
    icon: "🧠",
    chainOfThought: true,
    maxTokens: 8192,
  },
];

// ── Messages ──────────────────────────────────────────────────────────

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  thinking?: string;
  animationUrl?: string;
  sources?: string[];
  toolCalls?: string[];
  charts?: ChartData[];
  attachments?: FileAttachmentMeta[];
  model?: AIModel;
}

export interface Subject {
  id: string;
  name: string;
  icon: string;
  color: string;
}

export interface Persona {
  id: string;
  name: string;
  icon: string;
  description: string;
}

export interface ChatSettings {
  persona: string;
  useWebSearch: boolean;
  chainOfThought: boolean;
  model: AIModel;
  thinkingMode: ThinkingMode;
}

// ── User & Auth ───────────────────────────────────────────────────────

export interface UserProfile {
  name: string;
  email: string;
  image?: string;
  isAdmin: boolean;
}

// ── Calendar ──────────────────────────────────────────────────────────

export interface CalendarEvent {
  id: string;
  title: string;
  description: string;
  start: string;
  end: string;
  link: string;
  subject?: string;
  type?: "study" | "exam" | "homework" | "class" | "other";
}

export interface ScheduleItem {
  id: string;
  title: string;
  subject: string;
  startTime: string;
  endTime: string;
  type: "study" | "exam" | "homework" | "class" | "other";
  completed: boolean;
}

// ── Chart types ───────────────────────────────────────────────────────

export interface ChartData {
  type: "line" | "bar" | "pie" | "area" | "scatter";
  title?: string;
  xLabel?: string;
  yLabel?: string;
  datasets: {
    label?: string;
    data: { x?: number | string; y?: number; name?: string; value?: number }[];
    color?: string;
  }[];
}

// ── File attachment types ─────────────────────────────────────────────

export interface FileAttachmentMeta {
  name: string;
  type: string;
  size: number;
}

