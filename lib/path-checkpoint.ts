import type { SupabaseClient } from '@supabase/supabase-js';
import { getCurrentArtifact } from '@/lib/artifacts';

// #129 Stage A — checkpoint infrastructure (placeholder content only; real
// reasoning prompts are Stage B/C). See
// docs/briefs/129-checkpoint-guided-path-selection-design.md and
// docs/briefs/129-stage-a-checkpoint-infrastructure-brief.md.
//
// path_checkpoint_session is a `type = 'path_checkpoint_session'` row on the
// shared artifacts table, but unlike every other artifact type it is
// MUTATED IN PLACE (one row per user) rather than append-only — this module
// is the one place that owns those mutations. Named path_checkpoint_* rather
// than the brief's originally proposed path_selection_session, to avoid
// confusion with the pre-existing, unrelated `path_selections` table (#10,
// project naming) — see the migration file's header for the full note.

export type PathCheckpointSessionStatus = 'generating' | 'awaiting_checkpoint' | 'complete';

export type PathCheckpointSessionContent = {
  stage_outputs: Record<string, unknown>;
};

export type PathCheckpointSessionRow = {
  id: string;
  user_id: string;
  current_stage: number | null;
  status: PathCheckpointSessionStatus;
  content: PathCheckpointSessionContent;
};

const SESSION_SELECT = 'id, user_id, current_stage, status, content';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, any, any>;

/**
 * Starts a new path_checkpoint_session for a user, or reuses an in-flight
 * one if a concurrent call already won the create race — same
 * insert-then-catch-23505-then-reread pattern as generate-path-options's
 * kickoff (#71 precedent), adapted for a mutate-in-place type.
 */
export async function startCheckpointSession(
  supabase: Client,
  userId: string,
  initialStage: number,
): Promise<PathCheckpointSessionRow> {
  const { data: inserted, error } = await supabase
    .from('artifacts')
    .insert({
      user_id: userId,
      type: 'path_checkpoint_session',
      access_level: 'paid',
      status: 'generating',
      current_stage: initialStage,
      content: { stage_outputs: {} },
    })
    .select(SESSION_SELECT)
    .single();

  if (error?.code === '23505') {
    const { data: current, error: readError } = await getCurrentArtifact<PathCheckpointSessionRow>(
      supabase,
      userId,
      'path_checkpoint_session',
      { select: SESSION_SELECT },
    );
    if (readError || !current) {
      throw readError ?? new Error('Lost the session-create race but no existing row was found');
    }
    return current;
  }

  if (error || !inserted) {
    throw error ?? new Error('Failed to create path_checkpoint_session');
  }

  return inserted as PathCheckpointSessionRow;
}

/**
 * Conditionally claims a session row for generation: flips status to
 * 'generating' only if it isn't already. Guards the race a partial unique
 * index can't reach — two concurrent attempts to advance/redo the *same*
 * existing row (not two competing INSERTs). Returns null if another call
 * already holds the claim; the caller should re-read and reuse that row,
 * same "loser reuses the winner's row" contract as the insert-race guard.
 */
export async function claimGeneration(
  supabase: Client,
  sessionId: string,
): Promise<PathCheckpointSessionRow | null> {
  const { data, error } = await supabase
    .from('artifacts')
    .update({ status: 'generating' })
    .eq('id', sessionId)
    .neq('status', 'generating')
    .select(SESSION_SELECT)
    .maybeSingle();

  if (error) throw error;
  return (data as PathCheckpointSessionRow | null) ?? null;
}

/**
 * Records a stage's confirmed output and moves the session to
 * 'awaiting_checkpoint'. Used both for a stage's first output and for a
 * redo overwrite — either way, only this stage's key in content.stage_outputs
 * changes; every other stage's already-confirmed output is passed through
 * untouched via `priorContent`.
 */
export async function recordStageOutput(
  supabase: Client,
  sessionId: string,
  stage: number,
  output: unknown,
  priorContent: PathCheckpointSessionContent,
): Promise<PathCheckpointSessionRow> {
  const nextContent: PathCheckpointSessionContent = {
    stage_outputs: { ...priorContent.stage_outputs, [`stage${stage}`]: output },
  };

  const { data, error } = await supabase
    .from('artifacts')
    .update({ current_stage: stage, status: 'awaiting_checkpoint', content: nextContent })
    .eq('id', sessionId)
    .select(SESSION_SELECT)
    .single();

  if (error || !data) throw error ?? new Error('Failed to record stage output');
  return data as PathCheckpointSessionRow;
}

/** Advances current_stage forward and claims generation for it. Stage outputs are untouched. */
export async function advanceToStage(
  supabase: Client,
  sessionId: string,
  nextStage: number,
): Promise<PathCheckpointSessionRow> {
  const { data, error } = await supabase
    .from('artifacts')
    .update({ current_stage: nextStage, status: 'generating' })
    .eq('id', sessionId)
    .select(SESSION_SELECT)
    .single();

  if (error || !data) throw error ?? new Error('Failed to advance stage');
  return data as PathCheckpointSessionRow;
}

export type ExchangeRole = 'presented' | 'proceed' | 'redo';

/** Appends one entry to the checkpoint exchange log. Never updated/deleted once written. */
export async function logExchange(
  supabase: Client,
  sessionId: string,
  userId: string,
  stage: number,
  role: ExchangeRole,
  content: unknown,
) {
  const { data, error } = await supabase
    .from('path_checkpoint_exchanges')
    .insert({ session_id: sessionId, user_id: userId, stage, role, content })
    .select('id, session_id, user_id, stage, role, content, created_at')
    .single();

  if (error || !data) throw error ?? new Error('Failed to log checkpoint exchange');
  return data;
}

/**
 * Writes the final path_checkpoint_result as a normal Tier C append-only
 * artifact (same delete-failed-then-insert-with-race-guard shape as
 * generate-path-options), links it back to the session, and marks the
 * session row 'complete'. Placeholder content only this stage — real content
 * structure (design doc §4) is Stage C's job.
 */
export async function completeCheckpointSession(
  supabase: Client,
  userId: string,
  sessionId: string,
  finalContent: unknown,
): Promise<string> {
  await supabase
    .from('artifacts')
    .delete()
    .eq('user_id', userId)
    .eq('type', 'path_checkpoint_result')
    .eq('status', 'failed');

  const { data: inserted, error } = await supabase
    .from('artifacts')
    .insert({
      user_id: userId,
      type: 'path_checkpoint_result',
      access_level: 'paid',
      status: 'ready',
      content: finalContent,
      path_checkpoint_session_id: sessionId,
    })
    .select('id')
    .single();

  let resultId: string;

  if (error?.code === '23505') {
    const { data: current } = await getCurrentArtifact<{ id: string }>(
      supabase,
      userId,
      'path_checkpoint_result',
      { select: 'id' },
    );
    if (!current) throw error;
    resultId = current.id;
  } else if (error || !inserted) {
    throw error ?? new Error('Failed to write path_checkpoint_result');
  } else {
    resultId = inserted.id;
  }

  const { error: sessionError } = await supabase
    .from('artifacts')
    .update({ status: 'complete' })
    .eq('id', sessionId);

  if (sessionError) throw sessionError;

  return resultId;
}
