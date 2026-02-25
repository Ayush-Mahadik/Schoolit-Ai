// Quick test of the chat route logic without running Next.js
import OpenAI from "openai";

const token = process.env.GITHUB_TOKEN;
if (!token) {
  console.error("No GITHUB_TOKEN found. Reading from .env.local...");
  const fs = await import("fs");
  const envContent = fs.readFileSync(".env.local", "utf-8");
  const match = envContent.match(/GITHUB_TOKEN=(.+)/);
  if (match) {
    process.env.GITHUB_TOKEN = match[1].trim();
  } else {
    console.error("Could not find GITHUB_TOKEN in .env.local");
    process.exit(1);
  }
}

const client = new OpenAI({
  baseURL: "https://models.inference.ai.azure.com",
  apiKey: process.env.GITHUB_TOKEN,
});

// Simulate what the route does
const tools = [
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Search the web",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
        },
        required: ["query"],
      },
    },
  },
];

console.log("Testing with model gpt-4o...");
console.log("Token starts with:", process.env.GITHUB_TOKEN.slice(0, 10));

try {
  const response = await client.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 4096,
    messages: [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: "hi" },
    ],
    tools: tools,
    tool_choice: "auto",
  });
  console.log("SUCCESS!");
  console.log("Response:", response.choices[0].message.content);
  console.log("Model:", response.model);
} catch (err) {
  console.error("FAILED!");
  console.error("Error type:", err.constructor.name);
  console.error("Error message:", err.message);
  console.error("Status:", err.status);
  console.error("Code:", err.code);
  console.error("Type:", err.type);
  if (err.error) console.error("Error body:", JSON.stringify(err.error));
}

// Now test with the ACTUAL tool definitions from the app
console.log("\n\n--- Testing with actual TOOL_DEFINITIONS ---");
try {
  // Import the actual tools
  const { TOOL_DEFINITIONS } = await import("./lib/server/tools.ts").catch(() => {
    console.log("Cannot import TS directly, trying compiled...");
    return { TOOL_DEFINITIONS: tools };
  });
  
  console.log(`Using ${Array.isArray(TOOL_DEFINITIONS) ? TOOL_DEFINITIONS.length : '?'} tools`);
  
  const response2 = await client.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 4096,
    messages: [
      { role: "system", content: "You are SchoolIT AI, a teaching assistant. Be brief." },
      { role: "user", content: "hi" },
    ],
    tools: TOOL_DEFINITIONS.length > 0 ? TOOL_DEFINITIONS : undefined,
    tool_choice: TOOL_DEFINITIONS.length > 0 ? "auto" : undefined,
  });
  console.log("SUCCESS with tools!");
  console.log("Response:", response2.choices[0].message.content?.slice(0, 200));
} catch (err) {
  console.error("FAILED with tools!");
  console.error("Error:", err.message);
  console.error("Status:", err.status);
  if (err.error) console.error("Error body:", JSON.stringify(err.error));
}
