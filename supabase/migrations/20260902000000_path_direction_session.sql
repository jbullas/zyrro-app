-- #134 Slice 1: Checkpoint 1 "Direction" — a new artifact type replacing the
-- old path_checkpoint_session's Checkpoint 1 (stage 2, "evidence and
-- energy," which just re-showed /identity content — see
-- docs/briefs/134-path-redesign-direction-options-your-path.md §1/§3) with
-- pure structured selection: up to 3 must-haves (from energisers), up to 3
-- must-avoids (from friction_points), and free-text ideal-life. No LLM call
-- anywhere in this flow.
--
-- A fresh schema, not a migration of path_checkpoint_session (brief §7):
-- this session has no LLM stage output to key content by (so no
-- stage_outputs-style blob — content is a flat curation record instead) and
-- no "generating" state to guard a creation race on (every write here is a
-- synchronous user-input save, not a background job).
--
-- content shape: { must_haves: string[] | null, must_avoids: string[] | null,
-- ideal_life: string | null } — see lib/path-direction.ts. `null` means "not
-- yet submitted," distinct from an empty array/string, which is a real
-- answer (the brief allows 0 must-haves/must-avoids and blank ideal-life
-- text). status is 'in_progress' | 'complete', not the Tier C
-- generating/ready/failed vocabulary and not path_checkpoint_session's own
-- generating/awaiting_checkpoint/complete vocabulary — this type has neither
-- a background-generation state nor a checkpoint-review state, just "still
-- filling it in" vs. "done."
--
-- Unlike path_checkpoint_session's precedent (20260826000000), the unique
-- index below is NOT scoped to a specific status. That migration's own
-- comment flags its generating-only partial index as protecting only the
-- creation race, not the full "exactly one row per user, ever" invariant —
-- left to application discipline instead, because that type still has
-- multiple meaningfully-different in-flight statuses to allow. This type
-- doesn't: it is mutated in place with exactly one row per user for its
-- entire life, no append-only history, no in-flight state distinct from
-- "done." A plain per-user uniqueness guard (no status filter) is both
-- simpler and actually enforces that invariant at the DB level rather than
-- relying on app discipline alone.
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
      'path_direction_session'
    ));

CREATE UNIQUE INDEX IF NOT EXISTS artifacts_one_path_direction_session_per_user
  ON public.artifacts (user_id)
  WHERE type = 'path_direction_session';

-- No new RLS policies needed — public.artifacts' existing policies
-- (20260531000000_artifacts_baseline.sql) are scoped to auth.uid() = user_id
-- regardless of type, so they already cover this new type.
