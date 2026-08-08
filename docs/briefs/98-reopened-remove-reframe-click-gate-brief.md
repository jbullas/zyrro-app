# Brief: #98 (reopened) — remove click gate on identity_reframe reveal

## Context

`identity_reframe` generation already fires eagerly on `/identity` — the
moment the identity report finishes rendering, independent of any click
(see the effect at `reframeFired`/`useEffect` keyed off `genPhase.phase`).
What's currently click-gated is only the *reveal* of that already-generated
content: a "What does this mean?" CTA (`LimitsBlock`) sits in front of it,
and only clicking it sets `reframeRevealed`, which every render branch below
is conditioned on.

Decided 2026-08-08: drop the reveal gate entirely. Content should render
automatically as soon as it's ready, the same unconditional pattern already
shipped and verified live on `/path`'s unpaid state (2026-08-03, #98
original). No change to generation timing, no change to `/path`, no change
to any other file — this is a single-file simplification of `/identity`'s
render logic.

## Scope: `app/identity/page.tsx` only

### Remove entirely
- `reframeRevealed` state and its setter
- `handleRevealReframe` function
- The `LimitsBlock` CTA block (currently rendered when `!reframeRevealed`)
- The `import LimitsBlock from '@/components/LimitsBlock';` line — confirmed
  this is `LimitsBlock`'s only usage in this file, so the import becomes
  dead once the block above it is removed

### Un-gate the four existing render branches

Each of the four blocks currently reads `reframeRevealed && (...)`. Drop
that half of the condition — render purely off `reframeGenPhase.phase`,
identical in shape to how the main report's own polling states already
render elsewhere in this file:

- `reframeGenPhase.phase === 'idle' || reframeGenPhase.phase === 'spinner'`
  → spinner, **plus a new one-line caption above it**: "Generating your
  next step…" (bare spinner today reads as unexplained; the CTA copy that
  previously set context is going away, so this replaces it)
- `reframeGenPhase.phase === 'come-back-later'` → unchanged copy
- `reframeGenPhase.phase === 'failed'` → unchanged retry button
- `reframe` truthy → unchanged four-field render + "Get My Path & Plan" CTA
  (that button is the paid upsell, not part of the reveal gate — stays as-is)

No new polling logic, no new states — `reframeGenPhase` already produces
all four phases correctly; this only removes the extra boolean gate sitting
in front of it.

## Explicitly out of scope

- `/path` — already unconditional, untouched by this ticket
- Generation trigger timing (client-triggered on page visit vs. server-
  chained) — deliberately unchanged, per the 2026-08-03 decision to keep
  `generate-identity-report.ts` ignorant of `identity_reframe`. Not
  reopened here.
- Content/wording of the four reframe fields themselves — tracked under #99

## Stop conditions

- If `LimitsBlock` turns out to have any other usage in this file that a
  fresh read of the file doesn't confirm, stop and flag rather than
  removing the import.
- If removing `reframeRevealed` surfaces any other code depending on it
  (e.g. analytics, a ref, anything not visible in the excerpt reviewed for
  this brief), stop and flag before deleting it.
