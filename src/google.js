import fetch from "node-fetch";

// === Gemini API Key Rotation ===
// Add your Google API keys here. The proxy will rotate through them for each request (round-robin).
// Replace these with your own Gemini API keys.
const apiKeys = [
  1,2,3
].reverse(); // Reverse for demonstration; order doesn't matter for rotation

let currentKeyIndex = 0;

// Returns the next API key in round-robin order
function getNextKey() {
  const key = apiKeys[currentKeyIndex];
  currentKeyIndex = (currentKeyIndex + 1) % apiKeys.length;
  return key;
}

export const useGoogleStream = async (
  req,
  res,
  { model = "gemini-2.5-pro", tools = []} = {}
) => {
  const query = { ...req.query, key: getNextKey() };

  const queryString = Object.entries(query)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?${queryString}`;

  try {
    // --- Header Forwarding ---
    // Forward all headers except hop-by-hop and problematic headers (per HTTP spec)
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
    const headers = {};
    for (const [key, value] of Object.entries(req.headers)) {
      const lower = key.toLowerCase();
      if (!hopByHop.includes(lower)) {
        headers[key] = value;
      }
    }
    // Force identity encoding for streaming compatibility
    headers["accept-encoding"] = "identity";

    // --- Body Forwarding ---
    // Forward the request body as-is (JSON or string), for maximum compatibility
    const fetchOptions = {
      method: req.method,
      headers,
    };
    if (["POST", "PUT", "PATCH"].includes(req.method)) {
      let hasBody = false;
      let bodyStr = "";
      if (
        typeof req.body === "object" &&
        req.body !== null &&
        Object.keys(req.body).length > 0
      ) {
        hasBody = true;
        bodyStr = JSON.stringify(req.body);
      } else if (typeof req.body === "string" && req.body.trim().length > 0) {
        hasBody = true;
        bodyStr = req.body;
      }
      let outgoingPayload = {};
      if (hasBody) {
        try {
          outgoingPayload =
            typeof req.body === "object" ? req.body : JSON.parse(bodyStr);
        } catch {
          outgoingPayload = {
            contents: [{ role: "user", parts: [{ text: bodyStr }] }],
          };
        }
      }
      if (!outgoingPayload.contents) {
        outgoingPayload.contents = [{ role: "user", parts: [{ text: "" }] }];
      }
      if (!outgoingPayload.tools) {
        outgoingPayload.tools = tools;
      }
      fetchOptions.body = JSON.stringify(outgoingPayload);
    }

    // --- Proxy the request to Gemini ---
    const response = await fetch(url, fetchOptions);

    // --- Response Forwarding ---
    // Forward status and headers, but remove hop-by-hop and problematic headers
    res.status(response.status);
    for (const [key, value] of response.headers.entries()) {
      const lower = key.toLowerCase();
      if (!hopByHop.includes(lower) && lower !== "content-encoding") {
        res.setHeader(key, value);
      }
    }
    // Flush headers to start streaming immediately (important for SSE)
    if (typeof res.flushHeaders === "function") res.flushHeaders();

    // --- Streaming Response Handling ---
    // Pipe Gemini SSE response directly to client
    if (response.body) {
      // (Optional) Log every chunk of streamed output for debugging
      response.body.on("data", (chunk) => {
        console.log("[Gemini Streamed Chunk]", chunk.toString());
      });
      response.body.pipe(res);
      response.body.on("end", () => {
        res.end();
      });
      response.body.on("error", (err) => {
        console.error("Upstream stream error:", err);
        res.end();
      });
      res.on("close", () => {
        if (response.body && response.body.destroy) response.body.destroy();
      });
    } else {
      res.status(500).json({ error: "No response body from Gemini API" });
    }
  } catch (err) {
    // --- Error Handling ---
    console.error("Error proxying stream request:", err);
    res.status(500).json({ error: "Proxy error" });
  }
};
