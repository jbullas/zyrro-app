/**
 * #129 Stage B verification — runs the real (non-placeholder) reasoning
 * pipeline (Stages 1-4 + Checkpoints 1-2) end to end via the real HTTP
 * routes, against 3 real personas' real discovery_answers. Real OpenAI
 * calls throughout. See docs/briefs/129-stage-b-reasoning-pipeline-brief.md
 * for the required scenarios and verification checks this covers.
 *
 * Run: npx tsx --env-file=.env.local scripts/verify-129-stage-b.mts
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

// Stage 1 is pure retrieval of already-known-good identity_report data
// (dumped and reviewed once at persona-refresh time already) — dumping it in
// full every time a session object is printed just re-prints the same huge
// object repeatedly and drowns out the actual thing being checked (Stage
// 2/3/4's reasoning). Replace it with a one-line summary everywhere except
// the one deliberate full dump right after Checkpoint 1 is first reached.
function summarizeSession(session: { content: { stage_outputs: Record<string, unknown> } } & Record<string, unknown>) {
  const stage1 = session.content.stage_outputs.stage1 as
    | { discovery_answers?: unknown[]; full_signatures?: unknown[]; forward_frame?: string }
    | undefined;
  const stage1Summary = stage1
    ? {
        __summary__: true,
        discovery_answers_count: stage1.discovery_answers?.length,
        full_signatures_count: stage1.full_signatures?.length,
        forward_frame: stage1.forward_frame,
      }
    : undefined;
  return {
    ...session,
    content: {
      ...session.content,
      stage_outputs: { ...session.content.stage_outputs, ...(stage1Summary ? { stage1: stage1Summary } : {}) },
    },
  };
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

async function pollSessionAwaitingCheckpoint(userId: string, timeoutMs = 90000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { data } = await supabase
      .from('artifacts')
      .select('id, current_stage, status, content')
      .eq('user_id', userId)
      .eq('type', 'path_checkpoint_session')
      .single();
    if (data && (data.status === 'awaiting_checkpoint' || data.status === 'failed' || data.status === 'complete')) {
      return data;
    }
    await new Promise(r => setTimeout(r, 2000));
  }
  throw new Error('Timed out waiting for session to leave generating');
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

async function readExchanges(sessionId: string) {
  const { data, error } = await supabase
    .from('path_checkpoint_exchanges')
    .select('id, stage, role, content, created_at')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return data;
}

async function cleanupPriorSession(userId: string) {
  await supabase.from('artifacts').delete().eq('user_id', userId).eq('type', 'path_checkpoint_session');
}

type PersonaResult = {
  name: string;
  stage4Candidates: Array<{ id: string; name: string; thesis: string }>;
};

async function runPersona(
  persona: typeof PERSONAS[number],
  opts: { redoAtCheckpoint1: boolean; redoAtCheckpoint2: boolean; forceCap: boolean; testConcurrency: boolean },
): Promise<PersonaResult> {
  section(`PERSONA: ${persona.name} (${persona.userId})`);
  await cleanupPriorSession(persona.userId);

  const testUser = await bootstrapTestUser(supabase, { email: persona.email, baseUrl: BASE_URL });
  const browser = await chromium.launch();
  const context = await browser.newContext({ storageState: testUser.storageStatePath });

  try {
    console.log('Starting session (POST /api/generate-path-options)...');
    const start = await post(context, '/api/generate-path-options');
    dump('start response', start);
    assertTrue(start.status === 200, 'session start returned 200');

    if (opts.testConcurrency) {
      console.log('Firing a concurrent duplicate start request to confirm the create-race guard still holds via the real route...');
      const [a, b] = await Promise.all([post(context, '/api/generate-path-options'), post(context, '/api/generate-path-options')]);
      dump('concurrent start A', a);
      dump('concurrent start B', b);
      assertTrue(a.json.session_id === b.json.session_id, 'concurrent duplicate starts resolved to the same session id');
    }

    console.log('Polling for Checkpoint 1 (stage 2)...');
    let session = await pollSessionAwaitingCheckpoint(persona.userId);
    dump('session at Checkpoint 1', session);
    assertTrue(session.status === 'awaiting_checkpoint' && session.current_stage === 2, 'reached Checkpoint 1');

    const stage1AtCp1 = JSON.stringify(session.content.stage_outputs.stage1);
    const stage2Initial = session.content.stage_outputs.stage2;
    dump('Stage 2 initial output (for grounding review)', stage2Initial);

    if (opts.redoAtCheckpoint1) {
      console.log('Requesting a REDO at Checkpoint 1...');
      const redo = await post(context, '/api/path-checkpoint-response', {
        role: 'redo',
        text: 'This misses my analytical/research side — dig deeper into any capability tied to careful investigation before deciding.',
      });
      dump('redo response', redo);
      assertTrue(redo.status === 200, 'redo at Checkpoint 1 accepted');

      session = await pollSessionAwaitingCheckpoint(persona.userId);
      dump('session after Checkpoint 1 redo (stage1 summarized — unchanged, full dump was above)', summarizeSession(session));
      const stage1AfterRedo = JSON.stringify(session.content.stage_outputs.stage1);
      assertTrue(stage1AfterRedo === stage1AtCp1, 'Checkpoint 1 redo left stage1 output byte-identical (direct DB read)');
      assertTrue(
        JSON.stringify(session.content.stage_outputs.stage2) !== JSON.stringify(stage2Initial),
        'Checkpoint 1 redo produced a different stage2 output than the initial one',
      );
    }

    if (opts.forceCap) {
      console.log('Forcing the redo cap at Checkpoint 1 (2 more redos to exceed the 2-max cap)...');
      for (let i = 0; i < 2; i++) {
        const redo = await post(context, '/api/path-checkpoint-response', { role: 'redo', text: `steer attempt ${i + 2}` });
        dump(`redo attempt ${i + 2} response`, redo);
        session = await pollSessionAwaitingCheckpoint(persona.userId);
      }
      console.log('This next redo should exceed the cap and auto-force a proceed instead of regenerating...');
      const capRedo = await post(context, '/api/path-checkpoint-response', { role: 'redo', text: 'one more try' });
      dump('cap-exceeded redo response', capRedo);
      assertTrue(capRedo.status === 200 && capRedo.json.current_stage === 3, 'cap-exceeded redo auto-forced a proceed to stage 3');

      const exchanges = await readExchanges(session.id);
      const capExchange = exchanges.find((e: { role: string; content: { cap_exceeded?: boolean } }) => e.role === 'redo' && e.content?.cap_exceeded);
      const autoForcedExchange = exchanges.find((e: { role: string; content: { auto_forced?: boolean } }) => e.role === 'proceed' && e.content?.auto_forced);
      dump('cap_exceeded exchange found', capExchange);
      dump('auto_forced proceed exchange found', autoForcedExchange);
      assertTrue(!!capExchange, 'a redo exchange is logged with cap_exceeded: true');
      assertTrue(!!autoForcedExchange, 'a proceed exchange is logged with auto_forced: true');

      session = await pollSessionAwaitingCheckpoint(persona.userId);
    } else {
      console.log('Proceeding from Checkpoint 1...');
      const proceed = await post(context, '/api/path-checkpoint-response', { role: 'proceed' });
      dump('proceed response', proceed);
      assertTrue(proceed.status === 200 && proceed.json.current_stage === 3, 'proceed from Checkpoint 1 advanced to stage 3');
    }

    const stage2Confirmed = JSON.stringify(session.content.stage_outputs.stage2 ?? (await readSession(persona.userId)).content.stage_outputs.stage2);

    console.log('Polling for Checkpoint 2 (stage 4)...');
    session = await pollSessionAwaitingCheckpoint(persona.userId);
    dump('session at Checkpoint 2 (stage1 summarized; stage3/stage4 dumped in full separately below)', summarizeSession(session));
    assertTrue(session.status === 'awaiting_checkpoint' && session.current_stage === 4, 'reached Checkpoint 2');

    const stage1AtCp2 = JSON.stringify(session.content.stage_outputs.stage1);
    const stage2AtCp2 = JSON.stringify(session.content.stage_outputs.stage2);
    const stage3AtCp2 = session.content.stage_outputs.stage3;
    dump('Stage 3 output (friction-test)', stage3AtCp2);
    const stage4Initial = session.content.stage_outputs.stage4;
    dump('Stage 4 initial output (for grounding + genericness review)', stage4Initial);

    assertTrue(stage1AtCp2 === stage1AtCp1, 'stage1 output still byte-identical at Checkpoint 2');
    assertTrue(stage2AtCp2 === stage2Confirmed, 'stage2 output still byte-identical at Checkpoint 2 (unchanged by Stage 3/4 run)');

    let finalStage4 = stage4Initial;

    if (opts.redoAtCheckpoint2) {
      console.log('Requesting a REDO at Checkpoint 2...');
      const redo = await post(context, '/api/path-checkpoint-response', {
        role: 'redo',
        text: 'None of these feel like the real fork — reconsider using the friction-tested overlaps again, maybe a different grouping.',
      });
      dump('Checkpoint 2 redo response', redo);
      assertTrue(redo.status === 200, 'redo at Checkpoint 2 accepted');

      session = await pollSessionAwaitingCheckpoint(persona.userId);
      dump('session after Checkpoint 2 redo (stage1 summarized — unchanged, full dump was above)', summarizeSession(session));
      const stage1AfterCp2Redo = JSON.stringify(session.content.stage_outputs.stage1);
      const stage2AfterCp2Redo = JSON.stringify(session.content.stage_outputs.stage2);
      const stage3AfterCp2Redo = JSON.stringify(session.content.stage_outputs.stage3);
      assertTrue(stage1AfterCp2Redo === stage1AtCp2, 'Checkpoint 2 redo left stage1 output byte-identical');
      assertTrue(stage2AfterCp2Redo === stage2AtCp2, 'Checkpoint 2 redo left stage2 output byte-identical');
      assertTrue(stage3AfterCp2Redo === JSON.stringify(stage3AtCp2), 'Checkpoint 2 redo left stage3 output byte-identical');
      finalStage4 = session.content.stage_outputs.stage4;
      assertTrue(JSON.stringify(finalStage4) !== JSON.stringify(stage4Initial), 'Checkpoint 2 redo produced a different stage4 output');
      dump('Stage 4 output after redo', finalStage4);
    }

    const chosenId = finalStage4.candidates[0].id;
    console.log(`Proceeding from Checkpoint 2 with choice=${chosenId}...`);
    const finalProceed = await post(context, '/api/path-checkpoint-response', { role: 'proceed', choice: chosenId });
    dump('Checkpoint 2 proceed response', finalProceed);
    assertTrue(finalProceed.status === 200 && finalProceed.json.chosen_candidate_id === chosenId, 'Checkpoint 2 proceed recorded the chosen candidate');

    const finalSession = await readSession(persona.userId);
    dump('final session row (stage1 summarized)', summarizeSession(finalSession));
    assertTrue(finalSession.current_stage === 5, 'session current_stage advanced to 5, ready for Stage C');
    assertTrue(finalSession.content.chosen_candidate_id === chosenId, 'chosen_candidate_id persisted on the session row (direct DB read)');

    const allExchanges = await readExchanges(session.id);
    dump('full exchange log for this persona', allExchanges);

    return {
      name: persona.name,
      stage4Candidates: finalStage4.candidates.map((c: { id: string; name: string; thesis: string }) => ({ id: c.id, name: c.name, thesis: c.thesis })),
    };
  } finally {
    await context.close();
    await browser.close();
  }
}

async function main() {
  const results: PersonaResult[] = [];

  results.push(await runPersona(PERSONAS[0], { redoAtCheckpoint1: true, redoAtCheckpoint2: true, forceCap: false, testConcurrency: false }));
  results.push(await runPersona(PERSONAS[1], { redoAtCheckpoint1: false, redoAtCheckpoint2: false, forceCap: true, testConcurrency: false }));
  results.push(await runPersona(PERSONAS[2], { redoAtCheckpoint1: false, redoAtCheckpoint2: false, forceCap: false, testConcurrency: true }));

  section('GENERICNESS SELF-CHECK — Stage 4 candidate sets across all 3 personas');
  for (const r of results) {
    console.log(`\n${r.name}:`);
    for (const c of r.stage4Candidates) {
      console.log(`  - [${c.id}] ${c.name}: ${c.thesis}`);
    }
  }

  section(failures === 0 ? 'ALL SCENARIOS PASSED (mechanical checks)' : `${failures} ASSERTION(S) FAILED`);
  console.log('Grounding and genericness are judgment calls on the dumped content above, not automated asserts — see the changelog for that review.');
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(err => {
  console.error('SCRIPT ERROR:', err);
  process.exit(1);
});
