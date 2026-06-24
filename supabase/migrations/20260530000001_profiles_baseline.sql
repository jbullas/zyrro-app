-- Baseline: captures public.profiles as it exists in production.
-- The table was created directly in the Supabase dashboard before this migration
-- history was established. IF NOT EXISTS / OR REPLACE guards make this safe to
-- run against the live DB; on a fresh environment it builds the full table.
-- Prerequisites (fresh build): public.set_updated_at() from
-- 20260530000000_shared_functions.sql, plus auth.users from the Supabase auth schema.

CREATE TABLE IF NOT EXISTS public.profiles (
  user_id     uuid        NOT NULL,
  name        text,
  plan        text        NOT NULL DEFAULT 'free'::text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT profiles_pkey
    PRIMARY KEY (user_id),

  CONSTRAINT profiles_plan_check
    CHECK (plan = ANY (ARRAY['free'::text, 'one_time'::text, 'subscription'::text])),

  CONSTRAINT profiles_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE OR REPLACE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can insert own profile"
    ON public.profiles FOR INSERT
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can view own profile"
    ON public.profiles FOR SELECT
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
