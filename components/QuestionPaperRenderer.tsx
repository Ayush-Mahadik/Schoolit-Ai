"use client";

import { useState, useCallback } from "react";

interface PaperQuestion {
  number: number;
  text: string;
  marks: number;
  type: string;
  options?: string[];
  answer?: string;
  marking_scheme?: string;
}

interface PaperSection {
  name: string;
  instructions: string;
  questions: PaperQuestion[];
}

interface QuestionPaperRendererProps {
  subject: string;
  subjectLabel: string;
  paperTypeLabel: string;
  chapters: string;
  totalMarks: number;
  includeAnswers: boolean;
  sections: PaperSection[];
}

/**
 * Renders a CBSE-style question paper with toggleable model answers.
 */
export function QuestionPaperRenderer({
  subjectLabel,
  paperTypeLabel,
  chapters,
  totalMarks,
  includeAnswers,
  sections,
}: QuestionPaperRendererProps) {
  const [showAnswers, setShowAnswers] = useState(false);
  const [expandedQuestions, setExpandedQuestions] = useState<Set<string>>(new Set());

  const toggleQuestion = useCallback((key: string) => {
    setExpandedQuestions((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const totalQuestions = sections.reduce((sum, s) => sum + s.questions.length, 0);

  return (
    <div className="my-4 rounded-xl border border-surface-4 bg-surface-2 overflow-hidden">
      {/* Paper Header */}
      <div className="bg-gradient-to-r from-blue-500/10 to-cyan-500/10 border-b border-surface-4 px-5 py-4">
        <div className="text-center space-y-1">
          <div className="text-[10px] text-slate-500 uppercase tracking-widest">
            Central Board of Secondary Education
          </div>
          <h2 className="text-lg font-bold text-white">{paperTypeLabel}</h2>
          <h3 className="text-sm font-semibold text-blue-400">{subjectLabel}</h3>
          <div className="flex items-center justify-center gap-4 text-[10px] text-slate-400 mt-2">
            <span>📝 Total Marks: <strong className="text-white">{totalMarks}</strong></span>
            <span>•</span>
            <span>📋 Questions: <strong className="text-white">{totalQuestions}</strong></span>
            <span>•</span>
            <span>📖 {chapters}</span>
          </div>
        </div>
      </div>

      {/* General Instructions */}
      <div className="px-5 py-3 bg-surface-3/30 border-b border-surface-4">
        <div className="text-[10px] text-slate-500 uppercase tracking-wide font-bold mb-1.5">
          General Instructions
        </div>
        <ul className="text-xs text-slate-400 space-y-0.5 list-disc list-inside">
          <li>All questions are compulsory unless stated otherwise.</li>
          <li>Internal choices are provided in some questions.</li>
          <li>Marks for each question are indicated against it.</li>
          <li>Write neat and legible answers.</li>
        </ul>
      </div>

      {/* Answer toggle */}
      {includeAnswers && (
        <div className="px-5 py-2 border-b border-surface-4 flex items-center justify-between">
          <span className="text-[10px] text-slate-500">Model answers & marking scheme</span>
          <button
            onClick={() => setShowAnswers(!showAnswers)}
            className={`px-3 py-1 rounded-lg text-[10px] font-bold transition-colors ${
              showAnswers
                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                : "bg-surface-4 text-slate-400 hover:text-white border border-surface-4"
            }`}
          >
            {showAnswers ? "🔒 Hide Answers" : "🔑 Show Answers"}
          </button>
        </div>
      )}

      {/* Sections */}
      <div className="p-4 space-y-5">
        {sections.map((section, sIdx) => (
          <div key={sIdx}>
            {/* Section header */}
            <div className="flex items-center gap-2 mb-2">
              <div className="h-px flex-1 bg-surface-4" />
              <span className="text-xs font-bold text-blue-400 uppercase tracking-wide px-2">
                {section.name}
              </span>
              <div className="h-px flex-1 bg-surface-4" />
            </div>
            {section.instructions && (
              <p className="text-[10px] text-slate-500 italic mb-3 text-center">
                {section.instructions}
              </p>
            )}

            {/* Questions */}
            <div className="space-y-3">
              {section.questions.map((q, qIdx) => {
                const key = `${sIdx}-${qIdx}`;
                const isExpanded = expandedQuestions.has(key);

                return (
                  <div
                    key={key}
                    className="rounded-lg border border-surface-4 bg-surface-3/20 overflow-hidden"
                  >
                    <div className="p-3">
                      <div className="flex items-start gap-2">
                        <span className="text-[10px] font-mono text-slate-500 bg-surface-4 px-1.5 py-0.5 rounded shrink-0">
                          {q.number || qIdx + 1}
                        </span>
                        <p className="text-sm text-slate-200 leading-relaxed flex-1">
                          {q.text}
                        </p>
                        <span className="text-[10px] text-slate-500 bg-surface-4 px-1.5 py-0.5 rounded shrink-0">
                          [{q.marks}m]
                        </span>
                      </div>

                      {/* MCQ options */}
                      {q.options && q.options.length > 0 && (
                        <div className="mt-2 ml-6 space-y-1">
                          {q.options.map((opt, optIdx) => (
                            <div
                              key={optIdx}
                              className="flex items-center gap-2 text-xs text-slate-400"
                            >
                              <span className="w-4 text-right text-slate-600 text-[10px]">
                                ({String.fromCharCode(97 + optIdx)})
                              </span>
                              <span>{opt}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Answer section */}
                    {includeAnswers && q.answer && (
                      <>
                        {showAnswers ? (
                          <div className="border-t border-surface-4 bg-emerald-900/5 px-3 py-2">
                            <button
                              onClick={() => toggleQuestion(key)}
                              className="text-[10px] text-emerald-400 font-bold uppercase tracking-wide hover:text-emerald-300 w-full text-left"
                            >
                              {isExpanded ? "▼ Model Answer" : "▶ Model Answer"}
                            </button>
                            {isExpanded && (
                              <div className="mt-2 space-y-1">
                                <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">
                                  {q.answer}
                                </p>
                                {q.marking_scheme && (
                                  <p className="text-[10px] text-amber-400/70 italic mt-1">
                                    📋 {q.marking_scheme}
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        ) : null}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Print / Download hint */}
      <div className="px-5 py-2 border-t border-surface-4 bg-surface-3/20 text-center">
        <span className="text-[10px] text-slate-600">
          💡 Tip: Use Ctrl+P to print this question paper for offline practice
        </span>
      </div>
    </div>
  );
}
