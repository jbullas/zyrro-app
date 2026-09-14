# #146 — Concurrent Supabase auth clients cause lock contention, can hang /path on forever-spinner after checkout

## Status (2026-09-14 session) — NOT Done, part 1 disproven

- **`utils/supabase/client.ts` singleton**: implemented and kept in the codebase as
  good practice (one `GoTrueClient` per tab instead of N), but **confirmed live
  this session that it does NOT fix the lock-contention race** described below.
  The navigator lock (`lock:sb-<project-ref>-auth-token`) is keyed by storage-key
  name, not by client-object identity — every `getUser()` call independently
  calls `_acquireLock`/`navigator.locks.request` with that same name regardless
  of whether callers share one client instance, so Header/BottomNav/`/path`'s own
  entry-gating effect still race each other post-fix exactly as they did
  pre-fix. Forced-race repro: **25/25 failures both before and after the
  singleton change**, against a clean rebuilt dev server. The real fix needs to
  dedupe/serialize the concurrent `getUser()` calls across components — reaches
  into `components/Header.tsx` and `components/BottomNav.tsx`, out of this
  ticket's stated scope. Needs its own ticket, not filed yet.
- **`app/path/page.tsx` backstop**: implemented, and extended beyond the
  original spec after a real gap was found live — `supabase.auth.getUser()`
  doesn't always throw on failure. A retryable fetch failure (the #141-shaped
  transient-outage case this backstop exists for) resolves as
  `{ data: { user: null }, error: AuthRetryableFetchError }` rather than
  rejecting; the original try/catch alone never saw it, and the page silently
  misread it as "not logged in" (`'anonymous'`) instead of showing the error/
  retry state. Fixed by explicitly checking the `error` field (excluding the
  genuine no-session case, `AuthSessionMissingError`, which correctly still
  maps to `'anonymous'`) and throwing it into the same catch block. Verified
  live post-fix: forced outright rejection now correctly lands on the
  `'error'` state with a working retry, not `'anonymous'` and not a stuck
  spinner. The lock-steal error from the race repro (a `NavigatorLockAcquireTimeoutError`,
  not an `AuthError`) was already being caught correctly even before this
  extra check — the race repro's 25/25 "failures" are console errors caught
  and resolved gracefully into the error/retry state, never a stuck spinner
  (`0/25` actually stuck, both before and after the singleton change).
- **Net effect**: the forever-spinner symptom is fixed (backstop works,
  confirmed both for the lock-steal shape and the network-failure shape). The
  underlying lock race itself is NOT fixed — it now surfaces as a visible
  "Something went wrong, Try again" on real page loads under Supabase latency,
  rather than a silent hang, but it still happens on every load where the
  race is lost. This ticket stays open; see the corresponding changelog entry
  for full verification output.


## Problem

`utils/supabase/client.ts`'s `createClient()` returns a fresh `createBrowserClient()`
instance on every call — no singleton. `components/Header.tsx`, `components/BottomNav.tsx`,
and `app/path/page.tsx`'s own entry-gating effect each call `createClient()`
independently on mount, and each call `supabase.auth.getUser()`. All three mount
together on any fresh full page load — including the Stripe redirect back to
`/path?session_id=...` — and race for the same storage-keyed navigator lock
(`lock:sb-<project-ref>-auth-token`, keyed by storage key, not by client instance).

Confirmed live 2026-09-14: console showed `Lock ... was not released within 5000ms`,
a forced steal, then an aborted fetch to `/auth/v1/user` (Chrome reports this as a
false CORS error — the request was killed mid-flight, Supabase never actually
rejected it). When `app/path/page.tsx`'s own `getUser()` call is the one that loses
the race, its `init()` effect never resolves, `pageState` stays `'loading'` forever —
no error shown, no retry path. This is what the user hit right after completing a
real Stripe checkout.

Root-cause audit confirmed this is not caused by anything shipped in the 2026-09-13
session — that session never touched `utils/supabase/client.ts`, `Header.tsx`,
`BottomNav.tsx`, or the entry-gating effect in `app/path/page.tsx`. This is a
pre-existing structural race, not a regression. It's plausibly surfacing now because
of the same Supabase idle-connection latency #141 already documented (idle pooled
Postgres connections needing to reconnect on next query) — that latency widens the
window during which the lock race can actually hit its 5-second contention
threshold. That connection is circumstantial, not proven; treat it as context, not
as something this ticket needs to fix.

## Fix — two parts, both required

1. **Root cause**: make `createClient()` in `utils/supabase/client.ts` a
   module-level singleton — create the `createBrowserClient()` instance once,
   return the same instance on every call. This removes the multi-instance lock
   contention at the source. Check for any other file that currently imports and
   calls `createClient()` from this module to confirm the singleton change doesn't
   break an assumption elsewhere (e.g. something relying on a fresh instance) before
   finalizing.

2. **Backstop, independent of part 1**: `app/path/page.tsx`'s entry-gating `useEffect`
   (the one that calls `getUser()`, checks `session_id`, calls `/api/verify-checkout`,
   loads the identity report and entitlement) has no error handling. Wrap it in
   try/catch. On failure, set an explicit error state and render a retry affordance —
   do not leave `pageState` on `'loading'` indefinitely. This matters on its own:
   Supabase has already shown real transient failures on this project this week
   (#141's 504), so any ungated auth/DB call on this page is a standing risk of the
   same forever-spinner symptom, singleton fix or not.

## Verification — required before Done

A single manual click-through does not prove this fixed; it's a race, not
deterministic. Required:

1. **Forced-race repro script** (throwaway, same discipline as #141's own
   investigation — write it, run it against the real dev server, delete it, not
   part of the repo): seed a synthetic entitled test user, load `/path` fresh (a
   real full page load, not client-side nav — that's what triggers the 3
   simultaneous mounts), and use Playwright route interception to delay the
   `/auth/v1/user` response by 1-2s so the concurrent calls are guaranteed to
   overlap. Run 20-30 iterations.
   - Before the fix: confirm this reproduces the stuck state at least some of the
     time (proves the repro is real, not run this against pre-fix code if that's
     no longer practical — reproducing it once live already satisfies this, don't
     re-break working code just to re-prove it).
   - After the fix: 0/N failures — no lock-contention console errors, no
     aborted-fetch/CORS-shaped errors, `pageState` resolves out of `loading` within
     a bounded time on every run.
2. **Deterministic backstop check**: force one `getUser()` call to reject outright
   via interception. Confirm the page shows the new error/retry state, not an
   infinite spinner. This one should be reliably reproducible every time, since it
   doesn't depend on timing.
3. **One real end-to-end pass**: an actual Stripe test-mode checkout, real redirect
   back to `/path?session_id=...`, in a normal (non-incognito) browser session.

Full/expanded terminal output for all of the above, not a collapsed summary.

## Stop conditions

- Don't touch anything in the Path Report / Options / Direction content pipeline —
  this ticket is scoped to the auth-client singleton and the one entry-gating
  effect's error handling, nothing else in `app/path/page.tsx`.
- Don't apply the singleton pattern speculatively to `utils/supabase/server.ts` or
  `utils/supabase/middleware.ts` — those are per-request server-side clients, a
  different lifecycle, out of scope here.
- If the singleton change surfaces a real behavioral dependency elsewhere in the
  codebase on `createClient()` returning a fresh instance, stop and report it rather
  than working around it silently.
