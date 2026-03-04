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
        "Generate a professional SVG chart or graph rendered in the student's browser. " +
        "The chart is rendered as an interactive, visual SVG — NOT as text or ASCII art. " +
        "You MUST use this tool whenever ANY quantitative data, graphs, or visualizations are needed. " +
        "NEVER describe charts textually — ALWAYS call this tool instead. " +
        "Supported types: line, bar, pie, area, scatter. " +
        "MANDATORY for: plotting functions (y=f(x)), physics graphs (v-t, s-t, a-t, F-x), " +
        "data comparisons, distributions, trends, economics data, statistical charts, or ANY numeric relationship. " +
        "Generate at least 10-20 data points for smooth curves.",
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
        "Use for: flowcharts, process diagrams, sequence diagrams, class diagrams, " +
        "ER diagrams, mind maps, decision trees, biology pathways, algorithm flowcharts. " +
        "CRITICAL: Use simple node IDs (A, B, C). Wrap ALL labels in double-quoted brackets: A[\"Label\"]. " +
        "Start with 'graph TD' for top-down or 'graph LR' for left-right. " +
        "Use --> for arrows, -->|text| for labeled edges. Keep under 25 nodes. " +
        "AVOID special characters in labels — no parentheses, colons, or emoji in labels.",
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

  // ── 18. Question Paper Generator ───────────────────────────────────
  {
    type: "function" as const,
    function: {
      name: "generate_question_paper",
      description:
        "Generate a comprehensive CBSE-style practice question paper with proper section formatting, " +
        "mark allocation, and model answers. Use this when a student asks for a 'sample paper', " +
        "'practice paper', 'question paper', 'previous year paper', 'mock paper', or exam preparation material. " +
        "Generate papers aligned with NCERT content and latest CBSE marking schemes.",
      parameters: {
        type: "object",
        properties: {
          subject: {
            type: "string",
            enum: ["math", "physics", "chemistry", "biology", "english", "sst", "sanskrit", "cs"],
            description: "The subject for the question paper.",
          },
          chapters: {
            type: "string",
            description: "Comma-separated list of chapter names/numbers to cover. If empty, covers full syllabus.",
          },
          total_marks: {
            type: "integer",
            description: "Total marks for the paper. Default 80 (CBSE standard). Options: 20, 40, 50, 80.",
          },
          paper_type: {
            type: "string",
            enum: ["unit_test", "half_yearly", "pre_board", "final", "practice"],
            description: "Type of exam paper to generate.",
          },
          include_answers: {
            type: "boolean",
            description: "Whether to include model answers and marking scheme. Default true.",
          },
          sections: {
            type: "string",
            description:
              'YOU MUST generate this: JSON array of paper sections. Each section: ' +
              '{"name": "Section A", "instructions": "All questions compulsory. 1 mark each.", "questions": [' +
              '{"number": 1, "text": "Define inertia.", "marks": 1, "type": "mcq|short|long|case_study|assertion_reason", ' +
              '"options": ["opt A", "opt B", "opt C", "opt D"], "answer": "Model answer with key points...", ' +
              '"marking_scheme": "1 mark for correct definition"}]}. ' +
              'Follow CBSE pattern: Section A (MCQs 1m), Section B (SA-I 2m), Section C (SA-II 3m), Section D (LA 5m), Section E (Case-based 4m).',
          },
        },
        required: ["subject", "sections"],
      },
    },
  },

  // ── 19. Timed Mock Test Generator ─────────────────────────────────
  {
    type: "function" as const,
    function: {
      name: "generate_mock_test",
      description:
        "Generate a timed mock exam/test that the student can take in real-time with a countdown timer " +
        "and automatic evaluation. Use when the student asks for a 'mock test', 'timed test', " +
        "'practice exam', 'test me under time pressure', 'simulate exam', or wants to practice under " +
        "exam conditions. Includes timer, auto-submit, scoring, and detailed review.",
      parameters: {
        type: "object",
        properties: {
          subject: {
            type: "string",
            enum: ["math", "physics", "chemistry", "biology", "english", "sst", "sanskrit", "cs", "general"],
            description: "The subject for the mock test.",
          },
          topic: {
            type: "string",
            description: "Specific topic or chapter for the test.",
          },
          duration_minutes: {
            type: "integer",
            description: "Test duration in minutes. Default 30. Range 5-180.",
          },
          total_marks: {
            type: "integer",
            description: "Total marks for the test. Default 25.",
          },
          questions: {
            type: "string",
            description:
              'YOU MUST generate this: JSON array of test questions. Each question: ' +
              '{"question": "text", "type": "mcq|short_answer|true_false|fill_blank", ' +
              '"marks": 1, "options": ["A","B","C","D"] (for MCQ/true_false), ' +
              '"correct": 0 (index for MCQ) or "answer text" (for short/fill), ' +
              '"explanation": "Why this is correct...", "marking_hints": "Award 1 mark for..."}. ' +
              'Mix question types. MCQs and true/false are auto-graded. Short answer provides model answers for self-evaluation.',
          },
          difficulty: {
            type: "string",
            enum: ["easy", "medium", "hard", "mixed"],
            description: "Difficulty level. Default medium.",
          },
        },
        required: ["subject", "topic", "questions"],
      },
    },
  },

  // ── 20. CBSE Notifications / Announcements ──────────────────────────
  {
    type: "function" as const,
    function: {
      name: "cbse_notifications",
      description:
        "Fetch the latest CBSE announcements, exam date sheets, syllabus updates, " +
        "curriculum changes, and important circulars. Use this when the student asks about " +
        "'CBSE updates', 'exam dates', 'date sheet', 'syllabus changes', 'board announcements', " +
        "'CBSE news', 'circular', 'term papers schedule', or any official CBSE information. " +
        "Searches cbse.gov.in, cbseacademic.nic.in, and education news sources.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "What to search for — e.g. 'Class 9 exam date sheet 2026', 'syllabus changes', 'sample papers'.",
          },
          category: {
            type: "string",
            enum: ["exam_dates", "syllabus", "results", "circulars", "sample_papers", "general"],
            description: "Category of CBSE notification to fetch.",
          },
        },
        required: ["query"],
      },
    },
  },

  // ── 21. Knowledge Base Search ─────────────────────────────────────
  {
    type: "function" as const,
    function: {
      name: "search_knowledge_base",
      description:
        "Search the user's stored knowledge base for relevant information. " +
        "This includes imported WhatsApp group chats, uploaded documents, study notes, and any " +
        "previously stored content. Use this tool when the user asks about something that may " +
        "have been discussed in their groups, mentions a past conversation, or asks you to recall " +
        "information from imported data. Also use when the user references 'the group', 'our chat', " +
        "'what was said about…', or asks about study material they uploaded.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "Search query — keywords or topic to find in stored knowledge. " +
              "Example: 'math homework chapter 5', 'what John said about the exam'.",
          },
          source_name: {
            type: "string",
            description:
              "Optional: filter to a specific source/group name. " +
              "Leave empty to search all stored knowledge.",
          },
          max_results: {
            type: "integer",
            description: "Maximum results to return (1-30). Default 15.",
          },
        },
        required: ["query"],
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
): Promise<{ result: unknown; chartData?: unknown; flowchartData?: unknown; manimData?: unknown; imageData?: unknown; flashcardData?: unknown; quizData?: unknown; scheduleData?: unknown; mockTestData?: unknown; questionPaperData?: unknown; sources?: string[] }> {
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
      {
        const action = String(toolInput.action || "list");
        if (action === "create") {
          const title = String(toolInput.title || "Study Session");
          const start = String(toolInput.start_time || new Date().toISOString());
          const end = String(toolInput.end_time || start);
          const item = {
            id: `cal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            title,
            subject: "general",
            startTime: start,
            endTime: end,
            type: "other" as const,
            completed: false,
          };
          return {
            result: {
              message:
                "Google Calendar sync is running in local planner mode. " +
                "I created this event in your SchoolIT AI schedule so you can track it immediately.",
              action,
              created_event: {
                title,
                start_time: start,
                end_time: end,
              },
            },
            scheduleData: {
              action: "add",
              items: [item],
            },
          };
        }

        return {
          result: {
            message:
              "Calendar tool is active in local planner mode. " +
              "Ask me to create events and I will add them to your schedule timeline.",
            action,
          },
        };
      }

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

    case "search_knowledge_base":
      return await executeKnowledgeSearch(toolInput);

    case "generate_question_paper":
      return executeQuestionPaperGeneration(toolInput);

    case "generate_mock_test":
      return executeMockTestGeneration(toolInput);

    case "cbse_notifications":
      return await executeCbseNotifications(toolInput);

    default:
      return { result: { error: `Unknown tool: ${toolName}` } };
  }
}

// ── Image Search (for Grok-style visual results) ─────────────────────

async function fetchSearchImages(
  query: string
): Promise<{ url: string; thumbnail: string; title: string; source: string }[]> {
  const images: { url: string; thumbnail: string; title: string; source: string }[] = [];

  try {
    // Use DuckDuckGo image search via their vqd token system
    // Step 1: Get vqd token
    const tokenRes = await fetch(
      `https://duckduckgo.com/?q=${encodeURIComponent(query)}&ia=images`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        },
        signal: AbortSignal.timeout(3000),
      }
    );
    const tokenHtml = await tokenRes.text();
    const vqdMatch = tokenHtml.match(/vqd=["']?([^"'&]+)/);

    if (vqdMatch) {
      const vqd = vqdMatch[1];
      const imgRes = await fetch(
        `https://duckduckgo.com/i.js?l=us-en&o=json&q=${encodeURIComponent(query)}&vqd=${vqd}&f=,,,,,&p=1`,
        {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Accept": "application/json",
            "Referer": "https://duckduckgo.com/",
          },
          signal: AbortSignal.timeout(3000),
        }
      );

      if (imgRes.ok) {
        const imgData = await imgRes.json();
        const imgResults = imgData.results || [];
        for (const img of imgResults.slice(0, 6)) {
          if (img.image && img.thumbnail) {
            images.push({
              url: img.image,
              thumbnail: img.thumbnail,
              title: img.title || "",
              source: img.source || new URL(img.image).hostname,
            });
          }
        }
      }
    }
  } catch {
    // Image search is best-effort — don't fail the whole search
  }

  // Fallback: try Wikimedia Commons API for educational images
  if (images.length === 0) {
    try {
      const wikiRes = await fetch(
        `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrlimit=4&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=300&format=json`,
        { signal: AbortSignal.timeout(3000) }
      );
      if (wikiRes.ok) {
        const wikiData = await wikiRes.json();
        const pages = wikiData.query?.pages || {};
        for (const page of Object.values(pages) as Record<string, unknown>[]) {
          const info = (page.imageinfo as Record<string, unknown>[])?.[0];
          if (info?.thumburl && info?.url) {
            images.push({
              url: String(info.url),
              thumbnail: String(info.thumburl),
              title: String(page.title || "").replace("File:", ""),
              source: "Wikimedia Commons",
            });
          }
        }
      }
    } catch { /* ignore */ }
  }

  return images;
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
    // Use DuckDuckGo HTML search (POST for reliability, shorter timeout)
    const searchUrl = `https://html.duckduckgo.com/html/`;
    const response = await fetch(searchUrl, {
      method: "POST",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        Accept: "text/html",
        "Accept-Language": "en-US,en;q=0.9",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: `q=${encodeURIComponent(query)}`,
      signal: AbortSignal.timeout(5000),
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

    // Fetch content from top 2 results AND search for images in parallel
    const [enrichedResults, searchImages] = await Promise.all([
      // Text enrichment
      Promise.all(
        results.slice(0, 2).map(async (r) => {
          try {
            const pageRes = await fetch(r.url, {
              headers: {
                "User-Agent": "Mozilla/5.0 (compatible; SmartSchoolAI/2.0)",
                Accept: "text/html",
              },
              signal: AbortSignal.timeout(3000),
            });
            if (!pageRes.ok) return { ...r, content: r.snippet };

            const pageHtml = await pageRes.text();
            const textContent = deepExtractContent(pageHtml, 4000);
            const pageTitleMatch = pageHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
            const pageTitle = pageTitleMatch ? pageTitleMatch[1].replace(/\s*[-|].*$/, "").trim() : r.title;
            return { ...r, title: pageTitle || r.title, content: textContent || r.snippet };
          } catch {
            return { ...r, content: r.snippet };
          }
        })
      ),
      // Image search (parallel, non-blocking)
      fetchSearchImages(query).catch(() => [] as { url: string; thumbnail: string; title: string; source: string }[]),
    ]);
    const allResults = [...enrichedResults, ...results.slice(2)];

    return {
      result: {
        results: allResults,
        images: searchImages.length > 0 ? searchImages : undefined,
        search_query: query,
        result_count: allResults.length,
        instructions: "Use the search results to provide an accurate, well-sourced answer. " +
          "Cite sources naturally (e.g., 'According to [source]...'). Include relevant URLs." +
          (searchImages.length > 0 ? " Relevant images have been found and will be displayed to the user." : ""),
      },
      sources: allResults.map((r) => r.url).filter(Boolean),
    };
  } catch {
    // DDG HTML failed — try DuckDuckGo Instant Answer API as fallback
    try {
      const apiUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
      const apiRes = await fetch(apiUrl, { signal: AbortSignal.timeout(3000) });
      if (apiRes.ok) {
        const data = await apiRes.json();
        const fallbackResults: { url: string; title: string; snippet: string }[] = [];
        if (data.AbstractURL && data.AbstractText) {
          fallbackResults.push({ url: data.AbstractURL, title: data.Heading || query, snippet: data.AbstractText });
        }
        for (const topic of (data.RelatedTopics || []).slice(0, 4)) {
          if (topic?.FirstURL && topic?.Text) {
            fallbackResults.push({ url: topic.FirstURL, title: topic.Text.slice(0, 100), snippet: topic.Text });
          }
        }
        if (fallbackResults.length > 0) {
          return {
            result: {
              results: fallbackResults,
              search_query: query,
              result_count: fallbackResults.length,
              instructions: "Use these search results to provide an accurate answer. Cite sources naturally.",
            },
            sources: fallbackResults.map((r) => r.url).filter(Boolean),
          };
        }
      }
    } catch { /* API also failed */ }
    return {
      result: {
        message: `Web search couldn't find results for: "${query}". Please provide a thorough answer based on your knowledge.`,
        search_query: query,
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
): { result: unknown; flashcardData?: unknown } {
  const topic = String(input.topic || "");
  let cards: unknown[] = [];

  try {
    if (typeof input.cards === "string") {
      let cardsStr = input.cards.trim();
      cardsStr = cardsStr.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
      cardsStr = cardsStr.replace(/,\s*]/g, "]").replace(/,\s*}/g, "}"); // Fix trailing commas
      cards = JSON.parse(cardsStr);
    } else if (Array.isArray(input.cards)) {
      cards = input.cards;
    } else if (input.cards && typeof input.cards === "object") {
      cards = [input.cards];
    } else {
      cards = [];
    }
  } catch {
    // Try regex extraction as last resort
    try {
      const raw = String(input.cards || "");
      const cardRegex = /"front"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,\s*"back"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
      let cardMatch;
      const extracted: { front: string; back: string }[] = [];
      while ((cardMatch = cardRegex.exec(raw)) !== null) {
        extracted.push({ front: cardMatch[1].replace(/\\"/g, '"'), back: cardMatch[2].replace(/\\"/g, '"') });
      }
      if (extracted.length > 0) {
        cards = extracted;
      }
    } catch { /* give up */ }
    if (cards.length === 0) {
      return {
        result: {
          error: "Could not parse flashcard data. Please try again — the AI will regenerate the cards.",
          retry_hint: "Regenerate the flashcards with properly formatted JSON.",
        },
      };
    }
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
      message: `📚 Created **${cards.length} flashcards** for "${topic}"!\n\nThe interactive flashcard deck is rendered below. Click any card to flip it!`,
      topic,
      cards,
      card_count: cards.length,
      studyTip: "💡 **Study Method**: Read the front side, try to recall the answer in your head, then check the back. Repeat daily using spaced repetition for best retention.",
      display_format: "flashcard_grid",
    },
    flashcardData: {
      topic,
      cards: (cards as { front: string; back: string }[]).map((c) => ({
        front: String(c.front || ""),
        back: String(c.back || ""),
      })),
    },
  };
}

// ── Quiz Generation ───────────────────────────────────────────────────

function executeQuizGeneration(
  input: Record<string, unknown>
): { result: unknown; quizData?: unknown } {
  const topic = String(input.topic || "");
  const difficulty = String(input.difficulty || "medium");
  let questions: unknown[] = [];

  try {
    if (typeof input.questions === "string") {
      let qStr = input.questions.trim();
      qStr = qStr.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
      qStr = qStr.replace(/,\s*]/g, "]").replace(/,\s*}/g, "}"); // Fix trailing commas
      questions = JSON.parse(qStr);
    } else if (Array.isArray(input.questions)) {
      questions = input.questions;
    } else if (input.questions && typeof input.questions === "object") {
      questions = [input.questions];
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
      message: `📝 Generated a **${difficulty}** quiz with **${questions.length} questions** on "${topic}"!\n\nThe interactive quiz is rendered below. Select your answers and check your score!`,
      topic,
      difficulty,
      questions,
      question_count: questions.length,
      quizTip: "💡 **Tip**: Read all options carefully before selecting. After each answer, review the explanation to reinforce your understanding.",
      display_format: "quiz_interactive",
    },
    quizData: {
      topic,
      difficulty,
      questions: (questions as { question: string; options: string[]; correct: number; explanation: string }[]).map((q) => ({
        question: String(q.question || ""),
        options: Array.isArray(q.options) ? q.options.map(String) : [],
        correct: Number(q.correct || 0),
        explanation: String(q.explanation || ""),
      })),
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

function executeImageGeneration(
  input: Record<string, unknown>
): { result: unknown; imageData?: unknown } {
  const prompt = String(input.prompt || "");
  const style = String(input.style || "diagram");
  const subject = String(input.subject || "general");

  if (!prompt) {
    return {
      result: { error: "Image prompt is required." },
    };
  }

  // Enhanced prompt for educational content - keep it concise for URL
  const enhancedPrompt = `Educational ${style} diagram: ${prompt}. Labeled, clear, informative, white text on dark background, suitable for students.`.slice(0, 400);

  // Use Pollinations.ai — free image generation, no API key needed
  const seed = Math.floor(Math.random() * 999999);
  const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(enhancedPrompt)}?width=1024&height=768&model=flux&nologo=true&seed=${seed}`;

  // Pollinations generates on-demand when loaded — no verification needed
  return {
    result: {
      message:
        `**🖼️ Educational Illustration Generated** (${style} style for ${subject})\n\n` +
        `${prompt}\n\n` +
        "The AI-generated illustration is displayed below.",
      prompt: enhancedPrompt,
      style,
      subject,
      type: "image_rendered",
      image_url: imageUrl,
    },
    imageData: {
      prompt: enhancedPrompt,
      style,
      subject,
      url: imageUrl,
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
      signal: AbortSignal.timeout(6000),
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

// ── Question Paper Generator ──────────────────────────────────────

function executeQuestionPaperGeneration(
  input: Record<string, unknown>
): { result: unknown; questionPaperData?: unknown } {
  const subject = String(input.subject || "general");
  const chapters = String(input.chapters || "Full Syllabus");
  const totalMarks = Number(input.total_marks) || 80;
  const paperType = String(input.paper_type || "practice");
  const includeAnswers = input.include_answers !== false;
  let sections: unknown[] = [];

  try {
    if (typeof input.sections === "string") {
      let sStr = input.sections.trim();
      sStr = sStr.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
      sStr = sStr.replace(/,\s*]/g, "]").replace(/,\s*}/g, "}");
      sections = JSON.parse(sStr);
    } else if (Array.isArray(input.sections)) {
      sections = input.sections;
    } else {
      sections = [];
    }
  } catch {
    // Try regex extraction
    try {
      const raw = String(input.sections || "");
      const sectionRegex = /"name"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
      let sMatch;
      const extracted: { name: string }[] = [];
      while ((sMatch = sectionRegex.exec(raw)) !== null) {
        extracted.push({ name: sMatch[1].replace(/\\"/g, '"') });
      }
      if (extracted.length > 0) sections = [{ name: "Parsed", questions: [] }];
    } catch { /* give up */ }

    if (sections.length === 0) {
      return {
        result: {
          error: "Could not parse question paper sections. Please try again.",
          retry_hint: "Regenerate with properly formatted JSON sections.",
        },
      };
    }
  }

  if (!Array.isArray(sections) || sections.length === 0) {
    return {
      result: { error: "No sections were generated. Please specify subject and try again." },
    };
  }

  const paperTypeLabels: Record<string, string> = {
    unit_test: "Unit Test",
    half_yearly: "Half-Yearly Examination",
    pre_board: "Pre-Board Examination",
    final: "Annual Examination",
    practice: "Practice Paper",
  };

  const subjectLabels: Record<string, string> = {
    math: "Mathematics", physics: "Science (Physics)", chemistry: "Science (Chemistry)",
    biology: "Science (Biology)", english: "English", sst: "Social Science",
    sanskrit: "Sanskrit", cs: "Computer Science/IT", general: "General",
  };

  // Count total questions and marks
  let totalQuestions = 0;
  let calculatedMarks = 0;
  for (const sec of sections as Record<string, unknown>[]) {
    const qs = (sec.questions as unknown[]) || [];
    totalQuestions += qs.length;
    for (const q of qs as Record<string, unknown>[]) {
      calculatedMarks += Number(q.marks || 0);
    }
  }

  return {
    result: {
      message:
        `📝 **${paperTypeLabels[paperType] || "Practice Paper"}** — ${subjectLabels[subject] || subject}\n\n` +
        `**Total Marks**: ${totalMarks} | **Sections**: ${sections.length} | **Questions**: ${totalQuestions}\n` +
        `**Chapters**: ${chapters}\n` +
        `**Includes Model Answers**: ${includeAnswers ? "Yes" : "No"}\n\n` +
        `The complete question paper is rendered below with proper CBSE formatting.`,
      subject,
      chapters,
      total_marks: totalMarks,
      paper_type: paperType,
      include_answers: includeAnswers,
      sections,
      total_questions: totalQuestions,
      calculated_marks: calculatedMarks,
      display_format: "question_paper",
    },
    questionPaperData: {
      subject,
      subjectLabel: subjectLabels[subject] || subject,
      paperTypeLabel: paperTypeLabels[paperType] || "Practice Paper",
      chapters,
      totalMarks,
      paperType,
      includeAnswers,
      sections: (sections as Record<string, unknown>[]).map((sec) => ({
        name: String(sec.name || "Section"),
        instructions: String(sec.instructions || ""),
        questions: Array.isArray(sec.questions) ? (sec.questions as Record<string, unknown>[]).map((q) => ({
          number: Number(q.number || 0),
          text: String(q.text || ""),
          marks: Number(q.marks || 1),
          type: String(q.type || "short"),
          options: Array.isArray(q.options) ? q.options.map(String) : undefined,
          answer: includeAnswers ? String(q.answer || "") : undefined,
          marking_scheme: includeAnswers ? String(q.marking_scheme || "") : undefined,
        })) : [],
      })),
    },
  };
}

// ── Mock Test Generator ───────────────────────────────────────────────

function executeMockTestGeneration(
  input: Record<string, unknown>
): { result: unknown; mockTestData?: unknown } {
  const subject = String(input.subject || "general");
  const topic = String(input.topic || "");
  const durationMinutes = Math.min(Math.max(Number(input.duration_minutes) || 30, 5), 180);
  const totalMarks = Number(input.total_marks) || 25;
  const difficulty = String(input.difficulty || "medium");
  let questions: unknown[] = [];

  try {
    if (typeof input.questions === "string") {
      let qStr = input.questions.trim();
      qStr = qStr.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
      qStr = qStr.replace(/,\s*]/g, "]").replace(/,\s*}/g, "}");
      questions = JSON.parse(qStr);
    } else if (Array.isArray(input.questions)) {
      questions = input.questions;
    } else {
      questions = [];
    }
  } catch {
    return {
      result: {
        error: "Could not parse mock test questions. Please try again.",
        retry_hint: "Regenerate with properly formatted JSON questions.",
      },
    };
  }

  if (!Array.isArray(questions) || questions.length === 0) {
    return {
      result: { error: "No questions were generated. Please specify topic and try again." },
    };
  }

  // Validate and normalize questions
  const normalizedQuestions = (questions as Record<string, unknown>[]).map((q, idx) => {
    const qType = String(q.type || "mcq");
    return {
      id: idx,
      question: String(q.question || ""),
      type: qType,
      marks: Number(q.marks || 1),
      options: Array.isArray(q.options) ? q.options.map(String) : undefined,
      correct: qType === "mcq" || qType === "true_false"
        ? Number(q.correct ?? 0)
        : String(q.correct || q.answer || ""),
      explanation: String(q.explanation || ""),
      marking_hints: String(q.marking_hints || ""),
    };
  });

  const autoGradable = normalizedQuestions.filter(q => q.type === "mcq" || q.type === "true_false").length;
  const selfEval = normalizedQuestions.length - autoGradable;

  return {
    result: {
      message:
        `⏱️ **Timed Mock Test** — ${topic}\n\n` +
        `**Subject**: ${subject} | **Duration**: ${durationMinutes} minutes | **Total Marks**: ${totalMarks}\n` +
        `**Questions**: ${normalizedQuestions.length} (${autoGradable} auto-graded, ${selfEval} self-evaluated)\n` +
        `**Difficulty**: ${difficulty}\n\n` +
        `The timed mock test is rendered below. The timer starts when you begin!`,
      subject,
      topic,
      duration_minutes: durationMinutes,
      total_marks: totalMarks,
      difficulty,
      question_count: normalizedQuestions.length,
      auto_gradable: autoGradable,
      display_format: "mock_test",
    },
    mockTestData: {
      subject,
      topic,
      durationMinutes,
      totalMarks,
      difficulty,
      questions: normalizedQuestions,
    },
  };
}

// ── CBSE Notifications Executor ───────────────────────────────────────

async function executeCbseNotifications(
  input: Record<string, unknown>
): Promise<{ result: unknown; sources?: string[] }> {
  const query = String(input.query || "CBSE latest updates").trim();
  const category = String(input.category || "general");

  const categoryUrls: Record<string, string[]> = {
    exam_dates: [
      "https://www.cbse.gov.in/cbsenew/examination.html",
      "https://cbseacademic.nic.in/",
    ],
    syllabus: [
      "https://cbseacademic.nic.in/curriculum.html",
      "https://www.cbse.gov.in/cbsenew/cbse.html",
    ],
    results: [
      "https://www.cbse.gov.in/cbsenew/cbse.html",
    ],
    circulars: [
      "https://www.cbse.gov.in/cbsenew/circular.html",
      "https://cbseacademic.nic.in/circulars.html",
    ],
    sample_papers: [
      "https://cbseacademic.nic.in/SQP_CLASSX_2024-25.html",
      "https://cbseacademic.nic.in/",
    ],
    general: [
      "https://www.cbse.gov.in/cbsenew/cbse.html",
      "https://cbseacademic.nic.in/",
    ],
  };

  const sources: string[] = [];
  const results: { title: string; snippet: string; url: string; date?: string }[] = [];

  try {
    // 1. Search DuckDuckGo for latest CBSE news
    const searchQuery = `CBSE ${query} 2026 site:cbse.gov.in OR site:cbseacademic.nic.in OR site:ndtv.com/education`;
    const searchUrl = "https://html.duckduckgo.com/html/";
    const response = await fetch(searchUrl, {
      method: "POST",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: `q=${encodeURIComponent(searchQuery)}`,
      signal: AbortSignal.timeout(6000),
    });

    if (response.ok) {
      const html = await response.text();
      const linkRegex = /href="[^"]*uddg=([^&"]+)[^"]*"[^>]*class="result__a"[^>]*>([\s\S]*?)<\/a>/gi;
      let match;
      while ((match = linkRegex.exec(html)) !== null && results.length < 8) {
        const url = decodeURIComponent(match[1]);
        const title = match[2].replace(/<[^>]*>/g, "").trim();
        if (url.startsWith("http")) {
          results.push({ url, title, snippet: "" });
          sources.push(url);
        }
      }

      // Extract snippets
      const snippetRegex = /class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|div|span)>/gi;
      let snippetIdx = 0;
      while ((match = snippetRegex.exec(html)) !== null && snippetIdx < results.length) {
        results[snippetIdx].snippet = match[1].replace(/<[^>]*>/g, "").trim();
        snippetIdx++;
      }
    }

    // 2. Try scraping the primary CBSE page for this category
    const urls = categoryUrls[category] || categoryUrls.general;
    for (const url of urls.slice(0, 1)) {
      try {
        const pageRes = await fetch(url, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; SmartSchoolAI/2.0)" },
          signal: AbortSignal.timeout(5000),
        });
        if (pageRes.ok) {
          const pageHtml = await pageRes.text();
          const content = deepExtractContent(pageHtml, 4000);
          if (content.length > 100) {
            results.push({
              url,
              title: `CBSE Official — ${category.replace(/_/g, " ")}`,
              snippet: content.slice(0, 1000),
            });
            sources.push(url);
          }
        }
      } catch { /* best effort */ }
    }

    if (results.length === 0) {
      return {
        result: {
          message: `Could not fetch CBSE notifications for "${query}". The CBSE website may be temporarily unavailable. Try a web search instead.`,
          fallback_suggestion: "Use web_search tool with query: " + searchQuery,
        },
        sources: [],
      };
    }

    return {
      result: {
        found: true,
        query,
        category,
        total_results: results.length,
        notifications: results,
        instructions:
          "Present the CBSE notifications clearly to the student. Include:\n" +
          "1. **📢 Latest Updates** — summarize the most important announcements\n" +
          "2. **📅 Important Dates** — highlight any exam dates, deadlines\n" +
          "3. **📋 Action Items** — what the student should do (register, download, prepare)\n" +
          "4. **🔗 Official Links** — provide direct links to CBSE resources\n" +
          "If dates or events are found, proactively offer to add them to the student's schedule using manage_schedule.",
      },
      sources,
    };
  } catch (err) {
    return {
      result: {
        message: `Failed to fetch CBSE notifications: ${err instanceof Error ? err.message : "network error"}. Try using web_search instead.`,
      },
      sources: [],
    };
  }
}

// ── Knowledge Base Search Executor ──────────────────────────────────

async function executeKnowledgeSearch(
  input: Record<string, unknown>
): Promise<{ result: unknown }> {
  const query = String(input.query || "");
  const sourceName = input.source_name ? String(input.source_name) : undefined;
  const maxResults = Math.min(Number(input.max_results) || 15, 30);

  if (!query.trim()) {
    return { result: { error: "A search query is required." } };
  }

  try {
    // Use server-side Supabase directly (we're already on the server)
    const { createClient } = await import("@supabase/supabase-js");
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      return {
        result: {
          error: "Knowledge base not configured.",
          message: "The knowledge base storage hasn't been set up yet. Ask your admin to configure Supabase.",
        },
      };
    }

    const sb = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Note: user_email will be injected by the chat route before calling this
    const userEmail = String(input._user_email || "");
    if (!userEmail) {
      return { result: { error: "User context missing for knowledge search." } };
    }

    // Try full-text search first
    const tsQuery = query
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w.replace(/[^a-zA-Z0-9]/g, ""))
      .filter((w) => w.length > 1)
      .join(" & ");

    let results: Array<{
      source: string;
      source_name: string;
      sender: string | null;
      content: string;
      created_at: string;
    }> = [];

    if (tsQuery) {
      let dbQuery = sb
        .from("knowledge_entries")
        .select("source, source_name, sender, content, created_at")
        .eq("user_email", userEmail)
        .textSearch("content_tsv", tsQuery, { type: "plain" })
        .limit(maxResults)
        .order("created_at", { ascending: false });

      if (sourceName) {
        dbQuery = dbQuery.eq("source_name", sourceName);
      }

      const { data, error } = await dbQuery;
      if (!error && data) results = data;
    }

    // Fallback to ILIKE for short/unusual queries
    if (results.length === 0) {
      let dbQuery = sb
        .from("knowledge_entries")
        .select("source, source_name, sender, content, created_at")
        .eq("user_email", userEmail)
        .ilike("content", `%${query}%`)
        .limit(maxResults)
        .order("created_at", { ascending: false });

      if (sourceName) {
        dbQuery = dbQuery.eq("source_name", sourceName);
      }

      const { data } = await dbQuery;
      if (data) results = data;
    }

    if (results.length === 0) {
      return {
        result: {
          found: false,
          message: `No stored knowledge found matching "${query}". The user may not have imported any data yet, or the search terms don't match stored content.`,
          suggestion: "You can let the user know that they can import WhatsApp chats or documents via the Knowledge Base settings.",
        },
      };
    }

    // Format results for the AI
    const formatted = results.map((r) => ({
      source_type: r.source,
      source_name: r.source_name,
      sender: r.sender || undefined,
      content: r.content.length > 1000 ? r.content.slice(0, 1000) + "…" : r.content,
      date: r.created_at,
    }));

    return {
      result: {
        found: true,
        total_results: results.length,
        query,
        entries: formatted,
        instruction:
          "Use the retrieved knowledge entries to answer the user's question. " +
          "Cite specific senders and dates when referencing WhatsApp messages. " +
          "Be helpful and accurate based on the stored data.",
      },
    };
  } catch (err) {
    console.error("Knowledge search error:", err);
    return {
      result: {
        error: "Failed to search the knowledge base.",
        message: String(err),
      },
    };
  }
}
