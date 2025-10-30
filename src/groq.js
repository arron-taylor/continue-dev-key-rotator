import fetch from "node-fetch";

const apiKeys = [
   1,2,3

];
let currentKeyIndex = 0;
function getNextApiKey() {
  const key = apiKeys[currentKeyIndex];
  currentKeyIndex = (currentKeyIndex + 1) % apiKeys.length;
  return key;
}
function rotateApiKey() {
  currentKeyIndex = (currentKeyIndex + 1) % apiKeys.length;
}

function normalizeTools(tools) {
  if (!Array.isArray(tools) || tools.length === 0) return [];

  // Already OpenAI schema ({ type: "function", function: {...} })
  if (tools.every((tool) => tool && typeof tool === "object" && tool.type)) {
    return tools;
  }

  // Gemini-style wrapper: [{ functionDeclarations: [...] }]
  const normalized = [];
  for (const entry of tools) {
    if (!entry || typeof entry !== "object") continue;
    const declarations = entry.functionDeclarations;
    if (!Array.isArray(declarations)) continue;
    for (const fn of declarations) {
      if (!fn || typeof fn !== "object" || !fn.name) continue;
      normalized.push({
        type: "function",
        function: {
          name: fn.name,
          description: fn.description || "",
          parameters:
            fn.parameters && typeof fn.parameters === "object"
              ? fn.parameters
              : { type: "object", properties: {} },
        },
      });
    }
  }
  return normalized;
}

export async function proxyGroqStream(
  req,
  res,
  { model = "llama-3.1-70b-versatile", tools = [] } = {}
) {
  const apiKey = getNextApiKey();
  const url = `https://api.groq.com/openai/v1/chat/completions`;
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
  const forwarded = Object.fromEntries(
    Object.entries(req.headers).filter(([key]) => {
      const lower = key.toLowerCase();
      if (hopByHop.includes(lower)) return false;
      return ![
        "authorization",
        "accept",
        "content-type",
        "accept-encoding",
      ].includes(lower);
    })
  );
  const headers = {
    ...forwarded,
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
    Accept: "text/event-stream",
    Connection: "keep-alive",
    "Cache-Control": "no-cache",
  };
  headers["accept-encoding"] = "identity";

  let body = {};
  if (typeof req.body === "object" && req.body !== null) {
    body = { ...req.body };
  } else if (typeof req.body === "string") {
    try {
      body = JSON.parse(req.body);
    } catch {
      body = { messages: [{ role: "user", content: req.body }] };
    }
  }
  // Force model from server-selected param, but allow explicit override if provided in body
  body.model = model || body.model || "llama-3.1-70b-versatile";
  if (!Array.isArray(body.messages)) {
    body.messages = [{ role: "user", content: "" }];
  }
  const normalizedTools = normalizeTools(body.tools || tools);
  if (normalizedTools.length > 0) {
    body.tools = normalizedTools;
  } else {
    delete body.tools;
  }
  if (typeof body.stream !== "boolean") body.stream = true;

  try {
    const redactedHeaders = { ...headers };
    if (redactedHeaders.Authorization) redactedHeaders.Authorization = "[redacted]";
    console.log("[Groq Outgoing]", {
      url,
      headers: redactedHeaders,
      body: {
        ...body,
        messages: Array.isArray(body.messages)
          ? body.messages.map((m) => ({ role: m.role, content: typeof m.content === "string" ? m.content.slice(0, 200) : m.content }))
          : body.messages,
      },
    });

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      console.error("[Groq Error]", { status: response.status, body: text });
      res.status(response.status);
      res.setHeader("content-type", "text/plain; charset=utf-8");
      res.end(text || "Upstream error");
      return;
    }

    // Stream passthrough of OpenAI-compatible SSE
    res.status(response.status);
    for (const [key, value] of response.headers.entries()) {
      const lower = key.toLowerCase();
      if (!hopByHop.includes(lower) && lower !== "content-encoding") {
        res.setHeader(key, value);
      }
    }
    if (typeof res.flushHeaders === "function") res.flushHeaders();

    if (response.body) {
      response.body.on("data", (chunk) => {
        res.write(chunk);
      });
      response.body.on("end", () => {
        res.end();
      });
      response.body.on("error", () => {
        res.end();
      });
      res.on("close", () => {
        if (response.body && response.body.destroy) response.body.destroy();
      });
    } else {
      res.status(500).json({ error: "No response body from Groq API" });
    }
  } catch (error) {
    rotateApiKey();
    res.status(500).json({ error: "Proxy error" });
  }
}
