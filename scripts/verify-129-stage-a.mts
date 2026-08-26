/**
 * Standalone verification for #129 Stage A (checkpoint infrastructure).
 * Not wired into any user-facing route. Exercises the placeholder-content
 * state machine end to end against the real dev Supabase instance — no
 * OpenAI calls, no UI. See docs/briefs/129-stage-a-checkpoint-infrastructure-brief.md
 * for the 5 required scenarios this covers.
 *
 * Run: npx tsx --env-file=.env.local scripts/verify-129-stage-a.mts
 */

import { createClient } from '@supabase/supabase-js';
import {
  startCheckpointSession,
  claimGeneration,
  recordStageOutput,
  advanceToStage,
  logExchange,
  completeCheckpointSession,
  type PathCheckpointSessionRow,
} from '@/lib/path-checkpoint';
import { getCurrentArtifact } from '@/lib/artifacts';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function section(title: string) {
  console.log('\n' + '='.repeat(78));
  console.log(title);
  console.log('='.repeat(78));
}

function dump(label: string, value: unknown) {
  console.log(`-- ${label} --`);
  console.log(JSON.stringify(value, null, 2));
}

async function createTestUser(label: string) {
  const email = `zyrro-129-stage-a-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const { data, error } = await supabase.auth.admin.createUser({ email, email_confirm: true });
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);
  const userId = data.user.id;
  // A live-only trigger on auth.users (not in tracked migrations) already
  // creates the profiles row for a brand-new user by the time this runs —
  // upsert rather than insert so this doesn't collide with it.
  const { error: profileError } = await supabase.from('profiles').upsert({ user_id: userId }, { onConflict: 'user_id' });
  if (profileError) throw new Error(`profiles upsert failed: ${profileError.message}`);
  console.log(`Created test user ${label}: ${userId} (${email})`);
  return userId;
}

async function deleteTestUser(userId: string) {
  const { error } = await supabase.auth.admin.deleteUser(userId);
  if (error) console.error(`WARNING: deleteUser failed for ${userId}: ${error.message}`);
  else console.log(`Deleted test user ${userId}`);
}

async function freshSession(sessionId: string): Promise<PathCheckpointSessionRow> {
  const { data, error } = await getCurrentArtifact<PathCheckpointSessionRow>(
    supabase,
    (await supabase.from('artifacts').select('user_id').eq('id', sessionId).single()).data!.user_id,
    'path_checkpoint_session',
    { select: 'id, user_id, current_stage, status, content' },
  );
  if (error || !data) throw new Error(`fresh read failed: ${error?.message}`);
  return data;
}

let failures = 0;
function assertTrue(cond: boolean, msg: string) {
  if (cond) {
    console.log(`PASS: ${msg}`);
  } else {
    console.error(`FAIL: ${msg}`);
    failures++;
  }
}

async function main() {
  const userA = await createTestUser('main');

  try {
    // ── Scenario 1: create a session, walk through several stages ──────────
    section('SCENARIO 1 — create session, walk through several placeholder stages');

    let session = await startCheckpointSession(supabase, userA, 1);
    dump('session after start', session);
    assertTrue(session.current_stage === 1 && session.status === 'generating', 'session created at stage 1, status generating');

    // Stage 1 (ingest — no checkpoint): record placeholder output.
    session = await recordStageOutput(supabase, session.id, 1, { placeholder: 'stage1 ingested context' }, session.content);
    dump('session after stage 1 output', session);

    // Advance to stage 2, compute placeholder output.
    session = await advanceToStage(supabase, session.id, 2);
    session = await recordStageOutput(supabase, session.id, 2, { placeholder: 'stage2 intersections v1' }, session.content);
    dump('session after stage 2 output', session);
    assertTrue(session.status === 'awaiting_checkpoint' && session.current_stage === 2, 'stage 2 output recorded, awaiting checkpoint 1');

    // ── Scenario 2: simulate a checkpoint — presented, then redo, then proceed ──
    section('SCENARIO 2 — checkpoint exchange: presented -> redo -> proceed');

    const presented1 = await logExchange(supabase, session.id, userA, 2, 'presented', {
      placeholder: 'Here is where your evidence and energy line up (stage2 intersections v1)',
    });
    dump('logged: presented (checkpoint 1)', presented1);

    // (b) Free-text redo: re-run only the current stage (stage 2), overwrite it.
    const redoExchange = await logExchange(supabase, session.id, userA, 2, 'redo', {
      user_text: "no, that's missing something",
    });
    dump('logged: redo', redoExchange);

    const claimedForRedo = await claimGeneration(supabase, session.id);
    assertTrue(claimedForRedo !== null, 'redo successfully claimed generation on the existing row');
    session = await recordStageOutput(supabase, session.id, 2, { placeholder: 'stage2 intersections v2 (post-redo)' }, claimedForRedo!.content);
    dump('session after stage 2 redo', session);

    const stage3BeforeCheck = (session.content.stage_outputs as Record<string, unknown>)['stage3'];
    assertTrue(stage3BeforeCheck === undefined, 'stage3 has no output yet (not reached) — sanity check before redo-isolation assertion');

    // (a) Proceed: numbered choice advances current_stage, preserves prior outputs.
    const proceedExchange = await logExchange(supabase, session.id, userA, 2, 'proceed', { choice: 1 });
    dump('logged: proceed', proceedExchange);

    const stage2OutputBeforeAdvance = JSON.stringify((session.content.stage_outputs as Record<string, unknown>)['stage2']);
    session = await advanceToStage(supabase, session.id, 3);
    session = await recordStageOutput(supabase, session.id, 3, { placeholder: 'stage3 friction-tested candidates' }, session.content);
    const freshAfterAdvance = await freshSession(session.id);
    const stage2OutputAfterAdvance = JSON.stringify((freshAfterAdvance.content.stage_outputs as Record<string, unknown>)['stage2']);
    dump('fresh DB read after proceed + stage3 output', freshAfterAdvance);
    assertTrue(
      stage2OutputBeforeAdvance === stage2OutputAfterAdvance,
      'proceeding to stage 3 left stage2 output byte-identical (direct DB read)',
    );

    // Continue: stage 4 with its own redo/proceed cycle (checkpoint 2, the "real fork").
    session = await advanceToStage(supabase, freshAfterAdvance.id, 4);
    session = await recordStageOutput(supabase, session.id, 4, { placeholder: 'stage4 candidate directions v1', discarded: [] }, session.content);
    await logExchange(supabase, session.id, userA, 4, 'presented', { placeholder: 'Here are the directions that fit you' });

    const stage2Snapshot = JSON.stringify((session.content.stage_outputs as Record<string, unknown>)['stage2']);
    const stage3Snapshot = JSON.stringify((session.content.stage_outputs as Record<string, unknown>)['stage3']);

    await logExchange(supabase, session.id, userA, 4, 'redo', { user_text: 'none of these are it' });
    const claim2 = await claimGeneration(supabase, session.id);
    assertTrue(claim2 !== null, 'second redo (stage 4) claimed generation');
    session = await recordStageOutput(supabase, session.id, 4, { placeholder: 'stage4 candidate directions v2', discarded: ['discarded-candidate-a'] }, claim2!.content);

    const freshAfterStage4Redo = await freshSession(session.id);
    dump('fresh DB read after stage4 redo', freshAfterStage4Redo);
    assertTrue(
      JSON.stringify((freshAfterStage4Redo.content.stage_outputs as Record<string, unknown>)['stage2']) === stage2Snapshot,
      'stage4 redo left stage2 output byte-identical (direct DB read)',
    );
    assertTrue(
      JSON.stringify((freshAfterStage4Redo.content.stage_outputs as Record<string, unknown>)['stage3']) === stage3Snapshot,
      'stage4 redo left stage3 output byte-identical (direct DB read)',
    );

    await logExchange(supabase, session.id, userA, 4, 'proceed', { choice: 'direction-b' });
    session = await advanceToStage(supabase, freshAfterStage4Redo.id, 5);
    session = await recordStageOutput(supabase, session.id, 5, { placeholder: 'stage5 developed direction' }, session.content);
    await logExchange(supabase, session.id, userA, 5, 'presented', { placeholder: "Here's how I'm shaping this for you" });
    await logExchange(supabase, session.id, userA, 5, 'proceed', { choice: 1 });

    // Exchange log queryable independently of the session row, in order.
    const { data: exchanges, error: exchangesError } = await supabase
      .from('path_checkpoint_exchanges')
      .select('id, session_id, user_id, stage, role, content, created_at')
      .eq('session_id', session.id)
      .order('created_at', { ascending: true });
    if (exchangesError) throw new Error(`exchange log read failed: ${exchangesError.message}`);
    dump('full exchange log for this session, queried independently', exchanges);
    const expectedRoleSequence = ['presented', 'redo', 'proceed', 'presented', 'redo', 'proceed', 'presented', 'proceed'];
    assertTrue(
      JSON.stringify(exchanges!.map(e => e.role)) === JSON.stringify(expectedRoleSequence),
      `exchange log accumulated ${exchanges!.length} entries in the exact expected order`,
    );

    // ── Scenario 3: abandoned session — read back later with state intact ──
    section('SCENARIO 3 — abandoned session, read back later ("closed tab")');

    const abandonedUser = await createTestUser('abandoned');
    let abandoned = await startCheckpointSession(supabase, abandonedUser, 1);
    abandoned = await recordStageOutput(supabase, abandoned.id, 1, { placeholder: 'stage1 ingested' }, abandoned.content);
    abandoned = await advanceToStage(supabase, abandoned.id, 2);
    abandoned = await recordStageOutput(supabase, abandoned.id, 2, { placeholder: 'stage2 intersections' }, abandoned.content);
    console.log('...simulating a closed tab / lost connection here — no further calls for this session...');

    // A later, fully independent read (new query, not reusing any in-memory object).
    const { data: reread, error: rereadError } = await getCurrentArtifact<PathCheckpointSessionRow>(
      supabase, abandonedUser, 'path_checkpoint_session', { select: 'id, user_id, current_stage, status, content' },
    );
    if (rereadError || !reread) throw new Error(`abandoned-session reread failed: ${rereadError?.message}`);
    dump('reread of abandoned session (fresh query)', reread);
    assertTrue(reread.current_stage === 2 && reread.status === 'awaiting_checkpoint', 'abandoned session resumable with current_stage/status intact');
    await deleteTestUser(abandonedUser);

    // ── Scenario 4: two concurrent generation attempts for the same user ───
    section('SCENARIO 4a — concurrent session-CREATE race (double-click), #59/#71 precedent');

    const raceUser = await createTestUser('race');
    const [raceResultA, raceResultB] = await Promise.all([
      startCheckpointSession(supabase, raceUser, 1),
      startCheckpointSession(supabase, raceUser, 1),
    ]);
    dump('race call A result', raceResultA);
    dump('race call B result', raceResultB);
    assertTrue(raceResultA.id === raceResultB.id, 'both concurrent create calls resolved to the SAME row (loser reused winner\'s row via 23505 catch)');

    const { count: sessionRowCount, error: countError } = await supabase
      .from('artifacts')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', raceUser)
      .eq('type', 'path_checkpoint_session');
    if (countError) throw new Error(countError.message);
    assertTrue(sessionRowCount === 1, `exactly one path_checkpoint_session row exists for the race user (found ${sessionRowCount})`);

    section('SCENARIO 4b — concurrent claim race on an EXISTING row (mid-flow double-click)');

    // Put the race user's session into a claimable state first.
    await supabase.from('artifacts').update({ status: 'awaiting_checkpoint' }).eq('id', raceResultA.id);
    const [claimA, claimB] = await Promise.all([
      claimGeneration(supabase, raceResultA.id),
      claimGeneration(supabase, raceResultA.id),
    ]);
    dump('claim A result', claimA);
    dump('claim B result', claimB);
    const winners = [claimA, claimB].filter(c => c !== null);
    const losers = [claimA, claimB].filter(c => c === null);
    assertTrue(winners.length === 1 && losers.length === 1, 'exactly one concurrent claim won, the other lost (null) and would reuse the winner\'s row');

    await deleteTestUser(raceUser);

    // ── Scenario 5: complete a session, confirm Tier C artifact + session complete ──
    section('SCENARIO 5 — complete session -> placeholder Tier C final artifact');

    const finalContent = {
      artifact_type: 'path_checkpoint_result_placeholder',
      note: 'Stage A placeholder — real §4 content structure is Stage C\'s job',
      stage_outputs_snapshot: freshAfterStage4Redo ? 'see session content for full trace' : null,
    };
    const resultId = await completeCheckpointSession(supabase, userA, session.id, finalContent);
    console.log(`completeCheckpointSession returned artifact id: ${resultId}`);

    const { data: finalArtifact, error: finalArtifactError } = await getCurrentArtifact<{ id: string; status: string; content: unknown; path_checkpoint_session_id: string }>(
      supabase, userA, 'path_checkpoint_result', { status: 'ready', select: 'id, status, content, path_checkpoint_session_id' },
    );
    if (finalArtifactError || !finalArtifact) throw new Error(`final artifact read failed: ${finalArtifactError?.message}`);
    dump('final path_checkpoint_result artifact (via getCurrentArtifact)', finalArtifact);
    assertTrue(finalArtifact.id === resultId, 'getCurrentArtifact resolves the same row completeCheckpointSession wrote');
    assertTrue(finalArtifact.path_checkpoint_session_id === session.id, 'final artifact links back to the originating session row');

    const { data: completedSession, error: completedSessionError } = await getCurrentArtifact<PathCheckpointSessionRow>(
      supabase, userA, 'path_checkpoint_session', { select: 'id, status, current_stage' },
    );
    if (completedSessionError || !completedSession) throw new Error(`completed-session read failed: ${completedSessionError?.message}`);
    dump('session row after completion (fresh read)', completedSession);
    assertTrue(completedSession.status === 'complete', 'session row marked complete');

  } finally {
    await deleteTestUser(userA);
  }

  section(failures === 0 ? 'ALL SCENARIOS PASSED' : `${failures} ASSERTION(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(err => {
  console.error('SCRIPT ERROR:', err);
  process.exit(1);
});
