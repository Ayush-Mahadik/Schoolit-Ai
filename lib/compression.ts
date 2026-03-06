/**
 * Message compression and context optimization
 * Reduces payload size and token usage in API calls
 */

import type { Message } from "@/lib/types";

interface CompressionOptions {
  maxHistoryMessages?: number;
  maxMessageLength?: number;
  removeWhitespace?: boolean;
  compressOldMessages?: boolean;
}

/**
 * Compress a single message by removing excess whitespace
 */
export function compressMessage(content: string): string {
  return content
    .replace(/\s+/g, " ") // Multiple spaces → single space
    .replace(/\n+/g, "\n") // Multiple newlines → single
    .trim();
}

/**
 * Summarize a message to a shorter representation
 * Useful for context that we want to preserve but not send in full
 */
export function summarizeMessage(message: Message, maxLength: number = 200): string {
  const content = message.content.slice(0, maxLength);
  const role = message.role === "user" ? "User" : "Assistant";
  return `${role}: ${compressMessage(content)}`;
}

/**
 * Intelligently compress conversation history
 * Keeps recent messages, compresses older ones
 */
export function compressHistory(
  messages: Message[],
  options: CompressionOptions = {}
): Message[] {
  const {
    maxHistoryMessages = 16, // Keep last N messages in full
    maxMessageLength = 2000, // Truncate individual messages
    removeWhitespace = true,
    compressOldMessages = true,
  } = options;

  if (messages.length <= maxHistoryMessages) {
    return messages.map((msg) => ({
      ...msg,
      content: removeWhitespace ? compressMessage(msg.content) : msg.content,
    }));
  }

  // Keep recent messages in full, compress older ones
  const recentStart = messages.length - maxHistoryMessages;
  const recent = messages.slice(recentStart);
  const older = messages.slice(0, recentStart);

  // Process recent messages (full quality)
  const processedRecent = recent.map((msg) => ({
    ...msg,
    content:
      removeWhitespace && msg.content.length > maxMessageLength
        ? `${compressMessage(msg.content.slice(0, maxMessageLength))}...`
        : removeWhitespace
          ? compressMessage(msg.content)
          : msg.content,
  }));

  // Return compressed history (no system message needed, caller will handle summary)
  return [...older, ...processedRecent];
}

/**
 * Remove redundant context from a message
 * Strips common patterns that waste tokens
 */
export function removeRedundantContext(content: string): string {
  // Remove common filler phrases
  const fillerPhrases = [
    /^Here's?\s+(?:a\s+)?(?:detailed\s+)?answer[:\s]*/gi,
    /^Based on[^:]*:\s*/gi,
    /^Let me[^:]*:\s*/gi,
    /^I've?\s+(?:found|provided|created)[^:]*:\s*/gi,
    /^As requested[^:]*:\s*/gi,
    /\n\n+/g, // Multiple blank lines
  ];

  let result = content;
  for (const pattern of fillerPhrases) {
    result = result.replace(pattern, "");
  }

  return result.trim();
}

/**
 * Optimize messages for API transmission
 * Combines compression, whitespace cleanup, and deduplication
 */
export function optimizeForAPI(
  messages: Message[],
  options: CompressionOptions = {}
): Array<{ role: string; content: string }> {
  const compressed = compressHistory(messages, options);

  // Deduplicate consecutive messages from same role
  const optimized = [];
  let lastRole: string | null = null;

  for (const msg of compressed) {
    if (msg.role !== lastRole) {
      const cleanContent = removeRedundantContext(msg.content);
      optimized.push({
        role: msg.role,
        content: cleanContent.slice(0, options.maxMessageLength ?? 2000),
      });
      lastRole = msg.role;
    }
  }

  return optimized;
}

/**
 * Estimate token count (rough approximation)
 * Useful for checking before sending to API
 */
export function estimateTokens(text: string): number {
  // Rough rule: 1 token ≈ 4 characters for English
  // More accurate: 1 token ≈ 0.3-0.4 words
  return Math.ceil(text.split(/\s+/).length / 0.75);
}

/**
 * Check if a message is too large and needs compression
 */
export function shouldCompress(messages: Message[], maxTokens: number = 8000): boolean {
  const totalText = messages.map((m) => m.content).join(" ");
  return estimateTokens(totalText) > maxTokens;
}

/**
 * Create a lightweight context summary from recent messages
 * Useful for knowledge base summaries, search context, etc.
 */
export function createContextSummary(
  messages: Message[],
  maxMessages: number = 5
): string {
  const recent = messages.slice(-maxMessages);
  return recent
    .map((m) => {
      const summary = compressMessage(m.content).slice(0, 150);
      return `${m.role === "user" ? "Q" : "A"}: ${summary}`;
    })
    .join("\n");
}
