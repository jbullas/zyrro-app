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
