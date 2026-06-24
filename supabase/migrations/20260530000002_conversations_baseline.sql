-- Baseline: captures public.conversations as it exists in production.
-- The table was created directly in the Supabase dashboard before this migration
-- history was established. IF NOT EXISTS / OR REPLACE guards make this safe to
-- run against the live DB; on a fresh environment it builds the full table.
-- Prerequisites (fresh build): public.set_updated_at() from
-- 20260530000000_shared_functions.sql, plus public.profiles from
-- 20260530000001_profiles_baseline.sql.

CREATE TABLE IF NOT EXISTS public.conversations (
  id          uuid        NOT NULL DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL,
  title       text,
  status      text                 DEFAULT 'active'::text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT conversations_pkey
    PRIMARY KEY (id),

  CONSTRAINT conversations_status_check
    CHECK (status = ANY (ARRAY['active'::text, 'completed'::text, 'archived'::text])),

  CONSTRAINT conversations_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES profiles(user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_conversations_user_id
  ON public.conversations (user_id);

CREATE OR REPLACE TRIGGER set_conversations_updated_at
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can delete own conversations"
    ON public.conversations FOR DELETE
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can insert own conversations"
    ON public.conversations FOR INSERT
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can view own conversations"
    ON public.conversations FOR SELECT
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update own conversations"
    ON public.conversations FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
