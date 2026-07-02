# Brief: Document single-adapter rule for LLM calls

## Context

Six places in the codebase independently instantiate the OpenAI client and
call `.chat.completions.create()`. The existing "model name from env"
decision was honored everywhere, but nothing ever required a single call
site, so each new feature added its own. This adds that rule to
`docs/standards/coding-standards.md` so both Claude Code and the planning
surface have something concrete to check new work against — ahead of
ticket #47, which will do the actual consolidation into `lib/llm.ts`.

## Stop conditions

- Only add the new section below to `docs/standards/coding-standards.md`.
  Don't touch any other section of that file, or any other file.
- Insert it as a new `##` section directly after the existing
  `## Database / Supabase` section, before the closing
  `For session start protocol, see AGENTS.md.` line.
- Don't summarize or paraphrase — insert the section exactly as given.
- Show the diff before committing.

## Task

Insert this section into `docs/standards/coding-standards.md`, after
`## Database / Supabase` and before the closing session-start-protocol
line:

```markdown
## LLM calls
- All calls to the LLM provider go through `lib/llm.ts` — never
  instantiate the provider client or call its completion method
  directly in a route or lib file
- If `lib/llm.ts` doesn't exist yet, this rule takes effect once
  ticket #47 lands it; new code in the meantime should still avoid
  adding another independent call site
- Model name is read from env (`OPENAI_MODEL`, default `gpt-4o`) —
  never hardcoded
```
