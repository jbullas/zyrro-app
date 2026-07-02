# Brief: Finalize LLM calls rule in coding-standards.md

## Context

The "LLM calls" section in `docs/standards/coding-standards.md` was written
before ticket #47 landed, so it still describes `lib/llm.ts` as not existing
yet. It also doesn't distinguish between two different kinds of "swap" that
have different costs — this brief fixes both.

## Stop conditions

- Only replace the existing `## LLM calls` section — don't touch anything
  else in the file.
- Don't summarize or paraphrase — replace with exactly the text given.
- Show the diff before committing.

## Task

Replace the current `## LLM calls` section in
`docs/standards/coding-standards.md` with:

```markdown
## LLM calls
- All calls to the LLM provider go through `lib/llm.ts` — never
  instantiate the provider client or call its completion method
  directly in a route or lib file
- Model name is read from env (`OPENAI_MODEL`, default `gpt-4o`) —
  never hardcoded. Swapping models within the same provider is a
  one-line env change.
- Swapping providers entirely (e.g. OpenAI to Anthropic) is not a
  one-line change — `lib/llm.ts` currently wraps the OpenAI SDK
  directly, so a provider swap means rewriting the inside of that one
  file. The win from centralizing calls is that it's one file to
  change, not zero-effort provider independence.
```
