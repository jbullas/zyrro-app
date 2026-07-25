# Ticket #71 — Make path_options/path_plan actually append-only

## Context

The documented Artifact Regeneration & Update Policy states Tier C
regeneration always INSERTs a new row and retains prior versions, for all
three artifact types. #59 made `identity_report` actually work this way.
`path_options` and `path_plan` don't — discovered incidentally during #59's
read-site migration, deliberately deferred there as real scope.

**Decision (this session, not in the original ticket text): go with true
append-only, not the "document as an exception" alternative.** Reasoning:
`path_options` depends on `identity_report`, `path_plan` depends on
`path_options` — an UPDATE-in-place write path makes it impossible to ever
regenerate an upstream artifact without silently destroying the downstream
artifacts that reference it, and impossible to let a user revert to an
earlier version of anything. This ticket is deliberately scoped to just the
append-only mechanism — no lineage tracking (#70), no staleness detection,
no cascade-on-regeneration logic. Regenerating `identity_report` today does
not, and will not after this ticket, do anything to existing
`path_options`/`path_plan` rows — they simply keep displaying what they
already displayed. Whether that's the right long-term behavior is a separate
open question (flagged for a follow-up ticket on downstream consistency
policy — see Next).

## Scope

### 1. `app/api/generate-path-options/route.ts`

Remove the `if (existing) { UPDATE } else { INSERT }` branch (currently
lines ~775–808). Always INSERT a new `path_options` row. The existing
`getCurrentArtifact(supabase, user.id, 'path_options', { select: 'id' })`
read that currently feeds the branch decision is no longer needed for that
purpose — remove it unless something else in the function still needs it
(check before deleting).

**Decision point to log**: on a prior `failed` attempt, should the new
INSERT be preceded by deleting the failed row (matching #59's
`kickoffIdentityGeneration` precedent — a `failed` row has no
informational content) or should failed rows just accumulate untouched?
Recommend matching #59's precedent for consistency, but this is a judgment
call — log whichever way you go.

### 2. `lib/generate-path-plan.ts`

The existing-check (currently ~lines 13340–13347, a bare `.maybeSingle()`
scoped to `user_id`+`type`+`path_options_artifact_id`+`path_id`, no status
filter, no ordering) needs to become a "resolve current row for this exact
selection key" query — ordered by `created_at` descending, limited to 1 —
so it doesn't throw once more than one row can exist for the same key. Reuse
`getCurrentArtifact` (see #3 below) rather than a bespoke query.

Behavior once resolved:
- Current row status `generating` or `ready` → unchanged: return its id,
  don't start new work.
- Current row status `failed`, or no row exists → INSERT a new row (same
  failed-row deletion decision as #1 above — keep it consistent within this
  ticket, log the choice once).

Replace the old "UPDATE the failed row's status back to generating" branch
with an INSERT.

### 3. Extend `lib/artifacts.ts`'s `getCurrentArtifact`

Add an optional `match` field to `opts` for extra equality filters beyond
`user_id`+`type`:

```ts
opts: { status?: ArtifactStatus; select?: string; match?: Record<string, string> } = {}
```

Applied via `.match(opts.match)` (or equivalent) alongside the existing
`.eq('user_id', ...)`/`.eq('type', ...)`, before the existing
`.order('created_at', { ascending: false }).limit(1)`. Purely additive —
existing callers (`identity_report`, `path_options` reads) pass no `match`
and are unaffected. This is the one shared place all four `path_plan`
selection-scoped lookups below should route through, matching #59's
single-shared-helper precedent instead of four separate ordered queries.

### 4. Migrate the four `path_plan` selection-scoped read sites onto the
extended `getCurrentArtifact`

All are currently a raw `.maybeSingle()` on
`user_id`+`type='path_plan'`+`path_options_artifact_id`+`path_id`, with no
ordering — each becomes `getCurrentArtifact(supabase, userId, 'path_plan',
{ match: { path_options_artifact_id, path_id }, ...existing status filter
if any, select: ... })`:

- `app/api/select-path/route.ts` — `existingPlan` lookup (currently filters
  `status: 'ready'`; keep that filter).
- `lib/generate-path-plan.ts` — the existing-check covered in #2 above (no
  status filter — needs to see whatever status the current row has to
  decide the branch).
- `app/plan/page.tsx` — `loadPlanArtifact` (currently no status filter —
  keep as-is; the page's own `useGenerationStatus` hook handles displaying
  whatever phase the resolved artifact is in).
- `app/api/mentor/route.ts` — `planArtifact` lookup (currently filters
  `status: 'ready'`; keep that filter).

## Explicit stop conditions

- No changes to `identity_report`'s handling — it's already correct from
  #59.
- No lineage columns, no staleness/consistency logic, no cascade-on-upstream-
  regeneration behavior. This ticket is the write-path + read-site mechanism
  only, matching #59's scope for the other artifact type.
- No changes to `app/api/generate-project-name/route.ts`'s existing
  `path_options` lookup — it's a primary-key lookup by
  `path_options_artifact_id`, already unambiguous, not a "current"
  resolution.
- No UI changes beyond what naturally follows from the backend behavior
  (e.g. don't add any "previous versions" browsing UI — out of scope,
  that's #60-adjacent future work).

## Verification

Live-verify via the `/run` project skill:
- **path_options append-only**: seed a user with a `ready` path_options
  artifact, trigger `POST /api/generate-path-options` again, confirm two
  `path_options` rows now exist for that user (old row untouched, new row
  is what `getCurrentArtifact` resolves as current), and that `/path`
  reflects the new one.
- **path_plan append-only + selection-key resolution**: seed a user with a
  `ready` path_plan for a given `path_options_artifact_id`+`path_id`,
  directly insert a second, newer row for the *same* selection key
  (bypassing the app, simulating a regeneration), confirm all four read
  sites (`/plan` page load, `POST /api/select-path`'s existing-plan reuse
  check, `generatePathPlan`'s own existing-check, `/api/mentor`'s
  context-block lookup) resolve the newer row without throwing.
- **Regression**: normal first-time path-options → path-plan flow (no prior
  rows) still works end-to-end, unchanged from today.
- **Regression**: a `failed` path_plan/path_options attempt followed by a
  legitimate retry still produces exactly one `ready` row reachable as
  current (verifies whichever failed-row decision was made in #1/#2 above
  doesn't leave orphaned or ambiguous state).
- `npx tsc --noEmit` and `npm run build` both clean.
- Teardown all seeded test users per the standard pattern.

## Changelog

Standard dated entry: what changed in each of the 3 files plus the
`getCurrentArtifact` extension, the failed-row-deletion decision and why,
and verification results. Note this closes the gap flagged during #59's
2026-07-23 session 1 (Decisions section) and during this session's
discussion of #71 (append-only chosen over documenting an exception,
because of the artifact-dependency chain and the future need for
regeneration + revert).

## Next (not this ticket — flagging for the board)

- **Downstream consistency policy** — once any artifact type can have
  multiple versions, regenerating an upstream artifact (identity_report,
  or eventually path_options) leaves existing downstream artifacts
  (path_options, path_plan) silently referencing an out-of-date upstream
  version, with no flag, warning, or cascade anywhere. This is a superset
  of #61's narrower "amending answers" framing — the same question applies
  to any upstream regeneration trigger, not just answer edits. Needs its
  own ticket and a real product decision (staleness flag vs. auto-cascade
  vs. something else) before #60-style regen UI should ship broadly.
- #70 (lineage tracking) remains a separate, not-yet-scoped decision — see
  this session's discussion on whether it should absorb the consistency
  policy or stay pure data-model.
