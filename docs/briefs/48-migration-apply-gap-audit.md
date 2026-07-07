# Ticket #48 — Migration apply-gap audit

Verify every committed migration is actually applied to the live Supabase project — not just committed and logged as "Executed" in a changelog.

## Context

Two prior incidents establish why this matters:
- `20260702000001_conversation_bundles.sql` was committed and logged as "Executed" but was never actually applied; discovered only when a live Playwright run showed `listConversations()` silently failing.
- `20260702000002_meta_bundles.sql` was committed but deliberately left unapplied (per explicit instruction) until this session, when it was confirmed applied via direct verification before ticket #13 proceeded.

Both of those are now confirmed applied. The other 9 committed migrations have never been individually re-verified against the live project — they're assumed applied because they're older and nothing has surfaced a problem, but that assumption is exactly what this ticket exists to test.

## Scope

For each of the following migrations, verify the live Supabase schema actually reflects it (via `information_schema.tables`/`information_schema.columns` queries in the SQL Editor, or PostgREST OpenAPI introspection — either pattern already used this session):

- `20260530000000_shared_functions.sql`
- `20260530000001_profiles_baseline.sql`
- `20260530000002_conversations_baseline.sql`
- `20260531000000_artifacts_baseline.sql`
- `20260601000000_entitlements.sql`
- `20260601000001_path_plan_data_model.sql`
- `20260622000000_artifacts_identity_report_unique_index.sql`
- `20260624000000_drop_redundant_artifacts_rls_policies.sql`
- `20260701000000_path_selections_project_name.sql`
- `20260702000000_messages_baseline.sql`

For each, confirm the specific tables/columns/functions/indexes/policies the migration defines are actually present live — not just that the table exists in some form (e.g. for `path_selections_project_name.sql`, confirm the `project_name` column specifically, not just that `path_selections` exists).

## Output

A short report (in the changelog entry, no separate doc needed) listing each migration and its verified status: applied / not applied / partially applied (specify what's missing). If any gaps are found, do not attempt to fix them in this ticket — flag them and stop; applying a live migration is a decision for the user to make explicitly, not something to do automatically as part of an audit.

## Out of scope

- Applying any migration found to be missing — that's a separate, explicit follow-up step, not part of this ticket.
- Any code changes. This is a read-only verification pass.

## Stop conditions

- Do not run any DDL (CREATE/ALTER/DROP) against the live database as part of this ticket — read-only queries only.
- If a gap is found, stop and report it rather than silently applying the fix.
