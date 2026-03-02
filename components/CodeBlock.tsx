"use client";

import { useState, useMemo } from "react";
import hljs from "highlight.js/lib/common";

// Register additional languages useful for students
// highlight.js/lib/common already includes: bash, c, cpp, csharp, css, diff, go, graphql,
// ini, java, javascript, json, kotlin, less, lua, makefile, markdown, objectivec,
// perl, php, plaintext, python, python-repl, r, ruby, rust, scss, shell, sql, swift,
// typescript, vbnet, wasm, xml, yaml

interface CodeBlockProps {
  code: string;
  language?: string;
}

// Language display names
const LANG_LABELS: Record<string, string> = {
  python: "Python",
  javascript: "JavaScript",
  typescript: "TypeScript",
  java: "Java",
  c: "C",
  cpp: "C++",
  csharp: "C#",
  css: "CSS",
  html: "HTML",
  xml: "XML",
  json: "JSON",
  sql: "SQL",
  bash: "Bash",
  shell: "Shell",
  ruby: "Ruby",
  go: "Go",
  rust: "Rust",
  swift: "Swift",
  kotlin: "Kotlin",
  r: "R",
  lua: "Lua",
  perl: "Perl",
  php: "PHP",
  scss: "SCSS",
  less: "Less",
  yaml: "YAML",
  markdown: "Markdown",
  diff: "Diff",
  makefile: "Makefile",
  graphql: "GraphQL",
  plaintext: "Text",
  text: "Text",
  ini: "INI",
  toml: "TOML",
};

export function CodeBlock({ code, language }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  // Normalize language name
  const lang = useMemo(() => {
    if (!language) return "";
    const l = language.toLowerCase().replace("language-", "");
    // Map common aliases
    if (l === "js") return "javascript";
    if (l === "ts") return "typescript";
    if (l === "py") return "python";
    if (l === "rb") return "ruby";
    if (l === "sh" || l === "zsh") return "bash";
    if (l === "yml") return "yaml";
    if (l === "htm") return "html";
    if (l === "c++") return "cpp";
    if (l === "c#") return "csharp";
    return l;
  }, [language]);

  // Highlight the code
  const highlighted = useMemo(() => {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
      } catch { /* fall through */ }
    }
    // Auto-detect language if not specified
    try {
      const result = hljs.highlightAuto(code);
      return result.value;
    } catch { /* fall through */ }
    return null;
  }, [code, lang]);

  const handleCopy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const displayLang = LANG_LABELS[lang] || lang.toUpperCase() || "Code";
  const lineCount = code.split("\n").length;

  return (
    <div className="code-block-container group/code rounded-xl overflow-hidden my-3 border border-surface-3/60 bg-[#0d1117]">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-surface-3/30 border-b border-surface-3/40">
        <div className="flex items-center gap-2">
          {/* Traffic light dots */}
          <div className="flex gap-1.5 mr-2">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
            <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
            <span className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
          </div>
          <span className="text-[11px] text-slate-400 font-medium tracking-wide">
            {displayLang}
          </span>
          {lineCount > 5 && (
            <span className="text-[10px] text-slate-600 font-mono">
              {lineCount} lines
            </span>
          )}
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-white transition-colors px-2 py-1 rounded-md hover:bg-white/5"
        >
          {copied ? (
            <>
              <svg className="w-3.5 h-3.5 text-green-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span className="text-green-400">Copied!</span>
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              Copy
            </>
          )}
        </button>
      </div>

      {/* Code content with line numbers */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <tbody>
            {code.split("\n").map((line, i) => (
              <tr key={i} className="hover:bg-white/[0.02]">
                {lineCount > 3 && (
                  <td className="select-none text-right pr-4 pl-4 py-0 text-[12px] text-slate-600/50 font-mono align-top w-[1%] whitespace-nowrap border-r border-surface-3/20">
                    {i + 1}
                  </td>
                )}
                <td className="px-4 py-0">
                  {highlighted ? (
                    <code
                      className="text-[13px] font-mono leading-[1.6]"
                      dangerouslySetInnerHTML={{
                        __html: hljs.highlight(line, {
                          language: lang && hljs.getLanguage(lang) ? lang : "plaintext",
                          ignoreIllegals: true,
                        }).value || line || " ",
                      }}
                    />
                  ) : (
                    <code className="text-[13px] font-mono leading-[1.6] text-slate-300">
                      {line || " "}
                    </code>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
