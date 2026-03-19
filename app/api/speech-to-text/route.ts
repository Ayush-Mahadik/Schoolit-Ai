/**
 * Speech-to-Text API Route — SchoolIT AI
 * ========================================
 * Server-side proxy to Groq Whisper (primary) → Sarvam AI (fallback).
 * Accepts audio blob from the client, forwards it to the best available provider,
 * and returns the transcript. Keeps API keys server-side only.
 *
 * Provider Priority:
 * 1. Groq Whisper (distil-whisper-large-v3-en) — fast, free tier
 * 2. Sarvam AI Saaras v3 — multilingual, India-optimized
 * 3. Browser Web Speech API (client-side fallback)
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const GROQ_STT_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const SARVAM_API_URL = "https://api.sarvam.ai/speech-to-text";

// ── Groq Whisper STT ──────────────────────────────────────────────────
async function transcribeWithGroq(audioFile: Blob, fileName: string): Promise<{ transcript: string; provider: string } | null> {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) return null;

  try {
    const formData = new FormData();
    formData.append("file", audioFile, fileName);
    formData.append("model", "distil-whisper-large-v3-en");
    formData.append("response_format", "json");

    const response = await fetch(GROQ_STT_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      console.warn(`Groq STT error (${response.status}):`, errorText);
      return null;
    }

    const result = await response.json();
    return {
      transcript: result.text || "",
      provider: "groq",
    };
  } catch (err) {
    console.warn("Groq STT exception:", err);
    return null;
  }
}

// ── Sarvam AI STT (fallback) ──────────────────────────────────────────
async function transcribeWithSarvam(audioFile: Blob, fileName: string, language: string): Promise<{ transcript: string; provider: string; language_code?: string } | null> {
  const apiKey = process.env.SARVAM_API_KEY?.trim();
  if (!apiKey) return null;

  try {
    const sarvamForm = new FormData();
    sarvamForm.append("file", audioFile, fileName);
    sarvamForm.append("model", "saaras:v3");
    sarvamForm.append("language_code", language === "unknown" ? "unknown" : language);
    sarvamForm.append("with_timestamps", "false");

    const response = await fetch(SARVAM_API_URL, {
      method: "POST",
      headers: {
        "api-subscription-key": apiKey,
      },
      body: sarvamForm,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      console.warn(`Sarvam STT error (${response.status}):`, errorText);
      return null;
    }

    const result = await response.json();
    return {
      transcript: result.transcript || "",
      provider: "sarvam",
      language_code: result.language_code || language,
    };
  } catch (err) {
    console.warn("Sarvam STT exception:", err);
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    // Require authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "unauthorized", message: "Sign in to use voice input." },
        { status: 401 }
      );
    }

    // Check if any STT provider is configured
    const hasGroq = !!process.env.GROQ_API_KEY?.trim();
    const hasSarvam = !!process.env.SARVAM_API_KEY?.trim();

    if (!hasGroq && !hasSarvam) {
      return NextResponse.json(
        { error: "stt_not_configured", message: "No STT provider configured. Using browser speech recognition." },
        { status: 501 }
      );
    }

    // Client sends the audio as multipart/form-data with field "file"
    const formData = await req.formData();
    const audioFile = formData.get("file");
    const language = (formData.get("language") as string) || "unknown";

    if (!audioFile || !(audioFile instanceof Blob)) {
      return NextResponse.json(
        { error: "no_audio", message: "No audio file provided." },
        { status: 400 }
      );
    }

    // Validate file size (max 25MB)
    if (audioFile.size > 25 * 1024 * 1024) {
      return NextResponse.json(
        { error: "file_too_large", message: "Audio file must be under 25MB." },
        { status: 413 }
      );
    }

    // Determine safe filename
    const originalName = (audioFile as File).name || "audio.webm";
    const safeName = /\.(webm|wav|mp3|m4a|mp4|ogg|flac)$/i.test(originalName) ? originalName : "audio.webm";

    // Try Groq Whisper first (fast, accurate for English)
    let result = await transcribeWithGroq(audioFile, safeName);

    // Fallback to Sarvam if Groq failed or returned empty
    if (!result || !result.transcript) {
      result = await transcribeWithSarvam(audioFile, safeName, language);
    }

    // Both failed — tell client to use browser fallback
    if (!result) {
      return NextResponse.json(
        { error: "stt_all_failed", message: "All STT providers failed. Falling back to browser." },
        { status: 502 }
      );
    }

    return NextResponse.json({
      transcript: result.transcript,
      language_code: (result as { language_code?: string }).language_code || language,
      provider: result.provider,
      confidence: null,
    });
  } catch (err) {
    console.error("Speech-to-text error:", err);
    return NextResponse.json(
      { error: "internal", message: "Speech-to-text processing failed." },
      { status: 500 }
    );
  }
}
