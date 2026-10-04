import { AsyncLocalStorage } from 'node:async_hooks';
import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

// #155: this module is the only retry layer for OpenAI calls. The SDK's own
// retries are off (maxRetries: 0) so nothing retries twice; withRetry below
// handles 429s (the org's gpt-4o limit is 30k tokens/minute, and one identity
// report uses ~40k) plus the transient errors the SDK used to retry.
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 0 });

export type RetryOptions = {
  /** Max 429 retries. Default 8. */
  maxRetries?: number;
  /** Max total time spent waiting between attempts, in ms. Default 60s. */
  budgetMs?: number;
  /** Absolute time (ms since epoch) no wait may run past. Defaults to the enclosing withPipelineDeadline scope, if any. */
  deadline?: number;
  /** If set, a 429 whose retry-after asks for longer than this fails immediately instead of waiting. */
  maxRetryAfterMs?: number;
  /** Shown in the per-retry log line. */
  label?: string;
};

const DEFAULT_MAX_429_RETRIES = 8;
const DEFAULT_BUDGET_MS = 60_000;
const MAX_BACKOFF_MS = 20_000; // cap on a computed (header-less) wait
const MAX_TRANSIENT_RETRIES = 2; // 408 / 409 / 5xx / connection errors
const RETRY_AFTER_PADDING_MS = 250;

/** Pipeline deadline for background generation: start + 220s, inside routes' 240s maxDuration. */
export const PIPELINE_DEADLINE_MS = 220_000;

/**
 * Mentor is a live chat reply: fail fast rather than make the user wait.
 * At most 2 retries and 10s of waiting in total; a retry-after over 5s fails
 * immediately (the route turns that into a 503 "busy" message).
 */
export const MENTOR_RETRY: RetryOptions = { maxRetries: 2, budgetMs: 10_000, maxRetryAfterMs: 5_000, label: 'mentor' };

// Seam for the retry test script only: lets it record waits and drive a fake
// clock instead of really sleeping. Production never touches it.
export const __llmTestHooks = {
  sleep: (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)),
  now: () => Date.now(),
  random: () => Math.random(),
};

const deadlineScope = new AsyncLocalStorage<{ deadline: number }>();

/**
 * Runs `fn` with an LLM deadline of now + `ms` (default PIPELINE_DEADLINE_MS):
 * every OpenAI call inside it refuses to wait past that point and throws its
 * last error instead, so a background task fails cleanly before its route's
 * maxDuration rather than being killed mid-write. Nested scopes keep the
 * earlier deadline.
 */
export function withPipelineDeadline<T>(fn: () => Promise<T>, ms: number = PIPELINE_DEADLINE_MS): Promise<T> {
  const outer = deadlineScope.getStore()?.deadline ?? Infinity;
  return deadlineScope.run({ deadline: Math.min(outer, __llmTestHooks.now() + ms) }, fn);
}

type ErrorClass = 'rate_limit' | 'quota' | 'transient' | 'fatal';

function statusOf(error: unknown): number | undefined {
  const status = (error as { status?: unknown })?.status;
  return typeof status === 'number' ? status : undefined;
}

function classify(error: unknown): ErrorClass {
  const status = statusOf(error);
  if (status === 429) {
    const e = error as { code?: unknown; error?: { code?: unknown } };
    return e.code === 'insufficient_quota' || e.error?.code === 'insufficient_quota' ? 'quota' : 'rate_limit';
  }
  if (status === 408 || status === 409 || (status !== undefined && status >= 500)) return 'transient';
  if (status === undefined && error instanceof OpenAI.APIConnectionError) return 'transient';
  return 'fatal';
}

/** True for a 429 rate limit (not insufficient_quota) — callers can show a "busy" message. */
export function isRateLimitError(error: unknown): boolean {
  return classify(error) === 'rate_limit';
}

/** Wait the server asked for via retry-after-ms / retry-after, if any (unpadded). */
function retryAfterMs(error: unknown): number | undefined {
  const headers = (error as { headers?: { get?: (name: string) => string | null } })?.headers;
  const ms = Number(headers?.get?.('retry-after-ms'));
  if (Number.isFinite(ms) && ms > 0) return ms;
  const raw = headers?.get?.('retry-after');
  if (raw) {
    const seconds = Number(raw);
    if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
    const date = Date.parse(raw);
    if (Number.isFinite(date)) return Math.max(0, date - __llmTestHooks.now());
  }
  return undefined;
}

function backoffMs(retry: number): number {
  return Math.min(1000 * 2 ** retry + Math.floor(__llmTestHooks.random() * 500), MAX_BACKOFF_MS);
}

export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_429_RETRIES;
  const budgetMs = options.budgetMs ?? DEFAULT_BUDGET_MS;
  const deadline = options.deadline ?? deadlineScope.getStore()?.deadline;
  const label = options.label ?? 'openai call';
  let rateLimitRetries = 0;
  let transientRetries = 0;
  let waited = 0;

  for (;;) {
    try {
      return await fn();
    } catch (error) {
      const kind = classify(error);
      if (kind === 'quota' || kind === 'fatal') throw error;

      const askedRaw = retryAfterMs(error);
      const asked = askedRaw === undefined ? undefined : askedRaw + RETRY_AFTER_PADDING_MS;
      let wait: number;
      let attempt: string;
      if (kind === 'rate_limit') {
        if (rateLimitRetries >= maxRetries) throw error;
        if (askedRaw !== undefined && options.maxRetryAfterMs !== undefined && askedRaw > options.maxRetryAfterMs) {
          console.warn(`[llm] ${label}: 429, retry-after ${askedRaw}ms exceeds this call's ${options.maxRetryAfterMs}ms limit — not retrying`);
          throw error;
        }
        wait = asked ?? backoffMs(rateLimitRetries);
        rateLimitRetries++;
        attempt = `${rateLimitRetries}/${maxRetries}`;
      } else {
        if (transientRetries >= MAX_TRANSIENT_RETRIES) throw error;
        wait = asked ?? backoffMs(transientRetries);
        transientRetries++;
        attempt = `${transientRetries}/${MAX_TRANSIENT_RETRIES}`;
      }

      if (waited + wait > budgetMs) {
        console.warn(`[llm] ${label}: ${kind} (status ${statusOf(error) ?? 'none'}), next wait ${wait}ms would exceed the ${budgetMs}ms retry budget — giving up`);
        throw error;
      }
      if (deadline !== undefined && __llmTestHooks.now() + wait > deadline) {
        console.warn(`[llm] ${label}: ${kind} (status ${statusOf(error) ?? 'none'}), next wait ${wait}ms would pass the pipeline deadline — giving up`);
        throw error;
      }
      console.warn(`[llm] ${label}: ${kind === 'rate_limit' ? '429 rate limit' : `transient error (status ${statusOf(error) ?? 'connection'})`}, retry ${attempt} in ${wait}ms`);
      await __llmTestHooks.sleep(wait);
      waited += wait;
    }
  }
}

export async function getChatCompletion(options: {
  messages: ChatCompletionMessageParam[];
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: 'json_object' };
  model?: string;
  seed?: number;
  retry?: RetryOptions;
}): Promise<string | null> {
  const response = await withRetry(() => client.chat.completions.create({
    model: options.model ?? process.env.OPENAI_MODEL ?? 'gpt-4o',
    messages: options.messages,
    ...(options.temperature !== undefined && { temperature: options.temperature }),
    ...(options.max_tokens !== undefined && { max_tokens: options.max_tokens }),
    ...(options.response_format && { response_format: options.response_format }),
    // OpenAI-specific best-effort determinism parameter (see docs/standards/product-decisions.md's
    // LLM-agnostic requirement) — a future non-OpenAI adapter can omit or no-op this field
    // without changing getChatCompletion's signature or any call site.
    ...(options.seed !== undefined && { seed: options.seed }),
  }), options.retry);

  return response.choices[0]?.message?.content ?? null;
}

export type ChatCompletionUsage = {
  prompt_tokens: number;
  completion_tokens: number;
  cached_tokens: number;
};

/**
 * #154: same call as getChatCompletion, but also returns token usage
 * (including prompt-cache hits) and finish_reason. Used by Layer 3 of
 * identity report generation. Retries go through withRetry like every other
 * call (#155).
 */
export async function getChatCompletionDetailed(options: {
  messages: ChatCompletionMessageParam[];
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: 'json_object' };
  model?: string;
  retry?: RetryOptions;
}): Promise<{ content: string | null; finish_reason: string | null; usage: ChatCompletionUsage }> {
  const response = await withRetry(() => client.chat.completions.create({
    model: options.model ?? process.env.OPENAI_MODEL ?? 'gpt-4o',
    messages: options.messages,
    ...(options.temperature !== undefined && { temperature: options.temperature }),
    ...(options.max_tokens !== undefined && { max_tokens: options.max_tokens }),
    ...(options.response_format && { response_format: options.response_format }),
  }), options.retry);

  return {
    content: response.choices[0]?.message?.content ?? null,
    finish_reason: response.choices[0]?.finish_reason ?? null,
    usage: {
      prompt_tokens: response.usage?.prompt_tokens ?? 0,
      completion_tokens: response.usage?.completion_tokens ?? 0,
      cached_tokens: response.usage?.prompt_tokens_details?.cached_tokens ?? 0,
    },
  };
}
