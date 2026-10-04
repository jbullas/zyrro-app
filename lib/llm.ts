import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function getChatCompletion(options: {
  messages: ChatCompletionMessageParam[];
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: 'json_object' };
  model?: string;
  seed?: number;
}): Promise<string | null> {
  const response = await client.chat.completions.create({
    model: options.model ?? process.env.OPENAI_MODEL ?? 'gpt-4o',
    messages: options.messages,
    ...(options.temperature !== undefined && { temperature: options.temperature }),
    ...(options.max_tokens !== undefined && { max_tokens: options.max_tokens }),
    ...(options.response_format && { response_format: options.response_format }),
    // OpenAI-specific best-effort determinism parameter (see docs/standards/product-decisions.md's
    // LLM-agnostic requirement) — a future non-OpenAI adapter can omit or no-op this field
    // without changing getChatCompletion's signature or any call site.
    ...(options.seed !== undefined && { seed: options.seed }),
  });

  return response.choices[0]?.message?.content ?? null;
}

export type ChatCompletionUsage = {
  prompt_tokens: number;
  completion_tokens: number;
  cached_tokens: number;
};

/**
 * #154: same call as getChatCompletion, but also returns token usage
 * (including prompt-cache hits) and finish_reason, and lets the caller turn
 * off the SDK's built-in retries so it can run its own 429 backoff. Used by
 * Layer 3 of identity report generation only; every other call site keeps
 * getChatCompletion unchanged.
 */
export async function getChatCompletionDetailed(options: {
  messages: ChatCompletionMessageParam[];
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: 'json_object' };
  model?: string;
  maxRetries?: number;
}): Promise<{ content: string | null; finish_reason: string | null; usage: ChatCompletionUsage }> {
  const response = await client.chat.completions.create(
    {
      model: options.model ?? process.env.OPENAI_MODEL ?? 'gpt-4o',
      messages: options.messages,
      ...(options.temperature !== undefined && { temperature: options.temperature }),
      ...(options.max_tokens !== undefined && { max_tokens: options.max_tokens }),
      ...(options.response_format && { response_format: options.response_format }),
    },
    options.maxRetries !== undefined ? { maxRetries: options.maxRetries } : undefined,
  );

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
