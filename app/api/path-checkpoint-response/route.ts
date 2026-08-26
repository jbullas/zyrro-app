import { NextRequest, NextResponse, after } from 'next/server';

export const maxDuration = 240;
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';
import { createClient as createSessionClient } from '@/utils/supabase/server';
import {
  claimGeneration,
  recordStageOutput,
  advanceToStage,
  logExchange,
  countRedosForStage,
  recordChosenCandidate,
  completeCheckpointSession,
  type PathCheckpointSessionRow,
} from '@/lib/path-checkpoint';
import { getCurrentArtifact } from '@/lib/artifacts';
import {
  runStage2Intersections,
  runStage3Friction,
  runStage4Candidates,
  runStage5Develop,
  runStage6Report,
  resolveChosenCandidateInputs,
  type Stage1Context,
  type Stage2Output,
  type Stage3Output,
  type Stage4Output,
  type Stage5Output,
} from '@/lib/generate-path-checkpoint';

// #129 Stage B — the API surface for responding to Checkpoint 1 (stage 2)
// and Checkpoint 2 (stage 4). Real routing/UX is Stage D; this exists so
// Stage B's reasoning pipeline is testable end to end. See
// docs/briefs/129-stage-b-reasoning-pipeline-brief.md.

// Design doc §6: 2 redos max per checkpoint. On exceeding it, auto-proceed
// with the last-generated version rather than looping indefinitely, logging
// that this happened — matching #85/#96/#112's "iterate 2-3 rounds, then log
// and move on" precedent. Still an open product question (design doc §6);
// this is Stage B's default, not a final decision.
const REDO_CAP = 2;

function createServiceClient() {
  return createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

type Body = {
  role: 'proceed' | 'redo';
  text?: string;   // redo steer
  choice?: string; // Checkpoint 2 only — the chosen candidate id
};

/**
 * Thrown for any synchronous failure that happens AFTER claimGeneration()
 * has already flipped the session to 'generating' but BEFORE either (a) a
 * background job was handed ownership of resolving that status, or (b) the
 * status was explicitly settled to something else (e.g. recordChosenCandidate's
 * 'awaiting_checkpoint'). The single catch block in POST() below resets
 * status back to 'awaiting_checkpoint' for every one of these — without it,
 * a thrown error (bad input, a transient DB error, anything) would strand
 * the session in a false "generating" state that blocks every future claim,
 * including a retry of the exact same request.
 */
class CheckpointResponseError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function runStage3And4(
  sessionId: string,
  userId: string,
  contentAtCheckpoint: Record<string, unknown>,
  context: Stage1Context,
  stage2: Stage2Output,
) {
  const supabase = createServiceClient();
  try {
    const stage3 = await runStage3Friction(stage2, context.friction_points);
    let session = await recordStageOutput(supabase, sessionId, 3, stage3, { stage_outputs: contentAtCheckpoint });

    session = await advanceToStage(supabase, sessionId, 4);
    const stage4 = await runStage4Candidates(stage3, context.prepared_for);
    session = await recordStageOutput(supabase, sessionId, 4, stage4, session.content);

    await logExchange(supabase, sessionId, userId, 4, 'presented', {
      candidates: stage4.candidates,
      discarded: stage4.discarded,
    });
  } catch (error) {
    console.error('Path checkpoint Stage 3/4 failed:', error);
    await supabase.from('artifacts').update({ status: 'failed' }).eq('id', sessionId);
  }
}

async function runStage2Redo(
  sessionId: string,
  userId: string,
  contentAtCheckpoint: Record<string, unknown>,
  context: Stage1Context,
  steer: string,
) {
  const supabase = createServiceClient();
  try {
    const stage2 = await runStage2Intersections(context, steer);
    await recordStageOutput(supabase, sessionId, 2, stage2, { stage_outputs: contentAtCheckpoint });
    await logExchange(supabase, sessionId, userId, 2, 'presented', {
      overlaps: stage2.overlaps,
      capability_only: stage2.capability_only,
      desire_only: stage2.desire_only,
    });
  } catch (error) {
    console.error('Path checkpoint Stage 2 redo failed:', error);
    await supabase.from('artifacts').update({ status: 'failed' }).eq('id', sessionId);
  }
}

async function runStage4Redo(
  sessionId: string,
  userId: string,
  contentAtCheckpoint: Record<string, unknown>,
  context: Stage1Context,
  stage3Surviving: Stage3Output['surviving'],
  steer: string,
) {
  const supabase = createServiceClient();
  try {
    const stage4 = await runStage4Candidates({ surviving: stage3Surviving }, context.prepared_for, steer);
    await recordStageOutput(supabase, sessionId, 4, stage4, { stage_outputs: contentAtCheckpoint });
    await logExchange(supabase, sessionId, userId, 4, 'presented', {
      candidates: stage4.candidates,
      discarded: stage4.discarded,
    });
  } catch (error) {
    console.error('Path checkpoint Stage 4 redo failed:', error);
    await supabase.from('artifacts').update({ status: 'failed' }).eq('id', sessionId);
  }
}

async function runStage5Redo(
  sessionId: string,
  userId: string,
  contentAtCheckpoint: Record<string, unknown>,
  context: Stage1Context,
  chosenCandidateId: string | undefined,
  steer: string,
) {
  const supabase = createServiceClient();
  try {
    const { chosenCandidate, groundedOverlaps } = resolveChosenCandidateInputs(contentAtCheckpoint, chosenCandidateId);
    const stage5 = await runStage5Develop(chosenCandidate, groundedOverlaps, context.friction_points, context.prepared_for, steer);
    // Same class of bug recordStageOutput itself had (see lib/path-checkpoint.ts):
    // constructing { stage_outputs: contentAtCheckpoint } here without
    // chosen_candidate_id means there's nothing for recordStageOutput's own
    // ...priorContent spread to preserve — confirmed live via
    // scripts/verify-129-stage-c.mts (Leona's Checkpoint 3 redo wiped it).
    await recordStageOutput(supabase, sessionId, 5, stage5, { stage_outputs: contentAtCheckpoint, chosen_candidate_id: chosenCandidateId });
    await logExchange(supabase, sessionId, userId, 5, 'presented', {
      developed_thesis: stage5.developed_thesis,
      anchoring_signatures: stage5.anchoring_signatures,
      stretch: stage5.stretch,
      honest_cost_note: stage5.honest_cost_note,
    });
  } catch (error) {
    console.error('Path checkpoint Stage 5 redo failed:', error);
    await supabase.from('artifacts').update({ status: 'failed' }).eq('id', sessionId);
  }
}

/**
 * Stage 6 — no checkpoint after it (final delivery). Writes the completed
 * path_checkpoint_result artifact and marks the session complete via
 * completeCheckpointSession; nothing else settles status afterward.
 */
async function runStage6(
  sessionId: string,
  userId: string,
  contentAtCheckpoint: Record<string, unknown>,
  context: Stage1Context,
) {
  const supabase = createServiceClient();
  try {
    const stage4 = contentAtCheckpoint.stage4 as Stage4Output;
    const stage5 = contentAtCheckpoint.stage5 as Stage5Output;
    const stage6 = await runStage6Report(stage5, stage4.discarded, context);
    await completeCheckpointSession(supabase, userId, sessionId, stage6);
  } catch (error) {
    console.error('Path checkpoint Stage 6 failed:', error);
    await supabase.from('artifacts').update({ status: 'failed' }).eq('id', sessionId);
  }
}

/**
 * Handles a 'proceed' at either checkpoint. Stage 2: advances to stage 3 and
 * hands off to a background job that owns resolving status from here (via
 * recordStageOutput/'failed') — nothing after that handoff can throw.
 * Stage 4: requires a valid candidate id; settles status synchronously via
 * recordChosenCandidate, or throws CheckpointResponseError(400, ...) if the
 * id is missing/invalid — caught by POST()'s single catch block, which
 * resets status rather than leaving it stranded at 'generating'.
 */
async function proceedFromCheckpoint(
  supabase: ReturnType<typeof createServiceClient>,
  session: PathCheckpointSessionRow,
  stage: number,
  context: Stage1Context,
  stageOutputs: Record<string, unknown>,
  choice: string | undefined,
) {
  if (stage === 2) {
    const advanced = await advanceToStage(supabase, session.id, 3);
    const stage2 = stageOutputs.stage2 as Stage2Output;
    after(() => runStage3And4(session.id, session.user_id, advanced.content.stage_outputs, context, stage2));
    return NextResponse.json({ session_id: session.id, current_stage: 3, status: 'generating' });
  }

  if (stage === 5) {
    // Checkpoint 3 — no candidate choice needed here (unlike Checkpoint 2),
    // just an acknowledgment that the developed direction is right. Stage 6
    // has no checkpoint after it (final delivery) — runStage6 owns settling
    // status via completeCheckpointSession, nothing else after this handoff.
    const advanced = await advanceToStage(supabase, session.id, 6);
    after(() => runStage6(session.id, session.user_id, advanced.content.stage_outputs, context));
    return NextResponse.json({ session_id: session.id, current_stage: 6, status: 'generating' });
  }

  // stage === 4 — Checkpoint 2, the real fork. Requires a candidate id,
  // either a genuine user pick or (redo-cap-exceeded path) an auto-selection
  // the caller already resolved before getting here.
  const stage4 = stageOutputs.stage4 as Stage4Output;
  const validIds = stage4.candidates.map(c => c.id);
  if (!choice || !validIds.includes(choice)) {
    throw new CheckpointResponseError(400, `choice must be one of: ${validIds.join(', ')}`);
  }

  const updated = await recordChosenCandidate(supabase, session.id, choice, session.content);
  return NextResponse.json({
    session_id: updated.id,
    current_stage: updated.current_stage,
    status: updated.status,
    chosen_candidate_id: choice,
  });
}

export async function POST(req: NextRequest) {
  const sessionClient = await createSessionClient();
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await req.json()) as Body;
  if (body.role !== 'proceed' && body.role !== 'redo') {
    return NextResponse.json({ error: 'role must be "proceed" or "redo"' }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: session } = await getCurrentArtifact<PathCheckpointSessionRow>(
    supabase,
    user.id,
    'path_checkpoint_session',
    { select: 'id, user_id, current_stage, status, content' },
  );
  if (!session) {
    return NextResponse.json({ error: 'No path_checkpoint_session found' }, { status: 404 });
  }

  const stage = session.current_stage;
  if (stage !== 2 && stage !== 4 && stage !== 5) {
    return NextResponse.json({ error: `No checkpoint active at stage ${stage}` }, { status: 400 });
  }
  if (session.status !== 'awaiting_checkpoint') {
    return NextResponse.json({ error: `Session is ${session.status}, not awaiting a checkpoint response` }, { status: 409 });
  }

  const stageOutputs = session.content.stage_outputs as Record<string, unknown>;
  const context = stageOutputs.stage1 as Stage1Context;
  const chosenCandidateId = session.content.chosen_candidate_id;

  // current_stage===5 && status==='awaiting_checkpoint' is ambiguous on its
  // own: Checkpoint 2's proceed (recordChosenCandidate) parks a session in
  // exactly this state BEFORE Stage 5 has ever run — that parked state is
  // meant to be resolved by polling POST /api/generate-path-options (which
  // kicks Stage 5 off), not by a checkpoint response landing here first.
  // stage_outputs.stage5's presence is the real distinguishing signal.
  if (stage === 5 && !stageOutputs.stage5) {
    return NextResponse.json(
      { error: 'Stage 5 has not finished generating yet — poll POST /api/generate-path-options first' },
      { status: 409 },
    );
  }

  // Claimed once, upfront, for every path below (cap-exceeded auto-proceed,
  // real redo, and genuine proceed alike) — every one of them ends up
  // calling advanceToStage or kicking off background generation, so all of
  // them need the same guard against a concurrent double-click on this same
  // awaiting_checkpoint session.
  const claimed = await claimGeneration(supabase, session.id);
  if (!claimed) {
    return NextResponse.json({ error: 'Session is already generating' }, { status: 409 });
  }

  // Everything past this point runs with the session claimed into
  // 'generating'. ANY exit from here that isn't a background job taking
  // over (after()) or an explicit status-settling call (recordChosenCandidate)
  // must go through this catch, which resets status back to
  // 'awaiting_checkpoint' — otherwise a thrown error (bad input, a
  // transient DB error, anything) strands the session in a false
  // "generating" state that blocks every future claim, including a retry of
  // the exact same request.
  try {
    if (body.role === 'redo') {
      const redosSoFar = await countRedosForStage(supabase, session.id, stage);
      const capExceeded = redosSoFar >= REDO_CAP;

      if (capExceeded) {
        await logExchange(supabase, session.id, user.id, stage, 'redo', {
          text: body.text ?? null,
          cap_exceeded: true,
          note: `Redo cap (${REDO_CAP}) already reached — auto-proceeding with the last-generated version instead of redoing again.`,
        });

        // Checkpoint 2 (stage 4) is the one checkpoint that requires an
        // actual pick to move forward — a redo request never carries a
        // genuine `choice`, so "proceed with the last-generated version"
        // here means auto-selecting a candidate rather than leaving the
        // fork unresolved. Always the first Stage 4 candidate (array order,
        // deterministic) — explicitly logged as an auto-selection, never
        // presented as a genuine user pick. A stray client-supplied `choice`
        // on a redo request is ignored here on purpose: proceedFromCheckpoint
        // still validates whatever id ends up being used against the real
        // candidate list, so an invalid stray value can't slip through.
        let autoChoice: string | undefined;
        if (stage === 4) {
          const stage4 = stageOutputs.stage4 as Stage4Output;
          autoChoice = stage4.candidates[0]?.id;
        }

        await logExchange(supabase, session.id, user.id, stage, 'proceed', {
          auto_forced: true,
          reason: `redo cap exceeded (${REDO_CAP} max)`,
          ...(stage === 4 ? { auto_selected_candidate_id: autoChoice, was_genuine_user_pick: false } : {}),
        });

        return await proceedFromCheckpoint(supabase, session, stage, context, stageOutputs, autoChoice);
      }

      await logExchange(supabase, session.id, user.id, stage, 'redo', { text: body.text ?? null });

      if (stage === 2) {
        after(() => runStage2Redo(session.id, user.id, stageOutputs, context, body.text ?? ''));
      } else if (stage === 4) {
        const stage3 = stageOutputs.stage3 as Stage3Output;
        after(() => runStage4Redo(session.id, user.id, stageOutputs, context, stage3.surviving, body.text ?? ''));
      } else {
        after(() => runStage5Redo(session.id, user.id, stageOutputs, context, chosenCandidateId, body.text ?? ''));
      }

      return NextResponse.json({ session_id: session.id, current_stage: stage, status: 'generating' });
    }

    // role === 'proceed'
    await logExchange(supabase, session.id, user.id, stage, 'proceed', body.choice ? { choice: body.choice } : {});
    return await proceedFromCheckpoint(supabase, session, stage, context, stageOutputs, body.choice);
  } catch (err) {
    console.error('path-checkpoint-response failed:', err);
    await supabase.from('artifacts').update({ status: 'awaiting_checkpoint' }).eq('id', session.id);
    if (err instanceof CheckpointResponseError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
