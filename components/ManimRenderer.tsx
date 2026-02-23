"use client";

import { useState, useMemo } from "react";

interface ManimRendererProps {
  code: string;
  sceneName: string;
  explanation: string;
}

/**
 * ManimRenderer: Renders Manim code inline in chat with:
 * - Syntax-highlighted code display
 * - Visual SVG preview of what the animation would produce
 * - Copy/download functionality
 */
export function ManimRenderer({ code, sceneName, explanation }: ManimRendererProps) {
  const [showCode, setShowCode] = useState(false);
  const [copied, setCopied] = useState(false);

  // Parse Manim code to generate an SVG preview
  const preview = useMemo(() => generatePreview(code, sceneName), [code, sceneName]);

  const handleCopy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleDownloadPy = () => {
    const blob = new Blob([code], { type: "text/x-python" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${sceneName || "animation"}.py`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="my-4 rounded-xl border border-surface-4 bg-surface-2 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-surface-3/50 border-b border-surface-4">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-purple-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
          <span className="text-xs font-medium text-slate-300">
            Manim Animation — {sceneName}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowCode((s) => !s)}
            className="px-2 py-1 text-[10px] text-slate-400 hover:text-white bg-surface-3 hover:bg-surface-4 rounded transition-colors"
          >
            {showCode ? "Preview" : "Code"}
          </button>
          <button
            onClick={handleCopy}
            className="px-2 py-1 text-[10px] text-slate-400 hover:text-white bg-surface-3 hover:bg-surface-4 rounded transition-colors"
          >
            {copied ? "✓ Copied" : "Copy"}
          </button>
          <button
            onClick={handleDownloadPy}
            className="px-2 py-1 text-[10px] text-slate-400 hover:text-white bg-surface-3 hover:bg-surface-4 rounded transition-colors"
          >
            ↓ .py
          </button>
        </div>
      </div>

      {/* Content */}
      {showCode ? (
        <div className="p-4 overflow-x-auto">
          <pre className="text-xs leading-relaxed font-mono">
            <code className="text-slate-300">
              {highlightPython(code)}
            </code>
          </pre>
        </div>
      ) : (
        <div className="p-4">
          {/* SVG Preview */}
          <div className="flex justify-center items-center min-h-[200px] bg-[#0a0a14] rounded-lg overflow-hidden">
            <svg
              viewBox="0 0 800 450"
              className="w-full max-h-[350px]"
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* Background grid */}
              <defs>
                <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
                  <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#1a1a2e" strokeWidth="0.5" />
                </pattern>
              </defs>
              <rect width="800" height="450" fill="#0a0a14" />
              <rect width="800" height="450" fill="url(#grid)" />

              {/* Axes if applicable */}
              {preview.showAxes && (
                <g>
                  <line x1="100" y1="225" x2="700" y2="225" stroke="#2d2d3d" strokeWidth="1.5" />
                  <line x1="400" y1="50" x2="400" y2="400" stroke="#2d2d3d" strokeWidth="1.5" />
                  {/* X axis ticks */}
                  {[-3, -2, -1, 1, 2, 3].map((n) => (
                    <g key={`xt${n}`}>
                      <line x1={400 + n * 100} y1="220" x2={400 + n * 100} y2="230" stroke="#4a4a5a" strokeWidth="1" />
                      <text x={400 + n * 100} y="245" textAnchor="middle" fill="#64748b" fontSize="11">{n}</text>
                    </g>
                  ))}
                  {/* Y axis ticks */}
                  {[-2, -1, 1, 2].map((n) => (
                    <g key={`yt${n}`}>
                      <line x1="395" y1={225 - n * 80} x2="405" y2={225 - n * 80} stroke="#4a4a5a" strokeWidth="1" />
                      <text x="385" y={225 - n * 80 + 4} textAnchor="end" fill="#64748b" fontSize="11">{n}</text>
                    </g>
                  ))}
                </g>
              )}

              {/* Render detected shapes/paths */}
              {preview.elements.map((el, i) => {
                if (el.type === "path") {
                  return (
                    <path
                      key={i}
                      d={el.d}
                      fill={el.fill || "none"}
                      stroke={el.stroke || "#3b82f6"}
                      strokeWidth={el.strokeWidth || 2.5}
                      opacity={el.opacity || 1}
                    />
                  );
                }
                if (el.type === "circle") {
                  return (
                    <circle
                      key={i}
                      cx={el.cx}
                      cy={el.cy}
                      r={el.r}
                      fill={el.fill || "none"}
                      stroke={el.stroke || "#3b82f6"}
                      strokeWidth={el.strokeWidth || 2}
                      opacity={el.opacity || 1}
                    />
                  );
                }
                if (el.type === "rect") {
                  return (
                    <rect
                      key={i}
                      x={el.x}
                      y={el.y}
                      width={el.width}
                      height={el.height}
                      fill={el.fill || "none"}
                      stroke={el.stroke || "#3b82f6"}
                      strokeWidth={el.strokeWidth || 2}
                      rx={el.rx || 0}
                      opacity={el.opacity || 1}
                    />
                  );
                }
                if (el.type === "text") {
                  return (
                    <text
                      key={i}
                      x={el.x}
                      y={el.y}
                      fill={el.fill || "#e2e8f0"}
                      fontSize={el.fontSize || 14}
                      textAnchor={(el.anchor as "middle" | "start" | "end") || "middle"}
                      fontFamily="Inter, system-ui, sans-serif"
                    >
                      {el.text}
                    </text>
                  );
                }
                if (el.type === "line") {
                  return (
                    <line
                      key={i}
                      x1={el.x1}
                      y1={el.y1}
                      x2={el.x2}
                      y2={el.y2}
                      stroke={el.stroke || "#3b82f6"}
                      strokeWidth={el.strokeWidth || 2}
                      opacity={el.opacity || 1}
                    />
                  );
                }
                if (el.type === "polygon") {
                  return (
                    <polygon
                      key={i}
                      points={el.points}
                      fill={el.fill || "none"}
                      stroke={el.stroke || "#3b82f6"}
                      strokeWidth={el.strokeWidth || 2}
                      opacity={el.opacity || 1}
                    />
                  );
                }
                return null;
              })}

              {/* Scene title */}
              <text x="400" y="430" textAnchor="middle" fill="#64748b" fontSize="12" fontFamily="Inter, system-ui, sans-serif">
                {sceneName} — Manim Preview
              </text>
            </svg>
          </div>

          {/* Explanation */}
          {explanation && (
            <p className="text-xs text-slate-400 mt-3 leading-relaxed">{explanation}</p>
          )}

          <div className="mt-3 flex items-center gap-2 text-[10px] text-slate-600">
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4M12 8h.01" />
            </svg>
            Static preview — download .py and run with Manim to see the full animation
          </div>
        </div>
      )}
    </div>
  );
}

// ── SVG Preview Generator ────────────────────────────────────────────
interface PreviewElement {
  type: "path" | "circle" | "rect" | "text" | "line" | "polygon";
  d?: string;
  cx?: number;
  cy?: number;
  r?: number;
  x?: number;
  y?: number;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  width?: number;
  height?: number;
  rx?: number;
  points?: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
  text?: string;
  fontSize?: number;
  anchor?: string;
}

interface Preview {
  showAxes: boolean;
  elements: PreviewElement[];
}

function generatePreview(code: string, _sceneName: string): Preview {
  const elements: PreviewElement[] = [];
  let showAxes = false;
  const lc = code.toLowerCase();

  // Detect axes
  if (lc.includes("axes") || lc.includes("numberplane") || lc.includes("coordinatesystem")) {
    showAxes = true;
  }

  // Detect and render function plots
  const plotMatch = code.match(/\.plot\(\s*lambda\s+\w+\s*:\s*([^,)]+)/);
  if (plotMatch && showAxes) {
    const expr = plotMatch[1].trim();
    const pathD = generateFunctionPath(expr);
    if (pathD) {
      elements.push({
        type: "path",
        d: pathD,
        stroke: "#3b82f6",
        strokeWidth: 2.5,
        fill: "none",
      });
    }
  }

  // Detect circles
  if (lc.includes("circle")) {
    const radiusMatch = code.match(/Circle\(\s*radius\s*=\s*([0-9.]+)/i);
    const r = radiusMatch ? parseFloat(radiusMatch[1]) * 80 : 80;
    elements.push({
      type: "circle",
      cx: 400,
      cy: 225,
      r: Math.min(r, 180),
      stroke: "#3b82f6",
      strokeWidth: 2.5,
      fill: "none",
    });
  }

  // Detect squares/rectangles
  if (lc.includes("square") || lc.includes("rectangle")) {
    const sideMatch = code.match(/(?:Square|Rectangle)\(\s*(?:side_length\s*=\s*)?([0-9.]+)/i);
    const size = sideMatch ? parseFloat(sideMatch[1]) * 80 : 160;
    elements.push({
      type: "rect",
      x: 400 - size / 2,
      y: 225 - size / 2,
      width: size,
      height: lc.includes("rectangle") ? size * 0.6 : size,
      stroke: "#10b981",
      strokeWidth: 2.5,
      fill: "none",
    });
  }

  // Detect triangles
  if (lc.includes("triangle") || lc.includes("polygon")) {
    elements.push({
      type: "polygon",
      points: "400,125 300,325 500,325",
      stroke: "#f59e0b",
      strokeWidth: 2.5,
      fill: "none",
    });
  }

  // Detect arrows / vectors
  if (lc.includes("arrow") || lc.includes("vector")) {
    elements.push({
      type: "line",
      x1: 400,
      y1: 225,
      x2: 550,
      y2: 125,
      stroke: "#ef4444",
      strokeWidth: 2.5,
    });
    // Arrowhead
    elements.push({
      type: "polygon",
      points: "550,125 535,140 542,128",
      stroke: "#ef4444",
      fill: "#ef4444",
      strokeWidth: 1,
    });
  }

  // Detect text / MathTex / Tex
  const texMatch = code.match(/(?:MathTex|Tex|Text)\(\s*[r"']+([^"']+)/i);
  if (texMatch) {
    elements.push({
      type: "text",
      x: 400,
      y: showAxes ? 60 : 225,
      text: texMatch[1].replace(/\\\\/g, "\\"),
      fill: "#e2e8f0",
      fontSize: 18,
      anchor: "middle",
    });
  }

  // Detect sine/cos/tan
  if (lc.includes("sin") && !plotMatch) {
    showAxes = true;
    elements.push({
      type: "path",
      d: generateFunctionPath("sin(x)"),
      stroke: "#3b82f6",
      strokeWidth: 2.5,
      fill: "none",
    });
  }
  if (lc.includes("cos") && !plotMatch) {
    showAxes = true;
    elements.push({
      type: "path",
      d: generateFunctionPath("cos(x)"),
      stroke: "#ef4444",
      strokeWidth: 2.5,
      fill: "none",
    });
  }

  // Detect parabola / x**2
  if ((lc.includes("x**2") || lc.includes("x^2") || lc.includes("parabola")) && !plotMatch) {
    showAxes = true;
    elements.push({
      type: "path",
      d: generateFunctionPath("x**2"),
      stroke: "#8b5cf6",
      strokeWidth: 2.5,
      fill: "none",
    });
  }

  // Detect number line
  if (lc.includes("numberline")) {
    elements.push({
      type: "line",
      x1: 100,
      y1: 225,
      x2: 700,
      y2: 225,
      stroke: "#94a3b8",
      strokeWidth: 2,
    });
    for (let i = -3; i <= 3; i++) {
      elements.push({
        type: "line",
        x1: 400 + i * 100,
        y1: 215,
        x2: 400 + i * 100,
        y2: 235,
        stroke: "#94a3b8",
        strokeWidth: 1.5,
      });
      elements.push({
        type: "text",
        x: 400 + i * 100,
        y: 255,
        text: String(i),
        fill: "#e2e8f0",
        fontSize: 12,
        anchor: "middle",
      });
    }
  }

  // Fallback: generic animation icon if nothing detected
  if (elements.length === 0) {
    elements.push(
      {
        type: "circle",
        cx: 400,
        cy: 200,
        r: 60,
        stroke: "#3b82f6",
        strokeWidth: 2,
        fill: "none",
        opacity: 0.5,
      },
      {
        type: "polygon",
        points: "385,175 385,225 425,200",
        fill: "#3b82f6",
        stroke: "none",
        strokeWidth: 0,
        opacity: 0.8,
      },
      {
        type: "text",
        x: 400,
        y: 300,
        text: "Animation Preview",
        fill: "#64748b",
        fontSize: 16,
        anchor: "middle",
      },
    );
  }

  return { showAxes, elements };
}

// Generate SVG path data for a math function
function generateFunctionPath(expr: string): string {
  const points: [number, number][] = [];
  const steps = 100;

  for (let i = 0; i <= steps; i++) {
    const x = -3 + (6 * i) / steps;
    let y: number;

    try {
      const e = expr
        .replace(/\bmath\.\b/g, "Math.")
        .replace(/\bnp\.\b/g, "Math.")
        .replace(/\bsin\b/g, "Math.sin")
        .replace(/\bcos\b/g, "Math.cos")
        .replace(/\btan\b/g, "Math.tan")
        .replace(/\babs\b/g, "Math.abs")
        .replace(/\bsqrt\b/g, "Math.sqrt")
        .replace(/\bexp\b/g, "Math.exp")
        .replace(/\blog\b/g, "Math.log")
        .replace(/\bpi\b/gi, "Math.PI")
        .replace(/\*\*/g, "**")
        .replace(/x/g, `(${x})`);

      // eslint-disable-next-line no-eval
      y = Function(`"use strict"; return (${e})`)();
    } catch {
      continue;
    }

    if (!isFinite(y) || Math.abs(y) > 5) continue;

    // Map to SVG coordinates: x in [−3,3] → [100,700], y in [−2.5,2.5] → [400,50]
    const sx = 100 + ((x + 3) / 6) * 600;
    const sy = 225 - y * 80;
    points.push([sx, sy]);
  }

  if (points.length < 2) return "";

  return (
    "M " +
    points.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(" L ")
  );
}

// Minimal Python syntax highlighting (returns JSX)
function highlightPython(code: string): React.ReactNode {
  // Simple keyword + string + comment highlighting
  const lines = code.split("\n");
  return lines.map((line, i) => {
    const parts: React.ReactNode[] = [];
    let rest = line;
    let key = 0;

    // Process comments
    const commentIdx = rest.indexOf("#");
    let comment = "";
    if (commentIdx >= 0) {
      comment = rest.slice(commentIdx);
      rest = rest.slice(0, commentIdx);
    }

    // Tokenize
    const tokenRegex = /("""[\s\S]*?"""|'''[\s\S]*?'''|"[^"]*"|'[^']*'|\b(?:from|import|class|def|self|return|if|elif|else|for|while|in|not|and|or|True|False|None|lambda|with|as|try|except|finally|raise|pass|break|continue|yield|assert)\b|\b\d+\.?\d*\b)/g;
    let lastIdx = 0;
    let match;
    while ((match = tokenRegex.exec(rest)) !== null) {
      // Text before token
      if (match.index > lastIdx) {
        parts.push(<span key={key++}>{rest.slice(lastIdx, match.index)}</span>);
      }
      const tok = match[1];
      if (tok.startsWith('"') || tok.startsWith("'")) {
        parts.push(<span key={key++} className="text-emerald-400">{tok}</span>);
      } else if (/^\d/.test(tok)) {
        parts.push(<span key={key++} className="text-amber-400">{tok}</span>);
      } else {
        parts.push(<span key={key++} className="text-purple-400">{tok}</span>);
      }
      lastIdx = match.index + tok.length;
    }
    if (lastIdx < rest.length) {
      parts.push(<span key={key++}>{rest.slice(lastIdx)}</span>);
    }
    if (comment) {
      parts.push(<span key={key++} className="text-slate-500">{comment}</span>);
    }

    return (
      <span key={i}>
        {parts}
        {i < lines.length - 1 ? "\n" : ""}
      </span>
    );
  });
}

// Parse manim code blocks from markdown
export function parseManimBlocks(
  content: string
): { text: string; animations: { code: string; sceneName: string; explanation: string }[] } {
  const animations: { code: string; sceneName: string; explanation: string }[] = [];
  const text = content.replace(
    /```manim\n([\s\S]*?)```/g,
    (_, code) => {
      const trimmed = code.trim();
      // Extract scene name from class definition
      const classMatch = trimmed.match(/class\s+(\w+)\s*\(/);
      const sceneName = classMatch ? classMatch[1] : "ManimScene";
      animations.push({ code: trimmed, sceneName, explanation: "" });
      return `<!--manim:${animations.length - 1}-->`;
    }
  );
  return { text, animations };
}
