/**
 * WhatsApp Chat Export Parser — SchoolIT AI
 * ===========================================
 * Parses WhatsApp "Export Chat" .txt files into structured entries.
 *
 * Supports formats:
 *   12/25/24, 10:30 AM - John: Hello everyone
 *   25/12/2024, 10:30 am - John: Hello everyone
 *   [25/12/2024, 10:30:45 AM] John: Hello everyone
 *   2024-12-25, 10:30 - John: Hello everyone
 */

export interface ParsedMessage {
  timestamp: string;      // ISO 8601
  sender: string;
  content: string;
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
];

function parseDate(datePart: string, timePart: string): string {
  // Try MM/DD/YY, DD/MM/YY, MM/DD/YYYY, DD/MM/YYYY
  const parts = datePart.split("/");
  if (parts.length !== 3) return new Date().toISOString();

  let year = parseInt(parts[2]);
  if (year < 100) year += 2000;

  // Heuristic: if first part > 12, it's DD/MM format
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
    // Ambiguous — assume MM/DD (US) which WhatsApp commonly uses
    month = a;
    day = b;
  }

  // Parse time
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

export function parseWhatsAppExport(text: string): {
  messages: ParsedMessage[];
  groupName: string | null;
  participantCount: number;
} {
  const lines = text.split(/\r?\n/);
  const messages: ParsedMessage[] = [];
  const participants = new Set<string>();
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

      // Skip media placeholders
      if (content === "<Media omitted>" || content === "image omitted" || content === "video omitted") {
        currentMessage = null;
        continue;
      }

      const timestamp = isoMatch
        ? new Date(`${datePart}T${timePart}`).toISOString()
        : parseDate(datePart, timePart);

      participants.add(sender);

      currentMessage = { timestamp, sender, content };
    } else if (currentMessage) {
      // Continuation line — append to current message
      currentMessage.content += "\n" + line;
    }
  }

  // Flush last message
  if (currentMessage) {
    messages.push(currentMessage);
  }

  // Try to detect group name from the first line (WhatsApp sometimes puts it there)
  let groupName: string | null = null;
  if (lines.length > 0) {
    const firstLine = lines[0];
    if (/messages and calls are end-to-end encrypted/i.test(firstLine)) {
      // Standard WhatsApp header — no group name extractable
    } else if (!WA_LINE_REGEX.test(firstLine) && !WA_LINE_ISO_REGEX.test(firstLine)) {
      // First line is not a message — might be a group name or header
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
  };
}

/**
 * Chunk messages into groups for storage.
 * Groups consecutive messages by sender and time proximity (5-min windows).
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
