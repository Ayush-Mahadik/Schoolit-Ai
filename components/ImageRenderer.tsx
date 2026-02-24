"use client";

import { useMemo, useState } from "react";

interface ImageRendererProps {
  prompt: string;
  style: string;
  subject?: string;
  url?: string; // Optional DALL-E generated image URL
}

/**
 * Renders an educational illustration - either DALL-E generated or fallback SVG.
 */
export function ImageRenderer({ prompt, style, subject, url }: ImageRendererProps) {
  const visual = useMemo(() => generateVisual(prompt, style, subject), [prompt, style, subject]);
  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(!!url);

  return (
    <div className="my-4 rounded-xl border border-surface-4 bg-surface-2 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-surface-3/50 border-b border-surface-4">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-pink-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
          <span className="text-xs font-medium text-slate-300">
            {url && !imageError ? "AI-Generated Image" : `${style.charAt(0).toUpperCase() + style.slice(1)}`} — {subject || "Educational"}
          </span>
        </div>
      </div>

      {/* Image or SVG Illustration */}
      <div className="p-4 flex justify-center items-center bg-[#0a0a14] relative">
        {url && !imageError ? (
          <>
            {imageLoading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 z-10">
                <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs text-slate-500">Generating image...</span>
              </div>
            )}
            <img
              src={url}
              alt={prompt}
              className={`w-full max-w-2xl rounded-lg border border-surface-4 transition-opacity duration-300 ${imageLoading ? "opacity-0" : "opacity-100"}`}
              onLoad={() => setImageLoading(false)}
              onError={() => { setImageError(true); setImageLoading(false); }}
            />
          </>
        ) : (
          // Fallback SVG
          <svg
            viewBox="0 0 600 400"
            className="w-full max-h-[300px]"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <linearGradient id="imgBg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0f172a" />
                <stop offset="100%" stopColor="#0a0a14" />
              </linearGradient>
              <filter id="glow">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <rect width="600" height="400" fill="url(#imgBg)" />

            {visual.elements.map((el, i) => {
              if (el.type === "circle") {
                return <circle key={i} cx={el.cx} cy={el.cy} r={el.r} fill={el.fill || "none"} stroke={el.stroke || "#3b82f6"} strokeWidth={el.sw || 2} opacity={el.op || 1} />;
              }
              if (el.type === "rect") {
                return <rect key={i} x={el.x} y={el.y} width={el.w} height={el.h} rx={el.rx || 0} fill={el.fill || "none"} stroke={el.stroke || "#3b82f6"} strokeWidth={el.sw || 2} opacity={el.op || 1} />;
              }
              if (el.type === "text") {
                return <text key={i} x={el.x} y={el.y} fill={el.fill || "#e2e8f0"} fontSize={el.fs || 14} textAnchor="middle" fontFamily="Inter, system-ui, sans-serif">{el.text}</text>;
              }
              if (el.type === "line") {
                return <line key={i} x1={el.x1} y1={el.y1} x2={el.x2} y2={el.y2} stroke={el.stroke || "#3b82f6"} strokeWidth={el.sw || 2} opacity={el.op || 1} />;
              }
              if (el.type === "ellipse") {
                return <ellipse key={i} cx={el.cx} cy={el.cy} rx={el.rx} ry={el.ry} fill={el.fill || "none"} stroke={el.stroke || "#3b82f6"} strokeWidth={el.sw || 2} opacity={el.op || 1} />;
              }
              if (el.type === "path") {
                return <path key={i} d={el.d} fill={el.fill || "none"} stroke={el.stroke || "#3b82f6"} strokeWidth={el.sw || 2} opacity={el.op || 1} />;
              }
              return null;
            })}
          </svg>
        )}
      </div>

      {/* Caption */}
      <div className="px-4 py-3 border-t border-surface-4">
        <p className="text-xs text-slate-400 leading-relaxed">{prompt}</p>
      </div>
    </div>
  );
}

// ── Visual Generator ─────────────────────────────────────────────────
interface VisElement {
  type: string;
  cx?: number;
  cy?: number;
  r?: number;
  rx?: number;
  ry?: number;
  x?: number;
  y?: number;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  w?: number;
  h?: number;
  d?: string;
  fill?: string;
  stroke?: string;
  sw?: number;
  op?: number;
  text?: string;
  fs?: number;
  points?: string;
}

function generateVisual(prompt: string, style: string, subject?: string): { elements: VisElement[] } {
  const elements: VisElement[] = [];
  const pl = prompt.toLowerCase();
  const subj = (subject || "").toLowerCase();

  // Science-related: atom/molecule
  if (pl.includes("atom") || pl.includes("molecul") || pl.includes("electron") || subj === "chemistry" || subj === "physics") {
    // Nucleus
    elements.push({ type: "circle", cx: 300, cy: 200, r: 30, fill: "#3b82f6", stroke: "#60a5fa", sw: 2, op: 0.8 });
    // Electron orbits
    [70, 110, 150].forEach((r, i) => {
      elements.push({ type: "ellipse", cx: 300, cy: 200, rx: r, ry: r * 0.4, fill: "none", stroke: ["#8b5cf6", "#06b6d4", "#10b981"][i], sw: 1.5, op: 0.5 });
      const angle = (i * 120 * Math.PI) / 180;
      elements.push({ type: "circle", cx: 300 + r * Math.cos(angle), cy: 200 + r * 0.4 * Math.sin(angle), r: 6, fill: ["#8b5cf6", "#06b6d4", "#10b981"][i], stroke: "none", sw: 0, op: 0.9 });
    });
    elements.push({ type: "text", x: 300, y: 360, text: "Atomic Structure", fill: "#94a3b8", fs: 14 });
  }
  // Biology: cell
  else if (pl.includes("cell") || pl.includes("mitosis") || pl.includes("dna") || subj === "biology") {
    // Cell membrane
    elements.push({ type: "ellipse", cx: 300, cy: 200, rx: 180, ry: 120, fill: "#10b98115", stroke: "#10b981", sw: 2.5, op: 0.8 });
    // Nucleus
    elements.push({ type: "circle", cx: 300, cy: 200, r: 50, fill: "#3b82f615", stroke: "#3b82f6", sw: 2, op: 0.8 });
    // Nucleolus
    elements.push({ type: "circle", cx: 310, cy: 190, r: 15, fill: "#8b5cf630", stroke: "#8b5cf6", sw: 1.5, op: 0.7 });
    // Organelles
    elements.push({ type: "ellipse", cx: 200, cy: 170, rx: 30, ry: 15, fill: "#f59e0b20", stroke: "#f59e0b", sw: 1.5, op: 0.6 });
    elements.push({ type: "ellipse", cx: 400, cy: 230, rx: 25, ry: 12, fill: "#ef444420", stroke: "#ef4444", sw: 1.5, op: 0.6 });
    elements.push({ type: "text", x: 300, y: 360, text: "Cell Diagram", fill: "#94a3b8", fs: 14 });
  }
  // Math: geometry
  else if (pl.includes("geometr") || pl.includes("triangle") || pl.includes("pythagor") || subj === "math") {
    // Right triangle
    elements.push({ type: "path", d: "M 200 300 L 200 120 L 450 300 Z", fill: "none", stroke: "#3b82f6", sw: 2.5, op: 0.9 });
    // Right angle marker
    elements.push({ type: "path", d: "M 200 280 L 220 280 L 220 300", fill: "none", stroke: "#94a3b8", sw: 1.5, op: 0.6 });
    // Labels
    elements.push({ type: "text", x: 185, y: 215, text: "a", fill: "#3b82f6", fs: 18 });
    elements.push({ type: "text", x: 330, y: 320, text: "b", fill: "#10b981", fs: 18 });
    elements.push({ type: "text", x: 340, y: 195, text: "c", fill: "#ef4444", fs: 18 });
    elements.push({ type: "text", x: 300, y: 370, text: "a² + b² = c²", fill: "#e2e8f0", fs: 16 });
  }
  // Default: educational illustration placeholder
  else {
    // Book icon
    elements.push({ type: "rect", x: 220, y: 100, w: 160, h: 200, rx: 5, fill: "#1e293b", stroke: "#3b82f6", sw: 2, op: 0.8 });
    elements.push({ type: "line", x1: 300, y1: 100, x2: 300, y2: 300, stroke: "#3b82f6", sw: 2, op: 0.4 });
    // Lines on page
    [140, 160, 180, 200, 220, 240].forEach((y) => {
      elements.push({ type: "line", x1: 235, y1: y, x2: 290, y2: y, stroke: "#334155", sw: 1, op: 0.6 });
      elements.push({ type: "line", x1: 310, y1: y, x2: 365, y2: y, stroke: "#334155", sw: 1, op: 0.6 });
    });
    // Stars
    [{ x: 150, y: 150 }, { x: 450, y: 130 }, { x: 480, y: 250 }, { x: 120, y: 270 }].forEach(({ x, y }) => {
      elements.push({ type: "circle", cx: x, cy: y, r: 3, fill: "#f59e0b", stroke: "none", sw: 0, op: 0.5 });
    });
    elements.push({ type: "text", x: 300, y: 360, text: style.charAt(0).toUpperCase() + style.slice(1) + " Illustration", fill: "#94a3b8", fs: 14 });
  }

  return { elements };
}

// Parse image description blocks from content
export function parseImageBlocks(
  content: string
): { text: string; images: { prompt: string; style: string; subject?: string; url?: string }[] } {
  const images: { prompt: string; style: string; subject?: string; url?: string }[] = [];
  const text = content.replace(
    /```image\n([\s\S]*?)```/g,
    (fullMatch, json) => {
      try {
        const parsed = JSON.parse(json.trim());
        if (parsed.prompt) {
          images.push(parsed);
          return `<!--image:${images.length - 1}-->`;
        }
      } catch {
        // Not JSON, treat as simple prompt
        images.push({ prompt: json.trim(), style: "diagram" });
        return `<!--image:${images.length - 1}-->`;
      }
      return fullMatch;
    }
  );
  return { text, images };
}
