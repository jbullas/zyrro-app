-- 2.1  Extend artifact type constraint to include path_options and path_plan
ALTER TABLE public.artifacts
  DROP CONSTRAINT IF EXISTS artifacts_type_check;

ALTER TABLE public.artifacts
  ADD CONSTRAINT artifacts_type_check
    CHECK (type IN ('identity_report', 'path_options', 'path_plan'));

-- 2.4  Linkage columns on artifacts (nullable; only populated for path_plan rows)
ALTER TABLE public.artifacts
  ADD COLUMN IF NOT EXISTS path_options_artifact_id uuid
    REFERENCES public.artifacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS path_id text;

-- 2.3  path_selections: append-only event log; latest row per user = active selection
CREATE TABLE public.path_selections (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  path_options_artifact_id uuid        NOT NULL REFERENCES public.artifacts(id) ON DELETE CASCADE,
  path_id                  text        NOT NULL,
  created_at               timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.path_selections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can read own path_selections"
  ON public.path_selections
  FOR SELECT
  USING (auth.uid() = user_id);
