# Brief: #129, Stage D — `/path` UX rebuild + naming-trigger relocation

## Context

Full design: `docs/briefs/129-checkpoint-guided-path-selection-design.md`.
Stages A-C (all shipped, pushed to `dev`) built the complete backend: the
checkpoint state machine, the real reasoning pipeline (Stages 1-6,
Checkpoints 1-3), and a working final report artifact
(`path_checkpoint_result`) with a grounded thesis, fit, cost, destination,
master strategy, and plan-seed actions. All of this currently has **no UI**
— `/path` still renders the old 4-card `path_options` browse experience,
which is disconnected from everything Stages A-C built.

This stage builds the actual user-facing surface: a checkpoint-guided
`/path` experience that replaces the 4-card browse UX, plus relocating
project naming (#10) from the old path-selection moment to Stage 6
completion, per design doc §2.

**Scope boundary — read before starting:** this brief does NOT include
fixing the master strategy's residual genericness (design doc changelog,
2026-08-26: later-sequence objectives still lean generic for some
personas) or regenerating the 3 real test personas' saved reports against
the improved prompt. Both are explicitly deferred, kept separate from UI
work — see "Explicitly out of scope" below. If either turns out to block
UI work in a way not anticipated here, stop and flag it rather than
silently expanding scope.

## What currently exists to build on

- `POST /api/generate-path-options` — starts or resumes a
  `path_checkpoint_session`, returns `{ session_id, current_stage, status }`.
- `POST /api/path-checkpoint-response` — accepts `{ role: 'proceed' | 'redo',
  text?, choice? }` for whichever checkpoint (2, 4, or 5 — i.e. Checkpoints
  1, 2, 3) the session is currently awaiting.
- Session `content.stage_outputs` holds each stage's real output —
  Checkpoint 1 shows `stage2` (overlaps), Checkpoint 2 shows `stage4`
  (candidate directions, user picks one), Checkpoint 3 shows `stage5`
  (developed direction). Final delivery reads `path_checkpoint_result`
  (linked via `path_checkpoint_session_id`), containing the 7 named report
  fields (`thesis`, `what_it_is`, `why_it_fits`, `not_this`, `honest_cost`,
  `life_it_leads_toward`, `master_strategy`) plus `plan_seed_actions`.
- Redo/proceed both return `{ session_id, current_stage, status }` — the
  frontend needs to poll for `status` transitioning out of `generating`.

Read `app/api/generate-path-options/route.ts` and
`app/api/path-checkpoint-response/route.ts` directly before starting —
this brief describes their contract from memory of Stage B/C; verify
against the live code rather than trusting this summary alone.

## Part 1 — the checkpoint flow UI

Replace `/path`'s current 4-card browse rendering with a sequential,
checkpoint-driven flow:

- **Kickoff**: on page load (or an explicit "see your paths" action,
  matching whatever currently triggers `path_options` generation today —
  check `app/path/page.tsx`'s existing entitlement-gated entry point),
  call `POST /api/generate-path-options`. Poll or otherwise wait for
  `status` to leave `generating`.
- **Checkpoint 1** (stage 2): present the capability/desire overlaps from
  `stage_outputs.stage2` — numbered choices to proceed, free text to redo.
  Use `ask_user_input_v0`-style numbered-choice UX conventions already
  established elsewhere in this codebase's UI patterns if any exist;
  otherwise build straightforward radio-button-or-similar numbered options
  plus a free-text field, per design doc §3's "no conversation, just
  1/2/3/n choices + type something" framing from the original design
  discussion.
- **Checkpoint 2** (stage 4): present the candidate directions from
  `stage_outputs.stage4.candidates` — this is the real fork, user picks
  one (`choice` = candidate id). Free text = redo.
- **Checkpoint 3** (stage 5): present the developed direction from
  `stage_outputs.stage5` — proceed or redo (no choice needed here).
- **Redo submission**: `POST /api/path-checkpoint-response` with
  `{ role: 'redo', text: <free text> }`. Show the regenerated content once
  status leaves `generating` again.
- **Cap-exceeded handling**: if a redo response comes back already
  auto-forced (check the session/exchange log — `auto_forced: true` per
  Stage B's `logExchange` calls), the UI should reflect that the system
  moved forward automatically rather than silently jumping stages with no
  explanation. Exact copy/treatment is this stage's call — the mechanism
  exists, the UI just needs to not confuse the user when it fires.
- **Final delivery**: once the session reaches `status: 'complete'`, render
  `path_checkpoint_result`'s content as the eyebrow+help-text+card layout
  described in Part 2.

## Part 2 — final report layout, matching `/identity`'s pattern

Per Miroslav: `/path`'s final report should follow the same visual pattern
as `/identity` — each section gets its own eyebrow heading + short help
text + content card(s). Read `app/identity/page.tsx` (and whatever
component(s) it uses for section rendering) directly before building this,
to actually match the established pattern rather than approximate it.

Map the 7 report fields onto that pattern, in this order (destination
before strategy, per design doc §4):
1. `thesis` — likely the page's hero/header moment.
2. `what_it_is`
3. `why_it_fits` — render capability and desire as two visually distinct
   threads if the content structure supports it (Stage 6's prompt asks for
   this distinction in prose; check whether it's cleanly separable or
   needs to stay as one card with clear internal structure).
4. `not_this`
5. `honest_cost`
6. `life_it_leads_toward`
7. `master_strategy` — an array of objectives (`name`, `description`,
   `sequencing_rationale`, `grounded_in`). Render as a stepper or sequence
   of cards (design doc §4 explicitly anticipates this rendering shape) —
   NOT collapsed into prose. Each objective's `name` is already written in
   the "do X by Y so that Z" convention, so it can likely serve directly as
   a card/step title.

Eyebrow labels and help text are static, Zyrro-authored copy — write these
now as part of this brief (they don't exist yet), matching `/identity`'s
tone and the design doc's "no pricing/product language" rules where
applicable (`/path`'s content itself is paid-tier, so this restriction may
not apply the same way — check `/identity`'s actual current copy rules
before assuming).

`plan_seed_actions` needs a place on the page too — design doc §8 says
this is a seed for a future `/plan` surface, not `/plan` itself. For this
stage, render it as a simple list (e.g. "A few places to start") without
building any checkable/mutable behavior — that's explicitly future work.

## Part 3 — project naming relocation (#10)

Per design doc §2: project naming currently fires somewhere around the old
path-selection moment. Locate the current trigger (`grep` for the naming
feature's entry point — likely referenced near the old `path_options`
selection flow) and move it to fire at Stage 6 completion instead — i.e.
once `path_checkpoint_result` is `ready` and the final report is being
shown, not during the checkpoint flow itself. The naming feature's own
code/UI component should be reusable as-is; this is a trigger-point
relocation, not a rebuild. Position it as a natural bridge into whatever
Mentor-subscription CTA currently exists (or is planned) — "you've named
it, let's keep it moving" per the original design discussion — but do not
build new subscription/CTA content if none exists yet; just don't leave
naming orphaned with no next step if a CTA does already exist elsewhere.

## What NOT to touch

- The 4-card `path_options`/`PATH_OPTIONS_PROMPT` code path — leave in
  place, don't delete (unrelated cleanup, not this stage's job).
- `path_plan`/`PATH_PLAN_PROMPT` — same, leave in place.
- Any reasoning/prompt logic in `lib/generate-path-checkpoint.ts` or
  `lib/prompts/path-checkpoint.ts` — this stage is UI only. If the master
  strategy's genericness or the citation-format inconsistency turns out to
  visibly break the UI (not just read as lower-quality), stop and flag
  rather than patching prompts as part of a UI brief.
- `/plan`'s actual mutable task-management system — explicitly future
  work per design doc §8.

## Test method

Manual, in-browser verification (incognito window per this project's
convention) against the 3 real personas already in a `complete` state
from Stage C (Leona, Katalin, Matteo_Varga) for the final-report rendering,
plus a fresh test user taken through the full live checkpoint flow
(kickoff → Checkpoint 1 → 2 → 3 → final delivery) including at least one
redo at any checkpoint, to confirm the UI actually drives the real backend
correctly end to end, not just renders static content.

## Verification checks

- Full walkthrough, screenshots or clear description of each checkpoint
  screen and the final report, at each step confirming the UI state
  matches the session's actual DB state (not just "looks right" — check
  the artifact directly).
- Confirm a redo submission actually changes the displayed content once
  it resolves (not stuck showing stale data).
- Confirm the cap-exceeded/auto-forced case is handled without a confusing
  UI state (test by forcing 3 redos at one checkpoint for a throwaway test
  user).
- Confirm naming's new trigger point fires correctly and the old trigger
  point (wherever it was) no longer does.
- Confirm nothing in `/identity`'s existing rendering broke (this stage
  reads that page/component for pattern-matching — should not need to
  modify it, but verify no accidental shared-component regression).

## Definition of Done for this brief

- `/path` renders the full checkpoint flow live, replacing the 4-card
  browse UX.
- Final report renders in the eyebrow+help-text+card pattern, all 7
  sections plus plan-seed actions present.
- Naming relocated to Stage 6 completion, old trigger removed.
- Verified via real browser walkthrough (not just unit/API-level checks),
  full description of what was checked and how, including at least one
  redo and the cap-exceeded case.
- Findings logged in the changelog, including any UI/UX judgment calls
  made where this brief left specifics open (redo copy, cap-exceeded
  messaging, exact card grouping).
- This brief deleted in its own commit once implementation is committed
  and live-verified, tracked in git before deletion per established
  practice.
