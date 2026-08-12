# Brief: #118, Stage 1h — Detection Engine v8: genuinely separate review call

## Context

Three attempts at fixing the "equal bar for every link" problem have now failed on the same two motivating cases (Matteo's Architect/Contextualiser Q5 pair, Originator/Pioneer Q3 pair):

1. **Stage 1e (v5):** a single self-applied instruction, judge every link fresh regardless of order. Worked on 2 of 4 flagged cases, failed on the 2 involving Matteo, inconsistently, with no visible pattern predicting which.
2. **Stage 1g (v7):** the same instruction restructured into a forced, visible two-phase output within one call, draft links first, then an explicit reviewed-links section checking the draft. Both Matteo cases came back byte-identical between draft and reviewed, zero effect. Where review did act elsewhere, it wasn't discriminating, well-supported and weak links got pruned with equal indifference, and cost roughly 2.5x v5's tokens/latency for that result.

Stage 1g's own finding points at the likely cause: a model committing to structured JSON within one completion doesn't reliably hold a critical, adversarial stance toward its own just-written output, even when that output is explicitly labeled as needing review. The generation context that produced the draft is still fully present when "reviewing" it, and the two cases that survived intact both happen to be exactly the ones where the original extraction was most confident (Strong/Strong on both). This stage tests whether removing that shared context, an actual second call, with no memory of having written the draft, just handed a finished list to react to, produces different behavior.

**Explicit cost bar, agreed before running this:** a second call is only worth it if it produces a meaningfully better result, not a marginal one. This is not a "ship if better than v5 at all" bar. If v8 fixes the two motivating cases and shows real, discriminating review behavior (not v7's blunt pruning), that's meaningfully better. If it produces the same inconsistent or non-discriminating pattern v5 and v7 both showed, the added cost isn't justified, and the conclusion should be that this needs a different kind of fix entirely, not further restructuring of how many calls are involved.

## Design

Two calls, not one, both standalone, nothing wired into the live pipeline.

**Call A — extraction, unchanged.** Reuse v5's `DETECTION_PROMPT_V3`-plus-Fix-1-and-Fix-3 structure exactly as-is (deduplication and broader candidate scan both showed real value in Stage 1e and 1g, keep them). Remove Fix 2's self-review instruction entirely, that's Call B's job now, not something Call A should attempt on its own. Output: the same `signatures[]` shape v5 already produces, nothing new.

**Call B — review, genuinely separate.** New prompt, new completion, receives Call A's full output as its only input (not the original 13 answers, not the extraction reasoning, just the finished link list). Task: *"You are reviewing a list of evidence-to-signature links that have already been extracted by someone else's analysis. For each link, judge it fresh, on its own: does this specific piece of evidence genuinely support this specific signature at the rating it was given? You do not know why the original link was made and should not assume it was reasoned well just because it exists. If a link doesn't hold up on independent review, downgrade its relevance or remove it entirely. If two links on the same underlying evidence exist (e.g. the same quote linked to two different signatures), you must judge each independently, do not let one signature's strong fit make you more lenient toward the other."* Output: the same shape, `reviewed_signatures[]`, this is what scoring and everything downstream uses.

## Test method

Same 6 personas, same real `discovery_answers`. Call A run once per persona (6 generations), Call B run once per persona against Call A's real output (6 more generations). 12 real generations total.

## Verification

**Primary check, same non-negotiable bar as Stage 1g:** Matteo's two flagged cases, quote-level, before/after. Does Call B's review actually change either one this time, or are they still identical to what Call A produced.

**Discrimination check, the thing v7 failed at:** across all 6 personas, does Call B's review show real, selective judgment, keeping well-supported links while removing or downgrading weak ones on the same quote, rather than pruning indiscriminately (v7's failure mode) or not acting at all (v7's other failure mode, 3 of 6 personas showed zero review activity).

**Secondary checks, same as prior stages:** rating-quality and linking-quality re-checks (10-15 entries), full-25 coverage, real cost/latency for both calls combined, direct comparison against v5's single-call baseline.

**The cost bar, applied explicitly at the end:** does v8's result clear "meaningfully better," not just "different" or "marginally better," given it costs a full second call on top of Call A. State plainly whether it does.

## Stop conditions

- Standalone only, do not wire into `generateIdentityReport`, any API route, or any user-facing path.
- Do not touch `lib/signatures.ts` or any signature definition.
- Do not resume how_you_operate/Stage 2b work.
- Do not add a numeric target for how many links should change during review.
- Full terminal output required for every verification claim, quote-level for the two primary Matteo cases.
- If this still doesn't resolve the two motivating cases, report that plainly as evidence the problem isn't about shared context between extraction and review, don't propose a third-call or further call-splitting as the next fix without a new, different hypothesis for why it would help.

## Definition of Done

- Both calls exist as standalone, tested code, not wired into the app.
- Matteo's two specifically-flagged cases checked directly, quote-level, Call A output vs. Call B output.
- Discrimination behavior reported honestly, not just presence/absence of change.
- Real combined cost/latency numbers for both calls, compared against v5's single-call baseline.
- A clear recommendation, explicitly applying the "meaningfully better, not just different" bar agreed above: does the separate call justify its cost, and if not, what that implies for whether this specific problem needs an entirely different kind of fix rather than another architectural variant.
- This brief is deleted only once findings are committed.
