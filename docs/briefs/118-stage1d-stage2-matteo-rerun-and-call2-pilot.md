# Brief: #118, Stage 1d + Stage 2 — Matteo reruns + Call 2 Analysis pilot

## Context

Stages 1, 1b, 1c tested three Detection Engine (Call 1) designs, each real progress, none conclusive. Every check run so far (Weak-calibration %, populated-signature count, top-ranking stability) is a proxy. None of them is the actual thing #118 exists to fix, whether reports come out longer and less repetitive than they did before #112. That's never been tested, because nothing downstream of Call 1 has run against any of this yet.

This brief has two parts. Part A closes the one open question from Stage 1c cheaply, before moving on. Part B is the real pivot: pilot Call 2 (the Analysis call that actually writes `evidence_analysis`/`how_you_operate`/secondary cards) against real captured evidence from both v3 and v4, for real people we already have existing live reports for, and measure the thing that actually matters, word count and repetition, directly against those existing reports. This also settles v3-vs-v4 empirically, whichever evidence source produces the better report wins, rather than continuing to weigh Detection Engine internals against each other in the abstract.

**Explicit discipline carried over from Stages 1–1c:** no fourth Call 1 prompt variant this round. If Stage 2's results point at a specific, fixable Call 1 gap, that's grounds to return to it later. Chasing calibration purity further without knowing whether it affects real output isn't.

## Part A — Stage 1d: matteo_varga v4 reproducibility check

Stage 1c's `lib/detection-engine-v4.ts`, unchanged, no prompt edits. Run 3–4 more rounds against `matteo_varga`'s real `discovery_answers` (same personas/method as before), plus one additional persona (`nadia_petrescu`, since her main-pass count of 5/25 was also outside baseline, in the other direction) for a second data point on whether count instability is broader than one person.

**Check:** does populated-signature count spike toward Stage 1c's named danger zone (15–25) again for matteo, or was Round 2's 16/25 a one-off. Report the plain count for every round, no averaging into a single number that could hide a repeat spike.

**Stop condition:** this is a measurement pass only, no prompt changes regardless of outcome. If the spike recurs, log it as confirmed-reproducible; if it doesn't, log it as likely one-off, in both cases move to Part B, don't iterate here.

## Part B — Stage 2: Call 2 Analysis pilot

### Design

**New computed-categorization step** (code, not a model call): from a Call 1 result's per-signature scores (already computed by `computeSignatureScoresFromV3`/`V4`), take the top 5 by score as primary, the next 3 as secondary. Same pattern as #110's existing live-pipeline precedent.

**New Analysis prompt**, reusing the *live* `lib/prompts/identity-report.ts` wording verbatim wherever it already covers this ground, specifically: the Pattern → Evidence → Meaning structure, the Evidence Rule, the Evidence Reuse Rule, the current `evidence_analysis` word-count framing ("minimum 140 words, target 160 words"), the current `how_you_operate` framing ("Each minimum 120 words, target 150 words"), and the secondary-signature compressed comparative format from #82 (source-discipline, evidence-depth tiers, 0–1 tagged units → short fallback). Deliberately not rewritten, this pilot is testing whether a better-structured evidence *input* improves output on its own, not testing new prompt wording, changing both at once would make it impossible to tell which one caused any difference observed.

**What changes is the input shape only:** instead of the live pipeline's raw Detection Engine blob, this call receives, per primary/secondary signature: the signature's name, computed score, and its Strong/Normal-rated evidence entries (quote, source_question, lens) as the citable material. Weak-rated evidence is not passed to this call as citable material, it already did its job (contributing to the score in Call 1's computed-scoring step); per the original ticket's design, Weak evidence counts toward score, isn't written into prose.

### Test method

4 pilot generations: `katalin_farkas` and `matteo_varga` (both have real existing live `identity_report`s already measured earlier in this session, and real captured evidence from both v3 and v4), each run once against v3's captured evidence and once against v4's, so both people and both evidence sources get a direct comparison point.

### Verification checks

1. **Word count vs. the same floors the live pipeline uses** (`evidence_analysis` 140/160, `how_you_operate` 120/150). Direct, apples-to-apples comparison, same floors, same word-counting method already established in this codebase (`logStage2WordCountAndDomainGaps`'s convention).
2. **Word count vs. the real existing reports.** Katalin's and Matteo's actual live reports were already measured earlier this session (`evidence_analysis` ranged roughly 81–106 words, `how_you_operate` roughly 86–100). Does the pilot's output land higher, lower, or the same. This is the actual target metric #118 exists to move.
3. **Cross-section repetition**, using the same 4+-word literal-overlap detection already shipped for `constellation_synthesis` (`hasOverlappingPhrase`/`CONSTELLATION_SYNTHESIS_MIN_OVERLAP_WORDS`), adapted to check across this pilot's own generated sections against each other (primary cards vs. each other, `how_you_operate` fields vs. the primary cards). Report raw counts, don't just assert "looks better."
4. **Evidence Reuse Rule compliance and fabrication check.** Does the output only cite evidence actually present in the Strong/Normal set it was given, or does anything get invented or drawn from elsewhere. Spot-check by hand against the raw input evidence for at least one full pilot report.
5. **v3-vs-v4 evidence comparison.** For the same two personas, does Call 2 output differ meaningfully depending on which evidence source it was fed. Report which one produces the better result on checks 1–4, this is the empirical tiebreaker between the two designs.

### Stop conditions

- Do not wire this into `generateIdentityReport`, any API route, or any user-facing path. Standalone only, same as every prior stage.
- Do not rewrite the reused prompt sections (Pattern→Evidence→Meaning, Evidence Rule, word-count framing, secondary compressed format). If they need changing, that's a separate, isolated follow-up, not bundled into this pilot.
- Do not touch `identity_reframe`, `path_options`, `path_plan`, or any existing backstop.
- Full terminal output required for every verification claim.
- If results are mixed or don't clearly favor one evidence source, report that plainly rather than picking a winner to close the loop neatly.

## Definition of Done

- Part A's reproducibility findings logged, no code changes from that part alone.
- Part B's pilot code (categorization step + Analysis prompt + input-shaping) exists as standalone, tested code, not wired into the app.
- All 5 checks run against real data (4 pilot generations minimum) and logged with real numbers, not impressions.
- A clear recommendation: does evidence-first input actually improve word count and repetition over the live pipeline's real output, which evidence source (v3 or v4) performs better, and what that implies for whether this whole redesign is worth carrying further, into `path_options`/`path_plan`'s equivalent generation, or into live wiring.
- This brief is deleted only once findings are committed.
