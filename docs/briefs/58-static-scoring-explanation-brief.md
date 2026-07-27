# Brief — Make scoring explanation static (correction to #81)

**Ticket:** #81 (follow-up/correction — original commit `ced0fdb` on `dev`)
**Type:** Bug · Section: `/identity`
**Not part of #58.** #58's board description hasn't been updated with this
finding; this is scoped entirely as a refinement of #81's own delivery —
#81 rendered the generated `scoring_explanation` field, and this corrects
that to render static copy instead, for the reasons below.

## Goal

`signature_profile_summary.scoring_explanation` describes the fixed
Frequency × Intensity scoring methodology — not anything user-specific.
There's no reason to regenerate it per user, and doing so means the
explanation is frozen per-artifact under the Tier C append-only policy: if
the methodology description ever needs to change, every already-generated
report keeps its old wording forever, with no way to update it short of a
Tier C regeneration. A static constant fixes both the wasted generation
tokens and the update-drift risk in one move — edit the constant, every
user sees the update immediately, past and future reports alike.

## Scope

1. **`app/identity/page.tsx`** — add a static constant (e.g.
   `SCORING_EXPLANATION`) next to the existing `WHAT_THIS_REPORT_IS`
   constant, same pattern. Content: a rewritten, generic explanation of the
   Frequency × Intensity model and the Primary/Secondary distinction — reuse
   the substance of what's currently being generated, since it was already
   accurate, just make it fixed wording rather than model output.
2. Swap the Section 3 render from
   `signature_profile_summary?.scoring_explanation` to the new static
   constant. Remove the now-unused optional chaining/type plumbing added in
   #81 for this field if it's no longer needed elsewhere.
3. **`lib/prompts/identity-report.ts`** — remove `scoring_explanation` from
   the output JSON template, and delete the
   `### signature_profile_summary.scoring_explanation` field-requirement
   block.
4. **`lib/artifact-schemas.ts`** — remove (or make optional, if removing
   outright feels safer for existing stored rows) `scoring_explanation`
   from `SignatureProfileSummary`.

## Out of scope / stop conditions

- No backfill of existing artifacts — old rows keep whatever
  `scoring_explanation` text they were generated with in storage; nothing
  reads it anymore, so it's inert, not broken. Do not write a migration or
  backfill script for this.
- No `schema_version` bump — Postgres `jsonb` doesn't enforce the TypeScript
  shape, so dropping a field from the type doesn't require one.
- No A/B prompt comparison needed for this one (unlike `domain_profile`'s
  removal) — `scoring_explanation` is self-contained; there's no reason to
  believe removing its instruction changes any other field's output. If
  live verification shows otherwise, stop and report back rather than
  proceeding on assumption.
- Do not touch `domain_profile` or `what_this_report_is` in this pass —
  those remain #58's territory (unchanged, not part of this brief) and
  are out of scope here entirely.

## Verification

Same Tier A (presentation-only) shape as #81:

1. `npx tsc --noEmit` and `npm run build` clean.
2. Live-verify against a real artifact (existing test user, or reuse the
   `withVerificationSession` pattern from #81) — confirm the static text
   renders in Section 3, in the same position #81 established.
3. Generate one fresh identity report (real or synthetic user) and confirm
   the LLM's output no longer includes `scoring_explanation` — i.e. the
   prompt change actually took effect, not just that the page ignores a
   field that's still being generated.

## Done criteria

Live-verified per Definition of Done. Log the changelog entry as a
correction/follow-up to #81 — same ticket number, not #58.
