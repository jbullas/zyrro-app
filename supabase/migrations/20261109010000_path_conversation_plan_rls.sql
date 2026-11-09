-- #169, brief 169-plan-page (decision of 2026-11-09): plan rows are written
-- only by the server, like the other Path conversation artifacts, and only
-- one plan generation runs per user at a time, as for options.
--
-- 1. The three RESTRICTIVE browser-write policies from
--    20261105000000_path_conversation.sql, recreated with
--    path_conversation_plan added. Reads stay on the existing "Users can read
--    their own artifacts" policy.
-- 2. A partial unique index: one generating path_conversation_plan row per
--    user (same as artifacts_one_path_conversation_options_generating_per_user).

DROP POLICY IF EXISTS "Path conversation artifacts not client-insertable" ON public.artifacts;
CREATE POLICY "Path conversation artifacts not client-insertable"
  ON public.artifacts
  AS RESTRICTIVE
  FOR INSERT
  WITH CHECK (type NOT IN ('path_conversation_options', 'path_choice', 'path_conversation_plan'));

DROP POLICY IF EXISTS "Path conversation artifacts not client-updatable" ON public.artifacts;
CREATE POLICY "Path conversation artifacts not client-updatable"
  ON public.artifacts
  AS RESTRICTIVE
  FOR UPDATE
  USING (type NOT IN ('path_conversation_options', 'path_choice', 'path_conversation_plan'))
  WITH CHECK (type NOT IN ('path_conversation_options', 'path_choice', 'path_conversation_plan'));

DROP POLICY IF EXISTS "Path conversation artifacts not client-deletable" ON public.artifacts;
CREATE POLICY "Path conversation artifacts not client-deletable"
  ON public.artifacts
  AS RESTRICTIVE
  FOR DELETE
  USING (type NOT IN ('path_conversation_options', 'path_choice', 'path_conversation_plan'));

CREATE UNIQUE INDEX IF NOT EXISTS artifacts_one_path_conversation_plan_generating_per_user
  ON public.artifacts (user_id)
  WHERE type = 'path_conversation_plan' AND status = 'generating';
