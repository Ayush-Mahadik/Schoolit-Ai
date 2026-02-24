"use client";

import { useState, useCallback } from "react";

interface QuizQuestion {
  question: string;
  options: string[];
  correct: number;
  explanation: string;
}

interface QuizRendererProps {
  topic: string;
  questions: QuizQuestion[];
  difficulty?: string;
}

/**
 * Interactive quiz component with scoring and explanations.
 */
export function QuizRenderer({ topic, questions, difficulty }: QuizRendererProps) {
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [showResults, setShowResults] = useState(false);
  const [revealedExplanations, setRevealedExplanations] = useState<Set<number>>(new Set());

  const handleSelect = useCallback((qIdx: number, optIdx: number) => {
    if (showResults) return;
    setAnswers((prev) => ({ ...prev, [qIdx]: optIdx }));
  }, [showResults]);

  const handleSubmit = useCallback(() => {
    setShowResults(true);
  }, []);

  const handleReset = useCallback(() => {
    setAnswers({});
    setShowResults(false);
    setRevealedExplanations(new Set());
  }, []);

  const toggleExplanation = useCallback((idx: number) => {
    setRevealedExplanations((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  const score = showResults
    ? questions.reduce((acc, q, i) => acc + (answers[i] === q.correct ? 1 : 0), 0)
    : 0;
  const totalAnswered = Object.keys(answers).length;

  if (questions.length === 0) return null;

  return (
    <div className="my-4 rounded-xl border border-surface-4 bg-surface-2 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-surface-3/50 border-b border-surface-4">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-purple-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
            <circle cx="12" cy="17" r="0.5" fill="currentColor" />
          </svg>
          <span className="text-xs font-bold text-white uppercase tracking-wide">
            Quiz — {topic}
          </span>
          {difficulty && (
            <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${
              difficulty === "easy" ? "text-green-400 bg-green-500/10" :
              difficulty === "hard" ? "text-red-400 bg-red-500/10" :
              "text-amber-400 bg-amber-500/10"
            }`}>
              {difficulty}
            </span>
          )}
          <span className="text-[10px] text-slate-500">{questions.length} questions</span>
        </div>
        {showResults && (
          <button
            onClick={handleReset}
            className="px-2 py-1 text-[10px] text-slate-400 hover:text-white bg-surface-3 hover:bg-surface-4 rounded transition-colors font-medium"
          >
            Retry Quiz
          </button>
        )}
      </div>

      {/* Score banner */}
      {showResults && (
        <div className={`px-4 py-3 border-b border-surface-4 ${
          score === questions.length ? "bg-emerald-500/10" :
          score >= questions.length * 0.7 ? "bg-blue-500/10" :
          score >= questions.length * 0.4 ? "bg-amber-500/10" :
          "bg-red-500/10"
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-white">{score}/{questions.length}</span>
              <span className="text-xs text-slate-400">
                {score === questions.length ? "🎉 Perfect Score!" :
                 score >= questions.length * 0.7 ? "👏 Great job!" :
                 score >= questions.length * 0.4 ? "📖 Keep studying!" :
                 "💪 Review the material and try again!"}
              </span>
            </div>
            <span className="text-sm font-mono text-slate-400">
              {Math.round((score / questions.length) * 100)}%
            </span>
          </div>
          {/* Score bar */}
          <div className="mt-2 h-1.5 bg-surface-4 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                score === questions.length ? "bg-emerald-500" :
                score >= questions.length * 0.7 ? "bg-blue-500" :
                score >= questions.length * 0.4 ? "bg-amber-500" :
                "bg-red-500"
              }`}
              style={{ width: `${(score / questions.length) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Questions */}
      <div className="p-4 space-y-4">
        {questions.map((q, qIdx) => {
          const selected = answers[qIdx];
          const isCorrect = showResults && selected === q.correct;
          const isWrong = showResults && selected !== undefined && selected !== q.correct;

          return (
            <div
              key={qIdx}
              className={`rounded-lg border p-4 transition-colors ${
                showResults
                  ? isCorrect
                    ? "border-emerald-500/30 bg-emerald-900/10"
                    : isWrong
                    ? "border-red-500/30 bg-red-900/10"
                    : "border-surface-4 bg-surface-3/50"
                  : "border-surface-4 bg-surface-3/30"
              }`}
            >
              {/* Question text */}
              <div className="flex gap-2 mb-3">
                <span className="text-[10px] font-mono text-slate-500 bg-surface-4 px-1.5 py-0.5 rounded h-fit shrink-0">
                  Q{qIdx + 1}
                </span>
                <p className="text-sm text-slate-200 font-medium leading-relaxed">{q.question}</p>
              </div>

              {/* Options */}
              <div className="space-y-2 ml-6">
                {q.options.map((opt, optIdx) => {
                  const isSelected = selected === optIdx;
                  const isCorrectAnswer = showResults && optIdx === q.correct;
                  const isWrongSelected = showResults && isSelected && optIdx !== q.correct;

                  return (
                    <button
                      key={optIdx}
                      onClick={() => handleSelect(qIdx, optIdx)}
                      disabled={showResults}
                      className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-all flex items-center gap-2 ${
                        isCorrectAnswer
                          ? "bg-emerald-500/20 border border-emerald-500/40 text-emerald-300"
                          : isWrongSelected
                          ? "bg-red-500/20 border border-red-500/40 text-red-300"
                          : isSelected && !showResults
                          ? "bg-blue-500/20 border border-blue-500/40 text-blue-300"
                          : "bg-surface-4/50 border border-surface-4 text-slate-400 hover:border-blue-500/30 hover:text-white"
                      } disabled:cursor-default`}
                    >
                      <span className="w-5 h-5 rounded-full border flex items-center justify-center shrink-0 text-[10px] font-bold">
                        {String.fromCharCode(65 + optIdx)}
                      </span>
                      <span className="flex-1">{opt}</span>
                      {isCorrectAnswer && (
                        <svg className="w-4 h-4 text-emerald-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                      {isWrongSelected && (
                        <svg className="w-4 h-4 text-red-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Explanation toggle */}
              {showResults && q.explanation && (
                <div className="ml-6 mt-2">
                  <button
                    onClick={() => toggleExplanation(qIdx)}
                    className="text-[10px] text-blue-400 hover:text-blue-300 font-medium"
                  >
                    {revealedExplanations.has(qIdx) ? "Hide explanation" : "Show explanation"}
                  </button>
                  {revealedExplanations.has(qIdx) && (
                    <p className="mt-1 text-xs text-slate-400 leading-relaxed bg-surface-3/50 rounded-lg p-2 border border-surface-4">
                      {q.explanation}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Submit button */}
        {!showResults && (
          <button
            onClick={handleSubmit}
            disabled={totalAnswered < questions.length}
            className="w-full py-2.5 rounded-xl bg-blue-500 hover:bg-blue-400 disabled:bg-surface-4 disabled:text-slate-600 text-white text-sm font-bold transition-colors"
          >
            {totalAnswered < questions.length
              ? `Answer all questions (${totalAnswered}/${questions.length})`
              : "Submit Quiz"}
          </button>
        )}
      </div>
    </div>
  );
}
