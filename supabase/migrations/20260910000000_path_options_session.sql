-- #134 Slice 2 (schema only): Checkpoint 2 "Options" — path_options_session,
-- a new artifacts type replacing the old path_checkpoint_session's Stage 4
-- ("candidates") + Stage 5/6 machinery for this step. See
-- docs/briefs/134-path-redesign-direction-options-your-path.md §4/§7.
--
-- Unlike path_direction_session (20260902000000), this type DOES have a real
-- background-generation state: the initial 4 options and each +2 refine
-- round are LLM calls, not synchronous user-input saves. That makes its
-- shape closer to path_checkpoint_session than to path_direction_session —
-- reused here per this planning session's decision (see session conversation):
--   - status vocabulary: 'generating' | 'awaiting_checkpoint' | 'complete',
--     same three values as path_checkpoint_session, not Tier C's
--     generating/ready/failed and not path_direction_session's own
--     in_progress/complete. No CHECK constraint enforces this — artifacts.status
--     has never had one (20260531000000_artifacts_baseline.sql), same as
--     every other type's status vocabulary in this table.
--   - race-guard shape: a partial unique index on (user_id) WHERE type =
--     'path_options_session' AND status = 'generating', identical in kind to
--     path_checkpoint_session's artifacts_one_path_checkpoint_session_generating_per_user.
--     Same documented limitation as that precedent: this index only protects
--     the *creation* race (two concurrent "start generating the initial 4"
--     calls double-INSERTing). It does not by itself enforce "exactly one
--     row per user, ever" — that's upheld by application discipline (always
--     UPDATE the existing row once one exists), same as path_checkpoint_session.
--     The *second* race — two concurrent attempts to claim generation on the
--     one already-existing row (e.g. a double-click on "generate 2 more") —
--     isn't an insert race and this index does nothing for it; that's a
--     conditional UPDATE in the generation module (an adapted claimGeneration,
--     lib/path-checkpoint.ts's precedent), not a DB-level guard.
--
-- content shape: {
--   candidates: Array<{ id: string; name: string; description: string; round: number }>,
--   selected_candidate_id: string | null,
--   comments: string | null
-- }
-- candidates is append-only across the session's life (§7: append-not-replace
-- is the whole reason this isn't a path_checkpoint_session migration) — round
-- records which generation batch produced each entry (1 = initial 4, 2/3 =
-- refine rounds) for the material-difference check and any future UI/debug
-- need to distinguish batches, but nothing in this migration enforces the
-- 4/6/8 count or the 2-round cap; both are generation-module business rules,
-- not schema constraints, same precedent as path_direction_session's
-- "up to 3" must-haves cap (enforced in validateSelection, not SQL).
-- selected_candidate_id and comments are both null until the user selects an
-- option and (optionally) adds comments on the same screen — Your Path reads
-- comments from here once that step is scoped.
--
-- No new columns needed on public.artifacts: current_stage (added by
-- 20260826000000 for path_checkpoint_session's stage-keyed content) has no
-- equivalent concept here — there's no stage machinery, just a flat
-- candidates array — so it's left unused for this type, same as
-- path_direction_session leaves it unused.
ALTER TABLE public.artifacts
  DROP CONSTRAINT IF EXISTS artifacts_type_check;

ALTER TABLE public.artifacts
  ADD CONSTRAINT artifacts_type_check
    CHECK (type IN (
      'identity_report',
      'identity_reframe',
      'path_options',
      'path_plan',
      'path_checkpoint_session',
      'path_checkpoint_result',
      'path_direction_session',
      'path_options_session'
    ));

CREATE UNIQUE INDEX IF NOT EXISTS artifacts_one_path_options_session_generating_per_user
  ON public.artifacts (user_id)
  WHERE type = 'path_options_session' AND status = 'generating';

-- No new RLS policies needed — public.artifacts' existing policies
-- (20260531000000_artifacts_baseline.sql) are scoped to auth.uid() = user_id
-- regardless of type, so they already cover this new type. Same note as
-- path_direction_session's migration.
