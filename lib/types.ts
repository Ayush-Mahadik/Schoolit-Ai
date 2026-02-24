/**
 * Shared TypeScript types for SchoolIT AI
 */

// ── AI Model & Thinking Mode ──────────────────────────────────────────

export type AIModel =
  | "gpt-4.1"
  | "gpt-4o"
  | "grok-3"
  | "grok-3-mini";

export interface ModelOption {
  id: AIModel;
  name: string;
  description: string;
  icon: string; // Lucide icon name
  speed: "fast" | "medium" | "slow";
  supportsTools: boolean;
  supportsVision: boolean;
  hasThinking: boolean;
}

export const MODEL_OPTIONS: ModelOption[] = [
  {
    id: "gpt-4.1",
    name: "GPT-4.1",
    description: "Flagship — best reasoning, coding & complex tasks",
    icon: "brain",
    speed: "medium",
    supportsTools: true,
    supportsVision: true,
    hasThinking: false,
  },
  {
    id: "gpt-4o",
    name: "GPT-4o",
    description: "Multimodal — vision, analysis & fast quality",
    icon: "zap",
    speed: "fast",
    supportsTools: true,
    supportsVision: true,
    hasThinking: false,
  },
  {
    id: "grok-3",
    name: "Grok 3",
    description: "xAI's most powerful — deep reasoning & tools",
    icon: "flame",
    speed: "medium",
    supportsTools: true,
    supportsVision: false,
    hasThinking: false,
  },
  {
    id: "grok-3-mini",
    name: "Grok 3 Mini",
    description: "Fast thinking — see AI reasoning in real-time",
    icon: "sparkles",
    speed: "fast",
    supportsTools: true,
    supportsVision: false,
    hasThinking: true,
  },
];

export type ThinkingMode = "fast" | "balanced" | "deep";

export interface ThinkingModeOption {
  id: ThinkingMode;
  name: string;
  description: string;
  icon: string; // Lucide icon name
  chainOfThought: boolean;
  maxTokens: number;
}

export const THINKING_MODES: ThinkingModeOption[] = [
  {
    id: "fast",
    name: "Fast",
    description: "Quick, direct answers",
    icon: "zap",
    chainOfThought: false,
    maxTokens: 16384,
  },
  {
    id: "balanced",
    name: "Balanced",
    description: "Good quality with moderate speed",
    icon: "scale",
    chainOfThought: false,
    maxTokens: 16384,
  },
  {
    id: "deep",
    name: "Deep Think",
    description: "Rigorous step-by-step reasoning",
    icon: "brain",
    chainOfThought: true,
    maxTokens: 16384,
  },
];

// ── Subject icon mapping (Lucide icon names) ──────────────────────────

export const SUBJECT_ICONS: Record<string, string> = {
  math: "calculator",
  physics: "atom",
  chemistry: "flask-conical",
  biology: "dna",
  cs: "code-2",
  english: "book-open",
  sst: "globe",
  sanskrit: "scroll-text",
  general: "library",
};

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
  flowcharts?: FlowchartData[];
  manimAnimations?: ManimData[];
  generatedImages?: ImageGenData[];
  attachments?: FileAttachmentMeta[];
  model?: AIModel;
}

export interface Subject {
  id: string;
  name: string;
  icon: string; // Lucide icon name
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

// ── Flowchart / Mermaid types ─────────────────────────────────────────

export interface FlowchartData {
  mermaidCode: string;
  title?: string;
  explanation?: string;
}

// ── Manim animation types ─────────────────────────────────────────────

export interface ManimData {
  code: string;
  sceneName: string;
  explanation: string;
}

// ── Generated image types ─────────────────────────────────────────────

export interface ImageGenData {
  prompt: string;
  style: string;
  subject?: string;
}

