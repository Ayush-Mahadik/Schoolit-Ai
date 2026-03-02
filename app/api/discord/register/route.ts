/**
 * Discord Slash Command Registration — SchoolIT AI
 * =================================================
 * Call this endpoint once to register slash commands with Discord.
 * POST /api/discord/register
 *
 * This only needs to be called once (or when commands change).
 */

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const DISCORD_API = "https://discord.com/api/v10";

// Slash command definitions
const COMMANDS = [
  {
    name: "ask",
    description: "Ask SchoolIT AI any academic question",
    options: [
      {
        name: "question",
        description: "Your question (e.g., 'Explain photosynthesis')",
        type: 3, // STRING
        required: true,
      },
      {
        name: "subject",
        description: "Subject area",
        type: 3, // STRING
        required: false,
        choices: [
          { name: "Mathematics", value: "math" },
          { name: "Physics", value: "physics" },
          { name: "Chemistry", value: "chemistry" },
          { name: "Biology", value: "biology" },
          { name: "Computer Science", value: "cs" },
          { name: "English", value: "english" },
          { name: "Social Studies", value: "sst" },
          { name: "Sanskrit", value: "sanskrit" },
          { name: "General", value: "general" },
        ],
      },
      {
        name: "mode",
        description: "Thinking mode (how deep should the AI think?)",
        type: 3, // STRING
        required: false,
        choices: [
          { name: "⚡ Fast — Quick answers", value: "fast" },
          { name: "⚖️ Balanced — Detailed answers", value: "balanced" },
          { name: "🧠 Deep — Multi-model cross-checked", value: "deep" },
        ],
      },
    ],
  },
  {
    name: "quiz",
    description: "Generate a quick quiz on any topic",
    options: [
      {
        name: "topic",
        description: "Quiz topic (e.g., 'Photosynthesis', 'Quadratic equations')",
        type: 3,
        required: true,
      },
      {
        name: "subject",
        description: "Subject area",
        type: 3,
        required: false,
        choices: [
          { name: "Mathematics", value: "math" },
          { name: "Physics", value: "physics" },
          { name: "Chemistry", value: "chemistry" },
          { name: "Biology", value: "biology" },
          { name: "Computer Science", value: "cs" },
          { name: "English", value: "english" },
          { name: "General", value: "general" },
        ],
      },
    ],
  },
  {
    name: "explain",
    description: "Get a detailed explanation of any concept",
    options: [
      {
        name: "concept",
        description: "Concept to explain (e.g., 'Newton's Third Law')",
        type: 3,
        required: true,
      },
      {
        name: "subject",
        description: "Subject area",
        type: 3,
        required: false,
        choices: [
          { name: "Mathematics", value: "math" },
          { name: "Physics", value: "physics" },
          { name: "Chemistry", value: "chemistry" },
          { name: "Biology", value: "biology" },
          { name: "Computer Science", value: "cs" },
          { name: "English", value: "english" },
          { name: "General", value: "general" },
        ],
      },
    ],
  },
];

export async function POST() {
  const botToken = process.env.DISCORD_BOT_TOKEN;
  const applicationId = process.env.DISCORD_APPLICATION_ID;

  if (!botToken || !applicationId) {
    return NextResponse.json(
      {
        error: "Missing DISCORD_BOT_TOKEN or DISCORD_APPLICATION_ID environment variables",
        setup: {
          step1: "Go to https://discord.com/developers/applications",
          step2: "Create application → Copy Application ID → Set DISCORD_APPLICATION_ID",
          step3: "Go to Bot tab → Copy Token → Set DISCORD_BOT_TOKEN",
          step4: "Copy Public Key → Set DISCORD_PUBLIC_KEY",
          step5: "Set Interactions Endpoint URL to: https://schoolit-ai.vercel.app/api/discord",
          step6: "POST to this endpoint to register commands",
          step7: "Use OAuth2 URL Generator to add bot to your server",
        },
      },
      { status: 400 }
    );
  }

  try {
    // Register global commands
    const response = await fetch(
      `${DISCORD_API}/applications/${applicationId}/commands`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bot ${botToken}`,
        },
        body: JSON.stringify(COMMANDS),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json(
        { error: "Failed to register commands", details: error },
        { status: response.status }
      );
    }

    const result = await response.json();
    return NextResponse.json({
      success: true,
      message: `Registered ${result.length} slash commands`,
      commands: result.map((c: { name: string; id: string }) => ({
        name: c.name,
        id: c.id,
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Registration failed", details: String(err) },
      { status: 500 }
    );
  }
}
