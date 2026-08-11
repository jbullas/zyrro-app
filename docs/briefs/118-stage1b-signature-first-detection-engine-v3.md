# Brief: #118, Stage 1b — Signature-first Detection Engine v2 (single call, standalone)

## Context

Stage 1 (2026-08-11, commit 08ce704) tested a bottom-up design: freeform-extract evidence units first, then link each to whichever signatures it supports. Two findings blocked proceeding: the Weak relevance band was never used across 12 real generations, and rerun instability was severe enough to change a person's actual top signature between identical-input runs (matteo_varga: Architect absent → tied-#1 → absent across 3 runs). Root suspicion: the freeform extraction step itself is unstable, evidence_unit counts varied between runs (13/13/14, 11/13/11) before any signature-matching even happened, so instability downstream may be inherited from an unstable foundation, not caused by the linking step.

This stage tests the inverse structure: instead of extracting undefined chunks and matching them to signatures afterward, ask about all 25 signatures directly, in one call, and require an answer (evidence or none) for each. Hypothesis: a narrower, defined question asked 25 times inside one completion is more stable than one open-ended extraction question asked once. This also structurally removes the two-step filter suspected of suppressing Weak ratings in Stage 1 (decide-to-extract, then rate), since every signature must be evaluated explicitly, there's no implicit pre-filter before the rating step.

**Explicitly not in scope for this stage:** negative/contradicting evidence detection (discussed this session, real idea, connects to #104's open question about `suppressed_signatures`), stays a separate follow-up test on top of a proven-stable base, not combined with this test. Combining two new variables in one test would make it impossible to tell which change caused which result.

**Also not in scope:** splitting into multiple calls (e.g. one per domain). Test the single-call version first, it's the same cost as what's already running live today (the person's 13 answers only get sent once either way), splitting would multiply that cost for resending the same answers per call with no proven need yet.

## Design

New file, `lib/detection-engine-v3.ts` (v2 stays as-is, untouched, on disk per Stage 1's Definition of Done).

### Output schema

```
{
  "signatures": [
    {
      "signature_name": "",   // must match lib/signatures.ts exactly, all 25 must appear, every run
      "evidence": [
        {
          "quote_or_paraphrase": "",
          "source_question": 0,          // 1-13
          "signal_types": [],            // Energy Peaks | Frustration Patterns | Recurring Themes | Pride Moments
          "emotional_weight": "",        // low | medium | high
          "relevance": "",               // Strong | Normal | Weak
          "lens": ""                     // what THIS signature specifically reads into this event
        }
      ]
    }
  ]
}
```

All 25 signatures must appear in every response, `evidence` can be an empty array for signatures with no real support, that's a valid, informative result, not a failure, same principle as v2's Insufficient Evidence Rule.

### Prompt structure

For each of the 25 signatures in turn (grouped by domain in the prompt for readability, still one call, one completion): does the evidence in these 13 answers support this signature, if so cite it, rate it, explain the lens. Reuse Stage 1's relevance calibration wording verbatim, it wasn't shown to be wrong wording, the suspected problem was structural (filtered out before reaching the rating step), not the definitions themselves:

- **Strong** = unambiguous, direct evidence, no interpretive stretch needed.
- **Normal** = a real, defensible link, but requires some interpretation to connect it.
- **Weak** = plausibly related, but a stretch.

Do not pad empty signatures with invented evidence to avoid an empty array, an honest zero is a valid, expected result for most of the 25 for most people.

### Computed scoring

Unchanged from Stage 1, applied per signature from its own `evidence` array:
- Frequency (1–5): distinct `source_question` count, capped at 5.
- Intensity (1–5): max of Strong=5/Normal=3/Weak=1 across that signature's evidence entries.
- Score = Frequency × Intensity.

## Test method

Same 6 real personas as Stage 1 (`katalin_farkas`, `matteo_varga`, `nadia_petrescu`, `tomasz_zielinski`, `leona_markovic`, `ingrid_solberg`), same real `discovery_answers`, real OpenAI calls, `temperature: 0, seed: 42`. Main pass (1 generation per persona, 6 total) plus the same rerun-stability check on 3 of them (`katalin_farkas`, `matteo_varga`, `tomasz_zielinski`, 2 more rounds each, 6 more generations), matching Stage 1's exact methodology so the two results are directly comparable, not just similar in shape.

## Verification checks

1. **Structural stability** — does the *shape* of the output (total evidence entries returned, which signatures have any evidence at all) vary less between identical-input reruns than Stage 1's evidence_unit counts did (13/13/14, 11/13/11). This is the core hypothesis test.
2. **Relevance calibration** — is Weak actually used now. Report the real Strong/Normal/Weak distribution, same as Stage 1's measurement.
3. **Top-5 ranking stability** — does a case like matteo_varga's (a signature entirely absent in one run, tied-for-#1 in another) still happen. Report plainly if it does, don't treat a partial improvement as a full fix.
4. **Full-25 coverage** — does every run actually return all 25 signatures (even empty-evidence ones), or does the model truncate/omit some, a new possible failure mode this design introduces that Stage 1's structure didn't have.
5. **Q11/Q12 concentration** — same check as Stage 1 (volume and `emotional_weight` distribution by `source_question`), folded in from this run's data, still free.
6. **Real cost/latency numbers** — token usage and response time for this call, actually measured, not guessed. This prompt is materially larger than v2's (must define and ask about all 25 signatures explicitly), worth knowing the real number before any future conversation about splitting.

## Stop conditions

- Standalone only, same as Stage 1: do not wire into `generateIdentityReport`, any API route, or any user-facing path.
- Do not touch `identity_reframe`, `path_options`, `path_plan`, or any existing backstop.
- Do not add negative/contradicting-evidence detection in this pass, explicitly out of scope per Context above.
- Full terminal output required for every verification claim, no summarized acceptance.
- If structural stability or Weak-calibration still fail clearly, stop and report plainly rather than attempting a further wording variant, same standard Stage 1 already established.

## Definition of Done

- `lib/detection-engine-v3.ts` exists as standalone, tested code, not wired into the app.
- All 6 checks above run against real data and logged in the changelog with real numbers, not impressions.
- A clear recommendation logged: does this structure resolve Stage 1's two blocking findings, partially, fully, or not at all, and what that implies for whether Stage 2 (Call 2 pilot) should build on v2, v3, or wait for further iteration.
- This brief is deleted only once findings are committed, same lifecycle as every other brief.
