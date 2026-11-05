-- #168: Path conversation on the shared chat engine.
-- Product rules: docs/framework/path-plan-redesign.md. Build plan:
-- docs/briefs/168-path-conversation.md (step 0 approved 2026-11-05).
--
-- Path conversations live in the existing conversations/messages tables,
-- told apart by conversations.kind. Unlike Mentor, the server owns them: it
-- creates the conversation, writes every message, and tracks tokens. The
-- RESTRICTIVE policies below narrow the existing permissive ones
-- (20260530000002_conversations_baseline.sql, 20260702000000_messages_baseline.sql,
-- 20260531000000_artifacts_baseline.sql) so the browser can't write any of it;
-- Mentor rows keep their current client access.

-- 1. conversations: kind, token tracking, in-flight turn guard -------------

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS kind            text        NOT NULL DEFAULT 'mentor',
  ADD COLUMN IF NOT EXISTS tokens_used     integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS token_budget    integer,
  ADD COLUMN IF NOT EXISTS turn_started_at timestamptz;

-- token_budget: ceiling for tokens_used; null means no cap (every Mentor row).
-- A redo raises it to tokens_used + the redo budget at the moment the redo
-- starts, so one running total serves both the first sitting and the redo.
-- turn_started_at: set while a turn is running (conditional-UPDATE claim, same
-- idea as claimGeneration in lib/path-checkpoint.ts); stops double-sends and
-- makes the read-modify-write of tokens_used safe.

ALTER TABLE public.conversations
  DROP CONSTRAINT IF EXISTS conversations_kind_check;

ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_kind_check
    CHECK (kind IN ('mentor', 'path'));

-- One Path conversation per user, which is one per purchase: entitlements is
-- unique on (user_id, product). The one redo reuses this same row.
CREATE UNIQUE INDEX IF NOT EXISTS conversations_one_path_per_user
  ON public.conversations (user_id)
  WHERE kind = 'path';

-- Mentor's browser insert (lib/conversations.ts) doesn't set kind, gets the
-- 'mentor' default and passes. Mentor never updates or deletes conversations
-- from the browser (end-conversation uses the service role).
DO $$ BEGIN
  CREATE POLICY "Path conversations not client-insertable"
    ON public.conversations
    AS RESTRICTIVE
    FOR INSERT
    WITH CHECK (kind = 'mentor');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Path conversations not client-updatable"
    ON public.conversations
    AS RESTRICTIVE
    FOR UPDATE
    USING (kind = 'mentor')
    WITH CHECK (kind = 'mentor');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Path conversations not client-deletable"
    ON public.conversations
    AS RESTRICTIVE
    FOR DELETE
    USING (kind = 'mentor');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. messages: tap choices --------------------------------------------------

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS choices             jsonb,
  ADD COLUMN IF NOT EXISTS selected_choice_ids text[];

-- choices: on an assistant message, the choices offered
--   ({ mode: 'single' | 'multi', max?: number, options: [{ id, label }] }).
-- selected_choice_ids: on a user message, the ids tapped; null when typed.

ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_choices_role_check;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_choices_role_check
    CHECK (choices IS NULL OR role = 'assistant');

ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_selected_choice_role_check;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_selected_choice_role_check
    CHECK (selected_choice_ids IS NULL OR role = 'user');

-- Each Path turn reads the last N messages of one conversation.
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id_created_at
  ON public.messages (conversation_id, created_at);

-- The browser may only write messages in a Mentor conversation it can see.
-- Side effect (accepted): this also stops a user inserting messages into
-- another user's conversation, which the baseline insert policy allowed.
DO $$ BEGIN
  CREATE POLICY "Messages client-writable only in mentor conversations (insert)"
    ON public.messages
    AS RESTRICTIVE
    FOR INSERT
    WITH CHECK (EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id AND c.kind = 'mentor'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Messages client-writable only in mentor conversations (update)"
    ON public.messages
    AS RESTRICTIVE
    FOR UPDATE
    USING (EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id AND c.kind = 'mentor'
    ))
    WITH CHECK (EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id AND c.kind = 'mentor'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Messages client-writable only in mentor conversations (delete)"
    ON public.messages
    AS RESTRICTIVE
    FOR DELETE
    USING (EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id AND c.kind = 'mentor'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. path_profiles: per-conversation profile and state, server-only ---------
--
-- phase:
--   seeding      -> profile being pre-filled from the 13 answers and the report
--   conversation -> the guided conversation
--   summary      -> summary shown, waiting for confirm or correct
--   options      -> three options shown
--   chosen       -> the user picked one (path_choice written)
-- Redo (one per conversation): from options or chosen back to conversation,
-- keeping the confirmed profile, with redo_started_at set (non-null = redo
-- used), summary and summary_confirmed_at cleared, and the conversation's
-- token_budget raised to the redo ceiling. It then goes through summary and
-- options again.

CREATE TABLE IF NOT EXISTS public.path_profiles (
  conversation_id       uuid        NOT NULL,
  user_id               uuid        NOT NULL,
  phase                 text        NOT NULL DEFAULT 'seeding',
  profile               jsonb       NOT NULL DEFAULT '{}'::jsonb,
  context_digest        jsonb,
  summary               jsonb,
  summary_confirmed_at  timestamptz,
  turns                 integer     NOT NULL DEFAULT 0,
  turns_since_progress  integer     NOT NULL DEFAULT 0,
  redo_started_at       timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT path_profiles_pkey
    PRIMARY KEY (conversation_id),

  CONSTRAINT path_profiles_phase_check
    CHECK (phase IN ('seeding', 'conversation', 'summary', 'options', 'chosen')),

  CONSTRAINT path_profiles_conversation_id_fkey
    FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE,

  CONSTRAINT path_profiles_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE
);

-- context_digest: the answers + report digest built at seeding and sent
-- unchanged every turn. summary: the latest summary shown (null until the
-- summary phase; a copy of the confirmed one goes into the options artifact).

CREATE INDEX IF NOT EXISTS idx_path_profiles_user_id
  ON public.path_profiles (user_id);

CREATE OR REPLACE TRIGGER set_path_profiles_updated_at
  BEFORE UPDATE ON public.path_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS on with no policies: the browser can neither read nor write this table.
-- All access goes through the service role, which bypasses RLS.
ALTER TABLE public.path_profiles ENABLE ROW LEVEL SECURITY;

-- 4. artifacts: options and the chosen path ---------------------------------
--
-- path_conversation_options: append-only, one row per generation (first go,
-- each adjustment, the redo's). conversation_id is set. content:
-- {
--   round: number,
--   summary_snapshot: object,
--   profile_snapshot: object,
--   options: Array<{ id: string; name: string; why_it_fits: string;
--                    what_it_looks_like: string; starting_point: string;
--                    what_it_costs: string }>,   -- exactly 3
--   strongest_fit_id: string,
--   why_strongest: string
-- }
--
-- path_choice: append-only (the redo can add a newer one; the latest ready row
-- is the current choice). This is what Plan and Mentor will read later, via
-- getCurrentArtifact. path_options_artifact_id points at the options row it
-- came from. content:
-- {
--   option: { ...the chosen option's fields, copied },
--   was_strongest_fit: boolean,
--   why_strongest: string | null,
--   project_name?: string | null   -- absent = not asked yet, null = skipped
-- }                                -- (same convention as 20260910010000_path_report.sql)

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
      'path_report',
      'path_conversation_options',
      'path_choice'
    ));

CREATE UNIQUE INDEX IF NOT EXISTS artifacts_one_path_conversation_options_generating_per_user
  ON public.artifacts (user_id)
  WHERE type = 'path_conversation_options' AND status = 'generating';

-- Neither type is client-writable. Same RESTRICTIVE pattern as #162
-- (20261019000000_identity_report_unlock_rls.sql), covering insert and delete
-- too. Reads stay on the existing "Users can read their own artifacts" policy.
DO $$ BEGIN
  CREATE POLICY "Path conversation artifacts not client-insertable"
    ON public.artifacts
    AS RESTRICTIVE
    FOR INSERT
    WITH CHECK (type NOT IN ('path_conversation_options', 'path_choice'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Path conversation artifacts not client-updatable"
    ON public.artifacts
    AS RESTRICTIVE
    FOR UPDATE
    USING (type NOT IN ('path_conversation_options', 'path_choice'))
    WITH CHECK (type NOT IN ('path_conversation_options', 'path_choice'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Path conversation artifacts not client-deletable"
    ON public.artifacts
    AS RESTRICTIVE
    FOR DELETE
    USING (type NOT IN ('path_conversation_options', 'path_choice'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
