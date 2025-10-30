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

export async function proxyCohereStream(
  req,
  res,
  { model = "command-a-reasoning-08-2025", tools = [] } = {}
) {
  const apiKey = getNextApiKey();
  const url = `https://api.cohere.com/v2/chat`;
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
      // exclude headers we will set explicitly
      return ![
        "authorization",
        "accept",
        "content-type",
        "cohere-version",
        "accept-encoding",
      ].includes(lower);
    })
  );
  const headers = {
    ...forwarded,
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
    Accept: "text/event-stream; charset=utf-8",
    "Cohere-Version": "2024-10-22",
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
  body.model = model;
  if (!body.messages) {
    body.messages = [{ role: "user", content: "" }];
  }
  // Normalize messages to Cohere content blocks and roles
  const normRole = (r) => {
    const s = (r || "user").toString().toLowerCase();
    if (s === "assistant" || s === "tool" || s === "system" || s === "user") return s;
    return "user";
  };
  body.messages = body.messages.map((m) => {
    const msg = { role: normRole(m.role) };
    if (Array.isArray(m.content)) {
      msg.content = m.content.map((c) => {
        if (typeof c === "string") return { type: "text", text: c };
        if (c && typeof c === "object" && c.text && !c.type) return { type: "text", text: c.text };
        return c;
      });
    } else if (typeof m.content === "string") {
      msg.content = [{ type: "text", text: m.content }];
    } else if (m.content == null) {
      msg.content = [{ type: "text", text: "" }];
    } else {
      msg.content = [m.content];
    }
    return msg;
  });
  // Always pass through provided tools (assumed Cohere format by caller)
  if (tools && tools.length > 0) {
    body.tools = tools;
  }
  // Remove unsupported thinking field if present
  if (body.thinking) delete body.thinking;
  // Allow forcing non-streaming for debug if client sends header
  const forceJson = req.headers["x-debug-json"] === "1" || req.headers["x-debug-json"] === "true";
  // Use Cohere-native streaming unless forceJson is enabled
  body.stream = !forceJson;

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
    console.log("[Cohere Outgoing]", {
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
      console.error("[Cohere Error]", { status: response.status, body: text });
      res.status(response.status);
      res.setHeader("content-type", "text/plain; charset=utf-8");
      res.end(text || "Upstream error");
      return;
    }
    if (forceJson) {
      // Return upstream JSON directly (non-stream)
      const json = await response.json().catch(async () => {
        const text = await response.text().catch(() => "");
        return { raw: text };
      });
      res.status(response.status);
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify(json));
      return;
    }

    // Stream mode: forward upstream Cohere-native SSE headers and body (with minimal normalization)
    res.status(response.status);
    for (const [key, value] of response.headers.entries()) {
      const lower = key.toLowerCase();
      if (!hopByHop.includes(lower) && lower !== "content-encoding") {
        res.setHeader(key, value);
      }
    }
    if (typeof res.flushHeaders === "function") res.flushHeaders();

    if (response.body) {
      // Intercept SSE to normalize content-delta events so content is always present
      let seen = 0;
      let buffer = "";
      const flushPart = (part) => {
        // Log first few parts for debugging
        if (seen < 10) {
          console.log("[Cohere SSE]", part.length > 1000 ? part.slice(0, 1000) + "..." : part);
          seen++;
        }
        const lines = part.split(/\n/);
        let out = "";
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const payload = line.slice(6).trim();
            if (payload === "[DONE]") {
              out += "data: [DONE]\n";
              continue;
            }
            try {
              const obj = JSON.parse(payload);
              if (obj && (obj.type === "content-delta" || obj.type === "content-start")) {
                // Normalize content for both delta.message.content and message.content shapes
                if (obj.delta && obj.delta.message) {
                  const msg = obj.delta.message || {};
                  if (!msg.content) {
                    msg.content = { text: "" };
                  } else if (typeof msg.content === "object" && typeof msg.content.text !== "string") {
                    msg.content.text = "";
                  }
                  obj.delta.message = msg;
                }
                if (obj.message) {
                  const m = obj.message || {};
                  if (!m.content) {
                    m.content = { text: "" };
                  } else if (typeof m.content === "object" && typeof m.content.text !== "string") {
                    m.content.text = "";
                  }
                  obj.message = m;
                }
              }
              out += `data: ${JSON.stringify(obj)}\n`;
            } catch {
              // pass through unmodified if not JSON
              out += `${line}\n`;
            }
          } else if (line.length > 0) {
            // pass through other lines (e.g., event: ...)
            out += `${line}\n`;
          }
        }
        // Separate SSE events by blank line
        res.write(out + "\n");
      };
      response.body.on("data", (chunk) => {
        buffer += chunk.toString();
        const parts = buffer.split(/\n\n/);
        buffer = parts.pop() || "";
        for (const p of parts) flushPart(p);
      });
      response.body.on("end", () => {
        if (buffer.length > 0) flushPart(buffer);
        res.end();
      });
      response.body.on("error", () => {
        res.end();
      });
      res.on("close", () => {
        if (response.body && response.body.destroy) response.body.destroy();
      });
    } else {
      res.status(500).json({ error: "No response body from Cohere API" });
    }
  } catch (error) {
    rotateApiKey();
    res.status(500).json({ error: "Proxy error" });
  }
}
