# Brief: generate-report dead-branch cleanup

**Surface:** Claude Code · **Branch:** `dev` · **Priority:** low (tidying)

## Goal

Remove the now-unused "existing artifact → blank then regenerate" branch in
`app/api/generate-report/route.ts`, left over from the removed "Regenerate report"
button. **But verify it is actually unreachable before deleting** — it doubles as
the handler for "user already has an identity_report," not only the Regenerate path.

## The branch in question

In `POST` (`app/api/generate-report/route.ts`), after the `existing` lookup:

```ts
if (existing) {
  await supabase
    .from('artifacts')
    .update({ status: 'generating', content: {} })
    .eq('id', existing.id);
  artifactId = existing.id;
} else {
  // insert new identity_report artifact …
}
```

## Step 1 — Verify (do this first, do not skip)

Confirm no current app flow can POST to `/api/generate-report` for a user who
**already** has an `identity_report` artifact. Trace every caller of this route
(the `/start` questionnaire submit is the main one) and confirm that flow is
gated so users with an existing report can't reach it.

- **If confirmed unreachable:** proceed to Step 2.
- **If a path still exists** (e.g. retaking the quiz, double-submit, back-navigation):
  **stop, do not delete.** The branch is live, not dead. Report back what the
  reachable path is so we decide how to handle duplicates properly. Removing it
  in that case would let the `else` insert run and risk a second `identity_report`
  row — which would then break the `.maybeSingle()` reads on that type.

## Step 2 — Remove (only if Step 1 clears)

- Collapse the `if (existing) / else` into the single insert path.
- Drop the now-unneeded `existing` lookup query and the `let artifactId` /
  reassignment if they become redundant.
- Keep behaviour identical for the normal first-time flow.

## Verify after change

- `next build` clean, no new TS/lint errors.
- First-time report generation still works end-to-end on Preview.

## Scope

- **In scope:** only this branch in this one route.
- **Out of scope / track separately:** the three module-top `console.log` lines
  (lines ~643–645) print env-var lengths and the OpenAI key's first 5 chars on
  every cold start — minor secrets-hygiene smell, separate cleanup, do not touch here.

## Changelog (`session end`)

- **Changed:** what was removed (or, if Step 1 didn't clear, that verification
  found the branch reachable and nothing was deleted).
- **Decisions:** the reachability finding either way.
