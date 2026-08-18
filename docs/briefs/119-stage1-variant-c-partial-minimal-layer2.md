# Brief: #119, Stage 1 — Variant C (partially-minimal) Layer 2 prompt

Follow-up to Stage 0 (`docs/changelogs/2026-08-18.md`, commit af1393d).
Stage 0 answered "is the rule stack the problem" with a specific, mixed
result, not a clean yes or no — this stage applies that result directly
rather than guessing at new wording. Every change below is justified by a
named Stage 0 finding; nothing here is a fresh hypothesis.

## Context

Stage 0 compared the live `LAYER_2_PROMPT` (Variant A) against a fully
stripped prompt (Variant B) across 6 real personas, 7 defect checks. Result:
some rules are load-bearing (their absence produced this test's cleanest,
most deterministic failures — the reframe field's 6/6 "Consider how..."
coaching-mode failure being the starkest single result), others are dead
weight or actively harmful (numeric word floors never once met by Variant A
anyway; the why_bullets worked example produced a real fabrication by being
copied into a user's report instead of followed).

Variant C keeps the load-bearing rules, removes the confirmed dead weight,
and — per Stage 0's own finding that prompt-wording iteration on ambiguous
judgment calls has repeatedly failed on this model (filler-phrase banning,
the Call 2 pilot's repetition regression, #112's bare-range regression, five
stages of Fix 2 attempts) — deliberately does **not** attempt to reword the
one rule Stage 0 flagged as still broken (anti-repetition between
`identity_thesis` and `constellation_synthesis`, 3/6 failure in Variant A
despite ~50 lines of scaffolding). That rule's prompt wording is left
untouched this stage; it already has a code-level backstop
(`enforceConstellationSynthesisNonOverlap`) mitigating it in production, and
Stage 0's own data says this is exactly the category where another guess at
wording is likely to fail again, not improve things.

## Design

### Changes from live `LAYER_2_PROMPT`

**1. Drop exact numeric word floors/ceilings**, per Stage 0's finding that
Variant A never once cleared them (0/30 `evidence_analysis` fields hit the
140-word floor across all 6 personas; `how_you_operate` and
`domain_profile_summary` also frequently missed theirs). Replace the
"count the words, reject if under X" mechanics with plain qualitative
guidance (e.g. "write a full paragraph, several sentences, proportionate to
the evidence available" instead of "minimum 120 words, target 150"). Do
**not** remove the guidance entirely — Stage 0 showed Variant B's total
removal collapsed every field category 3-6x, so some instruction to write
at length is still doing real work even though the specific number wasn't.

**2. Remove the `why_bullets` worked example specifically** (the
"Extended (20 words...): 'You redesigned the receiving workflow...'" text in
the current prompt). Stage 0 traced a real fabrication directly to this
example — Leona's real report included this exact sentence, copied
near-verbatim, describing an event that never appears anywhere in her real
evidence. Keep the underlying instruction ("must name a specific fact, not
a restated trait") — that instruction itself is load-bearing per Stage 0 —
just without an example sentence for the model to lift.

**3. Soften the Evidence Rule's "minimum 2 story anchors" requirement.**
Stage 0 found this rule caused fabricated padding on a real 1-evidence
primary signature (Katalin's Pioneer entry — a full invented sentence about
"tackling new challenges" with no source in her evidence_units, produced to
satisfy the minimum-2-anchors structure). Reword to require citing what
real evidence exists without inventing additional detail to reach a count —
a thin-evidence signature should read as honest and concise, not padded.

**4. Everything else stays unchanged**, specifically because Stage 0 either
confirmed it's load-bearing or didn't produce evidence either way:
- Second-person voice rule, all per-field structural formats
  (`cover.identity_context`/`report_metadata`)
- Zero-secondary-signature handling instruction (100% vs. 50% compliance in
  Stage 0)
- The 6–10 count spec for `energisers`/`friction_points` (7-10 actual vs.
  flat 3/3 without it)
- Evidence-grounding requirement + No Coaching framing on `reframe_teaser`
  (0/6 vs. 6/6 "Consider how..." failure — the single starkest result)
- The anti-overlap rule's wording for `constellation_synthesis` (unchanged,
  per Context above — not re-guessed at this stage)
- Translation Formula, Specificity Rule, Repetition Rule, Frustration
  Inversion Rule, Recognition Test, Named Identity rules, Final Quality Test
  — Stage 0 didn't produce clean opposite-outcome evidence on any of these,
  so they're left as-is rather than modified on a guess.

### Implementation

New export `VARIANT_C_LAYER2_PROMPT` in `lib/layer2-minimal-pilot.ts`
(same standalone module as Stage 0's `VARIANT_B_LAYER2_PROMPT` — both can
coexist there, neither wired into `generateIdentityReport`). Reuse Stage
0's `runLayer2Variant` runner unchanged.

## Test method

Same 6 personas, same protocol as Stage 0 (`katalin_farkas`, `matteo_varga`,
`nadia_petrescu`, `tomasz_zielinski`, `leona_markovic`, `ingrid_solberg`,
real `discovery_answers`). Stage 0's raw output lived in an ephemeral
scratchpad path outside the repo and should not be assumed to still exist —
regenerate fresh: one Detection Engine call per persona (real, live
`DETECTION_PROMPT`), same code-computed `categorizePrimarySecondary`/
`computeDomainProfile` overwrites applied, fed identically into **both**
Variant A (live, unchanged — regenerated fresh alongside C for direct
same-day comparability, not reused from Stage 0's numbers) and Variant C.
12 Layer 2 generations total (6 personas × 2 variants).

## Verification checks

Same 7 checks as Stage 0 (fabrication, ungrounded confidence, thin-evidence
overconfidence, toothless teaser, cross-section repetition,
word-count/completeness, general recognition quality), scored per-persona,
per-variant, against real excerpts — plus one addition specific to this
stage:

8. **Regression check** — for every rule Variant C kept unchanged from
   Variant A, confirm Variant C's behavior on that dimension matches Variant
   A's (e.g. zero-secondary handling still correct, energisers/friction
   still 6-10, reframe still avoids "Consider how..."). The point of Variant
   C is to fix the three specific things above without quietly breaking
   something Stage 0 already confirmed works.

## Stop conditions

- Standalone only — no changes to any live prompt, route, or artifact type.
- Full expanded output for every generation required before any claim is
  written up — no summarized "PASS."
- Do not reword the anti-overlap rule this stage, even if Variant C's output
  happens to show the same 3/6-style failure — that's explicitly out of
  scope per Context above, not a gap to patch reactively mid-test.
- Do not iterate Variant C's wording mid-test based on early personas — run
  the single planned version against all 6 first.

## Definition of Done

- 12 fresh real Layer 2 generations (6 personas × Variant A + Variant C),
  sharing identical fresh Call 1 input per persona.
- All 8 checks scored per-persona, per-variant, with real excerpts.
- A clear recommendation: does Variant C hold Stage 0's confirmed
  load-bearing behaviors while resolving the 3 targeted defects (dead
  numeric floors, the why_bullets fabrication vector, thin-evidence
  padding) — and is it ready to propose as a live change, or does it need
  a further round first.
- Brief deleted only once findings are committed to the changelog, same
  lifecycle as Stage 0.
