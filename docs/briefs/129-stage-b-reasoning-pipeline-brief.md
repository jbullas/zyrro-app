# Brief: #129, Stage B — Reasoning pipeline + Checkpoints 1–2

## Context

Full design: `docs/briefs/129-checkpoint-guided-path-selection-design.md`.
Stage A (shipped, commit `cb5cb85`, `docs/changelogs/2026-08-26.md`) built the
checkpoint infrastructure — `lib/path-checkpoint.ts` (`startCheckpointSession`,
`claimGeneration`, `recordStageOutput`, `advanceToStage`, `logExchange`,
`completeCheckpointSession`), the `path_checkpoint_session` /
`path_checkpoint_exchanges` / `path_checkpoint_result` schema, and
`scripts/verify-129-stage-a.mts` (kept, reusable) — all proven against
placeholder content only. No real reasoning exists yet.

This stage builds the real reasoning: Stages 1–4 of the design doc
(ingest → capability/desire intersections → friction-test → derive
candidates), plus Checkpoint 1 (evidence/energy read-back) and Checkpoint 2
(the real fork — user picks a direction). Stage 5 (develop the chosen path),
Checkpoint 3, and Stage 6 (final write-up) are Stage C, not this brief.

## Blocking bug fix (do this first, part of the input rewrite)

`app/api/generate-path-options/route.ts` currently hard-requires a ready
`identity_reframe` artifact and 409s without one. `identity_reframe`
generation was retired entirely by #124 — nothing creates that artifact for
any user going forward, so this 409 currently blocks path generation for
every new paying user.

Fix: remove the `identity_reframe` lookup and the 409 branch. Read
`reframe_teaser.forward_frame` off the already-fetched `identity_report`
content instead (added by #124, see `lib/artifact-schemas.ts`'s
`ReframeTeaser` type). This single fix should land as its own small,
independently-verifiable commit before the larger Stage B reasoning work,
since it's a correctness fix, not new feature scope — confirm it alone
unblocks real path generation for a freshly-paid test user before continuing
to the rest of this brief.

Note: `lib/prompts/path-options.ts` still exists and still references
`identity_reframe` as an input key. Stage B's new reasoning pipeline replaces
this prompt's role — see "What gets replaced" below. Don't patch the old
prompt file's `identity_reframe` reference in place; it's being superseded,
not repaired.

## What gets replaced vs. what's new

- `PATH_OPTIONS_PROMPT` (`lib/prompts/path-options.ts`) — the single-call,
  temperature-0 prompt that both selects and writes 4 options at once — is
  superseded by this stage's staged reasoning calls. Do not delete the old
  file yet (Stage C may still reference its "why it fits"/cost-naming prose
  conventions when writing final content); just stop calling it from the new
  flow.
- `app/api/generate-path-options/route.ts` — becomes the entry point that
  kicks off a `path_checkpoint_session` instead of directly generating
  `path_options`. Real routing/UX (Stage D) isn't in scope here, but the API
  surface that starts a session and accepts a checkpoint response needs to
  exist for this stage to be testable.

## Input context — what must reach the reasoning calls

Per the design doc §3 Stage 1, richer than what `PATH_OPTIONS_PROMPT` reads
today:

- Raw `discovery_answers` (all 13, verbatim — question + answer), not just
  `identity_report`'s interpretation of them. Fetch the same way
  `app/identity/page.tsx`'s "Your Answers" section does (#122,
  `mergeAnswersWithQuestions` in `lib/identity-questions.ts`).
- Full `signatures[]` (persisted since #62 — check `identity_report`
  artifact content for the field name/shape actually shipped), not just
  `primary_constellation` (top 5).
- `energisers`, `friction_points` — already on `identity_report`, but need to
  become load-bearing inputs to Stage 2/3's actual reasoning, not background
  context.
- `reframe_teaser.forward_frame` — per the bug fix above, now reachable
  directly off `identity_report`.

## Stage 1 — Ingest full context (no LLM call, no checkpoint)

Pure retrieval: assemble the inputs above into one structured object. Record
via `recordStageOutput(session, 1, ...)`. No user interaction — matches
Stage A's placeholder shape for this stage exactly, just with real data now.

## Stage 2 — Find capability/desire intersections (LLM call)

**Objective:** for each evidenced signature, determine whether it also shows
up in `energisers`/`forward_frame`. Output three groups:
- **Overlaps** — evidenced AND energising. The real candidate pool.
- **Capability-only** — evidenced, no energiser/forward_frame support.
- **Desire-only** — energising signal, thin evidence.

**Grounding rule (carry over from identity-report.ts's existing discipline,
same standard):** every claim must cite the specific evidence_unit or
energiser/friction_point text it's drawn from. No invented overlaps.

**Self-check before finalizing:** could this overlap be found in a different
user's data with the same reasoning? If yes for most/all overlaps, the
prompt is defaulting to generic pattern-matching rather than this user's
specifics — treat as a failure mode to report, same as #85/#96's calibration
discipline.

Record output via `recordStageOutput(session, 2, ...)`.

## ◉ Checkpoint 1 — "Here's where your evidence and your energy line up"

Present the overlaps (and briefly what didn't overlap) as numbered choices +
free text, using `logExchange` (role `presented`). On a numbered response
(role `proceed`), advance via `advanceToStage(session, 3)`. On free text
(role `redo`), fold the text in as a steer and re-run Stage 2 via
`claimGeneration` + `recordStageOutput` overwriting `stage2` only — confirm
via direct DB read that `stage1`'s output is untouched, same isolation check
Stage A's verification script already exercises for placeholder data.

**Redo cap:** 2 redos max at this checkpoint (design doc §6, still open on
exact escalation behavior — for this stage, on exceeding the cap, proceed
with the last-generated version and log it rather than looping indefinitely,
matching #85/#96/#112's "iterate 2-3 rounds, then log and move on"
precedent; revisit if Miroslav wants different behavior).

## Stage 3 — Friction-test the candidates (LLM call, no checkpoint)

Check each surviving overlap against `friction_points`. Drop or reshape
anything that leans hard into what drains the person — this is a filter,
not a generative step, so the output should be a pruned/reshaped version of
Stage 2's overlaps, not new invented content. Record via
`recordStageOutput(session, 3, ...)`.

## Stage 4 — Derive candidate directions (LLM call)

From what survives Stage 3, generate a working set of evidence-grounded
direction themes — name + one-line thesis each, not full option bodies.
Count is not fixed to 4; however many genuine intersections the evidence
supports (design doc §2: "the number and shape of options from the evidence,
not a template"). Record via `recordStageOutput(session, 4, ...)`, including
the full candidate set (both what's shown to the user and what doesn't make
the cut, needed later for Stage C's "what it's choosing not to be" content).

## ◉ Checkpoint 2 — "Here are the directions that fit you" (the real fork)

Present Stage 4's candidate directions as numbered choices + free text. **The
user picks one** (role `proceed`, choice = selected candidate id). On free
text (role `redo`), re-run Stage 4 with the steer folded in, same isolation
discipline as Checkpoint 1 (confirm Stages 1–3's outputs untouched via direct
DB read). Same 2-redo cap and escalation behavior as Checkpoint 1.

On a successful `proceed`, this stage's job is done — Stage 5 (developing the
chosen path) is Stage C's scope, not this brief's. Leave the session in
`awaiting_checkpoint`/appropriate status with the chosen candidate id
recorded, ready for Stage C to pick up.

## Test method

Extend `scripts/verify-129-stage-a.mts` (or a new
`scripts/verify-129-stage-b.mts` building on the same patterns) to run
Stages 1–4 + Checkpoints 1–2 against **real discovery_answers for 2–3
existing real test personas already used elsewhere in this project's
verification history** (reuse named personas from #93/#94/#112/#124's
real-data checks where identifiable, rather than fresh synthetic users) —
real OpenAI calls this time, not placeholder content.

## Verification checks

- Full terminal output for every check, no summarized "+N lines" acceptance.
- **Grounding**: for each Stage 2 overlap and Stage 4 candidate, manually
  confirm the cited evidence/energiser/friction_point text is real and
  actually present in that persona's data, not invented.
- **Genericness self-check**: for 2–3 personas, compare Stage 4's candidate
  sets — do they read as meaningfully different from each other, or do
  similar-sounding candidates recur across different personas regardless of
  their actual data? Report plainly if the old genericness pattern (#25's
  original finding) persists despite richer input — this determines whether
  the temperature/determinism question (design doc §5, "Stage 4 —
  Determinism" per the original outline, folded into this stage's real
  verification) still needs a separate follow-up.
- **Redo isolation**: same direct-DB-read discipline as Stage A — confirm a
  redo at Checkpoint 1 or 2 leaves every other stage's output byte-identical.
- **Bug fix verification**: confirm a freshly-entitled test user can now
  start a path-selection session with no 409, end to end through Checkpoint
  2, using only `reframe_teaser.forward_frame` off `identity_report` (no
  `identity_reframe` artifact exists for this user at all).

## Explicitly out of scope for this brief

- Stage 5 (developing the chosen path), Checkpoint 3, Stage 6 (final
  report+plan content, design doc §4's 6-part structure) — Stage C.
- Any change to `app/path/page.tsx` or other user-facing UI/routing — Stage D.
- Deciding the redo-cap escalation behavior definitively — use the
  log-and-proceed default above, flag as still-open per design doc §6.
- Deleting `lib/prompts/path-options.ts` or `PATH_OPTIONS_PROMPT` — superseded
  but not removed this stage.
- Resolving #79/#80.

## Definition of Done for this brief

- `identity_reframe` 409 bug fixed and independently verified, before the
  rest of the stage's work.
- Stages 1–4 and Checkpoints 1–2 implemented as real (non-placeholder)
  reasoning calls, built on Stage A's `lib/path-checkpoint.ts` state machine
  unchanged (or extended, not replaced).
- Verified against 2–3 real personas' real `discovery_answers`, full terminal
  output, grounding and genericness checks reported plainly (including if
  they fail).
- Findings logged in the changelog: does richer input alone move the needle
  on genericness, or is a follow-up on determinism/temperature still needed
  before Stage C.
- This brief deleted in its own commit once implementation is committed and
  live-verified, tracked properly in git per the Stage A session's corrected
  practice (add before delete, real `git rm`, not a loose untracked file).
