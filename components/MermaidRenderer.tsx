"use client";

import { useEffect, useRef, useState, useId, useMemo, useCallback } from "react";

interface MermaidRendererProps {
  code: string;
  title?: string;
}

// Module-level flag to avoid re-initializing mermaid
// Set to false to force re-init when theme changes
let mermaidInitialized = false;

export function MermaidRenderer({ code, title }: MermaidRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const uniqueId = useId().replace(/:/g, "_");

  // Aggressively sanitize the mermaid code
  const sanitizedCode = useMemo(() => sanitizeMermaidCode(code), [code]);

  useEffect(() => {
    let cancelled = false;

    async function render() {
      try {
        const mermaid = (await import("mermaid")).default;

        // Initialize only once
        if (!mermaidInitialized) {
          mermaid.initialize({
            startOnLoad: false,
            theme: "dark",
            securityLevel: "loose",
            suppressErrorRendering: true,
            themeVariables: {
              primaryColor: "#3b82f6",
              primaryTextColor: "#e2e8f0",
              primaryBorderColor: "#3b82f6",
              lineColor: "#94a3b8",
              secondaryColor: "#6366f1",
              tertiaryColor: "#060a10",
              background: "#060a10",
              mainBkg: "#0c1220",
              nodeBorder: "#3b82f6",
              clusterBkg: "#0c1220",
              titleColor: "#e2e8f0",
              edgeLabelBackground: "#0c1220",
              actorBkg: "#141e30",
              actorTextColor: "#e2e8f0",
              actorBorder: "#3b82f6",
              signalColor: "#e2e8f0",
              labelBoxBkgColor: "#0c1220",
              labelBoxBorderColor: "#3b82f6",
              labelTextColor: "#e2e8f0",
              loopTextColor: "#3b82f6",
              noteBkgColor: "#141e30",
              noteTextColor: "#e2e8f0",
              noteBorderColor: "#3b82f6",
            },
            flowchart: {
              htmlLabels: true,
              curve: "basis",
              padding: 12,
              useMaxWidth: true,
            },
            fontFamily: "Inter, system-ui, sans-serif",
            fontSize: 13,
          });
          mermaidInitialized = true;
        }

        // Parse first to catch syntax errors before rendering
        const validCode = sanitizedCode;
        let parseOk = true;
        try {
          await mermaid.parse(validCode);
        } catch {
          parseOk = false;
        }

        if (!parseOk) {
          // Try simplified fallbacks
          const fallbackCandidates = [
            simplifyToFlowchart(validCode),
            buildSequentialFlowchart(validCode),
          ].filter(Boolean) as string[];

          for (const fallback of fallbackCandidates) {
            try {
              await mermaid.parse(fallback);
              const { svg: renderedSvg } = await mermaid.render(`mermaid_${uniqueId}`, fallback);
              if (!cancelled && renderedSvg && !renderedSvg.includes("Syntax error")) {
                setSvg(renderedSvg);
                setError("");
                return;
              }
            } catch {
              // try next fallback
            }
          }

          if (!cancelled) {
            setError("Diagram syntax could not be parsed");
            setSvg("");
          }
          return;
        }

        const { svg: renderedSvg } = await mermaid.render(
          `mermaid_${uniqueId}`,
          validCode
        );

        if (!cancelled) {
          // Check if mermaid rendered an error SVG instead of a real diagram
          if (renderedSvg && (renderedSvg.includes("Syntax error") || renderedSvg.includes("error-icon"))) {
            setError("Diagram rendered with errors");
            setSvg("");
          } else {
            setSvg(renderedSvg);
            setError("");
          }
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
  }, [sanitizedCode, uniqueId]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [code]);

  const handleDownloadSvg = useCallback(() => {
    if (!svg) return;
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title || "diagram"}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }, [svg, title]);

  // ── Error state: clean fallback with code viewer ──
  if (error) {
    return (
      <div className="my-4 rounded-xl border border-blue-500/20 bg-surface-2 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 bg-surface-3/50 border-b border-blue-500/20">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="3" />
              <path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3z" />
              <path d="M14 17h7M17.5 14v7" />
            </svg>
            <span className="text-xs font-bold text-blue-400 uppercase tracking-wide">{title || "Diagram"}</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowCode(!showCode)}
              className="px-2 py-1 text-[10px] text-slate-400 hover:text-white bg-surface-3 hover:bg-surface-4 rounded transition-colors font-medium"
            >
              {showCode ? "Hide" : "View Code"}
            </button>
            <button
              onClick={handleCopy}
              className="px-2 py-1 text-[10px] text-slate-400 hover:text-white bg-surface-3 hover:bg-surface-4 rounded transition-colors font-medium"
            >
              {copied ? "✓ Copied" : "Copy"}
            </button>
          </div>
        </div>
        <div className="p-4">
          <p className="text-xs text-slate-500 mb-1">Couldn&apos;t render this diagram inline. Copy the code and paste it in <a href="https://mermaid.live" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline font-semibold">Mermaid Live Editor →</a></p>
          {showCode && (
            <pre className="mt-3 text-xs text-slate-400 overflow-x-auto whitespace-pre-wrap bg-black/50 rounded-lg p-3 border border-surface-4 font-mono">{sanitizedCode}</pre>
          )}
        </div>
      </div>
    );
  }

  // ── Success state: render diagram ──
  return (
    <div className="my-4 rounded-xl border border-surface-4 bg-surface-2 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-surface-3/50 border-b border-surface-4">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="3" />
            <path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3z" />
            <path d="M14 17h7M17.5 14v7" />
          </svg>
          <span className="text-xs font-bold text-white uppercase tracking-wide">
            {title || "Flowchart"}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleCopy}
            className="px-2 py-1 text-[10px] text-slate-400 hover:text-white bg-surface-3 hover:bg-surface-4 rounded transition-colors font-medium"
          >
            {copied ? "✓ Copied" : "Copy Code"}
          </button>
          {svg && (
            <button
              onClick={handleDownloadSvg}
              className="px-2 py-1 text-[10px] text-slate-400 hover:text-white bg-surface-3 hover:bg-surface-4 rounded transition-colors font-medium"
            >
              ↓ SVG
            </button>
          )}
        </div>
      </div>

      {/* Diagram */}
      <div
        ref={containerRef}
        className="p-4 flex justify-center items-center overflow-x-auto min-h-[120px] mermaid-output"
        dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
      >
        {!svg && (
          <div className="flex items-center gap-2 text-slate-500 text-sm">
            <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            Rendering diagram…
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
//  SANITIZER: Fix common AI-generated Mermaid syntax issues
// ══════════════════════════════════════════════════════════════════════
function sanitizeMermaidCode(code: string): string {
  let cleaned = code.trim();

  // 1. Remove markdown fences
  cleaned = cleaned.replace(/^```(?:mermaid)?\s*\n?/i, "").replace(/\n?\s*```$/i, "");

  // 2. Fix Unicode issues
  cleaned = cleaned.replace(/[\u201C\u201D\u201E\u201F\u2033]/g, '"');
  cleaned = cleaned.replace(/[\u2018\u2019\u201A\u201B\u2032]/g, "'");
  cleaned = cleaned.replace(/[\uFEFF\u200B\u200C\u200D\u00A0]/g, "");
  cleaned = cleaned.replace(/\u2014/g, "--");
  cleaned = cleaned.replace(/\u2013/g, "--");
  cleaned = cleaned.replace(/\u2192/g, "-->");
  cleaned = cleaned.replace(/\u2190/g, "<--");
  cleaned = cleaned.replace(/\u21D2/g, "==>");
  cleaned = cleaned.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // 3. Remove trailing semicolons
  cleaned = cleaned.replace(/;\s*$/gm, "");

  // 4. Fix "graph" without direction
  cleaned = cleaned.replace(/^graph\s*$/m, "graph TD");

  // 5. Fix node labels with special chars — wrap in quotes
  cleaned = cleaned.replace(
    /\[([^\]"]*[(){}|<>&][^\]"]*)\]/g,
    (_, inner) => `["${inner.replace(/"/g, "'")}"]`
  );

  // 6. Fix missing spaces around arrows
  cleaned = cleaned.replace(/(\w)(-->)(\w)/g, "$1 --> $3");
  cleaned = cleaned.replace(/(\w)(==>)(\w)/g, "$1 ==> $3");
  cleaned = cleaned.replace(/(\w)(-\.->)(\w)/g, "$1 -.-> $3");

  // 7. Fix tabs
  cleaned = cleaned.replace(/\t/g, "    ");

  // 8. Remove excessive blank lines
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");

  // 8b. Remove prose lines that often break parser
  cleaned = cleaned
    .split("\n")
    .filter((line) => !/^\s*(Explanation|Notes?|Description)\s*:/i.test(line))
    .join("\n");

  // 9. Fix subgraph without name
  cleaned = cleaned.replace(/^(subgraph)\s*$/gm, "subgraph Default");

  // 10. Fix --text--> to -->|text|
  cleaned = cleaned.replace(/--([^->\n|]+)-->/g, "-->|$1|");

  // 11. Fix colons in node labels that break parsing (wrap in quotes)
  cleaned = cleaned.replace(/\[([^\]"]*:[^\]"]*)\]/g, (_, inner) => `["${inner.replace(/"/g, "'")}"]`);

  // 12. Fix emoji/special chars in labels — wrap unquoted labels containing non-ASCII
  cleaned = cleaned.replace(/\[([^\]"]*[^\x00-\x7F][^\]"]*)\]/g, (_, inner) => `["${inner.replace(/"/g, "'")}"]`);

  // 13. Ensure first line has a valid diagram type
  const firstLine = cleaned.split("\n")[0].trim().toLowerCase();
  const validTypes = ["graph", "flowchart", "sequencediagram", "classDiagram", "statediagram", "erdiagram", "gantt", "pie", "gitgraph", "mindmap", "timeline", "sankey", "xychart", "block"];
  const hasValidType = validTypes.some(t => firstLine.startsWith(t.toLowerCase()));
  if (!hasValidType && !firstLine.startsWith("---")) {
    cleaned = "graph TD\n" + cleaned;
  }

  return cleaned.trim();
}

// ══════════════════════════════════════════════════════════════════════
//  FALLBACK: Simplify invalid diagram to basic flowchart
// ══════════════════════════════════════════════════════════════════════
function simplifyToFlowchart(code: string): string | null {
  try {
    const lines = code.split("\n").filter((l) => l.trim());
    if (lines.length < 2) return null;

    const connections: string[] = [];
    const nodeLabels: Record<string, string> = {};

    for (const line of lines) {
      const connMatch = line.match(/(\w+)(?:\[([^\]]*)\])?\s*(?:-->|==>|---|-\.->)\|?([^|]*)\|?\s*(\w+)(?:\[([^\]]*)\])?/);
      if (connMatch) {
        const [, fromId, fromLabel, edgeLabel, toId, toLabel] = connMatch;
        if (fromLabel) nodeLabels[fromId] = fromLabel;
        if (toLabel) nodeLabels[toId] = toLabel;
        const edge = edgeLabel?.trim()
          ? `${fromId} -->|${edgeLabel.trim()}| ${toId}`
          : `${fromId} --> ${toId}`;
        connections.push(`    ${edge}`);
      }
      const nodeMatch = line.match(/^\s*(\w+)\[([^\]]+)\]\s*$/);
      if (nodeMatch) {
        nodeLabels[nodeMatch[1]] = nodeMatch[2];
      }
    }

    if (connections.length === 0) return null;

    const nodeDefs = Object.entries(nodeLabels)
      .map(([id, label]) => `    ${id}["${label.replace(/"/g, "'")}"]`)
      .join("\n");

    return `graph TD\n${nodeDefs}\n${connections.join("\n")}`;
  } catch {
    return null;
  }
}

function buildSequentialFlowchart(code: string): string | null {
  try {
    const lines = code
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .filter((l) => !/^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|journey|mindmap|timeline)/i.test(l));

    const labels = lines
      .map((line) => line
        .replace(/^[\-\*\d\.\)\s]+/, "")
        .replace(/\[|\]|\{|\}|\(|\)/g, "")
        .trim())
      .filter((l) => l.length > 0)
      .slice(0, 10);

    if (labels.length < 2) return null;

    const nodes = labels.map((label, i) => `    N${i}["${label.replace(/"/g, "'")}"]`).join("\n");
    const edges = labels.slice(1).map((_, i) => `    N${i} --> N${i + 1}`).join("\n");

    return `graph TD\n${nodes}\n${edges}`;
  } catch {
    return null;
  }
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
