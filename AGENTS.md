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
2. `docs/briefs/` should stay clean at all times, but the deletion
   trigger must be scoped precisely — there's no access to the ticket
   CSV, so ticket status can't be inferred from the folder alone. If
   this session read and executed a brief from `docs/briefs/`, and that
   ticket's implementation was committed and live-verified within this
   same session, delete that specific brief file in its own separate
   commit. Do not scan `docs/briefs/` for any other file — only the
   brief(s) actually used this session. Before deleting, state which
   ticket the brief belongs to and confirm explicitly that both
   conditions hold (committed + live-verified, this session), as its
   own message — then present the delete as a normal approval-gated
   command, separate from the changelog/feature commits.
3. Commit and push to `dev`.

Changelogs are append-only history. Never edit past entries.

## Definition of Done

A ticket can only be marked Done when one of these is true:

1. **Every user-facing path in its scope was actually live-verified** — not typechecked, not confirmed by diff alone. "The code is provably unchanged" is supporting evidence, never a substitute for a passing live test.
2. **Any leftover/untested piece is explicitly handed off to a different, named ticket** — logged in that ticket's description, not just mentioned in a changelog's "Next" section. A leftover only stops blocking the original ticket once it has a real ticket number owning it; a changelog note alone doesn't count as "taken over."
3. **Miroslav explicitly accepts the risk of the untested gap.** This requires his direct, logged sign-off on the specific gap — not an agent's own judgment that the risk is probably low, however well reasoned. Log it verbatim on the ticket (what's untested, and that Miroslav accepted the risk) so it's visible as a deliberate call, not a silently skipped test.

If none of these apply — some path is untested, nothing else has claimed it, and no one signed off on the risk — the ticket stays open (or gets an explicit non-Done status with a note on what's outstanding), even if a blocker like a rate limit is what's in the way.

## Planning-surface context

- The claude.ai planning surface is blind to this repo. To refresh it, run `node scripts/make-bundle.mjs`, which writes `context-bundle.md` (gitignored) to attach to the planning chat.
- Code owns the volatile facts (routes, file structure, build status, runtime model). Don't restate them in docs — reference the code.

## Live verification pass

Any live verification pass that needs an authenticated session — driving a
real page against a real (synthetic) user rather than just typechecking —
should reach for `scripts/run-verification.mts` instead of re-deriving the
bootstrap/teardown pattern by hand. It bootstraps a synthetic test user via
`generateLink` + the real `/auth/callback` route, seeds whatever artifact/
conversation rows the check needs, hands you a thin Playwright driver
(`goto`, `computedStyle`, `screenshot`), and tears the user down afterward
even if the check throws. Cross-reference CC's local memory entry
`reference_local_test_auth_bootstrap` for the manual version of this same
pattern — keep the two in sync rather than letting them drift into separate
explanations of the same thing.

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
