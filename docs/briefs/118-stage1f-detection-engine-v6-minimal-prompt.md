# Brief: #118, Stage 1f — Detection Engine v6: deliberately minimal prompt

## Context

Two free measurement passes this session found a real, confirmed problem in v3's output: evidence already "in play" for one signature gets treated too loosely when a second connection to it is considered, sometimes over-extended (inflated links), sometimes under-caught (missed links), plus a related deduplication gap (the same real event, extracted twice under different wording, invisible to reuse detection).

The instinct was to patch this with three new targeted instructions (Stage 1e's draft). Worth pausing on that before running it, for a concrete reason found in v3's own prompt, not just a general worry: v3 already contains a "Conflicts You Must Distinguish Carefully" section explicitly naming Builder vs. Architect vs. Originator as signatures the model must tell apart. Architect is exactly the signature that showed up as the over-extended attractor in today's linking-quality check, bolted onto Builder and Pioneer evidence despite this existing instruction. That's direct evidence, not speculation, that adding a rule aimed at a specific failure doesn't reliably produce discipline against that failure, in this specific prompt, on this specific problem.

This stage tests the opposite direction: strip the prompt down to what's structurally necessary, and see whether some of the observed problems (reused-evidence bias, missed adjacent-signature links) improve, worsen, or stay the same, before deciding whether the fix is more instructions or fewer. **This is not Stage 1e's three targeted fixes.** None of those are added here. The point is to isolate whether complexity itself is contributing to the problem, separate from whether any specific new instruction would help.

## Design

New file, `lib/detection-engine-v6.ts`. v3 (and v4, v5 if it exists) stay untouched, on disk, per each stage's own Definition of Done.

**Kept, because it's data or structurally load-bearing, not behavioral instruction:**
- The full domain/signature list with definitions (required for the model to know what it's evaluating).
- The output schema, unchanged: `evidence_units` with `quote_or_paraphrase`, `source_question`, `signal_types`, `emotional_weight`, `signature_links` (`signature_name`, `lens`, `relevance`).
- The three-tier relevance calibration definitions (Strong/Normal/Weak), core to the actual task.
- One plain honesty instruction: only cite evidence that's actually in the person's answers; if nothing real supports a signature, leave it empty rather than inventing something.

**Cut, deliberately, to test whether removing them costs anything real:**
- The separate "Hard Constraints" bullet list (ignore aspiration, ignore job titles, accuracy>creativity, evidence>interpretation, consistency>novelty), which substantially restates the honesty instruction above in different words.
- The Question Weighting section (Q1–13 role breakdown, including the Q11–12 intensity-weighting clause). Its original purpose applied when the model self-asserted intensity; that's now code-computed from relevance ratings instead, so this section's rationale doesn't cleanly carry over, and it's never been shown to produce a benefit.
- The "Conflicts You Must Distinguish Carefully" list, given the direct evidence above that it isn't preventing the exact failure (Architect over-extension) it names.
- The multi-step extraction breakdown (Step 1/2/3/4 structure), collapsed into a single direct task instruction: evaluate all 25 signatures, cite real evidence with a distinct lens per signature, rate relevance honestly.

**Explicitly not added:** none of Stage 1e's three fixes (deduplication instruction, equal-bar-for-every-link, broader candidate scan). If v6 still shows the same failures, that's real evidence those targeted fixes are needed regardless of prompt density. If v6 shows fewer of them, that's evidence complexity itself was a real contributor, worth knowing before adding anything back.

## Test method

Same 6 personas, same real `discovery_answers`, `temperature: 0, seed: 42`. Main pass only (6 generations), no rerun-stability pass this round, this stage is about correctness of individual ratings/links against v3's known findings, not run-to-run consistency.

## Verification — same manual method as v3's checks, directly comparable

1. **Rating-quality check**, identical method to the one already run on v3: sample 10–15 entries across all three relevance bands, read each against its quote and lens, judge independently whether the rating holds. Compare directly against v3's baseline (6/13 disagreements, 46%), and specifically check whether the reused-evidence-gets-inflated pattern is present, absent, or unchanged.
2. **Linking-quality check**, identical method: sample single-linked entries for missed defensible second links, check existing multi-link groups for inflated/under-supported links. Compare directly against v3's baseline (8/12 missed links, 4/10 inflated existing links), and specifically check whether the Originator/Pioneer-style systematic miss and the paraphrase-window duplication issue are present, absent, or unchanged.
3. **Full-25 coverage and schema compliance**, same check as every prior stage, confirm the simplification didn't break basic structural reliability.
4. **Real cost/latency numbers**, actually measured, direct comparison against v3's baseline given the prompt is now meaningfully shorter.

## Stop conditions

- Standalone only, do not wire into `generateIdentityReport`, any API route, or any user-facing path.
- Do not add any of Stage 1e's three fixes to this version. Keep the two experiments separable, if both end up looking worthwhile, they get combined and tested together as a deliberate next step, not accidentally merged here.
- Do not touch `lib/signatures.ts` or any signature definition.
- Full terminal output required for every verification claim, quote-level, not summarized.
- If v6 shows the same or worse failures than v3 on either check, report that plainly, don't read a shorter prompt as automatically better just because it's shorter.

## Definition of Done

- `lib/detection-engine-v6.ts` exists as standalone, tested code, not wired into the app.
- Both manual quality checks re-run against real v6 output, same rigor as v3's, reported quote-by-quote against v3's specific findings, not just aggregate rates.
- A clear recommendation: did simplifying the prompt improve, worsen, or not affect the reused-evidence bias and the missed-link pattern, and what that implies for whether Stage 1e's targeted fixes are still worth building, worth building on top of v6 instead of v3, or unnecessary.
- This brief is deleted only once findings are committed.
