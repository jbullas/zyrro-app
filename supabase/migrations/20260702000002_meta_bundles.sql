CREATE TABLE IF NOT EXISTS public.meta_bundles (
  id          uuid        NOT NULL DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL,
  content     text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT meta_bundles_pkey
    PRIMARY KEY (id),

  CONSTRAINT meta_bundles_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_meta_bundles_user_id_created_at
  ON public.meta_bundles (user_id, created_at DESC);

ALTER TABLE public.meta_bundles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can insert own meta bundles"
    ON public.meta_bundles FOR INSERT
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can view own meta bundles"
    ON public.meta_bundles FOR SELECT
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
