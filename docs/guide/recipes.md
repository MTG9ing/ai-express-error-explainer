# Recipes

Short, copy-pasteable patterns for common setups.

## Use Pino (or any structured logger)

Anything with an `.error(...)` method works. Wrap Pino to keep the format tidy:

```js
const pino = require('pino');
const logger = pino();

app.use(
  aiErrorExplainer({
    apiKey: process.env.OPENAI_API_KEY,
    logger: {
      error: (...args) => logger.error({ source: 'ai-express-error-explainer' }, ...args),
    },
  }),
);
```

## Write explanations to Sentry instead of stdout

The `logger` hook is also a clean way to forward explanations into your error tracker's context:

```js
const Sentry = require('@sentry/node');

app.use(
  aiErrorExplainer({
    apiKey: process.env.OPENAI_API_KEY,
    includeInResponse: false, // prod-safe: log side only
    logger: {
      error: (...args) => {
        const message = args.filter((a) => typeof a === 'string').join(' ');
        Sentry.addBreadcrumb({ category: 'ai-explanation', message, level: 'info' });
      },
    },
  }),
);
```

## Go fully local with Ollama

Run a small model on your own machine — zero tokens, zero data leaving the box:

```sh
ollama pull llama3.2
```

```js
app.use(
  aiErrorExplainer({
    apiKey: 'ollama', // any placeholder; the local server ignores it
    baseURL: 'http://127.0.0.1:11434/v1',
    model: 'llama3.2',
  }),
);
```

## Tailor explanations to your stack

Append team-specific instructions without losing the default behavior:

```js
aiErrorExplainer({
  apiKey: process.env.OPENAI_API_KEY,
  systemPrompt: [
    'Our stack: Express 5, Node 22, PostgreSQL via Prisma, Redis cache, deployed on Fly.io.',
    'When the stack trace shows a Prisma call, mention the likely failing query shape.',
    'Always end with the single most useful log line or command to run next.',
  ].join(' '),
});
```

## Test the middleware without spending tokens

Point it at any OpenAI-compatible fake. The repository ships exactly this in [`demo/mock-ai.js`](https://github.com/MTG9ing/ai-express-error-explainer/blob/main/demo/mock-ai.js):

```js
// test/setup: run the mock, then point the middleware at it
app.use(
  aiErrorExplainer({
    apiKey: 'test',
    baseURL: `http://127.0.0.1:${mockPort}/v1`,
    includeInResponse: true,
    log: false,
  }),
);
```

The SDK's own [smoke tests](https://github.com/MTG9ing/ai-express-error-explainer/blob/main/test/smoke.test.cjs) use Node's built-in test runner this way — a good template for asserting your error payloads.

## Disable it entirely in tests

The middleware only acts on errors, but if you want it completely inert (say, in unit tests that assert exact payloads):

```js
app.use(
  aiErrorExplainer({
    apiKey: process.env.OPENAI_API_KEY ?? 'not-used',
    includeInResponse: false,
    log: false,
  }),
);
```

With nothing to do and nowhere to report, it becomes a no-op passthrough.
