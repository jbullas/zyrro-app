# #141 (fix) — Retry once on transient Supabase timeout for entitlement/artifact reads

## Confirmed root cause (do not re-investigate, this is settled)

- Vercel logs (incident, 2026-09-13 08:44:01 UTC): `GET /rest/v1/entitlements` for
  user `5b85933f-49d6-4ead-8ec4-7463219b1274` returned **504** (gateway timeout).
  `hasEntitlement` (`lib/entitlements.ts`) discarded that error and returned `false`,
  which `/api/path-options`'s GET handler correctly-per-its-own-logic turned into a
  403 "Payment required" — a false negative caused entirely by the swallowed timeout,
  not a real missing entitlement (confirmed active in the DB at the time).
- Supabase logs for that same window (08:30–09:25 UTC) show this 504 as the *only*
  error of any kind in 631 log lines — everything else, including the same query for
  the same user seconds before and after, returned in under a second.
- Two real-world occurrences exist (2026-09-12 and 2026-09-13), both on a user's
  *first* hit of this flow after a real idle gap (time spent filling in the three
  Direction screens), both resolved instantly by an unmodified retry.
- A 20-attempt synthetic repro (tight loop, no idle gap between seeding and the
  request) reproduced nothing — consistent with this being specifically an
  idle-connection-then-first-query latency issue (a pooled Postgres connection that's
  gone idle needing to re-establish before the next query), not a general flakiness
  or logic bug.
- Conclusion: every real-world first-attempt we have evidence of has failed. This is
  a structural risk on this exact query pattern (first DB read after an idle gap),
  not a rare fluke — treat it accordingly.

## Fix

Add a small shared retry helper for exactly this failure mode — one immediate retry
on a transient error (timeout/504-shaped failure), not a general resilience rewrite:

- New helper (suggest `lib/with-db-retry.ts` or colocated in `lib/artifacts.ts` if
  that reads better) — wraps a Supabase query call, retries **once**, immediately, on
  a transient error only (timeout / gateway-style failure — check what shape
  `@supabase/supabase-js` actually surfaces this as, don't assume a specific error
  code without confirming it against a real reproduction if possible). Not a loop, not
  exponential backoff — the evidence points to "one idle reconnect delay," not
  sustained unavailability.
- Apply it to:
  - `hasEntitlement` (`lib/entitlements.ts`) — confirmed vulnerable.
  - `getCurrentArtifact` (`lib/artifacts.ts`) — same connection/idle-gap mechanism,
    same request lifecycle, used for the `identity_report` and
    `path_direction_session` reads in this exact route (`app/api/path-options/route.ts`)
    right after the same idle period. Fixing this here too is directly justified by
    the confirmed mechanism, not a speculative expansion — but don't touch other
    unrelated call sites of `getCurrentArtifact` beyond what's needed to cover this.
- Keep the existing permanent error logging from the prior fix. Extend it (or add
  alongside): log when a retry was needed and whether it then succeeded — this turns
  a future occurrence into "retried and recovered" vs "failed twice," which is useful
  signal either way.
- Do not touch `/api/path-direction`'s equivalent checks unless trivial to share the
  same helper — if it's a natural fit, use it there too since it has the identical
  vulnerability; if it'd require broader refactoring, leave it for a follow-up ticket
  instead of scope-creeping this fix.

## Verification required

- The tight-loop repro script already proved unable to reproduce this — don't rely on
  it to verify the fix. Instead verify one of:
  - A real repro with a genuine idle gap (seed a test user, wait several minutes with
    no DB activity on that connection, then hit the route) to try to catch a real
    transient timeout and confirm the retry recovers it — accept this may still not
    reproduce on demand, that's expected given the evidence so far.
  - At minimum, confirm by code review + a forced-failure test (temporarily make the
    query throw/timeout artificially in a local test, not in the real DB call) that
    the retry path actually fires and recovers correctly, and that a genuine second
    failure still surfaces as a real error (not silently retried forever or masked).
- Full/expanded terminal output for any test run, not a collapsed summary.
- `tsc` clean project-wide.
- Confirm normal (non-timeout) requests are completely unaffected — no added latency
  or behavior change on the happy path.
