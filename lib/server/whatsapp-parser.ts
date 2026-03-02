/**
 * WhatsApp Chat Export Parser — PROLAI
 * ===========================================
 * Parses WhatsApp "Export Chat" .txt files into structured entries.
 * Now supports media references (images, videos, documents, audio, stickers).
 *
 * Supports formats:
 *   12/25/24, 10:30 AM - John: Hello everyone
 *   25/12/2024, 10:30 am - John: Hello everyone
 *   [25/12/2024, 10:30:45 AM] John: Hello everyone
 *   2024-12-25, 10:30 - John: Hello everyone
 *
 * Media handling:
 *   When exported "with media", WhatsApp includes files like IMG-20240101-WA0001.jpg
 *   and references them in messages as "<Media omitted>" (without media export) or
 *   as "filename.jpg (file attached)" (with media export).
 *   This parser captures media references and stores them as metadata.
 */

export interface ParsedMessage {
  timestamp: string;      // ISO 8601
  sender: string;
  content: string;
  mediaType?: "image" | "video" | "audio" | "document" | "sticker" | "gif" | "contact" | "location";
  mediaFilename?: string; // e.g. "IMG-20240101-WA0001.jpg"
}

export interface MediaReference {
  sender: string;
  timestamp: string;
  type: "image" | "video" | "audio" | "document" | "sticker" | "gif" | "contact" | "location";
  filename?: string;
}

// Common WhatsApp timestamp patterns
const WA_LINE_REGEX =
  /^(?:\[)?(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM|am|pm)?)(?:\])?\s*[-–]\s*([^:]+):\s*(.+)$/;

const WA_LINE_ISO_REGEX =
  /^(?:\[)?(\d{4}-\d{2}-\d{2}),?\s+(\d{1,2}:\d{2}(?::\d{2})?)(?:\])?\s*[-–]\s*([^:]+):\s*(.+)$/;

// System messages to skip
const SYSTEM_PATTERNS = [
  /messages and calls are end-to-end encrypted/i,
  /created group/i,
  /added you/i,
  /changed the subject/i,
  /changed this group/i,
  /left$/i,
  /joined using/i,
  /was removed/i,
  /changed the group description/i,
  /changed their phone number/i,
  /your security code with/i,
  /disappeared/i,
  /pinned a message/i,
  /you were added/i,
  /waiting for this message/i,
];

// Media detection patterns
const MEDIA_PATTERNS: { pattern: RegExp; type: ParsedMessage["mediaType"] }[] = [
  // "<Media omitted>" — WhatsApp export without media
  { pattern: /^<Media omitted>$/i, type: "image" },
  { pattern: /^image omitted$/i, type: "image" },
  { pattern: /^video omitted$/i, type: "video" },
  { pattern: /^audio omitted$/i, type: "audio" },
  { pattern: /^document omitted$/i, type: "document" },
  { pattern: /^sticker omitted$/i, type: "sticker" },
  { pattern: /^GIF omitted$/i, type: "gif" },
  { pattern: /^Contact card omitted$/i, type: "contact" },
  { pattern: /^Location: .+$/i, type: "location" },

  // File attached — WhatsApp export with media
  { pattern: /^(IMG-\d+-WA\d+\.\w+|IMG_\d+\.\w+|photo_\d+\.\w+)\s*\(file attached\)$/i, type: "image" },
  { pattern: /^(VID-\d+-WA\d+\.\w+|VID_\d+\.\w+|video_\d+\.\w+)\s*\(file attached\)$/i, type: "video" },
  { pattern: /^(AUD-\d+-WA\d+\.\w+|PTT-\d+-WA\d+\.\w+|audio_\d+\.\w+)\s*\(file attached\)$/i, type: "audio" },
  { pattern: /^(DOC-\d+-WA\d+\.\w+|.*\.pdf|.*\.docx?|.*\.xlsx?|.*\.pptx?)\s*\(file attached\)$/i, type: "document" },
  { pattern: /^(STK-\d+-WA\d+\.\w+)\s*\(file attached\)$/i, type: "sticker" },

  // Generic "file attached" pattern
  { pattern: /^(.+)\s*\(file attached\)$/i, type: "document" },

  // Inline media file references (just the filename)
  { pattern: /^(IMG-\d+-WA\d+\.\w+)$/i, type: "image" },
  { pattern: /^(VID-\d+-WA\d+\.\w+)$/i, type: "video" },
  { pattern: /^(AUD-\d+-WA\d+\.\w+)$/i, type: "audio" },
];

function parseDate(datePart: string, timePart: string): string {
  const parts = datePart.split("/");
  if (parts.length !== 3) return new Date().toISOString();

  let year = parseInt(parts[2]);
  if (year < 100) year += 2000;

  const a = parseInt(parts[0]);
  const b = parseInt(parts[1]);

  let month: number, day: number;
  if (a > 12) {
    day = a;
    month = b;
  } else if (b > 12) {
    month = a;
    day = b;
  } else {
    month = a;
    day = b;
  }

  const timeClean = timePart.trim();
  const isPM = /pm/i.test(timeClean);
  const isAM = /am/i.test(timeClean);
  const timeParts = timeClean.replace(/\s*(AM|PM|am|pm)/i, "").split(":");
  let hours = parseInt(timeParts[0]);
  const minutes = parseInt(timeParts[1] || "0");
  const seconds = parseInt(timeParts[2] || "0");

  if (isPM && hours < 12) hours += 12;
  if (isAM && hours === 12) hours = 0;

  const d = new Date(year, month - 1, day, hours, minutes, seconds);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

/** Detect if a message content is a media reference */
function detectMedia(content: string): { type: ParsedMessage["mediaType"]; filename?: string } | null {
  const trimmed = content.trim();
  for (const mp of MEDIA_PATTERNS) {
    const match = mp.pattern.exec(trimmed);
    if (match) {
      return {
        type: mp.type,
        filename: match[1] && !match[1].includes("omitted") ? match[1] : undefined,
      };
    }
  }
  return null;
}

export function parseWhatsAppExport(text: string): {
  messages: ParsedMessage[];
  groupName: string | null;
  participantCount: number;
  mediaCount: number;
  mediaReferences: MediaReference[];
} {
  const lines = text.split(/\r?\n/);
  const messages: ParsedMessage[] = [];
  const participants = new Set<string>();
  const mediaReferences: MediaReference[] = [];
  let mediaCount = 0;
  let currentMessage: ParsedMessage | null = null;

  for (const line of lines) {
    if (!line.trim()) continue;

    // Try standard format
    let match = WA_LINE_REGEX.exec(line);
    let isoMatch = false;

    if (!match) {
      match = WA_LINE_ISO_REGEX.exec(line);
      isoMatch = !!match;
    }

    if (match) {
      // Flush previous message
      if (currentMessage) {
        messages.push(currentMessage);
      }

      const datePart = match[1];
      const timePart = match[2];
      const sender = match[3].trim();
      const content = match[4].trim();

      // Skip system messages
      const isSystem = SYSTEM_PATTERNS.some((p) => p.test(content)) || sender === "";
      if (isSystem) {
        currentMessage = null;
        continue;
      }

      const timestamp = isoMatch
        ? new Date(`${datePart}T${timePart}`).toISOString()
        : parseDate(datePart, timePart);

      participants.add(sender);

      // Check for media
      const media = detectMedia(content);
      if (media) {
        mediaCount++;
        mediaReferences.push({
          sender,
          timestamp,
          type: media.type!,
          filename: media.filename,
        });

        // Store media reference as a descriptive message instead of skipping
        const mediaLabel = media.filename
          ? `[${media.type}: ${media.filename}]`
          : `[${media.type} shared]`;

        currentMessage = {
          timestamp,
          sender,
          content: mediaLabel,
          mediaType: media.type,
          mediaFilename: media.filename,
        };
      } else {
        currentMessage = { timestamp, sender, content };
      }
    } else if (currentMessage) {
      // Continuation line — append to current message
      currentMessage.content += "\n" + line;
    }
  }

  // Flush last message
  if (currentMessage) {
    messages.push(currentMessage);
  }

  // Try to detect group name from the first line
  let groupName: string | null = null;
  if (lines.length > 0) {
    const firstLine = lines[0];
    if (/messages and calls are end-to-end encrypted/i.test(firstLine)) {
      // Standard WhatsApp header
    } else if (!WA_LINE_REGEX.test(firstLine) && !WA_LINE_ISO_REGEX.test(firstLine)) {
      const trimmed = firstLine.trim();
      if (trimmed.length > 0 && trimmed.length < 100) {
        groupName = trimmed;
      }
    }
  }

  return {
    messages,
    groupName,
    participantCount: participants.size,
    mediaCount,
    mediaReferences,
  };
}

/**
 * Chunk messages into groups for storage.
 * Groups consecutive messages by sender and time proximity.
 */
export function chunkMessages(
  messages: ParsedMessage[],
  maxChunkSize: number = 2000
): { sender: string; content: string; timestamp: string }[] {
  const chunks: { sender: string; content: string; timestamp: string }[] = [];
  let currentChunk = { sender: "", content: "", timestamp: "" };

  for (const msg of messages) {
    const wouldBe = currentChunk.content + "\n" + msg.content;

    if (
      currentChunk.sender === msg.sender &&
      wouldBe.length < maxChunkSize
    ) {
      currentChunk.content = wouldBe.trim();
    } else {
      if (currentChunk.content) {
        chunks.push({ ...currentChunk });
      }
      currentChunk = {
        sender: msg.sender,
        content: msg.content,
        timestamp: msg.timestamp,
      };
    }
  }

  if (currentChunk.content) {
    chunks.push(currentChunk);
  }

  return chunks;
}
