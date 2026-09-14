# #146 — Concurrent Supabase auth clients cause lock contention, can hang /path on forever-spinner after checkout

## Status (2026-09-14, addendum session) — NOT Done: real Stripe checkout pass outstanding

Real fix landed and verified by every synthetic/seeded-session check this
addendum required: `docs/briefs/146-addendum-dedupe-getuser.md`. Root
cause was concurrent `getUser()`/`getSession()` calls, not multiple client
instances (that theory is what the singleton below disproved). New
`lib/use-auth-user.tsx` (`AuthUserProvider` + `useAuthUser()`) calls `getUser()`
exactly once per full page load, mounted once at `app/layout.tsx`, and every
call site that used to independently call `createClient()` + `getUser()`/
`getSession()` on mount now reads from it instead:
`components/Header.tsx`, `components/BottomNav.tsx`, `components/IdentityCard.tsx`,
`components/MomentumCard.tsx` (found mid-verification — both render together on
`/dashboard` and had the identical independent-call pattern, not on the
addendum's original page-level list, but the same bug), `app/path/page.tsx`,
`app/dashboard/page.tsx`, `app/account/page.tsx`, `app/identity/page.tsx`,
`app/plan/page.tsx`, `app/start/page.tsx`. `app/mentor/page.tsx`'s initial
check is deduped the same way, but its `onAuthStateChange` subscription is
deliberately KEPT (not stripped like the addendum brief assumed) — real,
load-bearing behavior once Stripe subscription billing (#30) ships and real
users can reach the chat, not incidental reactivity; logged as an explicit,
accepted exception, not an oversight. `app/login/page.tsx`/`app/signup/page.tsx`
audited and confirmed clean — neither ever called `getUser()`/`getSession()`
at all. Two deliberate non-dedup exceptions, both by design: `/path`'s own
retry button and `/identity`'s `handleRetry` still make their own direct,
fresh `getUser()` call — both are one-off, user-triggered actions that fire
well after mount, never concurrent with the shared hook's own fetch, so
reusing the one-shot cached value there would make retry retry nothing.

Verified live: forced-race repro against `/path` and `/dashboard` (25
iterations each, `/auth/v1/user` delayed ~3s per request) — **exactly 1
request and 0 lock-contention console lines per page load, 25/25, both
pages** (previously 25/25 lock-contention failures on `/path` even after the
singleton). Real browser pass, logged in and out, across `/dashboard`,
`/identity`, `/path`, `/plan`, `/start`: Header's avatar/login-icon and
BottomNav's active-tab logic all correct — 30/30 assertions. Re-ran the
already-landed backstop check (forced outright `getUser()` rejection) through
the new plumbing to confirm the restructuring didn't silently break it: still
reaches the `'error'` state with a working retry, not `'anonymous'`, not
stuck. Broader smoke pass across all 7 converted pages logged in: zero stuck
states, zero console errors.

**Not Done, and here's why that's a real gap, not a formality**: the
*original* #146 brief's verification section (below) requires three things
before Done, and one of them — "an actual Stripe test-mode checkout, real
redirect back to `/path?session_id=...`, in a normal (non-incognito) browser
session" — has never actually been run, in this session or the prior one.
Every check done across both sessions used a synthetic bootstrapped test user
(`generateLink` + `/auth/callback`) or forced route interception, never a
real `/api/checkout` → Stripe hosted page → real redirect round-trip. That
matters here specifically: the whole ticket exists because a real user hit
this bug *right after a real Stripe checkout redirect* — the one navigation
type guaranteed to remount everything at once, per the addendum's own root-
cause section. A synthetic full-page-load repro is strong evidence the fix
generalizes, but it is not the same event as the one that actually happened
to a real user, and per this project's Definition of Done, "the code is
provably unchanged/verified another way" is supporting evidence, never a
substitute for a passing live test of the actual path in scope. This session
didn't attempt it because `NEXT_PUBLIC_SITE_URL` isn't set in `.env.local` (so
`/api/checkout`'s `success_url`/`cancel_url` don't resolve to a usable local
redirect), not because it was judged unnecessary — that's a blocker to route
around, not a reason to skip the check. Closing this ticket needs one of:
(a) set `NEXT_PUBLIC_SITE_URL` locally and actually run the real checkout
pass, or (b) Miroslav's explicit, logged acceptance of this specific
untested gap (Definition of Done path 3) — not an agent's own judgment that
the risk is probably low.

Full terminal output for all of the above is in the corresponding changelog
entry, not just this summary.

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
