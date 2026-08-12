# Brief: #118, Stage 1i — Detection Engine v9: direct pairwise comparison of co-linked evidence

## Context

Three attempts to fix redundant multi-signature links, v5 (self-applied "judge every link fresh" instruction), v7 (forced two-phase review within one call), v8 (a genuinely separate, cold second call), all failed identically on the same two motivating cases (Matteo's Architect/Contextualiser Q5 pair, Originator/Pioneer Q3 pair). v8's result was the most informative: even a completely independent reviewer, with no memory of authorship and explicit instructions to distrust the list, produced zero changes across 59 links checked over 6 people. That rules out shared-context/self-defensiveness as the mechanism.

CC's diagnosis from v8's result is the basis for this stage: read in isolation, a redundant link's lens usually sounds perfectly reasonable, "sees the broader context and systems involved in complex projects" is a defensible sentence on its own. The redundancy is only visible in *comparison*, when held next to Architect's reading of the identical quote and noticed to cover the same ground. Every prior attempt asked the model to judge each link "independently" or "fresh, on its own", which may be the exact framing that prevents the one comparison that would expose the problem. This stage tests that specific, previously-untested question directly: not "is this link defensible," but "do these two links, sharing the same evidence, actually say different things, or the same thing twice with different signature names."

**This is a single-call test, not a call-splitting variant.** Three separate call-architecture attempts (v5, v7, v8) already converged on the same wall and are not being revisited. This stage changes what question gets asked, not how many calls ask it.

## Design

New file, `lib/detection-engine-v9.ts`, extends v5's structure (v3 base + Fix 1 dedup + Fix 3 broader scan). Remove Fix 2's "equal bar, judge independently" instruction entirely, replace with:

**Pairwise comparison for co-linked evidence.** *"After you have identified all signature_links for a piece of evidence, check: if this evidence has 2 or more signature_links, compare each pair of links directly against each other, not independently. For each pair, ask: do these two links capture genuinely distinct aspects of what this evidence shows, something a reader would recognize as two different observations, or are they two signature names attached to essentially the same reading of the same sentence? If two links are substantively the same observation wearing different labels, keep only whichever one fits more precisely and remove the other, don't keep both because each one sounds reasonable when read alone. A link only survives if it says something the other link(s) on the same evidence do not already say."*

Everything else stays as v5, same calibration wording, same dedup and broader-scan instructions, same schema.

## Test method

Same 6 personas, same real `discovery_answers`, `temperature: 0, seed: 42`. Main pass only (6 generations, single call each, no second call).

## Verification

**Primary check, same as every prior stage in this line:** Matteo's two flagged cases, quote-level. Does Architect/Contextualiser Q5 now show one link removed or clearly differentiated, rather than both surviving as near-identical readings? Same for Originator/Pioneer Q3.

**Broader check, this time actually testing the comparison mechanism itself, not just presence/absence of change:** for every multi-linked evidence entry found across all 6 personas, report the two (or more) links side by side and independently judge, the same way this session's manual checks have throughout, whether they're genuinely distinct or redundant. Compare that judgment against what v9 actually did, did it correctly keep genuinely distinct pairs intact and correctly collapse redundant pairs, or does it still fail to discriminate.

**Secondary checks:** full-25 coverage, rating/linking-quality spot checks against the same real cases used throughout this line, real cost/latency (expect this to land close to v5's baseline, single call, modest instruction addition, not v7/v8's inflated cost).

## Stop conditions

- Standalone only, do not wire into `generateIdentityReport`, any API route, or any user-facing path.
- Do not touch `lib/signatures.ts` or any signature definition.
- Do not resume how_you_operate/Stage 2b work.
- Do not split this into multiple calls, that path is closed per v5/v7/v8's convergent result.
- Full terminal output required for every verification claim, quote-level for the two primary Matteo cases and for every multi-link group found.
- If this still fails to discriminate genuinely redundant pairs from genuinely distinct ones, report that plainly. Per Miroslav's direction, if this doesn't work, the next move is his call, not a further prompt-wording attempt on the same underlying idea.

## Definition of Done

- `lib/detection-engine-v9.ts` exists as standalone, tested code, not wired into the app.
- Matteo's two flagged cases checked directly, quote-level.
- Every real multi-link group across all 6 personas independently judged for genuine-distinctness-vs-redundancy and compared against what v9 actually did.
- Real cost/latency numbers, compared against v5's baseline.
- A clear recommendation: does asking for direct pairwise comparison, instead of independent per-link judgment, succeed where three call-architecture variants didn't.
- This brief is deleted only once findings are committed.
