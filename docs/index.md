---
layout: home

hero:
  name: ai-express-error-explainer
  text: Explain your Express errors in plain English.
  tagline: >-
    Drop-in error middleware that asks an OpenAI-compatible AI what just broke —
    the likely cause and the next step to fix it, in your dev responses and server logs.
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/MTG9ing/ai-express-error-explainer

features:
  - icon: 📦
    title: Zero runtime dependencies
    details: Uses Node's built-in fetch. Express is the only peer dependency — nothing else lands in your node_modules.
  - icon: 🔌
    title: Any OpenAI-compatible API
    details: OpenAI, OpenRouter, Groq, Ollama, Freebuff, or your own endpoint. Bring your key, no provider lock-in.
  - icon: 🛡️
    title: Safe by default
    details: Explanations appear in responses only outside production. Five-hundred messages stay generic in prod.
  - icon: ⏱️
    title: Never breaks error handling
    details: Timeouts, HTTP errors and malformed AI responses all degrade to a plain error response.
  - icon: 💡
    title: Cause plus next step
    details: Explanations read the message, error code, stack frames and request context — then say what to check.
  - icon: 🧰
    title: TypeScript-first
    details: Ships full type declarations. One factory call, one middleware, done.
---

## See it in action

```js
const { aiErrorExplainer } = require('ai-express-error-explainer');

app.get('/orders/:id', (req, res) => {
  const err = new Error('connect ECONNREFUSED 10.0.3.12:5432');
  err.code = 'ECONNREFUSED';
  throw err;
});

app.use(aiErrorExplainer({ apiKey: process.env.OPENAI_API_KEY }));
```

In development, the error response you already return gains one field:

```json
{
  "error": "Internal Server Error",
  "message": "connect ECONNREFUSED 10.0.3.12:5432",
  "aiExplanation": "Something your app depends on refused the connection: connect ECONNREFUSED 10.0.3.12:5432. Most likely a database, cache or internal HTTP service is not running, or your config points at the wrong host/port. Next step: check that service is actually up and that the address in your config matches where it listens."
}
```

The same explanation is written to your server log, in every environment.
In production the response stays a normal, safe error payload — the AI still runs, it just never leaks into the reply.

<div class="tip custom">

Prefer to try before you install? The [repository ships a runnable demo](https://github.com/MTG9ing/ai-express-error-explainer/tree/main/demo) with a local mock provider — no API key needed.

</div>
