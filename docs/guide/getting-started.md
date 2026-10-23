# Getting started

Install the package from npm:

::: code-group

```sh [npm]
npm install ai-express-error-explainer
```

```sh [pnpm]
pnpm add ai-express-error-explainer
```

```sh [yarn]
yarn add ai-express-error-explainer
```

:::

Requires **Node 18.17+** and Express 4 or 5 (Express is a peer dependency you already have).

## 1. Get an API key

Any OpenAI-compatible endpoint works. For OpenAI, create a key at [platform.openai.com/api-keys](https://platform.openai.com/api-keys). Keep it server-side — it never reaches the browser.

```sh
# .env
OPENAI_API_KEY=sk-...
```

## 2. Register the middleware

Add `aiErrorExplainer` **after all your routes**, as the last middleware. That position matters: Express error middleware only sees errors that bubble down to it.

```js
const express = require('express');
const { aiErrorExplainer } = require('ai-express-error-explainer');

const app = express();

app.get('/orders/:id', (req, res) => {
  const err = new Error('connect ECONNREFUSED 10.0.3.12:5432');
  err.code = 'ECONNREFUSED';
  throw err;
});

// Must come after every route:
app.use(
  aiErrorExplainer({
    apiKey: process.env.OPENAI_API_KEY,
  }),
);

app.listen(3000);
```

That's the whole integration. Throw an error anywhere above it — synchronous, `next(err)`, or a rejected async handler (Express 5 catches those automatically) — and the middleware takes over.

## 3. See the explanation

Hit the failing route in development (`NODE_ENV` unset or anything but `production`):

```json
{
  "error": "Internal Server Error",
  "message": "connect ECONNREFUSED 10.0.3.12:5432",
  "aiExplanation": "Something your app depends on refused the connection: connect ECONNREFUSED 10.0.3.12:5432. Most likely a database, cache or internal HTTP service is not running, or your config points at the wrong host/port. Next step: check that service is actually up and that the address in your config matches where it listens."
}
```

Your server log gets the same explanation in every environment:

```
[ai-express-error-explainer] GET /orders/42 -> 500: Something your app depends on refused the connection...
```

## Using ESM

The package ships CommonJS with types; both module systems import it cleanly:

```js
import { aiErrorExplainer } from 'ai-express-error-explainer';
```

## Try it without a key

The repository's [`demo/`](https://github.com/MTG9ing/ai-express-error-explainer/tree/main/demo) folder contains a runnable app plus `mock-ai.js`, a local OpenAI-compatible server:

```sh
git clone https://github.com/MTG9ing/ai-express-error-explainer
cd ai-express-error-explainer/demo
npm install
npm run mock          # terminal 1: mock AI provider on :8899
LLM_BASE_URL=http://127.0.0.1:8899/v1 npm start   # terminal 2: demo app on :3000
```

Then visit `http://localhost:3000/orders/42` and watch the explanation come back.

## Next steps

- [Configuration](/guide/configuration) — providers, models, production setup
- [How it works](/guide/how-it-works) — what is sent to the AI, response shapes, failure modes
- [Recipes](/guide/recipes) — Pino logging, custom prompts, fully local with Ollama
