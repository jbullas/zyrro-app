-- Prevents a user from ever having more than one identity_report artifact.
-- Scoped to identity_report only; path_plan and path_options rows are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS artifacts_one_identity_report_per_user
  ON public.artifacts (user_id)
  WHERE type = 'identity_report';
