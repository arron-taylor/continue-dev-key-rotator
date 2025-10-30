# Continue.dev API Key Rotator

Are you tired of your Continue.dev workflow grinding to a halt because of API rate limits? Frustrated by constantly hitting quotas and having to juggle multiple keys or drop more money on credits?

This project was born out of that exact frustration. As a developer using Continue.dev daily for AI-assisted coding, I wanted a seamless way to maximize my productivity without the annoying interruptions of rate limits and key management.

The Continue.dev API Key Rotator is your solution: a lightweight Node.js proxy that automatically rotates through your API keys for multiple providers (Google Gemini, Codestral, Cohere, Groq). It replicates Continue.dev's Agent Mode function-calling behavior perfectly, injecting the default system message and all built-in tools while handling tool execution on the client side.

Set it up once, and let your development flow stay uninterrupted—never worry about hitting limits again. Plus, if Gemini randomly fails mid-session, you can easily swap to Cohere, Codestral, or Groq without missing a beat.

A lightweight Node.js proxy for various AI providers (Google Gemini, Codestral, Cohere, Groq) that replicates Continue.dev's Agent Mode function-calling behavior. This proxy transparently forwards requests to multiple streaming endpoints, injects the default system message, and includes all built-in tools for function calling. Tool execution is handled on the client side (e.g., by Continue.dev), so no local execution is performed.

## Features

* Transparent proxy for Gemini, Codestral, Cohere, and Groq streaming APIs.
* Injects Continue.dev's Agent Mode system prompt automatically.
* Includes all default tools for function calling (`read_file`, `create_new_file`, `run_terminal_command`, etc.).
* Rotates through multiple API keys automatically for each provider.
* Compatible with Continue.dev; drop it in and point Continue to use this proxy for Agent Mode.

## Quick Start

1. **Clone the repository**

```bash
git clone https://github.com/arron-taylor/continue-dev-key-rotator.git
cd continue-dev-key-rotator
```

2. **Install dependencies**

```bash
npm install
```

3. **Set api keys**

Edit the `apiKeys` arrays in the source files for each provider you want to use:

- For Gemini: Edit `src/google.js`
- For Codestral: Edit `src/codestral.js`
- For Cohere: Edit `src/cohere.js`
- For Groq: Edit `src/groq.js`

Replace the placeholder keys with your own API keys. The proxy will rotate through them for each request (round-robin).

4. **Start the proxy**

```bash
node server.js
```

5. **Use with Continue.dev**

Simply configure Continue.dev to point to `http://localhost:3000` as the provider endpoint. The proxy will handle system prompts, tool injection, and API key rotation automatically.

### Configuring Continue.dev Agents

To wire up the proxy with Continue.dev, add models to your `.continue/config.yaml` or create an agents file like `.continue/agents/local.yaml`. Set the `apiBase` for each model to point to the proxy's local endpoint:

- **Gemini**: `apiBase: http://localhost:3000/v1/`
- **Cohere**: `apiBase: http://localhost:3000/v2/`
- **Codestral**: `apiBase: http://localhost:3000/v1/` (uses OpenAI-compatible endpoint)
- **Groq**: `apiBase: http://localhost:3000/groq/`

Example model configuration:

```yaml
- name: Local Gemini Proxy
  provider: gemini
  model: gemini-2.5-pro
  apiBase: http://localhost:3000/v1/
  roles: [chat, edit, apply]
```

This allows you to seamlessly switch between providers or use the proxy for Agent Mode without changing your Continue.dev setup.

## Notes

* Tool execution is handled client-side; this proxy only forwards and formats requests.
* Designed for local development or private networks. Do **not** expose unprotected to the public, as it will allow full access to your API keys.
* Fully compatible with Continue.dev, making it easy to integrate for Agent Mode without modifying client logic.

## Contributing

PRs welcome! If you have improvements, bug fixes, or new features (like support for additional AI providers), feel free to open a pull request.

## License

MIT License
