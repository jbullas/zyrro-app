# Brief: #106 (staged discovery answers) + #105 (5000-char limit)

## Context

`app/start/page.tsx`'s `handleContactSubmit` currently passes all 13 discovery
answers into Supabase `signUp()`'s `data` option. Supabase encodes that into
`user_metadata`, which is embedded directly in the session JWT/auth cookie.
With answers approaching the old 1000-char cap, the resulting cookie exceeds
Vercel's request header size limit, causing a 494 `REQUEST_HEADER_TOO_LARGE`
error on `/auth/callback`'s redirect (and the request that follows it) —
blocking the user from ever reaching `/identity` after confirming their
email. Live-reproduced 2026-08-08.

Fix direction (Option A, decided 2026-08-08): stop passing raw answers
through auth metadata at all. Stage them server-side under a small token
before `signUp()`, then resolve that token to the real rows once the user is
authenticated. This decouples answer size from cookie size entirely, so it
also removes the only reason the 1000-char cap existed — raise it to a
generous safety-net ceiling (5000 chars) rather than a real constraint.

## Ticket #106 — Stage discovery answers, don't put them in auth metadata

### New table: `pending_discovery_answers`

New migration file (`supabase/migrations/<timestamp>_pending_discovery_answers.sql`):

```sql
CREATE TABLE IF NOT EXISTS public.pending_discovery_answers (
  id          uuid        NOT NULL DEFAULT gen_random_uuid(),
  answers     jsonb       NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT pending_discovery_answers_pkey PRIMARY KEY (id)
);
```

- No RLS policies — this table is accessed only via the service-role client
  (same pattern already used in `lib/kickoff-identity-generation.ts`), never
  from the browser. There is no authenticated user to scope RLS to at
  insert time by design.
- `id` doubles as the opaque token passed through `signUp()`'s metadata.
- `answers` stores the same shape as today's `discoveryAnswers` array:
  `{ question_number: number, answer_text: string }[]`.

### New API route: `POST /api/stage-discovery-answers`

- Accepts the 13 `{ question_number, answer_text }` pairs (same shape
  `handleContactSubmit` already builds today from localStorage).
- Uses a service-role Supabase client (no user session exists yet) to
  insert one row into `pending_discovery_answers`, returning `{ id }`.
- No auth check — this route is intentionally reachable pre-signup. Validate
  shape (13 entries, `question_number` 1–13, `answer_text` is a string) and
  reject anything malformed with 400, rather than trusting the client blindly.

### `app/start/page.tsx` — `handleContactSubmit` changes

Replace the current flow (parse localStorage → clip to 1000 → pass into
`signUp()`'s `data.discovery_answers`) with:

1. Parse localStorage as today (still stripping `question_text`, still
   clipping each `answer_text` — now to 5000, see #105 below).
2. `POST` that array to `/api/stage-discovery-answers`, get back `{ id }`.
3. Call `signUp()` with `data: { display_name: name, discovery_token: id }`
   — **no `discovery_answers` key at all**.
4. On staging-request failure, surface the same `contactError` pattern
   already used for `signUp()` failures — don't call `signUp()` if staging
   failed.

### `lib/kickoff-identity-generation.ts` changes

This is the single read site (also covers `/api/retry-generation`, which
calls through it — same precedent as #72).

Replace:
```ts
const rawAnswers = (user.user_metadata?.discovery_answers ?? []) as Array<{...}>;
```
with a token-based lookup:
- Read `user.user_metadata?.discovery_token` (string | undefined).
- If present: fetch the row from `pending_discovery_answers` by `id` via the
  service-role client, use `row.answers` as `rawAnswers`, then **delete the
  row** after successful read (raw free-text shouldn't sit indefinitely in
  an unowned table).
- If the token is present but the row doesn't resolve (already consumed,
  or never staged — e.g. expired/cleaned up in the future), fall through to
  the existing `rawAnswers.length === 0` branch untouched — same graceful
  fallback State-3 users already get today, no new error path.
- If no token at all (State-3 users, who never had one), behavior is
  unchanged from today.

### Out of scope, explicitly

- No cleanup job for orphaned `pending_discovery_answers` rows (users who
  stage answers but never confirm their email). Low priority, no PII risk
  beyond free-text answers, worth its own ticket later — don't build it now.
- No change to State 3's flow (`/api/complete-discovery`) — already
  DB-driven, never touched auth metadata.

## Ticket #105 — Raise the character limit to 5000, fix silent truncation

### `app/start/page.tsx` changes

- `updateAnswer`: change `value.slice(0, 1000)` → `value.slice(0, 5000)`.
- `handleFinishState3`'s payload mapping: `.slice(0, 1000)` → `.slice(0, 5000)`.
- `handleContactSubmit`'s parsed-answer mapping: `.slice(0, 1000)` →
  `.slice(0, 5000)`.
- Character counter UI: `{currentAnswer.length}/1000` → `{currentAnswer.length}/5000`.
- Counter warning threshold (`>= 900` triggers `char-counter--limit` class):
  scale proportionally to `>= 4500` (90% of new cap, same ratio as before).

No other files reference the 1000 figure (confirmed via bundle grep) — this
is a contained, cosmetic-plus-constant change with no schema impact.

## Stop conditions

- If `pending_discovery_answers` insert or lookup ever needs RLS (e.g. a
  future requirement to expose it to a client), stop and flag rather than
  improvising a policy — the no-RLS design here is deliberate, based on
  today's server-only access pattern.
- If any other file besides the three listed above turns out to reference
  `user_metadata.discovery_answers` or the 1000 constant, stop and flag
  before editing it — the file list here was confirmed against the current
  bundle, not assumed.
