"use client";

import { useState, useCallback, useEffect, useRef } from "react";

interface MockTestQuestion {
  id: number;
  question: string;
  type: "mcq" | "true_false" | "short_answer" | "fill_blank";
  marks: number;
  options?: string[];
  correct: number | string;
  explanation: string;
  marking_hints: string;
}

interface MockTestRendererProps {
  subject: string;
  topic: string;
  durationMinutes: number;
  totalMarks: number;
  difficulty: string;
  questions: MockTestQuestion[];
}

type TestPhase = "ready" | "in_progress" | "review";

/**
 * Timed mock test component with countdown, auto-submit, and evaluation.
 */
export function MockTestRenderer({
  subject,
  topic,
  durationMinutes,
  totalMarks,
  difficulty,
  questions,
}: MockTestRendererProps) {
  const [phase, setPhase] = useState<TestPhase>("ready");
  const [answers, setAnswers] = useState<Record<number, string | number>>({});
  const [selfScores, setSelfScores] = useState<Record<number, number>>({});
  const [timeLeft, setTimeLeft] = useState(durationMinutes * 60);
  const [startedAt, setStartedAt] = useState<Date | null>(null);
  const [finishedAt, setFinishedAt] = useState<Date | null>(null);
  const [revealedExplanations, setRevealedExplanations] = useState<Set<number>>(new Set());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Timer logic
  useEffect(() => {
    if (phase !== "in_progress") return;
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          // Auto-submit
          clearInterval(timerRef.current!);
          setPhase("review");
          setFinishedAt(new Date());
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [phase]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const handleStart = useCallback(() => {
    setPhase("in_progress");
    setStartedAt(new Date());
    setTimeLeft(durationMinutes * 60);
  }, [durationMinutes]);

  const handleSubmit = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    setPhase("review");
    setFinishedAt(new Date());
  }, []);

  const handleSelectMCQ = useCallback(
    (qIdx: number, optIdx: number) => {
      if (phase !== "in_progress") return;
      setAnswers((prev) => ({ ...prev, [qIdx]: optIdx }));
    },
    [phase]
  );

  const handleTextAnswer = useCallback(
    (qIdx: number, text: string) => {
      if (phase !== "in_progress") return;
      setAnswers((prev) => ({ ...prev, [qIdx]: text }));
    },
    [phase]
  );

  const handleSelfScore = useCallback((qIdx: number, score: number) => {
    setSelfScores((prev) => ({ ...prev, [qIdx]: score }));
  }, []);

  const toggleExplanation = useCallback((idx: number) => {
    setRevealedExplanations((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  // Calculate scores
  const autoGradedQuestions = questions.filter(
    (q) => q.type === "mcq" || q.type === "true_false"
  );
  const selfEvalQuestions = questions.filter(
    (q) => q.type !== "mcq" && q.type !== "true_false"
  );

  const autoScore = autoGradedQuestions.reduce((acc, q) => {
    return acc + (answers[q.id] === q.correct ? q.marks : 0);
  }, 0);
  const autoMax = autoGradedQuestions.reduce((acc, q) => acc + q.marks, 0);

  const selfScore = Object.values(selfScores).reduce((a, b) => a + b, 0);
  const selfMax = selfEvalQuestions.reduce((acc, q) => acc + q.marks, 0);

  const totalScore = autoScore + selfScore;
  const answeredCount = Object.keys(answers).length;
  const percentage = totalMarks > 0 ? Math.round((totalScore / totalMarks) * 100) : 0;

  const timePercentage =
    durationMinutes > 0 ? (timeLeft / (durationMinutes * 60)) * 100 : 0;
  const isLowTime = timeLeft < 60 && timeLeft > 0;
  const isVeryLowTime = timeLeft < 30 && timeLeft > 0;

  if (questions.length === 0) return null;

  // ── READY PHASE ─────────────────────────────────────────────────
  if (phase === "ready") {
    return (
      <div className="my-4 rounded-xl border border-surface-4 bg-surface-2 overflow-hidden">
        <div className="px-5 py-4 bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border-b border-surface-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">⏱️</span>
            <span className="text-sm font-bold text-white uppercase tracking-wide">
              Timed Mock Test
            </span>
          </div>
          <h3 className="text-lg font-bold text-white">{topic}</h3>
          <p className="text-xs text-slate-400 mt-1">
            {subject.charAt(0).toUpperCase() + subject.slice(1)} • {difficulty} difficulty
          </p>
        </div>
        <div className="p-5 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-surface-3 rounded-lg p-3 text-center">
              <div className="text-lg font-bold text-blue-400">{durationMinutes}</div>
              <div className="text-[10px] text-slate-500 uppercase">Minutes</div>
            </div>
            <div className="bg-surface-3 rounded-lg p-3 text-center">
              <div className="text-lg font-bold text-purple-400">{questions.length}</div>
              <div className="text-[10px] text-slate-500 uppercase">Questions</div>
            </div>
            <div className="bg-surface-3 rounded-lg p-3 text-center">
              <div className="text-lg font-bold text-amber-400">{totalMarks}</div>
              <div className="text-[10px] text-slate-500 uppercase">Marks</div>
            </div>
          </div>
          <div className="bg-surface-3/50 rounded-lg p-3 text-xs text-slate-400 space-y-1">
            <p>
              📌 The timer starts when you click &quot;Start Test&quot;. The test will auto-submit
              when time runs out.
            </p>
            <p>📌 MCQs and True/False are auto-graded. Short answers include model answers for self-evaluation.</p>
            <p>📌 You can submit early by clicking &quot;Submit Test&quot;.</p>
          </div>
          <button
            onClick={handleStart}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-400 hover:to-purple-400 text-white text-sm font-bold transition-all shadow-lg shadow-indigo-500/20"
          >
            🚀 Start Test
          </button>
        </div>
      </div>
    );
  }

  // ── IN PROGRESS + REVIEW PHASE ────────────────────────────────────
  return (
    <div className="my-4 rounded-xl border border-surface-4 bg-surface-2 overflow-hidden">
      {/* Header with timer */}
      <div className="sticky top-0 z-10 bg-surface-2 border-b border-surface-4">
        <div className="flex items-center justify-between px-4 py-2.5 bg-surface-3/50">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-white uppercase tracking-wide">
              {phase === "review" ? "📊 Test Review" : "⏱️ Mock Test"} — {topic}
            </span>
            {difficulty && (
              <span
                className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${
                  difficulty === "easy"
                    ? "text-green-400 bg-green-500/10"
                    : difficulty === "hard"
                    ? "text-red-400 bg-red-500/10"
                    : "text-amber-400 bg-amber-500/10"
                }`}
              >
                {difficulty}
              </span>
            )}
          </div>
          {phase === "in_progress" && (
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-slate-500">
                {answeredCount}/{questions.length} answered
              </span>
              <div
                className={`px-3 py-1 rounded-lg font-mono text-sm font-bold ${
                  isVeryLowTime
                    ? "bg-red-500/20 text-red-400 animate-pulse"
                    : isLowTime
                    ? "bg-amber-500/20 text-amber-400"
                    : "bg-surface-4 text-white"
                }`}
              >
                {formatTime(timeLeft)}
              </div>
            </div>
          )}
        </div>

        {/* Timer progress bar */}
        {phase === "in_progress" && (
          <div className="h-1 bg-surface-4">
            <div
              className={`h-full transition-all duration-1000 ${
                isVeryLowTime
                  ? "bg-red-500"
                  : isLowTime
                  ? "bg-amber-500"
                  : "bg-indigo-500"
              }`}
              style={{ width: `${timePercentage}%` }}
            />
          </div>
        )}
      </div>

      {/* Score banner (review phase) */}
      {phase === "review" && (
        <div
          className={`px-4 py-3 border-b border-surface-4 ${
            percentage >= 90
              ? "bg-emerald-500/10"
              : percentage >= 70
              ? "bg-blue-500/10"
              : percentage >= 40
              ? "bg-amber-500/10"
              : "bg-red-500/10"
          }`}
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold text-white">
                  {autoScore + selfScore}/{totalMarks}
                </span>
                <span className="text-xs text-slate-400">
                  {percentage >= 90
                    ? "🎉 Outstanding!"
                    : percentage >= 70
                    ? "👏 Great performance!"
                    : percentage >= 40
                    ? "📖 Keep practicing!"
                    : "💪 Don't give up!"}
                </span>
              </div>
              <div className="flex gap-4 mt-1">
                <span className="text-[10px] text-slate-500">
                  Auto-graded: {autoScore}/{autoMax}
                </span>
                {selfMax > 0 && (
                  <span className="text-[10px] text-slate-500">
                    Self-evaluated: {selfScore}/{selfMax}
                    {Object.keys(selfScores).length < selfEvalQuestions.length &&
                      " (rate below ↓)"}
                  </span>
                )}
              </div>
            </div>
            <div className="text-right">
              <span className="text-2xl font-mono font-bold text-white">{percentage}%</span>
              {startedAt && finishedAt && (
                <div className="text-[10px] text-slate-500">
                  Time: {Math.round((finishedAt.getTime() - startedAt.getTime()) / 60000)}m
                </div>
              )}
            </div>
          </div>
          <div className="mt-2 h-1.5 bg-surface-4 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                percentage >= 90
                  ? "bg-emerald-500"
                  : percentage >= 70
                  ? "bg-blue-500"
                  : percentage >= 40
                  ? "bg-amber-500"
                  : "bg-red-500"
              }`}
              style={{ width: `${percentage}%` }}
            />
          </div>
        </div>
      )}

      {/* Questions */}
      <div className="p-4 space-y-4">
        {questions.map((q) => {
          const isAutoGraded = q.type === "mcq" || q.type === "true_false";
          const isCorrect =
            phase === "review" && isAutoGraded && answers[q.id] === q.correct;
          const isWrong =
            phase === "review" &&
            isAutoGraded &&
            answers[q.id] !== undefined &&
            answers[q.id] !== q.correct;

          return (
            <div
              key={q.id}
              className={`rounded-lg border p-4 transition-colors ${
                phase === "review"
                  ? isCorrect
                    ? "border-emerald-500/30 bg-emerald-900/10"
                    : isWrong
                    ? "border-red-500/30 bg-red-900/10"
                    : "border-surface-4 bg-surface-3/30"
                  : "border-surface-4 bg-surface-3/30"
              }`}
            >
              {/* Question header */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex gap-2 flex-1">
                  <span className="text-[10px] font-mono text-slate-500 bg-surface-4 px-1.5 py-0.5 rounded h-fit shrink-0">
                    Q{q.id + 1}
                  </span>
                  <p className="text-sm text-slate-200 font-medium leading-relaxed">
                    {q.question}
                  </p>
                </div>
                <span className="text-[10px] text-slate-500 bg-surface-4 px-1.5 py-0.5 rounded shrink-0 ml-2">
                  {q.marks}m
                </span>
              </div>

              {/* MCQ / True-False Options */}
              {(q.type === "mcq" || q.type === "true_false") && q.options && (
                <div className="space-y-2 ml-6">
                  {q.options.map((opt, optIdx) => {
                    const isSelected = answers[q.id] === optIdx;
                    const isCorrectAnswer =
                      phase === "review" && optIdx === q.correct;
                    const isWrongSelected =
                      phase === "review" && isSelected && optIdx !== q.correct;

                    return (
                      <button
                        key={optIdx}
                        onClick={() => handleSelectMCQ(q.id, optIdx)}
                        disabled={phase === "review"}
                        className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-all flex items-center gap-2 ${
                          isCorrectAnswer
                            ? "bg-emerald-500/20 border border-emerald-500/40 text-emerald-300"
                            : isWrongSelected
                            ? "bg-red-500/20 border border-red-500/40 text-red-300"
                            : isSelected && phase === "in_progress"
                            ? "bg-indigo-500/20 border border-indigo-500/40 text-indigo-300"
                            : "bg-surface-4/50 border border-surface-4 text-slate-400 hover:border-indigo-500/30 hover:text-white"
                        } disabled:cursor-default`}
                      >
                        <span className="w-5 h-5 rounded-full border flex items-center justify-center shrink-0 text-[10px] font-bold">
                          {String.fromCharCode(65 + optIdx)}
                        </span>
                        <span className="flex-1">{opt}</span>
                        {isCorrectAnswer && (
                          <svg
                            className="w-4 h-4 text-emerald-400 shrink-0"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                          >
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                        {isWrongSelected && (
                          <svg
                            className="w-4 h-4 text-red-400 shrink-0"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                          >
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Short Answer / Fill Blank */}
              {(q.type === "short_answer" || q.type === "fill_blank") && (
                <div className="ml-6">
                  <textarea
                    value={String(answers[q.id] || "")}
                    onChange={(e) => handleTextAnswer(q.id, e.target.value)}
                    disabled={phase === "review"}
                    placeholder={
                      q.type === "fill_blank"
                        ? "Fill in the blank..."
                        : "Write your answer..."
                    }
                    className="w-full bg-surface-4/50 border border-surface-4 rounded-lg px-3 py-2 text-xs text-slate-300 placeholder-slate-600 focus:border-indigo-500/40 focus:outline-none resize-none disabled:opacity-60"
                    rows={q.type === "fill_blank" ? 1 : 3}
                  />

                  {/* Model answer + self-score (review) */}
                  {phase === "review" && (
                    <div className="mt-2 space-y-2">
                      <div className="bg-emerald-900/10 border border-emerald-500/20 rounded-lg p-2">
                        <span className="text-[10px] text-emerald-400 font-bold uppercase">
                          Model Answer:
                        </span>
                        <p className="text-xs text-slate-300 mt-1">
                          {String(q.correct)}
                        </p>
                        {q.marking_hints && (
                          <p className="text-[10px] text-slate-500 mt-1 italic">
                            Marking: {q.marking_hints}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-500">
                          Rate yourself:
                        </span>
                        {Array.from({ length: q.marks + 1 }, (_, i) => (
                          <button
                            key={i}
                            onClick={() => handleSelfScore(q.id, i)}
                            className={`w-6 h-6 rounded text-[10px] font-bold transition-colors ${
                              selfScores[q.id] === i
                                ? "bg-indigo-500 text-white"
                                : "bg-surface-4 text-slate-500 hover:text-white"
                            }`}
                          >
                            {i}
                          </button>
                        ))}
                        <span className="text-[10px] text-slate-600">
                          / {q.marks}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Explanation toggle (review) */}
              {phase === "review" && q.explanation && (
                <div className="ml-6 mt-2">
                  <button
                    onClick={() => toggleExplanation(q.id)}
                    className="text-[10px] text-indigo-400 hover:text-indigo-300 font-medium"
                  >
                    {revealedExplanations.has(q.id)
                      ? "Hide explanation"
                      : "Show explanation"}
                  </button>
                  {revealedExplanations.has(q.id) && (
                    <p className="mt-1 text-xs text-slate-400 leading-relaxed bg-surface-3/50 rounded-lg p-2 border border-surface-4">
                      {q.explanation}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Submit button (in_progress) */}
        {phase === "in_progress" && (
          <button
            onClick={handleSubmit}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-400 hover:to-purple-400 text-white text-sm font-bold transition-all"
          >
            {answeredCount < questions.length
              ? `Submit Test (${answeredCount}/${questions.length} answered)`
              : "✅ Submit Test"}
          </button>
        )}
      </div>
    </div>
  );
}
