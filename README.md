# SchoolIT AI

An intelligent AI-powered school assistant built with Next.js, featuring multi-model support, real-time tool usage, and a modern Grok-inspired dark interface.

![SchoolIT AI](https://img.shields.io/badge/SchoolIT_AI-blue?style=for-the-badge)
![Next.js](https://img.shields.io/badge/Next.js-14-black?style=flat-square&logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue?style=flat-square&logo=typescript)
![Vercel](https://img.shields.io/badge/Deployed-Vercel-black?style=flat-square&logo=vercel)

## 🌐 Live Demo

**Primary:** **[schoolit-ai.vercel.app](https://schoolit-ai.vercel.app)**

## ✨ Features

### AI & Models
- **Multi-Model Support** — GPT-4.1, GPT-4o, GPT-5-mini via GitHub Models
- **Thinking Modes** — Fast, Balanced, and Deep reasoning
- **Agentic Tool Use** — Multi-round tool calling (web search, math solver, flashcards, quizzes, charts, flowcharts, image generation)
- **File Understanding** — Upload images, PDFs, code files, CSVs and more for AI analysis
- **Vision Support** — Image recognition via GPT-4o

### Interface
- **Grok-Inspired Design** — Clean, minimal dark UI with Lucide icons
- **Subject-Focused** — Math, Physics, Chemistry, Biology, CS, English, History, and General
- **Responsive** — Fully mobile-optimized with sidebar overlay and adaptive controls
- **Drag & Drop** — Drop files directly into the chat
- **Markdown & LaTeX** — Rich rendering with KaTeX math support
- **Charts & Diagrams** — Recharts integration and Mermaid flowcharts

### Auth & Security
- **Google OAuth** — Secure authentication via NextAuth.js
- **Admin System** — Admin-only features and rate limit bypass
- **Rate Limiting** — 25 requests/minute for regular users
- **CSP Headers** — Content Security Policy and HSTS enabled

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript 5.7 |
| Styling | Tailwind CSS 3.4 |
| Auth | NextAuth.js 4 (Google Provider) |
| AI | OpenAI SDK → GitHub Models |
| Icons | Lucide React |
| Animations | Framer Motion |
| Charts | Recharts 2 |
| Math | KaTeX |
| Deployment | Vercel |

## 📁 Project Structure

```
frontend/
├── app/
│   ├── api/
│   │   └── chat/route.ts      # AI chat endpoint with tool-use loop
│   ├── globals.css             # Global styles
│   ├── layout.tsx              # Root layout with fonts & providers
│   ├── page.tsx                # Main page with Grok-style layout
│   └── providers.tsx           # NextAuth session provider
├── components/
│   ├── ChatInterface.tsx       # Chat UI with messages, input, empty state
│   ├── FileUploadButton.tsx    # File upload with drag-and-drop
│   ├── Icons.tsx               # Lucide icon wrapper component
│   ├── ModelSelector.tsx       # AI model dropdown selector
│   ├── PersonaToggle.tsx       # Teaching persona selector
│   ├── ScheduleManager.tsx     # Task/schedule management panel
│   ├── Sidebar.tsx             # Subject navigation sidebar
│   ├── SubjectTabs.tsx         # Subject tab bar (compact)
│   └── ThinkingModeToggle.tsx  # Fast/Balanced/Deep toggle
├── lib/
│   ├── api.ts                  # Client-side API helpers
│   ├── auth.ts                 # NextAuth config & admin check
│   ├── store.ts                # Local state persistence
│   ├── types.ts                # TypeScript types & constants
│   └── server/
│       ├── prompts.ts          # System prompt builder
│       └── tools.ts            # Tool definitions & executors
├── tailwind.config.ts          # Custom brand/surface color palette
├── next.config.js              # CSP headers & image domains
└── vercel.json                 # Deployment config & security headers
```

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- A GitHub Personal Access Token with Models access
- Google OAuth credentials (Client ID + Secret)

### Installation

```bash
git clone https://github.com/Ayush-Mahadik/schoolit-ai.git
cd schoolit-ai/frontend
npm install
```

### Environment Variables

Create a `.env.local` file:

```env
GITHUB_TOKEN=your_github_token
AI_BASE_URL=https://models.inference.ai.azure.com
AI_MODEL=gpt-4o

NEXTAUTH_SECRET=your-random-secret
NEXTAUTH_URL=http://localhost:3000

GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

ADMIN_EMAILS=your-admin@email.com
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Production Build

```bash
npm run build
npm start
```

## 🌍 Deployment

Deployed on **Vercel** with automatic builds:

```bash
vercel deploy --prod
```

Required Vercel environment variables:
- `GITHUB_TOKEN`
- `AI_BASE_URL`
- `AI_MODEL`
- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `ADMIN_EMAILS`
- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_OLD_SITE_URL`
- `SELF_HOSTED_LLM_URL`
- `SELF_HOSTED_LLM_MODEL_ID`
- `SELF_HOSTED_LLM_API_KEY`

## 🤖 Available AI Tools

The AI assistant can use these tools during conversations:

| Tool | Description |
|------|-------------|
| `web_search` | Search the web for current information |
| `math_solver` | Step-by-step math problem solving |
| `generate_flashcards` | Create study flashcards |
| `generate_quiz` | Generate practice quizzes |
| `generate_chart` | Create data visualizations |
| `generate_flowchart` | Create Mermaid diagrams |
| `generate_image` | AI image generation |
| `image_recognition` | Analyze uploaded images |

## 👤 Author

**Ayush Mahadik**
- GitHub: [@Ayush-Mahadik](https://github.com/Ayush-Mahadik)
- Discord: notleaped84

## 📄 License

This project is private. All rights reserved.
