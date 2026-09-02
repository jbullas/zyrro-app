import type { SupabaseClient } from '@supabase/supabase-js';
import { getCurrentArtifact } from '@/lib/artifacts';

// #134 Slice 1 — Checkpoint 1 "Direction": pure structured selection, no LLM
// call. path_direction_session is a `type = 'path_direction_session'` row on
// the shared artifacts table — like path_checkpoint_session, mutated in
// place (one row per user) rather than append-only, but with a flat
// curation record for content instead of a stage-keyed blob, since there's
// no LLM stage output to key by. See
// docs/briefs/134-path-redesign-direction-options-your-path.md §3/§7 and the
// migration file (20260902000000_path_direction_session.sql) for the schema
// rationale.

export type PathDirectionSessionStatus = 'in_progress' | 'complete';

// `null` means "not yet submitted" — distinct from an empty array/string,
// which is a real, saved answer (the brief allows 0 must-haves/must-avoids
// and blank ideal-life text). resolveDirectionStep below relies on this.
export type PathDirectionSessionContent = {
  must_haves: string[] | null;
  must_avoids: string[] | null;
  ideal_life: string | null;
};

export type PathDirectionSessionRow = {
  id: string;
  user_id: string;
  status: PathDirectionSessionStatus;
  content: PathDirectionSessionContent;
};

const SESSION_SELECT = 'id, user_id, status, content';

const EMPTY_CONTENT: PathDirectionSessionContent = {
  must_haves: null,
  must_avoids: null,
  ideal_life: null,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, any, any>;

export type DirectionStep = 'must_haves' | 'must_avoids' | 'ideal_life' | 'complete';

/**
 * Derives which of the three sequential inputs is next, purely from
 * content's null/non-null shape — no separate step counter needed. Shared
 * between the API route (to validate/reject out-of-order submissions) and
 * the client (to decide which screen to render), since it's pure logic with
 * no server-only dependency.
 */
export function resolveDirectionStep(content: PathDirectionSessionContent): DirectionStep {
  if (content.must_haves === null) return 'must_haves';
  if (content.must_avoids === null) return 'must_avoids';
  if (content.ideal_life === null) return 'ideal_life';
  return 'complete';
}

/**
 * Starts or resumes a user's path_direction_session — same insert-then-
 * catch-23505-then-reread shape as startCheckpointSession
 * (lib/path-checkpoint.ts), adapted for a type with no per-user "generating"
 * state to race on: this has no background job, so the migration's plain
 * per-user unique index (no status filter) is the only race guard needed.
 */
export async function startOrResumeDirectionSession(
  supabase: Client,
  userId: string,
): Promise<PathDirectionSessionRow> {
  const { data: inserted, error } = await supabase
    .from('artifacts')
    .insert({
      user_id: userId,
      type: 'path_direction_session',
      access_level: 'paid',
      status: 'in_progress',
      content: EMPTY_CONTENT,
    })
    .select(SESSION_SELECT)
    .single();

  if (error?.code === '23505') {
    const { data: current, error: readError } = await getCurrentArtifact<PathDirectionSessionRow>(
      supabase,
      userId,
      'path_direction_session',
      { select: SESSION_SELECT },
    );
    if (readError || !current) {
      throw readError ?? new Error('Lost the session-create race but no existing row was found');
    }
    return current;
  }

  if (error || !inserted) {
    throw error ?? new Error('Failed to create path_direction_session');
  }

  return inserted as PathDirectionSessionRow;
}

/** At most `max` items, every one of them drawn from `allowed` (the real energisers/friction_points list). */
export function validateSelection(selected: unknown, allowed: string[], max: number): selected is string[] {
  if (!Array.isArray(selected)) return false;
  if (selected.length > max) return false;
  return selected.every(item => typeof item === 'string' && allowed.includes(item));
}

async function persistStep(
  supabase: Client,
  sessionId: string,
  priorContent: PathDirectionSessionContent,
  patch: Partial<PathDirectionSessionContent>,
  nextStatus: PathDirectionSessionStatus,
): Promise<PathDirectionSessionRow> {
  const nextContent: PathDirectionSessionContent = { ...priorContent, ...patch };

  const { data, error } = await supabase
    .from('artifacts')
    .update({ content: nextContent, status: nextStatus })
    .eq('id', sessionId)
    .select(SESSION_SELECT)
    .single();

  if (error || !data) throw error ?? new Error('Failed to record path_direction_session step');
  return data as PathDirectionSessionRow;
}

export async function recordMustHaves(
  supabase: Client,
  sessionId: string,
  mustHaves: string[],
  priorContent: PathDirectionSessionContent,
): Promise<PathDirectionSessionRow> {
  return persistStep(supabase, sessionId, priorContent, { must_haves: mustHaves }, 'in_progress');
}

export async function recordMustAvoids(
  supabase: Client,
  sessionId: string,
  mustAvoids: string[],
  priorContent: PathDirectionSessionContent,
): Promise<PathDirectionSessionRow> {
  return persistStep(supabase, sessionId, priorContent, { must_avoids: mustAvoids }, 'in_progress');
}

/** Ideal-life is the last of the three inputs — recording it completes the session. */
export async function recordIdealLife(
  supabase: Client,
  sessionId: string,
  idealLife: string,
  priorContent: PathDirectionSessionContent,
): Promise<PathDirectionSessionRow> {
  return persistStep(supabase, sessionId, priorContent, { ideal_life: idealLife }, 'complete');
}
