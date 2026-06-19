# Brief: Single-source the identity-report generation pipeline

## Why
The report prompts are about to change significantly. Right now the report's
prompts + generation logic live in two places: the app, and the standalone rescue
script (which pasted its own copies). Two copies = drift the moment the prompts
change. Goal: one home for the report prompts AND the generation logic, used by
both the app and the rescue tool.

This mirrors a pattern already in the repo: path-plan generation lives in
`lib/generate-path-plan.ts`. Identity-report generation is the odd one out —
still inline in the route. This brief makes it consistent.

## Scope
ONLY the identity-report generation pipeline and the rescue script. Do NOT touch
the prompts' contents, generation behaviour, the after()/maxDuration fix, the
open-access flag, path-options/path-plan, billing, or route-hardening.

## Change 1 — extract the pipeline into a shared module
- Create `lib/generate-identity-report.ts`, mirroring the shape of
  `lib/generate-path-plan.ts`. Move the body of `runGeneration` (the two-step
  detection → report flow, model params, JSON parse, and the artifact status
  update to 'ready'/'failed') out of `app/api/generate-report/route.ts` into an
  exported function, e.g. `generateIdentityReport({ artifactId, answers, name })`.
- It keeps importing the prompts from `lib/prompts/identity-analysis` and
  `lib/prompts/identity-report` (the single source) — do NOT inline them.
- Self-contained re: clients: it creates its own Supabase service client and
  OpenAI client from env, same as `generate-path-plan.ts`.
- Behaviour must be identical to today: same model (`OPENAI_MODEL ?? 'gpt-4o'`),
  same `response_format`, same `max_tokens` (4000 / 8000), same temperature, same
  two-step order, same status updates. This is a move, not a rewrite.

## Change 2 — route calls the shared function
- `app/api/generate-report/route.ts`: remove the inline `runGeneration`, import
  `generateIdentityReport`, and call it inside the existing
  `after(() => generateIdentityReport({ artifactId, answers, name }))`.
- Leave the rest of the route unchanged: body validation, profile upsert,
  discovery_answers insert, artifact find/create + set 'generating',
  `export const maxDuration = 60`, the `after` import, the return.

## Change 3 — rescue tool uses the same source (no copies)
- Convert `scripts/rescue-report.mjs` → `scripts/rescue-report.ts`.
- Remove ALL inline prompt text and generation logic from it. It must import and
  call `generateIdentityReport` from the shared module — the SAME code path the
  app uses.
- Keep the script's own safety logic in the script: look up user by email; on
  `--info` print user_id, name, answer count, artifact status and write nothing;
  regenerate only if answers are complete AND artifact status is
  'generating'/'failed'; refuse and report if already 'ready' or answers
  incomplete.
- Make it runnable with env vars from `.env.local`. Use `tsx` so it can import the
  app's TypeScript and resolve the `@/` path alias from tsconfig. Add `tsx` to
  devDependencies. Put the exact run command in the script's header comment.

## Verify (single source)
- Grep the repo: `DETECTION_PROMPT` / `LAYER_2_PROMPT` and the report generation
  logic each appear in exactly ONE place. The script contains NO prompt text and
  NO generation logic of its own — only a call into the shared module.

## Acceptance
- App: a fresh signup still produces a correct report via route → shared function
  (same output shape as before).
- Rescue: `scripts/rescue-report.ts <email> --info` still works via the shared
  module (use `--info` so it writes nothing), with no copies left in the script.
- Build clean; the script typechecks.
- Show the full diff. Don't commit until reviewed.

## Note (out of scope — track for later)
`generate-path-options` generation is also still inline in its route (not a lib).
If you ever want the same single-source treatment there, it's a separate task —
not part of this brief.
