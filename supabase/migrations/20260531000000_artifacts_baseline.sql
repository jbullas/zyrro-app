-- Baseline: captures public.artifacts as it exists in production.
-- The table was created directly in the Supabase dashboard before this migration
-- history was established. IF NOT EXISTS / OR REPLACE guards make this safe to
-- run against the live DB; on a fresh environment it builds the full table.
-- Prerequisites (fresh build): public.set_updated_at() from
-- 20260530000000_shared_functions.sql; public.profiles from
-- 20260530000001_profiles_baseline.sql; public.conversations from
-- 20260530000002_conversations_baseline.sql.

CREATE TABLE IF NOT EXISTS public.artifacts (
  id                        uuid        NOT NULL DEFAULT gen_random_uuid(),
  user_id                   uuid        NOT NULL,
  conversation_id           uuid,
  access_level              text        NOT NULL DEFAULT 'free'::text,
  type                      text        NOT NULL,
  content                   jsonb       NOT NULL,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  status                    text                 DEFAULT 'generating'::text,
  path_options_artifact_id  uuid,
  path_id                   text,

  CONSTRAINT artifacts_pkey
    PRIMARY KEY (id),

  CONSTRAINT artifacts_access_level_check
    CHECK (access_level = ANY (ARRAY['free'::text, 'paid'::text])),

  CONSTRAINT artifacts_type_check
    CHECK (type = ANY (ARRAY['identity_report'::text, 'path_options'::text, 'path_plan'::text])),

  CONSTRAINT artifacts_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE,

  CONSTRAINT artifacts_conversation_id_fkey
    FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE,

  CONSTRAINT artifacts_path_options_artifact_id_fkey
    FOREIGN KEY (path_options_artifact_id) REFERENCES public.artifacts(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_artifacts_user_id
  ON public.artifacts (user_id);

CREATE INDEX IF NOT EXISTS idx_artifacts_conversation_id
  ON public.artifacts (conversation_id);

CREATE OR REPLACE TRIGGER set_artifacts_updated_at
  BEFORE UPDATE ON public.artifacts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.artifacts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can delete own artifacts"
    ON public.artifacts FOR DELETE
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can insert own artifacts"
    ON public.artifacts FOR INSERT
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can insert their own artifacts"
    ON public.artifacts FOR INSERT
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can read their own artifacts"
    ON public.artifacts FOR SELECT
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update own artifacts"
    ON public.artifacts FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can view own artifacts"
    ON public.artifacts FOR SELECT
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
