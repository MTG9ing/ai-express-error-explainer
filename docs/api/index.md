# aiErrorExplainer()

```ts
function aiErrorExplainer(options: AiExplainerOptions): ErrorRequestHandler
```

Creates the Express error-handling middleware. Import it from the package root:

```ts
import { aiErrorExplainer } from 'ai-express-error-explainer';
// types
import type { AiExplainerOptions, Logger } from 'ai-express-error-explainer';
```

Throws `TypeError` immediately — at setup, not at request time — if `options.apiKey` is missing or empty.

## AiExplainerOptions

```ts
interface AiExplainerOptions {
  apiKey: string;
  baseURL?: string;          // default: 'https://api.openai.com/v1'
  model?: string;            // default: 'gpt-4o-mini'
  includeInResponse?: boolean; // default: NODE_ENV !== 'production'
  log?: boolean;             // default: true
  logger?: Logger;           // default: console
  systemPrompt?: string;     // appended to the built-in prompt
  timeoutMs?: number;        // default: 8000
  maxStackFrames?: number;   // default: 15
}
```

| Field                | Details                                                                                                     |
| -------------------- | ----------------------------------------------------------------------------------------------------------- |
| `apiKey`             | Sent as `Authorization: Bearer <key>`. Never exposed to clients.                                               |
| `baseURL`            | Trailing slashes are stripped; `/chat/completions` is appended.                                                |
| `model`              | Passed through verbatim — provider-specific naming is yours to copy.                                           |
| `includeInResponse`  | When `true`, the response gains `aiExplanation` and 5xx messages are exposed verbatim. Defaults to dev-only.  |
| `log`                | Gates only the log line; the AI request itself still runs so explanations reach your tracker.                  |
| `logger`             | Any object with `error(...args: unknown[]): void`.                                                             |
| `systemPrompt`       | Appended to the built-in debugging prompt, never replaces it.                                                  |
| `timeoutMs`          | Enforced client-side with `AbortController`. Zero/negative values are treated as the timeout firing instantly — use the default. |
| `maxStackFrames`     | Stack lines included in the context (the header line always counts).                                           |

## Logger

```ts
interface Logger {
  error(...args: unknown[]): void;
}
```

## Middleware behavior

The returned handler is standard Express error middleware (`(err, req, res, next) => void`, arity 4):

- **Status**: `err.status` or `err.statusCode` when an integer in `400–599`; otherwise `500`.
- **Message exposure**: 4xx messages always; 5xx messages only when `includeInResponse` is `true`.
- **Headers already sent**: delegates to `next(err)` immediately without touching the response.
- **Async**: awaits the AI only when `includeInResponse` is `true`; otherwise responds synchronously and logs the result whenever it lands. The handler never rejects.

## Response payload

```ts
{
  error: string;          // HTTP status text, e.g. "Internal Server Error"
  message: string;        // err.message or the generic 500 message
  aiExplanation?: string; // present only when enabled and the AI answered in time
}
```

## AI request

`POST {baseURL}/chat/completions` with:

```json
{
  "model": "gpt-4o-mini",
  "messages": [
    { "role": "system", "content": "<built-in debugging prompt + your systemPrompt>" },
    { "role": "user", "content": "Error context:\n{ ...method, url, status, error, node... }" }
  ]
}
```

No `temperature` or token caps are forced, so every provider — including reasoning models that reject those fields — accepts the request.
