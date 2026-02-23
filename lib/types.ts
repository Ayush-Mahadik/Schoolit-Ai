/**
 * Shared TypeScript types for SchoolIT AI
 */

// ── AI Model & Thinking Mode ──────────────────────────────────────────

export type AIModel =
  | "gpt-4.1"
  | "gpt-4o"
  | "gpt-4o-mini"
  | "Mistral-large-2411"
  | "Meta-Llama-3.1-70B-Instruct"
  | "Phi-4"
  | "DeepSeek-R1-0528";

export interface ModelOption {
  id: AIModel;
  name: string;
  description: string;
  icon: string; // Lucide icon name
  speed: "fast" | "medium" | "slow";
}

export const MODEL_OPTIONS: ModelOption[] = [
  {
    id: "gpt-4.1",
    name: "GPT-4.1",
    description: "Most capable — deep reasoning & complex tasks",
    icon: "brain",
    speed: "slow",
  },
  {
    id: "gpt-4o",
    name: "GPT-4o",
    description: "Balanced — fast with great quality",
    icon: "zap",
    speed: "medium",
  },
  {
    id: "gpt-4o-mini",
    name: "GPT-4o Mini",
    description: "Lightning fast — quick answers & simple tasks",
    icon: "rocket",
    speed: "fast",
  },
  {
    id: "Mistral-large-2411",
    name: "Mistral Large",
    description: "Powerful open model — excellent reasoning & text",
    icon: "wind",
    speed: "medium",
  },
  {
    id: "Meta-Llama-3.1-70B-Instruct",
    name: "Llama 3.1 70B",
    description: "Meta open-source — great all-round quality",
    icon: "flame",
    speed: "medium",
  },
  {
    id: "Phi-4",
    name: "Phi-4",
    description: "Microsoft efficient model — strong in math & code",
    icon: "sparkles",
    speed: "fast",
  },
  {
    id: "DeepSeek-R1-0528",
    name: "DeepSeek R1",
    description: "Advanced reasoning — excels at math & logic",
    icon: "search",
    speed: "slow",
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
    maxTokens: 2048,
  },
  {
    id: "balanced",
    name: "Balanced",
    description: "Good quality with moderate speed",
    icon: "scale",
    chainOfThought: false,
    maxTokens: 4096,
  },
  {
    id: "deep",
    name: "Deep Think",
    description: "Rigorous step-by-step reasoning",
    icon: "brain",
    chainOfThought: true,
    maxTokens: 8192,
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

