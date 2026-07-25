import type { SupabaseClient } from '@supabase/supabase-js';

export type ArtifactType = 'identity_report' | 'path_options' | 'path_plan';
export type ArtifactStatus = 'generating' | 'ready' | 'failed';

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
