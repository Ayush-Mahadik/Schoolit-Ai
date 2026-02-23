"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Copy, Check, Maximize2, Minimize2 } from "@/components/Icons";

interface MermaidDiagramProps {
  code: string;
  title?: string;
}

let mermaidInitialized = false;

async function getMermaid() {
  const mermaid = (await import("mermaid")).default;
  if (!mermaidInitialized) {
    mermaid.initialize({
      startOnLoad: false,
      theme: "dark",
      themeVariables: {
        primaryColor: "#6366f1",
        primaryTextColor: "#e2e8f0",
        primaryBorderColor: "#4f46e5",
        lineColor: "#64748b",
        secondaryColor: "#1e293b",
        tertiaryColor: "#0f172a",
        background: "#0f172a",
        mainBkg: "#1e293b",
        nodeBorder: "#4f46e5",
        clusterBkg: "#1e293b",
        titleColor: "#e2e8f0",
        edgeLabelBackground: "#1e293b",
        nodeTextColor: "#e2e8f0",
      },
      fontFamily: "ui-sans-serif, system-ui, sans-serif",
      fontSize: 14,
      flowchart: { curve: "basis", padding: 15 },
      sequence: { actorMargin: 50, mirrorActors: false },
    });
    mermaidInitialized = true;
  }
  return mermaid;
}

export function MermaidDiagram({ code, title }: MermaidDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mermaid = await getMermaid();
        const id = `mermaid-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const { svg: rendered } = await mermaid.render(id, code.trim());
        if (!cancelled) {
          setSvg(rendered);
          setError("");
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to render diagram");
          setSvg("");
        }
      }
    })();
    return () => { cancelled = true; };
  }, [code]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code.trim());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [code]);

  if (error) {
    return (
      <div className="my-3 rounded-xl border border-red-500/30 bg-red-500/5 p-4">
        <p className="text-xs text-red-400 mb-2">⚠ Diagram render error</p>
        <pre className="text-xs text-slate-400 overflow-x-auto whitespace-pre-wrap">{code.trim()}</pre>
      </div>
    );
  }

  if (!svg) {
    return (
      <div className="my-3 rounded-xl border border-surface-3 bg-surface-1 p-6 flex items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <div className="w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          Rendering diagram…
        </div>
      </div>
    );
  }

  return (
    <div className={`my-3 rounded-xl border border-surface-3 bg-surface-1 overflow-hidden ${expanded ? "fixed inset-4 z-50 bg-surface-0" : ""}`}>
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-surface-2 border-b border-surface-3/50">
        <span className="text-[11px] text-slate-500 font-medium">
          {title || "Diagram"}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={handleCopy}
            className="p-1 rounded hover:bg-surface-3 text-slate-500 hover:text-slate-300 transition-colors"
            title="Copy Mermaid code"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1 rounded hover:bg-surface-3 text-slate-500 hover:text-slate-300 transition-colors"
            title={expanded ? "Collapse" : "Expand"}
          >
            {expanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
      {/* SVG content */}
      <div
        ref={containerRef}
        className={`p-4 flex items-center justify-center overflow-auto ${expanded ? "h-[calc(100%-32px)]" : "max-h-[500px]"}`}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      {/* Expanded overlay backdrop */}
      {expanded && (
        <div
          className="fixed inset-0 bg-black/60 -z-10"
          onClick={() => setExpanded(false)}
        />
      )}
    </div>
  );
}
