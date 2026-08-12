# Brief: #118, Stage 1g — Detection Engine v7: forced two-phase link review (single call)

## Context

Stage 1e tested three targeted fixes on top of v3. Fix 1 (deduplication) worked cleanly, confirmed in both testable cases. Fix 3 (broader candidate scan) produced real, mixed value. Fix 2 (equal bar for every link, regardless of order) is the one this stage exists to fix, and it's the one the whole brief was built around: it worked on two cases (Katalin's Bridge and Guardian links, genuinely well-supported new second links) and failed on exactly the two cases named as motivating evidence, reproduced verbatim, same persona, same quotes:

- Matteo's Architect/Contextualiser pair (Q5): both signatures still linked, Contextualiser still an inflated, under-supported reuse of a quote already spent on Architect.
- Matteo's Originator/Pioneer pair (Q3): both still linked, the exact systematic co-link pattern named in Stage 1e's brief as evidence Pioneer keeps getting mistaken for Originator-shaped evidence.

The inconsistency itself, working on some links and not others in the same run, is the real finding, not a wording problem to iterate on again. This matches the shape of an earlier, already-resolved case this session: v3's Weak-calibration issue improved only once "should this be included" was separated from "how strong is it," as two distinct decisions, rather than asked as one blended judgment. Fix 2's instruction currently asks the model to link evidence and immediately judge whether each link deserves to stay, in the same breath, for every signature, across the whole 25. This stage tests whether making that a genuinely separate, visible second pass, still inside one call, closes the gap that instruction alone didn't.

**Important technical constraint, why this needs a structural change and not just a two-step instruction:** a model producing structured JSON output generally doesn't reason through intermediate steps before committing to that JSON, telling it "first do X, then do Y" inside one instruction doesn't guarantee two actual reasoning phases happened, it may just produce the same result while claiming to have followed the steps. The only reliable way to force genuine two-phase behavior within one call is to make the *output itself* contain both phases, an initial draft the model must commit to, and a separate, explicit review pass over that same draft, so the review step has something concrete and already-written to check against rather than being asked to hold both jobs in its head at once.

## Design

New file, `lib/detection-engine-v7.ts`, extends v5 (v3 + Fix 1 dedup + Fix 2 equal-bar + Fix 3 broader-scan). Fix 1 and Fix 3 stay exactly as v5 had them, both showed real value and aren't being retested here. Only Fix 2's mechanism changes.

**Remove:** the current single "Equal bar for every link, regardless of order" instruction as a standalone rule the model is expected to self-apply while extracting.

**Add:** a two-phase output structure.

**Phase 1 — Draft links.** Same extraction process as v5 (find evidence, link to signatures, rate relevance, write a lens). Output this as `draft_signature_links`, exactly as v5 would have produced it, no filtering applied yet.

**Phase 2 — Reviewed links.** A second, explicit section, `reviewed_signature_links`. Instruction: *"Now review your own draft above, one link at a time. For each link, ask only: judged completely on its own, with no credit from any other link on the same evidence_unit, does this link's relevance rating still hold? If a link only made sense because another link on the same evidence_unit was strong, downgrade or remove it. Do not skip this step for links you already feel confident about, review every single one. Output only the links that survive this independent check, with their final relevance rating, in `reviewed_signature_links`."*

The app-facing schema (what gets scored, what feeds downstream) only ever reads `reviewed_signature_links`. `draft_signature_links` exists purely to force a real, visible first commitment the review phase can check against, it's not used for anything else and isn't scored.

## Test method

Same 6 personas, same real `discovery_answers`, `temperature: 0, seed: 42`. Main pass only (6 generations), no rerun-stability pass this round.

## Verification

**Primary check, direct and non-negotiable:** do Matteo's two specifically-flagged cases actually resolve this time?
- Architect/Contextualiser Q5: does Contextualiser's link get downgraded/removed in `reviewed_signature_links`, or survive unchanged from the draft.
- Originator/Pioneer Q3: same check.

Quote the draft and reviewed versions of both links side by side. If either is identical between draft and reviewed, the two-phase structure did not produce genuine review for that case, report that plainly, don't count it as progress because the mechanism changed even if the outcome didn't.

**Secondary checks, same method as Stage 1e:**
- Full rating-quality and linking-quality re-checks (10-15 entries), same comparison baseline as before.
- Confirm Fix 1 (deduplication) and Fix 3 (broader scan) still work as they did in v5, since this stage changes the surrounding structure they operate within.
- Report how many links actually changed between draft and reviewed phases across all 6 personas, real number, not just the two flagged cases, some indication of whether review is doing real, broad work or only firing on obvious cases.
- Cost/latency, real numbers, this version's output is meaningfully larger (two full link sets instead of one), worth knowing the real token cost of this approach before it's considered for anything beyond a standalone test.

## Stop conditions

- Standalone only, do not wire into `generateIdentityReport`, any API route, or any user-facing path.
- Do not touch `lib/signatures.ts` or any signature definition.
- Do not resume how_you_operate/Stage 2b work.
- Do not add a numeric target for how many links should change between draft and review, that would risk the model gaming the count rather than reviewing honestly.
- Full terminal output required for every verification claim, quote-level for the two primary cases specifically.
- If the two primary cases still don't resolve, report that plainly as evidence this needs an actual separate call, not just a differently-structured single one, don't propose a fourth wording variant on the same single-call approach.

## Definition of Done

- `lib/detection-engine-v7.ts` exists as standalone, tested code, not wired into the app.
- Matteo's two specifically-flagged cases checked directly, quote-level, draft vs. reviewed.
- Full rating/linking-quality re-checks completed, same rigor as Stage 1e.
- Real cost/latency numbers reported.
- A clear recommendation: does forcing visible two-phase review within one call close the gap Fix 2 alone didn't, and if not, whether the next step should be an actual separate second call rather than further single-call restructuring.
- This brief is deleted only once findings are committed.
