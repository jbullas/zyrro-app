# AGENTS.md — Zyrro

Instructions for any AI coding agent working in this repo. `CLAUDE.md` imports this file.

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

## Branch & commits

- All work happens on `dev`. Never commit or push to `main`.
- `main` is production; `dev` is merged into `main` only when going live (Jeff's call).

## `session start`

When the user sends **`session start`**, catch up before doing anything else:
- Read the most recent entry in `docs/changelogs/` for where the last session left off and what's next.

## `session end`

When the user sends **`session end`**, wrap up:
1. Append a dated entry to `docs/changelogs/` — file `YYYY-MM-DD.md` (one per session; if today's already exists, add to it). Cover:
   - **Changed** — what was done this session.
   - **Decisions** — any decisions made, with a one-line why.
   - **Next** — what to pick up next session.
2. Commit and push to `dev`.

Changelogs are append-only history. Never edit past entries.

## Planning-surface context

- The claude.ai planning surface is blind to this repo. To refresh it, run `node scripts/make-bundle.mjs`, which writes `context-bundle.md` (gitignored) to attach to the planning chat.
- Code owns the volatile facts (routes, file structure, build status, runtime model). Don't restate them in docs — reference the code.

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
