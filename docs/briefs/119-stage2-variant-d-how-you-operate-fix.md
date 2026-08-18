# Brief: #119, Stage 2 — Variant D: fix how_you_operate's length regression

Narrow follow-up to Stage 1 (`docs/changelogs/2026-08-18.md`, commit
61f4dc5). Stage 1 found Variant C resolved 2 of 3 targeted defects cleanly
but introduced one unintended side effect: dropping `how_you_operate`'s
numeric word floor over-contracted it ~35-45% (unlike `evidence_analysis`,
which held its length via the retained Pattern→Evidence→Meaning scaffold —
`how_you_operate`'s five fields never had an equivalent structure to lean
on, only a one-line content description each). This stage fixes exactly
that, nothing else.

## Context

Root cause, per Stage 1: length in `evidence_analysis` is driven by a
qualitative multi-part structure (Pattern → Evidence → Meaning), not by the
number that used to sit next to it — Stage 0 already showed the number
itself was never met (0/30 fields cleared 140 words) and didn't do the
work. `how_you_operate`'s five fields had no equivalent structure, so
removing their number removed their only real length driver.

Fix: give `how_you_operate`'s five fields the same kind of qualitative
scaffold, not a restored word count. This is not a new hypothesis — it's
applying the same mechanism Stage 1 already confirmed works on
`evidence_analysis`, to the one field that didn't get it.

## Design

**Variant D** = Variant C (`VARIANT_C_LAYER2_PROMPT`) with exactly one
further change: `how_you_operate`'s field spec.

Current Variant C wording (unchanged from live, one line per field):
```
work_style: how they actually work — pace, structure preferences, environment needs.
```

New structure, applied to all 5 fields — pattern, then a specific real
situation it shows up in, then what it costs or requires:
```
Each of the 5 fields follows: state the pattern, ground it in one specific
real way it shows up for this person (a situation, habit, or choice from
their evidence — not a restated trait), then note what that pattern
requires or costs in practice. Three moves, not three sentences — write
however many sentences each move needs, but all three must be present.

work_style: how they actually work — pace, structure preferences,
environment needs.
thinking_style: how they process information and form conclusions.
relationship_style: how they operate with other people — not ideals,
observable patterns.
decision_style: how they make decisions — speed, data needs, instinct
versus analysis.
stress_pattern: what happens to this identity under pressure. Stress
reveals identity distortion. Be honest.
```

No numeric floor added back anywhere — the fix is structural, matching
Stage 1's own diagnosis, not a reversion to what Stage 0 already showed is
dead weight.

Everything else identical to Variant C (all of Stage 0/Stage 1's other
findings carried forward unchanged — no numeric floors elsewhere, no
why_bullets example, softened Evidence Rule, anti-overlap wording still
untouched).

### Implementation

New export `VARIANT_D_LAYER2_PROMPT` in `lib/layer2-minimal-pilot.ts`,
alongside Variant B and C. Reuse `runLayer2Variant` unchanged.

## Test method

Same 6 personas. Regenerate fresh (per Stage 1's own finding that prior
stages' output shouldn't be assumed reusable) — one Detection Engine call
per persona, fed identically into **three** Layer 2 variants this time:
Variant A (baseline, for the original reference point), Variant C (to
confirm D is a strict improvement over C, not just different), and Variant
D. 18 Layer 2 generations total (6 personas × 3 variants), 24 real calls
including Detection Engine.

## Verification checks

Narrow, per the brief's own scope — not the full 8-check pass again:

1. **`how_you_operate` word count**, all 5 fields, all 6 personas, all 3
   variants — does D close the gap to A's ~70-110 word/field range, without
   overshooting back toward padding.
2. **Quality read on `how_you_operate`** specifically — does the three-move
   structure actually produce three distinguishable moves (pattern /
   situation / cost), or does the model collapse them into one generic
   sentence despite the instruction. Real excerpts, not assumed.
3. **Regression check** — confirm every other field Stage 1 already
   verified as unaffected by Change 1 (`evidence_analysis` length,
   `energisers`/`friction_points` count, zero-secondary handling,
   `why_bullets` grounding, `reframe` "Consider how..." absence) is
   unchanged in Variant D. This is the one place a fuller check matters —
   the point is confirming Variant D didn't quietly break something while
   fixing `how_you_operate`.

## Stop conditions

- Standalone only — no changes to any live prompt, route, or artifact type.
- Full expanded output required for every generation before any claim is
  written up.
- Do not touch anything outside `how_you_operate`'s field spec — if the
  data suggests another field needs adjustment too, log it as a finding for
  a future stage, not an in-flight scope addition.
- Do not iterate the wording mid-test — run the single planned version
  against all 6 personas first.

## Definition of Done

- 18 fresh Layer 2 generations (6 personas × 3 variants) plus 6 fresh
  Detection Engine calls, all real, all logged.
- `how_you_operate` word counts and a qualitative read reported per
  persona, per variant, with real excerpts.
- Regression check confirms Variant D holds every previously-verified
  load-bearing behavior.
- Clear recommendation: is Variant D ready to propose as the actual live
  prompt change, or does it need another round.
- Brief deleted once findings are committed to the changelog, same
  lifecycle as Stages 0 and 1.
