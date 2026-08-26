-- #129 Stage A: checkpoint infrastructure for the staged, checkpoint-guided
-- path-selection redesign (docs/briefs/129-checkpoint-guided-path-selection-design.md,
-- docs/briefs/129-stage-a-checkpoint-infrastructure-brief.md). Placeholder-content
-- infrastructure only — no real reasoning prompts land here (Stage B). Three pieces:
--
-- 1. path_checkpoint_session (new artifacts type) — unlike every other type in
--    this table, this one is MUTATED IN PLACE (one row per user), not
--    append-only. It is working state for an in-progress checkpoint flow, not
--    a deliverable, so it deliberately does not get the Tier C append-only
--    treatment identity_report/path_options/path_plan get. current_stage is
--    broken out as its own column (same precedent as path_plan's
--    path_options_artifact_id/path_id) since Stage B/C/D will need to
--    query/filter on it directly; per-stage outputs live in the existing
--    `content` jsonb column, keyed by stage.
--
--    Named path_checkpoint_* rather than the Stage A brief's originally
--    proposed path_selection_session, precisely to avoid confusion with the
--    pre-existing, unrelated `public.path_selections` table (#10, project
--    naming / "which path did the user pick" event log — see
--    20260601000001_path_plan_data_model.sql). That table is untouched by
--    this migration and stays exactly as-is — the design doc's §2
--    project-naming relocation reuses that existing mechanism, just moved to
--    fire at Stage 6 completion instead of the old single "pick a card"
--    moment. Renamed after flagging the collision risk, confirmed with
--    Miroslav before writing anything live.
--
-- 2. path_checkpoint_exchanges (new, separate table) — what was presented at
--    each checkpoint and what the user chose/typed. Reuses the
--    conversations/messages turn-taking *shape* (role + content + created_at
--    ordering) but is intentionally its own table, not a row in
--    conversations/messages: mentor's meta-bundle resolution
--    (lib/meta-bundle.ts) and the last_message_at staleness trigger
--    (set_messages_conversation_last_message_at, 20260702000001) are both
--    scoped to the literal table names public.conversations/public.messages,
--    and a Postgres trigger only ever fires for the table it's declared on —
--    so a genuinely separate table is invisible to both by construction, not
--    by convention or naming discipline.
--
-- 3. path_checkpoint_result (new artifacts type) — the final path+plan
--    artifact, written once at Stage 6 completion. This IS a normal Tier C
--    append-only artifact: same getCurrentArtifact read pattern, same
--    generating-guard shape as identity_report/identity_reframe. Type name
--    is provisional — design doc §5 Stage A notes the final content
--    structure (§4) and whether this merges/replaces path_options/path_plan
--    outright is Stage C's decision, not this stage's.
--    path_checkpoint_session_id links a result row back to the session that
--    produced it, same self-referential-FK pattern as path_plan's
--    path_options_artifact_id.

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
      'path_checkpoint_result'
    ));

ALTER TABLE public.artifacts
  ADD COLUMN IF NOT EXISTS current_stage integer,
  ADD COLUMN IF NOT EXISTS path_checkpoint_session_id uuid
    REFERENCES public.artifacts(id) ON DELETE SET NULL;

-- Double-click guard on session creation — same partial-unique-index-on-
-- generating pattern as #59/#71/#98, per the Stage A brief's explicit
-- instruction. NOTE (flagged for review, see session changelog): because
-- this type is mutated in place rather than appended, this index alone only
-- protects the *creation* race (two concurrent "start a session" calls for
-- the same user landing simultaneous INSERTs) — it does not by itself
-- enforce "exactly one row per user, ever," since a second row in a
-- different status wouldn't collide with it. That stronger invariant is
-- upheld by application discipline (lib/path-checkpoint.ts always UPDATEs
-- the existing row once one exists) rather than a DB constraint. A *second*
-- race — two concurrent attempts to claim generation on the one existing row
-- (e.g. a double-click on "proceed" or "redo" once a session is already
-- underway) — isn't an insert race at all and this index does nothing for
-- it; that's handled at the application layer with a conditional UPDATE
-- (claimGeneration in lib/path-checkpoint.ts) instead.
CREATE UNIQUE INDEX IF NOT EXISTS artifacts_one_path_checkpoint_session_generating_per_user
  ON public.artifacts (user_id)
  WHERE type = 'path_checkpoint_session' AND status = 'generating';

-- One-per-user generating guard for the final artifact, matching
-- identity_report/identity_reframe's precedent (this is Tier C append-only,
-- so many resolved rows can exist over time, but never two generating at once).
CREATE UNIQUE INDEX IF NOT EXISTS artifacts_one_path_checkpoint_result_generating_per_user
  ON public.artifacts (user_id)
  WHERE type = 'path_checkpoint_result' AND status = 'generating';

CREATE TABLE IF NOT EXISTS public.path_checkpoint_exchanges (
  id          uuid        NOT NULL DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL,
  session_id  uuid        NOT NULL,
  stage       integer     NOT NULL,
  role        text        NOT NULL,
  content     jsonb       NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT path_checkpoint_exchanges_pkey
    PRIMARY KEY (id),

  CONSTRAINT path_checkpoint_exchanges_role_check
    CHECK (role = ANY (ARRAY['presented'::text, 'proceed'::text, 'redo'::text])),

  CONSTRAINT path_checkpoint_exchanges_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE,

  CONSTRAINT path_checkpoint_exchanges_session_id_fkey
    FOREIGN KEY (session_id) REFERENCES public.artifacts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_path_checkpoint_exchanges_user_id
  ON public.path_checkpoint_exchanges (user_id);

CREATE INDEX IF NOT EXISTS idx_path_checkpoint_exchanges_session_id
  ON public.path_checkpoint_exchanges (session_id, created_at);

ALTER TABLE public.path_checkpoint_exchanges ENABLE ROW LEVEL SECURITY;

-- Append-only log: users can write and read their own exchanges, but there
-- is deliberately no UPDATE/DELETE policy — RLS default-denies both for the
-- authenticated role, so a past entry can never be edited or removed except
-- via the service role (which bypasses RLS entirely, same as every other
-- generation pipeline in this project).
DO $$ BEGIN
  CREATE POLICY "Users can insert own path checkpoint exchanges"
    ON public.path_checkpoint_exchanges FOR INSERT
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can view own path checkpoint exchanges"
    ON public.path_checkpoint_exchanges FOR SELECT
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
