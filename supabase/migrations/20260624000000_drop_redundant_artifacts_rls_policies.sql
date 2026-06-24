-- Remove duplicate RLS policies on artifacts. Each dropped policy is an exact
-- duplicate of a retained one (same command, role, and auth.uid() = user_id check),
-- so access behavior is unchanged. Verified against pg_policies before running.
DROP POLICY IF EXISTS "Users can insert their own artifacts" ON public.artifacts;
DROP POLICY IF EXISTS "Users can view own artifacts" ON public.artifacts;
