# Brief: #45 — Meta-bundle mechanism

## Context

Per `docs/framework/zyrro_continuity_memory_blueprint_v_1.md`, the
meta-bundle is a synthesis across a user's conversation bundles — an
evolving baseline, versioned/append-only. It's stale if any conversation
bundle has updated since the meta-bundle's last version; resolving it
first resolves any stale conversation bundles, then re-synthesizes if
needed.

Scope note: this ships the mechanism only (migration + resolution
function), mirroring how #16 shipped `resolveConversationBundle()` before
#46 wired it into `/mentor`. Wiring the meta-bundle into the Dashboard UI
is ticket #13, separate and not part of this brief.

Design note: the blueprint mentions reusing the `generating`/`ready`/
`failed` pattern proven for Identity/Path/Plan, but `resolveConversationBundle()`
— the actual precedent this brief should follow — was built synchronously,
with no status field, just a nullable `summary_generated_at` as the
staleness marker. This brief follows that real precedent, not the
async/polling pattern, for consistency with what's already shipped.

Meta-bundle storage is a dedicated table, not a new `artifacts` type —
`artifacts` is scoped to user-facing funnel deliverables (Identity Report,
Path Options, Plan), gated by `access_level` and treated as one-current-row-
per-type (see the identity-report unique index). The meta-bundle is
internal continuity machinery, never shown to the user as a report, and is
genuinely multi-row by design. Mixing it into `artifacts` would require
every existing "list this user's artifacts" query to filter it out, and
would blur `artifacts`' current one-row-per-type semantics.

## Stop conditions

- No Dashboard changes — that's ticket #13, separate.
- No `/mentor` changes.
- No status/polling machinery — mirror `resolveConversationBundle()`'s
  synchronous, no-status-field approach exactly.
- All LLM calls go through `lib/llm.ts`'s `getChatCompletion()` — no direct
  OpenAI client instantiation (this is now the standing rule in
  `docs/standards/coding-standards.md`).
- Show the diff before committing, including the migration file.

## Task

### 1. Migration — `meta_bundles` table

New file `supabase/migrations/<today's date>000000_meta_bundles.sql`,
following the RLS/trigger conventions of `20260530000002_conversations_baseline.sql`
and `20260531000000_artifacts_baseline.sql`:

```sql
CREATE TABLE IF NOT EXISTS public.meta_bundles (
  id          uuid        NOT NULL DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL,
  content     text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT meta_bundles_pkey
    PRIMARY KEY (id),

  CONSTRAINT meta_bundles_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_meta_bundles_user_id_created_at
  ON public.meta_bundles (user_id, created_at DESC);

ALTER TABLE public.meta_bundles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can insert own meta bundles"
    ON public.meta_bundles FOR INSERT
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can view own meta bundles"
    ON public.meta_bundles FOR SELECT
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
```

No `UPDATE` policy and no `updated_at`/trigger — this table is append-only
by design; a new row is inserted each time the bundle is regenerated, and
"current" is the latest row by `created_at`.

Remember: per `coding-standards.md`, committing this migration file is not
the same as applying it — note clearly in the changelog whether it's been
run against the live Supabase project, and don't assume it has been just
because the file is committed (this is exactly the gap #46's testing
surfaced with the `conversation_bundles` migration).

### 2. `lib/prompts/meta-bundle.ts` — synthesis prompt

Follow the style of `lib/prompts/conversation-bundle.ts`: a prompt that
receives an array of conversation-bundle summaries (plain text, most
recent last) and synthesizes them into a single evolving baseline —
recurring themes, standing commitments, how the user's situation has
shifted over time. Plain prose output, no markdown, no JSON. Export as
`META_BUNDLE_PROMPT`.

### 3. `lib/meta-bundle.ts` — `resolveMetaBundle()`

Mirror `lib/conversation-bundle.ts`'s structure and service-client pattern
closely. Export `resolveMetaBundle(userId: string): Promise<{ content:
string; created_at: string } | null>`:

1. Fetch all of the user's conversations (`id`, `summary`,
   `summary_generated_at`, `last_message_at`).
2. For any conversation that's stale by the existing per-conversation rule
   (`!summary_generated_at || last_message_at > summary_generated_at`),
   call `resolveConversationBundle(conversationId, userId)` to refresh it
   first — per the blueprint, conversation bundles resolve before the
   meta-bundle check happens.
3. If the user has no conversations with a summary at all, return `null`.
4. Fetch the latest `meta_bundles` row for this user (order by
   `created_at desc`, limit 1).
5. Determine staleness: no existing meta-bundle row, OR any conversation's
   (now-current) `summary_generated_at` is more recent than the
   meta-bundle's `created_at`.
6. If not stale, return the existing latest row's `content` and
   `created_at` as-is.
7. If stale, gather all conversations' `summary` values (skip nulls),
   call `getChatCompletion()` with `META_BUNDLE_PROMPT` and the summaries
   as input, insert a new `meta_bundles` row with the result, and return
   it.

Error handling: follow `resolveConversationBundle()`'s pattern — return
`null` on any fetch or write failure rather than a silent partial success.
