# How it works

Understanding the flow makes the defaults — and the safety guarantees — obvious.

## The lifecycle of an error

```
your route throws / rejects
        │
        ▼
Express error pipeline (4-argument middleware)
        │
        ▼
aiErrorExplainer
  1. reads the status  (err.status | err.statusCode | 500)
  2. fires the AI request (never rejects)
  3. builds the JSON payload
  4. responds
        │
        ├─ includeInResponse on  → waits for the AI (bounded by timeoutMs)
        │                          and adds aiExplanation to the body
        │
        └─ includeInResponse off → responds immediately; the AI result
                                   arrives later and is only logged
        │
        ▼
explanation printed to your logger (when log is enabled)
```

Only real errors reach it. Normal responses and 404s never touch the middleware, never cost a token.

## What is sent to the AI

A single `POST {baseURL}/chat/completions` with a compact JSON context:

```json
{
  "method": "GET",
  "url": "/orders/42",
  "status": 500,
  "error": {
    "name": "Error",
    "message": "connect ECONNREFUSED 10.0.3.12:5432",
    "code": "ECONNREFUSED",
    "stack": "Error: connect ECONNREFUSED 10.0.3.12:5432\n    at TCPConnectWrap.afterConnect [as oncomplete] (net.js:1146:16)\n    ..."
  },
  "node": "v22.11.0"
}
```

The stack is trimmed to `maxStackFrames` lines (15 by default). `code` is included when the error carries one — it's often the single most diagnostic field.

## What is never sent

Deliberately excluded, so credentials and user data stay home:

- request **headers** (no `Authorization`, no cookies)
- request or response **bodies**
- environment variables
- anything outside the error and request line above

## Response shapes

Status codes are respected: `err.status` or `err.statusCode` (400–599) wins, otherwise 500. Messages for 4xx are always exposed — they're meant for the caller.

**Development** (`NODE_ENV !== 'production'`):

```json
{
  "error": "Internal Server Error",
  "message": "connect ECONNREFUSED 10.0.3.12:5432",
  "aiExplanation": "Something your app depends on refused the connection..."
}
```

**Production** — 5xx messages stay generic, and no explanation is attached:

```json
{
  "error": "Internal Server Error",
  "message": "Internal Server Error"
}
```

Force either mode explicitly with `includeInResponse: true | false`.

## Failure modes

The AI path can never break your error handling:

| What happens                  | What you get                                                              |
| ----------------------------- | ------------------------------------------------------------------------- |
| AI responds in time           | Explanation in the response (if enabled) and/or the log.                    |
| AI exceeds `timeoutMs`        | Plain error response, no explanation. Failure logged.                       |
| AI returns HTTP 4xx/5xx       | Plain error response, no explanation. Failure logged.                       |
| AI returns empty/malformed    | Plain error response, no explanation. Failure logged.                       |
| Middleware itself throws      | Delegates to Express (`next(err)`), so the default handler still responds.  |

When `res.headersSent` is already true — an error mid-stream — the middleware steps aside and hands control back to Express.

## Logging

With `log` enabled (the default), every explained error produces one line on your logger:

```
[ai-express-error-explainer] GET /orders/42 -> 500: Something your app depends on refused the connection...
```

Swap in any logger object with an `.error` method — see [Recipes](/guide/recipes#use-pino-or-any-structured-logger).

## Cost and speed

- Only actual errors trigger a request — no per-request overhead at all.
- Explanations are short completions; on `gpt-4o-mini`-class models a call is typically a few hundredths of a dollar and lands in well under a second.
- With `includeInResponse: false`, responses never wait on the AI.
