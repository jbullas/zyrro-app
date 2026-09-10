-- #134 Slice 3: "Your Path" final delivery — path_report, a new Tier C
-- append-only artifact type (not a mutated-in-place session like
-- path_direction_session/path_options_session) since this is a genuine
-- permanent deliverable with no checkpoint/redo, per brief §5 ("No
-- user-facing accept/adjust interaction at this stage"). Same category as
-- identity_report/path_options/path_plan, not path_checkpoint_session's
-- family. Named path_report, not path_result or path_checkpoint_result
-- (the retired #129 type this supersedes), to avoid implying a checkpoint
-- that doesn't exist here.
--
-- Status vocabulary: 'generating' | 'ready' | 'failed' — Tier C's own
-- standard vocabulary. ArtifactStatus (lib/artifacts.ts) already declares
-- these three; no widening needed there, unlike path_options_session which
-- had to borrow/extend path_checkpoint_session's own generating/
-- awaiting_checkpoint/complete vocabulary. There is no awaiting_checkpoint
-- state here because there is no checkpoint — generation runs once,
-- straight to ready (or failed), no user decision point on the content.
--
-- content shape (documented here, not SQL-enforced, same convention as
-- every other artifact type in this table):
-- {
--   chosen_candidate: { id: string; name: string; description: string },
--   comments: string,
--   thesis: string,
--   what_it_is: string,
--   why_it_fits: string,
--   honest_cost: string,
--   life_it_leads_toward: string,
--   master_strategy: Array<{ name: string; description: string; sequencing_rationale: string }>,
--   project_name?: string | null
-- }
-- chosen_candidate/comments are a snapshot of what this was generated from
-- (path_options_session's selected candidate + comments at generation
-- time), not a live reference — path_options_session is a singleton per
-- user, resolvable via getCurrentArtifact without a stored FK column, same
-- minimalist precedent as path_options_session's own migration. No new
-- columns on public.artifacts for the same reason.
--
-- master_strategy is a simple prose outline per objective (name,
-- description, sequencing_rationale) — no per-item citation/grounded_in
-- field, unlike the retired Stage 6 shape: nothing in the new Direction/
-- Options data model provides that granularity, and fabricating it would
-- violate the grounding discipline those fields existed to enforce. No
-- not_this section (contrast against rejected options) — once the user has
-- selected, the report focuses on clarity and depth on the chosen path,
-- not justification against alternatives. No plan_seed_actions field in
-- any form — action-step generation belongs to /plan's own future feature,
-- not this report.
--
-- project_name is absent from content until the user is actually asked —
-- set to a real string on a genuine pick, or explicitly to null on "Skip"
-- — same absent-vs-null distinction the retired /api/name-path-result
-- route already established, so /path doesn't re-prompt once already asked
-- regardless of what was chosen.
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
      'path_options_session',
      'path_report'
    ));

-- Standard Tier C race guard — same shape as identity_report/
-- path_checkpoint_result's own precedent: guards the creation/kickoff race
-- only (two concurrent "start generating" calls), not "exactly one row per
-- user, ever" — multiple historical ready/failed rows are allowed and
-- expected, same as every other Tier C type in this table.
CREATE UNIQUE INDEX IF NOT EXISTS artifacts_one_path_report_generating_per_user
  ON public.artifacts (user_id)
  WHERE type = 'path_report' AND status = 'generating';

-- No new RLS policies needed — public.artifacts' existing policies
-- (20260531000000_artifacts_baseline.sql) are scoped to auth.uid() = user_id
-- regardless of type, so they already cover this new type. Same note as
-- path_direction_session/path_options_session's own migrations.
