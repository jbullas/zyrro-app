/**
 * #129 Stage D live verification. Part A: a genuinely fresh test persona
 * (Matteo_Rinaldi — real identity_report already exists, never touched by
 * Stage B/C) driven through the full live checkpoint flow via the real
 * browser UI, including a redo and a forced cap-exceeded case. Part B: the
 * 3 already-complete Stage B/C personas (Leona/Katalin/Matteo_Varga),
 * confirming the final report renders their real, untouched data via the
 * live UI. Part C: /identity regression check.
 */
import { chromium, type Page } from 'playwright';
import { createAdminClient, bootstrapTestUser } from './verification/session.mts';
import fs from 'node:fs';
import path from 'node:path';

const BASE_URL = 'http://localhost:3000';
const supabase = createAdminClient();
const SCREENSHOT_DIR = path.join(process.cwd(), '.verification-runs', 'screenshots', 'stage-d');
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

let failures = 0;
function assertTrue(cond: boolean, msg: string) {
  if (cond) console.log(`PASS: ${msg}`);
  else { console.error(`FAIL: ${msg}`); failures++; }
}
function section(title: string) {
  console.log('\n' + '='.repeat(78));
  console.log(title);
  console.log('='.repeat(78));
}

async function screenshot(page: Page, name: string) {
  const p = path.join(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path: p, fullPage: true });
  console.log(`Screenshot: ${p}`);
}

// .maybeSingle(), not .single() — the row genuinely doesn't exist yet for
// the first second or two after navigating to /path (the browser has to
// load, check auth/entitlement, then call POST /api/generate-path-options
// before any row is created). That's a normal, retryable "not created yet"
// state for pollUntil below, not an error.
async function readSession(userId: string) {
  const { data, error } = await supabase
    .from('artifacts')
    .select('id, current_stage, status, content')
    .eq('user_id', userId)
    .eq('type', 'path_checkpoint_session')
    .maybeSingle();
  if (error) throw new Error(`readSession failed: ${error.message}`);
  return data;
}

async function pollUntil(userId: string, predicate: (row: NonNullable<Awaited<ReturnType<typeof readSession>>>) => boolean, timeoutMs = 180000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const row = await readSession(userId);
    if (row && predicate(row)) return row;
    await new Promise(r => setTimeout(r, 3000));
  }
  throw new Error(`Timed out waiting for condition for user ${userId}`);
}

async function main() {
  section('PART A — fresh full-flow walkthrough (Matteo_Rinaldi)');

  const MR = { email: 'miroslav+matteo_rinaldi@jeffbullas.com', userId: 'e35442e1-5bb6-472a-b228-616bfb5b4a9e' };
  const testUser = await bootstrapTestUser(supabase, { email: MR.email, baseUrl: BASE_URL });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: testUser.storageStatePath });
  const page = await context.newPage();

  console.log('Navigating to /path...');
  await page.goto(`${BASE_URL}/path`);
  await screenshot(page, '01-initial-load');

  console.log('Polling DB for Checkpoint 1...');
  let session = await pollUntil(MR.userId, r => r.status === 'awaiting_checkpoint' && r.current_stage === 2);
  await page.waitForLoadState('networkidle');
  await screenshot(page, '02-checkpoint-1');
  const overlaps = (session.content.stage_outputs as { stage2: { overlaps: { signature: string }[] } }).stage2.overlaps;
  const bodyText1 = await page.locator('body').innerText();
  assertTrue(bodyText1.includes(overlaps[0].signature), `Checkpoint 1 DOM shows real overlap signature "${overlaps[0].signature}"`);
  assertTrue(bodyText1.includes('CHECKPOINT 1'), 'Checkpoint 1 heading present');

  console.log('Submitting a redo at Checkpoint 1...');
  const stage1Snapshot = JSON.stringify(session.content.stage_outputs.stage1);
  const stage2BeforeRedo = JSON.stringify(session.content.stage_outputs.stage2);
  await page.locator('textarea.input-field--textarea').fill('Please look again for anything tied to research or careful analysis.');
  await page.locator('text=Try again with this').click();
  await screenshot(page, '03-checkpoint-1-submitting');

  session = await pollUntil(MR.userId, r =>
    r.status === 'awaiting_checkpoint' && r.current_stage === 2 &&
    JSON.stringify((r.content.stage_outputs as Record<string, unknown>).stage2) !== stage2BeforeRedo,
  );
  await page.waitForTimeout(3500); // let the client's own poll tick catch up
  await screenshot(page, '04-checkpoint-1-after-redo');
  assertTrue(JSON.stringify(session.content.stage_outputs.stage1) === stage1Snapshot, 'Redo isolation: stage1 unchanged after Checkpoint 1 redo (direct DB read)');

  console.log('Proceeding to Checkpoint 2...');
  await page.locator('text=Yes, this reads right').click();
  session = await pollUntil(MR.userId, r => r.status === 'awaiting_checkpoint' && r.current_stage === 4);
  await page.waitForTimeout(3500);
  await screenshot(page, '05-checkpoint-2');
  const candidates = (session.content.stage_outputs as { stage4: { candidates: { name: string }[] } }).stage4.candidates;
  const bodyText2 = await page.locator('body').innerText();
  assertTrue(bodyText2.includes(candidates[0].name), `Checkpoint 2 DOM shows real candidate "${candidates[0].name}"`);

  console.log('Selecting the first candidate and proceeding...');
  await page.locator('.project-name-card').first().click();
  await screenshot(page, '06-checkpoint-2-selected');
  await page.locator('text=Choose this direction').click();

  console.log('Waiting for Stage 5 kickoff + Checkpoint 3 (real LLM call)...');
  session = await pollUntil(MR.userId, r => r.status === 'awaiting_checkpoint' && r.current_stage === 5 && !!(r.content.stage_outputs as Record<string, unknown>).stage5, 180000);
  await page.waitForTimeout(3500);
  await screenshot(page, '07-checkpoint-3');
  const stage5 = (session.content.stage_outputs as { stage5: { developed_thesis: string } }).stage5;
  const bodyText3 = await page.locator('body').innerText();
  assertTrue(bodyText3.includes(stage5.developed_thesis), 'Checkpoint 3 DOM shows real developed_thesis');

  console.log('Forcing the redo cap at Checkpoint 3 (3 redos)...');
  const stage1234Snapshot = JSON.stringify({
    s1: session.content.stage_outputs.stage1, s2: session.content.stage_outputs.stage2,
    s3: session.content.stage_outputs.stage3, s4: session.content.stage_outputs.stage4,
  });
  let lastStage5 = JSON.stringify(stage5);

  for (let i = 1; i <= 3; i++) {
    console.log(`  Redo attempt ${i}...`);
    await page.locator('textarea.input-field--textarea').fill(`Redo attempt ${i} — reconsider the stretch assessment.`);
    await page.locator('text=Try again with this').click();

    if (i < 3) {
      session = await pollUntil(MR.userId, r =>
        r.status === 'awaiting_checkpoint' && r.current_stage === 5 &&
        JSON.stringify((r.content.stage_outputs as { stage5: unknown }).stage5) !== lastStage5,
      );
      lastStage5 = JSON.stringify(session.content.stage_outputs.stage5);
      await page.waitForTimeout(3500);
      await screenshot(page, `08-checkpoint-3-after-redo-${i}`);
    } else {
      // 3rd redo should exceed the cap and auto-force a proceed straight to stage 6.
      session = await pollUntil(MR.userId, r => r.current_stage === 6 || r.status === 'complete', 180000);
    }
  }

  const exchanges = await supabase
    .from('path_checkpoint_exchanges')
    .select('stage, role, content, created_at')
    .eq('session_id', session.id)
    .eq('stage', 5)
    .order('created_at', { ascending: true });
  console.log('Full stage-5 exchange log:', JSON.stringify(exchanges.data, null, 2));
  const capExchange = exchanges.data?.find(e => e.role === 'redo' && (e.content as { cap_exceeded?: boolean })?.cap_exceeded);
  const autoForcedExchange = exchanges.data?.find(e => e.role === 'proceed' && (e.content as { auto_forced?: boolean })?.auto_forced);
  assertTrue(!!capExchange, 'cap_exceeded redo exchange logged');
  assertTrue(!!autoForcedExchange, 'auto_forced proceed exchange logged');

  console.log('Waiting for final report (Stage 6, real LLM call) after cap-exceeded auto-proceed...');
  session = await pollUntil(MR.userId, r => r.status === 'complete', 180000);
  const finalSnapshot = JSON.stringify({
    s1: session.content.stage_outputs.stage1, s2: session.content.stage_outputs.stage2,
    s3: session.content.stage_outputs.stage3, s4: session.content.stage_outputs.stage4,
  });
  assertTrue(finalSnapshot === stage1234Snapshot, 'Stages 1-4 byte-identical after the whole Checkpoint 3 redo/cap sequence');

  await page.waitForTimeout(4000);
  await screenshot(page, '09-final-report');
  const bodyText4 = await page.locator('body').innerText();
  assertTrue(bodyText4.includes('WHAT THIS PATH IS'), 'Final report section headings present in DOM');
  // The cap fired at Checkpoint 3 (the last checkpoint), so the session jumped
  // straight through Stage 6 to this completed report with no intermediate
  // checkpoint screen to show the notice on — it must render here instead.
  // autoForcedExchange already confirms the cap really was exceeded server-side,
  // so this checks the UI actually surfaces that, not a tautology.
  assertTrue(bodyText4.includes('used up your redos'), 'Cap-exceeded notice rendered on the final report itself (not silently skipped)');

  const namingVisible = await page.locator('text=NAME YOUR PROJECT').isVisible().catch(() => false);
  console.log(`Naming dialog auto-opened: ${namingVisible}`);
  let namedAs: string | null = null;
  if (namingVisible) {
    await screenshot(page, '10-naming-dialog');
    await page.waitForSelector('.project-name-card', { timeout: 30000 });
    const firstOptionTitle = await page.locator('.project-name-card .project-name-card-title').first().innerText();
    namedAs = firstOptionTitle;
    await page.locator('.project-name-card').first().click();
    await page.locator('text=Name this Project').click();
    await page.waitForSelector('text=NAME YOUR PROJECT', { state: 'hidden', timeout: 30000 });
    await page.waitForTimeout(1000);
    await screenshot(page, '11-after-naming');
  }

  await browser.close();

  if (namedAs) {
    const { data: finalResult } = await supabase
      .from('artifacts')
      .select('content')
      .eq('user_id', MR.userId)
      .eq('type', 'path_checkpoint_result')
      .eq('status', 'ready')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    console.log(`Saved project_name on path_checkpoint_result: ${JSON.stringify((finalResult?.content as { project_name?: string })?.project_name)}`);
    assertTrue((finalResult?.content as { project_name?: string })?.project_name === namedAs, 'Chosen project name persisted to path_checkpoint_result.content (direct DB read)');
  }

  section('PART B — final-report render check (Leona, Katalin, Matteo_Varga — untouched)');

  const EXISTING = [
    { name: 'Leona', email: 'miroslav+leona_markovic@jeffbullas.com', userId: 'd3fdbac6-2263-4acb-abec-9aff07a70ad3' },
    { name: 'Katalin', email: 'miroslav+katalin_farkas@jeffbullas.com', userId: '9afc7420-4e18-4866-ac17-e02e2c9be658' },
    { name: 'Matteo_Varga', email: 'miroslav+matteo_varga@jeffbullas.com', userId: '48ca28e9-61fe-47c0-a8f0-f54c9b5665b3' },
  ];

  for (const p of EXISTING) {
    console.log(`\nChecking ${p.name}...`);
    const tu = await bootstrapTestUser(supabase, { email: p.email, baseUrl: BASE_URL });
    const b2 = await chromium.launch({ headless: true });
    const c2 = await b2.newContext({ storageState: tu.storageStatePath });
    const pg2 = await c2.newPage();
    await pg2.goto(`${BASE_URL}/path`);
    await pg2.waitForSelector('text=WHAT THIS PATH IS', { timeout: 60000 });
    await pg2.waitForTimeout(1000);
    await screenshot(pg2, `${p.name}-final-report`);

    const { data: result } = await supabase
      .from('artifacts')
      .select('content')
      .eq('user_id', p.userId)
      .eq('type', 'path_checkpoint_result')
      .eq('status', 'ready')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    const pageText = await pg2.locator('body').innerText();
    assertTrue(pageText.includes((result!.content as { thesis: string }).thesis.slice(0, 40)), `${p.name}: DOM shows real, untouched thesis text`);
    await b2.close();
  }

  section('PART C — /identity regression check');
  const tu3 = await bootstrapTestUser(supabase, { email: EXISTING[0].email, baseUrl: BASE_URL });
  const b3 = await chromium.launch({ headless: true });
  const c3 = await b3.newContext({ storageState: tu3.storageStatePath });
  const pg3 = await c3.newPage();
  await pg3.goto(`${BASE_URL}/identity`);
  await pg3.waitForSelector('text=DOMAIN PROFILE', { timeout: 60000 });
  await screenshot(pg3, 'identity-regression-check');
  const identityText = await pg3.locator('body').innerText();
  assertTrue(identityText.includes('SIGNATURE PROFILE'), '/identity renders correctly (no shared-component regression)');
  await b3.close();

  section(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(err => {
  console.error('SCRIPT ERROR:', err);
  process.exit(1);
});
