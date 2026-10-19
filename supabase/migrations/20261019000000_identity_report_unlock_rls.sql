-- #162: the Identity report paywall, enforced in the database too.
--
-- app/api/identity-report (service role) is the only place the report is
-- served from; unpaid users get a free projection there. These policies stop
-- a user's own session from going around it:
--
-- 1. SELECT: a user can read their own identity_report row only while holding
--    an active identity_unlock or onetime_payment entitlement. RESTRICTIVE, so
--    it narrows the existing "Users can read their own artifacts" policy
--    rather than replacing it; other artifact types are unaffected.
--
-- 2. UPDATE: no client-side updates to identity_report rows at all. Without
--    this, "Users can update own artifacts" would let an unpaid user run an
--    unfiltered UPDATE (no WHERE, so SELECT policies don't apply) that changes
--    the row's type and then read it. The USING clause hides identity_report
--    rows from updates; WITH CHECK stops any row being turned into one. All
--    identity_report writes go through the service role, which bypasses RLS.
--
-- Live policies on public.artifacts before this migration (pg_policies,
-- 2026-10-19): delete/insert/select/update, each PERMISSIVE, authenticated,
-- auth.uid() = user_id. public.entitlements has "users can read own
-- entitlements" (auth.uid() = user_id), which the EXISTS below relies on.

CREATE POLICY "Identity report requires unlock entitlement"
  ON public.artifacts
  AS RESTRICTIVE
  FOR SELECT
  USING (
    type <> 'identity_report'
    OR EXISTS (
      SELECT 1 FROM public.entitlements e
      WHERE e.user_id = (SELECT auth.uid())
        AND e.product IN ('identity_unlock', 'onetime_payment')
        AND e.status = 'active'
    )
  );

CREATE POLICY "Identity report not client-updatable"
  ON public.artifacts
  AS RESTRICTIVE
  FOR UPDATE
  USING (type <> 'identity_report')
  WITH CHECK (type <> 'identity_report');
