# Ticket #72 — Retry generation doesn't work for State-3-originated users

## Problem

`kickoffIdentityGeneration(user)` (`lib/kickoff-identity-generation.ts`) derives
its answers exclusively from `user.user_metadata.discovery_answers`. Users who
completed the questionnaire via #20's State 3 (already authenticated, answers
submitted through `POST /api/complete-discovery`) never have
`discovery_answers` in their auth metadata — only in the `discovery_answers`
DB table.

If their `identity_report` generation fails, `/identity`'s "Try again" button
calls `POST /api/retry-generation` → `kickoffIdentityGeneration(user)`. The
`rawAnswers.length === 0` guard (added in #20 to stop garbage rows) sees zero
metadata answers and returns `false` immediately — silently, forever, even
though real `discovery_answers` rows exist in the DB for that user.

`kickoffIdentityGeneration` has exactly two callers:
- `app/api/retry-generation/route.ts`
- `app/auth/callback/route.ts` (fires in the background on every login)

## Fix

Inside `kickoffIdentityGeneration`, when `rawAnswers.length === 0`: after the
existing `profiles` upsert, query `discovery_answers` for `user.id` before
giving up.

- If the DB also has zero rows (a genuine State-1/2 user who hasn't
  completed the questionnaire, or a fresh signup) → return `false` as today.
  No behavior change for this case.
- If DB rows exist → map them into `DiscoveryAnswer[]` (`question_number`,
  `question_text` from `QUESTIONS`, `answer_text`) — same shape the metadata
  path already builds a few lines below — and call `completeDiscovery(user.id,
  answers, name)`, same as the metadata path does.

`completeDiscovery` is already idempotent with respect to inserting
`discovery_answers` (it skips the insert if rows already exist for the user),
so calling it with DB-sourced answers that are already in the table is safe —
it'll skip straight to the failed-row cleanup + fresh `identity_report`
insert + background generation.

### Why fixing `kickoffIdentityGeneration` itself (not just the retry route)

Both callers share this one function. Signup users hitting `/auth/callback`
for the first time will still have zero DB rows at that point too (they
haven't submitted anything yet), so the new DB check is a harmless no-op for
them — the fallback only ever actually fires for the State-3 retry case it's
meant to fix. Fixing it once here is more consistent with existing
single-source-of-truth discipline than duplicating the DB-fallback logic
into the retry route only.

### Optional cleanup (judgment call for whoever implements)

The DB-row-to-`DiscoveryAnswer[]` mapping (`question_number`/`question_text`
from `QUESTIONS`/`answer_text`) will now exist in two places in this file
(the existing metadata-path mapping, and the new DB-fallback mapping). If it's
a clean, low-risk extraction, pull it into a small shared helper (in
`lib/kickoff-identity-generation.ts` itself, or `lib/identity-questions.ts`
alongside `mergeAnswersWithQuestions`, if that avoids awkward imports —
`DiscoveryAnswer`'s type currently lives in
`lib/generate-identity-report.ts`, so check for import-cycle risk before
moving it). Not required — inlining the second mapping is also fine — just
don't fix without being asked. Log whichever choice you make in the
changelog Decisions section.

## Explicit stop conditions

- Do not touch `/api/complete-discovery` or `completeDiscovery` itself —
  they're correct as-is; this is purely about `kickoffIdentityGeneration`'s
  own answer-sourcing.
- Do not touch the `rawAnswers.length === 0` guard's existing behavior for
  the true "no answers anywhere" case — it must still return `false` and
  skip artifact creation.
- No UI changes. The "Try again" button on `/identity` already calls
  `/api/retry-generation`; nothing about that call site changes.

## Verification

- Live-verify via the `/run` project skill (magic-link bootstrap +
  Playwright, per #49): seed a test user with `discovery_answers` DB rows but
  no `user_metadata.discovery_answers` (simulating a State-3 user whose
  generation failed — e.g. seed rows directly, ensure no live
  `identity_report` artifact exists), call `POST /api/retry-generation`,
  confirm `{ started: true }` and that exactly one new `identity_report` row
  (`status: 'generating'`) is created from the DB-sourced answers.
- Regression: confirm a genuinely fresh user (zero DB rows, zero metadata
  answers) still gets `{ started: false }` with no artifact row created.
- Regression: confirm the existing metadata-sourced path (normal signup
  flow) is unaffected — run the standard `/auth/callback` kickoff scenario
  and confirm identical behavior to before this change.
- `npx tsc --noEmit` and `npm run build` clean.
- Teardown all seeded test users per the standard verification-session
  pattern.

## Changelog

Standard dated entry: what changed, the extraction decision (if any), and
verification results. Note that this closes the gap flagged during #20's
2026-07-23 session 2 (see that entry's Decisions section).
