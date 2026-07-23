-- #59: identity_report is a Tier C (append-only) artifact per the Artifact
-- Regeneration & Update Policy, same as path_options and path_plan — a
-- regeneration INSERTs a new row, never UPDATEs, and "current" is the most
-- recent row by created_at. The original index (2026-06-22) didn't look at
-- status, so it also blocked a legitimate new version once an older row
-- resolved to ready/failed. Narrow it to only guard the dangerous window:
-- two near-simultaneous kickoffIdentityGeneration() calls for the same user
-- both passing the "does a live artifact exist?" check before either insert
-- lands.
DROP INDEX IF EXISTS artifacts_one_identity_report_per_user;
CREATE UNIQUE INDEX artifacts_one_identity_report_per_user
  ON public.artifacts (user_id)
  WHERE type = 'identity_report' AND status = 'generating';
