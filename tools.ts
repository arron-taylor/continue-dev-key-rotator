// === Continue Agent Mode defaults (system + tools) ===
// Default system message similar to what Continue injects in Agent mode.
// Keep this short but explicit about function-calling behavior.
const DEFAULT_SYSTEM_MESSAGE = `You are an automated coding assistant operating in Agent mode. 
When a tool/function is required, produce a structured function call that matches the provided function schema.
Do not output extra natural-language text outside the function call when a function call is required.
When returning results of tool calls to the user, prefer concise, clear results and follow the tool descriptions exactly.`;

// Default function declarations (tools) used by Continue's Agent mode.
// Each entry follows Gemini/Vertex API function declaration schema (OpenAPI-like).
// We supply this entire list if the incoming request body does not already include `tools`.
const DEFAULT_FUNCTION_DECLARATIONS = [
  {
    name: "read_file",
    description: "Use this tool if you need to view the contents of an existing file.",
    parameters: {
      type: "object",
      required: ["filepath"],
      properties: {
        filepath: {
          type: "string",
          description:
            "The path of the file to read, relative to the root of the workspace (NOT uri or absolute path)",
        },
      },
    },
  },
  {
    name: "create_new_file",
    description: "Create a new file. Only use this when a file doesn't exist and should be created",
    parameters: {
      type: "object",
      required: ["filepath", "contents"],
      properties: {
        filepath: { type: "string", description: "Relative path to the new file" },
        contents: { type: "string", description: "File contents to create" },
      },
    },
  },
  {
    name: "run_terminal_command",
    description:
      "Run a terminal command in the current directory. The shell is not stateful and will not remember previous commands. Choose commands optimized for darwin/arm64 and /bin/zsh.",
    parameters: {
      type: "object",
      required: ["command"],
      properties: {
        command: { type: "string", description: "The shell command to run" },
        waitForCompletion: { type: "boolean", description: "Whether to wait for completion (default true)" },
      },
    },
  },
  {
    name: "file_glob_search",
    description:
      "Search for files recursively in the project using glob patterns. Use targetted patterns to avoid large results.",
    parameters: {
      type: "object",
      required: ["pattern"],
      properties: { pattern: { type: "string", description: "Glob pattern (supports **) " } },
    },
  },
  {
    name: "view_diff",
    description: "View the current diff of working changes",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "read_currently_open_file",
    description:
      "Read the currently open file in the IDE. If the user is referring to a file you can't see, ask first.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "ls",
    description: "List files and folders in a given directory",
    parameters: {
      type: "object",
      required: ["dirPath"],
      properties: {
        dirPath: { type: "string", description: "Directory path relative to project root (e.g. '/')" },
        recursive: { type: "boolean", description: "If true, list recursively" },
      },
    },
  },
  {
    name: "create_rule_block",
    description:
      "Creates a rule that can be referenced in future conversations (code style, conventions, etc).",
    parameters: {
      type: "object",
      required: ["name", "rule"],
      properties: {
        name: { type: "string", description: "Short descriptive rule name" },
        rule: { type: "string", description: "Imperative instruction to apply in future generation" },
        description: { type: "string", description: "When to apply the rule (optional)" },
        globs: { type: "array", items: { type: "string" } },
        regex: { type: "string" },
        alwaysApply: { type: "boolean" },
      },
    },
  },
  {
    name: "fetch_url_content",
    description: "View the contents of a website using a URL. Do NOT use this for files.",
    parameters: { type: "object", required: ["url"], properties: { url: { type: "string" } } },
  },
  {
    name: "request_rule",
    description: "Retrieve additional rules (by name) containing more context/instructions.",
    parameters: { type: "object", required: ["name"], properties: { name: { type: "string" } } },
  },
  {
    name: "multi_edit",
    description:
      "Make multiple edits to a single file. Edits are applied in sequence and must match exact old_string occurrences.",
    parameters: {
      type: "object",
      required: ["filepath", "edits"],
      properties: {
        filepath: { type: "string" },
        edits: {
          type: "array",
          items: {
            type: "object",
            required: ["old_string", "new_string"],
            properties: {
              old_string: { type: "string" },
              new_string: { type: "string" },
              replace_all: { type: "boolean" },
            },
          },
        },
      },
    },
  },
  {
    name: "grep_search",
    description: "Perform a ripgrep search over the repo. Output may be truncated.",
    parameters: { type: "object", required: ["query"], properties: { query: { type: "string" } } },
  },
  {
    name: "edit_existing_file",
    description: "Edit an existing file (use read_file first to inspect).",
    parameters: {
      type: "object",
      required: ["filepath", "edits"],
      properties: {
        filepath: { type: "string" },
        edits: {
          type: "array",
          items: {
            type: "object",
            required: ["old_string", "new_string"],
            properties: {
              old_string: { type: "string" },
              new_string: { type: "string" },
              replace_all: { type: "boolean" },
            },
          },
        },
      },
    },
  }
];

// Wrap into the Tool container expected by Gemini API:
export const DEFAULT_TOOLS = [{ functionDeclarations: DEFAULT_FUNCTION_DECLARATIONS }];