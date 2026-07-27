# Brief — Render generated `scoring_explanation` in Signature Profile

**Ticket:** not yet added to board — Miroslav to assign a number when logged.
**Type:** Bug · Section: `/identity` · Priority: Low

## Goal

`signature_profile_summary.scoring_explanation` (80–150 words) is generated
by the Layer 2 prompt on every `identity_report` — it's required to explain
the Frequency × Intensity scoring model — but `app/identity/page.tsx` never
reads or renders it. Section 3 (Signature Profile) currently shows only the
score bars and radar chart with no explanation of what the numbers mean.
Render the field that already exists. No prompt change, no backfill, no new
generation — purely a rendering fix.

## Background

- Schema: `lib/artifact-schemas.ts` → `SignatureProfileSummary.scoring_explanation`.
- Prompt: `lib/prompts/identity-report.ts` → field requirement documented
  under `### signature_profile_summary.scoring_explanation` (must explain
  the Frequency × Intensity model and the Primary/Secondary distinction).
- Currently unconsumed anywhere in the codebase (confirmed via grep —
  `signature_profile_summary` itself is consumed by `app/api/mentor/route.ts`
  for signature names only; `scoring_explanation` specifically has zero
  consumers).
- Raised during the identity-report content review (feedback doc D4/D5 —
  "scoring looks precise but is unexplained").

## Scope

1. In `app/identity/page.tsx`, extend the `IdentityReport` interface to
   include `signature_profile_summary: { primary_signatures: ...; secondary_signatures: ...; scoring_explanation: string }`
   (or the relevant subset — only `scoring_explanation` needs to be newly
   consumed; the arrays are already used elsewhere per #33's sort logic).
2. In **Section 3 (Signature Profile)**, render `scoring_explanation` as
   explanatory copy. Suggested placement: directly under the "SIGNATURE
   PROFILE" eyebrow, above the `PrimarySignatureBars` card, so it frames the
   scores before the reader hits them. Use existing typographic conventions
   (plain `<p>`, matching the style of "What This Report Is" in Section 2 —
   no new component needed for a single paragraph).
3. No changes to `PrimarySignatureBars`, `DomainRadarChart`, or the muted
   secondary-signature list markup itself.

## Out of scope / stop conditions

- Do not touch D5 (badge threshold legend) — separate, not part of this brief.
- Do not touch the scoring model itself, `computeDomainProfile`, or any
  prompt file.
- Do not backfill existing artifacts — `scoring_explanation` was already
  part of the schema before #53's backfill window, so it should already be
  present on existing rows generated after the schema was introduced. If
  live verification finds older rows missing the field, stop and report
  back rather than writing a backfill script — that's new scope requiring
  its own decision.
- Do not modify CSS/globals.css unless an existing class genuinely doesn't
  fit — reuse what Section 2 already uses.

## Verification

This is a Tier A (presentation-only) change per the Artifact Regeneration &
Update Policy — no data correctness risk — but still needs a live check per
the Definition of Done, not just a diff/typecheck:

1. `npx tsc --noEmit` and `npm run build` clean.
2. Live-verify against at least one real `ready` `identity_report` artifact
   (existing test user or a fresh synthetic one via the `/run` skill) —
   confirm `scoring_explanation` text actually renders in Section 3, in the
   right position, without breaking existing bars/radar rendering.
3. Spot-check an existing older artifact (if one predates this field) to
   confirm the page doesn't break when `scoring_explanation` is
   undefined/missing — render nothing (or a safe fallback), not a crash.

## Done criteria

Per `AGENTS.md`'s Definition of Done: live-verified rendering on a real
artifact, not just typecheck/diff. Log the changelog entry per the usual
`session end` protocol.
