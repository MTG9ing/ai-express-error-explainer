# ai-express-error-explainer

Express error middleware that explains errors in plain English using any OpenAI-compatible AI.

When something throws, your error response gains an `aiExplanation` field — what most likely happened, the probable root cause, and the next step to take — generated from the error message, code, stack and request context. The explanation is also logged server-side. In production the response stays a normal, safe error payload.

- **Zero runtime dependencies** — uses Node's built-in `fetch`; only `express` is a peer dependency.
- **Provider agnostic** — works with OpenAI, OpenRouter, Groq, Ollama, Freebuff, or any `/chat/completions` endpoint.
- **Safe by default** — the explanation goes into responses only outside production, and a slow or broken AI never breaks or delays your error handling beyond `timeoutMs`.

## Install

```sh
npm install ai-express-error-explainer
```

Requires Node 18.17+.

## Quick start

Register it **after** all your routes, as the last middleware:

```js
const express = require('express');
const { aiErrorExplainer } = require('ai-express-error-explainer');

const app = express();

app.get('/orders/:id', (req, res) => {
  const err = new Error('connect ECONNREFUSED 10.0.3.12:5432');
  err.code = 'ECONNREFUSED';
  throw err;
});

app.use(
  aiErrorExplainer({
    apiKey: process.env.OPENAI_API_KEY,
  }),
);

app.listen(3000);
```

Hitting that route in development returns:

```json
{
  "error": "Internal Server Error",
  "message": "connect ECONNREFUSED 10.0.3.12:5432",
  "aiExplanation": "Your app could not reach the PostgreSQL server at 10.0.3.12:5432 — the connection was refused..."
}
```

With a non-OpenAI provider:

```js
app.use(
  aiErrorExplainer({
    apiKey: process.env.LLM_API_KEY,
    baseURL: 'https://openrouter.ai/api/v1',
    model: 'openai/gpt-4o-mini',
  }),
);
```

## Options

| Option               | Type      | Default                            | Description                                                              |
| -------------------- | --------- | ---------------------------------- | ------------------------------------------------------------------------ |
| `apiKey`             | `string`  | **required**                       | Bearer token sent to the endpoint.                                        |
| `baseURL`            | `string`  | `https://api.openai.com/v1`        | Any OpenAI-compatible base URL.                                          |
| `model`              | `string`  | `gpt-4o-mini`                      | Model name.                                                              |
| `includeInResponse`  | `boolean` | `NODE_ENV !== 'production'`        | Add `aiExplanation` to the JSON response (and expose the raw message).   |
| `log`                | `boolean` | `true`                             | Print the explanation to the server log.                                  |
| `logger`             | `Logger`  | `console`                          | Anything with `.error(...)`.                                              |
| `systemPrompt`       | `string`  | built-in debugging prompt          | Extra instructions appended to the system prompt.                         |
| `timeoutMs`          | `number`  | `8000`                             | AI request timeout; on expiry the response is sent without explanation.   |
| `maxStackFrames`     | `number`  | `15`                               | Stack lines included in the context sent to the AI.                       |

## TypeScript

Types ship with the package:

```ts
import type { AiExplainerOptions } from 'ai-express-error-explainer';
```

## How it works

- Only genuine errors reach it (4-argument error middleware), so 404s and normal responses are untouched. It respects `err.status` / `err.statusCode` (400–599) and falls back to `500`.
- It sends a compact JSON context (method, URL, status, error name/message/code, top stack frames, Node version) to `/chat/completions` — no request headers, bodies or cookies, so credentials are not sent to the AI.
- Responses with `status >= 500` keep the generic `"Internal Server Error"` message in production; the AI explanation is only ever attached when `includeInResponse` is on (default: development only).
- The AI call can never fail your error handling: timeouts, HTTP errors and malformed responses all degrade to a plain error response, with the failure logged.

## License

MIT
