# Brief: #129, Stage C — Develop chosen path, Checkpoint 3, final report+plan

## Context

Full design: `docs/briefs/129-checkpoint-guided-path-selection-design.md`.
Stage A (`cb5cb85`) built the checkpoint infrastructure. Stage B (`bdc0d17`,
`777eb8d`, `02ea1a3`, `d9bf849`, `898ed84`) built the real reasoning pipeline
(Stages 1-4, Checkpoints 1-2) — a user now picks one candidate direction at
Checkpoint 2, and the session lands at `current_stage: 5` with
`chosen_candidate_id` recorded, `status: 'awaiting_checkpoint'`.

Three real sessions already exist in this state from Stage B's verification
(Leona, Katalin, Matteo_Varga — see `docs/changelogs/2026-08-26.md`), ready
to use as real test cases rather than needing fresh personas.

This stage builds Stage 5 (develop the chosen path), Checkpoint 3 (shaping
confirmation), and Stage 6 (the final merged report+plan, written last).
Stage D (`/path` UX rebuild, naming-trigger relocation) is not in scope here.

## Stage 5 — Develop the chosen path (LLM call, no checkpoint)

**Objective:** take the user's Checkpoint 2 pick (`chosen_candidate_id`,
resolved against `stage_outputs.stage4.candidates`) and go deep on it alone
— re-run the friction/evidence check specifically against this one
direction now that it's committed, resolve remaining shape questions (how
far a stretch it is, which signatures anchor it most precisely) with full
attention on one path instead of Stage 4's necessarily lighter multi-
candidate treatment.

**Inputs:** the chosen candidate's record from `stage4.candidates`
(`grounded_in` — which `stage3.surviving` overlaps it consolidates),
`stage3.surviving` itself (full evidence/desire citations), `stage4.discarded`
(needed for Stage 6's "what it's choosing not to be" content — carry
through, don't re-derive), and `stage1` context (`prepared_for`,
`friction_points` again for a second, path-specific pass).

**Grounding:** same citation discipline as Stages 2-4 — every claim in the
developed shape must trace to a real `evidence_citation`/`desire_citation`
already established, or a fresh, equally-real citation from `friction_points`
for this stage's deeper friction pass. No new invented details.

Record via `recordStageOutput(session, 5, ...)`.

## ◉ Checkpoint 3 — "Here's how I'm shaping this for you"

Present the developed direction — thesis, what it draws on, the honest
cost — before full write-up. Use `logExchange` (role `presented`). Numbered
response (`proceed`) → advance via `advanceToStage(session, 6)`. Free text
(`redo`) → re-run Stage 5 with the steer folded in; confirm via direct DB
read that Stages 1-4's outputs (including `chosen_candidate_id`) are
untouched, same isolation discipline as Checkpoints 1-2.

**Redo cap:** same as Checkpoints 1-2 — 2 max, `REDO_CAP` constant, same
cap-exceeded auto-proceed-and-log behavior (design doc §6, still open on
final escalation UX — Stage C inherits Stage B's default, doesn't relitigate
it). At Checkpoint 3 there's no "choice" to auto-select (unlike Checkpoint
2) — cap-exceeded here just means auto-proceeding with the last-generated
Stage 5 shape.

## Stage 6 — Write the full path report + plan (LLM call, no checkpoint)

**Content structure — design doc §4, exactly (revised 2026-08-26, adds the
master strategy section as structured, sequential objectives (not phases —
see §7 below for why phases were rejected) and retires the "7-day action
plan" framing; reordered 2026-08-26, destination now before strategy):**
1. Opening thesis — one strong sentence, `identity_thesis`-style.
2. What this path is — concretely.
3. Why it fits — evidence (capability) and energy (desire) named as two
   distinct threads, overlap explicitly called out. Not one blended
   paragraph.
4. What it's choosing not to be — a sentence or two, reusing Stage 4's
   `discarded` candidates (not Stage 5's own reasoning — the discarded set
   already exists, don't re-derive or invent new rejected directions).
5. The honest cost — tied to a specific `friction_point`, not generic
   difficulty.
6. **The life it leads toward — the destination.** Concrete, evidenced,
   never a happiness promise. Same grounded register as the rest of the
   report. Comes before the strategy: paint the destination, then show
   the route.
7. **The master strategy (how) — an ordered array of core OBJECTIVES, NOT
   phases and NOT a paragraph.** ("Phases" was rejected during design
   discussion — Plan → Research → Execute → Evaluate is exactly the kind of
   cookie-cutter structure this redesign exists to avoid. Objectives encode
   *what matters for this person*, not *the universal shape of doing
   anything*.)

   - **Core objectives only** — the few things that actually determine
     whether this path succeeds, not a checklist of every task involved.
   - **Count is evidence-driven**, same principle as Stage 4's candidate
     count — no fixed quota (not always 3, not always 4). Could be 2, could
     be 5.
   - **Naming convention doubles as the completion signal**: each
     objective's `name` must be shaped "do X by Y so that Z" — specific
     enough that "done" is self-evident from the name alone. "Build
     credibility" fails this (vague). "Establish a track record in
     [specific domain] so that [specific outcome tied to their evidence]"
     passes. Do not add a separate completion/done field — the name IS the
     completion signal.
   - **Strictly sequential ordering** (not parallel). Each objective's
     `sequencing_rationale` must honestly reflect why it sits at this
     point — real dependency (can't succeed until an earlier objective is
     substantially in place), priority (both independently achievable, but
     this matters more first given this person's evidence), or a blend of
     both. Don't force a false "step 1 before step 2" narrative if the real
     reason is a blend — say so.
   - Fields per objective: `name` (X-by-Y-so-that-Z shape), `description`
     (what it actually involves), `sequencing_rationale`, `grounded_in`
     (which citation(s) this objective and its position depend on).
   - Same self-check as every other section: could this exact objective be
     handed to a different user regardless of their evidence? Revise until
     it's inseparable from this person's citations.
   - May reference a discarded Stage 4 candidate if it genuinely helps
     communicate a point — but any such reference must be self-contained
     (don't assume the reader remembers section 4's details by the time
     they reach this section).
   - Matches `/path`'s planned card/stepper rendering — each objective
     independently renderable, not prose Stage D has to re-parse.

**Output shape — each section is its own field, not concatenated prose**
(added 2026-08-26): `/path` is planned to render in the same visual pattern
as `/identity` — each section gets its own eyebrow heading + short help
text + content card(s), per Miroslav. The eyebrow labels and help text are
static, Zyrro-authored copy (Stage D's job, not generated per user), but
Stage 6's JSON output must give Stage D something clean to map onto that
layout without re-parsing prose. Structure the artifact content with each
section as its own named field, matching the reordered structure above:

```
{
  "thesis": "...",
  "what_it_is": "...",
  "why_it_fits": "...",
  "not_this": "...",
  "honest_cost": "...",
  "life_it_leads_toward": "...",
  "master_strategy": [
    { "name": "do X by Y so that Z", "description": "...", "sequencing_rationale": "...", "grounded_in": ["..."] },
    ...
  ],
  "plan_seed_actions": ["...", "...", "..."]
}
```

Same discipline `identity_report`'s existing fields (`cover`,
`primary_constellation`, etc.) already follow — don't collapse this into
one prose block.

**`/plan` seed content (not a full plan generation):** design doc §8 —
`/plan` is a separate, already-existing surface intended for living,
checkable day-to-day task management, and building its actual mutable
artifact shape is explicitly OUT of scope for this brief (new ticket,
not Stage C). What Stage 6 *should* do: generate a small set (e.g. 3-5) of
concrete starting actions grounded in the first objective, as a
distinct field in the `path_checkpoint_result` content, for a future
`/plan`-seeding step to consume. Do not build `/plan`'s UI, storage, or any
checkable/mutable behavior here — just make sure Stage 6's output contains
real, evidenced starting actions somewhere sensible in the artifact, so
that work isn't blocked on Stage C shipping.

Do not call `PATH_PLAN_PROMPT`/`lib/prompts/path-plan.ts` — its "7 day
action plan" framing is superseded. Leave the file in place (may still be
useful reference for tone/conventions of concrete next-actions), but don't
reuse its output shape.

**Grounding:** same self-check as every other stage — could this exact
report be written for a different user with different evidence? The
report's job is to make the "born for" claim *earned*, per this project's
originating conversation about the redesign's purpose — every section
traces to real citations already established across Stages 2-5.

On completion, call `completePathCheckpointSession` (Stage A's existing
function — confirm the name matches current `lib/path-checkpoint.ts`; it
may have been renamed since Stage A shipped, check before assuming) to
write the final `path_checkpoint_result` artifact and mark the session
`complete`.

## What gets replaced vs. what's new

- `PATH_PLAN_PROMPT`/`lib/prompts/path-plan.ts` — superseded by Stage 6's
  merged content, same as `PATH_OPTIONS_PROMPT` was superseded by Stage B.
  Don't delete; Stage 6 may reference its plan-structure conventions.
- No route exists yet to trigger Stage 5/Checkpoint 3/Stage 6 from outside a
  test script — extend `app/api/path-checkpoint-response/route.ts` to
  handle `stage === 5` the same way it already handles `stage === 2` and
  `stage === 4` (proceed/redo, claim-once-upfront, try/catch status-reset
  discipline Stage B already established — don't relax that invariant for
  the new stage).

## Test method

Reuse the three real sessions already at `current_stage: 5` from Stage B's
run (Leona, Katalin, Matteo_Varga) rather than starting fresh — they're
real, already-grounded data. Extend `scripts/verify-129-stage-b.mts` or add
`scripts/verify-129-stage-c.mts` (your call which reads better) covering:
redo at Checkpoint 3 for at least one persona (isolation check), proceed to
completion for all three, and reading back the final `path_checkpoint_result`
artifact content in full.

## Verification checks

- Full terminal output for every check, no summarized output.
- **Grounding**: manually confirm every citation in the final report traces
  to real, already-established evidence — not just Stage 5/6's new claims,
  but that "what it's choosing not to be" genuinely reuses Stage 4's
  `discarded` set rather than inventing new rejected directions.
- **Redo isolation** at Checkpoint 3: confirm Stages 1-4 outputs (and
  `chosen_candidate_id`) are byte-identical before/after a Stage 5 redo.
- **Report quality, read plainly**: does the opening thesis actually read
  as earned given the citations beneath it, or does it default to
  motivational-generic language despite the grounding rules? Report this
  as a judgment call in the changelog, same as Stage B's genericness
  section — don't just assert success.
- **Master strategy quality**: does each objective's naming actually follow
  the "do X by Y so that Z" convention with a self-evident completion
  state, or does it default to vague labels ("Build credibility")? Does
  the sequencing_rationale honestly reflect dependency/priority/blend for
  this specific person, or does it read as generic phases in disguise
  ("Phase 1: Explore...")? Apply the same self-check as the brief's Stage 6
  instructions and report the result honestly for all three personas,
  including if it fails for one.
- **`/plan` seed actions**: confirm the 3-5 starting actions are genuinely
  grounded in the first objective's specifics, not generic first-steps
  boilerplate.

## Explicitly out of scope for this brief

- `/path` UX rebuild, project-naming trigger relocation — Stage D.
- Deleting `PATH_PLAN_PROMPT`/`lib/prompts/path-plan.ts`.
- Resolving the redo-cap escalation UX question definitively (design doc
  §6) — inherit Stage B's default.
- Any change to Stages 1-4 or Checkpoints 1-2's logic.

## Definition of Done for this brief

- Stage 5, Checkpoint 3, and Stage 6 implemented as real (non-placeholder)
  reasoning/generation, built on Stage A/B's state machine unchanged (or
  extended, not replaced).
- `app/api/path-checkpoint-response/route.ts` handles stage 5 alongside
  existing stages 2/4, same status-reset/claim discipline.
- Verified against the three real Stage-B sessions through to a completed
  `path_checkpoint_result`, full terminal output, grounding and report-
  quality findings reported plainly including any weaknesses found.
- Findings logged in the changelog.
- This brief deleted in its own commit once implementation is committed and
  live-verified, tracked in git before deletion (per the corrected Stage A
  practice).
