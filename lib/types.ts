/**
 * Shared TypeScript types for SchoolIT AI
 */

// ── AI Model & Thinking Mode ──────────────────────────────────────────

export type AIModel =
  | "gpt-4.1"
  | "gpt-4o"
  | "llama-3.3-70b"
  | "gemma2-9b"
  | "gemini-2.0-flash"
  | "gemini-1.5-flash";

export type AIProvider = "github" | "groq" | "gemini";

export interface ModelOption {
  id: AIModel;
  name: string;
  description: string;
  icon: string; // Lucide icon name
  speed: "fast" | "medium" | "slow";
  supportsTools: boolean;
  supportsVision: boolean;
  hasThinking: boolean;
  provider: AIProvider;
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
    provider: "github",
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
    provider: "github",
  },
  {
    id: "llama-3.3-70b",
    name: "Llama 3.3 70B",
    description: "Groq — lightning fast, strong tool use",
    icon: "flame",
    speed: "fast",
    supportsTools: true,
    supportsVision: false,
    hasThinking: false,
    provider: "groq",
  },
  {
    id: "gemma2-9b",
    name: "Gemma 2 9B",
    description: "Groq — fast lightweight model for quick tasks",
    icon: "sparkles",
    speed: "fast",
    supportsTools: true,
    supportsVision: false,
    hasThinking: false,
    provider: "groq",
  },
  {
    id: "gemini-2.0-flash",
    name: "Gemini 2.0 Flash",
    description: "Google — vision + tools, high quality",
    icon: "star",
    speed: "fast",
    supportsTools: true,
    supportsVision: true,
    hasThinking: false,
    provider: "gemini",
  },
  {
    id: "gemini-1.5-flash",
    name: "Gemini 1.5 Flash",
    description: "Google — 1M context, reliable backup",
    icon: "shield",
    speed: "fast",
    supportsTools: true,
    supportsVision: true,
    hasThinking: false,
    provider: "gemini",
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
  flashcardSets?: FlashcardSetData[];
  quizSets?: QuizSetData[];
  searchImages?: { url: string; thumbnail: string; title: string; source: string }[];
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
  url?: string;
}

// ── Flashcard types ───────────────────────────────────────────────────

export interface FlashcardSetData {
  topic: string;
  cards: { front: string; back: string }[];
}

// ── Quiz types ────────────────────────────────────────────────────────

export interface QuizSetData {
  topic: string;
  difficulty?: string;
  questions: {
    question: string;
    options: string[];
    correct: number;
    explanation: string;
  }[];
}

