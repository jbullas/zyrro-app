# Brief: Tension Rule — normalize tense, add evidence-grounding requirement

## Background
Ticket #85 originally scoped as a full rewrite of the Tension Rule's worked
examples, based on a 2026-07-28 review finding them "flattering humblebrag."
Real-data check (2026-08-01) against all 12 real users' current
identity_report tension lines did not confirm that finding — external
triggers (pace mismatches, environment type) are legitimate self-located
friction descriptions, not blame-shifting, once actually inspected line by
line.

Two different, real, evidence-confirmed issues surfaced instead:

1. **Tense inconsistency.** ~10 of 50 real tension lines are definite
   ("you struggle," "you become"); the rest are already conditional
   ("you may/might"). Clusters by report (one report 5/5 definite, most
   others majority conditional, one report using a third structure
   entirely) — the current prompt specifies no tense/structure at all.
2. **No evidence-grounding requirement on this field.** Every other
   primary-signature field (`evidence_analysis`) requires real story
   anchors from this user's own evidence_units. Tension has none — it's
   the one field with zero grounding instruction, which is why some
   reports drift toward signature-generic phrasing. The fix is requiring
   groundedness, not banning reuse: two users' real evidence can
   legitimately produce similar wording.

## Change
In `lib/prompts/identity-report.ts`, replace the `## THE TENSION RULE`
section (rule text + three worked examples) with:

    Every primary signature analysis must include one tension.

    The tension must be specific and behavioural, and must derive from a
    concrete situation in this user's own evidence_units — not a generic
    description of what this signature typically does. Two different users
    can legitimately produce similar tension lines if their real evidence
    points to a similar friction; the requirement is that the line is
    genuinely grounded in this person's material, not that it be unique.

    Write in conditional voice (may/might), describing a tendency the
    pattern creates, not a documented fact.

    Examples:
    - Builder: "You may struggle when momentum depends on people who move
      slower than you."
    - Truth Seeker: "You may become restless in environments built on
      politeness over honesty."
    - Amplifier: "You may overinvest in others and underinvest in
      yourself."

    Tension increases recognition.

## Scope
- `lib/prompts/identity-report.ts` only, the Tension Rule section.
- No schema change — `tension` field type/length unchanged.
- No `schema_version` bump — consistent with #84/#86/#87 precedent (prompt
  behavior changes without a JSON-shape change haven't bumped it; the gap
  itself is tracked separately under #91).
- Do not touch any other rule (Evidence Rule, Specificity Rule, Evidence
  Reuse Rule, etc.).

## Verification
- `npx tsc --noEmit` and `npm run build` clean.
- Real end-to-end generation via `scripts/run-verification.mts` (synthetic
  user) — confirm tension lines render in conditional voice.
- Changelog entry per `AGENTS.md`.

## Stop condition
If a fresh synthetic generation still produces definite-tense tension
lines despite the rule change, stop and report rather than iterating on
wording further.
