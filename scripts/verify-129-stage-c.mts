/**
 * #129 Stage C verification — runs the real (non-placeholder) Stage 5
 * (develop chosen path) + Checkpoint 3 + Stage 6 (final report) pipeline
 * end to end via the real HTTP routes, reusing the 3 real sessions Stage B
 * left parked at current_stage: 5 (Leona, Katalin, Matteo_Varga). Real
 * OpenAI calls throughout. See docs/briefs/129-stage-c-develop-path-brief.md
 * for the required scenarios and verification checks this covers.
 *
 * Run: npx tsx --env-file=.env.local scripts/verify-129-stage-c.mts
 * (requires a fresh local dev server at http://localhost:3000)
 */
import { createAdminClient, bootstrapTestUser } from './verification/session.mts';
import { chromium, type BrowserContext } from 'playwright';

const BASE_URL = 'http://localhost:3000';

const PERSONAS = [
  { name: 'Leona', email: 'miroslav+leona_markovic@jeffbullas.com', userId: 'd3fdbac6-2263-4acb-abec-9aff07a70ad3' },
  { name: 'Katalin', email: 'miroslav+katalin_farkas@jeffbullas.com', userId: '9afc7420-4e18-4866-ac17-e02e2c9be658' },
  { name: 'Matteo_Varga', email: 'miroslav+matteo_varga@jeffbullas.com', userId: '48ca28e9-61fe-47c0-a8f0-f54c9b5665b3' },
];

function section(title: string) {
  console.log('\n' + '='.repeat(78));
  console.log(title);
  console.log('='.repeat(78));
}

function dump(label: string, value: unknown) {
  console.log(`-- ${label} --`);
  console.log(JSON.stringify(value, null, 2));
}

let failures = 0;
function assertTrue(cond: boolean, msg: string) {
  if (cond) console.log(`PASS: ${msg}`);
  else { console.error(`FAIL: ${msg}`); failures++; }
}

const supabase = createAdminClient();

async function post(context: BrowserContext, path: string, body?: unknown) {
  const response = await context.request.post(`${BASE_URL}${path}`, body ? { data: body } : undefined);
  const status = response.status();
  const json = await response.json().catch(() => null);
  return { status, json };
}

async function readSession(userId: string) {
  const { data, error } = await supabase
    .from('artifacts')
    .select('id, current_stage, status, content')
    .eq('user_id', userId)
    .eq('type', 'path_checkpoint_session')
    .single();
  if (error || !data) throw new Error(`readSession failed for ${userId}: ${error?.message}`);
  return data;
}

async function pollUntil(userId: string, predicate: (row: Awaited<ReturnType<typeof readSession>>) => boolean, timeoutMs = 90000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const row = await readSession(userId);
    if (predicate(row)) return row;
    await new Promise(r => setTimeout(r, 2000));
  }
  throw new Error(`Timed out waiting for condition for user ${userId}`);
}

async function readFinalArtifact(userId: string) {
  const { data, error } = await supabase
    .from('artifacts')
    .select('id, status, content, path_checkpoint_session_id')
    .eq('user_id', userId)
    .eq('type', 'path_checkpoint_result')
    .eq('status', 'ready')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

// Stage 1 is already-verified identity_report data — summarize it in dumps
// so output stays readable (same convention as verify-129-stage-b.mts).
function stripStage1(stageOutputs: Record<string, unknown>) {
  const stage1 = stageOutputs.stage1 as { discovery_answers?: unknown[]; full_signatures?: unknown[] } | undefined;
  if (!stage1) return stageOutputs;
  return {
    ...stageOutputs,
    stage1: { __summary__: true, discovery_answers_count: stage1.discovery_answers?.length, full_signatures_count: stage1.full_signatures?.length },
  };
}

async function runPersona(persona: typeof PERSONAS[number], opts: { redoAtCheckpoint3: boolean }) {
  section(`PERSONA: ${persona.name} (${persona.userId})`);

  const before = await readSession(persona.userId);
  assertTrue(before.current_stage === 5 && before.status === 'awaiting_checkpoint' && !before.content.stage_outputs.stage5,
    'precondition: session parked at stage 5, awaiting_checkpoint, no stage5 output yet (reused from Stage B)');
  const stage1Snapshot = JSON.stringify(before.content.stage_outputs.stage1);
  const stage2Snapshot = JSON.stringify(before.content.stage_outputs.stage2);
  const stage3Snapshot = JSON.stringify(before.content.stage_outputs.stage3);
  const stage4Snapshot = JSON.stringify(before.content.stage_outputs.stage4);
  const chosenCandidateIdSnapshot = before.content.chosen_candidate_id;

  const testUser = await bootstrapTestUser(supabase, { email: persona.email, baseUrl: BASE_URL });
  const browser = await chromium.launch();
  const context = await browser.newContext({ storageState: testUser.storageStatePath });

  try {
    console.log('Polling POST /api/generate-path-options to trigger the Stage 5 kickoff...');
    const kickoff = await post(context, '/api/generate-path-options');
    dump('kickoff response', kickoff);
    assertTrue(kickoff.status === 200 && kickoff.json.current_stage === 5 && kickoff.json.status === 'generating',
      'kickoff correctly detected the parked stage-5 state and started Stage 5');

    let session = await pollUntil(persona.userId, r => r.status === 'awaiting_checkpoint' || r.status === 'failed');
    dump('session after Stage 5 (Checkpoint 3 reached)', { ...session, content: { ...session.content, stage_outputs: stripStage1(session.content.stage_outputs) } });
    assertTrue(session.status === 'awaiting_checkpoint' && session.current_stage === 5, 'reached Checkpoint 3');

    assertTrue(JSON.stringify(session.content.stage_outputs.stage1) === stage1Snapshot, 'stage1 unchanged by Stage 5 run');
    assertTrue(JSON.stringify(session.content.stage_outputs.stage2) === stage2Snapshot, 'stage2 unchanged by Stage 5 run');
    assertTrue(JSON.stringify(session.content.stage_outputs.stage3) === stage3Snapshot, 'stage3 unchanged by Stage 5 run');
    assertTrue(JSON.stringify(session.content.stage_outputs.stage4) === stage4Snapshot, 'stage4 unchanged by Stage 5 run');
    assertTrue(session.content.chosen_candidate_id === chosenCandidateIdSnapshot, 'chosen_candidate_id preserved through Stage 5 run (regression check for the recordStageOutput clobbering bug)');

    const stage5Initial = session.content.stage_outputs.stage5;
    dump('Stage 5 output (for grounding review)', stage5Initial);

    if (opts.redoAtCheckpoint3) {
      console.log('Requesting a REDO at Checkpoint 3...');
      const redo = await post(context, '/api/path-checkpoint-response', {
        role: 'redo',
        text: 'The stretch assessment feels off — look again at whether this is really as safe/Natural as stated, given the friction points.',
      });
      dump('redo response', redo);
      assertTrue(redo.status === 200, 'redo at Checkpoint 3 accepted');

      session = await pollUntil(persona.userId, r => r.status === 'awaiting_checkpoint' || r.status === 'failed');
      dump('session after Checkpoint 3 redo', { ...session, content: { ...session.content, stage_outputs: stripStage1(session.content.stage_outputs) } });

      assertTrue(JSON.stringify(session.content.stage_outputs.stage1) === stage1Snapshot, 'Checkpoint 3 redo left stage1 byte-identical');
      assertTrue(JSON.stringify(session.content.stage_outputs.stage2) === stage2Snapshot, 'Checkpoint 3 redo left stage2 byte-identical');
      assertTrue(JSON.stringify(session.content.stage_outputs.stage3) === stage3Snapshot, 'Checkpoint 3 redo left stage3 byte-identical');
      assertTrue(JSON.stringify(session.content.stage_outputs.stage4) === stage4Snapshot, 'Checkpoint 3 redo left stage4 byte-identical');
      assertTrue(session.content.chosen_candidate_id === chosenCandidateIdSnapshot, 'Checkpoint 3 redo left chosen_candidate_id byte-identical');
      assertTrue(JSON.stringify(session.content.stage_outputs.stage5) !== JSON.stringify(stage5Initial), 'Checkpoint 3 redo produced a different stage5 output');
      dump('Stage 5 output after redo', session.content.stage_outputs.stage5);
    }

    console.log('Proceeding from Checkpoint 3...');
    const proceed = await post(context, '/api/path-checkpoint-response', { role: 'proceed' });
    dump('proceed response', proceed);
    assertTrue(proceed.status === 200 && proceed.json.current_stage === 6, 'proceed from Checkpoint 3 advanced to stage 6');

    console.log('Polling for session completion (Stage 6)...');
    const finalSession = await pollUntil(persona.userId, r => r.status === 'complete' || r.status === 'failed');
    dump('final session row', { ...finalSession, content: { ...finalSession.content, stage_outputs: stripStage1(finalSession.content.stage_outputs) } });
    assertTrue(finalSession.status === 'complete', 'session reached complete status');

    const finalArtifact = await readFinalArtifact(persona.userId);
    if (!finalArtifact) throw new Error('No ready path_checkpoint_result artifact found');
    dump('FINAL path_checkpoint_result artifact (full content, for grounding + report-quality review)', finalArtifact);

    assertTrue(finalArtifact.path_checkpoint_session_id === finalSession.id, 'final artifact links back to the session');
    const c = finalArtifact.content;
    for (const field of ['thesis', 'what_it_is', 'why_it_fits', 'not_this', 'honest_cost', 'life_it_leads_toward']) {
      assertTrue(typeof c[field] === 'string' && c[field].length > 0, `final artifact has non-empty ${field}`);
    }
    assertTrue(Array.isArray(c.master_strategy) && c.master_strategy.length > 0, 'final artifact has a non-empty master_strategy array');
    assertTrue(Array.isArray(c.plan_seed_actions) && c.plan_seed_actions.length >= 3, 'final artifact has 3+ plan_seed_actions');

    return { name: persona.name, content: c };
  } finally {
    await context.close();
    await browser.close();
  }
}

async function main() {
  const results = [];
  results.push(await runPersona(PERSONAS[0], { redoAtCheckpoint3: true }));
  results.push(await runPersona(PERSONAS[1], { redoAtCheckpoint3: false }));
  results.push(await runPersona(PERSONAS[2], { redoAtCheckpoint3: false }));

  section('MASTER STRATEGY QUALITY — all 3 personas, for manual review');
  for (const r of results) {
    console.log(`\n${r.name} — thesis: "${r.content.thesis}"`);
    console.log(`${r.name} — master_strategy (${r.content.master_strategy.length} objectives):`);
    for (const obj of r.content.master_strategy) {
      console.log(`  - ${obj.name}`);
      console.log(`    rationale: ${obj.sequencing_rationale}`);
    }
    console.log(`${r.name} — plan_seed_actions: ${JSON.stringify(r.content.plan_seed_actions)}`);
  }

  section(failures === 0 ? 'ALL SCENARIOS PASSED (mechanical checks)' : `${failures} ASSERTION(S) FAILED`);
  console.log('Grounding, report quality, and master-strategy quality are judgment calls on the dumped content above, not automated asserts.');
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(err => {
  console.error('SCRIPT ERROR:', err);
  process.exit(1);
});
