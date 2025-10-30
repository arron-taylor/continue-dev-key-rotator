import express from "express";
import { DEFAULT_TOOLS } from "./tools.js";
import { proxyCodestralStream } from "./src/codestral.js";
import { proxyCohereStream } from "./src/cohere.js";
import { proxyGroqStream } from "./src/groq.js";
import { useGoogleStream } from "./src/google.js";

const app = express();
app.use(express.json());
app.use(express.text({ type: ["text/plain", "text/plain; charset=UTF-8"] }));
// Fallback: If a text/plain body is actually JSON, parse it as JSON for compatibility with clients that send JSON as text
app.use((req, res, next) => {
  if (
    req.headers["content-type"] &&
    req.headers["content-type"].startsWith("text/plain") &&
    typeof req.body === "string"
  ) {
    try {
      req.body = JSON.parse(req.body);
    } catch (e) {
      // If not JSON, leave as string
    }
  }
  next();
});

// === Main Gemini Proxy Endpoint ===
// Proxies requests to Gemini's streamGenerateContent endpoint, rotating API keys and forwarding all relevant headers and body fields.
// Designed for maximum transparency and compatibility with Gemini's streaming API and tool use protocol.
app.post(
  "/v1/models/gemini-2.5-pro:streamGenerateContent",
  async (req, res) => {
    console.log("--- Gemini Stream Proxy Request Start ---");
    const model = req.params.model || "gemini-2.5-pro";

    // Use default tools if not provided
    let tools = DEFAULT_TOOLS;
    if (req.body && req.body.tools) {
      tools = req.body.tools;
    }

    await useGoogleStream(req, res, { model, tools });
  }
);

// === Codestral Proxy Endpoint ===
// Proxies requests to Codestral's streaming endpoint, rotating API keys and forwarding all relevant headers and body fields.
// Mirrors Gemini endpoint for compatibility and tool use protocol.
app.post("/v1/chat/completions", async (req, res) => {
  console.log("--- Codestral Stream Proxy Request Start ---");
  const model = req.params.model || "codestral-latest";

  // Use default tools if not provided
  let tools = DEFAULT_TOOLS;
  if (req.body && req.body.tools) {
    tools = req.body.tools;
  }
  await proxyCodestralStream(req, res, { model, tools });
});

// === Cohere Proxy Endpoint ===
// Proxies requests to Cohere's streaming endpoint, rotating API keys and forwarding all relevant headers and body fields.
// Mirrors Gemini endpoint for compatibility and tool use protocol.
app.post("/v2/chat", async (req, res) => {
  console.log("--- Cohere Stream Proxy Request Start ---");
  const model = req.params.model || "command-a-reasoning-08-2025";

  const tools = req.body && req.body.tools ? req.body.tools : DEFAULT_TOOLS;
  await proxyCohereStream(req, res, { model, tools });
});

// === Groq (OpenAI-compatible) Proxy Endpoint ===
// Proxies requests to Groq's OpenAI-compatible chat completions endpoint with streaming.
app.post("/groq/chat/completions", async (req, res) => {
  console.log("--- Groq (OpenAI) Stream Proxy Request Start ---");
  const model =
    (req.body && req.body.model) ||
    (req.params && req.params.model) ||
    "llama-3.1-70b-versatile";
  const tools = req.body && req.body.tools ? req.body.tools : DEFAULT_TOOLS;
  await proxyGroqStream(req, res, { model, tools });
});

// Start the proxy server
app.listen(3000, () => {
  console.log("Gemini proxy running on http://localhost:3000");
});
