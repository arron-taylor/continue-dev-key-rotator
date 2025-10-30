import fetch from "node-fetch";

// IN PROGRESS

// API keys for rotation
const apiKeys = [
  1,2,3
];
let currentKeyIndex = 0;

// Function to get the current API key
function getCurrentApiKey() {
  return apiKeys[currentKeyIndex];
}

// Function to rotate the API key
function rotateApiKey() {
  currentKeyIndex = (currentKeyIndex + 1) % apiKeys.length;
}

// Function to run codestral with API key rotation

// Streaming proxy for Codestral (Mistral) API
export async function proxyCodestralStream(
  req,
  res,
  { model = "codestral-latest", tools = [] } = {}
) {
  const apiKey = getCurrentApiKey();
  const url = `https://api.mistral.ai/v1/chat/completions`; // Codestral streaming endpoint
  const hopByHop = [
    "host",
    "content-length",
    "transfer-encoding",
    "accept-encoding",
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "upgrade",
  ];
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
    Accept: "text/event-stream",
    ...Object.fromEntries(
      Object.entries(req.headers).filter(
        ([key]) => !hopByHop.includes(key.toLowerCase())
      )
    ),
  };
  headers["accept-encoding"] = "identity";

  // Prepare request body
  let body = {};
  if (typeof req.body === "object" && req.body !== null) {
    body = { ...req.body };
  } else if (typeof req.body === "string") {
    try {
      body = JSON.parse(req.body);
    } catch {
      body = {
        messages: [{ role: "user", content: req.body }],
      };
    }
  }
  body.model = model;
  if (!body.messages) {
    body.messages = [{ role: "user", content: "" }];
  }
  if (!body.tools) {
    body.tools = tools;
  }
  // Enable streaming
  body.stream = true;

  try {
    const redactedHeaders = { ...headers };
    if (redactedHeaders.Authorization) redactedHeaders.Authorization = "[redacted]";
    const sanitizeBody = (b) => {
      const clone = { ...b };
      if (Array.isArray(clone.messages)) {
        clone.messages = clone.messages.map((m) => ({
          role: m.role,
          content:
            typeof m.content === "string"
              ? m.content.slice(0, 500)
              : m.content,
        }));
      }
      return clone;
    };
    console.log("[Codestral Outgoing]", {
      url,
      headers: redactedHeaders,
      body: sanitizeBody(body),
    });
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      console.error("[Codestral Error]", { status: response.status, body: text });
      res.status(response.status);
      res.setHeader("content-type", "text/plain; charset=utf-8");
      res.end(text || "Upstream error");
      return;
    }
    res.status(response.status);
    for (const [key, value] of response.headers.entries()) {
      const lower = key.toLowerCase();
      if (!hopByHop.includes(lower) && lower !== "content-encoding") {
        res.setHeader(key, value);
      }
    }
    if (typeof res.flushHeaders === "function") res.flushHeaders();

    if (response.body) {
      response.body.on("data", (chunk) => {});
      response.body.pipe(res);
      response.body.on("end", () => {
        res.end();
      });
      response.body.on("error", (err) => {
        console.error("Codestral upstream stream error:", err);
        res.end();
      });
      res.on("close", () => {
        if (response.body && response.body.destroy) response.body.destroy();
      });
    } else {
      res.status(500).json({ error: "No response body from Codestral API" });
    }
  } catch (error) {
    console.error("Codestral proxy error:", error);
    rotateApiKey();
    res.status(500).json({ error: "Proxy error" });
  }
}

// Example usage
// import { proxyCodestralStream } from './codestral.js';
// app.post('/v1/models/codestral-latest:streamGenerateContent', (req, res) => proxyCodestralStream(req, res, { model: 'codestral-latest', tools: [...] }));
