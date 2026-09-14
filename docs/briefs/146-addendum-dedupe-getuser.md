# #146 — Addendum: dedupe concurrent getUser() calls (the real fix)

Per 2026-09-14 session: the singleton on `utils/supabase/client.ts` does not fix
this ticket's actual race. The navigator lock is keyed by storage-key name, not
client-object identity, so concurrent `getUser()` calls from separate call sites
contend for the same lock regardless of how many client instances exist. This
addendum is the real fix, staying under #146, not a new ticket.

## Root cause, precisely

`components/Header.tsx`, `components/BottomNav.tsx` (both mounted on every page
via `app/layout.tsx`), and `app/path/page.tsx`'s own entry-gating effect each
independently call `createClient()` then `supabase.auth.getUser()` on mount. On
any fresh full page load, all of them fire near-simultaneously, so it's not just
`/path`, every single page in the app has this same 2-or-3-way concurrent
`getUser()` call pattern, `/path` just happens to be where it's been observed
because it's the page a user lands on right after a real external redirect
(Stripe), which is the one navigation type guaranteed to remount everything at
once.

## Fix

Eliminate the duplicate calls, don't just reduce client instances. Recommended
shape:

- A single client-side auth-state provider (React Context) mounted once at
  `app/layout.tsx`, calling `getUser()` exactly once per page load, exposing
  `{ user, loading, error }` (or equivalent) via a hook, e.g. `useAuthUser()`.
- `Header.tsx` and `BottomNav.tsx` switch from their own independent
  `createClient()` + `getUser()` calls to this shared hook.
- `app/path/page.tsx`'s entry-gating effect also consumes the shared hook's
  `user` instead of calling `getUser()` itself — the rest of that effect
  (`session_id` check, `/api/verify-checkout`, identity report load, entitlement
  check) is unchanged, only the initial user-fetch is deduped.
- **Audit every other page for the same pattern before finishing** —
  `app/dashboard/page.tsx`, `app/account/page.tsx`, `app/identity/page.tsx`,
  `app/mentor/page.tsx`, `app/plan/page.tsx`, `app/login/page.tsx`,
  `app/signup/page.tsx`, `app/start/page.tsx` — any of these calling
  `createClient()` + `getUser()` independently on mount has the exact same
  latent race as `/path` did, just never yet observed there. Switch every one
  found to the shared hook, don't leave `/path` as the only page fixed.
- Preserve existing behavior: none of the current call sites subscribe to
  `onAuthStateChange` (confirmed via the codebase as it stands) — the shared
  hook should match that (one fetch per page load, no new live-reactivity
  requirement), not introduce new behavior beyond removing the duplication.

## Stop conditions

- Don't touch the Path Report/Options/Direction content pipeline.
- Don't add `onAuthStateChange` subscription or any new reactivity beyond what
  already exists, unless doing so is required to make the shared-hook
  refactor work at all — if so, stop and report rather than deciding
  unilaterally.
- If any audited page turns out to depend on getting a *fresh* `getUser()`
  call rather than a shared/cached one (e.g. right after an action that
  changes auth state), stop and report that case specifically rather than
  silently leaving it on the old pattern or forcing it onto the shared hook
  anyway.

## Verification

- Re-run the forced-race repro from #146's original brief, but this time
  against `/path` AND at least one other audited page. Expect not just 0
  stuck spinners (already true from the backstop) but 0 lock-contention
  console lines at all, since with one `getUser()` call per page load there's
  nothing left to contend.
- Confirm Header's avatar / BottomNav's active-tab logic still work correctly
  post-refactor (they depend on knowing the current user) — a quick real
  browser pass logged in and logged out, not just a `tsc` check.
- Full/expanded terminal output, not a collapsed summary.
