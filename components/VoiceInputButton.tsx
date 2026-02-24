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
 * Fixed: uses refs for state to avoid stale closure bugs
 */
export function VoiceInputButton({ onTranscript, disabled }: VoiceInputButtonProps) {
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState<boolean | null>(null);
  const [interimText, setInterimText] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const isListeningRef = useRef(false); // ref mirrors state to avoid stale closures
  const restartTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onTranscriptRef = useRef(onTranscript);

  // Keep refs in sync
  useEffect(() => { onTranscriptRef.current = onTranscript; }, [onTranscript]);
  useEffect(() => { isListeningRef.current = isListening; }, [isListening]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const SR =
      (window as unknown as Record<string, unknown>).SpeechRecognition ||
      (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
    setIsSupported(!!SR);
  }, []);

  const stopListening = useCallback(() => {
    isListeningRef.current = false;
    setIsListening(false);
    setInterimText("");
    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch { /* ignore */ }
      recognitionRef.current = null;
    }
  }, []);

  const startListening = useCallback(() => {
    setErrorMsg("");
    const SR =
      (window as unknown as Record<string, unknown>).SpeechRecognition ||
      (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
    if (!SR) {
      setIsSupported(false);
      setErrorMsg("Voice not supported — use Chrome or Edge");
      return;
    }

    // Stop any existing recognition first
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch { /* ignore */ }
      recognitionRef.current = null;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recognition = new (SR as any)() as SpeechRecognitionInstance;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      isListeningRef.current = true;
      setIsListening(true);
      setErrorMsg("");
      setInterimText("Listening...");
    };

    recognition.onaudiostart = () => {
      setInterimText("Listening...");
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
      if (interim) setInterimText(interim);
      if (finalText) {
        onTranscriptRef.current(finalText);
        setInterimText("");
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      const err = event.error;
      console.error("[VoiceInput] Error:", err);
      if (err === "not-allowed" || err === "service-not-allowed") {
        setErrorMsg("Microphone blocked. Allow mic access in browser settings → Site Settings → Microphone.");
        stopListening();
      } else if (err === "no-speech") {
        // Normal — just keep listening, don't stop
        setInterimText("No speech detected — try again...");
      } else if (err === "audio-capture") {
        setErrorMsg("No microphone found.");
        stopListening();
      } else if (err === "network") {
        setErrorMsg("Network error — speech needs internet.");
        stopListening();
      } else if (err === "aborted") {
        // User stopped intentionally
      } else {
        setErrorMsg(`Voice error: ${err}`);
        stopListening();
      }
    };

    recognition.onend = () => {
      // Only auto-restart if we're still supposed to be listening
      if (isListeningRef.current && recognitionRef.current === recognition) {
        restartTimeoutRef.current = setTimeout(() => {
          if (!isListeningRef.current) return;
          try {
            recognition.start();
          } catch {
            isListeningRef.current = false;
            setIsListening(false);
            setInterimText("");
          }
        }, 200);
        return;
      }
      // Otherwise clean up
      if (recognitionRef.current === recognition) {
        isListeningRef.current = false;
        setIsListening(false);
        setInterimText("");
      }
    };

    recognitionRef.current = recognition;

    // Request mic permission explicitly first, then start
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ audio: true })
        .then((stream) => {
          // Got permission — stop the stream (Speech API manages its own stream)
          stream.getTracks().forEach((t) => t.stop());
          try {
            recognition.start();
          } catch (e) {
            console.error("[VoiceInput] Start failed after permission:", e);
            setErrorMsg("Failed to start. Try again.");
            isListeningRef.current = false;
            setIsListening(false);
          }
        })
        .catch((e) => {
          console.error("[VoiceInput] Mic permission denied:", e);
          setErrorMsg("Microphone access denied. Check browser permissions.");
          isListeningRef.current = false;
          setIsListening(false);
        });
    } else {
      // Fallback — just try starting directly
      try {
        recognition.start();
      } catch (e) {
        console.error("[VoiceInput] Start failed:", e);
        setErrorMsg("Failed to start voice input.");
        isListeningRef.current = false;
        setIsListening(false);
      }
    }
  }, [stopListening]);

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
            ? "Voice not supported — use Chrome or Edge"
            : isListening
            ? "Stop recording"
            : "Voice input"
        }
        type="button"
      >
        {isListening ? (
          <div className="relative">
            <svg className="w-4 h-4 animate-pulse" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
            </svg>
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full animate-ping" />
          </div>
        ) : (
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
            <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
            <line x1="12" x2="12" y1="19" y2="22" />
          </svg>
        )}
      </button>

      {/* Interim transcript tooltip */}
      {isListening && (
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
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-400 whitespace-nowrap max-w-[280px] truncate shadow-xl z-50">
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
