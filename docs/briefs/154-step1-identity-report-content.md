# #154 Step 1 — Identity Report: generated content

**Ticket:** #154 Identity Report redesign, step 1 of 4 (generated content only).
**Planning context:** `docs/briefs/identity-report-redesign.md` (decisions, outline, field mapping). Read it first. That file is planning-only; this file is the one to execute.
**Out of scope here:** static copy (step 2), any `/identity` layout or UI work (step 3), existing reports (step 4).

## Goal

Generate the new Identity Report content defined in the planning brief, verified on real discovery answers, without changing anything `/path` depends on (except the deliberate `identity_context` removal below).

## Hard constraint: /path and Mentor

These identity report fields are read by `/path` or Mentor and must keep being generated with the same shape and meaning:
`reframe_teaser`, `how_you_operate`, `evidence_analysis`, `core_statement`, `tension`, `energisers`, `friction_points`, `primary_constellation`, `secondary_signature_analysis`, `constellation_synthesis`, `signature_profile_summary`, `cover.*` (except `identity_context`).

`energisers` / `friction_points` change phrasing only (see 3), not shape or meaning.

Before changing anything, grep every consumer of each field you touch and list them in your first report.

## Architecture

Do not grow the Layer 2 call. It already produces the full report in one call with `max_tokens: 8000`, and adding ~8 signatures × ~8 fields plus three report-level sections would push it past its budget and risk degrading the fields `/path` reads.

Add the new content as a **separate generation step after Layer 2** (call it Layer 3), in `lib/generate-identity-report.ts`, written into the same `identity_report` artifact before it is marked `ready`. Layer 3's input: the Detection Engine output (`evidence_units`, `signatures`), the categorised primary/secondary lists, and the relevant Layer 2 output (signature names/domains/scores, `core_statement`, `constellation_synthesis`, `how_you_operate`, `energisers`, `friction_points`). New prompt in `lib/prompts/identity-report-deep-dive.ts` (or similar).

Whether Layer 3 is one call or several in parallel (e.g. one per signature plus one report-level call) is **your first investigation**: measure output size and end-to-end generation time against the route's `maxDuration` (240s), and report before building. Precedent for splitting: the Path report's two-call outline/elaboration architecture (#145).

A Layer 3 failure must not lose the Layer 2 report: if Layer 3 fails after its retry, save the report without the new fields and log the failure, rather than marking the artifact `failed`.

## 1. New fields (all optional in the type, `schema_version` → `"1.4"`)

Add to `IdentitySignatureReportArtifactContent` in `lib/artifact-schemas.ts`. New top-level fields only; do not change the shape of any existing field.

```ts
signature_deep_dives?: SignatureDeepDive[];   // one per primary AND secondary signature, keyed by name
pairings?: PairingLine[];                     // 2–3
distinctive_pattern?: DistinctivePattern;
pattern_to_notice?: PatternToNotice;

interface SignatureDeepDive {
  name: string;                    // must match a primary_constellation or secondary_signature_analysis name
  what_this_means: string;         // 2 paragraphs, ~80–140 words total; how the pattern works in this person, not a definition
  evidence: EvidenceItem[];        // exactly 3
  shows_up: string[];              // 3–4 short phrases: where it shows up in their life
  serves_you: string[];            // 3–4 short phrases: where it is an advantage
  works_with: WorksWith[];         // 1–2
  operating: {
    at_work: string;               // one sentence each, ~15–25 words
    thinking: string;
    with_people: string;
    deciding: string;
  };
  friction: string;                // 2–3 sentences
  under_pressure: string;          // 1–2 sentences
}

interface EvidenceItem {
  text: string;                    // one sentence, ≤30 words, a concrete observation from their answers
  source_question: number;         // 1–13, must match an evidence_unit tagged to this signature
}

interface WorksWith {
  partner: string;                 // another signature in THIS report (primary or secondary)
  text: string;                    // 2–3 sentences: what the partner does for THIS signature
  evidence: string;                // one sentence grounding it in their answers
}

interface PairingLine {
  a: string;
  b: string;
  line: string;                    // one short sentence on how the two interact
}

interface DistinctivePattern {
  steps: string[];                 // 3–5 single words or very short verb phrases, e.g. Explore, Understand, Structure, Communicate
  paragraphs: [string, string];    // how the sequence works; why it draws them to certain work
}

interface PatternToNotice {
  headline: string;                // one sentence: the strength that is also the tension
  body: string;                    // 2–4 sentences
  takeaway: string;                // one short line
}
```

### Content rules (prompt)

- **Second person, British English, present tense for identity, past tense for evidence**, as Layer 2 already does. Reuse Layer 2's Writing Principle, Specificity, No Generic Praise and No Coaching rules rather than paraphrasing them; extract shared rule text into a constant both prompts import if that is cleaner.
- **Evidence:** every `EvidenceItem` must come from this signature's own `evidence_units` (the same source discipline Layer 2 uses for secondaries). No invented biography. Thin evidence → fewer, more cautious claims, never filler.
- **Works with, written from this card's side:** in A's deep dive, the A→B entry says what B does for A; in B's deep dive, the B→A entry says what A does for B. The two directions of a pair must say different things. Partners must be signatures in this report.
- **Pairings:** each `PairingLine` must be a pair that appears in some signature's `works_with`, so the section and the cards come from the same data. Pairings describe how two specific signatures interact; Distinctive Pattern describes the overall sequence they form together. Keep them distinct.
- **No overlap with existing fields:** `what_this_means` must not restate `core_statement` or `evidence_analysis`; `friction` must not restate `tension`; Distinctive Pattern must not restate `constellation_synthesis` or `identity_thesis`.
- **Secondaries** get the full structure, scaled to their (smaller) evidence base.

### Backstops (log-only, same pattern as the existing `log…` functions)

- `evidence[].source_question` not among the signature's tagged `evidence_units`.
- `works_with.partner` not in this report, or a pair whose two directions overlap (reuse `hasOverlappingPhrase`).
- `pairings` entry not backed by a `works_with` entry.
- Word-count and item-count gaps against the targets above.
- Restatement overlap between new fields and `core_statement` / `tension` / `constellation_synthesis` / `identity_thesis`.

## 2. Retire fields

Remove from the Layer 2 prompt, the schema (keep as optional/deprecated in the type so old reports still parse) and any code that reads them:

- `domain_profile_summary` (identity only)
- `what_this_report_is` (identity only, already unused)
- `cover.identity_context` — **also remove from `/path`**: the Path report cover line in `components/PathReportFlow.tsx`, the Path report generation context in `lib/generate-path-report.ts`, and `app/api/path-report/route.ts`. Existing Path reports that stored it must render cleanly without it.

Do **not** remove the `/identity` page's rendering of anything in this step except where a retired field would otherwise throw; layout is step 3. If `/identity` breaks on a missing `domain_profile_summary`, guard it.

## 3. Energisers / friction points phrasing

Change the Layer 2 rule only: each item is a short phrase of about 3–6 words that fits on one line and reads as a direct answer to "What gives you energy?" / "What drains you?" (e.g. "Exploring untested ideas", "Slow, political decisions"). Not a single word, not a full sentence. Count stays 6–10.

These lists seed `/path` Direction, which validates selections against the exact strings (`app/api/path-direction/route.ts`, `lib/path-direction.ts`). This only affects reports generated after the change; existing reports are not regenerated in this step, so existing Direction sessions are unaffected. Confirm this in your report. #136 (Direction UI) is not part of this step.

## Verification

1. **Investigation report first (stop):** consumers of every field touched; Layer 3 single vs multi-call measurement (output tokens, latency, total generation time vs 240s). Wait for approval.
2. `npx tsc --noEmit` and `npx next build` clean.
3. **Generation run (stop):** run the full pipeline (Detection → Layer 2 → Layer 3) on at least 4 real users' discovery answers, including one with 0 secondary signatures and one with thin evidence. Use a throwaway script in the scratchpad, not committed. Paste the **full** new-field JSON for each user, plus the new `energisers` / `friction_points`, plus all backstop log lines. Do not summarise. Planning reviews the output before any prompt tuning.
4. **/path regression:** using one newly generated report, run Direction (must-haves/must-avoids accept the new phrasing), Options generation and Path report generation end to end, and confirm the Path report renders with no identity context line. Old Path reports render without it too.
5. Confirm existing identity reports (pre-1.4) still load on `/identity` unchanged.

Writing-quality benchmark for review: Jeff's *ZYRRO Identity Text Snapshot* (summarised in the planning brief). Use it to judge output; **do not paste it into the prompt as an example** (worked examples get pattern-matched, see #85).

## Stop conditions

- After the investigation report (verification 1).
- After the first generation run (verification 3): no prompt tuning before planning reviews.
- If any `/path`-read field would need to change shape or meaning: stop and report.
- If total generation time exceeds ~200s on any run: stop and report.

## Done when

New fields generate on real answers to a standard planning has approved; `/path` regression passes; tsc and `next build` clean; committed to `dev`. This brief is deleted when step 1 is live-verified (step 3 renders the fields), not before.
