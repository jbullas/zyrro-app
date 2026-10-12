# Brief: #58 (identity part) + #133, identity report prompts

Two changes to the identity report prompts, done in this order:

- **Part A (#58, identity part):** stop generating fields nothing reads.
- **Part B (#133):** investigate first, then stop for a decision. Report content (energisers, friction points, style sections, per-signature fields) may describe domains the user's signatures don't support.

Part A is implemented and verified. Part B is investigation only in this brief: report the findings and a recommendation, then stop. The fix gets decided afterwards.

Separate commits per part. Commit this brief on its own first; delete it in its own commit only after Part B's fix is also done (a later brief or an update to this one), not at the end of Part A.

---

## Part A: remove unused fields from the identity prompts (#58)

### Fields

| Field | Where it's generated | Known readers |
|---|---|---|
| `signature_profile_summary.secondary_signatures` | Layer 2 (`lib/prompts/identity-report.ts`) | None known. Mentor reads only `signature_profile_summary.primary_signatures`. |
| `emerging_signatures`, `suppressed_signatures` | Detection (`lib/prompts/identity-analysis.ts`), copied in `lib/generate-identity-report.ts` | None known. |
| `signatures[].score_band` | Detection | Only the replaced #129 checkpoint flow (`lib/generate-path-checkpoint.ts`, `lib/prompts/path-checkpoint.ts`), which no page calls. |

### Steps

1. **Consumer audit first (read-only).** For each field, search the whole codebase (app, components, lib, scripts, prompts) for every read, and report them. A field with a live reader stays; stop and report if you find one not listed above. Readers in the replaced #129 checkpoint flow don't count as live, but must not crash: they have to handle the field being absent.
2. **Remove each field's instructions and schema lines from the prompts**, and the code that copies or sorts it (e.g. `sortByScoreDescending` on `signature_profile_summary.secondary_signatures`). Keep `signature_profile_summary.primary_signatures`.
3. **Types:** make the removed fields optional in `lib/artifact-schemas.ts` (don't delete them), so stored reports still parse.
4. **Don't touch** anything else in the prompts. No rewording of other rules.

### Verification (Part A)

Detection output at temperature 0 isn't reproducible (OpenAI non-determinism), so compare distributions, not single runs:

- **Detection A/B:** HEAD prompt vs new prompt on the same answers for at least 4 real users (read their discovery answers; write nothing to them), 2 runs each per prompt. Report per user: the primary five (names and order), each primary score, and the secondaries. The change passes if the new prompt's variation stays within the HEAD prompt's own run-to-run variation. Show the full table.
- **Layer 2 A/B:** same input, HEAD vs new prompt, on the same users: word counts of `evidence_analysis`, `how_you_operate` fields, `core_statement`, energisers and friction points. Flag any field that moves more than 10%.
- **Full pipeline** on 2 of those users: report generates (schema 1.4, all Layer 3 fields present), every existing backstop log line reported in full.
- **Old reports:** a pre-1.4 report and a 1.4 report that still contain the removed fields render on `/identity` unchanged (screenshot at 1280).
- **Mentor:** one live Mentor reply for a synthetic user with a new report: 200, and the context block still lists the primary signatures.
- `npx tsc --noEmit` and `npx next build` pass. Verification scripts are temporary and deleted before committing.

### Stop conditions (Part A)

- Any field turns out to have a live reader.
- The Detection A/B shows the new prompt shifting the primary five or scores beyond HEAD's own run-to-run variation.
- Removing a field would need rewording any other prompt rule.

---

## Part B: investigate domain grounding (#133), report, stop

### The concern

The original evidence (a pre-1.4 sample) showed energisers, friction points and style sections describing domains outside the user's primary constellation, e.g. people-and-relationship content for someone with no Connecting signatures. #154 since rewrote much of the report and added per-signature fields (works with, operating notes, friction, under pressure), so whether this still happens, and how often, is unknown.

### Investigation (read-only except temporary synthetic data)

1. Generate fresh 1.4 reports from the real discovery answers of at least 5 users (nothing written to those users), or reuse the Part A full-pipeline outputs where possible to save tokens.
2. For each report, classify every energiser, friction point, style-section item and per-signature field into one of the five domains (Visioning, Thinking, Connecting, Driving, Sensing), or "none/general". Use an LLM judge in a temporary script with a strict rubric that you show in full; spot-check at least 20 classifications by hand and report agreement.
3. For each item, record whether its domain is among the user's **primary** domains, only among their **secondary** domains, or **absent** from both.
4. For flagged items, check whether the user's discovery answers support them anyway (quote the answer if so). Content grounded in the user's own answers may be correct even if no signature covers that domain.

### Report back

- Counts and rates per field type: in primary domains / secondary only / absent / grounded in answers anyway.
- 5 to 10 concrete examples of absent-and-ungrounded items, with the user's signatures.
- Whether the problem still exists at a level worth fixing after #154.
- A recommended fix, choosing among: a prompt constraint, a log-only backstop, a backstop that drops items, or no change. Say which domains should count as "grounded": primary only, or primary plus secondary.
- Token cost of the investigation (the org limit is 30k tokens per minute; space the calls).

Then stop. No prompt or code changes for #133 in this brief.

---

## Commits

1. This brief, on its own.
2. Part A: one commit (prompts, generation code, types).
3. Part B: none (investigation only). Keep the brief.
