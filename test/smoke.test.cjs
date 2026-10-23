'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const { aiErrorExplainer } = require('../dist/index.js');

/** Starts a local OpenAI-compatible mock server. */
function startMockAi({ text = 'Looks like the database refused the connection.', fail = false, hang = false } = {}) {
  return new Promise((resolve) => {
    const requests = [];
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        if (hang) return; // never respond
        if (fail) {
          res.writeHead(500, { 'content-type': 'application/json' });
          res.end('{"error":"upstream exploded"}');
          return;
        }
        requests.push({ url: req.url, auth: req.headers.authorization, body: JSON.parse(body || '{}') });
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: text } }] }));
      });
    });
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, port: server.address().port, requests });
    });
  });
}

/** Starts an express app with a throwing route plus the given error handler. */
function startApp(handler, { route = '/boom', error } = {}) {
  const app = express();
  app.get(route, () => {
    throw error ?? Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432'), { code: 'ECONNREFUSED' });
  });
  app.use(handler);
  const server = http.createServer(app);
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, port: server.address().port });
    });
  });
}

async function getJson(port, path) {
  const res = await fetch(`http://127.0.0.1:${port}${path}`);
  return { status: res.status, body: await res.json() };
}

const close = (server) => new Promise((resolve) => server.close(resolve));

/** Polls until a condition holds (background AI calls land after the response). */
async function waitFor(condition, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('timed out waiting for condition');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

test('explains the error in the response when includeInResponse is on', async (t) => {
  const mock = await startMockAi({ text: 'Postgres refused the connection; check the DB host is up.' });
  const app = await startApp(
    aiErrorExplainer({ apiKey: 'test-key', baseURL: `http://127.0.0.1:${mock.port}/v1`, includeInResponse: true, log: false }),
  );
  t.after(() => close(mock.server));
  t.after(() => close(app.server));

  const { status, body } = await getJson(app.port, '/boom');

  assert.equal(status, 500);
  assert.equal(body.error, 'Internal Server Error');
  assert.match(body.message, /ECONNREFUSED/);
  assert.equal(body.aiExplanation, 'Postgres refused the connection; check the DB host is up.');

  // The AI request was shaped correctly.
  assert.equal(mock.requests.length, 1);
  const call = mock.requests[0];
  assert.equal(call.url, '/v1/chat/completions');
  assert.equal(call.auth, 'Bearer test-key');
  assert.equal(call.body.model, 'gpt-4o-mini');
  assert.equal(call.body.messages[0].role, 'system');
  assert.equal(call.body.messages[1].role, 'user');
  assert.match(call.body.messages[1].content, /ECONNREFUSED/);
  assert.match(call.body.messages[1].content, /"method": "GET"/);
});

test('keeps explanations and raw messages out of the response when includeInResponse is off', async (t) => {
  const mock = await startMockAi();
  const app = await startApp(
    aiErrorExplainer({ apiKey: 'test-key', baseURL: `http://127.0.0.1:${mock.port}/v1`, includeInResponse: false, log: false }),
  );
  t.after(() => close(mock.server));
  t.after(() => close(app.server));

  const { status, body } = await getJson(app.port, '/boom');

  assert.equal(status, 500);
  assert.equal(body.error, 'Internal Server Error');
  assert.equal(body.message, 'Internal Server Error');
  assert.equal('aiExplanation' in body, false);
  // ...but the explanation was still requested in the background, so it can be logged.
  await waitFor(() => mock.requests.length === 1);
  assert.equal(mock.requests.length, 1);
});

test('respects err.status and exposes 4xx messages', async (t) => {
  const mock = await startMockAi({ text: 'The email field is not a valid address.' });
  const app = await startApp(
    aiErrorExplainer({ apiKey: 'test-key', baseURL: `http://127.0.0.1:${mock.port}/v1`, includeInResponse: true, log: false }),
    { route: '/bad', error: Object.assign(new Error('invalid email: "nope"'), { status: 400 }) },
  );
  t.after(() => close(mock.server));
  t.after(() => close(app.server));

  const { status, body } = await getJson(app.port, '/bad');

  assert.equal(status, 400);
  assert.equal(body.error, 'Bad Request');
  assert.equal(body.message, 'invalid email: "nope"');
  assert.equal(body.aiExplanation, 'The email field is not a valid address.');
});

test('degrades gracefully when the AI endpoint fails', async (t) => {
  const mock = await startMockAi({ fail: true });
  const app = await startApp(
    aiErrorExplainer({ apiKey: 'test-key', baseURL: `http://127.0.0.1:${mock.port}/v1`, includeInResponse: true, log: false }),
  );
  t.after(() => close(mock.server));
  t.after(() => close(app.server));

  const { status, body } = await getJson(app.port, '/boom');

  assert.equal(status, 500);
  assert.equal('aiExplanation' in body, false);
  assert.match(body.message, /ECONNREFUSED/);
});

test('does not hang on a slow AI endpoint', async (t) => {
  const mock = await startMockAi({ hang: true });
  const app = await startApp(
    aiErrorExplainer({
      apiKey: 'test-key',
      baseURL: `http://127.0.0.1:${mock.port}/v1`,
      includeInResponse: true,
      log: false,
      timeoutMs: 200,
    }),
  );
  t.after(() => close(mock.server));
  t.after(() => close(app.server));

  const started = Date.now();
  const { status, body } = await getJson(app.port, '/boom');

  assert.equal(status, 500);
  assert.equal('aiExplanation' in body, false);
  assert.ok(Date.now() - started < 3000, 'response should arrive promptly after the timeout');
});
