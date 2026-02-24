"use client";

import { useState, useCallback } from "react";

interface FlashcardRendererProps {
  topic: string;
  cards: { front: string; back: string }[];
}

/**
 * Interactive flashcard deck with flip animation and navigation.
 */
export function FlashcardRenderer({ topic, cards }: FlashcardRendererProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [viewMode, setViewMode] = useState<"single" | "grid">("single");
  const [flippedCards, setFlippedCards] = useState<Set<number>>(new Set());

  const handleFlip = useCallback(() => {
    setFlipped((f) => !f);
  }, []);

  const handleNext = useCallback(() => {
    setFlipped(false);
    setCurrentIndex((i) => Math.min(i + 1, cards.length - 1));
  }, [cards.length]);

  const handlePrev = useCallback(() => {
    setFlipped(false);
    setCurrentIndex((i) => Math.max(i - 1, 0));
  }, []);

  const toggleGridCard = useCallback((idx: number) => {
    setFlippedCards((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  if (cards.length === 0) return null;

  return (
    <div className="my-4 rounded-xl border border-surface-4 bg-surface-2 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-surface-3/50 border-b border-surface-4">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <path d="M12 4v16M2 12h20" />
          </svg>
          <span className="text-xs font-bold text-white uppercase tracking-wide">
            Flashcards — {topic}
          </span>
          <span className="text-[10px] text-amber-400/70 font-medium">{cards.length} cards</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setViewMode(viewMode === "single" ? "grid" : "single")}
            className="px-2 py-1 text-[10px] text-slate-400 hover:text-white bg-surface-3 hover:bg-surface-4 rounded transition-colors font-medium"
          >
            {viewMode === "single" ? "Grid View" : "Card View"}
          </button>
        </div>
      </div>

      {/* Content */}
      {viewMode === "single" ? (
        <div className="p-4">
          {/* Single card view with flip */}
          <div
            className="relative w-full min-h-[200px] cursor-pointer perspective-1000"
            onClick={handleFlip}
          >
            <div
              className={`relative w-full min-h-[200px] transition-transform duration-500 transform-style-3d ${
                flipped ? "rotate-y-180" : ""
              }`}
              style={{
                transformStyle: "preserve-3d",
                transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
                transition: "transform 0.5s ease",
              }}
            >
              {/* Front */}
              <div
                className="absolute inset-0 rounded-xl bg-gradient-to-br from-blue-900/40 to-surface-3 border border-blue-500/20 p-6 flex flex-col items-center justify-center"
                style={{ backfaceVisibility: "hidden" }}
              >
                <div className="text-[10px] text-blue-400/60 font-bold uppercase tracking-widest mb-3">
                  Question
                </div>
                <p className="text-sm text-slate-200 text-center leading-relaxed font-medium">
                  {cards[currentIndex].front}
                </p>
                <div className="mt-4 text-[10px] text-slate-600">Click to flip</div>
              </div>

              {/* Back */}
              <div
                className="absolute inset-0 rounded-xl bg-gradient-to-br from-emerald-900/40 to-surface-3 border border-emerald-500/20 p-6 flex flex-col items-center justify-center"
                style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
              >
                <div className="text-[10px] text-emerald-400/60 font-bold uppercase tracking-widest mb-3">
                  Answer
                </div>
                <p className="text-sm text-slate-200 text-center leading-relaxed">
                  {cards[currentIndex].back}
                </p>
                <div className="mt-4 text-[10px] text-slate-600">Click to flip back</div>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between mt-4">
            <button
              onClick={handlePrev}
              disabled={currentIndex === 0}
              className="px-3 py-1.5 text-xs text-slate-400 hover:text-white bg-surface-3 hover:bg-surface-4 rounded-lg transition-colors disabled:opacity-30 disabled:hover:bg-surface-3 font-medium"
            >
              ← Previous
            </button>
            <span className="text-xs text-slate-500 font-mono">
              {currentIndex + 1} / {cards.length}
            </span>
            <button
              onClick={handleNext}
              disabled={currentIndex === cards.length - 1}
              className="px-3 py-1.5 text-xs text-slate-400 hover:text-white bg-surface-3 hover:bg-surface-4 rounded-lg transition-colors disabled:opacity-30 disabled:hover:bg-surface-3 font-medium"
            >
              Next →
            </button>
          </div>
        </div>
      ) : (
        /* Grid view */
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {cards.map((card, i) => (
            <div
              key={i}
              onClick={() => toggleGridCard(i)}
              className={`cursor-pointer rounded-lg border p-4 transition-all duration-200 ${
                flippedCards.has(i)
                  ? "bg-emerald-900/20 border-emerald-500/30"
                  : "bg-surface-3 border-surface-4 hover:border-blue-500/30"
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-mono text-slate-600 bg-surface-4 px-1.5 py-0.5 rounded">
                  {i + 1}
                </span>
                <span className={`text-[10px] font-bold uppercase tracking-wide ${
                  flippedCards.has(i) ? "text-emerald-400" : "text-blue-400"
                }`}>
                  {flippedCards.has(i) ? "Answer" : "Question"}
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                {flippedCards.has(i) ? card.back : card.front}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
