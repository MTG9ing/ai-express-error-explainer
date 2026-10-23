import type { ErrorRequestHandler, Request } from 'express';
import { STATUS_CODES } from 'node:http';

/** Minimal logger shape; anything with `.error` works (console included). */
export interface Logger {
  error(...args: unknown[]): void;
}

export interface AiExplainerOptions {
  /**
   * API key for an OpenAI-compatible endpoint (`Authorization: Bearer <key>`).
   */
  apiKey: string;
  /**
   * Base URL of the OpenAI-compatible API.
   * Works with OpenAI, OpenRouter, Groq, Ollama, Freebuff, etc.
   * @default 'https://api.openai.com/v1'
   */
  baseURL?: string;
  /**
   * Model to use for explanations.
   * @default 'gpt-4o-mini'
   */
  model?: string;
  /**
   * Include the AI explanation in the JSON error response, under `aiExplanation`.
   * Defaults to `true` in non-production (`NODE_ENV !== 'production'`).
   * When this is on, the original error message is exposed in the response too.
   * @default process.env.NODE_ENV !== 'production'
   */
  includeInResponse?: boolean;
  /**
   * Log the explanation server-side (always, in both dev and production).
   * @default true
   */
  log?: boolean;
  /**
   * Logger used for the explanation output.
   * @default console
   */
  logger?: Logger;
  /**
   * Extra instructions appended to the default system prompt,
   * e.g. tone, team conventions, or "mention our runbook".
   */
  systemPrompt?: string;
  /**
   * How long to wait for the AI before giving up (the error response
   * is never blocked longer than this, and never fails because of it).
   * @default 8000
   */
  timeoutMs?: number;
  /**
   * Maximum number of stack lines sent to the AI.
   * @default 15
   */
  maxStackFrames?: number;
}

const DEFAULT_SYSTEM_PROMPT =
  'You are a senior Node.js and Express debugging assistant. ' +
  'A developer just hit an error in their app; you receive the error context as JSON. ' +
  'Reply in plain English with 3-6 sentences: what most likely happened, the most probable root cause, ' +
  'and one concrete next step to fix or debug it. Be direct and practical. ' +
  'Never invent details that are not in the context; if something is missing, say what to check next. ' +
  'Reply with the explanation only - no greetings, no markdown headers, no code blocks.';

/**
 * Express error-handling middleware that asks an OpenAI-compatible AI to explain
 * whatever just broke. Must be registered after your routes:
 *
 * ```ts
 * app.use(aiErrorExplainer({ apiKey: process.env.OPENAI_API_KEY }));
 * ```
 */
export function aiErrorExplainer(options: AiExplainerOptions): ErrorRequestHandler {
  if (!options || typeof options.apiKey !== 'string' || options.apiKey.length === 0) {
    throw new TypeError('[ai-express-error-explainer] options.apiKey is required');
  }

  const baseURL = String(options.baseURL ?? 'https://api.openai.com/v1').replace(/\/+$/, '');
  const model = options.model ?? 'gpt-4o-mini';
  const includeInResponse = options.includeInResponse ?? process.env.NODE_ENV !== 'production';
  const log = options.log ?? true;
  const logger = options.logger ?? console;
  const systemPrompt = options.systemPrompt
    ? `${DEFAULT_SYSTEM_PROMPT}\n\n${options.systemPrompt}`
    : DEFAULT_SYSTEM_PROMPT;
  const timeoutMs = options.timeoutMs ?? 8000;
  const maxStackFrames = options.maxStackFrames ?? 15;

  async function explain(err: unknown, req: Request, status: number): Promise<string | undefined> {
    try {
      const body = await postChatCompletion({
        baseURL,
        apiKey: options.apiKey,
        model,
        systemPrompt,
        userPrompt: `Error context:\n${buildContext(err, req, status, maxStackFrames)}`,
        timeoutMs,
      });
      const text = body?.choices?.[0]?.message?.content;
      if (typeof text === 'string' && text.trim().length > 0) return text.trim();
      throw new Error('AI response contained no explanation');
    } catch (cause) {
      if (log) {
        try {
          logger.error(
            '[ai-express-error-explainer] explanation failed:',
            cause instanceof Error ? cause.message : String(cause),
          );
        } catch {
          /* a broken logger must never break error handling */
        }
      }
      return undefined;
    }
  }

  return function aiErrorExplainerMiddleware(err, req, res, next) {
    if (res.headersSent) return next(err);
    const status = getStatus(err);
    const message = err instanceof Error ? err.message : String(err);

    // The explanation request never rejects; it is awaited only when the
    // response needs it, otherwise it just finishes in the background.
    const explanation = explain(err, req, status);

    const send = async (): Promise<void> => {
      const aiExplanation = includeInResponse ? await explanation : undefined;
      const payload: Record<string, unknown> = {
        error: STATUS_CODES[status] ?? 'Error',
        message: status < 500 || includeInResponse ? message : 'Internal Server Error',
      };
      if (aiExplanation) payload.aiExplanation = aiExplanation;
      res.status(status).json(payload);
    };

    void send().then(
      () => {
        if (!log) return;
        void explanation.then((text) => {
          if (!text) return;
          try {
            logger.error(
              `[ai-express-error-explainer] ${req.method} ${req.originalUrl} -> ${status}: ${text}`,
            );
          } catch {
            /* ignore broken loggers */
          }
        });
      },
      (failure) => next(failure ?? err),
    );
  };
}

function getStatus(err: unknown): number {
  if (err !== null && typeof err === 'object') {
    const candidate = (err as { status?: unknown; statusCode?: unknown }).status
      ?? (err as { statusCode?: unknown }).statusCode;
    if (typeof candidate === 'number' && Number.isInteger(candidate) && candidate >= 400 && candidate <= 599) {
      return candidate;
    }
  }
  return 500;
}

function buildContext(err: unknown, req: Request, status: number, maxStackFrames: number): string {
  const asError = err instanceof Error ? err : undefined;
  const stack = typeof asError?.stack === 'string'
    ? asError.stack.split('\n').slice(0, maxStackFrames + 1).join('\n')
    : String(err);
  const code = (err as { code?: unknown } | null)?.code;
  const error: Record<string, unknown> = {
    name: asError?.name ?? typeof err,
    message: asError?.message ?? String(err),
    stack,
  };
  if (typeof code === 'string' || typeof code === 'number') error.code = code;

  return JSON.stringify(
    {
      method: req.method,
      url: req.originalUrl,
      status,
      error,
      node: process.version,
    },
    null,
    2,
  );
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: unknown } }>;
}

async function postChatCompletion(params: {
  baseURL: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  timeoutMs: number;
}): Promise<ChatCompletionResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), params.timeoutMs);
  try {
    const response = await fetch(`${params.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${params.apiKey}`,
      },
      body: JSON.stringify({
        model: params.model,
        messages: [
          { role: 'system', content: params.systemPrompt },
          { role: 'user', content: params.userPrompt },
        ],
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`AI request failed with HTTP ${response.status}`);
    return (await response.json()) as ChatCompletionResponse;
  } finally {
    clearTimeout(timer);
  }
}
