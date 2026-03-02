/**
 * Knowledge Base API — PROLAI (Hardened)
 * =============================================
 * Stores and searches imported knowledge (WhatsApp exports, notes, documents).
 * The AI uses this via the search_knowledge_base tool to recall stored info.
 *
 * Security measures:
 *   - Auth required (NextAuth session) for every endpoint
 *   - Rate limiting: 30 requests/min per user
 *   - Content size limits: 5MB max per request
 *   - Input sanitization: strip HTML/script tags, validate source types
 *   - SQL injection protection: parameterized queries via Supabase SDK
 *   - Source name validation: no path traversal, length limits
 *   - CSRF protection: POST/DELETE require valid session
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

// ── Constants ────────────────────────────────────────────────────────
const MAX_CONTENT_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_SOURCE_NAME_LENGTH = 200;
const MAX_QUERY_LENGTH = 500;
const VALID_SOURCES = new Set(["whatsapp", "manual", "document", "notes"]);
const RATE_LIMIT = 40; // requests per minute per user
const RATE_WINDOW_MS = 60_000;

// ── Rate limiting (in-memory per user email) ─────────────────────────
const knowledgeRateLimits = new Map<string, { count: number; resetAt: number }>();

function checkKnowledgeRateLimit(email: string): boolean {
  const now = Date.now();
  const entry = knowledgeRateLimits.get(email);

  // Periodic cleanup
  if (knowledgeRateLimits.size > 5000) {
    const toDelete: string[] = [];
    knowledgeRateLimits.forEach((v, k) => { if (now > v.resetAt) toDelete.push(k); });
    toDelete.forEach((k) => knowledgeRateLimits.delete(k));
  }

  if (!entry || now > entry.resetAt) {
    knowledgeRateLimits.set(email, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

// ── Input sanitization ───────────────────────────────────────────────

/** Strip dangerous HTML/script content — defense-in-depth */
function sanitizeContent(input: string): string {
  return input
    // Remove script tags and their content
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    // Remove all HTML tags
    .replace(/<[^>]*>/g, "")
    // Remove javascript: protocol links
    .replace(/javascript:/gi, "")
    // Remove data: URIs with executable content
    .replace(/data:text\/html/gi, "")
    // Normalize whitespace (but preserve newlines for WhatsApp parsing)
    .replace(/\r\n/g, "\n")
    // Remove null bytes
    .replace(/\0/g, "");
}

/** Validate and sanitize source names — prevent path traversal and injection */
function sanitizeSourceName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, "")       // remove filesystem-dangerous chars
    .replace(/\.\./g, "")                // prevent path traversal
    .replace(/[\x00-\x1f\x7f]/g, "")    // remove control characters
    .trim()
    .slice(0, MAX_SOURCE_NAME_LENGTH);
}

/** Validate search queries */
function sanitizeQuery(query: string): string {
  return query
    .replace(/[\x00-\x1f\x7f]/g, "")    // remove control chars
    .trim()
    .slice(0, MAX_QUERY_LENGTH);
}

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

function rateLimited() {
  return NextResponse.json(
    { error: "rate_limited", message: "Too many requests. Please wait a moment." },
    { status: 429 }
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

    // Rate limit check
    if (!checkKnowledgeRateLimit(userEmail)) return rateLimited();

    const sb = getSupabase();
    if (!sb) return notConfigured();

    // Content length check (before parsing body)
    const contentLength = parseInt(req.headers.get("content-length") || "0");
    if (contentLength > MAX_CONTENT_SIZE) {
      return NextResponse.json(
        { error: "too_large", message: `Content exceeds ${MAX_CONTENT_SIZE / 1024 / 1024}MB limit.` },
        { status: 413 }
      );
    }

    const body = await req.json();
    const rawSource: string = String(body.source || "manual");
    const rawSourceName: string = String(body.source_name || "Untitled");
    const rawContent: string = String(body.content || "");

    // Validate source type
    if (!VALID_SOURCES.has(rawSource)) {
      return NextResponse.json(
        { error: "validation", message: `Invalid source type. Must be one of: ${Array.from(VALID_SOURCES).join(", ")}` },
        { status: 400 }
      );
    }

    // Sanitize inputs
    const source = rawSource;
    const sourceName = sanitizeSourceName(rawSourceName) || "Untitled";
    const content = sanitizeContent(rawContent);

    if (!content.trim()) {
      return NextResponse.json(
        { error: "validation", message: "Content is required." },
        { status: 400 }
      );
    }

    // Check content size after sanitization
    if (content.length > MAX_CONTENT_SIZE) {
      return NextResponse.json(
        { error: "too_large", message: "Content is too large after processing." },
        { status: 413 }
      );
    }

    // Check user's total storage (prevent abuse — max 50k entries per user)
    const { count: existingCount } = await sb
      .from("knowledge_entries")
      .select("id", { count: "exact", head: true })
      .eq("user_email", userEmail);

    if ((existingCount || 0) > 50_000) {
      return NextResponse.json(
        { error: "storage_limit", message: "Knowledge base limit reached (50,000 entries). Delete some sources to import more." },
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
        source: "whatsapp" as const,
        source_name: sourceName || parsed.groupName || "WhatsApp Chat",
        sender: sanitizeContent(chunk.sender),
        content: sanitizeContent(chunk.content),
        metadata: {
          timestamp: chunk.timestamp,
          participant_count: parsed.participantCount,
          total_messages: parsed.messages.length,
          has_media: parsed.mediaCount > 0,
          media_count: parsed.mediaCount,
          media_references: parsed.mediaReferences.slice(0, 100), // store first 100 media refs
        },
      }));

      // Batch insert
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
        media_references: parsed.mediaCount,
      });
    } else {
      // Manual / document import — store as single or chunked entries
      const contentChunks: string[] = [];
      const maxChunk = 3000;

      if (content.length <= maxChunk) {
        contentChunks.push(content);
      } else {
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
        sender: null as string | null,
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

    if (!checkKnowledgeRateLimit(userEmail)) return rateLimited();

    const sb = getSupabase();
    if (!sb) return notConfigured();

    const url = new URL(req.url);
    const rawQuery = url.searchParams.get("q");
    const listSources = url.searchParams.get("list");
    const rawSourceName = url.searchParams.get("source");
    const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "20"), 1), 50);

    const sourceName = rawSourceName ? sanitizeSourceName(rawSourceName) : null;

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
    if (rawQuery) {
      const query = sanitizeQuery(rawQuery);
      if (!query) {
        return NextResponse.json({ results: [], query: rawQuery });
      }

      // Use plainto_tsquery which is inherently safe from injection
      let dbQuery = sb
        .from("knowledge_entries")
        .select("id, source, source_name, sender, content, metadata, created_at")
        .eq("user_email", userEmail)
        .textSearch("content_tsv", query, { type: "plain" })
        .limit(limit)
        .order("created_at", { ascending: false });

      if (sourceName) {
        dbQuery = dbQuery.eq("source_name", sourceName);
      }

      const { data, error } = await dbQuery;

      if (error) {
        // Fallback to ILIKE if tsquery fails
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

    if (!checkKnowledgeRateLimit(userEmail)) return rateLimited();

    const sb = getSupabase();
    if (!sb) return notConfigured();

    const url = new URL(req.url);
    const clearAll = url.searchParams.get("all") === "true";
    const rawSourceName = url.searchParams.get("source");

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

    if (rawSourceName) {
      const sourceName = sanitizeSourceName(rawSourceName);
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
