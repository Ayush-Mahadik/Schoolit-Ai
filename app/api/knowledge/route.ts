/**
 * Knowledge Base API — SchoolIT AI
 * ==================================
 * Stores and searches imported knowledge (WhatsApp exports, notes, documents).
 * The AI uses this via the search_knowledge_base tool to recall stored info.
 *
 * Endpoints:
 *   POST   /api/knowledge               → Import knowledge (WhatsApp export or manual)
 *   GET    /api/knowledge?q=...          → Search knowledge entries
 *   GET    /api/knowledge?list=sources   → List all sources
 *   DELETE /api/knowledge?source=...     → Delete a source
 *   DELETE /api/knowledge?all=true       → Delete all user knowledge
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  parseWhatsAppExport,
  chunkMessages,
} from "@/lib/server/whatsapp-parser";

// ── Server-only Supabase client ──────────────────────────────────────
function getSupabase(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function unauthorized() {
  return NextResponse.json(
    { error: "unauthorized", message: "Sign in to use the knowledge base." },
    { status: 401 }
  );
}

function notConfigured() {
  return NextResponse.json(
    { error: "not_configured", message: "Knowledge base storage is not configured." },
    { status: 503 }
  );
}

// ══════════════════════════════════════════════════════════════════════
//  POST /api/knowledge — Import knowledge
// ══════════════════════════════════════════════════════════════════════
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return unauthorized();
    const userEmail = session.user.email;

    const sb = getSupabase();
    if (!sb) return notConfigured();

    const body = await req.json();
    const source: string = body.source || "manual";       // 'whatsapp', 'manual', 'document'
    const sourceName: string = body.source_name || "Untitled";
    const content: string = body.content || "";

    if (!content.trim()) {
      return NextResponse.json(
        { error: "validation", message: "Content is required." },
        { status: 400 }
      );
    }

    let entriesInserted = 0;

    if (source === "whatsapp") {
      // Parse WhatsApp export
      const parsed = parseWhatsAppExport(content);

      if (parsed.messages.length === 0) {
        return NextResponse.json(
          { error: "parse_error", message: "No messages found in the WhatsApp export. Make sure you exported the chat as .txt from WhatsApp." },
          { status: 400 }
        );
      }

      // Chunk messages for efficient storage and search
      const chunks = chunkMessages(parsed.messages);
      const rows = chunks.map((chunk) => ({
        user_email: userEmail,
        source: "whatsapp",
        source_name: sourceName || parsed.groupName || "WhatsApp Chat",
        sender: chunk.sender,
        content: chunk.content,
        metadata: {
          timestamp: chunk.timestamp,
          participant_count: parsed.participantCount,
          total_messages: parsed.messages.length,
        },
      }));

      // Batch insert (Supabase handles up to 1000 rows at a time)
      const batchSize = 500;
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        const { error } = await sb.from("knowledge_entries").insert(batch);
        if (error) {
          console.error("Knowledge insert error:", error);
          return NextResponse.json(
            { error: "db_error", message: "Failed to store knowledge entries." },
            { status: 500 }
          );
        }
        entriesInserted += batch.length;
      }

      return NextResponse.json({
        success: true,
        source: "whatsapp",
        source_name: sourceName || parsed.groupName,
        messages_parsed: parsed.messages.length,
        entries_stored: entriesInserted,
        participants: parsed.participantCount,
      });
    } else {
      // Manual / document import — store as single or chunked entries
      const contentChunks: string[] = [];
      const maxChunk = 3000;

      if (content.length <= maxChunk) {
        contentChunks.push(content);
      } else {
        // Split by paragraphs, keeping chunks under max size
        const paragraphs = content.split(/\n\n+/);
        let current = "";
        for (const para of paragraphs) {
          if ((current + "\n\n" + para).length > maxChunk && current) {
            contentChunks.push(current.trim());
            current = para;
          } else {
            current = current ? current + "\n\n" + para : para;
          }
        }
        if (current.trim()) contentChunks.push(current.trim());
      }

      const rows = contentChunks.map((chunk) => ({
        user_email: userEmail,
        source,
        source_name: sourceName,
        sender: null,
        content: chunk,
        metadata: { original_length: content.length },
      }));

      const { error } = await sb.from("knowledge_entries").insert(rows);
      if (error) {
        console.error("Knowledge insert error:", error);
        return NextResponse.json(
          { error: "db_error", message: "Failed to store knowledge." },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        source,
        source_name: sourceName,
        entries_stored: rows.length,
      });
    }
  } catch (err) {
    console.error("Knowledge POST error:", err);
    return NextResponse.json(
      { error: "server_error", message: "Internal error while importing knowledge." },
      { status: 500 }
    );
  }
}

// ══════════════════════════════════════════════════════════════════════
//  GET /api/knowledge — Search or list knowledge
// ══════════════════════════════════════════════════════════════════════
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return unauthorized();
    const userEmail = session.user.email;

    const sb = getSupabase();
    if (!sb) return notConfigured();

    const url = new URL(req.url);
    const query = url.searchParams.get("q");
    const listSources = url.searchParams.get("list");
    const sourceName = url.searchParams.get("source");
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "20"), 50);

    // List all sources
    if (listSources === "sources") {
      const { data, error } = await sb
        .from("knowledge_entries")
        .select("source, source_name")
        .eq("user_email", userEmail)
        .order("imported_at", { ascending: false });

      if (error) {
        return NextResponse.json({ error: "db_error" }, { status: 500 });
      }

      // Deduplicate sources
      const seen = new Set<string>();
      const sources: { source: string; source_name: string; count: number }[] = [];
      const countMap = new Map<string, number>();

      for (const row of data || []) {
        const key = `${row.source}::${row.source_name}`;
        countMap.set(key, (countMap.get(key) || 0) + 1);
        if (!seen.has(key)) {
          seen.add(key);
          sources.push({ source: row.source, source_name: row.source_name, count: 0 });
        }
      }
      for (const s of sources) {
        s.count = countMap.get(`${s.source}::${s.source_name}`) || 0;
      }

      return NextResponse.json({ sources });
    }

    // Full-text search
    if (query) {
      // Build tsquery from user query (join words with &)
      const tsQuery = query
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((w) => w.replace(/[^a-zA-Z0-9\u0900-\u097F]/g, "")) // keep Devanagari + alphanumeric
        .filter((w) => w.length > 0)
        .join(" & ");

      let dbQuery = sb
        .from("knowledge_entries")
        .select("id, source, source_name, sender, content, metadata, created_at")
        .eq("user_email", userEmail)
        .textSearch("content_tsv", tsQuery, { type: "plain" })
        .limit(limit)
        .order("created_at", { ascending: false });

      if (sourceName) {
        dbQuery = dbQuery.eq("source_name", sourceName);
      }

      const { data, error } = await dbQuery;

      if (error) {
        // Fallback to ILIKE if tsquery fails (e.g. for short queries)
        const { data: fallbackData, error: fallbackError } = await sb
          .from("knowledge_entries")
          .select("id, source, source_name, sender, content, metadata, created_at")
          .eq("user_email", userEmail)
          .ilike("content", `%${query}%`)
          .limit(limit)
          .order("created_at", { ascending: false });

        if (fallbackError) {
          return NextResponse.json({ error: "search_error" }, { status: 500 });
        }
        return NextResponse.json({ results: fallbackData || [], query });
      }

      return NextResponse.json({ results: data || [], query });
    }

    // Default: return recent entries
    let dbQuery = sb
      .from("knowledge_entries")
      .select("id, source, source_name, sender, content, created_at")
      .eq("user_email", userEmail)
      .limit(limit)
      .order("created_at", { ascending: false });

    if (sourceName) {
      dbQuery = dbQuery.eq("source_name", sourceName);
    }

    const { data, error } = await dbQuery;
    if (error) {
      return NextResponse.json({ error: "db_error" }, { status: 500 });
    }

    return NextResponse.json({ entries: data || [] });
  } catch (err) {
    console.error("Knowledge GET error:", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

// ══════════════════════════════════════════════════════════════════════
//  DELETE /api/knowledge — Delete knowledge entries
// ══════════════════════════════════════════════════════════════════════
export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return unauthorized();
    const userEmail = session.user.email;

    const sb = getSupabase();
    if (!sb) return notConfigured();

    const url = new URL(req.url);
    const clearAll = url.searchParams.get("all") === "true";
    const sourceName = url.searchParams.get("source");

    if (clearAll) {
      const { error } = await sb
        .from("knowledge_entries")
        .delete()
        .eq("user_email", userEmail);
      if (error) {
        return NextResponse.json({ error: "db_error" }, { status: 500 });
      }
      return NextResponse.json({ success: true, message: "All knowledge deleted." });
    }

    if (sourceName) {
      const { error } = await sb
        .from("knowledge_entries")
        .delete()
        .eq("user_email", userEmail)
        .eq("source_name", sourceName);
      if (error) {
        return NextResponse.json({ error: "db_error" }, { status: 500 });
      }
      return NextResponse.json({ success: true, message: `Source "${sourceName}" deleted.` });
    }

    return NextResponse.json(
      { error: "validation", message: "Provide ?source=... or ?all=true" },
      { status: 400 }
    );
  } catch (err) {
    console.error("Knowledge DELETE error:", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
