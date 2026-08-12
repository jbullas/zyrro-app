# Brief: #118, Stage 1e — Detection Engine v5: reused-evidence discipline

## Context

Two free measurement passes this session, checking real quality rather than aggregate percentages, found a shared, confirmed problem underneath v3's output:

- **Rating-quality check** (13 hand-checked entries, all three relevance bands): 6 of 13 (46%) disagreed with the given rating on independent re-read. No single direction dominated, but a specific pattern recurred: entries that reused a quote already "spent" on a stronger match elsewhere got an inflated rating on the reuse (2 clear cases), while at least one direct, literal restatement was under-rated (1 case). Not random noise, a real, if partial, pattern.
- **Linking-quality check** (12 single-linked entries + all 10 main-pass multi-link groups, hand-checked): 8 of 12 (67%) single-linked entries had a real, defensible second signature that was missed. Of the 10 existing multi-link groups, 4 (40%) showed the *opposite* problem, a second link that was there but under-supported, a thin, bolted-on justification rather than an independently defensible one.

**These converge on one shared mechanism, confirmed independently by both checks:** once a piece of evidence is "in play" for one signature, the model treats a second connection to it more loosely than it would treat a first connection, sometimes reaching too far (inflated second links), and separately, sometimes not reaching far enough to catch a second connection that's actually there (missed links). Two sub-findings sit underneath this:

1. **Duplicate extraction, not linking.** Two of the missed-link cases (#4, #9 in the linking check) turned out to be the *same underlying answer* extracted twice, as two separate evidence_units with slightly different paraphrase wording, invisible to an exact-string reuse check. This isn't a missed link, it's a missed deduplication, the model doesn't currently check whether new evidence being extracted is actually the same event as something already extracted, before minting a new unit for it.
2. **Systematic under-scan on genuinely adjacent signatures.** The Originator/Pioneer pair ("started something new from scratch" reads as both) recurred across two unrelated personas, only ever getting linked to one. This looks like a scan-breadth problem, not a one-off miss.

**Also surfaced, flagged but explicitly set aside for now:** Architect showed up in 3 of the 4 inflated-link cases. A follow-up check found the 6-persona test sample is genuinely skewed, 4 of 6 have real construction/renovation content, 2 of those dominantly. That confound means Architect specifically can't be trusted as *the* outlier yet, though the underlying reused-evidence mechanism showed up on non-Architect pairs too (Nadia's Meaning Maker/Builder, the Originator/Pioneer cases), so it isn't only an Architect artifact. **This brief does not touch Architect's definition.** A fresh, profession-diverse persona set is a real, separate need before that specific question can be settled, noted here so it isn't lost, not acted on in this brief.

**Base version:** v3, not v4. v4's populated-signature-count instability is already a settled, confirmed finding (Part A), not being revisited here.

## Design

New file, `lib/detection-engine-v5.ts`, extends v3's structure (all-25-explicit, signature-first, single call) with three targeted additions. Nothing else about v3 changes.

**1. Deduplication before extraction.** Add: *"Before creating a new evidence_unit, check whether the same underlying event or statement already exists as an evidence_unit elsewhere in your response, even if worded differently or paraphrased from a different angle, as long as it draws on the same underlying answer and the same real event. If it does, add a new signature_link to that existing evidence_unit instead of creating a second, separate evidence_unit for the same event."* Targets the paraphrase-window duplication found directly (#4, #9).

**2. Equal bar for every link, regardless of order.** Add: *"Every signature_link on an evidence_unit must independently satisfy the full relevance bar on its own, whether it is the first link on that unit or an additional one. An evidence_unit already having one link is not license to judge further links more loosely. Evaluate each candidate link as if it were the only one being considered for that evidence_unit."* Targets the inflated-second-link pattern found in both checks.

**3. Broader candidate scan before finalizing links.** Add: *"When deciding whether an evidence_unit supports more than one signature, do not limit yourself to whichever signature is already under consideration. Before finalizing an evidence_unit's signature_links, check it against the full set of signatures you've found real evidence for in this person's answers so far, not just the one or two that came to mind first."* Targets the systematic Originator/Pioneer-style miss.

Everything else, the Strong/Normal/Weak calibration wording, the all-25 coverage requirement, the "no cap, but every link must earn its place" framing, stays exactly as v3 had it.

## Test method

Same 6 personas, same real `discovery_answers`, `temperature: 0, seed: 42`. Main pass (6 generations). No rerun-stability pass this round, that's not what's being tested here, this stage is about correctness of individual ratings/links, not run-to-run consistency.

## Verification — same manual method as today, not aggregate percentages

**Re-run both checks from today, against v5's real output, same methodology:**

1. **Rating-quality re-check.** Same approach as today: pull a spread of Strong/Normal/Weak-rated entries (10-15), read each against its quote and lens, judge independently whether the rating holds. Report the same way, quote, given rating, independent judgment, agree/disagree with reasoning. Compare the disagreement rate directly against today's baseline (6/13, 46%), but don't treat hitting a lower number alone as success, read whether the *inflated-reuse* pattern specifically is gone, since that's the mechanism this brief targets.

2. **Linking-quality re-check.** Same approach: sample single-linked entries and check for missed defensible second links; check existing multi-link groups for inflated/under-supported links. Compare against today's baseline (8/12 missed, 4/10 inflated), and specifically check whether the Originator/Pioneer-style pattern and the paraphrase-window duplication are actually resolved, not just whether the raw numbers moved.

3. **Deduplication check, new this round.** For each persona, check whether any evidence_units in v5's output are near-duplicates of each other (same answer, same real event, different wording) that should have been merged per instruction #1. Report any found plainly, this instruction either worked or it didn't.

## Stop conditions

- Standalone only, do not wire into `generateIdentityReport`, any API route, or any user-facing path.
- Do not touch Architect's or any other signature's definition in `lib/signatures.ts`. That question stays open, pending a diverse persona set, not decided here.
- Do not resume Stage 2b (`how_you_operate` weighted-synthesis) work until this stage's findings are in, Call 2 depends on Call 1's output being trustworthy, and that's still being established.
- Do not add a numeric target for link count or Weak-usage, that's a separate, already-settled-as-unresolved thread (v3/v4's Weak-calibration), not what this brief is testing.
- Full terminal output required for every verification claim, quote-level, not summarized.
- If any of the three fixes doesn't move its specific target problem, report that plainly rather than folding it into an aggregate "improved" narrative.

## Definition of Done

- `lib/detection-engine-v5.ts` exists as standalone, tested code, not wired into the app.
- Both manual quality checks re-run against real v5 output, same rigor as today, reported quote-by-quote against today's specific baseline findings, not just aggregate rates.
- Deduplication specifically checked and reported.
- A clear recommendation: is Call 1's output now trustworthy enough to resume Call 2 work on top of it, and if any of the three fixes didn't work, what's still open.
- This brief is deleted only once findings are committed.
