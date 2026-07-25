-- #71: path_options and path_plan are now append-only (matching #59's
-- identity_report precedent) — regeneration always INSERTs a new row
-- instead of updating one in place. Add the same race guard #59 added for
-- identity_report: a partial unique index scoped to status = 'generating'
-- blocks two near-simultaneous generation requests from both landing an
-- insert — one for the same user (path_options), one for the same
-- selection key (path_plan, which is scoped by user + path_options_artifact_id
-- + path_id, not user alone). Application code treats the resulting
-- unique-violation error on the losing call as harmless (same swallow
-- pattern as completeDiscovery for identity_report).
CREATE UNIQUE INDEX IF NOT EXISTS artifacts_one_path_options_generating_per_user
  ON public.artifacts (user_id)
  WHERE type = 'path_options' AND status = 'generating';

CREATE UNIQUE INDEX IF NOT EXISTS artifacts_one_path_plan_generating_per_selection
  ON public.artifacts (user_id, path_options_artifact_id, path_id)
  WHERE type = 'path_plan' AND status = 'generating';
