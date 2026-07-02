-- Baseline: captures public.messages as it exists in production.
-- The table was created directly in the Supabase dashboard before this migration
-- history was established. IF NOT EXISTS / OR REPLACE guards make this safe to
-- run against the live DB; on a fresh environment it builds the full table.
-- Prerequisites (fresh build): public.profiles from 20260530000001_profiles_baseline.sql,
-- public.conversations from 20260530000002_conversations_baseline.sql.

CREATE TABLE IF NOT EXISTS public.messages (
  id              uuid        NOT NULL DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL,
  conversation_id uuid        NOT NULL,
  role            text        NOT NULL,
  content         text        NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT messages_pkey
    PRIMARY KEY (id),

  CONSTRAINT messages_role_check
    CHECK (role = ANY (ARRAY['user'::text, 'assistant'::text])),

  CONSTRAINT messages_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES profiles(user_id) ON DELETE CASCADE,

  CONSTRAINT messages_conversation_id_fkey
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_messages_user_id
  ON public.messages (user_id);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id
  ON public.messages (conversation_id);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can delete own messages"
    ON public.messages FOR DELETE
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can insert own messages"
    ON public.messages FOR INSERT
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can view own messages"
    ON public.messages FOR SELECT
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update own messages"
    ON public.messages FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
