"use client";

import { useState, useRef } from "react";
import { uploadPdf, listPdfs, deletePdf } from "@/lib/api";
import { useEffect } from "react";

interface PdfUploaderProps {
  subject: string;
  onClose: () => void;
}

interface PdfInfo {
  pdf_id: string;
  filename: string;
  pages: number;
}

export function PdfUploader({ subject, onClose }: PdfUploaderProps) {
  const [pdfs, setPdfs] = useState<PdfInfo[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load existing PDFs for this subject
  useEffect(() => {
    listPdfs(subject).then(setPdfs).catch(console.error);
  }, [subject]);

  const handleUpload = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      alert("Only PDF files are supported.");
      return;
    }

    setUploading(true);
    try {
      const result = await uploadPdf(file, subject);
      setPdfs((prev) => [
        ...prev,
        { pdf_id: result.pdf_id, filename: result.filename, pages: 0 },
      ]);
    } catch (error) {
      console.error("Upload error:", error);
      alert("Failed to upload PDF. Make sure the backend is running.");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (pdfId: string) => {
    try {
      await deletePdf(pdfId);
      setPdfs((prev) => prev.filter((p) => p.pdf_id !== pdfId));
    } catch (error) {
      console.error("Delete error:", error);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleUpload(file);
  };

  return (
    <div className="p-4 bg-surface-1">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-white">
            📄 PDF Reference Material — {subject.charAt(0).toUpperCase() + subject.slice(1)}
          </h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-xs"
          >
            ✕ Close
          </button>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
            dragOver
              ? "border-brand-500 bg-brand-600/10"
              : "border-surface-4 hover:border-surface-3 bg-surface-2"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleUpload(file);
            }}
          />
          {uploading ? (
            <p className="text-sm text-brand-400">⏳ Uploading & extracting text...</p>
          ) : (
            <>
              <p className="text-sm text-slate-400">
                Drop a PDF here or click to upload
              </p>
              <p className="text-[10px] text-slate-600 mt-1">
                Textbooks, exemplars, study guides — the AI will use them as context
              </p>
            </>
          )}
        </div>

        {/* Uploaded PDFs list */}
        {pdfs.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {pdfs.map((pdf) => (
              <div
                key={pdf.pdf_id}
                className="flex items-center justify-between px-3 py-2 bg-surface-2 rounded-lg border border-surface-4"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm">📄</span>
                  <span className="text-xs text-slate-300 truncate">
                    {pdf.filename}
                  </span>
                  {pdf.pages > 0 && (
                    <span className="text-[10px] text-slate-500">
                      ({pdf.pages} pages)
                    </span>
                  )}
                </div>
                <button
                  onClick={() => handleDelete(pdf.pdf_id)}
                  className="text-red-400 hover:text-red-300 text-xs shrink-0 ml-2"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
