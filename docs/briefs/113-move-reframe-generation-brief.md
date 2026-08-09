# #113 — Move reframe generation from /identity to /path

## Objective

Reverse #98's original architecture. `identity_reframe` generation currently
fires eagerly on `/identity` the moment `identity_report` completes — before
the user has shown any interest in paying. Move that trigger to `/path`'s
unpaid state instead, and fold a short teaser (a "shift" line + a shareable
reframe pull-quote) directly into `identity_report`'s own Layer 2 generation,
so `/identity` no longer depends on a second artifact/LLM call at all.

**This ticket is plumbing only.** No prompt-wording polish, no copy quality
work, no anchoring-instruction design — that's all #99, which is blocked on
this ticket shipping first. Where this brief asks you to add prompt text,
treat it as a functional placeholder (enough to populate real content
end-to-end for verification) — not final copy. Say so in the diff/commit
so it's clearly flagged as provisional.

## Important existing-code note before you start

Read `app/path/page.tsx` first. It already contains `reframeArtifactId`,
`reframeGenPhase`, and a `loadOrStartReframe()` function that checks for an
existing `identity_reframe` artifact and starts generation if none exists —
this was already added as part of #98 (since `/path` was already rendering
the same artifact for unpaid users). **You likely do not need to add new
trigger logic to `/path` — it may already be correct as-is.** Confirm this
before writing new code; the real work is almost entirely on the
`/identity` side (removal) plus the new `identity_report` field (addition).

## Scope

### 1. `lib/artifact-schemas.ts`
Add a new top-level field to the `identity_report` artifact content type
(not nested inside `domain_profile` or any object that gets recomputed
post-generation — same rule that already applies to `domain_profile_summary`).
Suggested shape:

```ts
reframe_teaser: {
  shift: string;    // ~30-50 words
  line: string;     // ~15-30 words, the shareable pull-quote
}
```

Field/type names are a suggestion — keep whatever's most consistent with
existing conventions in this file.

### 2. `lib/prompts/identity-report.ts` (Layer 2 prompt)
Add a new section requesting `reframe_teaser`. Placeholder instruction
(functional, not final — #99 rewrites this):

> ## SECTION — REFRAME TEASER (field: "reframe_teaser")
> Purpose: a short teaser shown on the free /identity page, before any
> paywall. Two parts: (1) "shift" — 30-50 words, present-tense, ties back to
> the pattern just described. (2) "line" — 15-30 words, one declarative,
> shareable sentence stating the reframe (see identity-reframe.ts's existing
> REFRAME section for the shape of a shareable reframe line — same idea,
> shorter). No signature names. No pricing or forward-looking product
> language — this is recognition, not a pitch.

### 3. `app/identity/page.tsx`
Remove entirely: `reframeArtifactId` state, `reframeGenPhase` hook usage,
`loadOrStartReframe`/generation-trigger effect, the `LimitsBlock`-adjacent
render branches for idle/spinner/come-back-later/failed/ready reframe
states, and the "Generating your next step…" caption. Replace with a direct
render of `identity_report.content.reframe_teaser.shift` and `.line` —
no polling needed, since it's now part of the already-loaded report object.
Remove now-unused `identity_reframe` imports/types from this file if no
longer referenced.

### 4. `app/path/page.tsx`
Per the note above — confirm the existing `loadOrStartReframe` /
`reframeGenPhase` logic in the `unpaid` branch is sufficient as-is. If it
is, no changes needed here beyond removing any now-dead code that assumed
`/identity` was the primary trigger point (check comments referencing #98
for anything that needs updating).

### 5. `lib/prompts/identity-reframe.ts`
Pipe the new `identity_report.reframe_teaser` field through as available
input context (it's already passed the full `identity_report` JSON, so this
may already happen automatically — confirm). **Do not add an anchoring
instruction telling the model to echo or reference it** — that's #99's
scope. This ticket only needs to confirm the data is present and reachable
in the prompt's input.

## Out of scope (explicitly — do not do this here)

- Rewriting `identity_reframe`'s recap/meaning/reframe/why content
- Writing the anchoring/continuity instruction between teaser and sales page
- The new static "what you get" (Path Options/Plan) section on `/path`
- Real pricing display (currently gated behind `NEXT_PUBLIC_PRICE_DISPLAY`)
- Any visual/CSS changes beyond what's needed to render the new teaser fields

All of the above is #99, blocked on this ticket.

## Verification (per Definition of Done — live, not diff-based)

Two real scenarios, both via `scripts/run-verification.mts`'s bootstrap
helper:

1. **Fresh report completion** — seed a real `identity_report` generation
   end-to-end (or seed a ready one with `reframe_teaser` populated) and
   confirm `/identity` renders the teaser directly, with no spinner, no
   second artifact fetch, and no reference to `identity_reframe` anywhere
   in that page's network calls.
2. **Unpaid `/path` visit** — seed a user with a ready `identity_report`
   (including `reframe_teaser`) and no `identity_reframe` yet. Confirm
   visiting `/path` triggers generation (or confirms it already did per
   point 1's note), and that the existing unpaid-state rendering still
   works with the current (unrewritten) `identity_reframe` content — this
   ticket doesn't change that page's content, only where generation starts.
3. Confirm zero regressions on the **paid** `/path` and `/plan` states —
   neither should be touched by this change at all.

Curious-click edge case (user visits `/path` via bottom nav with no
`identity_report` yet) is already handled by the existing `no-report` gate
in `app/path/page.tsx`, which runs before the `unpaid` branch — confirm
this still holds, no new handling needed.

## Definition of Done

Standard project policy applies: every path above must be live-verified,
not diff-reviewed. If anything here can't be verified live this session
(e.g. hitting a rate limit), it stays open with an explicit note on what's
outstanding — do not mark Done on diff-review alone.
