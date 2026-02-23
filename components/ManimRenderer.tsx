"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";

interface ManimRendererProps {
  code: string;
  sceneName: string;
  explanation: string;
}

/**
 * ManimRenderer: Full animation preview with:
 * - Canvas-based timeline animation (requestAnimationFrame)
 * - Progressive shape drawing with easing
 * - Play/pause/scrub timeline controls
 * - Syntax-highlighted code display
 * - Copy/download functionality
 */
export function ManimRenderer({ code, sceneName, explanation }: ManimRendererProps) {
  const [showCode, setShowCode] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const [progress, setProgress] = useState(0); // 0-1 timeline
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const pausedAtRef = useRef<number>(0);
  const ANIMATION_DURATION = 6000; // 6 seconds total

  // Parse Manim code to generate animation timeline
  const timeline = useMemo(() => parseToTimeline(code), [code]);

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

  // Canvas animation loop
  const renderFrame = useCallback((t: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Calculate progress
    const elapsed = t - startTimeRef.current;
    const prog = Math.min(elapsed / ANIMATION_DURATION, 1);
    setProgress(prog);

    // Clear canvas
    const W = canvas.width;
    const H = canvas.height;
    ctx.fillStyle = "#050508";
    ctx.fillRect(0, 0, W, H);

    // Draw grid
    ctx.strokeStyle = "#1a1a2e";
    ctx.lineWidth = 0.5;
    for (let x = 0; x < W; x += 50) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 0; y < H; y += 50) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    // Draw axes if needed
    if (timeline.showAxes) {
      drawAxes(ctx, W, H);
    }

    // Draw each timeline element based on progress
    for (const el of timeline.elements) {
      const elStart = el.startTime;
      const elEnd = el.endTime;
      const elProg = Math.max(0, Math.min(1, (prog - elStart) / (elEnd - elStart)));
      if (elProg <= 0) continue;

      const ease = easeOutCubic(elProg);

      ctx.save();
      ctx.globalAlpha = Math.min(ease, 1);

      switch (el.type) {
        case "circle":
          drawAnimatedCircle(ctx, el, ease);
          break;
        case "rect":
          drawAnimatedRect(ctx, el, ease);
          break;
        case "line":
          drawAnimatedLine(ctx, el, ease);
          break;
        case "path":
          drawAnimatedPath(ctx, el, ease);
          break;
        case "text":
          drawAnimatedText(ctx, el, ease);
          break;
        case "polygon":
          drawAnimatedPolygon(ctx, el, ease);
          break;
        case "arrow":
          drawAnimatedArrow(ctx, el, ease);
          break;
        case "functionPlot":
          drawAnimatedFunctionPlot(ctx, el, ease, W, H);
          break;
      }

      ctx.restore();
    }

    // Scene name watermark
    ctx.fillStyle = "#3b3b4b";
    ctx.font = "11px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`${sceneName} — Manim Animation`, W / 2, H - 12);

    // Progress bar at bottom
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(0, H - 3, W, 3);
    ctx.fillStyle = "#3b82f6";
    ctx.fillRect(0, H - 3, W * prog, 3);

    if (prog < 1 && isPlaying) {
      animFrameRef.current = requestAnimationFrame(renderFrame);
    } else if (prog >= 1) {
      // Loop
      startTimeRef.current = performance.now();
      animFrameRef.current = requestAnimationFrame(renderFrame);
    }
  }, [isPlaying, timeline, sceneName]);

  // Start/stop animation
  useEffect(() => {
    if (!canvasRef.current || showCode) return;

    if (isPlaying) {
      startTimeRef.current = performance.now() - pausedAtRef.current * ANIMATION_DURATION;
      animFrameRef.current = requestAnimationFrame(renderFrame);
    } else {
      pausedAtRef.current = progress;
      cancelAnimationFrame(animFrameRef.current);
    }

    return () => cancelAnimationFrame(animFrameRef.current);
  }, [isPlaying, showCode, renderFrame, progress]);

  // Handle canvas resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const updateSize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (rect) {
        canvas.width = rect.width;
        canvas.height = Math.min(rect.width * 0.5625, 400);
      }
    };
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, [showCode]);

  const handleScrub = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    pausedAtRef.current = Math.max(0, Math.min(1, x));
    startTimeRef.current = performance.now() - pausedAtRef.current * ANIMATION_DURATION;
    setProgress(pausedAtRef.current);
  };

  return (
    <div className="my-4 rounded-xl border border-surface-4 bg-surface-2 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-surface-3/50 border-b border-surface-4">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-purple-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
          <span className="text-xs font-bold text-white uppercase tracking-wide">
            {sceneName}
          </span>
          <span className="text-[10px] text-purple-400/70 font-medium">MANIM</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="px-2 py-1 text-[10px] text-slate-400 hover:text-white bg-surface-3 hover:bg-surface-4 rounded transition-colors font-medium"
            title={isPlaying ? "Pause animation" : "Play animation"}
          >
            {isPlaying ? "⏸ Pause" : "▶ Play"}
          </button>
          <button
            onClick={() => setShowCode((s) => !s)}
            className="px-2 py-1 text-[10px] text-slate-400 hover:text-white bg-surface-3 hover:bg-surface-4 rounded transition-colors font-medium"
          >
            {showCode ? "Preview" : "Code"}
          </button>
          <button
            onClick={handleCopy}
            className="px-2 py-1 text-[10px] text-slate-400 hover:text-white bg-surface-3 hover:bg-surface-4 rounded transition-colors font-medium"
          >
            {copied ? "✓ Copied" : "Copy"}
          </button>
          <button
            onClick={handleDownloadPy}
            className="px-2 py-1 text-[10px] text-slate-400 hover:text-white bg-surface-3 hover:bg-surface-4 rounded transition-colors font-medium"
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
          {/* Canvas-based animated preview */}
          <div className="relative bg-[#050508] rounded-lg overflow-hidden">
            <canvas
              ref={canvasRef}
              className="w-full"
              style={{ minHeight: 200 }}
            />
            {/* Scrub bar */}
            <div
              className="h-1.5 bg-surface-3 cursor-pointer"
              onClick={handleScrub}
              title="Click to seek"
            >
              <div
                className="h-full bg-blue-500 transition-all duration-75"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
          </div>

          {/* Timeline info */}
          <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500">
            <span>{Math.round(progress * ANIMATION_DURATION / 1000 * 10) / 10}s / {ANIMATION_DURATION / 1000}s</span>
            <span>{timeline.elements.length} objects • {isPlaying ? "Playing" : "Paused"}</span>
          </div>

          {/* Explanation */}
          {explanation && (
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">{explanation}</p>
          )}

          <div className="mt-2 flex items-center gap-2 text-[10px] text-slate-600">
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4M12 8h.01" />
            </svg>
            Full canvas animation — download .py for Manim rendering
          </div>
        </div>
      )}
    </div>
  );
}

// ── Animation helpers ─────────────────────────────────────────────────

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function drawAxes(ctx: CanvasRenderingContext2D, W: number, H: number) {
  const cx = W / 2, cy = H / 2;
  ctx.strokeStyle = "#2d2d3d";
  ctx.lineWidth = 1.5;
  // X axis
  ctx.beginPath(); ctx.moveTo(50, cy); ctx.lineTo(W - 50, cy); ctx.stroke();
  // Y axis
  ctx.beginPath(); ctx.moveTo(cx, 30); ctx.lineTo(cx, H - 30); ctx.stroke();
  // Ticks
  ctx.fillStyle = "#64748b";
  ctx.font = "10px Inter, system-ui, sans-serif";
  ctx.textAlign = "center";
  const scale = (W - 100) / 6; // -3 to 3
  for (let n = -3; n <= 3; n++) {
    if (n === 0) continue;
    const x = cx + n * scale;
    ctx.beginPath(); ctx.moveTo(x, cy - 4); ctx.lineTo(x, cy + 4); ctx.stroke();
    ctx.fillText(String(n), x, cy + 16);
  }
  ctx.textAlign = "right";
  const yScale = (H - 60) / 5;
  for (let n = -2; n <= 2; n++) {
    if (n === 0) continue;
    const y = cy - n * yScale;
    ctx.beginPath(); ctx.moveTo(cx - 4, y); ctx.lineTo(cx + 4, y); ctx.stroke();
    ctx.fillText(String(n), cx - 8, y + 4);
  }
}

function drawAnimatedCircle(ctx: CanvasRenderingContext2D, el: TimelineElement, ease: number) {
  ctx.beginPath();
  ctx.arc(el.cx!, el.cy!, el.r! * ease, 0, Math.PI * 2 * ease);
  ctx.strokeStyle = el.stroke || "#3b82f6";
  ctx.lineWidth = el.strokeWidth || 2.5;
  if (el.fill && el.fill !== "none") {
    ctx.fillStyle = el.fill;
    ctx.globalAlpha *= 0.3;
    ctx.fill();
    ctx.globalAlpha /= 0.3;
  }
  ctx.stroke();
}

function drawAnimatedRect(ctx: CanvasRenderingContext2D, el: TimelineElement, ease: number) {
  const w = (el.width || 100) * ease;
  const h = (el.height || 100) * ease;
  const x = (el.x || 0) + ((el.width || 100) - w) / 2;
  const y = (el.y || 0) + ((el.height || 100) - h) / 2;
  ctx.strokeStyle = el.stroke || "#10b981";
  ctx.lineWidth = el.strokeWidth || 2.5;
  ctx.strokeRect(x, y, w, h);
  if (el.fill && el.fill !== "none") {
    ctx.fillStyle = el.fill;
    ctx.globalAlpha *= 0.2;
    ctx.fillRect(x, y, w, h);
    ctx.globalAlpha /= 0.2;
  }
}

function drawAnimatedLine(ctx: CanvasRenderingContext2D, el: TimelineElement, ease: number) {
  const x2 = el.x1! + (el.x2! - el.x1!) * ease;
  const y2 = el.y1! + (el.y2! - el.y1!) * ease;
  ctx.beginPath();
  ctx.moveTo(el.x1!, el.y1!);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = el.stroke || "#3b82f6";
  ctx.lineWidth = el.strokeWidth || 2;
  ctx.stroke();
}

function drawAnimatedPath(ctx: CanvasRenderingContext2D, el: TimelineElement, ease: number) {
  if (!el.points || el.points.length < 2) return;
  const count = Math.floor(el.points.length * ease);
  if (count < 2) return;
  ctx.beginPath();
  ctx.moveTo(el.points[0][0], el.points[0][1]);
  for (let i = 1; i < count; i++) {
    ctx.lineTo(el.points[i][0], el.points[i][1]);
  }
  ctx.strokeStyle = el.stroke || "#3b82f6";
  ctx.lineWidth = el.strokeWidth || 2.5;
  ctx.stroke();
}

function drawAnimatedText(ctx: CanvasRenderingContext2D, el: TimelineElement, ease: number) {
  ctx.fillStyle = el.fill || "#e2e8f0";
  ctx.font = `${(el.fontSize || 14)}px Inter, system-ui, sans-serif`;
  ctx.textAlign = (el.anchor as CanvasTextAlign) || "center";
  ctx.globalAlpha *= ease;
  ctx.fillText(el.text || "", el.x || 0, el.y || 0);
}

function drawAnimatedPolygon(ctx: CanvasRenderingContext2D, el: TimelineElement, ease: number) {
  if (!el.polyPoints || el.polyPoints.length < 3) return;
  ctx.beginPath();
  const pts = el.polyPoints;
  // Calculate center for scaling
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;

  const scaled = pts.map(([px, py]) => [
    cx + (px - cx) * ease,
    cy + (py - cy) * ease,
  ]);

  ctx.moveTo(scaled[0][0], scaled[0][1]);
  for (let i = 1; i < scaled.length; i++) {
    ctx.lineTo(scaled[i][0], scaled[i][1]);
  }
  ctx.closePath();
  ctx.strokeStyle = el.stroke || "#f59e0b";
  ctx.lineWidth = el.strokeWidth || 2.5;
  ctx.stroke();
  if (el.fill && el.fill !== "none") {
    ctx.fillStyle = el.fill;
    ctx.globalAlpha *= 0.2;
    ctx.fill();
    ctx.globalAlpha /= 0.2;
  }
}

function drawAnimatedArrow(ctx: CanvasRenderingContext2D, el: TimelineElement, ease: number) {
  const x1 = el.x1!, y1 = el.y1!;
  const x2 = x1 + (el.x2! - x1) * ease;
  const y2 = y1 + (el.y2! - y1) * ease;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = el.stroke || "#ef4444";
  ctx.lineWidth = el.strokeWidth || 2.5;
  ctx.stroke();

  // Arrowhead
  if (ease > 0.8) {
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const headLen = 12;
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - headLen * Math.cos(angle - 0.4), y2 - headLen * Math.sin(angle - 0.4));
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - headLen * Math.cos(angle + 0.4), y2 - headLen * Math.sin(angle + 0.4));
    ctx.stroke();
  }
}

function drawAnimatedFunctionPlot(ctx: CanvasRenderingContext2D, el: TimelineElement, ease: number, W: number, H: number) {
  if (!el.fnExpr) return;
  const cx = W / 2, cy = H / 2;
  const xScale = (W - 100) / 6;
  const yScale = (H - 60) / 5;
  const steps = Math.floor(100 * ease);
  if (steps < 2) return;

  ctx.beginPath();
  let first = true;
  for (let i = 0; i <= steps; i++) {
    const x = -3 + (6 * i) / 100;
    let y: number;
    try {
      y = evalMathExpr(el.fnExpr, x);
    } catch { continue; }
    if (!isFinite(y) || Math.abs(y) > 5) { first = true; continue; }
    const sx = cx + x * xScale;
    const sy = cy - y * yScale;
    if (first) { ctx.moveTo(sx, sy); first = false; }
    else ctx.lineTo(sx, sy);
  }
  ctx.strokeStyle = el.stroke || "#3b82f6";
  ctx.lineWidth = el.strokeWidth || 2.5;
  ctx.stroke();
}

function evalMathExpr(expr: string, x: number): number {
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
  return Function(`"use strict"; return (${e})`)();
}

// ── Timeline types & parser ───────────────────────────────────────────

interface TimelineElement {
  type: "circle" | "rect" | "line" | "path" | "text" | "polygon" | "arrow" | "functionPlot";
  startTime: number; // 0-1
  endTime: number;   // 0-1
  cx?: number; cy?: number; r?: number;
  x?: number; y?: number; width?: number; height?: number;
  x1?: number; y1?: number; x2?: number; y2?: number;
  points?: [number, number][];
  polyPoints?: [number, number][];
  fill?: string; stroke?: string; strokeWidth?: number;
  text?: string; fontSize?: number; anchor?: string;
  fnExpr?: string;
}

interface AnimTimeline {
  showAxes: boolean;
  elements: TimelineElement[];
}

function parseToTimeline(code: string): AnimTimeline {
  const elements: TimelineElement[] = [];
  let showAxes = false;
  const lc = code.toLowerCase();
  let slot = 0;
  const totalSlots = 8;
  const slotDur = 1 / totalSlots;

  // Detect axes
  if (lc.includes("axes") || lc.includes("numberplane") || lc.includes("coordinatesystem")) {
    showAxes = true;
  }

  // Detect function plots
  const plotMatch = code.match(/\.plot\(\s*lambda\s+\w+\s*:\s*([^,)]+)/);
  if (plotMatch && showAxes) {
    elements.push({
      type: "functionPlot",
      fnExpr: plotMatch[1].trim(),
      stroke: "#3b82f6", strokeWidth: 2.5,
      startTime: slot * slotDur, endTime: (slot + 2) * slotDur,
    });
    slot += 2;
  }

  // Detect circles
  if (lc.includes("circle")) {
    const radiusMatch = code.match(/Circle\(\s*radius\s*=\s*([0-9.]+)/i);
    const r = radiusMatch ? parseFloat(radiusMatch[1]) * 80 : 80;
    elements.push({
      type: "circle", cx: 400, cy: 225, r: Math.min(r, 180),
      stroke: "#3b82f6", strokeWidth: 2.5, fill: "none",
      startTime: slot * slotDur, endTime: (slot + 2) * slotDur,
    });
    slot += 2;
  }

  // Detect squares/rectangles
  if (lc.includes("square") || lc.includes("rectangle")) {
    const sideMatch = code.match(/(?:Square|Rectangle)\(\s*(?:side_length\s*=\s*)?([0-9.]+)/i);
    const size = sideMatch ? parseFloat(sideMatch[1]) * 80 : 160;
    const h = lc.includes("rectangle") ? size * 0.6 : size;
    elements.push({
      type: "rect", x: 400 - size / 2, y: 225 - h / 2, width: size, height: h,
      stroke: "#10b981", strokeWidth: 2.5, fill: "none",
      startTime: slot * slotDur, endTime: (slot + 2) * slotDur,
    });
    slot += 2;
  }

  // Detect triangles
  if (lc.includes("triangle") || (lc.includes("polygon") && !lc.includes("regularpolygon"))) {
    elements.push({
      type: "polygon",
      polyPoints: [[400, 125], [300, 325], [500, 325]],
      stroke: "#f59e0b", strokeWidth: 2.5, fill: "none",
      startTime: slot * slotDur, endTime: (slot + 2) * slotDur,
    });
    slot += 2;
  }

  // Detect arrows / vectors
  if (lc.includes("arrow") || lc.includes("vector")) {
    elements.push({
      type: "arrow", x1: 400, y1: 225, x2: 550, y2: 125,
      stroke: "#ef4444", strokeWidth: 2.5,
      startTime: slot * slotDur, endTime: (slot + 1.5) * slotDur,
    });
    slot += 1.5;
  }

  // Detect text / MathTex
  const texMatch = code.match(/(?:MathTex|Tex|Text)\(\s*[r"']+([^"']+)/i);
  if (texMatch) {
    elements.push({
      type: "text", x: 400, y: showAxes ? 60 : 225,
      text: texMatch[1].replace(/\\\\/g, "\\"),
      fill: "#e2e8f0", fontSize: 20, anchor: "center",
      startTime: slot * slotDur, endTime: (slot + 1) * slotDur,
    });
    slot += 1;
  }

  // Detect sine
  if (lc.includes("sin") && !plotMatch) {
    showAxes = true;
    elements.push({
      type: "functionPlot", fnExpr: "sin(x)",
      stroke: "#3b82f6", strokeWidth: 2.5,
      startTime: slot * slotDur, endTime: (slot + 2) * slotDur,
    });
    slot += 2;
  }
  // Detect cosine
  if (lc.includes("cos") && !plotMatch) {
    showAxes = true;
    elements.push({
      type: "functionPlot", fnExpr: "cos(x)",
      stroke: "#ef4444", strokeWidth: 2.5,
      startTime: slot * slotDur, endTime: (slot + 2) * slotDur,
    });
    slot += 2;
  }

  // Detect parabola
  if ((lc.includes("x**2") || lc.includes("x^2") || lc.includes("parabola")) && !plotMatch) {
    showAxes = true;
    elements.push({
      type: "functionPlot", fnExpr: "x**2",
      stroke: "#8b5cf6", strokeWidth: 2.5,
      startTime: slot * slotDur, endTime: (slot + 2) * slotDur,
    });
    slot += 2;
  }

  // Detect number line
  if (lc.includes("numberline")) {
    elements.push({
      type: "line", x1: 100, y1: 225, x2: 700, y2: 225,
      stroke: "#94a3b8", strokeWidth: 2,
      startTime: slot * slotDur, endTime: (slot + 1) * slotDur,
    });
    slot += 1;
    for (let i = -3; i <= 3; i++) {
      elements.push({
        type: "text", x: 400 + i * 100, y: 255,
        text: String(i), fill: "#e2e8f0", fontSize: 12, anchor: "center",
        startTime: (slot + (i + 3) * 0.1) * slotDur, endTime: (slot + (i + 3) * 0.1 + 0.3) * slotDur,
      });
    }
    slot += 1;
  }

  // Fallback: animated play icon
  if (elements.length === 0) {
    elements.push(
      {
        type: "circle", cx: 400, cy: 200, r: 60,
        stroke: "#3b82f6", strokeWidth: 2, fill: "none",
        startTime: 0, endTime: 0.3,
      },
      {
        type: "polygon",
        polyPoints: [[385, 175], [385, 225], [425, 200]],
        fill: "#3b82f6", stroke: "#3b82f6", strokeWidth: 1,
        startTime: 0.3, endTime: 0.5,
      },
      {
        type: "text", x: 400, y: 300,
        text: "Animation Preview", fill: "#64748b", fontSize: 16, anchor: "center",
        startTime: 0.5, endTime: 0.7,
      },
    );
  }

  return { showAxes, elements };
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
