# Brief: Document local Claude Code memory in AGENTS.md

## Context

Claude Code has a persistent, file-based memory mechanism at
`.claude/projects/C--Users-miros-zyrro-app/memory/`, outside the git repo
entirely. It's been in quiet use since an earlier session and holds
narrow, factual operational lessons (e.g. how to verify live Supabase
schema, how to confirm a migration was actually applied). Nothing in
`AGENTS.md` currently names this mechanism, so it's effectively invisible
to anyone reading the repo's own documentation of how sessions work. This
adds a short section naming it.

## Stop conditions

- Only add the section below to `AGENTS.md`. Don't touch any other file.
- Insert it as a new `##` section directly after the existing
  `## Planning-surface context` section (the last section in the file).
- Don't summarize or paraphrase — insert exactly as given.
- Show the diff before committing.

## Task

Append this section to `AGENTS.md`:

```markdown
## Local memory (Claude Code)

Claude Code maintains its own persistent, file-based memory outside this
repo, at `.claude/projects/C--Users-miros-zyrro-app/memory/`. It holds
narrow, factual operational lessons (e.g. how to introspect live Supabase
schema, how to confirm a migration was actually applied) — not product
decisions, not code-state facts. Code-state facts still come only from
the live repo; product/architecture decisions still live in `docs/`. This
memory is a below-the-radar operational aid, not a second source of
truth — if something in it matters for how the team works, it belongs in
`docs/` or here in `AGENTS.md` instead.
```
