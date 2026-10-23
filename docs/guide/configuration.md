# Configuration

`aiErrorExplainer(options)` takes one object. Only `apiKey` is required.

```js
app.use(
  aiErrorExplainer({
    apiKey: process.env.OPENAI_API_KEY,
    // everything below is optional
  }),
);
```

## Options

| Option              | Type                                    | Default                          | Description                                                            |
| ------------------- | --------------------------------------- | -------------------------------- | ---------------------------------------------------------------------- |
| `apiKey`            | `string`                                | **required**                     | Bearer token sent to the endpoint.                                       |
| `baseURL`           | `string`                                | `https://api.openai.com/v1`      | Any OpenAI-compatible base URL.                                          |
| `model`             | `string`                                | `gpt-4o-mini`                    | Model name sent to the provider.                                         |
| `includeInResponse` | `boolean`                               | `NODE_ENV !== 'production'`      | Attach `aiExplanation` to the JSON response and expose the raw message.  |
| `log`               | `boolean`                               | `true`                           | Print the explanation to the server log.                                  |
| `logger`            | `{ error(...args): void }`              | `console`                        | Anything with `.error(...)`.                                              |
| `systemPrompt`      | `string`                                | built-in debugging prompt        | Extra instructions appended to the default system prompt.                 |
| `timeoutMs`         | `number`                                | `8000`                           | AI request timeout. The response is never delayed past it.                |
| `maxStackFrames`    | `number`                                | `15`                             | Stack lines included in the context sent to the AI.                       |

## Providers

The middleware speaks plain `/chat/completions`, so any compatible endpoint works.

::: code-group

```js [OpenAI (default)]
app.use(
  aiErrorExplainer({
    apiKey: process.env.OPENAI_API_KEY,
  }),
);
```

```js [OpenRouter]
app.use(
  aiErrorExplainer({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: 'https://openrouter.ai/api/v1',
    model: 'openai/gpt-4o-mini',
  }),
);
```

```js [Ollama (local)]
app.use(
  aiErrorExplainer({
    apiKey: 'ollama',           // unused locally, but required
    baseURL: 'http://127.0.0.1:11434/v1',
    model: 'llama3.2',
  }),
);
```

```js [Freebuff]
app.use(
  aiErrorExplainer({
    apiKey: process.env.FREEBUFF_API_KEY,
    baseURL: 'https://freebuff.com/api/v1/paid',
    model: 'gpt-4o-mini',
  }),
);
```

:::

## Production setup

Out of the box, production gets the safe behavior: no `aiExplanation` in responses, generic 500 messages, but explanations still logged server-side so your error tracking keeps the context.

```js
app.use(
  aiErrorExplainer({
    apiKey: process.env.OPENAI_API_KEY,
    log: true,
    // includeInResponse defaults to false when NODE_ENV === 'production'
  }),
);
```

Two knobs worth setting in production:

- **A cheaper model.** `model: 'gpt-4o-mini'` is the default for a reason — explanations are short, and errors spike precisely when you least want a big bill.
- **A tighter timeout.** Errors usually deserve a fast response:

```js
aiErrorExplainer({
  apiKey: process.env.OPENAI_API_KEY,
  timeoutMs: 4000,
});
```

::: warning Keep it server-side
The middleware runs in your process — the API key never reaches the browser, and request headers, bodies and cookies are never sent to the AI. See [How it works](/guide/how-it-works#what-is-sent-to-the-ai).
:::

## Customizing the prompt

`systemPrompt` is appended to the built-in one, so you can add team context without rewriting the defaults:

```js
aiErrorExplainer({
  apiKey: process.env.OPENAI_API_KEY,
  systemPrompt:
    'We run Express 5 on Node 22 with PostgreSQL via Prisma. ' +
    'Always mention the relevant Prisma client method if the stack shows one.',
});
```

More patterns in [Recipes](/guide/recipes).
