/**
 * Tool Definitions & Executors for OpenAI Function Calling
 * =========================================================
 * Defines the tools the AI can use and implements their execution.
 * Tools: web_search, generate_chart, step_by_step_solve, manage_calendar
 */

export const TOOL_DEFINITIONS: { type: "function"; function: { name: string; description: string; parameters: Record<string, unknown> } }[] = [
  // ── 1. Web Search ───────────────────────────────────────────────────
  {
    type: "function" as const,
    function: {
      name: "web_search",
      description:
        "Search the web for current information on any topic. " +
        "Use this when you need facts, data, formulas, or explanations you're not 100% certain about. " +
        "Always prefer searching over guessing. Returns extracted content from top web results.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "The search query. Be specific and include relevant keywords. " +
              "Example: 'Newton second law of motion formula SI units'",
          },
          max_results: {
            type: "integer",
            description: "Number of web pages to retrieve (1-5). Default 3.",
          },
        },
        required: ["query"],
      },
    },
  },

  // ── 2. Chart / Graph Generator ──────────────────────────────────────
  {
    type: "function" as const,
    function: {
      name: "generate_chart",
      description:
        "Generate a visual chart or graph to help the student understand data or relationships. " +
        "Use this tool PROACTIVELY whenever data visualization would aid comprehension. " +
        "Supported types: line, bar, pie, area, scatter. " +
        "ALWAYS use this for: plotting mathematical functions, showing physics graphs (v-t, s-t, a-t), " +
        "comparing data, showing distributions, illustrating trends, or any quantitative relationship.",
      parameters: {
        type: "object",
        properties: {
          chart_data: {
            type: "string",
            description:
              'JSON string of chart specification. Structure:\n' +
              '{\n' +
              '  "type": "line"|"bar"|"pie"|"area"|"scatter",\n' +
              '  "title": "Chart Title",\n' +
              '  "xLabel": "X-Axis Label",\n' +
              '  "yLabel": "Y-Axis Label",\n' +
              '  "datasets": [\n' +
              '    {\n' +
              '      "label": "Series Name",\n' +
              '      "data": [{"x": 0, "y": 0}, {"x": 1, "y": 9.8}],\n' +
              '      "color": "#3b82f6"\n' +
              '    }\n' +
              '  ]\n' +
              '}\n' +
              'For pie charts, use {"name": "Label", "value": 46} in data array.\n' +
              'IMPORTANT: Generate enough data points for smooth curves (at least 10-20 for function graphs).',
          },
          description: {
            type: "string",
            description: "Brief explanation of what the chart shows and its significance.",
          },
        },
        required: ["chart_data", "description"],
      },
    },
  },

  // ── 3. Deep Reasoning / Step-by-Step Solver ─────────────────────────
  {
    type: "function" as const,
    function: {
      name: "step_by_step_solve",
      description:
        "Activate rigorous step-by-step Chain-of-Thought reasoning for a problem. " +
        "Use this BEFORE solving ANY complex math, physics, chemistry, or logic problem. " +
        "This structures your response into: " +
        "1) Classify the problem type, 2) Extract given values and unknowns, " +
        "3) List relevant formulas/theorems, 4) Solve step by step with FULL working, " +
        "5) Verify the answer using an alternative method, " +
        "6) State the final answer with units and key insights.",
      parameters: {
        type: "object",
        properties: {
          problem: {
            type: "string",
            description: "The problem statement to solve step by step.",
          },
          subject: {
            type: "string",
            enum: ["math", "physics", "chemistry", "biology", "cs", "english", "sst", "sanskrit", "general"],
            description: "The subject area for this problem.",
          },
        },
        required: ["problem"],
      },
    },
  },

  // ── 4. Google Calendar Manager ──────────────────────────────────────
  {
    type: "function" as const,
    function: {
      name: "manage_calendar",
      description:
        "Manage the student's Google Calendar. Create study sessions, " +
        "set exam reminders, homework deadlines, or check upcoming schedule.",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["create", "list"],
            description: "Calendar action to perform.",
          },
          title: { type: "string", description: "Event title (for 'create')." },
          description: { type: "string", description: "Event description (for 'create')." },
          start_time: { type: "string", description: "ISO 8601 start time (for 'create')." },
          end_time: { type: "string", description: "ISO 8601 end time (for 'create')." },
          timezone: { type: "string", description: "Timezone. Default: UTC." },
          max_results: { type: "integer", description: "Number of events to list (for 'list')." },
        },
        required: ["action"],
      },
    },
  },

  // ── 5. Manim Animation Generator ────────────────────────────────────
  {
    type: "function" as const,
    function: {
      name: "generate_manim",
      description:
        "Generate a Manim (Mathematical Animation Engine) Python code snippet to create " +
        "a mathematical animation. Use this when the student asks for visual animations of " +
        "mathematical concepts like: graphs transforming, geometric proofs, vector fields, " +
        "physics simulations, function plotting, 3D surfaces, matrix operations, etc. " +
        "Generate complete, runnable Manim Community Edition code.",
      parameters: {
        type: "object",
        properties: {
          code: {
            type: "string",
            description:
              "Complete Manim Python code. Must import from manim, define a Scene subclass, " +
              "and implement construct(). Use ManimCE syntax.",
          },
          scene_name: {
            type: "string",
            description: "The class name of the Scene to render.",
          },
          explanation: {
            type: "string",
            description: "Brief explanation of what the animation shows.",
          },
        },
        required: ["code", "scene_name", "explanation"],
      },
    },
  },

  // ── 6. Create Flashcards ────────────────────────────────────────────
  {
    type: "function" as const,
    function: {
      name: "create_flashcards",
      description:
        "Generate study flashcards for a topic. Use this when students want to review " +
        "or memorize key concepts, formulas, definitions, or vocabulary.",
      parameters: {
        type: "object",
        properties: {
          topic: { type: "string", description: "The topic to create flashcards for." },
          cards: {
            type: "string",
            description:
              'JSON array of flashcard objects with "front" (question/term) and "back" (answer/definition). ' +
              'Example: [{"front":"What is the quadratic formula?","back":"$x = \\\\frac{-b \\\\pm \\\\sqrt{b^2 - 4ac}}{2a}$"}]',
          },
          count: { type: "integer", description: "Number of flashcards (default 10)." },
        },
        required: ["topic", "cards"],
      },
    },
  },

  // ── 7. Quiz Generator ──────────────────────────────────────────────
  {
    type: "function" as const,
    function: {
      name: "generate_quiz",
      description:
        "Generate a practice quiz with multiple choice or short answer questions. " +
        "Use when students want to test their understanding of a topic.",
      parameters: {
        type: "object",
        properties: {
          topic: { type: "string", description: "Topic for the quiz." },
          questions: {
            type: "string",
            description:
              'JSON array of question objects. Each has "question", "options" (array of 4 choices), ' +
              '"correct" (index 0-3), and "explanation". ' +
              'Example: [{"question":"What is 2+2?","options":["3","4","5","6"],"correct":1,"explanation":"Basic addition."}]',
          },
          difficulty: {
            type: "string",
            enum: ["easy", "medium", "hard"],
            description: "Quiz difficulty level.",
          },
        },
        required: ["topic", "questions"],
      },
    },
  },

  // ── 8. Flowchart / Diagram Generator ────────────────────────────────
  {
    type: "function" as const,
    function: {
      name: "generate_flowchart",
      description:
        "Generate a flowchart or diagram using Mermaid.js syntax. " +
        "Use this when the student asks for: flowcharts, process diagrams, sequence diagrams, " +
        "class diagrams, state diagrams, ER diagrams, Gantt charts, mind maps, or any visual " +
        "representation of processes, algorithms, or relationships. " +
        "ALWAYS use this for: algorithm flowcharts, biology pathways, chemistry reaction steps, " +
        "decision trees, organizational charts, timelines.",
      parameters: {
        type: "object",
        properties: {
          mermaid_code: {
            type: "string",
            description:
              'Complete Mermaid.js diagram code. Supported types:\n' +
              '- flowchart (graph TD/LR): Process flows, algorithms\n' +
              '- sequenceDiagram: Interactions between components\n' +
              '- classDiagram: Class relationships\n' +
              '- stateDiagram-v2: State machines\n' +
              '- erDiagram: Entity relationships\n' +
              '- gantt: Project timelines\n' +
              '- mindmap: Brainstorming, concept maps\n' +
              'Example: "graph TD\\n    A[Start] --> B{Decision}\\n    B -->|Yes| C[Do Something]\\n    B -->|No| D[End]"',
          },
          title: {
            type: "string",
            description: "Title of the diagram.",
          },
          explanation: {
            type: "string",
            description: "Brief explanation of what the diagram represents.",
          },
        },
        required: ["mermaid_code", "title", "explanation"],
      },
    },
  },

  // ── 9. Image Generation (DALL-E style prompt) ───────────────────────
  {
    type: "function" as const,
    function: {
      name: "generate_image",
      description:
        "Generate a descriptive image prompt that could be used to create educational illustrations. " +
        "Use this when students need: diagrams, scientific illustrations, historical scenes, " +
        "biological structures, physics concepts visualized, geography maps, etc. " +
        "Returns a detailed description and Mermaid/SVG fallback visualization.",
      parameters: {
        type: "object",
        properties: {
          prompt: {
            type: "string",
            description: "Detailed description of the educational image to generate.",
          },
          style: {
            type: "string",
            enum: ["diagram", "illustration", "schematic", "infographic", "realistic", "cartoon"],
            description: "Visual style for the image.",
          },
          subject: {
            type: "string",
            description: "The academic subject this image relates to.",
          },
        },
        required: ["prompt", "style"],
      },
    },
  },

  // ── 10. Image Recognition / Analysis ────────────────────────────────
  {
    type: "function" as const,
    function: {
      name: "recognize_image",
      description:
        "Analyze and describe an uploaded image. Use this when a student uploads an image and asks " +
        "about it — e.g. 'What is this?', 'Solve this problem from the photo', 'Explain this diagram'. " +
        "The image content will already be in the conversation context. " +
        "This tool structures your analysis into: identification, key details, educational context.",
      parameters: {
        type: "object",
        properties: {
          analysis_type: {
            type: "string",
            enum: ["identify", "solve", "explain", "describe", "extract_text"],
            description: "Type of image analysis to perform.",
          },
          context: {
            type: "string",
            description: "Additional context about what to focus on in the image.",
          },
        },
        required: ["analysis_type"],
      },
    },
  },
];

// ══════════════════════════════════════════════════════════════════════════
//  TOOL EXECUTORS
// ══════════════════════════════════════════════════════════════════════════

export async function executeTool(
  toolName: string,
  toolInput: Record<string, unknown>
): Promise<{ result: unknown; chartData?: unknown; sources?: string[] }> {
  switch (toolName) {
    case "web_search":
      return await executeWebSearch(toolInput);

    case "generate_chart":
      return executeChartGeneration(toolInput);

    case "step_by_step_solve":
      return {
        result: {
          message:
            "Deep reasoning mode activated. Now solve this problem following ALL phases: " +
            "Understanding → Strategy → Execution (show EVERY step) → Verification → Conclusion. " +
            "Use LaTeX with $ delimiters for all math. Show complete working — never skip steps.",
          problem: toolInput.problem,
          subject: toolInput.subject || "general",
        },
      };

    case "manage_calendar":
      return {
        result: {
          message:
            "Calendar integration requires Google Calendar OAuth setup. " +
            "The student can configure this in Settings → Calendar. " +
            "For now, I can help you plan a study schedule — just tell me your subjects and available times!",
          action: toolInput.action,
        },
      };

    case "generate_manim":
      return executeManimGeneration(toolInput);

    case "create_flashcards":
      return executeFlashcardGeneration(toolInput);

    case "generate_quiz":
      return executeQuizGeneration(toolInput);

    case "generate_flowchart":
      return executeFlowchartGeneration(toolInput);

    case "generate_image":
      return executeImageGeneration(toolInput);

    case "recognize_image":
      return executeImageRecognition(toolInput);

    default:
      return { result: { error: `Unknown tool: ${toolName}` } };
  }
}

// ── Web Search Implementation ─────────────────────────────────────────

async function executeWebSearch(
  input: Record<string, unknown>
): Promise<{ result: unknown; sources?: string[] }> {
  const query = String(input.query || "").trim();
  if (!query) {
    return { result: { message: "Empty search query." }, sources: [] };
  }
  const maxResults = Math.min(Number(input.max_results) || 3, 5);

  try {
    // Use DuckDuckGo HTML search
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const response = await fetch(searchUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      return {
        result: { message: `Web search returned no results for: ${query}` },
        sources: [],
      };
    }

    const html = await response.text();

    // Parse results from DuckDuckGo HTML response
    const results: { url: string; title: string; snippet: string }[] = [];

    // Extract result URLs and snippets
    const linkRegex = /href="[^"]*uddg=([^&"]+)[^"]*"[^>]*class="result__a"[^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = linkRegex.exec(html)) !== null && results.length < maxResults) {
      const url = decodeURIComponent(match[1]);
      const title = match[2].replace(/<[^>]*>/g, "").trim();
      if (url.startsWith("http")) {
        results.push({ url, title, snippet: "" });
      }
    }

    // Alternative regex pattern
    if (results.length === 0) {
      const altRegex = /class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
      while ((match = altRegex.exec(html)) !== null && results.length < maxResults) {
        let url = match[1];
        if (url.includes("uddg=")) {
          const uddg = url.match(/uddg=([^&]*)/);
          if (uddg) url = decodeURIComponent(uddg[1]);
        }
        const title = match[2].replace(/<[^>]*>/g, "").trim();
        if (url.startsWith("http")) {
          results.push({ url, title, snippet: "" });
        }
      }
    }

    // Extract snippets
    const snippetRegex = /class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|div|span)>/gi;
    let snippetIdx = 0;
    while ((match = snippetRegex.exec(html)) !== null && snippetIdx < results.length) {
      results[snippetIdx].snippet = match[1].replace(/<[^>]*>/g, "").trim();
      snippetIdx++;
    }

    if (results.length === 0) {
      return {
        result: { message: `No web results found for: ${query}`, results: [] },
        sources: [],
      };
    }

    // Fetch content from top results (with timeout)
    const enrichedResults = await Promise.all(
      results.slice(0, maxResults).map(async (r) => {
        try {
          const pageRes = await fetch(r.url, {
            headers: {
              "User-Agent": "Mozilla/5.0 (compatible; SmartSchoolAI/2.0)",
              Accept: "text/html",
            },
            signal: AbortSignal.timeout(5000),
          });
          if (!pageRes.ok) return { ...r, content: r.snippet };

          const pageHtml = await pageRes.text();
          // Extract text content
          const textContent = pageHtml
            .replace(/<script[\s\S]*?<\/script>/gi, "")
            .replace(/<style[\s\S]*?<\/style>/gi, "")
            .replace(/<nav[\s\S]*?<\/nav>/gi, "")
            .replace(/<footer[\s\S]*?<\/footer>/gi, "")
            .replace(/<header[\s\S]*?<\/header>/gi, "")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 4000);

          return { ...r, content: textContent || r.snippet };
        } catch {
          return { ...r, content: r.snippet };
        }
      })
    );

    return {
      result: { results: enrichedResults },
      sources: enrichedResults.map((r) => r.url).filter(Boolean),
    };
  } catch (error) {
    return {
      result: {
        message: `Web search could not complete: ${error instanceof Error ? error.message : "timeout"}. Please rely on your existing knowledge.`,
      },
      sources: [],
    };
  }
}

// ── Chart Generation ──────────────────────────────────────────────────

function executeChartGeneration(
  input: Record<string, unknown>
): { result: unknown; chartData?: unknown } {
  try {
    const chartData =
      typeof input.chart_data === "string"
        ? JSON.parse(input.chart_data)
        : input.chart_data;

    if (!chartData.type || !chartData.datasets) {
      return {
        result: { error: "Invalid chart data: missing 'type' or 'datasets'." },
      };
    }

    return {
      result: {
        message: `Chart generated successfully: ${input.description || "Visualization"}`,
        chart_rendered: true,
      },
      chartData,
    };
  } catch (e) {
    return {
      result: {
        error: `Invalid chart data format: ${e instanceof Error ? e.message : "parse error"}. Please provide valid JSON.`,
      },
    };
  }
}

// ── Manim Generation ──────────────────────────────────────────────────

function executeManimGeneration(
  input: Record<string, unknown>
): { result: unknown } {
  const code = String(input.code || "");
  const sceneName = String(input.scene_name || "");
  const explanation = String(input.explanation || "");

  if (!code || !sceneName) {
    return {
      result: {
        error: "Manim code and scene name are required.",
      },
    };
  }

  return {
    result: {
      message:
        `Manim animation code generated for scene: ${sceneName}\n\n` +
        `**Explanation:** ${explanation}\n\n` +
        `To render this animation:\n` +
        `1. Install Manim: \`pip install manim\`\n` +
        `2. Save the code to a file: \`animation.py\`\n` +
        `3. Run: \`manim -pql animation.py ${sceneName}\`\n\n` +
        `The animation will be rendered and saved in the \`media/\` folder.`,
      code,
      scene_name: sceneName,
      explanation,
    },
  };
}

// ── Flashcard Generation ──────────────────────────────────────────────

function executeFlashcardGeneration(
  input: Record<string, unknown>
): { result: unknown } {
  const topic = String(input.topic || "");
  let cards: unknown[] = [];

  try {
    cards = typeof input.cards === "string" ? JSON.parse(input.cards) : input.cards || [];
  } catch {
    return {
      result: {
        error: "Invalid flashcards JSON format.",
      },
    };
  }

  if (!Array.isArray(cards)) {
    return {
      result: {
        error: "Flashcards must be an array of objects with 'front' and 'back' properties.",
      },
    };
  }

  return {
    result: {
      message: `Created ${cards.length} flashcards for "${topic}". Use them to study and review!`,
      topic,
      cards,
      studyTip: "Read the front side, try to recall the answer, then flip to check. Repeat daily for best retention.",
    },
  };
}

// ── Quiz Generation ───────────────────────────────────────────────────

function executeQuizGeneration(
  input: Record<string, unknown>
): { result: unknown } {
  const topic = String(input.topic || "");
  const difficulty = String(input.difficulty || "medium");
  let questions: unknown[] = [];

  try {
    questions = typeof input.questions === "string" ? JSON.parse(input.questions) : input.questions || [];
  } catch {
    return {
      result: {
        error: "Invalid quiz JSON format.",
      },
    };
  }

  if (!Array.isArray(questions)) {
    return {
      result: {
        error: "Questions must be an array of question objects.",
      },
    };
  }

  return {
    result: {
      message: `Generated a ${difficulty} quiz with ${questions.length} questions on "${topic}". Good luck!`,
      topic,
      difficulty,
      questions,
      quizTip: "Take your time to understand each question. Read all options before selecting. Review explanations after each answer.",
    },
  };
}

// ── Flowchart / Diagram Generation ────────────────────────────────────

function executeFlowchartGeneration(
  input: Record<string, unknown>
): { result: unknown } {
  const mermaidCode = String(input.mermaid_code || "");
  const title = String(input.title || "Diagram");
  const explanation = String(input.explanation || "");

  if (!mermaidCode) {
    return {
      result: { error: "Mermaid diagram code is required." },
    };
  }

  // Return the Mermaid code in a format the frontend can render
  return {
    result: {
      message:
        `**${title}**\n\n${explanation}\n\n` +
        "```mermaid\n" +
        mermaidCode +
        "\n```\n\n" +
        "💡 *This diagram is rendered using Mermaid.js. " +
        "You can copy the code above and paste it into [mermaid.live](https://mermaid.live) to edit it.*",
      title,
      mermaid_code: mermaidCode,
      explanation,
      diagram_rendered: true,
    },
  };
}

// ── Image Generation ──────────────────────────────────────────────────

function executeImageGeneration(
  input: Record<string, unknown>
): { result: unknown } {
  const prompt = String(input.prompt || "");
  const style = String(input.style || "diagram");
  const subject = String(input.subject || "general");

  if (!prompt) {
    return {
      result: { error: "Image prompt is required." },
    };
  }

  // Since we can't actually call DALL-E from GitHub Models,
  // we generate a rich description + suggest Mermaid/ASCII fallback
  return {
    result: {
      message:
        `🎨 **Image Description** (${style} style for ${subject})\n\n` +
        `${prompt}\n\n` +
        "---\n\n" +
        "**Visual Representation:** I've described the image in detail above. " +
        "Since real-time image generation requires DALL-E API access, here's what I can do:\n\n" +
        "1. **Mermaid diagram** — I can create a flowchart/diagram version\n" +
        "2. **Detailed description** — Use the text above with any AI image generator\n" +
        "3. **ASCII art** — For simple shapes and layouts\n\n" +
        "Would you like me to create a diagram version instead?",
      prompt,
      style,
      subject,
      type: "image_description",
    },
  };
}

// ── Image Recognition / Analysis ──────────────────────────────────────

function executeImageRecognition(
  input: Record<string, unknown>
): { result: unknown } {
  const analysisType = String(input.analysis_type || "describe");
  const context = String(input.context || "");

  // This tool is a structural prompt — GPT-4o already has vision capabilities.
  // The tool call signals the model to analyze the image in the conversation context.
  const typeInstructions: Record<string, string> = {
    identify:
      "IDENTIFY the subject in the uploaded image. State what it is, its category, and key visual features. " +
      "If it's a scientific diagram, name the components. If it's a math problem, state the problem type.",
    solve:
      "SOLVE the problem shown in the uploaded image. Extract all text/numbers from the image, " +
      "set up the equations, and solve step by step with full working. Show all steps with LaTeX formatting.",
    explain:
      "EXPLAIN the concept or diagram shown in the uploaded image. Identify all labeled parts, " +
      "describe what each component does, and explain the overall concept in educational terms.",
    describe:
      "Provide a DETAILED DESCRIPTION of the uploaded image. Cover: subject matter, colors, layout, " +
      "text content, labels, and educational significance.",
    extract_text:
      "EXTRACT all text content from the uploaded image. Present it in organized format, " +
      "preserving structure (tables, lists, equations). Use LaTeX for any mathematical content.",
  };

  return {
    result: {
      message:
        "Image analysis mode activated. " +
        (typeInstructions[analysisType] || typeInstructions.describe) +
        (context ? ` Additional context: ${context}` : ""),
      analysis_type: analysisType,
      context,
    },
  };
}
