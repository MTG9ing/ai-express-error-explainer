'use strict';

// Demo server for ai-express-error-explainer.
//
//   1. Copy .env.example to .env and put your API key in it.
//   2. npm install
//   3. npm start
//   4. Hit /orders/42 (500), /bad (400), or /async (async failure).

const express = require('express');
const fs = require('node:fs/promises');
const { aiErrorExplainer } = require('ai-express-error-explainer');

const app = express();

app.get('/', (req, res) => {
  res.type('text/plain').send(
    'ai-express-error-explainer demo\n\nTry:\n  GET /orders/42   -> 500, DB connection refused\n  GET /bad         -> 400, validation error\n  GET /async       -> 500, async ENOENT\n',
  );
});

app.get('/orders/:id', (req, res) => {
  const err = new Error('connect ECONNREFUSED 10.0.3.12:5432');
  err.code = 'ECONNREFUSED';
  throw err;
});

app.get('/bad', (req, res) => {
  const err = new Error('invalid email: "nope"');
  err.status = 400;
  throw err;
});

app.get('/async', async () => {
  await fs.readFile('/missing/config.json', 'utf8');
});

if (!process.env.OPENAI_API_KEY) {
  console.warn('! OPENAI_API_KEY is not set - errors will come back WITHOUT aiExplanation.');
  console.warn('! Copy .env.example to .env and add your key, then restart.\n');
}

app.use(
  aiErrorExplainer({
    apiKey: process.env.OPENAI_API_KEY || 'demo-missing-key',
    baseURL: process.env.LLM_BASE_URL,
    model: process.env.LLM_MODEL,
  }),
);

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`Demo app on http://localhost:${port}`);
});
