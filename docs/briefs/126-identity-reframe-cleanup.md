# Brief: #126 Remove dead identity_reframe code

#124 retired the separate `identity_reframe` artifact: the free-tier pitch is now `reframe_teaser`, generated inside the identity report. The old route, prompt and types are still in the repo. Remove them. This is cleanup only: no behaviour, output or UI may change.

**Name clash, read first:** `reframe_teaser`, `ReframeCtaBlock` and the reframe copy on `/identity` and `/path` are **live** and stay untouched. Only the retired `identity_reframe` artifact and its code go.

One implementation commit. Commit this brief on its own first, and delete it in its own commit once the removal is committed and verified.

---

## Step 1: audit (read-only), report before deleting anything

List every reference to `identity_reframe`, `identity-reframe`, `IdentityReframe` and `IDENTITY_REFRAME` across app, components, lib, scripts and prompts, and classify each one:

- **Dead and removable**, expected to include:
  - `app/api/generate-identity-reframe/route.ts` (nothing calls it)
  - `lib/prompts/identity-reframe.ts`
  - the `identity_reframe` member of the artifact type union in `lib/artifacts.ts`
  - the `identity_reframe` types in `lib/artifact-schemas.ts`
  - the comment mention in `lib/generation-status.ts`
- **Old flow that only consumes it:** `lib/prompts/path-options.ts` (the pre-#129 `PATH_OPTIONS_PROMPT`, which expects an `identity_reframe` input). Find every importer. If the prompt is used only by dead code (e.g. `app/api/generate-path-options/route.ts`), report that chain. **Don't confuse it with the live `path-options` code** (`app/api/path-options`, `lib/path-options-session.ts`, `lib/prompts/path-options-session.ts`, `lib/generate-path-options-session.ts`, `lib/use-path-options.ts`, `components/OptionsFlow.tsx`), which must not be touched.
- **Verification harness:** `scripts/verification/session.mts` mentions `identity_reframe` (probably teardown cleanup). Report what it does. Keep it if it deletes stored rows of that type, since such rows can still exist.
- **Anything else** you find.

Also count, read-only, the `identity_reframe` rows in the dev Supabase `artifacts` table, and report the number.

## Step 2: remove

- Delete the dead route and prompt files, the type-union member and the schema types, and fix the comment.
- `lib/prompts/path-options.ts` and any dead route that is its only user: remove them **only if** the audit shows nothing live reaches them. Otherwise leave them and report.
- Any other dead old-flow code you find beyond these (e.g. old checkpoint routes): **report it, don't remove it.** It belongs to a separate ticket.
- **Database: no changes.** Don't edit or delete the applied migration `20260803000000_identity_reframe_artifact.sql`, and don't add a migration. The `artifacts.type` constraint keeps allowing `identity_reframe`, so existing rows stay valid.
- Comments elsewhere that cite removed files should point at the relevant changelog instead (same approach as the `docs/briefs/` cleanup earlier today).

## Verification

Paste full, unabridged output for each check.

- `git grep` for the four names after removal: only migrations, changelogs, the verification harness (if kept) and comments citing changelogs remain. Show the output.
- `npx tsc --noEmit` and `npx next build` pass. The route list no longer shows `/api/generate-identity-reframe` (and `/api/generate-path-options` if removed).
- **No behaviour change:** for a synthetic user with a ready 1.4 report, `/identity` and the `/path` entry screen render byte-identically (HTML and screenshots at 1280 and 390) before and after, logged in, both unpaid and paid (to cover both reframe/CTA states).
- Synthetic users torn down and confirmed gone, including any entitlement rows the check inserts.

## Stop conditions

Stop and report before deleting if:
- Anything live (a page, a live route, a live prompt) reads or calls any of the code marked for removal.
- Removing a type breaks something beyond the expected dead code, i.e. `tsc` errors in live files.
- The byte-compare shows any difference on `/identity` or `/path`.
