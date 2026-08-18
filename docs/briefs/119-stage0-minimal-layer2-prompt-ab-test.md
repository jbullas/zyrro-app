# Brief: #119, Stage 0 — Minimal Layer 2 prompt A/B test (rules-stripped vs. current live)

Filed under #119. Narrower and cheaper than #119's main scope (the
observe-then-name architecture redesign) — this tests whether the current
rule-heavy Layer 2 prompt itself is the problem, same 2-call architecture,
same input, before any new architecture is built. Findings here inform
whether #119's redesign is the right next step or whether a simpler prompt
fix resolves enough on its own.

## Context

Current live `LAYER_2_PROMPT` (`lib/prompts/identity-report.ts`) carries a
large accumulated rule stack — translation formula, evidence rule, evidence
reuse rule, tension rule, specificity rule, repetition rule, frustration
inversion rule, no-coaching rule, no-generic-praise rule, named identity hard
rules, recognition test, per-field word floors/ceilings, banned-word lists,
and multi-field echo-checking instructions — added incrementally, each in
response to a specific observed defect (see #84–#101, #112 for the append
history).

Working hypothesis: this accumulation may now be counterproductive on this
model — plausible given two documented precedents already on file: (1)
filler-phrase banning was tested and confirmed structurally ineffective, the
model substitutes unbanned equivalents rather than writing without filler;
(2) the #118 Call 2 pilot found that *narrowing* scope produced *more*
cross-signature repetition than baseline, an unintended regression from a
targeted simplification. Neither precedent says which way this test will
land — they establish that both directions (adding rules, removing rules)
have backfired before, which is exactly why this needs a real side-by-side
rather than another prompt-only patch based on argument.

**Explicitly not in scope for this test:** restructuring into multiple calls
(that's #118/#119's separate architecture question), changing the Detection
Engine, changing the JSON schema/field set, or touching second-person voice
(a fixed product requirement, not a quality heuristic under test). Combining
an architecture change with this rules question would make it impossible to
tell which change caused which result.

## Design

**Isolate one variable.** Run the live Detection Engine (`DETECTION_PROMPT`)
exactly once per persona — real call, real output. Feed that identical
evidence/scores object into two separate Layer 2 generations:

- **Variant A (baseline):** current live `LAYER_2_PROMPT`, unchanged.
- **Variant B (minimal):** new prompt, see below.

Holding Call 1's output identical between variants removes Detection Engine
non-determinism (#93) as a confound — any difference between A and B's
output is attributable to the Layer 2 prompt change alone, not to different
input.

Real signature scores and Primary(5)/Secondary(0-3) categorization come from
existing code (`categorizePrimarySecondary`, `computeDomainProfile` in
`lib/generate-identity-report.ts`), same as today — Variant B does not
reintroduce LLM-arbitrary scoring. Both variants receive the same
code-computed categorization and real per-signature evidence as input.

### Variant B — minimal Layer 2 prompt

Role framing, JSON schema (identical structure to current output — same
field names, same shape, so it's a drop-in comparison), and second-person
voice instruction are kept. Everything else replaced with one short
instruction per section, no word floors/ceilings, no banned-word lists, no
cross-field echo-checking:

```
You are Zyrro's Report Writer. You receive this person's signature
evidence and scores, already identified and ranked. Write their Identity
Signature Report as JSON matching the schema below. Write in second
person, addressed directly to them.

Work through it in this order:
1. Write a signature card for each of the 5 primary and up to 3 secondary
   signatures you've been given (core_statement, evidence_analysis,
   tension) — grounded in the real evidence provided for each.
2. Write the five How You Operate fields (work_style, thinking_style,
   relationship_style, decision_style, stress_pattern).
3. Using what you wrote in 1 and 2, write the Domain Profile summary,
   the Cover fields (named identity, identity thesis), and the
   constellation synthesis.
4. Write the reframe teaser (recap, reframe, why_bullets).
5. Write energisers and friction_points.

[JSON schema — identical to current live schema]
```

No further guidance beyond this. This is a genuine test of "how much rule
scaffolding does the model need," not a lightly-trimmed version of the
current prompt.

## Test method

Same 6 real personas used throughout #118 (`katalin_farkas`, `matteo_varga`,
`nadia_petrescu`, `tomasz_zielinski`, `leona_markovic`, `ingrid_solberg`),
same real `discovery_answers`. One Detection Engine call per persona (6
total), two Layer 2 calls per persona from that same output (Variant A,
Variant B — 12 Layer 2 generations total). Single pass, no reruns, unless
the findings below are ambiguous enough to warrant a stability check as a
follow-up stage.

Entirely standalone: new file (e.g. `lib/layer2-minimal-pilot.ts`), not
wired into `generateIdentityReport`, any API route, or any live artifact
type.

## Verification checks

Score each of the 12 Layer 2 outputs against the named defect list from the
2026-08-12 review that paused #118, plus the older confirmed defects — same
defect, same persona, A vs. B, present/absent/worse:

1. **Fabrication** — any claim not traceable to real evidence_units.
2. **Ungrounded confidence** — assertions stated more definitively than the
   underlying evidence supports.
3. **Thin-evidence overconfidence** — a signature with 0-1 tagged evidence
   units written as a full, confident narrative (this is what
   `enforceSecondaryEvidenceFloor` currently backstops for secondaries;
   check whether the minimal prompt reproduces this failure without the
   floor rule stated, or handles it naturally).
4. **Toothless teaser** — does `reframe_teaser` actually create an open
   question, or resolve into something flat/reassuring.
5. **Cross-section repetition** — same phrase/clause reused across sections
   (the specific failure `enforceConstellationSynthesisNonOverlap` and the
   Evidence Reuse Rule exist to catch).
6. **Word-count/completeness** — does output length collapse without stated
   floors (per #112's precedent that a bare range alone produces shorter
   output), or does the model naturally write proportionate to evidence
   density without being told to.
7. **General recognition quality** — a qualitative "does this read as
   specific to this person" pass, same standard the current prompt's
   Recognition Test targets, done by a human reviewer rather than
   self-reported by the model.

Report each check per-persona, per-variant. Not an aggregate pass/fail —
the useful output is which specific current rules are load-bearing (A wins
on that defect) and which are dead weight (B does no worse, or better,
without them).

## Stop conditions

- Standalone only — no changes to any live prompt, route, or artifact type.
- Full expanded output for every generation required before any claim is
  written up — no summarized "PASS," per standing verification standard.
- Do not iterate on Variant B's wording mid-test based on early results —
  run the single planned version against all 6 personas first, then decide
  whether a second iteration is warranted, so the comparison stays clean.

## Definition of Done

- 12 real Layer 2 generations completed and logged (6 personas × 2
  variants), sharing identical Call 1 input per persona.
- All 7 checks scored per-persona, per-variant, with real excerpts
  supporting each call — not impressions.
- A clear recommendation: which current rules are supported by this data as
  load-bearing, which look like dead weight, and whether a further
  iteration (e.g. a partially-minimal Variant C combining only the
  load-bearing rules) is warranted before any live change is considered.
- This brief deleted only once findings are committed to the changelog,
  same lifecycle as other #118-family briefs — no live path exists to
  verify against yet, so no live-verification requirement blocks the
  delete beyond that.
