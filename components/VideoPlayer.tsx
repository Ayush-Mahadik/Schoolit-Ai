"use client";

import { useState, useRef } from "react";
import { motion } from "framer-motion";

interface VideoPlayerProps {
  url: string;
}

export function VideoPlayer({ url }: VideoPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  if (error) {
    return (
      <div className="bg-surface-2 border border-surface-4 rounded-xl p-4 text-center">
        <p className="text-sm text-slate-400">⚠️ Video failed to load</p>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-brand-400 hover:underline mt-1 inline-block"
        >
          Open video directly →
        </a>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="rounded-xl overflow-hidden border border-surface-4 bg-surface-2"
    >
      <div className="relative">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 bg-surface-3 border-b border-surface-4">
          <div className="flex items-center gap-2">
            <span className="text-xs">🎬</span>
            <span className="text-xs text-slate-400 font-medium">Manim Animation</span>
          </div>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-brand-400 hover:text-brand-300 transition-colors"
          >
            Open fullscreen ↗
          </a>
        </div>

        {/* Video */}
        <video
          ref={videoRef}
          src={url}
          controls
          playsInline
          className="w-full max-h-[400px] bg-black"
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onError={() => setError(true)}
        >
          Your browser does not support the video tag.
        </video>
      </div>
    </motion.div>
  );
}
