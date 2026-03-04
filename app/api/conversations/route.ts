/**
 * Server-Side Conversations API — PROLAI
 * ==============================================
 * ALL Supabase operations go through this route.
 * No database credentials are ever exposed to the browser.
 *
 * Auth: Validated via NextAuth server session.
 * DB: Uses SUPABASE_SERVICE_ROLE_KEY (server-only env var).
 *
 * Endpoints:
 *   GET  /api/conversations           → Load user's conversations
 *   POST /api/conversations           → Save/upsert a conversation
 *   DELETE /api/conversations?id=xyz  → Delete one conversation
 *   DELETE /api/conversations?clear_all=true → Delete all
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { validateCSRFToken } from "@/lib/server/security";
import { CSRF_HEADER } from "@/lib/config";

// ── Server-only Supabase client (NEVER exposed to browser) ───────────
function getSupabase(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.warn("Supabase not configured: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    return null;
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ── Helpers ───────────────────────────────────────────────────────────
function unauthorized() {
  return NextResponse.json(
    { error: "unauthorized", message: "Sign in to use cloud sync." },
    { status: 401 }
  );
}

function notConfigured() {
  return NextResponse.json(
    { error: "not_configured", message: "Cloud storage is not configured on the server." },
    { status: 503 }
  );
}

// ══════════════════════════════════════════════════════════════════════
//  GET /api/conversations — Load all conversations for authenticated user
// ══════════════════════════════════════════════════════════════════════
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return unauthorized();

    const sb = getSupabase();
    if (!sb) return notConfigured();

    const { data, error } = await sb
      .from("conversations")
      .select("*")
      .eq("user_email", session.user.email)
      .order("timestamp", { ascending: false })
      .limit(50);

    if (error) {
      console.error("Supabase load error:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ conversations: data || [] });
  } catch (err) {
    console.error("GET /api/conversations error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ══════════════════════════════════════════════════════════════════════
//  POST /api/conversations — Save or update a conversation
// ══════════════════════════════════════════════════════════════════════
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return unauthorized();

    // CSRF verification
    const csrfToken = req.headers.get(CSRF_HEADER) || "";
    const sessionId = (session.user as Record<string, unknown>).id as string | undefined;
    if (!await validateCSRFToken(csrfToken, sessionId)) {
      return NextResponse.json({ error: "Invalid security token. Refresh the page." }, { status: 403 });
    }

    const sb = getSupabase();
    if (!sb) return notConfigured();

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (!body.id || typeof body.id !== "string") {
      return NextResponse.json({ error: "Missing conversation id" }, { status: 400 });
    }

    // SECURITY: Always use the authenticated email — never trust client-provided email
    // SECURITY: Validate and sanitize the messages payload before sending to Supabase
    let sanitizedMessages: unknown[] = [];
    if (Array.isArray(body.messages)) {
      const MAX_MESSAGES = 200;
      const MAX_MSG_CONTENT_LENGTH = 50_000;
      sanitizedMessages = (body.messages as Record<string, unknown>[]).slice(0, MAX_MESSAGES).map((msg) => ({
        id: String(msg.id || "").slice(0, 50),
        role: ["user", "assistant", "system"].includes(String(msg.role || "")) ? String(msg.role) : "user",
        content: String(msg.content || "").slice(0, MAX_MSG_CONTENT_LENGTH),
        timestamp: String(msg.timestamp || new Date().toISOString()).slice(0, 50),
      }));
    }

    const row = {
      id: String(body.id),
      user_email: session.user.email,
      title: String(body.title || "Untitled").slice(0, 200),
      subject: String(body.subject || "general").slice(0, 50),
      timestamp: Number(body.timestamp) || Date.now(),
      message_count: Math.min(Math.max(Number(body.message_count) || 0, 0), 10000),
      preview: String(body.preview || "").slice(0, 300),
      messages: sanitizedMessages,
      updated_at: Date.now(),
    };

    // SECURITY: Check if this conversation belongs to the current user before upsert
    const { data: existing } = await sb
      .from("conversations")
      .select("user_email")
      .eq("id", row.id)
      .single();

    if (existing && existing.user_email !== session.user.email) {
      return NextResponse.json({ error: "Forbidden — this conversation belongs to another user" }, { status: 403 });
    }

    const { error } = await sb
      .from("conversations")
      .upsert(row, { onConflict: "id" });

    if (error) {
      console.error("Supabase save error:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("POST /api/conversations error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ══════════════════════════════════════════════════════════════════════
//  DELETE /api/conversations — Delete one or all conversations
// ══════════════════════════════════════════════════════════════════════
export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return unauthorized();

    // CSRF verification
    const csrfToken = req.headers.get(CSRF_HEADER) || "";
    const sessionId = (session.user as Record<string, unknown>).id as string | undefined;
    if (!await validateCSRFToken(csrfToken, sessionId)) {
      return NextResponse.json({ error: "Invalid security token. Refresh the page." }, { status: 403 });
    }

    const sb = getSupabase();
    if (!sb) return notConfigured();

    const { searchParams } = new URL(req.url);
    const convId = searchParams.get("id");
    const clearAll = searchParams.get("clear_all") === "true";

    if (clearAll) {
      // SECURITY: Only delete the authenticated user's conversations
      const { error } = await sb
        .from("conversations")
        .delete()
        .eq("user_email", session.user.email);

      if (error) {
        console.error("Supabase clear error:", error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ success: true });
    }

    if (!convId) {
      return NextResponse.json({ error: "Missing conversation id or clear_all flag" }, { status: 400 });
    }

    // SECURITY: Match both id AND user_email to prevent cross-user deletion
    const { error } = await sb
      .from("conversations")
      .delete()
      .eq("id", convId)
      .eq("user_email", session.user.email);

    if (error) {
      console.error("Supabase delete error:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/conversations error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
