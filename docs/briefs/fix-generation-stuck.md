# Brief: Fix generation stuck on "waiting" (serverless fire-and-forget)

## Problem (confirmed)
`/api/generate-report` and `/api/generate-path-options` insert an artifact as
`status:'generating'`, then call `void runGeneration(...)` (fire-and-forget) and
return `200` immediately. On Vercel the function freezes/terminates after the
response, so the un-awaited work — the OpenAI calls and the final
`status:'ready'` / `'failed'` update — isn't guaranteed to run. The row stays
`generating` forever and the polling UI hangs on the waiting screen.

Verified: a real dev-site run left the `identity_report` row at
`status='generating'` with empty `content` — neither the success update nor the
`catch` (`failed`) update ran, i.e. the function was killed mid-flight.

## Fix
Replace fire-and-forget with `after()` from `next/server`. `after()` runs work
after the response is sent, and Vercel keeps the function alive for it (bounded
by `maxDuration`). Add `maxDuration = 60` — the Hobby plan's hard ceiling.

## Changes
In **both** `app/api/generate-report/route.ts` and
`app/api/generate-path-options/route.ts`:

1. Add the import: `import { after } from 'next/server';`
2. Add at module scope (top level, not inside the handler):
   `export const maxDuration = 60;`
3. Replace the `void runGeneration(...)` call with:
   `after(() => runGeneration(...));`
   Keep the exact same arguments. Keep the immediate
   `return NextResponse.json({ artifact_id: artifactId });` right after it.

Do **not** change `runGeneration`'s internals, the polling pages, or anything else.

## Also check (don't assume)
`app/api/select-path/route.ts` generates a `path_plan` artifact and returns an
`artifact_id`. Inspect the live code:
- If it kicks off generation un-awaited (same fire-and-forget pattern) → apply
  the identical `after()` + `maxDuration = 60` fix.
- If it generates inline/awaited → just add `export const maxDuration = 60;` so
  it can't hit the default short timeout.
- If neither applies → leave it untouched and note that in the changelog.

## Acceptance
- Redeploy to dev.
- Run the questionnaire end-to-end on the dev site: the `identity_report` row
  flips to `status='ready'` with non-empty content, and the waiting screen
  resolves into the rendered report.
- Same check for path options on `/path`.
- **If a run still hangs / 504s near the 60s mark**: stop and report back.
  Generation likely exceeds the 60s Hobby ceiling and needs a separate
  timing/plan decision (not part of this brief).

## Out of scope
Route-hardening (server-derived auth on these routes), Brief B billing,
conversation resume. Don't touch them here.
