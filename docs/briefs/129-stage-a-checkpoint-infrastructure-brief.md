# Brief: #129, Stage A — Checkpoint infrastructure (standalone, placeholder content)

## Context

#129 replaces the current single-shot 4-option path generation with a staged,
checkpoint-guided process ending in one user-chosen, fully-developed path +
plan. Full design: `docs/briefs/129-checkpoint-guided-path-selection-design.md`
(design doc, not this brief — read it for the why and the full 6-stage
process; this brief only covers Stage A's infrastructure).

Stage A builds the plumbing a multi-checkpoint, pause/resume/redo generation
needs, proven with placeholder content before any real reasoning prompts
(Stage B) are built on top of it. This stage does not touch path-options
content, the identity_reframe 409 bug, or any real prompt — those are Stage B.

## What Stage A builds — three distinct pieces

### 1. Session state

New artifact type, proposed `path_selection_session`. One row per user,
**mutated in place**, not append-only (this is working state, not a
deliverable — do not apply the Tier C append-only pattern here).

Fields needed (exact schema is this stage's job to finalize, this is the
minimum shape):
- `current_stage` — which of the process's stages this session is at.
- `status` — `awaiting_checkpoint` | `generating` | `complete`. Use the same
  partial-unique-index-on-`generating` concurrency guard pattern as
  #59/#71 (`artifacts_one_..._generating_per_user`) to prevent a double-click
  race, adapted to this new type.
- Per-stage current output — a JSON field (or fields) holding each stage's
  latest confirmed result (e.g. a placeholder "Stage 2 output" blob, a
  placeholder "Stage 4 candidates including discarded ones" blob, etc., for
  this stage's purposes — real content structure is Stage B/C's job, not
  this one). Must support being overwritten on redo without losing
  already-confirmed earlier stages.

### 2. Checkpoint exchange log

What was presented at each checkpoint, what the user chose or typed.
Structurally reuse the `conversations`/`messages` turn-taking *shape*, but as
a **new, separate table** (not literally writing into mentor's own
`conversations`/`messages`) — this session's exchanges must never be picked
up by mentor's meta-bundle resolution or `last_message_at` staleness
machinery (#45), since this is a bounded, one-off flow, not the ongoing
mentor relationship #45 was built for.

### 3. Final artifact write path (structure only, no real content this stage)

On session completion, the flow must write a normal, append-only Tier C
artifact (reuse `getCurrentArtifact` read pattern, same as
identity_report/path_options/path_plan today) and mark the session row
`complete`. For this stage, write a placeholder content shape — real content
per the design doc's §4 structure is Stage C's job.

## Test method — placeholder content only, no real prompts

Build a standalone script (not wired into any user-facing route) that
exercises the full state machine end to end using placeholder/dummy content
at each stage (no real OpenAI calls needed for this stage — the point is
proving the plumbing, not the reasoning):

1. Create a session, walk it through several stages with placeholder outputs.
2. Simulate a checkpoint: write a placeholder "presented" entry to the
   exchange log, then simulate both outcomes —
   (a) a numbered-choice "proceed" response advances `current_stage` and
   preserves prior stage outputs untouched;
   (b) a free-text "redo" response re-runs only the current stage (overwrite
   that stage's output, leave earlier stages' outputs untouched).
3. Simulate an abandoned session — create a session, stop mid-flow, confirm
   it can be read back later with `current_stage`/`status` intact (this is
   the "closed tab" resumability case).
4. Simulate two concurrent generation attempts for the same user — confirm
   the `generating`-status guard behaves like #59/#71's precedent (loser
   reuses the winner's row rather than erroring the user).
5. Complete a session through to the placeholder final-artifact write,
   confirm it lands as a normal `getCurrentArtifact`-readable Tier C row and
   the session row is marked `complete`.

## Verification checks

- Full terminal output required for every check above — no summarized
  "+N lines" acceptance, matching this project's standing verification
  standard.
- Confirm via direct DB read (not just application-level assertions) that:
  redo overwrites only the current stage's output; earlier stages'
  placeholder outputs are byte-identical before and after a sibling stage's
  redo; the exchange log accumulates entries in order and is queryable
  independently of the session row.
- Confirm the exchange-log table is genuinely separate from
  `conversations`/`messages` (schema check) and that nothing in mentor's
  existing meta-bundle/staleness code path touches it (grep for any query
  that could accidentally pick it up).

## Explicitly out of scope for this brief

- Any real reasoning prompt (capability/desire intersection-finding,
  friction-testing, candidate derivation) — Stage B.
- The `identity_reframe` 409 bug in `generate-path-options/route.ts` — fixed
  as part of Stage B's input rewrite, not here.
- Any change to `app/path/page.tsx` or other user-facing UI — Stage D.
- Final path content structure (§4 of the design doc) — Stage C.
- Any decision about redo-loop caps' user-facing behavior (escalation after
  N redos) — needs a product decision first, log as an open question if it
  becomes blocking, don't decide unilaterally in this stage.
- Resolving #79/#80 outright — this stage's schema choices should be made
  cleanly enough to inform that future decision, but do not block Stage A on
  #79/#80 being formally decided first.

## Definition of Done for this brief

- Three new/adapted schema pieces exist (session state type, exchange-log
  table, final-artifact write path) with migrations committed.
- Standalone test script exercises all 5 scenarios above against a real
  local dev Supabase instance, with full terminal output for each,
  committed as a temporary script per this project's `scripts/` convention
  (deleted before final commit once verified, per standard practice) or kept
  if genuinely reusable for Stage B's testing — Miroslav's call at review.
- Findings logged in the changelog: confirm the schema choices, flag
  anything that felt awkward or likely to need revision once Stage B's real
  content lands on top of it.
- This brief deleted in its own commit once Stage A is committed and
  live-verified, same lifecycle as every other brief in this project.
