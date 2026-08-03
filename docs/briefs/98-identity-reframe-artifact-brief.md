# #98 — New `identity_reframe` artifact: restructure /identity + /path pitch

## Problem

`recap`/`meaning`/`reframe`/`why` currently live inside `path_options`, generated
in one call only after payment. This causes two problems: (1) a paying user's
first view of `/path` repeats content that's about to be superseded by the
actual payoff (the 4 options), and (2) the free tier's only conversion pitch
is static, generic `LimitsBlock` copy — identical for every user — when real,
evidence-grounded content already exists and is far more persuasive.

Real-user review (2026-08-03, 7 users) also surfaced content-quality problems
in this text (jargon, wall-of-text presentation) — those are **out of scope
here**, tracked separately under #99. This brief is structural only: move the
content, change when/where it's generated, change what each page shows.

## Decision log (context for whoever picks this up)

- Full reveal, not teaser — the evidence backing `why` is what makes the pitch
  believable, not optional flavor to hold back.
- `recap` stays in on both `/identity` and `/path` — the original redundancy
  concern (sitting right next to `constellation_synthesis`) doesn't apply at
  this position (Section 11, with Sections 7–10 as buffer).
- Pitch replaces `LimitsBlock` at the very end of `/identity` (Section 11),
  not mid-report.
- Generation fires from a dedicated route (`POST /api/generate-identity-reframe`),
  triggered client-side the moment `/identity` finishes rendering the report —
  not chained inside `generateIdentityReport`'s own background job. Same
  fire-and-forget/idempotent-insert shape as `generate-path-options` today,
  just unpaid. This avoids running a second `after()` from inside a function
  that's already executing inside one (see "Generation trigger" below), and
  keeps `generate-identity-report.ts` focused on identity data only — it has
  no knowledge of `identity_reframe` at all.
- **Section 11 is click-gated, not always-visible.** A "What does this
  mean?" (placeholder copy) link/CTA sits at the end of the report; the
  pitch content only renders once clicked. Generation still starts eagerly
  in the background the moment the report renders (unchanged) — the click
  gates *visibility*, not generation — so in the normal case (reading
  Sections 0–10 takes longer than generation does) the content is already
  `ready` by the time someone clicks, and it feels instant. A spinner only
  shows up for the edge case of someone clicking unusually fast. Rationale
  beyond UX: an explicit click is also a real, cheap engagement signal
  (click-through rate on this CTA) that a permanently-visible section can't
  give you — worth logging even ahead of #73 (GA4). The underlying bet —
  that click-gating itself improves conversion via active engagement vs.
  passive scroll-past — is a real hypothesis, not a settled fact; this
  design costs nothing either way and makes the bet testable.
- Each page must render `identity_reframe`'s fields as its own explicit list
  (not one shared always-show-all-four component) — so dropping/adjusting a
  field on one page later is a one-line change, not a refactor.

## Schema

New type, `lib/artifact-schemas.ts`. Deliberately just the four fields that
exist today — the this/therefore hook and any renamed sections are #99's
concern and get added as new fields once that content work is settled, so
this ticket's risk stays confined to structure, not new content design.

```ts
// New artifact type: "identity_reframe"
export interface IdentityReframeArtifactContent {
  recap: string;
  meaning: string;
  reframe: string;
  why: string;
}
```

`lib/artifacts.ts`:
```ts
export type ArtifactType = 'identity_report' | 'identity_reframe' | 'path_options' | 'path_plan';
```

`PathOptionsArtifactContent` (same file) drops `recap`/`meaning`/`reframe`/`why`,
becomes options-only:
```ts
export interface PathOptionsArtifactContent {
  options: PathOption[]; // exactly 4
}
```

## Migration

Follow the exact precedent set for `path_options`/`path_plan` (#71) — one
artifact type, one partial unique index scoped to `status = 'generating'`,
same shape as `identity_report`'s own index (this is a one-per-user artifact,
not selection-scoped like `path_plan`):

```sql
-- Extend artifact type constraint
ALTER TABLE public.artifacts
  DROP CONSTRAINT IF EXISTS artifacts_type_check;

ALTER TABLE public.artifacts
  ADD CONSTRAINT artifacts_type_check
    CHECK (type IN ('identity_report', 'identity_reframe', 'path_options', 'path_plan'));

-- Race guard, same pattern as artifacts_one_identity_report_per_user
CREATE UNIQUE INDEX IF NOT EXISTS artifacts_one_identity_reframe_generating_per_user
  ON public.artifacts (user_id)
  WHERE type = 'identity_reframe' AND status = 'generating';
```

No `access_level` distinction needed — `identity_reframe` is always `'free'`
(it's pre-payment by definition); `path_options` stays `'paid'` as it is today.

## New prompt file

`lib/prompts/identity-reframe.ts` — new file, not an extension of
`path-options.ts`. Content: adapt the existing `recap`/`meaning`/`reframe`/`why`
sections straight out of `PATH_OPTIONS_PROMPT` with no wording changes (#99
handles wording later) — just remove the `options` section and its validation
rules from the prompt entirely, since this call no longer produces them.

## Generation trigger — dedicated route, client-triggered

Rejected alternative worth recording: chaining `identity_reframe`'s kickoff
directly inside `generateIdentityReport()`'s own success path. That would
mean firing it from code that's already executing inside an `after()`
background job — a second `after()` nested inside the first doesn't have a
request to attach to at that point and is either a no-op or an error, so it'd
have to run as a plain awaited call instead. Rejected because it also
couples `generate-identity-report.ts` (identity data only) to a second
artifact type's pipeline, and delays nothing meaningful since the client
wasn't waiting on it anyway.

Instead: new route, **`POST /api/generate-identity-reframe`** — same shape as
`POST /api/generate-path-options` today, minus the entitlement check (this
is free, unpaid content):

- Requires an authenticated session.
- Fetches the current `identity_report` artifact (`status: 'ready'`); 404 if
  not found.
- Idempotency: if a live (`generating` or `ready`) `identity_reframe`
  artifact already exists for this user, return its id without re-inserting
  — same guard shape as `completeDiscovery`.
- Deletes any prior `failed` `identity_reframe` row (noise, not history —
  same cleanup `path_options` already does).
- INSERTs a new `identity_reframe` row (`status: 'generating'`), guarded by
  the partial unique index above; on a `23505` race loss, reuse the winning
  row's id rather than erroring.
- Fires generation via `after()` (this route is a fresh HTTP request, not
  code already running inside a background job — `after()` here works
  exactly like it does in `generate-path-options` today) and returns
  `{ artifact_id }` immediately.

`runIdentityReframeGeneration` (the function `after()` calls) mirrors
`runGeneration` in today's `generate-path-options/route.ts`: single
`getChatCompletion` call with the new prompt as system message, the identity
report JSON as user message, `temperature: 0`, parse + minimal structural
validation (all four fields present and non-empty — matching today's
`validatePathOptions` bar, no more), update to `ready`/`failed`.

**Trigger point on the client**: `/identity` fires this `POST` once, the
moment the identity report itself finishes rendering (not on page load,
not gated on scroll position, and not gated on the click either —
generation and reveal are decoupled). It then separately polls
`identity_reframe`'s status in the background. A "What does this mean?"
CTA sits at the end of the report (replacing what would otherwise be
Section 11's default-visible spot); clicking it reveals the section —
rendering the already-`ready` content immediately in the common case, or a
brief spinner if generation genuinely hasn't finished yet by the time of
the click.

## Route changes

**`app/api/generate-identity-reframe/route.ts`** (new) — see "Generation
trigger" above for full detail. Needs `export const maxDuration = 240` set
explicitly (matching the other five generation routes — this becomes the
sixth). `lib/generation-status.ts` has a comment hardcoding "the five
generation routes" by name; update it to list six, so it doesn't drift out
of sync with reality.

**`app/api/generate-path-options/route.ts`** — becomes options-only:
- Still requires `hasPaidEntitlement` (unchanged — options remain paid).
- Still fetches `identity_report` as before.
- **New**: also fetches the current `identity_reframe` artifact (`status: 'ready'`)
  and passes it alongside the identity report in the user message, so the
  options generation has the pitch's `reframe`/`why` as context and doesn't
  contradict what the user already read. If no ready `identity_reframe`
  exists (shouldn't happen in practice since it's eager off identity
  completion, but the route should handle it defensively — e.g. 409/retry
  rather than silently generating options with no reframe context).
- Prompt input to `getChatCompletion` drops the full `recap`/`meaning`/`reframe`/`why`
  generation instructions (now only in `identity-reframe.ts`), keeps only the
  options-generation portion of what's currently in `path-options.ts`.
- **`validatePathOptions()` needs its `recap`/`meaning`/`reframe`/`why` check
  removed** (currently `if (!d?.recap || !d.meaning || !d.reframe || !d.why) return false;`)
  — left as-is, this would reject every valid options-only response outright,
  since this call no longer produces those fields at all.

## Page changes

**`app/identity/page.tsx`** — Section 11 (`LimitsBlock`) is replaced by a
"What does this mean?" CTA (placeholder copy — final wording TBD, possibly
part of #99) at the end of the report. Generation fires eagerly in the
background as soon as the report renders (see "Generation trigger" above),
independent of the click. Clicking the CTA reveals `identity_reframe`'s
four fields (in order: recap, meaning, reframe, why) plus a payment CTA
reusing the same checkout flow `/path`'s current unpaid offer page uses —
in the common case this renders instantly since generation had a head
start; a brief spinner covers the edge case where it hasn't finished yet.
Worth logging the CTA click itself as an event (even simple server-side
logging ahead of #73/GA4) — it's the first real engagement signal this
page will have.

**`app/path/page.tsx`** — the `'unpaid'` page state (currently the static
offer page with `OFFER_FEATURES`) is replaced with a render of the same
`identity_reframe` artifact, different header/eyebrow copy than `/identity`'s
version but identical field content, same CTA → `handleCheckout` (already
implemented, no changes needed there). Generation is triggered the same
unconditional way `/identity` triggers it (no click gate here — the pitch
*is* the page) — call `POST /api/generate-identity-reframe` if no artifact
exists yet, then poll; spinner while `generating`, content once `ready`.

**New explicit state: no `identity_report` yet.** Today's `init()` doesn't
actually gate on this — it tries to read `identity_report` for the headline's
named-identity string, and if none exists (`status: 'ready'` returns
nothing), that lookup just silently resolves to `null` and the generic
static offer page renders anyway, headline included. That's an accidental
graceful-degradation, not a deliberate gate, and it stops working once the
unpaid state renders real `identity_reframe` content — that content can't
exist without `identity_report`, so there's nothing to gracefully fall back
to. Add this as an explicit check before the existing entitlement check:
if no `identity_report` in `status: 'ready'` exists for this user, show a
distinct state (same pattern as the existing `'anonymous'` state) directing
them to finish the questionnaire — not a spinner (nothing is generating,
nothing can start yet) and not the pitch/offer page.

The `'has-artifact'`/ready state (paid, post-payment) drops the
`recap`/`meaning`/`reframe`/`why` destructuring and render entirely —
`pathOptions` now only contains `options`, so this section simplifies
rather than grows.

## Explicitly out of scope for this ticket

- Any wording/prompt-quality change to `recap`/`meaning`/`reframe`/`why` — #99.
- The this/therefore hook — new fields, added in #99 once content is settled.
- Section renaming/relabeling on the page — #99.
- `#25`'s options-genericness work — separate, `path_options` only.
