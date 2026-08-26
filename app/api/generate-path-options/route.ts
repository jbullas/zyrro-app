import { NextRequest, NextResponse, after } from 'next/server';

// Keep in sync with GENERATION_BUDGET_MS in lib/generation-status.ts (240 s = 240_000 ms).
export const maxDuration = 240;
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';
import { createClient as createSessionClient } from '@/utils/supabase/server';
import { hasPaidEntitlement } from '@/lib/entitlements';
import { getCurrentArtifact } from '@/lib/artifacts';
import type { IdentitySignatureReportArtifactContent } from '@/lib/artifact-schemas';
import {
  startCheckpointSessionWithCreationFlag,
  claimGeneration,
  recordStageOutput,
  advanceToStage,
  logExchange,
  type PathCheckpointSessionRow,
  type PathCheckpointSessionContent,
} from '@/lib/path-checkpoint';
import {
  ingestStage1Context,
  runStage2Intersections,
  runStage5Develop,
  resolveChosenCandidateInputs,
  type Stage1Context,
} from '@/lib/generate-path-checkpoint';

// #129 Stage B: this route is no longer a single-shot path_options
// generator (that was PATH_OPTIONS_PROMPT, lib/prompts/path-options.ts —
// left in place, not deleted, since Stage C may still reuse its prose
// conventions). It now kicks off a path_checkpoint_session and runs Stage 1
// (ingest) + Stage 2 (capability/desire intersections) in the background,
// landing the session at Checkpoint 1. Stages 3+/Checkpoint 2 are driven by
// POST /api/path-checkpoint-response. Real routing/UX is Stage D — this is
// just the API surface Stage B needs to be testable.

function createServiceClient() {
  return createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function runStage1AndStage2(
  sessionId: string,
  userId: string,
  identityReport: IdentitySignatureReportArtifactContent,
) {
  const supabase = createServiceClient();

  try {
    const context = await ingestStage1Context(supabase, userId, identityReport);
    let session = await recordStageOutput(supabase, sessionId, 1, context, { stage_outputs: {} });

    session = await advanceToStage(supabase, sessionId, 2);
    const stage2 = await runStage2Intersections(context);
    session = await recordStageOutput(supabase, sessionId, 2, stage2, session.content);

    await logExchange(supabase, sessionId, userId, 2, 'presented', {
      overlaps: stage2.overlaps,
      capability_only: stage2.capability_only,
      desire_only: stage2.desire_only,
    });
  } catch (error) {
    console.error('Path checkpoint Stage 1/2 failed:', error);
    await supabase.from('artifacts').update({ status: 'failed' }).eq('id', sessionId);
  }
}

/**
 * #129 Stage C: Checkpoint 2's proceed (recordChosenCandidate, Stage B) only
 * parks the session at current_stage=5 with a chosen_candidate_id — it
 * doesn't run Stage 5 itself, since Stage 5 didn't exist yet when that code
 * was written. This is the actual kickoff, triggered by this route's own
 * resume branch below the first time a session in that parked state is
 * polled/resumed. Not a change to Checkpoint 2's own logic (recordChosenCandidate
 * is untouched) — this only decides what happens on a later request against
 * an already-existing session sitting in that state.
 */
async function runStage5Kickoff(sessionId: string, userId: string, contentAtKickoff: PathCheckpointSessionContent) {
  const supabase = createServiceClient();

  try {
    const stageOutputs = contentAtKickoff.stage_outputs as Record<string, unknown>;
    const context = stageOutputs.stage1 as Stage1Context;
    const { chosenCandidate, groundedOverlaps } = resolveChosenCandidateInputs(stageOutputs, contentAtKickoff.chosen_candidate_id);

    const stage5 = await runStage5Develop(chosenCandidate, groundedOverlaps, context.friction_points, context.prepared_for);
    await recordStageOutput(supabase, sessionId, 5, stage5, contentAtKickoff);

    await logExchange(supabase, sessionId, userId, 5, 'presented', {
      developed_thesis: stage5.developed_thesis,
      anchoring_signatures: stage5.anchoring_signatures,
      stretch: stage5.stretch,
      honest_cost_note: stage5.honest_cost_note,
    });
  } catch (error) {
    console.error('Path checkpoint Stage 5 kickoff failed:', error);
    await supabase.from('artifacts').update({ status: 'failed' }).eq('id', sessionId);
  }
}

export async function POST(_req: NextRequest) {
  const sessionClient = await createSessionClient();
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const entitled = await hasPaidEntitlement(user.id);
  if (!entitled) {
    return NextResponse.json({ error: 'Payment required' }, { status: 403 });
  }

  const supabase = createServiceClient();

  // path_checkpoint_session is mutated in place, one row per user (#129
  // Stage A) — if one already exists, this is a re-entry (page reload,
  // double-click), not a fresh start. Return its current state rather than
  // creating a second row.
  const { data: existingSession } = await getCurrentArtifact<PathCheckpointSessionRow>(
    supabase,
    user.id,
    'path_checkpoint_session',
    { select: 'id, current_stage, status, content' },
  );
  if (existingSession) {
    // #129 Stage C: Checkpoint 2's proceed parks the session here
    // (current_stage=5, awaiting_checkpoint, chosen_candidate_id set) without
    // running Stage 5 — this is where that gets kicked off, the first time
    // such a session is resumed/polled. claimGeneration guards against a
    // concurrent duplicate kickoff the same way Stage 1/2's own creation
    // race is guarded above.
    const stageOutputs = existingSession.content.stage_outputs as Record<string, unknown>;
    const stage5NotYetRun = existingSession.current_stage === 5 && !stageOutputs.stage5;

    if (stage5NotYetRun && existingSession.status === 'awaiting_checkpoint') {
      const claimed = await claimGeneration(supabase, existingSession.id);
      if (claimed) {
        after(() => runStage5Kickoff(existingSession.id, user.id, claimed.content));
        return NextResponse.json({ session_id: existingSession.id, current_stage: 5, status: 'generating' });
      }
      // Lost the claim race — another concurrent request is already running
      // Stage 5's kickoff. Report 'generating' (the now-true state), not the
      // stale 'awaiting_checkpoint' this read predates.
      return NextResponse.json({ session_id: existingSession.id, current_stage: 5, status: 'generating' });
    }

    return NextResponse.json({
      session_id: existingSession.id,
      current_stage: existingSession.current_stage,
      status: existingSession.status,
    });
  }

  const { data: identityArtifact } = await getCurrentArtifact<{ content: IdentitySignatureReportArtifactContent }>(
    supabase,
    user.id,
    'identity_report',
    { status: 'ready', select: 'content' },
  );

  if (!identityArtifact) {
    return NextResponse.json({ error: 'Identity report not found' }, { status: 404 });
  }

  const { session, created } = await startCheckpointSessionWithCreationFlag(supabase, user.id, 1);

  // Lost the create race (concurrent double-click) — someone else's request
  // already owns this session and will run Stage 1/2. Don't run it twice.
  if (created) {
    after(() => runStage1AndStage2(session.id, user.id, identityArtifact.content));
  }

  return NextResponse.json({ session_id: session.id, current_stage: session.current_stage, status: session.status });
}
