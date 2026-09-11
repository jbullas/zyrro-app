/**
 * #134 Slice 3 UI live verification — final "Your Path" report + naming,
 * end to end via the real browser UI, per this session's own scoping pass:
 *   1. Report generation: generating state renders immediately once Options
 *      is complete, naming is NOT auto-opened while generating or the
 *      instant the report becomes ready.
 *   2. Ready report renders every current-schema section (thesis,
 *      what_it_is, why_it_fits, honest_cost, life_it_leads_toward,
 *      master_strategy) and none of the old Stage 5/6 sections
 *      (not_this / plan_seed_actions) that don't exist in this schema.
 *   3. The bottom "what's next" teaser renders as plain, non-clickable
 *      copy (no dead link to /plan or /mentor this slice).
 *   4. Naming: opening it generates exactly 3 real suggestions, picking one
 *      and saving persists it, and it survives a full page reload.
 *   5. Rename with a custom typed name (not a suggestion) replaces the
 *      picked one, both in the UI and in the DB.
 *   6. Skip persists project_name as an explicit `null`, not left as the
 *      prior value — and the "Name this project" CTA returns.
 *
 * Seeds path_direction_session and path_options_session directly at their
 * own already-complete terminal states (same reasoning
 * scripts/verify-134-slice2-ui.mts already used for path_direction_session:
 * neither is one of scripts/verification/session.mts's seedArtifact
 * ArtifactType values). path_options_session is seeded already-selected —
 * this pass starts exactly where path_report's own GET route picks up
 * (buildGenerationContext reads selected_candidate_id + the matching
 * candidate), without re-exercising Options' own generation UI, already
 * covered live in verify-134-slice2-ui.mts. Confirmed against
 * app/api/path-options/route.ts's own GET handler: a 'complete' session is
 * returned as-is, never regenerated or mutated.
 *
 * Reuses the exact chosen_candidate/must_haves/must_avoids/ideal_life
 * content family already validated for real generation this session
 * (scripts/test-134-slice3-report-checks.mts /
 * -project-name-checks.mts), so this UI pass isn't also the first exercise
 * of this exact combination.
 *
 * This exercises REAL LLM calls (path_report generation, plus one
 * /api/generate-project-name call per naming open/reopen) — no mocking,
 * same posture as verify-134-slice2-ui.mts.
 *
 * Run: npx tsx --env-file=.env.local scripts/verify-134-slice3-ui.mts
 * Requires the dev server running at http://localhost:3000.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { withVerificationSession } from './run-verification.mts';

const SCREENSHOT_DIR = path.join(process.cwd(), '.verification-runs', 'screenshots', '134-slice3');
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

// Same content family already validated for real generation this session —
// see this file's own header for why.
const MUST_HAVES = ['Clear scope', 'Deep focus time', 'Solving hard problems'];
const MUST_AVOIDS = ['Ambiguous requirements', 'Micromanagement'];
const IDEAL_LIFE_TEXT =
  'Running a small, focused team that ships things people actually use, with real ownership over the outcome.';
const CHOSEN_CANDIDATE = {
  name: 'Independent Systems Consultant',
  description:
    'This path means leaving full-time employment to work independently as a systems consultant, taking on a ' +
    'small number of client engagements at a time with full ownership over scope, timeline, and approach. It ' +
    'differs from staying employed by trading organizational stability for direct control over which problems ' +
    'you take on and how much time you spend on each. It meets your need for clear scope by letting you define ' +
    'engagement boundaries yourself before work begins, and gives you the deep, uninterrupted focus time that a ' +
    'full-time role split across competing priorities rarely allows. It requires building a client pipeline from ' +
    'nothing and handling the business side yourself in the early months.',
};
const COMMENTS_TEXT = 'Please keep the first milestone realistic — I only have evenings free for this right now.';

function identityReportContent() {
  return {
    cover: {
      prepared_for: 'Slice3 UI Verify User',
      named_identity: 'THE VERIFIER',
      identity_context: 'QA · Verification',
      report_metadata: 'Discovery Report · Version 1.0 · 2026',
      identity_thesis: 'A synthetic identity used only to verify #134 Slice 3.',
    },
    primary_constellation: [
      {
        signature_number: '01', name: 'The Systems Architect', domain: 'Thinking', score: 24,
        core_statement: 'You see the structure beneath a problem before anyone else names it.',
        evidence_analysis:
          'Across multiple discovery answers you described redesigning how a team worked, not just what it produced — ' +
          'restructuring a broken intake process at a prior job, then again reorganizing how a side project split its work.',
        tension: 'This strength can tip into over-engineering a problem that needed a quick, ugly fix.',
      },
      {
        signature_number: '02', name: 'The Quiet Closer', domain: 'Driving', score: 21,
        core_statement: 'You finish what other people abandon once the interesting part is over.',
        evidence_analysis:
          'You described shipping a project solo after two collaborators dropped off, and separately finishing a ' +
          'certification program years after everyone else in your cohort had quit.',
        tension: 'You can stay in a finishing role too long, past the point where you should have handed it off.',
      },
    ],
    secondary_signature_analysis: [],
    constellation_synthesis: { named_identity: 'THE VERIFIER', synthesis: 'Placeholder synthesis.' },
    how_you_operate: {
      work_style: 'Placeholder.', thinking_style: 'Placeholder.', relationship_style: 'Placeholder.',
      decision_style: 'Placeholder.', stress_pattern: 'Placeholder.',
    },
    energisers: ['Clear scope', 'Deep focus time'],
    friction_points: ['Ambiguous requirements', 'Micromanagement'],
    domain_profile: { Visioning: 40, Thinking: 90, Connecting: 30, Driving: 60, Sensing: 20 },
  };
}

async function seedCompletedDirectionSession(supabase: SupabaseClient, userId: string) {
  const { error } = await supabase
    .from('artifacts')
    .insert({
      user_id: userId,
      type: 'path_direction_session',
      access_level: 'paid',
      status: 'complete',
      content: { must_haves: MUST_HAVES, must_avoids: MUST_AVOIDS, ideal_life: IDEAL_LIFE_TEXT },
    });
  if (error) throw new Error(`Failed to seed path_direction_session: ${error.message}`);
}

async function seedCompletedOptionsSession(supabase: SupabaseClient, userId: string) {
  const candidateId = 'verify-candidate-1';
  const { error } = await supabase
    .from('artifacts')
    .insert({
      user_id: userId,
      type: 'path_options_session',
      access_level: 'paid',
      status: 'complete',
      content: {
        candidates: [{ id: candidateId, name: CHOSEN_CANDIDATE.name, description: CHOSEN_CANDIDATE.description, round: 1 }],
        selected_candidate_id: candidateId,
        comments: COMMENTS_TEXT,
      },
    });
  if (error) throw new Error(`Failed to seed path_options_session: ${error.message}`);
}

async function grantEntitlement(supabase: SupabaseClient, userId: string) {
  const { error } = await supabase
    .from('entitlements')
    .insert({ user_id: userId, product: 'onetime_payment', status: 'active', source: 'manual' });
  if (error) throw new Error(`Failed to grant entitlement: ${error.message}`);
}

async function readReportContent(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from('artifacts')
    .select('status, content')
    .eq('user_id', userId)
    .eq('type', 'path_report')
    .maybeSingle();
  if (error) throw new Error(`Failed reading path_report: ${error.message}`);
  return data as { status: string; content: Record<string, unknown> } | null;
}

async function main() {
  section('#134 Slice 3 UI — final "Your Path" report + naming, end to end');

  await withVerificationSession(async ({ supabase, testUser, driver, seedArtifact }) => {
    await seedArtifact({ type: 'identity_report', content: identityReportContent() });
    await seedCompletedDirectionSession(supabase, testUser.userId);
    await seedCompletedOptionsSession(supabase, testUser.userId);
    await grantEntitlement(supabase, testUser.userId);

    await driver.goto('/path');

    // ── Item 1: generating renders immediately; naming not auto-opened ──
    await driver.page.waitForSelector('text=Your Path is being finalized.', { timeout: 15000 });
    await driver.screenshot('01-generating');
    assertTrue(true, 'generating state renders immediately once Options is complete');

    const dialogWhileGenerating = await driver.page.locator('.dialog-overlay').count();
    assertTrue(dialogWhileGenerating === 0, 'naming dialog is not auto-opened while the report is still generating');

    // ── Item 2: real generation completes; report renders current-schema
    //    sections only; naming still not auto-opened ──
    await driver.page.waitForSelector('text=WHAT THIS PATH IS', { timeout: 240000 });
    await driver.screenshot('02-report-ready');

    const dialogOnReady = await driver.page.locator('.dialog-overlay').count();
    assertTrue(dialogOnReady === 0, 'naming dialog is NOT auto-opened the instant the report becomes ready');

    let bodyText = await driver.page.locator('body').innerText();
    assertTrue(bodyText.includes('WHAT THIS PATH IS'), 'WHAT THIS PATH IS section renders');
    assertTrue(bodyText.includes('WHY IT FITS'), 'WHY IT FITS section renders');
    assertTrue(bodyText.includes('THE HONEST COST'), 'THE HONEST COST section renders');
    assertTrue(bodyText.includes('WHERE THIS LEADS'), 'WHERE THIS LEADS section renders');
    assertTrue(bodyText.includes('YOUR STRATEGY'), 'YOUR STRATEGY section renders');
    assertTrue(
      !bodyText.includes('PATH ISN') && !bodyText.includes('A FEW PLACES TO START'),
      'no leftover old Stage 5/6 sections (not_this / plan_seed_actions) render — confirms the new schema, not the old one',
    );

    const strategyCards = driver.page.locator('.constellation-card');
    const strategyCardCount = await strategyCards.count();
    assertTrue(strategyCardCount > 0, `YOUR STRATEGY renders at least one objective card (found ${strategyCardCount})`);
    for (let i = 0; i < strategyCardCount; i++) {
      const rationale = (await strategyCards.nth(i).locator('.tension-block p').innerText()).trim();
      assertTrue(rationale.length > 0, `strategy card ${i + 1} has a non-empty "WHY NOW" sequencing rationale`);
    }

    // Cross-check against the DB row directly — precise, not hand-waved.
    const reportAfterGeneration = await readReportContent(supabase, testUser.userId);
    assertTrue(reportAfterGeneration?.status === 'ready', `path_report.status is "ready" in the DB (got "${reportAfterGeneration?.status}")`);
    const contentAfterGeneration = reportAfterGeneration?.content as {
      thesis: string; chosen_candidate: { name: string }; comments: string; project_name?: string | null;
    };
    assertTrue(bodyText.includes(contentAfterGeneration.thesis), 'rendered cover thesis matches the persisted DB thesis exactly');
    assertTrue(contentAfterGeneration.chosen_candidate.name === CHOSEN_CANDIDATE.name, 'persisted chosen_candidate.name matches the seeded selection');
    assertTrue(contentAfterGeneration.comments === COMMENTS_TEXT, 'persisted comments matches the seeded Options comments');
    assertTrue(!('project_name' in contentAfterGeneration), 'project_name is genuinely absent before naming is ever touched');

    // ── Item 3: "what's next" teaser renders as plain, non-clickable copy ──
    assertTrue(bodyText.includes('turns into a Project'), 'the "what\'s next" teaser copy renders');
    const teaserLinks = await driver.page.locator('a', { hasText: 'turns into a Project' }).count();
    assertTrue(teaserLinks === 0, 'the teaser is plain text, not a clickable link to anywhere');

    // Scoped to the teaser card specifically, since its one button's label
    // changes (Name this project / Rename it) as naming state changes below
    // — this avoids any ambiguity with the dialog's own same-ish-labeled
    // button once it's open.
    const teaserCard = driver.page.locator('.card', { hasText: 'turns into a Project' });
    const teaserCtaButton = teaserCard.locator('button');
    const dialogSaveButton = driver.page.locator('.dialog-card').locator('button', { hasText: 'Name this Project' });
    const dialogSkipButton = driver.page.locator('.dialog-card').locator('button', { hasText: 'Skip' });

    // ── Item 4: naming — open, generate, pick a suggestion, save ──
    assertTrue((await teaserCtaButton.innerText()).trim() === 'Name this project', 'teaser CTA reads "Name this project" before any naming has happened');
    await teaserCtaButton.click();

    await driver.page.waitForSelector('text=NAME YOUR PROJECT', { timeout: 5000 });
    await driver.screenshot('03-naming-dialog-open');

    await driver.page.waitForSelector('.project-name-card', { timeout: 30000 });
    await driver.screenshot('04-naming-suggestions');

    const suggestionCards = driver.page.locator('.project-name-card');
    const suggestionCount = await suggestionCards.count();
    assertTrue(suggestionCount === 3, `exactly 3 name suggestions render (found ${suggestionCount})`);

    const pickedName = (await suggestionCards.nth(0).locator('.project-name-card-title').innerText()).trim();
    const pickedRationale = (await suggestionCards.nth(0).locator('.project-name-card-rationale').innerText()).trim();
    assertTrue(pickedName.length > 0, 'first suggestion has a non-empty name');
    assertTrue(pickedRationale.length > 0, 'first suggestion has a non-empty rationale');

    await suggestionCards.nth(0).click();
    await dialogSaveButton.click();

    await driver.page.waitForSelector('.dialog-overlay', { state: 'detached', timeout: 10000 });
    await driver.screenshot('05-naming-saved');

    bodyText = await driver.page.locator('body').innerText();
    assertTrue(bodyText.includes(pickedName), `bottom block shows "You're calling this ${pickedName}"`);
    assertTrue((await teaserCtaButton.innerText()).trim() === 'Rename it', '"Rename it" replaces "Name this project" after a pick');

    const afterPick = await readReportContent(supabase, testUser.userId);
    assertTrue((afterPick?.content as { project_name?: string }).project_name === pickedName, 'DB project_name matches the picked suggestion');

    // ── Item 5 (persistence): reload — the picked name survives a fresh load ──
    await driver.goto('/path');
    await driver.page.waitForSelector('text=WHAT THIS PATH IS', { timeout: 30000 });
    bodyText = await driver.page.locator('body').innerText();
    assertTrue(bodyText.includes(pickedName), 'picked project name still renders after a full page reload');
    await driver.screenshot('06-after-reload');

    // ── Item 5 (rename): custom typed name, not a suggestion ──
    await teaserCtaButton.click();
    await driver.page.waitForSelector('.project-name-card', { timeout: 30000 });
    await driver.screenshot('07-rename-suggestions');

    const CUSTOM_NAME = 'The Verifier Consultancy';
    await driver.page.locator('input[placeholder="Or write your own"]').fill(CUSTOM_NAME);
    await dialogSaveButton.click();
    await driver.page.waitForSelector('.dialog-overlay', { state: 'detached', timeout: 10000 });

    bodyText = await driver.page.locator('body').innerText();
    assertTrue(bodyText.includes(CUSTOM_NAME), 'bottom block shows the custom typed name after rename');
    assertTrue(!bodyText.includes(pickedName), 'the old picked name is fully replaced, not left alongside the new one');

    const afterRename = await readReportContent(supabase, testUser.userId);
    assertTrue((afterRename?.content as { project_name?: string }).project_name === CUSTOM_NAME, 'DB project_name matches the custom typed name');

    // ── Item 6: skip persists an explicit null, "Name this project" returns ──
    await teaserCtaButton.click();
    await driver.page.waitForSelector('text=NAME YOUR PROJECT', { timeout: 5000 });
    await dialogSkipButton.click();
    await driver.page.waitForSelector('.dialog-overlay', { state: 'detached', timeout: 10000 });

    bodyText = await driver.page.locator('body').innerText();
    assertTrue((await teaserCtaButton.innerText()).trim() === 'Name this project', '"Name this project" CTA returns after a skip');
    assertTrue(!bodyText.includes(CUSTOM_NAME), 'the previous custom name no longer renders after a skip');
    await driver.screenshot('08-after-skip');

    const afterSkip = await readReportContent(supabase, testUser.userId);
    assertTrue(
      (afterSkip?.content as { project_name?: string | null }).project_name === null,
      'DB project_name is explicitly null after skip, not left as the prior value',
    );
  });

  section(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch(err => {
  console.error('SCRIPT ERROR:', err);
  process.exitCode = 1;
});
