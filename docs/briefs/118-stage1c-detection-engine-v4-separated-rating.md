# Brief: #118, Stage 1c — Detection Engine v4 (separated inclusion/rating, standalone)

## Context

Stage 1 (v2, extract-then-link) and Stage 1b (v3, signature-first) both tested clean but landed in the same place on one dimension: the Weak relevance band is barely used (0/145, then 1/145 across two different structural designs). Stage 1b's structural fix (removing the freeform extraction step) resolved the more severe finding (top-ranking flip between reruns) but didn't move Weak-calibration meaningfully, suggesting the suppression isn't caused by extraction-order, it's caused by something both designs still share: a single combined instruction ("does the evidence genuinely support this signature? If yes, cite and rate it") that filters for strength *before* the rating step ever runs. By the time something gets included at all, it's already implicitly cleared a "genuine support" bar, so rating it Weak afterward is rare, the filtering already happened upstream of the label.

This stage (v4) tests separating those two decisions explicitly: an inclusion test (is there a real, specific reference in the person's own words) that stays exactly as strict as v3's, not loosened, and a separate, independent rating step that can honestly call something Weak even though it was included.

**Explicit risk flagged and to be checked directly, not assumed away:** loosening inclusion (e.g. "list every plausible connection, even stretchy ones") was considered and rejected before this brief, because it would likely push the populated-signature count from Stage 1b's real measured 8–12 (out of 25) toward all 25 for every user, destroying the meaning of an honest "no evidence" result. v4 does NOT loosen inclusion. The check for whether this risk materialized anyway is a named, required check below (Check 2), not an assumption.

## Design

New file, `lib/detection-engine-v4.ts`. Same output schema, same all-25-explicit single-call structure, same Strong/Normal/Weak labels and definitions as v3. `v2.ts` and `v3.ts` both stay on disk, untouched, per each stage's own Definition of Done.

### The one change: separate inclusion from rating, explicitly, as two distinct steps in the prompt

Replace v3's combined instruction ("does the evidence genuinely support this signature? If yes, cite every real, distinct piece of evidence...") with two separate, sequential steps per signature:

**Step A — Inclusion (unchanged bar, just isolated as its own question):** Is there a specific, real reference in this person's own answers that could reasonably connect to this signature, a concrete event, behavior, or statement, not a general trait description and not an invented or hypothetical scenario? If no such reference exists, return an empty evidence array for this signature. This bar is identical in strictness to v3's, the goal here is only to stop it from doubling as the strength judgment.

**Step B — Relevance rating (independent of Step A, explicitly instructed not to default from it):** For each piece of evidence that passed Step A, rate its relevance separately and honestly. Add this instruction, directly addressing the exact failure observed in v2/v3: *"Do not use inclusion as a proxy for strength. A piece of evidence can pass the inclusion test in Step A and still be rated Weak in Step B, that happens whenever the reference is real but the connection to this specific signature requires you to stretch to make it fit. Rate what the evidence actually shows, not how confident you feel about having included it."*

Keep v3's existing calibration wording unchanged below that:
- Strong = unambiguous, direct evidence, no interpretive stretch needed.
- Normal = a real, defensible link, but requires some interpretation to connect it.
- Weak = plausibly related, but a stretch.

**Deliberately not done:** no target count, ratio, or expected distribution for Weak is specified anywhere in the prompt. Naming an expected number would risk the model fabricating Weak ratings to hit a quota rather than rating honestly, that would trade one failure mode for a worse one. This stage tests whether separating the two decisions alone is sufficient, not whether the model can be told to produce more Weak results.

Everything else (domain structure, signal types, hard constraints, question weighting, conflict list, output format, schema rules, full-25 requirement) stays identical to v3.

### Computed scoring

Unchanged, same formula as v2 and v3.

## Test method

Identical to Stage 1 and Stage 1b, for direct three-way comparability: same 6 personas, same real `discovery_answers`, `temperature: 0, seed: 42`, main pass (6 generations) plus rerun-stability on the same 3 personas (`katalin_farkas`, `matteo_varga`, `tomasz_zielinski`, 2 more rounds each, 6 more generations). 12 real generations total.

## Verification checks

1. **Relevance calibration** — real Strong/Normal/Weak distribution across all 145+ evidence entries. Direct comparison point: v2's 0/145, v3's 1/145.
2. **Populated-signature count per persona (the named risk check)** — for each of the 6 personas, how many of 25 signatures received any evidence at all. Compare directly against Stage 1b's measured baseline (katalin 9, matteo 12, nadia 8, tomasz 9, leona 12, ingrid 9, range 8–12). A jump well above this range (e.g. toward 15–25) means the separation leaked into loosened inclusion despite the unchanged wording, and should be reported as a real regression, not smoothed over. A count that stays in or near the 8–12 range while Weak-usage rises would be the clean, hoped-for result.
3. **Top-ranking stability** — does the matteo_varga-style flip (a signature absent in one run, top-ranked in another) recur. v3 resolved this; confirm v4 doesn't reintroduce it.
4. **Full-25 coverage** — all 25 signatures present, no missing/duplicate/unexpected names, every run.
5. **Lens differentiation** — for any evidence linked to multiple signatures (if this design still permits cross-signature citation, confirm against the shipped schema), lenses must genuinely differ, not reworded duplicates.
6. **Real cost/latency numbers** — token usage and timing, actually measured, comparable to v3's baseline (avg ~4,400 total tokens, ~16.9s per call).

## Stop conditions

- Standalone only, do not wire into `generateIdentityReport`, any API route, or any user-facing path.
- Do not touch `identity_reframe`, `path_options`, `path_plan`, or any existing backstop.
- Do not add a target Weak count/ratio to the prompt if this attempt under-performs, that's a different, riskier lever (quota-driven fabrication) not sanctioned by this brief.
- Full terminal output required for every verification claim.
- If Check 2 (populated-signature count) shows a jump well outside the 8–12 baseline range, treat that as a real regression and report it plainly, don't average it against a Weak-calibration improvement as if the two offset each other.
- If Weak-calibration still fails clearly and the populated-count check is clean, stop and report plainly rather than attempting a fourth prompt variant this session, same standard as Stage 1 and 1b.

## Definition of Done

- `lib/detection-engine-v4.ts` exists as standalone, tested code, not wired into the app.
- All 6 checks run against real data, logged in the changelog with real numbers.
- A clear recommendation: does separating inclusion from rating resolve Weak-calibration without regressing populated-signature count, and what that implies for whether Stage 2 (Call 2 pilot) can finally proceed, on v3, v4, or neither.
- This brief is deleted only once findings are committed, same lifecycle as the others.
