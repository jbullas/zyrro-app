# Brief: #119, Stage 3 — Variant E: diagnostic (length vs. content)

Follow-up to Stage 2 (`docs/changelogs/2026-08-18.md`, commit be0284d).
Stage 2 found Variant D's `how_you_operate` fix backfired — the field got
shorter, not longer, and `evidence_analysis` and `energisers`/
`friction_points` (both untouched by that change) also contracted. Two
possible causes, indistinguishable from Stage 2's data alone: the specific
wording added was the problem, or adding *any* text of that length anywhere
in the prompt suppresses generation elsewhere, regardless of content. This
stage isolates which one it is, before attempting any further wording
change on `how_you_operate`.

## Context

Stage 2's stop condition explicitly ruled out iterating Variant D's wording
mid-test or reactively. This stage isn't that — it's not another attempt to
reword `how_you_operate`. It's a control test answering the open question
Stage 2 itself surfaced and explicitly deferred to "a future stage," per
its own Recommendation section.

## Design

**Variant E** = Variant C (`VARIANT_C_LAYER2_PROMPT`) with one addition:
inert padding text inserted **away from `how_you_operate`** — appended to
an unrelated section (e.g. the Writing Principle or Evidence Rule section),
matched as closely as possible to Variant D's real addition in length
(~270 characters) but containing no new instruction, no new content
requirement, nothing the model could act on differently. Restating
something the prompt already establishes elsewhere, in different words, is
the right shape for this — present in length, absent in new instructional
content.

`how_you_operate`'s field spec itself is untouched — identical to Variant
C's, byte-for-byte. This isolates the variable: if `how_you_operate` still
contracts under Variant E despite never being touched, the cause is
generic (prompt length/density), not specific wording.

### Implementation

New export `VARIANT_E_LAYER2_PROMPT` in `lib/layer2-minimal-pilot.ts`,
alongside B/C/D. Derive via the same scripted text-transform approach Stage
2 used for Variant D (diff against source, not hand-retyped), to guarantee
everything except the inserted padding is byte-identical to Variant C.
Confirm the diff programmatically before running, same as Stage 2 did.

## Test method

Same 6 personas, same protocol as Stage 2 — regenerate fresh (Detection
Engine once per persona), fed identically into Variant C (reference) and
Variant E (test). Variant A/D not needed this round — this is a two-way
diagnostic against the already-established Variant C baseline, not a full
re-run of the whole lineage. 6 Detection Engine calls + 12 Layer 2 calls =
18 real calls total.

## Verification checks

Narrow, diagnostic-focused:

1. **`how_you_operate` word count**, Variant C vs. Variant E, all 6
   personas. Core question: does it contract under E despite the field
   being untouched.
2. **`evidence_analysis` word count**, same comparison — Stage 2 showed
   this contracted too under D; check whether E reproduces that.
3. **`energisers`/`friction_points` count**, same comparison — Stage 2
   found suspiciously uniform 6/6 under D; check whether E reproduces that
   specific pattern.
4. **Everything else** (reframe, zero-secondary handling, why_bullets,
   field formats) — quick regression confirmation only, not a full
   re-scoring, since neither variant touches those and Stage 2 already
   established they're stable.

## Interpreting the result

- **If Variant E shows contraction on checks 1-3 comparable to Stage 2's
  Variant D findings:** the mechanism is generic — added length/density
  anywhere in the prompt suppresses generation elsewhere, independent of
  content. Rewording `how_you_operate` again would not fix this; the real
  lever is something else (prompt length budget, `max_tokens`, generation
  order, or field sequencing) — a different kind of stage than anything
  run so far in this line.
- **If Variant E stays flat, matching Variant C on all three checks:**
  length alone isn't the cause — Stage 2's specific wording was the
  problem, and a different content approach for `how_you_operate` is still
  worth attempting in a future stage.

Either outcome is a real, useful answer — this brief does not presuppose
which one is correct.

## Stop conditions

- Standalone only — no changes to any live prompt, route, or artifact type.
- Full expanded output required for every generation before any claim is
  written up.
- Do not attempt to fix `how_you_operate`'s wording in this stage even if
  the result points that direction — that's a separate future stage's job,
  informed by this one's finding, not folded into it.
- Do not iterate Variant E's padding content or placement mid-test — run
  the single planned version against all 6 personas first.

## Definition of Done

- 18 fresh real calls (6 Detection Engine + 12 Layer 2: Variant C + Variant
  E across 6 personas), all logged.
- Checks 1-4 scored per-persona, with real excerpts and word counts, not
  impressions.
- A clear, explicit statement of which hypothesis the data supports
  (generic length effect vs. content-specific), and what that implies for
  next steps.
- Brief deleted once findings are committed to the changelog, same
  lifecycle as prior #119 stages.
