"use client";

import { useState, useRef, useCallback, useEffect } from "react";

// ── Types ────────────────────────────────────────────────────────────
interface VoiceInputButtonProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
}

type STTBackend = "sarvam" | "browser" | null;

/**
 * VoiceInputButton — Hybrid STT with Sarvam AI + Web Speech API fallback
 *
 * Priority:
 * 1. Sarvam AI Saaras v3 (server-side, multilingual, accurate)
 * 2. Web Speech API (browser-native, Chrome/Edge only)
 *
 * Records audio via MediaRecorder → sends to /api/speech-to-text → transcript.
 * If Sarvam isn't configured (501), falls back to Web Speech API transparently.
 */
export function VoiceInputButton({ onTranscript, disabled }: VoiceInputButtonProps) {
  const [isListening, setIsListening] = useState(false);
  const [interimText, setInterimText] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [backend, setBackend] = useState<STTBackend>(null);
  const [isSupported, setIsSupported] = useState<boolean | null>(null);

  // Refs for cleanup
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const isListeningRef = useRef(false);
  const onTranscriptRef = useRef(onTranscript);
  const recordingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Web Speech API refs (fallback)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const restartTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startBrowserRecognitionRef = useRef<(() => void) | null>(null);

  // Keep callback ref fresh
  useEffect(() => { onTranscriptRef.current = onTranscript; }, [onTranscript]);
  useEffect(() => { isListeningRef.current = isListening; }, [isListening]);

  // Detect available backend on mount
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Check if MediaRecorder is available (needed for Sarvam)
    const hasMediaRecorder = typeof MediaRecorder !== "undefined";

    // Check if Web Speech API is available (fallback)
    const SR = (window as unknown as Record<string, unknown>).SpeechRecognition ||
               (window as unknown as Record<string, unknown>).webkitSpeechRecognition;

    if (hasMediaRecorder) {
      // Sarvam AI is preferred — it works on all browsers with mic access
      // If the server returns 501 (not configured), we'll fall back at runtime
      setBackend("sarvam");
      setIsSupported(true);
    } else if (SR) {
      setBackend("browser");
      setIsSupported(true);
    } else {
      setBackend(null);
      setIsSupported(false);
    }
  }, []);

  // ── Stop helpers ───────────────────────────────────────────────────
  const stopSarvamRecording = useCallback(() => {
    if (recordingTimerRef.current) {
      clearTimeout(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop(); // triggers ondataavailable + onstop
    }
  }, []);

  const stopBrowserRecognition = useCallback(() => {
    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch { /* ignore */ }
      recognitionRef.current = null;
    }
  }, []);

  const stopListening = useCallback(() => {
    isListeningRef.current = false;
    setIsListening(false);
    setInterimText("");
    stopSarvamRecording();
    stopBrowserRecognition();
    // Release microphone stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, [stopSarvamRecording, stopBrowserRecognition]);

  // ── Sarvam AI recording ────────────────────────────────────────────
  const startSarvamRecording = useCallback(async () => {
    setErrorMsg("");
    setInterimText("Starting mic...");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 16000 },
      });
      streamRef.current = stream;

      // Prefer webm/opus; if browser rejects explicit mimeType, fall back safely
      const preferredMimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "";

      audioChunksRef.current = [];
      let recorder: MediaRecorder;
      try {
        recorder = preferredMimeType
          ? new MediaRecorder(stream, { mimeType: preferredMimeType })
          : new MediaRecorder(stream);
      } catch {
        recorder = new MediaRecorder(stream);
      }
      mediaRecorderRef.current = recorder;
      const actualMimeType = recorder.mimeType || preferredMimeType || "audio/webm";

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        // Assemble audio blob and send to Sarvam
        const audioBlob = new Blob(audioChunksRef.current, { type: actualMimeType });
        audioChunksRef.current = [];

        if (audioBlob.size < 100) {
          setInterimText("");
          setIsListening(false);
          isListeningRef.current = false;
          return;
        }

        setInterimText("Transcribing...");

        try {
          const formData = new FormData();
          const extension = actualMimeType.includes("webm")
            ? "webm"
            : actualMimeType.includes("mp4")
            ? "mp4"
            : "wav";
          formData.append("file", audioBlob, `recording.${extension}`);
          formData.append("model", "saaras:v3");
          formData.append("language", "unknown"); // auto-detect

          const res = await fetch("/api/speech-to-text", {
            method: "POST",
            body: formData,
          });

          if (res.status === 501) {
            // Sarvam not configured — fall back to browser STT
            console.log("[Voice] Sarvam not configured, falling back to Web Speech API");
            setBackend("browser");
            setInterimText("");
            setIsListening(false);
            isListeningRef.current = false;
            // Auto-start browser recognition
            setTimeout(() => {
              startBrowserRecognitionRef.current?.();
            }, 60);
            return;
          }

          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            if (res.status >= 500) {
              setBackend("browser");
              setTimeout(() => {
                startBrowserRecognitionRef.current?.();
              }, 60);
              return;
            }
            throw new Error(data.message || `STT failed (${res.status})`);
          }

          const data = await res.json();
          const transcript = (data.transcript || "").trim();

          if (transcript) {
            onTranscriptRef.current(transcript);
          } else {
            setInterimText("No speech detected");
            setTimeout(() => setInterimText(""), 2000);
          }
        } catch (err) {
          console.error("[Voice] Sarvam STT error:", err);
          setErrorMsg(err instanceof Error ? err.message : "Transcription failed");
        } finally {
          setIsListening(false);
          isListeningRef.current = false;
          setInterimText("");
          // Release mic
          if (streamRef.current) {
            streamRef.current.getTracks().forEach((t) => t.stop());
            streamRef.current = null;
          }
        }
      };

      // Start recording with timeslice for periodic data
      recorder.start(250);
      isListeningRef.current = true;
      setIsListening(true);
      setInterimText("🎙️ Listening... (tap to stop)");

      // Auto-stop after 25 seconds (Sarvam sync limit is 30s)
      recordingTimerRef.current = setTimeout(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
          setInterimText("Processing...");
          mediaRecorderRef.current.stop();
        }
      }, 25_000);

    } catch (err) {
      console.error("[Voice] Mic access error:", err);
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        setErrorMsg("Mic blocked. Allow in browser settings.");
      } else {
        setErrorMsg("Could not access microphone.");
      }
      setIsListening(false);
      isListeningRef.current = false;
    }
  }, []);

  // ── Browser Web Speech API (fallback) ──────────────────────────────
  const startBrowserRecognition = useCallback(() => {
    setErrorMsg("");
    const SR = (window as unknown as Record<string, unknown>).SpeechRecognition ||
               (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
    if (!SR) {
      setIsSupported(false);
      setErrorMsg("Voice not supported — use Chrome or Edge");
      return;
    }

    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch { /* ignore */ }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recognition = new (SR as any)();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      isListeningRef.current = true;
      setIsListening(true);
      setInterimText("Listening...");
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onerror = (event: any) => {
      const err = event.error;
      if (err === "not-allowed" || err === "service-not-allowed") {
        setErrorMsg("Microphone blocked.");
        stopListening();
      } else if (err === "no-speech") {
        setInterimText("No speech detected...");
      } else if (err === "audio-capture") {
        setErrorMsg("No microphone found.");
        stopListening();
      } else if (err !== "aborted") {
        setErrorMsg(`Voice error: ${err}`);
        stopListening();
      }
    };

    recognition.onend = () => {
      if (isListeningRef.current && recognitionRef.current === recognition) {
        restartTimeoutRef.current = setTimeout(() => {
          if (!isListeningRef.current) return;
          try { recognition.start(); } catch { stopListening(); }
        }, 200);
        return;
      }
      if (recognitionRef.current === recognition) {
        isListeningRef.current = false;
        setIsListening(false);
        setInterimText("");
      }
    };

    recognitionRef.current = recognition;

    // Request mic then start
    if (navigator.mediaDevices?.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ audio: true })
        .then((stream) => {
          stream.getTracks().forEach((t) => t.stop());
          try { recognition.start(); } catch {
            setErrorMsg("Failed to start.");
            setIsListening(false);
          }
        })
        .catch(() => {
          setErrorMsg("Mic access denied.");
          setIsListening(false);
        });
    } else {
      try { recognition.start(); } catch {
        setErrorMsg("Failed to start voice input.");
        setIsListening(false);
      }
    }
  }, [stopListening]);

  useEffect(() => {
    startBrowserRecognitionRef.current = startBrowserRecognition;
  }, [startBrowserRecognition]);

  // ── Main click handler ─────────────────────────────────────────────
  const handleClick = useCallback(() => {
    if (isListening) {
      stopListening();
    } else if (backend === "sarvam") {
      startSarvamRecording();
    } else if (backend === "browser") {
      startBrowserRecognition();
    }
  }, [isListening, backend, stopListening, startSarvamRecording, startBrowserRecognition]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) clearTimeout(recordingTimerRef.current);
      if (restartTimeoutRef.current) clearTimeout(restartTimeoutRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        try { mediaRecorderRef.current.stop(); } catch { /* ignore */ }
      }
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch { /* ignore */ }
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  if (isSupported === null) return null;

  return (
    <div className="relative group">
      <button
        onClick={handleClick}
        disabled={disabled || !isSupported}
        className={`p-2 rounded-lg transition-all duration-200 shrink-0 ${
          isListening
            ? "bg-red-500/20 text-red-400 ring-2 ring-red-500/40 shadow-lg shadow-red-500/10"
            : !isSupported
            ? "text-slate-600 cursor-not-allowed opacity-40"
            : "hover:bg-surface-3 text-slate-500 hover:text-slate-300"
        } disabled:opacity-30`}
        title={
          !isSupported
            ? "Voice not supported"
            : isListening
            ? "Stop recording"
            : `Voice input${backend === "sarvam" ? " (Sarvam AI)" : ""}`
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

      {/* Interim transcript / status tooltip */}
      {isListening && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-surface-3 border border-surface-4 rounded-lg text-xs whitespace-nowrap max-w-[250px] truncate shadow-xl z-50">
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
          Voice input not available
        </div>
      )}
    </div>
  );
}
