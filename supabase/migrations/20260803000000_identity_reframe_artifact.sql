-- #98: new identity_reframe artifact type — the free-tier pitch content
-- (recap/meaning/reframe/why) moved out of path_options into its own
-- one-per-user artifact, generated eagerly off identity_report completion.
-- Same shape as #71's path_options/path_plan precedent: extend the type
-- constraint, add a partial unique index scoped to status = 'generating'
-- (this is a one-per-user artifact like identity_report, not
-- selection-scoped like path_plan).
ALTER TABLE public.artifacts
  DROP CONSTRAINT IF EXISTS artifacts_type_check;

ALTER TABLE public.artifacts
  ADD CONSTRAINT artifacts_type_check
    CHECK (type IN ('identity_report', 'identity_reframe', 'path_options', 'path_plan'));

CREATE UNIQUE INDEX IF NOT EXISTS artifacts_one_identity_reframe_generating_per_user
  ON public.artifacts (user_id)
  WHERE type = 'identity_reframe' AND status = 'generating';
