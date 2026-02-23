"use client";

import { useEffect, useRef, useState, useId } from "react";

interface MermaidRendererProps {
  code: string;
  title?: string;
}

export function MermaidRenderer({ code, title }: MermaidRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const uniqueId = useId().replace(/:/g, "_");

  useEffect(() => {
    let cancelled = false;
    async function render() {
      try {
        // Dynamic import to avoid SSR issues
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: "dark",
          themeVariables: {
            primaryColor: "#3b82f6",
            primaryTextColor: "#e2e8f0",
            primaryBorderColor: "#3b82f6",
            lineColor: "#94a3b8",
            secondaryColor: "#8b5cf6",
            tertiaryColor: "#1a1a2e",
            background: "#0f0f1a",
            mainBkg: "#1a1a2e",
            nodeBorder: "#3b82f6",
            clusterBkg: "#1a1a2e",
            titleColor: "#e2e8f0",
            edgeLabelBackground: "#1a1a2e",
          },
          flowchart: {
            htmlLabels: true,
            curve: "basis",
            padding: 12,
          },
          fontFamily: "Inter, system-ui, sans-serif",
          fontSize: 13,
        });

        const { svg: renderedSvg } = await mermaid.render(
          `mermaid_${uniqueId}`,
          code.trim()
        );
        if (!cancelled) {
          setSvg(renderedSvg);
          setError("");
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to render diagram");
          setSvg("");
        }
      }
    }

    render();
    return () => {
      cancelled = true;
    };
  }, [code, uniqueId]);

  const handleCopy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleDownloadSvg = () => {
    if (!svg) return;
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title || "diagram"}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (error) {
    return (
      <div className="my-4 p-4 bg-red-950/30 rounded-xl border border-red-500/30">
        <p className="text-red-400 text-xs mb-2">⚠ Diagram render error</p>
        <pre className="text-xs text-slate-400 overflow-x-auto whitespace-pre-wrap">{code}</pre>
      </div>
    );
  }

  return (
    <div className="my-4 rounded-xl border border-surface-4 bg-surface-2 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-surface-3/50 border-b border-surface-4">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-brand-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3z" />
            <path d="M14 17h7M17.5 14v7" />
          </svg>
          <span className="text-xs font-medium text-slate-300">
            {title || "Flowchart"}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleCopy}
            className="px-2 py-1 text-[10px] text-slate-400 hover:text-white bg-surface-3 hover:bg-surface-4 rounded transition-colors"
          >
            {copied ? "✓ Copied" : "Copy Code"}
          </button>
          {svg && (
            <button
              onClick={handleDownloadSvg}
              className="px-2 py-1 text-[10px] text-slate-400 hover:text-white bg-surface-3 hover:bg-surface-4 rounded transition-colors"
            >
              ↓ SVG
            </button>
          )}
        </div>
      </div>

      {/* Diagram */}
      <div
        ref={containerRef}
        className="p-4 flex justify-center items-center overflow-x-auto min-h-[120px]"
        dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
      >
        {!svg && (
          <div className="flex items-center gap-2 text-slate-500 text-sm">
            <div className="w-4 h-4 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" />
            Rendering diagram…
          </div>
        )}
      </div>
    </div>
  );
}

// Parse mermaid blocks from markdown content
export function parseMermaidBlocks(content: string): { text: string; diagrams: { code: string; title?: string }[] } {
  const diagrams: { code: string; title?: string }[] = [];
  const text = content.replace(/```mermaid\n([\s\S]*?)```/g, (_, code) => {
    const trimmed = code.trim();
    if (trimmed) {
      diagrams.push({ code: trimmed });
      return `<!--mermaid:${diagrams.length - 1}-->`;
    }
    return _;
  });
  return { text, diagrams };
}
