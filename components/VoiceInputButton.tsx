"use client";

import { useState, useRef, useCallback, useEffect } from "react";

// Web Speech API type declarations
interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}
interface SpeechRecognitionResultList {
  length: number;
  [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternative;
}
interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}
interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}
interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  onaudiostart: (() => void) | null;
}

interface VoiceInputButtonProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
}

/**
 * VoiceInputButton: Web Speech API powered voice-to-text
 * - Click to start/stop recording
 * - Real-time interim results
 * - Pulse animation when active
 * - Graceful fallback with tooltip if unsupported
 */
export function VoiceInputButton({ onTranscript, disabled }: VoiceInputButtonProps) {
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState<boolean | null>(null); // null = not checked yet
  const [interimText, setInterimText] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const restartTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Check browser support on mount
    if (typeof window === "undefined") return;
    const SR =
      (window as unknown as Record<string, unknown>).SpeechRecognition ||
      (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
    setIsSupported(!!SR);
    if (!SR) {
      console.warn("[VoiceInput] Web Speech API not supported in this browser");
    }
  }, []);

  const stopListening = useCallback(() => {
    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }
    setIsListening(false);
    setInterimText("");
  }, []);

  const startListening = useCallback(() => {
    setErrorMsg("");
    const SR =
      (window as unknown as Record<string, unknown>).SpeechRecognition ||
      (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
    if (!SR) {
      setIsSupported(false);
      setErrorMsg("Voice input not supported in this browser. Use Chrome or Edge.");
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recognition = new (SR as any)() as SpeechRecognitionInstance;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      setErrorMsg("");
    };

    recognition.onaudiostart = () => {
      // Microphone is active and receiving audio
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      let finalText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalText += transcript;
        } else {
          interim += transcript;
        }
      }
      setInterimText(interim);
      if (finalText) {
        onTranscript(finalText);
        setInterimText("");
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      const err = event.error;
      console.error("[VoiceInput] Error:", err);

      if (err === "not-allowed" || err === "service-not-allowed") {
        setErrorMsg("Microphone access denied. Please allow microphone in browser settings.");
        setIsSupported(false);
        stopListening();
      } else if (err === "no-speech") {
        // No speech detected — this is normal, just restart
        setInterimText("Listening...");
      } else if (err === "audio-capture") {
        setErrorMsg("No microphone found. Please connect a microphone.");
        stopListening();
      } else if (err === "network") {
        setErrorMsg("Network error — speech recognition requires internet.");
        stopListening();
      } else if (err === "aborted") {
        // User stopped — do nothing
      } else {
        setErrorMsg(`Voice error: ${err}`);
        stopListening();
      }
    };

    recognition.onend = () => {
      // Auto-restart if still supposed to be listening (handles Chrome's auto-stop)
      if (recognitionRef.current === recognition && isListening) {
        restartTimeoutRef.current = setTimeout(() => {
          try {
            recognition.start();
          } catch {
            setIsListening(false);
          }
        }, 100);
        return;
      }
      setIsListening(false);
      setInterimText("");
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setIsListening(true);
    } catch (e) {
      console.error("[VoiceInput] Failed to start:", e);
      setErrorMsg("Failed to start voice input. Try again.");
      setIsListening(false);
    }
  }, [onTranscript, isListening, stopListening]);

  const handleClick = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (restartTimeoutRef.current) clearTimeout(restartTimeoutRef.current);
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch { /* ignore */ }
      }
    };
  }, []);

  // Show nothing while checking support; show disabled button if not supported
  if (isSupported === null) return null;

  return (
    <div className="relative group">
      <button
        onClick={handleClick}
        disabled={disabled || (!isSupported && !isListening)}
        className={`p-2 rounded-lg transition-all duration-200 shrink-0 ${
          isListening
            ? "bg-red-500/20 text-red-400 ring-2 ring-red-500/40 shadow-lg shadow-red-500/10"
            : !isSupported
            ? "text-slate-600 cursor-not-allowed opacity-40"
            : "hover:bg-surface-3 text-slate-500 hover:text-slate-300"
        } disabled:opacity-30`}
        title={
          !isSupported
            ? "Voice input not supported — use Chrome or Edge"
            : isListening
            ? "Click to stop recording"
            : "Click for voice input"
        }
        type="button"
      >
        {isListening ? (
          // Active — animated mic with rings
          <div className="relative">
            <svg className="w-4 h-4 animate-pulse" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
            </svg>
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full animate-ping" />
          </div>
        ) : (
          // Inactive mic
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
            <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
            <line x1="12" x2="12" y1="19" y2="22" />
          </svg>
        )}
      </button>

      {/* Interim transcript tooltip */}
      {isListening && (interimText || !errorMsg) && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-surface-3 border border-surface-4 rounded-lg text-xs whitespace-nowrap max-w-[220px] truncate shadow-xl z-50">
          <span className="text-slate-300">
            {interimText || (
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-red-400 rounded-full animate-pulse" />
                Listening...
              </span>
            )}
          </span>
        </div>
      )}

      {/* Error tooltip */}
      {errorMsg && !isListening && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-400 whitespace-nowrap max-w-[250px] truncate shadow-xl z-50">
          {errorMsg}
        </div>
      )}

      {/* Unsupported browser tooltip on hover */}
      {!isSupported && !errorMsg && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-surface-3 border border-surface-4 rounded-lg text-xs text-slate-400 whitespace-nowrap shadow-xl z-50 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          Use Chrome or Edge for voice input
        </div>
      )}
    </div>
  );
}
