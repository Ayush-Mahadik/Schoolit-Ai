/**
 * Discord Bot Integration — SchoolIT AI
 * ======================================
 * Handles Discord Interactions (slash commands) via HTTP webhook.
 * No WebSocket needed — works perfectly on Vercel serverless.
 *
 * Setup:
 * 1. Go to https://discord.com/developers/applications
 * 2. Create a new application → "SchoolIT AI"
 * 3. Go to Bot → Copy the Bot Token → Set as DISCORD_BOT_TOKEN env var
 * 4. Go to General Information → Copy Public Key → Set as DISCORD_PUBLIC_KEY env var
 * 5. Copy Application ID → Set as DISCORD_APPLICATION_ID env var
 * 6. Set Interactions Endpoint URL to: https://schoolit-ai.vercel.app/api/discord
 * 7. Go to OAuth2 → URL Generator → Select "bot" + "applications.commands"
 * 8. Select permissions: Send Messages, Embed Links, Read Message History
 * 9. Copy the generated URL and open it to add the bot to your server
 * 10. Call POST /api/discord/register to register slash commands (one-time setup)
 */

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ── Ed25519 Signature Verification ────────────────────────────────────
// Discord requires verifying request signatures using Ed25519
async function verifyDiscordSignature(
  publicKey: string,
  signature: string,
  timestamp: string,
  body: string
): Promise<boolean> {
  try {
    // Use tweetnacl for Ed25519 verification
    const nacl = await import("tweetnacl");
    const hexToUint8 = (hex: string) => {
      const bytes = new Uint8Array(hex.length / 2);
      for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
      }
      return bytes;
    };
    const encoder = new TextEncoder();
    const message = encoder.encode(timestamp + body);
    const sig = hexToUint8(signature);
    const key = hexToUint8(publicKey);

    return nacl.sign.detached.verify(message, sig, key);
  } catch (err) {
    console.error("Discord signature verification failed:", err);
    return false;
  }
}

// ── Discord API helpers ───────────────────────────────────────────────
const DISCORD_API = "https://discord.com/api/v10";

async function sendFollowup(
  applicationId: string,
  interactionToken: string,
  content: string,
  botToken: string
) {
  // Split content into chunks of 2000 chars (Discord limit)
  const chunks: string[] = [];
  let remaining = content;
  while (remaining.length > 0) {
    if (remaining.length <= 2000) {
      chunks.push(remaining);
      break;
    }
    // Find a good split point (newline or space)
    let splitAt = remaining.lastIndexOf("\n", 2000);
    if (splitAt < 1000) splitAt = remaining.lastIndexOf(" ", 2000);
    if (splitAt < 500) splitAt = 2000;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt);
  }

  for (let i = 0; i < chunks.length; i++) {
    const res = await fetch(
      `${DISCORD_API}/webhooks/${applicationId}/${interactionToken}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bot ${botToken}`,
        },
        body: JSON.stringify({
          content: chunks[i],
          flags: 0,
        }),
      }
    );
    if (!res.ok) {
      console.error(`Discord followup failed (chunk ${i + 1}):`, res.status, await res.text());
    }
    // Small delay between chunks to avoid rate limits
    if (i < chunks.length - 1) {
      await new Promise(r => setTimeout(r, 500));
    }
  }
}

// ── Process AI request ────────────────────────────────────────────────
async function processAIRequest(
  question: string,
  subject: string,
  thinkingMode: string,
  applicationId: string,
  interactionToken: string,
  botToken: string
) {
  try {
    // Call our own chat API internally
    const baseUrl = process.env.NEXTAUTH_URL || process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000";

    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://schoolit-ai.vercel.app",
      },
      body: JSON.stringify({
        message: question,
        subject: subject || "general",
        persona: "balanced",
        use_web_search: true,
        thinking_mode: thinkingMode || "balanced",
        history: [],
        context_files: [],
      }),
    });

    if (!response.ok) {
      await sendFollowup(
        applicationId,
        interactionToken,
        "❌ Sorry, I couldn't process your question. Please try again later.",
        botToken
      );
      return;
    }

    // Parse NDJSON response
    const text = await response.text();
    const lines = text.split("\n").filter(Boolean);
    let aiResponse = "";

    for (const line of lines) {
      try {
        const event = JSON.parse(line);
        if (event.type === "result" && event.data?.response) {
          aiResponse = event.data.response;
        }
      } catch { /* skip malformed lines */ }
    }

    if (!aiResponse) {
      aiResponse = "I couldn't generate a response. Please try again.";
    }

    // Format for Discord (strip some markdown that doesn't render well)
    let discordContent = aiResponse
      // Convert image blocks to links
      .replace(/```image\n[\s\S]*?```/g, "[Image generated — view on SchoolIT AI]")
      // Convert chart blocks to text
      .replace(/```chart\n[\s\S]*?```/g, "[Chart generated — view on SchoolIT AI]")
      // Keep mermaid as code blocks (Discord renders them as code)
      // Convert KaTeX to plain text
      .replace(/\$\$([\s\S]*?)\$\$/g, (_, math: string) => `\`${math.trim()}\``)
      .replace(/\$([\s\S]*?)\$/g, (_, math: string) => `\`${math.trim()}\``);

    // Add footer
    discordContent += "\n\n-# 🎓 *SchoolIT AI — [schoolit-ai.vercel.app](https://schoolit-ai.vercel.app)*";

    await sendFollowup(applicationId, interactionToken, discordContent, botToken);
  } catch (err) {
    console.error("Discord AI processing error:", err);
    await sendFollowup(
      applicationId,
      interactionToken,
      "❌ An error occurred while processing your question. Please try again.",
      botToken
    );
  }
}

// ══════════════════════════════════════════════════════════════════════
//  POST /api/discord — Discord Interactions Endpoint
// ══════════════════════════════════════════════════════════════════════
export async function POST(req: NextRequest) {
  const publicKey = process.env.DISCORD_PUBLIC_KEY;
  const botToken = process.env.DISCORD_BOT_TOKEN;
  const applicationId = process.env.DISCORD_APPLICATION_ID;

  if (!publicKey || !botToken || !applicationId) {
    return NextResponse.json(
      { error: "Discord bot not configured" },
      { status: 500 }
    );
  }

  // ── Verify Discord signature ──────────────────────────────────────
  const signature = req.headers.get("x-signature-ed25519") || "";
  const timestamp = req.headers.get("x-signature-timestamp") || "";
  const rawBody = await req.text();

  const isValid = await verifyDiscordSignature(publicKey, signature, timestamp, rawBody);
  if (!isValid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // ── Parse interaction ─────────────────────────────────────────────
  const interaction = JSON.parse(rawBody);

  // Ping — Discord verification handshake
  if (interaction.type === 1) {
    return NextResponse.json({ type: 1 });
  }

  // Slash command
  if (interaction.type === 2) {
    const commandName = interaction.data.name;
    const options = interaction.data.options || [];
    const getOption = (name: string) =>
      options.find((o: { name: string; value: string }) => o.name === name)?.value;

    if (commandName === "ask") {
      const question = getOption("question");
      const subject = getOption("subject") || "general";
      const mode = getOption("mode") || "balanced";

      if (!question) {
        return NextResponse.json({
          type: 4,
          data: { content: "❌ Please provide a question!", flags: 64 },
        });
      }

      // Respond immediately with "thinking..." (type 5 = deferred response)
      // Then process in the background
      const responsePromise = processAIRequest(
        question,
        subject,
        mode,
        applicationId,
        interaction.token,
        botToken
      );

      // Don't await — let it run in the background
      responsePromise.catch(err => console.error("Discord background processing error:", err));

      return NextResponse.json({
        type: 5, // DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
        data: { flags: 0 },
      });
    }

    if (commandName === "quiz") {
      const topic = getOption("topic") || "general knowledge";
      const subject = getOption("subject") || "general";

      const responsePromise = processAIRequest(
        `Generate a quick 5-question quiz about ${topic}`,
        subject,
        "fast",
        applicationId,
        interaction.token,
        botToken
      );
      responsePromise.catch(err => console.error("Discord quiz error:", err));

      return NextResponse.json({ type: 5, data: { flags: 0 } });
    }

    if (commandName === "explain") {
      const concept = getOption("concept");
      if (!concept) {
        return NextResponse.json({
          type: 4,
          data: { content: "❌ Please specify a concept to explain!", flags: 64 },
        });
      }

      const responsePromise = processAIRequest(
        `Explain ${concept} in detail with examples`,
        getOption("subject") || "general",
        "balanced",
        applicationId,
        interaction.token,
        botToken
      );
      responsePromise.catch(err => console.error("Discord explain error:", err));

      return NextResponse.json({ type: 5, data: { flags: 0 } });
    }

    // Unknown command
    return NextResponse.json({
      type: 4,
      data: { content: "Unknown command. Try `/ask`, `/quiz`, or `/explain`.", flags: 64 },
    });
  }

  return NextResponse.json({ error: "Unknown interaction type" }, { status: 400 });
}
