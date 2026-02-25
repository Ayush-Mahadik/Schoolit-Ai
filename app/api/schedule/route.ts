/**
 * Server-Side Schedule API — SchoolIT AI
 * =========================================
 * Syncs schedule items to Supabase.
 * Falls back to localStorage if Supabase is unavailable.
 *
 * Auth: Validated via NextAuth server session.
 * Table: schedule_items (auto-created via upsert if using service role)
 *
 * Endpoints:
 *   GET  /api/schedule           → Load user's schedule items
 *   POST /api/schedule           → Save/replace all schedule items
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function getSupabase(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ── GET: Load schedule ──────────────────────────────────────────────
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const sb = getSupabase();
    if (!sb) {
      return NextResponse.json({ error: "not_configured" }, { status: 503 });
    }

    const { data, error } = await sb
      .from("schedule_items")
      .select("*")
      .eq("user_email", session.user.email)
      .order("start_time", { ascending: true });

    if (error) {
      // Table might not exist yet — that's okay
      if (error.code === "42P01") {
        return NextResponse.json({ items: [] });
      }
      console.error("Schedule load error:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Transform from DB format to frontend format
    const items = (data || []).map((row: Record<string, unknown>) => ({
      id: row.id,
      title: row.title,
      subject: row.subject,
      startTime: row.start_time,
      endTime: row.end_time,
      type: row.item_type,
      completed: row.completed,
    }));

    return NextResponse.json({ items });
  } catch (err) {
    console.error("GET /api/schedule error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── POST: Save schedule (full replacement) ──────────────────────────
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const sb = getSupabase();
    if (!sb) {
      return NextResponse.json({ error: "not_configured" }, { status: 503 });
    }

    let body: { items?: unknown[] };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const items = Array.isArray(body.items) ? body.items : [];

    // Delete existing schedule for this user
    await sb
      .from("schedule_items")
      .delete()
      .eq("user_email", session.user.email);

    // Insert new items
    if (items.length > 0) {
      const rows = items.slice(0, 200).map((item: Record<string, unknown>) => ({
        id: String(item.id || `sch-${Date.now()}-${Math.random()}`),
        user_email: session.user.email,
        title: String(item.title || "").slice(0, 300),
        subject: String(item.subject || "general"),
        start_time: String(item.startTime || ""),
        end_time: String(item.endTime || ""),
        item_type: String(item.type || "other"),
        completed: Boolean(item.completed),
      }));

      const { error } = await sb
        .from("schedule_items")
        .insert(rows);

      if (error) {
        console.error("Schedule save error:", error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true, count: items.length });
  } catch (err) {
    console.error("POST /api/schedule error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
