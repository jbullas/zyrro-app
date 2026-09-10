import type { SupabaseClient } from '@supabase/supabase-js';

export type ArtifactType =
  | 'identity_report'
  | 'identity_reframe'
  | 'path_options'
  | 'path_plan'
  | 'path_checkpoint_session'
  | 'path_checkpoint_result'
  | 'path_direction_session'
  | 'path_options_session'
  | 'path_report';
// path_checkpoint_session additionally uses 'awaiting_checkpoint' and
// 'complete' (see lib/path-checkpoint.ts) — not part of the generating/ready/
// failed vocabulary the other (Tier C append-only) types use.
// path_direction_session uses 'in_progress' and 'complete' (see
// lib/path-direction.ts) — no background generation, so no 'generating'/
// 'failed', and no review step, so no 'awaiting_checkpoint'.
// path_options_session reuses path_checkpoint_session's own
// generating/awaiting_checkpoint/complete vocabulary rather than either of
// the other two shapes (see lib/path-options-session.ts) — it has a real
// background-generation state, unlike path_direction_session.
// path_report is back to plain Tier C generating/ready/failed — it's a
// real append-only deliverable (unlike path_direction_session/
// path_options_session's mutated-in-place sessions), and unlike
// path_checkpoint_session/path_options_session it has no checkpoint/redo
// step, so no 'awaiting_checkpoint' either (see lib/generate-path-report.ts).
export type ArtifactStatus = 'generating' | 'ready' | 'failed' | 'awaiting_checkpoint' | 'complete' | 'in_progress';

/**
 * Resolves the current version of a Tier C (append-only) artifact — the
 * most recent row for this user + type, ordered by created_at. A
 * regeneration always INSERTs a new row rather than UPDATEing, so older
 * rows remain in the table as history; this is the one place that decides
 * which row counts as "current."
 *
 * `opts.status` narrows to the latest row in a specific status (e.g.
 * 'ready', so an in-flight or failed regeneration attempt doesn't shadow
 * the last good version). `opts.select` overrides the default `*` column
 * list. `opts.match` adds extra equality filters beyond user_id+type — for
 * artifact types like path_plan that are also scoped to a selection key
 * (path_options_artifact_id + path_id). Works with any Supabase client —
 * browser, server, or service-role.
 */
export async function getCurrentArtifact<T = Record<string, unknown>>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  userId: string,
  type: ArtifactType,
  opts: { status?: ArtifactStatus; select?: string; match?: Record<string, string> } = {}
) {
  let query = supabase
    .from('artifacts')
    .select(opts.select ?? '*')
    .eq('user_id', userId)
    .eq('type', type);

  if (opts.match) {
    query = query.match(opts.match);
  }

  query = query.order('created_at', { ascending: false }).limit(1);

  if (opts.status) {
    query = query.eq('status', opts.status);
  }

  return query.maybeSingle<T>();
}
