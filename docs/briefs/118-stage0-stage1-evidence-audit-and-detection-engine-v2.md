# Brief: #118, Stage 0 + Stage 1 — Evidence audit + Detection Engine v2 (standalone)

## Context

#112's real-report verification (Katalin, Matteo samples) confirmed a regression: `evidence_analysis` and `how_you_operate` land shorter under the new lower targets than under the old higher ones, and secondary signatures hit `enforceSecondaryEvidenceFloor`'s zero-evidence fallback in 3/3 real cases checked this session, despite nonzero scores. Root hypothesis: one Layer 2 call writing 20+ fields at once both starves individual fields of output budget and can't reliably self-police cross-section repetition while generating (#86, #112 Stage 3 already showed the second part fails via prompt wording alone, three rounds).

Full ticket: #118. This brief covers only Stage 0 and Stage 1. Later stages (Call 2 pilot, Call 3 scoping, cost/latency sign-off) are separate briefs, gated on what these two stages find.

## Stage 0 — Evidence data audit (no API calls, no code changes)

**Objective:** check two hypotheses against real data before designing anything.

**Data source:** `evidence_units` and `signatures[]` already persisted on `identity_report` artifacts since #62 shipped (2026-08-04 onward). Direct Supabase query, no generation calls.

**Measure:**
1. Distribution of `evidence_units` by `source_question` (1–13) — is evidence concentrated in Q11/Q12, or spread evenly.
2. Distribution of `emotional_weight` (high/medium/low) by `source_question` — same check, specifically for whether Q11/Q12 evidence is disproportionately marked high.
3. Evidence density per signature by `score_band` (weak/moderate/strong/dominant) — how many evidence_units typically back a weak-band signature vs a dominant one. This is the number that tells us whether word-count floors are even achievable honestly for lower-ranked primaries.
4. Spot check (not exhaustive): for a handful of reports, does the generated prose (evidence_analysis, how_you_operate, reframe bullets) disproportionately cite Q11/Q12-sourced material specifically.

**Stop condition:** findings only, no prompt or generation code changes in this stage, same as #112 Stage 1 Part A's precedent. Write findings to the changelog.

## Stage 1 — Detection Engine v2 (standalone, not wired into the app)

**Objective:** build and verify the new evidence-linking schema and code-computed scoring in isolation, before anything downstream depends on it.

### Schema change

Replace `evidence_units[].primary_signature_candidate` / `secondary_signature_candidate` with:

```
signature_links: [
  {
    signature_name: string,       // official name from lib/signatures.ts
    lens: string,                 // what THIS signature specifically reads into this event — must differ genuinely from any other link's lens on the same evidence_unit, not a reworded duplicate
    relevance: "Strong" | "Normal" | "Weak"
  }
]
```

No cap on array length. No primary/secondary label at this stage — that stays a code computation from final scores, same as #110's existing pattern, and happens downstream, not here.

### Relevance calibration (use this wording verbatim in the prompt)

- **Strong** = unambiguous, direct evidence, no interpretive stretch needed.
- **Normal** = a real, defensible link, but requires some interpretation to connect it.
- **Weak** = plausibly related, but a stretch.

Reserve Strong for genuinely clear cases. If most links end up Strong, that's the same failure as no rating at all, and should be reported as a finding, not smoothed over.

### Code-computed scoring (new, replaces model-asserted frequency/intensity/score)

First-pass formula, provisional, to be checked against real output in this stage's verification, not treated as final:

- **Frequency (1–5):** based on the number of distinct `source_question`s contributing a link to this signature (breadth across the person's answers). 1 question → 1, 2 → 2, 3 → 3, 4 → 4, 5+ → 5.
- **Intensity (1–5):** derived from the relevance ratings of that signature's links. Map Strong=5, Normal=3, Weak=1, take the **max** across the signature's links (a single strong link should establish real intensity; averaging would dilute one strong link by combining it with weak ones).
- **Score = Frequency × Intensity**, same formula as today.

Flag explicitly in the changelog whether this formula produces sane, defensible scores against real data, or needs revision, don't silently ship it as correct.

### Test method

Run this new extraction logic standalone (a script, not wired into `generateIdentityReport` or any API route) against real `discovery_answers` for 4–6 existing real users spanning different domains/score bands, reuse test users already in the DB from prior sessions (e.g. the ones behind this session's Katalin/Matteo samples if identifiable, otherwise other named test personas already used in #93/#94/#112's real-data checks).

### Verification checks

1. **Lens differentiation** — for every evidence_unit with 2+ links, manually inspect: is each lens genuinely distinct, or a reworded duplicate. Report any near-duplicates found.
2. **Relevance calibration** — measure the real Strong/Normal/Weak distribution. Flag if Strong is common rather than rare.
3. **Link count / hedging** — measure average and max links per evidence_unit with no cap in place. Flag any sign of uniform high link counts (hedging).
4. **Computed score sanity** — compare the new code-computed scores against the old model-asserted `signatures[]` scores for the same real inputs. Do rankings broadly agree; report any wild divergence.
5. **Rerun stability** — run the same input 2–3 times. Report whether the underlying evidence_units/links are more or less stable than #93's prior finding on raw signature scores (this doesn't need to fully resolve #93, just report what's observed).

### Stop conditions

- Standalone only. Do not wire into `generateIdentityReport`, any API route, or any user-facing path this stage.
- Do not touch `identity_reframe`, `path_options`, or `path_plan` prompts, out of scope, #113's timing is unaffected by this work.
- Do not modify or remove `enforceSecondaryEvidenceFloor`, `enforceConstellationSynthesisNonOverlap`, or any other existing backstop, those still apply to the current live pipeline, untouched by this stage.
- Full terminal output required for every verification claim in this list, no summarized "+N lines" acceptance.
- If lens differentiation or relevance calibration fail real-data verification, stop and report the failure mode plainly rather than iterating blindly on wording, same standard #112's rounds already established.

## Explicitly out of scope for this brief

- Call 2 (Analysis) pilot, separate brief, pending this stage's results.
- Call 3 (Synthesis), separate brief, pending Stage 1/2 results.
- Any change to `app/identity/page.tsx`, `app/path/page.tsx`, or `identity_reframe`.
- Spinner step-indicator, independent piece, not blocked by this work, can be done anytime, not included here.
- Energisers/Friction Points sourcing from `signal_types`, belongs to whichever call ends up owning it (Call 3, per the ticket description), not touched in Stage 1.

## Definition of Done for this brief

- Stage 0: findings logged in the changelog, no code shipped.
- Stage 1: new extraction + scoring logic exists as standalone, tested code (script or new lib module, not wired into the app), verified against the checks above using real `discovery_answers`, findings and a clear recommendation (proceed to Call 2 pilot as-is, or revise Stage 1 first) logged in the changelog.
- This brief is deleted only after both stages' findings are committed, same lifecycle as every other brief in this project.
