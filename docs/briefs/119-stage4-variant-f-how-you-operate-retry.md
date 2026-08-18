# Brief: #119, Stage 4 — Variant F: how_you_operate, second attempt

Follow-up to Stage 3 (`docs/changelogs/2026-08-18.md`, commit 17c9991).
Stage 3 ruled out a generic length/density effect — Variant D's contraction
was caused by something specific to its actual wording, not the mere fact
that text was added. This stage identifies the two most likely specific
causes in Variant D's wording and fixes both, rather than guessing at a
wholly new approach.

## Context

Stage 2's qualitative check (Check 2) already flagged the real defect
underneath the word-count number: Variant D's "situation" move stayed
generic in every sample checked — never citing an actual real fact from the
person's evidence, just a restated trait dressed as a situation. Two
specific candidates in Variant D's actual wording plausibly explain both
that failure and the length contraction:

1. **The hedge "Three moves, not three sentences — write however many
   sentences each move needs, but all three must be present"** may read as
   permission to compress, not as a floor. "Not three sentences" is
   ambiguous — it could mean "don't limit yourself to exactly three" or
   "you don't need three full sentences," and the observed output (shorter,
   not longer) is consistent with the model reading it the second way.
2. **"Ground it in one specific real way it shows up... a situation, habit,
   or choice from their evidence"** never required citing anything already
   established elsewhere in the analysis — unlike `evidence_analysis`'s
   Evidence Rule, which explicitly ties every claim to a named, real
   anchor. Without that same bar, "situation" was satisfiable by a
   plausible-sounding generic sentence, which is exactly what Stage 2's
   excerpts showed.

Both are named, specific, evidence-backed hypotheses from Stage 2's own
data — not a new guess unrelated to what was actually observed.

## Design

**Variant F** = Variant C's `how_you_operate` field spec, rewritten with
two changes from Variant D's attempt:

1. Remove the "not three sentences" hedge entirely. Replace with an
   explicit floor: each field must read as a full paragraph, multiple
   sentences, with each of the three moves getting at least one complete
   sentence — compressing the three moves into one or two sentences total
   is explicitly disallowed.
2. Strengthen the grounding requirement to match `evidence_analysis`'s own
   bar: the situation cited must be something concretely established
   elsewhere in this person's evidence (not necessarily quoting
   `evidence_analysis` verbatim — see Evidence Reuse Rule — but a real,
   nameable circumstance, not a generic description standing in for one).

New wording:
```
### how_you_operate
Five fields. Each field must read as a full paragraph — several complete
sentences, not a compressed one- or two-sentence summary. Each follows
three moves, and each move needs its own full sentence, not a clause:
(1) state the pattern, (2) ground it in one specific real situation, habit,
or choice already evident in this person's material — a concrete
circumstance you could point to, not a restated version of the pattern
itself, (3) name what that pattern requires or costs in practice.
Compressing these three moves into one or two sentences total is not
acceptable, even if all three ideas are technically present — each needs
room to be a real sentence.

[work_style / thinking_style / relationship_style / decision_style /
stress_pattern definitions — unchanged from Variant C]
```

No numeric word floor (Stage 0's finding on that still holds), and no
worked example (Stage 0's fabrication-vector finding on that still holds
too) — only the structural fix, isolated to what Stage 3's diagnostic
narrowed the problem down to.

### Implementation

New export `VARIANT_F_LAYER2_PROMPT` in `lib/layer2-minimal-pilot.ts`,
alongside B/C/D/E. Derive via the same scripted text-transform approach
used for D and E — diff against Variant C's source, confirm programmatically
that only the `how_you_operate` section differs, same verification pattern
as before.

## Test method

Same 6 personas, fresh generation (Detection Engine once per persona, fed
identically into Variant C and Variant F). 6 Detection Engine calls + 12
Layer 2 calls = 18 real calls.

## Verification checks

1. **`how_you_operate` word count**, Variant C vs. Variant F — does F close
   the gap toward Variant A's original ~70-100 word/field range (the actual
   target, not just "longer than C").
2. **Qualitative grounding check** — for each field, does the "situation"
   move actually cite a real, specific circumstance (cross-check against
   that persona's `evidence_units`), or does it stay generic the way
   Variant D's did. This is the check that matters most — Stage 2 showed
   length alone doesn't guarantee this improved.
3. **Regression check** — `evidence_analysis` length, `energisers`/
   `friction_points` count, `reframe` "Consider how..." absence,
   zero-secondary handling, `cover` field formats — confirm none of these
   move, matching Stage 3's finding that isolated changes stay isolated
   when the mechanism is content-specific.

## Stop conditions

- Standalone only — no changes to any live prompt, route, or artifact type.
- Full expanded output required for every generation before any claim is
  written up.
- Do not iterate Variant F's wording mid-test — run the single planned
  version against all 6 personas first.
- If Variant F still fails to close the gap or still produces generic
  grounding, report that plainly, same as Stage 2's negative result — do
  not soften or reframe a failure.

## Definition of Done

- 18 fresh real calls (6 Detection Engine + 12 Layer 2: Variant C + Variant
  F across 6 personas), all logged.
- All 3 checks scored per-persona with real excerpts, not impressions.
- A clear recommendation: is Variant F ready to propose as the actual live
  prompt change (replacing `LAYER_2_PROMPT`), or does the `how_you_operate`
  question need yet another round — and if so, what specifically remains
  unresolved.
- Brief deleted once findings are committed to the changelog, same
  lifecycle as prior #119 stages.
