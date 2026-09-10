import type { SupabaseClient } from '@supabase/supabase-js';
import { getCurrentArtifact } from '@/lib/artifacts';

// #134 Slice 2 — Checkpoint 2 "Options": data-access/state-machine layer,
// mirroring lib/path-checkpoint.ts's shape (not lib/path-direction.ts's —
// see that file's own header for why: this type has a real background-
// generation state, path_direction_session doesn't). See
// docs/briefs/134-path-redesign-direction-options-your-path.md §4/§7 and
// the migration file (20260910000000_path_options_session.sql) for the
// schema rationale.
//
// path_options_session is a `type = 'path_options_session'` row on the
// shared artifacts table, mutated in place (one row per user), same
// precedent as path_checkpoint_session and path_direction_session. Unlike
// path_direction_session's flat, replace-per-step content, this content's
// `candidates` array is APPEND-ONLY across the session's life (§7 — the
// whole reason this isn't a path_checkpoint_session migration): each write
// here adds to the array, never replaces it.

// A real 4th value, 'failed', is also written here (by
// generate-path-options-session's calling routes, on a background
// generation crash) but deliberately left out of this union — same gap as
// path_checkpoint_session's own PathCheckpointSessionStatus type, which
// only ever needed to WRITE 'failed' via an untyped Supabase .update(),
// never compare against it in typed code. app/api/path-options/route.ts's
// GET handler is the first place that needs a typed `=== 'failed'` check
// (to resume a crashed generation), which is what surfaced this gap via a
// real tsc error rather than by inspection.
export type PathOptionsSessionStatus = 'generating' | 'awaiting_checkpoint' | 'complete' | 'failed';

export interface PathOptionsCandidate {
  id: string;
  name: string;
  description: string;
  // Which generation batch produced this candidate: 1 = initial 4, 2/3 =
  // the two possible +2 refine rounds. Not used for any DB constraint (see
  // the migration's own comment) — kept for the material-difference check's
  // "every candidate already generated this session" comparison set and for
  // any future UI/debug need to distinguish batches.
  round: number;
}

export interface PathOptionsSessionContent {
  candidates: PathOptionsCandidate[];
  // Both null until the user selects an option and (optionally) adds
  // comments on the same screen (§4) — Your Path reads `comments` from here
  // once that step is scoped.
  selected_candidate_id: string | null;
  comments: string | null;
}

export interface PathOptionsSessionRow {
  id: string;
  user_id: string;
  status: PathOptionsSessionStatus;
  content: PathOptionsSessionContent;
}

const SESSION_SELECT = 'id, user_id, status, content';

const EMPTY_CONTENT: PathOptionsSessionContent = {
  candidates: [],
  selected_candidate_id: null,
  comments: null,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, any, any>;

/**
 * Starts a new path_options_session for a user, or reuses an in-flight one
 * if a concurrent call already won the create race — same insert-then-
 * catch-23505-then-reread shape as startOrReuseCheckpointSession
 * (lib/path-checkpoint.ts). `created` tells the caller whether this call
 * should go on to kick off the initial-4 generation, or lost the race and
 * should just treat the returned row as someone else's already-in-flight
 * (or finished) session — same contract as path_checkpoint_session's
 * startCheckpointSessionWithCreationFlag.
 */
export async function startOrReuseOptionsSession(
  supabase: Client,
  userId: string,
): Promise<{ session: PathOptionsSessionRow; created: boolean }> {
  const { data: inserted, error } = await supabase
    .from('artifacts')
    .insert({
      user_id: userId,
      type: 'path_options_session',
      access_level: 'paid',
      status: 'generating',
      content: EMPTY_CONTENT,
    })
    .select(SESSION_SELECT)
    .single();

  if (error?.code === '23505') {
    const { data: current, error: readError } = await getCurrentArtifact<PathOptionsSessionRow>(
      supabase,
      userId,
      'path_options_session',
      { select: SESSION_SELECT },
    );
    if (readError || !current) {
      throw readError ?? new Error('Lost the session-create race but no existing row was found');
    }
    return { session: current, created: false };
  }

  if (error || !inserted) {
    throw error ?? new Error('Failed to create path_options_session');
  }

  return { session: inserted as PathOptionsSessionRow, created: true };
}

/**
 * Conditionally claims a session row for generation: flips status to
 * 'generating' only if it isn't already — guards the "two concurrent
 * attempts to start a refine round on the same existing row" race, same
 * claimGeneration pattern and same rationale as path-checkpoint.ts's
 * version (the creation-race unique index doesn't reach this case, since
 * it's an UPDATE on an already-existing row, not a competing INSERT).
 * Returns null if another call already holds the claim; the caller should
 * re-read and reuse that row.
 */
export async function claimGeneration(
  supabase: Client,
  sessionId: string,
): Promise<PathOptionsSessionRow | null> {
  const { data, error } = await supabase
    .from('artifacts')
    .update({ status: 'generating' })
    .eq('id', sessionId)
    .neq('status', 'generating')
    .select(SESSION_SELECT)
    .maybeSingle();

  if (error) throw error;
  return (data as PathOptionsSessionRow | null) ?? null;
}

/**
 * Appends a freshly-generated batch to the session's candidate list and
 * moves it to 'awaiting_checkpoint' — append, never replace, per §7.
 * `priorContent` is spread first so `selected_candidate_id`/`comments`
 * (irrelevant to a mid-flow generation call, but harmless to carry through)
 * survive untouched, same prior-content-preserving convention as
 * path-checkpoint.ts's recordStageOutput.
 */
export async function appendCandidates(
  supabase: Client,
  sessionId: string,
  newCandidates: PathOptionsCandidate[],
  priorContent: PathOptionsSessionContent,
): Promise<PathOptionsSessionRow> {
  const nextContent: PathOptionsSessionContent = {
    ...priorContent,
    candidates: [...priorContent.candidates, ...newCandidates],
  };

  const { data, error } = await supabase
    .from('artifacts')
    .update({ status: 'awaiting_checkpoint', content: nextContent })
    .eq('id', sessionId)
    .select(SESSION_SELECT)
    .single();

  if (error || !data) throw error ?? new Error('Failed to append path_options_session candidates');
  return data as PathOptionsSessionRow;
}

/**
 * Records the user's chosen candidate and any additional comments, and
 * completes the session — §4's "only selecting an option ... allows the
 * process to advance." Defensively rejects a candidateId that isn't
 * actually in this session's own candidates list, the same defensive
 * posture as path-direction.ts's validateSelection (never trust a client-
 * supplied id against a stale or tampered candidate list).
 */
export async function recordSelection(
  supabase: Client,
  sessionId: string,
  candidateId: string,
  comments: string,
  priorContent: PathOptionsSessionContent,
): Promise<PathOptionsSessionRow> {
  if (!priorContent.candidates.some(c => c.id === candidateId)) {
    throw new Error(`candidateId "${candidateId}" is not among this session's generated candidates`);
  }

  const nextContent: PathOptionsSessionContent = {
    ...priorContent,
    selected_candidate_id: candidateId,
    comments: comments.trim() || null,
  };

  const { data, error } = await supabase
    .from('artifacts')
    .update({ status: 'complete', content: nextContent })
    .eq('id', sessionId)
    .select(SESSION_SELECT)
    .single();

  if (error || !data) throw error ?? new Error('Failed to record path_options_session selection');
  return data as PathOptionsSessionRow;
}
