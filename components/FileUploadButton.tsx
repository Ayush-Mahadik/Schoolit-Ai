"use client";

import { useRef, useCallback } from "react";
import { Paperclip, X as XIcon } from "@/components/Icons";

export interface FileAttachment {
  name: string;
  content: string;
  type: string;
  size: number;
}

interface FileUploadButtonProps {
  onFilesSelected: (files: FileAttachment[]) => void;
  disabled?: boolean;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ACCEPTED_TYPES = [
  // Text & documents
  "text/plain", "text/markdown", "text/csv", "text/html", "text/css",
  "text/xml", "text/yaml", "text/x-yaml",
  "application/json", "application/pdf", "application/xml",
  "application/rtf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-excel", "application/vnd.ms-powerpoint", "application/msword",
  // Images
  "image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml",
  "image/bmp", "image/tiff",
  // Archives
  "application/zip", "application/gzip", "application/x-tar",
  // Code (treated as text)
  "application/javascript", "application/typescript",
];
const ACCEPTED_EXTENSIONS = [
  // Documents
  ".txt", ".md", ".csv", ".json", ".pdf", ".rtf",
  ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
  ".xml", ".yaml", ".yml", ".toml", ".ini", ".cfg", ".conf",
  // Images
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".tiff", ".ico",
  // Code
  ".py", ".js", ".ts", ".jsx", ".tsx", ".html", ".css", ".scss", ".less",
  ".java", ".c", ".cpp", ".h", ".hpp", ".cs", ".go", ".rs", ".rb",
  ".php", ".swift", ".kt", ".scala", ".r", ".m", ".lua", ".sh", ".bash",
  ".ps1", ".bat", ".cmd", ".sql", ".graphql", ".proto",
  // Data
  ".env", ".log", ".jsonl", ".ndjson",
  // Archives
  ".zip", ".gz", ".tar",
];

const TEXT_EXTENSIONS = new Set([
  ".txt", ".md", ".csv", ".json", ".xml", ".yaml", ".yml", ".toml", ".ini", ".cfg", ".conf",
  ".py", ".js", ".ts", ".jsx", ".tsx", ".html", ".css", ".scss", ".less",
  ".java", ".c", ".cpp", ".h", ".hpp", ".cs", ".go", ".rs", ".rb", ".php", ".swift", ".kt", ".scala", ".r", ".m", ".lua", ".sh", ".bash", ".ps1", ".bat", ".cmd", ".sql", ".graphql", ".proto",
  ".env", ".log", ".jsonl", ".ndjson",
]);

function isTextLikeFile(file: File): boolean {
  const lower = file.name.toLowerCase();
  const dot = lower.lastIndexOf(".");
  const ext = dot >= 0 ? lower.slice(dot) : "";
  if (file.type.startsWith("text/")) return true;
  if (["application/json", "application/xml", "application/javascript", "application/typescript"].includes(file.type)) return true;
  return TEXT_EXTENSIONS.has(ext);
}

export function FileUploadButton({ onFilesSelected, disabled }: FileUploadButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const readFile = useCallback(async (file: File): Promise<FileAttachment | null> => {
    if (file.size > MAX_FILE_SIZE) {
      alert(`File "${file.name}" is too large (max 10 MB).`);
      return null;
    }

    return new Promise((resolve) => {
      const reader = new FileReader();

      if (file.type.startsWith("image/")) {
        // Read images as data URLs (for GPT-4o vision)
        reader.onload = () => {
          resolve({
            name: file.name,
            content: reader.result as string,
            type: file.type,
            size: file.size,
          });
        };
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
      } else if (isTextLikeFile(file)) {
        // Read text files as text
        reader.onload = () => {
          resolve({
            name: file.name,
            content: reader.result as string,
            type: file.type || "text/plain",
            size: file.size,
          });
        };
        reader.onerror = () => resolve(null);
        reader.readAsText(file);
      } else {
        // Binary docs/archives: don't decode to text (prevents gibberish and model crashes)
        resolve({
          name: file.name,
          content: `[BINARY_FILE]\nname=${file.name}\ntype=${file.type || "application/octet-stream"}\nsize=${file.size}\nThis file is binary. Use analyze_document or summarize intent from filename/metadata.`,
          type: file.type || "application/octet-stream",
          size: file.size,
        });
      }
    });
  }, []);

  const handleChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      if (files.length === 0) return;

      const attachments: FileAttachment[] = [];
      for (const file of files.slice(0, 5)) {
        const att = await readFile(file);
        if (att) attachments.push(att);
      }

      if (attachments.length > 0) {
        onFilesSelected(attachments);
      }

      // Reset input so re-uploading same file works
      if (inputRef.current) inputRef.current.value = "";
    },
    [onFilesSelected, readFile]
  );

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPTED_EXTENSIONS.join(",")}
        onChange={handleChange}
        className="hidden"
        aria-label="Upload files for context"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        className="p-2 rounded-lg text-slate-500 hover:text-white hover:bg-surface-3 disabled:opacity-40 transition-colors shrink-0"
        title="Attach files (browser file picker permission will be requested when you choose files)"
      >
        <Paperclip className="w-4 h-4" />
      </button>
    </>
  );
}

// ── File attachment preview chips ─────────────────────────────────────
export function FileChips({
  files,
  onRemove,
}: {
  files: FileAttachment[];
  onRemove: (index: number) => void;
}) {
  if (files.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5 px-1 py-1.5">
      {files.map((f, i) => (
        <span
          key={`${f.name}-${i}`}
          className="inline-flex items-center gap-1 px-2 py-0.5 bg-surface-3 text-slate-300 rounded-md text-[11px] border border-surface-3/80"
        >
          <Paperclip className="w-3 h-3 text-slate-500" />
          {f.name.length > 20 ? f.name.slice(0, 18) + "…" : f.name}
          <button
            onClick={() => onRemove(i)}
            className="text-slate-600 hover:text-red-400 ml-0.5 transition-colors"
            aria-label={`Remove ${f.name}`}
          >
            <XIcon className="w-3 h-3" />
          </button>
        </span>
      ))}
    </div>
  );
}
