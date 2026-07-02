# Brief: #47 — Centralize LLM calls into lib/llm.ts

## Context

Six places instantiate the OpenAI client and call `.chat.completions.create()`
directly: `app/api/generate-path-options/route.ts`,
`app/api/generate-project-name/route.ts`, `app/api/mentor/route.ts`,
`lib/conversation-bundle.ts`, `lib/generate-identity-report.ts` (two calls),
`lib/generate-path-plan.ts`. `docs/standards/coding-standards.md` already
states the rule this brief implements: all provider calls go through
`lib/llm.ts`.

This is a pure mechanical extraction — no prompts, token limits,
temperatures, JSON parsing, validation, or error-handling logic change
anywhere. Behavior after this brief must be identical to before it.

## Stop conditions

- Don't change any prompt content, `max_tokens`, `temperature`, or
  `response_format` values at any of the six call sites — carry them over
  exactly as they are today.
- Don't change JSON parsing, validation functions (`validatePathOptions`,
  `validatePathPlan`, `validateProjectNameOptions`), DB update calls, or
  try/catch structure at any call site.
- Don't touch prompt files, `lib/entitlements.ts`, or anything outside the
  seven files listed (six call sites + the new `lib/llm.ts`).
- Keep the existing `if (!apiKey) return 500` guard in
  `app/api/mentor/route.ts` exactly where it is — don't move it into
  `lib/llm.ts`.
- Show the diff for each file before committing.

## Task

### 1. Create `lib/llm.ts`

```ts
import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function getChatCompletion(options: {
  messages: ChatCompletionMessageParam[];
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: 'json_object' };
  model?: string;
}): Promise<string | null> {
  const response = await client.chat.completions.create({
    model: options.model ?? process.env.OPENAI_MODEL ?? 'gpt-4o',
    messages: options.messages,
    ...(options.temperature !== undefined && { temperature: options.temperature }),
    ...(options.max_tokens !== undefined && { max_tokens: options.max_tokens }),
    ...(options.response_format && { response_format: options.response_format }),
  });

  return response.choices[0]?.message?.content ?? null;
}
```

Note the `null` return (not `''`) — this exactly preserves every existing
call site's `content ?? '{}'` / `content ?? 'No response.'` fallback
behavior, since `??` treats `null` and `undefined` the same way.

### 2. Migrate all six call sites

At each of the six call sites:

- Remove `import OpenAI from 'openai'` and the local
  `const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })` (or
  `const client = new OpenAI({ apiKey })` in the mentor route).
- Add `import { getChatCompletion } from '@/lib/llm'`.
- Replace `openai.chat.completions.create({...})` /
  `client.chat.completions.create({...})` with
  `await getChatCompletion({...})`, passing through the same `messages`,
  `temperature`, `max_tokens`, and `response_format` values that are
  already there today.
- Keep `response.choices[0]?.message?.content` usage as-is at call sites —
  just rename `response` to whatever variable holds the returned string
  (it's now the string directly, not a response object), and update the
  one line that extracts content accordingly (e.g.
  `const options = JSON.parse(content ?? '{}')` instead of
  `JSON.parse(response.choices[0]?.message?.content ?? '{}')`).

Specific note for `app/api/mentor/route.ts`: `runChat(client, systemPrompt,
messages)` currently takes an `OpenAI` client as its first argument. Drop
that parameter — `runChat(systemPrompt, messages)` — since it no longer
needs a client passed in; it calls `getChatCompletion` directly. Update the
call site in `POST` accordingly (remove `const client = new OpenAI({
apiKey })` and the client argument).

`lib/generate-identity-report.ts` has two calls in sequence (Step A, Step
B) — migrate both, independently, keeping their different `max_tokens`
values (4000 and 8000) and prompts untouched.
