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
        "Generate study flashcards for a topic. Use this IMMEDIATELY when students ask to " +
        "'create flashcards', 'make flashcards', 'help me memorize', 'review cards', etc. " +
        "You MUST generate the cards array yourself based on the topic — the AI creates the content. " +
        "Create 8-15 high-quality flashcards covering key concepts, formulas, and definitions.",
      parameters: {
        type: "object",
        properties: {
          topic: { type: "string", description: "The topic to create flashcards for." },
          cards: {
            type: "string",
            description:
              'YOU MUST generate this: JSON array of flashcard objects. Each card has "front" (question/term) and "back" (answer/definition). ' +
              'Generate 8-15 cards covering the most important concepts. ' +
              'Example: [{"front":"What is Newton\'s First Law?","back":"An object at rest stays at rest, and an object in motion stays in motion unless acted upon by an external force (Law of Inertia)."},{"front":"Formula for Force","back":"$F = ma$ where F is force in Newtons, m is mass in kg, and a is acceleration in m/s²"}]',
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
        "Generate a practice quiz with multiple choice questions. " +
        "Use this IMMEDIATELY when students ask to 'quiz me', 'test me', 'practice questions', 'MCQ', etc. " +
        "You MUST generate the questions array yourself — the AI creates all the content. " +
        "Create 5-10 quality questions with 4 options each, correct answer index, and explanations.",
      parameters: {
        type: "object",
        properties: {
          topic: { type: "string", description: "Topic for the quiz." },
          questions: {
            type: "string",
            description:
              'YOU MUST generate this: JSON array of question objects. ' +
              'Each has "question" (string), "options" (array of exactly 4 choice strings), ' +
              '"correct" (index 0-3 of the correct option), and "explanation" (why this answer is correct). ' +
              'Generate 5-10 questions covering key concepts. ' +
              'Example: [{"question":"What is the SI unit of force?","options":["Joule","Newton","Pascal","Watt"],"correct":1,"explanation":"The Newton (N) is the SI unit of force, defined as kg⋅m/s²."}]',
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
              'Complete Mermaid.js diagram code. CRITICAL SYNTAX RULES:\n' +
              '- Use ONLY straight quotes " never smart/curly quotes\n' +
              '- Use --> for arrows (with spaces around them)\n' +
              '- Wrap labels with special chars in ["quotes"]: A["Label (with parens)"]\n' +
              '- Use |text| for edge labels: A -->|Yes| B\n' +
              '- Every subgraph must have a name and end with "end"\n' +
              '- Start flowcharts with "graph TD" or "graph LR"\n' +
              '- Do NOT use semicolons at end of lines\n' +
              '- Keep node IDs simple alphanumeric (A, B, Step1, etc.)\n' +
              'Supported types:\n' +
              '- graph TD/LR: Process flows, algorithms\n' +
              '- sequenceDiagram: Interactions between components\n' +
              '- classDiagram: Class relationships\n' +
              '- stateDiagram-v2: State machines\n' +
              '- erDiagram: Entity relationships\n' +
              '- mindmap: Concept maps\n' +
              'Example: "graph TD\\n    A[\\"Start\\"] --> B{\\"Decision\\"}\\n    B -->|Yes| C[\\"Do Something\\"]\\n    B -->|No| D[\\"End\\"]"',
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

  // ── 11. Schedule Manager ────────────────────────────────────────────
  {
    type: "function" as const,
    function: {
      name: "manage_schedule",
      description:
        "Manage the student's study schedule and create todo items. Use this tool PROACTIVELY whenever " +
        "the student mentions ANY of these: tasks, todos, planning, scheduling, deadlines, study sessions, " +
        "exam prep, homework, reminders, or time management. " +
        "IMPORTANT CONTEXT: The student lives in India (IST timezone, UTC+5:30). " +
        "School is 5:00 AM to 3:00 PM. Sleep is 9:00 PM to 5:00 AM. " +
        "Available study time: 3:00 PM - 9:00 PM on school days, more on weekends. " +
        "Always schedule in IST and respect these time constraints. " +
        "Break study into 45-90 minute blocks with 10-15 min breaks. " +
        "When a student says 'remind me', 'I need to', 'plan my', 'help me study', " +
        "'create a schedule', 'make a todo', or similar — IMMEDIATELY use this tool with action 'add'.",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["add", "list", "suggest"],
            description:
              "'add' to create a new schedule item, 'list' to review current schedule, " +
              "'suggest' to generate a study plan based on upcoming exams or topics.",
          },
          items: {
            type: "string",
            description:
              'JSON array of schedule items to add. Each item: ' +
              '{"title": "Study Calculus Ch 5", "subject": "math", "startTime": "2025-01-20T14:00", ' +
              '"endTime": "2025-01-20T16:00", "type": "study"} ' +
              'Types: study, exam, homework, class, other. Use ISO datetime format.',
          },
          suggestion_context: {
            type: "string",
            description: "Context for generating schedule suggestions (e.g., 'I have a physics exam on Friday').",
          },
        },
        required: ["action"],
      },
    },
  },

  // ── 12. Video Summarizer ──────────────────────────────────────────
  {
    type: "function" as const,
    function: {
      name: "summarize_video",
      description:
        "Summarize a YouTube video or any video given a URL. Extracts the transcript or available " +
        "metadata and provides a detailed summary with key points, timestamps, and takeaways. " +
        "Use this when a student pastes a YouTube link or asks to summarize a video.",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "The full URL of the video (YouTube, etc.).",
          },
          focus: {
            type: "string",
            description: "Optional focus area — what aspect of the video to emphasize in the summary.",
          },
        },
        required: ["url"],
      },
    },
  },

  // ── 13. Grammar Checker ───────────────────────────────────────────
  {
    type: "function" as const,
    function: {
      name: "grammar_check",
      description:
        "Check text for grammar, spelling, punctuation, and style issues. " +
        "Returns the corrected text with a list of all changes made and explanations. " +
        "Use when a student asks to proofread, check grammar, fix writing, or improve text quality.",
      parameters: {
        type: "object",
        properties: {
          text: {
            type: "string",
            description: "The text to check for grammar and spelling errors.",
          },
          style: {
            type: "string",
            enum: ["academic", "casual", "formal", "creative"],
            description: "The writing style to target. Default: academic.",
          },
        },
        required: ["text"],
      },
    },
  },

  // ── 14. Document Analyzer ─────────────────────────────────────────
  {
    type: "function" as const,
    function: {
      name: "analyze_document",
      description:
        "Analyze an uploaded document in depth. The document content is available in the system prompt " +
        "under 'Student's Reference Material'. Copy the relevant content from there into the 'content' parameter. " +
        "Provides: summary, key points, structure analysis, and answers questions. " +
        "IMPORTANT: When the student uploads a file and asks to analyze it, extract the content from " +
        "the reference material section of your context and pass it to this tool.",
      parameters: {
        type: "object",
        properties: {
          content: {
            type: "string",
            description: "The text content of the document to analyze. Extract this from the reference material in your system context.",
          },
          filename: {
            type: "string",
            description: "Original filename for context.",
          },
          task: {
            type: "string",
            enum: ["summarize", "extract_key_points", "analyze_structure", "answer_questions", "full_analysis"],
            description: "What type of analysis to perform. Default to 'full_analysis' if not specified.",
          },
          question: {
            type: "string",
            description: "Specific question to answer about the document (for 'answer_questions' task).",
          },
        },
        required: ["content", "task"],
      },
    },
  },

  // ── 15. Deep Web Scraper ──────────────────────────────────────────
  {
    type: "function" as const,
    function: {
      name: "deep_scrape",
      description:
        "Perform deep scraping of a specific webpage URL to extract its full content. " +
        "Use this when you need detailed information from a specific page — articles, documentation, " +
        "research papers, blog posts, etc. Returns structured content with headings, paragraphs, " +
        "lists, tables, and code blocks extracted. Much more thorough than web_search.",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "The URL to deeply scrape.",
          },
          extract: {
            type: "string",
            enum: ["full", "article", "tables", "code", "links"],
            description: "What to extract: full page content, just article body, tables, code blocks, or links.",
          },
        },
        required: ["url"],
      },
    },
  },

  // ── 16. Screenshot Analyzer ───────────────────────────────────────
  {
    type: "function" as const,
    function: {
      name: "analyze_screenshot",
      description:
        "Analyze an uploaded screenshot or image for the student. " +
        "Use this when the student uploads a screenshot of a problem, error, code, textbook page, " +
        "handwritten notes, or any visual content they want help understanding. " +
        "The image content is available as an attachment. Describe what you see and provide help. " +
        "IMPORTANT: When a student sends an image/screenshot and asks for analysis, use this tool. " +
        "Extract context from the image description in your system context.",
      parameters: {
        type: "object",
        properties: {
          description: {
            type: "string",
            description: "Description of what the screenshot/image contains (extracted from vision analysis or user description).",
          },
          task: {
            type: "string",
            enum: ["solve_problem", "explain_error", "read_text", "analyze_diagram", "explain_concept", "general"],
            description: "What the student wants help with regarding the screenshot.",
          },
          subject: {
            type: "string",
            description: "The subject area if identifiable (math, physics, code, etc.).",
          },
        },
        required: ["description", "task"],
      },
    },
  },

  // ── 17. Novel / Literature Analyzer ───────────────────────────────
  {
    type: "function" as const,
    function: {
      name: "analyze_novel",
      description:
        "Perform deep literary analysis of a novel, poem, play, or any literary text. " +
        "Use this tool when a student asks about themes, characters, symbolism, narrative techniques, " +
        "literary devices, historical context, or any aspect of a literary work. " +
        "Provides comprehensive analysis including: themes, character analysis, plot structure, " +
        "literary devices, symbolism, historical/cultural context, and critical perspectives.",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Title of the literary work to analyze.",
          },
          author: {
            type: "string",
            description: "Author of the work (if known).",
          },
          analysis_type: {
            type: "string",
            enum: ["themes", "characters", "plot_structure", "literary_devices", "symbolism", "historical_context", "compare", "full_analysis", "essay_help"],
            description: "Type of literary analysis to perform.",
          },
          specific_question: {
            type: "string",
            description: "Specific question about the work (optional — for targeted analysis).",
          },
          passage: {
            type: "string",
            description: "Specific passage or excerpt to analyze (optional).",
          },
        },
        required: ["title", "analysis_type"],
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
): Promise<{ result: unknown; chartData?: unknown; flowchartData?: unknown; manimData?: unknown; imageData?: unknown; scheduleData?: unknown; sources?: string[] }> {
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
      return await executeImageGeneration(toolInput);

    case "recognize_image":
      return executeImageRecognition(toolInput);

    case "manage_schedule":
      return executeScheduleManagement(toolInput);

    case "summarize_video":
      return await executeVideoSummarizer(toolInput);

    case "grammar_check":
      return executeGrammarCheck(toolInput);

    case "analyze_document":
      return executeDocumentAnalyzer(toolInput);

    case "deep_scrape":
      return await executeDeepScrape(toolInput);

    case "analyze_screenshot":
      return executeScreenshotAnalyzer(toolInput);

    case "analyze_novel":
      return executeNovelAnalyzer(toolInput);

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
          // Deep content extraction — extract structured content
          const textContent = deepExtractContent(pageHtml);
          // Extract the actual page title for better source display
          const pageTitleMatch = pageHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
          const pageTitle = pageTitleMatch ? pageTitleMatch[1].replace(/\s*[-|].*$/, "").trim() : r.title;
          return { ...r, title: pageTitle || r.title, content: textContent || r.snippet };
        } catch {
          return { ...r, content: r.snippet };
        }
      })
    );

    return {
      result: {
        results: enrichedResults,
        search_query: query,
        result_count: enrichedResults.length,
        instructions: "Use the search results to provide an accurate, well-sourced answer. " +
          "When citing information from search results, mention the source naturally in your response " +
          "(e.g., 'According to [source]...'). Include relevant URLs as references.",
      },
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
): { result: unknown; manimData?: unknown } {
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
        `Manim animation generated for scene: **${sceneName}**\n\n` +
        `**What it shows:** ${explanation}\n\n` +
        `The animation preview is rendered below. Download the .py file to run the full animation locally with \`manim -pql animation.py ${sceneName}\`.`,
      code,
      scene_name: sceneName,
      explanation,
    },
    manimData: {
      code,
      sceneName,
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
    if (typeof input.cards === "string") {
      // Try to fix common JSON issues before parsing
      let cardsStr = input.cards.trim();
      // Remove markdown code fences if present
      cardsStr = cardsStr.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
      cards = JSON.parse(cardsStr);
    } else if (Array.isArray(input.cards)) {
      cards = input.cards;
    } else {
      cards = [];
    }
  } catch {
    return {
      result: {
        error: "Could not parse flashcard data. Please try again — the AI will regenerate the cards.",
        retry_hint: "Regenerate the flashcards with properly formatted JSON.",
      },
    };
  }

  if (!Array.isArray(cards) || cards.length === 0) {
    return {
      result: {
        error: "No flashcards were generated. Please specify the topic and try again.",
        retry_hint: "Provide a clear topic for flashcard generation.",
      },
    };
  }

  return {
    result: {
      message: `📚 Created **${cards.length} flashcards** for "${topic}"!\n\nHere are your study cards:`,
      topic,
      cards,
      card_count: cards.length,
      studyTip: "💡 **Study Method**: Read the front side, try to recall the answer in your head, then check the back. Repeat daily using spaced repetition for best retention.",
      display_format: "flashcard_grid",
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
    if (typeof input.questions === "string") {
      let qStr = input.questions.trim();
      qStr = qStr.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
      questions = JSON.parse(qStr);
    } else if (Array.isArray(input.questions)) {
      questions = input.questions;
    } else {
      questions = [];
    }
  } catch {
    return {
      result: {
        error: "Could not parse quiz data. Please try again — the AI will regenerate the questions.",
        retry_hint: "Regenerate the quiz with properly formatted JSON.",
      },
    };
  }

  if (!Array.isArray(questions) || questions.length === 0) {
    return {
      result: {
        error: "No quiz questions were generated. Please specify the topic and try again.",
      },
    };
  }

  return {
    result: {
      message: `📝 Generated a **${difficulty}** quiz with **${questions.length} questions** on "${topic}"!\n\nGood luck! 🍀`,
      topic,
      difficulty,
      questions,
      question_count: questions.length,
      quizTip: "💡 **Tip**: Read all options carefully before selecting. After each answer, review the explanation to reinforce your understanding.",
      display_format: "quiz_interactive",
    },
  };
}

// ── Flowchart / Diagram Generation ────────────────────────────────────

function executeFlowchartGeneration(
  input: Record<string, unknown>
): { result: unknown; flowchartData?: unknown } {
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
        "The diagram has been rendered below.",
      title,
      mermaid_code: mermaidCode,
      explanation,
      diagram_rendered: true,
    },
    flowchartData: {
      mermaidCode,
      title,
      explanation,
    },
  };
}

// ── Image Generation ──────────────────────────────────────────────────

async function executeImageGeneration(
  input: Record<string, unknown>
): Promise<{ result: unknown; imageData?: unknown }> {
  const prompt = String(input.prompt || "");
  const style = String(input.style || "diagram");
  const subject = String(input.subject || "general");

  if (!prompt) {
    return {
      result: { error: "Image prompt is required." },
    };
  }

  // Try to use DALL-E 3 API if token is available
  const openaiKey = process.env.GITHUB_TOKEN?.trim();
  if (openaiKey) {
    try {
      const OpenAI = (await import("openai")).default;
      const client = new OpenAI({
        baseURL: "https://models.inference.ai.azure.com",
        apiKey: openaiKey,
      });

      // Enhanced prompt for educational content
      const enhancedPrompt = `Educational ${style} illustration for ${subject}: ${prompt}. High quality, clear, informative, suitable for students.`;

      const response = await client.images.generate({
        model: "dall-e-3",
        prompt: enhancedPrompt.slice(0, 1000),
        n: 1,
        size: "1024x1024",
        quality: "standard",
        style: style === "realistic" ? "natural" : "vivid",
      });

      if (response.data && response.data[0]?.url) {
        return {
          result: {
            message:
              `**Educational Illustration Generated** (${style} style for ${subject})\n\n` +
              `${prompt}\n\n` +
              "The AI-generated illustration is displayed below.",
            prompt: enhancedPrompt,
            style,
            subject,
            type: "image_rendered",
            image_url: response.data[0].url,
          },
          imageData: {
            prompt: enhancedPrompt,
            style,
            subject,
            url: response.data[0].url,
          },
        };
      }
    } catch (err) {
      console.error("DALL-E generation failed:", err);
      // Fall through to text-only response
    }
  }

  // Fallback: text-only response with descriptive SVG rendering
  return {
    result: {
      message:
        `**Educational Illustration** (${style} style for ${subject})\n\n` +
        `${prompt}\n\n` +
        "A conceptual diagram has been generated below based on the description. " +
        "For AI-generated realistic images, try using GPT-4o or GPT-4.1 with the prompt directly.",
      prompt,
      style,
      subject,
      type: "image_rendered",
      note: "Rendered as conceptual SVG — DALL-E image generation is not available on this endpoint.",
    },
    imageData: {
      prompt,
      style,
      subject,
    },
  };
}

// ── Image Recognition / Analysis ──────────────────────────────────────

function executeImageRecognition(
  input: Record<string, unknown>
): { result: unknown } {
  const analysisType = String(input.analysis_type || "describe");
  const context = String(input.context || "");

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

// ── Schedule Management ───────────────────────────────────────────────

function executeScheduleManagement(
  input: Record<string, unknown>
): { result: unknown; scheduleData?: unknown } {
  const action = String(input.action || "list");

  if (action === "add") {
    let items: unknown[] = [];
    try {
      items = typeof input.items === "string" ? JSON.parse(input.items) : input.items || [];
    } catch {
      return {
        result: {
          error: "Invalid schedule items JSON. Please provide valid JSON array.",
        },
      };
    }

    if (!Array.isArray(items) || items.length === 0) {
      return {
        result: {
          error: "Please provide at least one schedule item to add.",
        },
      };
    }

    const validItems = (items as Record<string, unknown>[]).map((item) => ({
      id: `sch-ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: String(item.title || "Untitled"),
      subject: String(item.subject || "general"),
      startTime: String(item.startTime || new Date().toISOString()),
      endTime: String(item.endTime || item.startTime || new Date().toISOString()),
      type: ["study", "exam", "homework", "class", "other"].includes(String(item.type))
        ? String(item.type)
        : "study",
      completed: false,
    }));

    return {
      result: {
        message:
          `Added ${validItems.length} item${validItems.length > 1 ? "s" : ""} to your schedule!\n\n` +
          validItems.map((i) =>
            `• **${i.title}** — ${new Date(String(i.startTime)).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })} (${i.type})`
          ).join("\n"),
        items_added: validItems,
        action: "add",
      },
      scheduleData: {
        action: "add",
        items: validItems,
      },
    };
  }

  if (action === "list") {
    return {
      result: {
        message:
          "I've reviewed your current schedule. " +
          "If you don't have any items yet, tell me about your exams, homework, or subjects, and I'll create a study plan!",
        action: "list",
      },
    };
  }

  if (action === "suggest") {
    const ctx = String(input.suggestion_context || "");
    return {
      result: {
        message:
          "Study plan suggestion mode activated. " +
          (ctx ? `Based on: ${ctx}` : "Tell me about your upcoming exams or topics to study."),
        action: "suggest",
        context: ctx,
      },
    };
  }

  return {
    result: { message: "Schedule action completed.", action },
  };
}

// ── Deep Content Extractor (shared) ───────────────────────────────────

function deepExtractContent(html: string, maxLen: number = 12000): string {
  // Remove noise
  let clean = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    .replace(/<aside[\s\S]*?<\/aside>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");

  // Extract headings for structure
  const headings: string[] = [];
  const headingRegex = /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi;
  let hMatch;
  while ((hMatch = headingRegex.exec(clean)) !== null) {
    const level = parseInt(hMatch[1]);
    const text = hMatch[2].replace(/<[^>]*>/g, "").trim();
    if (text) headings.push("#".repeat(level) + " " + text);
  }

  // Extract article body or main content
  const articleMatch = clean.match(/<article[^>]*>([\s\S]*?)<\/article>/i)
    || clean.match(/<main[^>]*>([\s\S]*?)<\/main>/i)
    || clean.match(/<div[^>]*class="[^"]*(?:content|article|post|entry|text)[^"]*"[^>]*>([\s\S]*?)<\/div>/i);

  const body = articleMatch ? articleMatch[1] : clean;

  // Extract paragraphs
  const paragraphs: string[] = [];
  const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let pMatch;
  while ((pMatch = pRegex.exec(body)) !== null) {
    const text = pMatch[1].replace(/<[^>]*>/g, "").trim();
    if (text.length > 30) paragraphs.push(text);
  }

  // Extract list items
  const listItems: string[] = [];
  const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  let liMatch;
  while ((liMatch = liRegex.exec(body)) !== null) {
    const text = liMatch[1].replace(/<[^>]*>/g, "").trim();
    if (text.length > 10) listItems.push("• " + text);
  }

  // Extract code blocks
  const codeBlocks: string[] = [];
  const codeRegex = /<(?:pre|code)[^>]*>([\s\S]*?)<\/(?:pre|code)>/gi;
  let codeMatch;
  while ((codeMatch = codeRegex.exec(body)) !== null) {
    const text = codeMatch[1].replace(/<[^>]*>/g, "").trim();
    if (text.length > 20) codeBlocks.push("```\n" + text.slice(0, 1000) + "\n```");
  }

  // Build structured output
  const parts: string[] = [];
  if (headings.length > 0) parts.push("## Structure:\n" + headings.slice(0, 20).join("\n"));
  if (paragraphs.length > 0) parts.push("\n## Content:\n" + paragraphs.join("\n\n"));
  if (listItems.length > 0) parts.push("\n## Key Points:\n" + listItems.slice(0, 30).join("\n"));
  if (codeBlocks.length > 0) parts.push("\n## Code:\n" + codeBlocks.slice(0, 5).join("\n\n"));

  let result = parts.join("\n");
  if (!result || result.length < 100) {
    // Fallback: strip all HTML
    result = body
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  return result.slice(0, maxLen);
}

// ── Video Summarizer ──────────────────────────────────────────────────

async function executeVideoSummarizer(
  input: Record<string, unknown>
): Promise<{ result: unknown; sources?: string[] }> {
  const url = String(input.url || "").trim();
  const focus = String(input.focus || "");

  if (!url) {
    return { result: { error: "Video URL is required." }, sources: [] };
  }

  // Extract YouTube video ID
  const ytMatch = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/))([a-zA-Z0-9_-]{11})/);
  const videoId = ytMatch ? ytMatch[1] : null;

  try {
    let transcript = "";
    let videoTitle = "";
    let videoDescription = "";
    let channelName = "";

    if (videoId) {
      // Method 0: Get metadata from noembed (reliable, fast)
      try {
        const noembedRes = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`, {
          signal: AbortSignal.timeout(5000),
        });
        if (noembedRes.ok) {
          const meta = await noembedRes.json();
          if (meta.title) videoTitle = meta.title;
          if (meta.author_name) channelName = meta.author_name;
        }
      } catch {
        // noembed failed, continue
      }

      // Method 1: Try InnerTube API for captions from YouTube page
      try {
        const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
            Accept: "text/html,application/xhtml+xml",
            "Accept-Language": "en-US,en;q=0.9",
          },
          signal: AbortSignal.timeout(10000),
        });
        const html = await pageRes.text();

        // Extract title if not already found
        if (!videoTitle) {
          const titleMatch = html.match(/<title>(.*?)<\/title>/);
          videoTitle = titleMatch ? titleMatch[1].replace(" - YouTube", "").trim() : "";
        }

        // Extract description from meta
        const descMatch = html.match(/<meta name="description" content="([^"]*)"/) ||
          html.match(/"shortDescription":"((?:[^"\\]|\\.)*)"/);
        videoDescription = descMatch ? descMatch[1].replace(/\\n/g, "\n").slice(0, 2000) : "";

        // Extract channel name if not found
        if (!channelName) {
          const channelMatch = html.match(/"ownerChannelName":"((?:[^"\\]|\\.)*)"/);
          if (channelMatch) channelName = channelMatch[1];
        }

        // Try to extract captions URL from player response
        const captionsMatch = html.match(/"captionTracks":\s*(\[[\s\S]*?\])/);
        if (captionsMatch) {
          try {
            const tracks = JSON.parse(captionsMatch[1]);
            // Prefer English, then auto-generated English, then any track
            const enTrack = tracks.find((t: Record<string, string>) =>
              t.languageCode === "en" && !t.kind
            ) || tracks.find((t: Record<string, string>) =>
              t.languageCode === "en" || t.languageCode?.startsWith("en")
            ) || tracks[0];

            if (enTrack?.baseUrl) {
              const captionUrl = enTrack.baseUrl.replace(/\\u0026/g, "&");
              const capRes = await fetch(captionUrl, { signal: AbortSignal.timeout(8000) });
              const capXml = await capRes.text();

              // Parse XML captions with timestamps
              const segments: { time: number; text: string }[] = [];
              const segRegex = /<text start="([^"]*)"[^>]*>([\s\S]*?)<\/text>/gi;
              let segMatch;
              while ((segMatch = segRegex.exec(capXml)) !== null) {
                const startTime = parseFloat(segMatch[1]);
                const text = segMatch[2]
                  .replace(/&amp;/g, "&")
                  .replace(/&lt;/g, "<")
                  .replace(/&gt;/g, ">")
                  .replace(/&#39;/g, "'")
                  .replace(/&quot;/g, '"')
                  .replace(/<[^>]*>/g, "")
                  .trim();
                if (text) segments.push({ time: startTime, text });
              }

              // Build transcript with periodic timestamps
              const parts: string[] = [];
              let lastTimestamp = -60;
              for (const seg of segments) {
                if (seg.time - lastTimestamp >= 60) {
                  const mins = Math.floor(seg.time / 60);
                  const secs = Math.floor(seg.time % 60);
                  parts.push(`\n[${mins}:${secs.toString().padStart(2, "0")}] `);
                  lastTimestamp = seg.time;
                }
                parts.push(seg.text);
              }
              transcript = parts.join(" ").replace(/\n\s+/g, "\n").trim();
            }
          } catch {
            // Caption parsing failed
          }
        }

        // Method 2: Try to extract transcript from ytInitialData
        if (!transcript) {
          const descriptionMatch = html.match(/"description":\s*{\s*"simpleText":\s*"((?:[^"\\]|\\.)*)"/);
          if (descriptionMatch && descriptionMatch[1].length > videoDescription.length) {
            videoDescription = descriptionMatch[1].replace(/\\n/g, "\n").slice(0, 3000);
          }
        }
      } catch {
        // YouTube page fetch failed
      }
    }

    // If no transcript found, try generic page scraping
    if (!transcript && !videoTitle) {
      try {
        const pageRes = await fetch(url, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; SmartSchoolAI/2.0)" },
          signal: AbortSignal.timeout(8000),
        });
        const html = await pageRes.text();
        const titleMatch = html.match(/<title>(.*?)<\/title>/);
        videoTitle = titleMatch ? titleMatch[1].trim() : url;
        videoDescription = deepExtractContent(html, 3000);
      } catch {
        return {
          result: { message: `Could not access the video at: ${url}. The page may be restricted.` },
          sources: [url],
        };
      }
    }

    return {
      result: {
        message: "Video content extracted successfully. Now provide a comprehensive summary.",
        video_url: url,
        video_id: videoId,
        title: videoTitle || "Untitled Video",
        channel: channelName || "Unknown Channel",
        description: videoDescription.slice(0, 2000),
        transcript: transcript.slice(0, 12000),
        has_transcript: transcript.length > 0,
        transcript_length: transcript.length,
        focus: focus || "general overview",
        youtube_link: videoId ? `https://www.youtube.com/watch?v=${videoId}` : url,
        instructions:
          "Create a detailed summary with:\n" +
          "1. **📺 Overview** — What the video is about (1-2 sentences)\n" +
          `2. **👤 Channel** — ${channelName || "Unknown"}\n` +
          "3. **🔑 Key Points** — Bullet list of main takeaways\n" +
          "4. **📝 Detailed Summary** — Section-by-section breakdown" +
          (transcript.length > 0 ? " with timestamps" : "") + "\n" +
          "5. **💡 Key Quotes/Data** — Important numbers, facts, or quotes\n" +
          "6. **📚 Study Notes** — How this relates to academic topics\n" +
          (focus ? `7. **🎯 Focus Area** — Specifically cover: ${focus}` : "") +
          (!transcript ? "\n\n⚠️ Note: No transcript available. Summarize based on title and description." : ""),
      },
      sources: [url],
    };
  } catch (error) {
    return {
      result: {
        message: `Could not process video: ${error instanceof Error ? error.message : "unknown error"}. Try sharing the video URL and I'll do my best with available information.`,
      },
      sources: [url],
    };
  }
}

// ── Grammar Checker ───────────────────────────────────────────────────

function executeGrammarCheck(
  input: Record<string, unknown>
): { result: unknown } {
  const text = String(input.text || "");
  const style = String(input.style || "academic");

  if (!text.trim()) {
    return { result: { error: "Text is required for grammar checking." } };
  }

  // We send structured instructions to the AI to perform the grammar check
  return {
    result: {
      message: "Grammar check mode activated.",
      original_text: text,
      target_style: style,
      instructions:
        "Perform a thorough grammar, spelling, and style check on the provided text. " +
        "Return your response in this EXACT format:\n\n" +
        "## ✅ Corrected Text\n(The full corrected text)\n\n" +
        "## 📝 Changes Made\n" +
        "For each change, use this format:\n" +
        "- **Original**: `wrong text` → **Fixed**: `correct text` — *Reason: explanation*\n\n" +
        "## 📊 Summary\n" +
        "- Spelling errors: X\n" +
        "- Grammar issues: X\n" +
        "- Punctuation fixes: X\n" +
        "- Style improvements: X\n" +
        "- Overall score: X/10\n\n" +
        "## 💡 Writing Tips\n" +
        `Target style: ${style}. Provide 2-3 tips to improve their writing.`,
    },
  };
}

// ── Document Analyzer ─────────────────────────────────────────────────

function executeDocumentAnalyzer(
  input: Record<string, unknown>
): { result: unknown } {
  const content = String(input.content || "");
  const filename = String(input.filename || "document");
  const task = String(input.task || "full_analysis");
  const question = String(input.question || "");

  if (!content.trim()) {
    return {
      result: {
        error: "No document content provided. If the student uploaded a file, the content should be available in your system context under 'Student's Reference Material'. Copy it into the content parameter.",
        hint: "Check the system prompt for <reference_material> tags containing the file content.",
      },
    };
  }

  // Basic text statistics
  const words = content.split(/\s+/).filter(Boolean);
  const sentences = content.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const paragraphs = content.split(/\n\s*\n/).filter((p) => p.trim().length > 0);

  const taskInstructions: Record<string, string> = {
    summarize:
      "Provide a comprehensive summary of this document:\n" +
      "1. **Executive Summary** (2-3 sentences)\n" +
      "2. **Main Sections** — outline each section\n" +
      "3. **Key Arguments/Points**\n" +
      "4. **Conclusion/Takeaways**",
    extract_key_points:
      "Extract all key points from this document:\n" +
      "1. **Key Facts** — important data, numbers, dates\n" +
      "2. **Main Arguments** — thesis and supporting points\n" +
      "3. **Important Definitions** — any defined terms\n" +
      "4. **Action Items** — any recommendations or next steps",
    analyze_structure:
      "Analyze the structure and organization of this document:\n" +
      "1. **Document Type** — what kind of document is this?\n" +
      "2. **Organization** — how is it structured?\n" +
      "3. **Writing Quality** — clarity, coherence, style\n" +
      "4. **Strengths & Weaknesses** of the writing\n" +
      "5. **Suggestions** for improvement",
    answer_questions:
      `Answer this specific question about the document: "${question}"\n` +
      "Ground your answer with direct quotes/references from the document.",
    full_analysis:
      "Perform a complete analysis of this document:\n" +
      "1. **Overview** — type, purpose, audience\n" +
      "2. **Summary** — comprehensive summary\n" +
      "3. **Key Points** — bullet list of main takeaways\n" +
      "4. **Structure Analysis** — organization and flow\n" +
      "5. **Important Data** — facts, figures, quotes\n" +
      "6. **Critical Analysis** — strengths, weaknesses, bias\n" +
      "7. **Study Notes** — if academic, what to memorize",
  };

  return {
    result: {
      status: "success",
      message: `Document "${filename}" loaded for analysis (${task}).`,
      filename,
      statistics: {
        characters: content.length,
        words: words.length,
        sentences: sentences.length,
        paragraphs: paragraphs.length,
        estimated_reading_time: `${Math.ceil(words.length / 250)} minutes`,
      },
      task,
      instructions: taskInstructions[task] || taskInstructions.full_analysis,
      full_content: content.slice(0, 50000),
      content_preview: content.slice(0, 800) + (content.length > 800 ? "\n... [content continues]" : ""),
    },
  };
}

// ── Deep Web Scraper ──────────────────────────────────────────────────

async function executeDeepScrape(
  input: Record<string, unknown>
): Promise<{ result: unknown; sources?: string[] }> {
  const url = String(input.url || "").trim();
  const extract = String(input.extract || "full");

  if (!url || !url.startsWith("http")) {
    return { result: { error: "A valid HTTP/HTTPS URL is required." }, sources: [] };
  }

  try {
    const pageRes = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(12000),
    });

    if (!pageRes.ok) {
      return {
        result: { message: `Page returned status ${pageRes.status}. Access may be restricted.` },
        sources: [url],
      };
    }

    const html = await pageRes.text();

    // Extract title
    const titleMatch = html.match(/<title>(.*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : url;

    // Extract meta description
    const metaDesc = html.match(/<meta[^>]*name="description"[^>]*content="([^"]*)"/) ||
      html.match(/<meta[^>]*property="og:description"[^>]*content="([^"]*)"/)
    const description = metaDesc ? metaDesc[1] : "";

    let extractedContent = "";

    switch (extract) {
      case "tables": {
        // Extract all tables
        const tables: string[] = [];
        const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
        let tMatch;
        while ((tMatch = tableRegex.exec(html)) !== null) {
          const rows: string[] = [];
          const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
          let rMatch;
          while ((rMatch = rowRegex.exec(tMatch[1])) !== null) {
            const cells: string[] = [];
            const cellRegex = /<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi;
            let cMatch;
            while ((cMatch = cellRegex.exec(rMatch[1])) !== null) {
              cells.push(cMatch[1].replace(/<[^>]*>/g, "").trim());
            }
            rows.push("| " + cells.join(" | ") + " |");
          }
          if (rows.length > 0) tables.push(rows.join("\n"));
        }
        extractedContent = tables.length > 0
          ? tables.join("\n\n---\n\n")
          : "No tables found on this page.";
        break;
      }
      case "code": {
        // Extract code blocks
        const codes: string[] = [];
        const codeRegex = /<(?:pre|code)[^>]*>([\s\S]*?)<\/(?:pre|code)>/gi;
        let cMatch;
        while ((cMatch = codeRegex.exec(html)) !== null) {
          const code = cMatch[1].replace(/<[^>]*>/g, "").trim();
          if (code.length > 20) codes.push("```\n" + code.slice(0, 2000) + "\n```");
        }
        extractedContent = codes.length > 0
          ? codes.join("\n\n")
          : "No code blocks found on this page.";
        break;
      }
      case "links": {
        // Extract all links
        const links: string[] = [];
        const linkRegex = /<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
        let lMatch;
        while ((lMatch = linkRegex.exec(html)) !== null) {
          const href = lMatch[1];
          const text = lMatch[2].replace(/<[^>]*>/g, "").trim();
          if (href.startsWith("http") && text.length > 2) {
            links.push(`- [${text}](${href})`);
          }
        }
        extractedContent = links.length > 0
          ? links.slice(0, 100).join("\n")
          : "No external links found.";
        break;
      }
      case "article": {
        // Try to extract just the article body
        const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i) ||
          html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
        extractedContent = articleMatch
          ? deepExtractContent(articleMatch[1], 15000)
          : deepExtractContent(html, 15000);
        break;
      }
      default:
        extractedContent = deepExtractContent(html, 15000);
    }

    return {
      result: {
        message: "Deep scrape completed successfully.",
        url,
        title,
        description,
        content: extractedContent,
        extract_mode: extract,
        content_length: extractedContent.length,
      },
      sources: [url],
    };
  } catch (error) {
    return {
      result: {
        message: `Deep scrape failed: ${error instanceof Error ? error.message : "timeout/network error"}`,
      },
      sources: [url],
    };
  }
}

// ── Screenshot Analyzer Implementation ────────────────────────────────

function executeScreenshotAnalyzer(
  input: Record<string, unknown>
): { result: unknown } {
  const description = String(input.description || "").trim();
  const task = String(input.task || "general");
  const subject = String(input.subject || "general");

  const taskInstructions: Record<string, string> = {
    solve_problem:
      "The student uploaded a screenshot of a problem they need help solving. " +
      "Based on the description, identify the problem type, extract all given information, " +
      "and solve it step by step with complete working. Show all formulas used.",
    explain_error:
      "The student uploaded a screenshot of an error (code error, calculation mistake, etc.). " +
      "Identify the error, explain WHY it occurred, and provide the correct solution. " +
      "If it's a code error, provide the fixed code.",
    read_text:
      "The student uploaded a screenshot containing text (textbook page, notes, etc.). " +
      "Read and transcribe the key content, then explain or summarize it clearly.",
    analyze_diagram:
      "The student uploaded a screenshot of a diagram, chart, or figure. " +
      "Describe what the diagram shows, explain the relationships it illustrates, " +
      "and provide additional context or explanation.",
    explain_concept:
      "The student uploaded a screenshot related to a concept they want explained. " +
      "Identify the concept and provide a thorough, beginner-friendly explanation " +
      "with examples and analogies.",
    general:
      "The student uploaded a screenshot for analysis. Examine the description carefully " +
      "and provide helpful, detailed analysis and explanation.",
  };

  return {
    result: {
      message: "Screenshot analysis activated.",
      instructions: taskInstructions[task] || taskInstructions.general,
      image_description: description,
      subject_area: subject,
      analysis_task: task,
      guidance:
        "Analyze the screenshot based on the description provided. " +
        "Be thorough, educational, and provide step-by-step explanations where applicable. " +
        "If you can identify specific problems or content, solve/explain them in detail.",
    },
  };
}

// ── Novel / Literature Analyzer Implementation ────────────────────────

function executeNovelAnalyzer(
  input: Record<string, unknown>
): { result: unknown } {
  const title = String(input.title || "").trim();
  const author = String(input.author || "Unknown");
  const analysisType = String(input.analysis_type || "full_analysis");
  const question = String(input.specific_question || "");
  const passage = String(input.passage || "");

  const analysisInstructions: Record<string, string> = {
    themes:
      "Identify and analyze ALL major themes in this work. For each theme: " +
      "1) State the theme clearly, 2) Provide specific examples/quotes from the text, " +
      "3) Explain how the theme develops throughout the work, " +
      "4) Connect to broader literary/historical context.",
    characters:
      "Provide deep character analysis. For each major character: " +
      "1) Physical/personality description, 2) Motivations and desires, " +
      "3) Character arc (how they change), 4) Key relationships, " +
      "5) Symbolic significance, 6) Key quotes that reveal character.",
    plot_structure:
      "Analyze the plot structure in detail: " +
      "1) Exposition (setting, characters, initial situation), " +
      "2) Rising action (key events building tension), " +
      "3) Climax (turning point), 4) Falling action, " +
      "5) Resolution/Denouement. Also identify: narrative structure type " +
      "(linear, non-linear, frame narrative, etc.), subplots, and pacing.",
    literary_devices:
      "Identify and analyze ALL literary devices used: " +
      "metaphors, similes, symbolism, imagery, foreshadowing, irony (all types), " +
      "allusion, allegory, personification, hyperbole, juxtaposition, motifs, etc. " +
      "Provide specific examples from the text for each device found.",
    symbolism:
      "Analyze ALL symbols in the work: " +
      "1) Identify each symbol, 2) Explain what it represents, " +
      "3) Show how the symbol evolves throughout the narrative, " +
      "4) Connect symbols to the work's major themes.",
    historical_context:
      "Analyze the work in its historical and cultural context: " +
      "1) When was it written and what was happening historically? " +
      "2) How does the work reflect its time period? " +
      "3) What literary movement does it belong to? " +
      "4) How was it received when published? " +
      "5) What is its lasting significance?",
    compare:
      "Compare this work with similar literary works. Analyze: " +
      "1) Shared themes and how they differ in treatment, " +
      "2) Similar characters and their different developments, " +
      "3) Contrasting literary techniques, " +
      "4) Different historical/cultural contexts.",
    full_analysis:
      "Perform a comprehensive literary analysis covering ALL aspects: " +
      "1) Summary, 2) Themes, 3) Character analysis, 4) Plot structure, " +
      "5) Literary devices and techniques, 6) Symbolism, " +
      "7) Narrative perspective and voice, 8) Historical context, " +
      "9) Critical perspectives, 10) Significance and legacy.",
    essay_help:
      "Help the student write a literary essay about this work. " +
      "1) Suggest strong thesis statements, 2) Outline essay structure, " +
      "3) Identify the best evidence/quotes to use, " +
      "4) Provide analysis frameworks, 5) Help with conclusion.",
  };

  return {
    result: {
      message: "Literary analysis activated.",
      work_title: title,
      work_author: author,
      analysis_type: analysisType,
      instructions: analysisInstructions[analysisType] || analysisInstructions.full_analysis,
      specific_question: question || null,
      passage_to_analyze: passage || null,
      guidance:
        `Perform a thorough ${analysisType.replace(/_/g, " ")} of "${title}" by ${author}. ` +
        "Be detailed, cite specific examples from the text, use proper literary terminology, " +
        "and structure your analysis clearly with headings. " +
        "Make it educational and suitable for a student studying this work." +
        (question ? `\n\nSpecific focus: ${question}` : "") +
        (passage ? `\n\nAnalyze this passage: "${passage}"` : ""),
    },
  };
}
