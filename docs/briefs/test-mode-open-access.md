# Brief: Test-mode open-access switch

## Goal
Let anyone test the full funnel on the dev deployment (and on localhost) without
paying and without any per-user manual step. A single environment flag, when on,
treats every **authenticated** user as fully entitled to both tiers (the one-time
paid tier and the subscription tier). When the flag is off/unset, entitlement
enforcement is exactly as it is today.

This bypasses **entitlement (payment) gates only**. It does NOT bypass auth —
testers still sign up and complete the questionnaire to get their own identity
report; the flag only removes the paid/subscriber paywalls beyond that.

## Flag
`OPEN_ACCESS` — string env var, treat `=== 'true'` as on. Default unset = off =
normal enforcement (safe by default). Add a clear code comment at the check:
this must NEVER be set on the production/launch environment.

## Change (prefer central / single-source)
Entitlement gating funnels through `lib/entitlements.ts`:
- `hasEntitlement(userId, product)` is the base check.
- `hasPaidEntitlement(userId)` calls it; `/mentor` calls
  `hasEntitlement(user, 'subscription_payment')`; `/path` and `/plan` use the
  paid check.

Add the short-circuit at the **top of `hasEntitlement`**, before the DB query:
if `process.env.OPEN_ACCESS === 'true'`, return `true` immediately. Because both
products and `hasPaidEntitlement` route through this one function, this opens
every paid/subscriber gate from a single place.

Then **verify against the live code** that every gated surface actually decides
access through these helpers:
- API routes: `generate-path-options`, `select-path`, `mentor`.
- Pages: `app/path/page.tsx`, `app/plan/page.tsx`, `app/mentor/page.tsx`.

If any of them checks entitlement by querying the DB directly instead of through
`hasEntitlement` / `hasPaidEntitlement`, route that check through the helper
(preferred), or apply the same `OPEN_ACCESS` short-circuit there. Don't leave a
gate that ignores the flag.

## Out of scope
Do not touch the DEV grant route/buttons, Stripe/billing, route-hardening
(server-derived auth), or anything else. This is only the open-access flag.

## Acceptance
- With `OPEN_ACCESS` unset: behavior identical to today — confirm a user with no
  entitlement rows is still blocked from `/path`, `/plan`, `/mentor`.
- With `OPEN_ACCESS=true` (set in `.env.local` to test locally): a freshly
  signed-up user with NO entitlement rows can reach `/path`, select a path, see
  `/plan`, and use `/mentor` — with no DB insert anywhere.
- Build clean. Show the diff. Don't commit until reviewed.

## After merge — human step (for Jeff, not code)
- In Vercel, set `OPEN_ACCESS=true` scoped to the **Preview** (dev) environment
  only — NOT Production.
- Add `OPEN_ACCESS=true` to local `.env.local`.
- Leave it unset on Production so the real launch enforces payment.
