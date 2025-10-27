import express from "express";
import fetch from "node-fetch";
import { DEFAULT_SYSTEM_MESSAGE, DEFAULT_TOOLS } from "./tools.js";

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

// === Gemini API Key Rotation ===
// Add your Google API keys here. The proxy will rotate through them for each request (round-robin).
// Replace these with your own Gemini API keys.
const apiKeys = [
  1,2,3,4,5
]

let currentKeyIndex = 0;

// Returns the next API key in round-robin order
function getNextKey() {
  const key = apiKeys[currentKeyIndex];
  currentKeyIndex = (currentKeyIndex + 1) % apiKeys.length;
  return key;
}



// === Main Gemini Proxy Endpoint ===
// Proxies requests to Gemini's streamGenerateContent endpoint, rotating API keys and forwarding all relevant headers and body fields.
// Designed for maximum transparency and compatibility with Gemini's streaming API and tool use protocol.
app.post(
  "/v1/models/gemini-2.5-pro:streamGenerateContent",
  async (req, res) => {
    // --- Request Logging ---
    // (Uncomment for debugging)
    console.log("--- Gemini Stream Proxy Request Start ---");
    // console.log("Incoming method:", req.method);
    // console.log("Incoming url:", req.originalUrl);
    // console.log("Incoming headers:", req.headers);
    // console.log("Incoming body:", req.body);

    // Model selection (default fallback if not provided)
    const model = req.params.model || "gemini-2.5-pro";

    // Copy all query params, but always rotate the key for each request
    const query = { ...req.query, key: getNextKey() };
    // Build query string for Gemini endpoint
    const queryString = Object.entries(query)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join("&");
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?${queryString}`;

    try {
      // --- Header Forwarding ---
      // Forward all headers except hop-by-hop and problematic headers (per HTTP spec)
      const hopByHop = [
        "host", "content-length", "transfer-encoding", "accept-encoding",
        "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
        "te", "trailer", "upgrade"
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
        if (typeof req.body === "object" && req.body !== null && Object.keys(req.body).length > 0) {
          hasBody = true;
          bodyStr = JSON.stringify(req.body);
        } else if (typeof req.body === "string" && req.body.trim().length > 0) {
          hasBody = true;
          bodyStr = req.body;
        }
        let outgoingPayload = {};
        if(hasBody){
         try{ outgoingPayload = typeof req.body==="object"? req.body: JSON.parse(bodyStr);}catch{ outgoingPayload={ contents:[{role:"user",parts:[{text:bodyStr}]}]};}
        }
        if(!outgoingPayload.contents){
         outgoingPayload.contents=[{role:"user",parts:[{text:""}]}];
        }
        const hasSystem = outgoingPayload.contents.some(c=>c.role==="system");
        if(!hasSystem){
         outgoingPayload.contents.unshift({role:"system",parts:[{text:DEFAULT_SYSTEM_MESSAGE}]});
        }
        if(!outgoingPayload.tools){
         outgoingPayload.tools = DEFAULT_TOOLS;
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
      if (typeof res.flushHeaders === 'function') res.flushHeaders();

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
  }
);

// Start the proxy server
app.listen(3000, () => {
  console.log("Gemini proxy running on http://localhost:3000");
});
