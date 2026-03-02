/**
 * Speech-to-Text API Route — PROLAI
 * ========================================
 * Server-side proxy to Sarvam AI's Saaras v3 STT engine.
 * Accepts audio blob from the client, forwards it to Sarvam,
 * and returns the transcript. Keeps the API key server-side only.
 *
 * Fallback: If no Sarvam key is configured, returns a helpful error
 * so the client can fall back to browser-native Web Speech API.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const SARVAM_API_URL = "https://api.sarvam.ai/speech-to-text";

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

    const apiKey = process.env.SARVAM_API_KEY?.trim();

    if (!apiKey) {
      return NextResponse.json(
        { error: "sarvam_not_configured", message: "Sarvam AI API key not configured. Using browser speech recognition." },
        { status: 501 }
      );
    }

    // Client sends the audio as multipart/form-data with field "file"
    const formData = await req.formData();
    const audioFile = formData.get("file");
    const language = (formData.get("language") as string) || "unknown";
    const model = (formData.get("model") as string) || "saaras:v3";

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

    // Forward to Sarvam AI
    const sarvamForm = new FormData();
    const originalName = (audioFile as File).name || "audio.webm";
    const safeName = /\.(webm|wav|mp3|m4a|mp4|ogg)$/i.test(originalName) ? originalName : "audio.webm";
    sarvamForm.append("file", audioFile, safeName);
    sarvamForm.append("model", model);
    sarvamForm.append("language_code", language === "unknown" ? "unknown" : language);
    sarvamForm.append("with_timestamps", "false");

    const sarvamResponse = await fetch(SARVAM_API_URL, {
      method: "POST",
      headers: {
        "api-subscription-key": apiKey,
      },
      body: sarvamForm,
    });

    if (!sarvamResponse.ok) {
      const errorText = await sarvamResponse.text().catch(() => "Unknown error");
      console.error(`Sarvam STT error (${sarvamResponse.status}):`, errorText);

      // Pass through rate limiting
      if (sarvamResponse.status === 429) {
        return NextResponse.json(
          { error: "rate_limited", message: "Speech recognition rate limited. Please wait a moment." },
          { status: 429 }
        );
      }

      return NextResponse.json(
        { error: "sarvam_error", message: `Speech recognition failed (${sarvamResponse.status}).` },
        { status: 502 }
      );
    }

    const result = await sarvamResponse.json();

    return NextResponse.json({
      transcript: result.transcript || "",
      language_code: result.language_code || language,
      confidence: result.language_probability || null,
    });
  } catch (err) {
    console.error("Speech-to-text error:", err);
    return NextResponse.json(
      { error: "internal", message: "Speech-to-text processing failed." },
      { status: 500 }
    );
  }
}
