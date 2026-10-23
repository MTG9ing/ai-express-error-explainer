'use strict';

// Local OpenAI-compatible mock provider - lets you test the demo end-to-end
// without an API key. It reads the error context from the prompt and returns
// a heuristic explanation in the standard /chat/completions response shape.
//
//   node mock-ai.js            # listens on 127.0.0.1:8899
//   LLM_BASE_URL=http://127.0.0.1:8899/v1  npm start
//
// Swap it for a real provider (OpenAI, OpenRouter, Freebuff, ...) at any time
// by setting a real key and removing LLM_BASE_URL.

const http = require('node:http');

const RULES = [
  [
    /ECONNREFUSED/i,
    (ctx) =>
      `Something your app depends on refused the connection: ${firstLine(ctx)}. ` +
      `Most likely a database, cache or internal HTTP service is not running, or your config points at the wrong host/port. ` +
      `Next step: check that service is actually up (docker ps / systemctl status) and that the address in your config matches where it listens - watch for localhost vs 127.0.0.1 vs a container hostname.`,
  ],
  [
    /ENOTFOUND|EAI_AGAIN/i,
    (ctx) =>
      `DNS lookup failed for a hostname your app called: ${firstLine(ctx)}. ` +
      `The host name is misspelled, the service was renamed, or DNS is unavailable in this environment. ` +
      `Next step: verify the hostname in your config resolves (nslookup <host>) and check for typos or a missing internal DNS entry.`,
  ],
  [
    /ECONNRESET/i,
    (ctx) =>
      `The remote end closed the connection mid-request: ${firstLine(ctx)}. ` +
      `Typical causes: the upstream service restarted or crashed, an idle timeout, or a proxy cutting long requests. ` +
      `Next step: check upstream service logs around this timestamp and retry logic for idempotent requests.`,
  ],
  [
    /ETIMEDOUT|ESOCKETTIMEDOUT/i,
    (ctx) =>
      `A network call timed out: ${firstLine(ctx)}. ` +
      `The host was reachable but did not answer in time - overload, a firewall dropping packets, or a missing timeout tuned too high. ` +
      `Next step: confirm the service is healthy and set explicit connect/request timeouts on the client you use.`,
  ],
  [
    /ENOENT/i,
    (ctx) =>
      `A file or directory was not found: ${firstLine(ctx)}. ` +
      `A path is wrong, a file was never created, or it exists on your machine but not in the deployment environment. ` +
      `Next step: log the resolved absolute path and check it exists in the runtime environment, not just locally.`,
  ],
  [
    /EACCES|EPERM/i,
    (ctx) =>
      `Permission denied: ${firstLine(ctx)}. ` +
      `The process user cannot read/write the resource (file, port, socket). ` +
      `Next step: check file ownership/permissions or whether a port below 1024 needs elevated rights.`,
  ],
  [
    /^SyntaxError/m,
    (ctx) =>
      `Something failed to parse: ${firstLine(ctx)}. ` +
      `Most often invalid JSON (a body, config file or upstream response) or malformed input reaching a parser. ` +
      `Next step: log the raw payload right before the parse and validate its shape.`,
  ],
  [
    /^TypeError/m,
    (ctx) =>
      `JavaScript tried to use an undefined value: ${firstLine(ctx)}. ` +
      `Usually an unexpected null/undefined (missing request field, awaited something that failed earlier, wrong destructuring). ` +
      `Next step: look at the top stack frame and add a guard or fix the upstream assumption.`,
  ],
];

function firstLine(ctx) {
  return String(ctx?.error?.message ?? 'no message').split('\n')[0];
}

function explain(userPrompt) {
  const jsonStart = userPrompt.indexOf('{');
  let ctx = null;
  if (jsonStart !== -1) {
    try {
      ctx = JSON.parse(userPrompt.slice(jsonStart));
    } catch {
      /* ignore */
    }
  }
  const haystack = `${ctx?.error?.name ?? ''}\n${ctx?.error?.message ?? ''}\n${ctx?.error?.code ?? ''}`;
  for (const [pattern, make] of RULES) {
    if (pattern.test(haystack)) return make(ctx);
  }
  return (
    `The app returned ${ctx?.status ?? 'an error'} at ${ctx?.method ?? '?'} ${ctx?.url ?? '?'}: ${firstLine(ctx)}. ` +
    `Without more signal the most likely causes are a bad input, a failed dependency, or an unhandled edge case in that handler. ` +
    `Next step: read the top stack frames, reproduce locally, and add a log line around the failing call.`
  );
}

const server = http.createServer((req, res) => {
  if (req.method !== 'POST' || !req.url.endsWith('/chat/completions')) {
    res.writeHead(404, { 'content-type': 'application/json' });
    return res.end('{"error":"mock only serves POST /chat/completions"}');
  }
  let body = '';
  req.on('data', (chunk) => (body += chunk));
  req.on('end', () => {
    let content = '';
    try {
      const parsed = JSON.parse(body || '{}');
      const userMessage = (parsed.messages ?? []).find((m) => m.role === 'user')?.content ?? '';
      content = explain(userMessage);
    } catch {
      content = 'Mock provider could not parse the request.';
    }
    console.log(`[mock-ai] ${req.url} model=${JSON.parse(body || '{}').model ?? '?'} -> ${content.slice(0, 80)}...`);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        id: 'chatcmpl-mock',
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: JSON.parse(body || '{}').model ?? 'mock',
        choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
      }),
    );
  });
});

const port = Number(process.env.PORT) || 8899;
server.listen(port, '127.0.0.1', () => {
  console.log(`Mock OpenAI-compatible provider on http://127.0.0.1:${port}/v1/chat/completions`);
});
