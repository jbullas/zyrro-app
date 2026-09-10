/**
 * #134 Slice 2 live verification — Checkpoint 2 "Options" end to end via
 * the real browser UI, per the 6-item check list:
 *   1. Initial-generation spinner appears, then exactly 4 cards render,
 *      each with a non-empty name/description and a "Select This Path →"
 *      button.
 *   2. Selecting a card reveals the comments field on the same screen;
 *      confirming completes the session and the terminal summary shows
 *      the chosen candidate.
 *   3. Refine once: the UI returns to a generating state, then resolves to
 *      6 cards total — the original 4 still present, unchanged
 *      (append, not replace).
 *   4. Refine again: 8 cards total, originals still present.
 *   5. At 8, the free-text refine section is no longer rendered
 *      (client-side cap enforcement).
 *   6. Selecting from the 8-card state completes normally.
 *
 * Items 1-2 run against a fresh user (LEG A); items 3-6 run against a
 * separate fresh user (LEG B), since refining to 8 needs its own real
 * generation rounds and shouldn't be entangled with LEG A's own selection.
 *
 * Each leg seeds a completed identity_report AND a completed
 * path_direction_session directly — path_direction_session isn't one of
 * scripts/verification/session.mts's seedArtifact ArtifactType values (that
 * helper's `status` union is Tier C's generating/ready/failed vocabulary,
 * not path_direction_session's own in_progress/complete), so this inserts
 * it directly via supabase.from('artifacts').insert(...), the same way
 * verify-134-slice1.mts inserts the entitlement row directly rather than
 * through a seeding helper that doesn't cover it.
 *
 * This exercises REAL LLM calls (the initial 4, and each +2 refine round)
 * — no mocking. Must_haves/must_avoids/primary_constellation reuse the
 * exact context already validated in
 * scripts/test-134-slice2-options-checks.mts's real generation runs this
 * session, to keep this live-UI pass from also being the first time that
 * content combination is exercised.
 *
 * Run: npx tsx --env-file=.env.local scripts/verify-134-slice2-ui.mts
 * Requires the dev server running at http://localhost:3000.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { withVerificationSession } from './run-verification.mts';

const SCREENSHOT_DIR = path.join(process.cwd(), '.verification-runs', 'screenshots', '134-slice2');
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

const MUST_HAVES = ['Clear scope', 'Deep focus time', 'Solving hard problems'];
const MUST_AVOIDS = ['Ambiguous requirements', 'Micromanagement'];
const IDEAL_LIFE_TEXT =
  'Running a small, focused team that ships things people actually use, with real ownership over the outcome.';

function identityReportContent() {
  return {
    cover: {
      prepared_for: 'Slice2 UI Verify User',
      named_identity: 'THE VERIFIER',
      identity_context: 'QA · Verification',
      report_metadata: 'Discovery Report · Version 1.0 · 2026',
      identity_thesis: 'A synthetic identity used only to verify #134 Slice 2.',
    },
    primary_constellation: [
      {
        signature_number: '01', name: 'The Systems Architect', domain: 'Thinking', score: 24,
        core_statement: 'You see the structure beneath a problem before anyone else names it.',
        evidence_analysis:
          'Across multiple discovery answers you described redesigning how a team worked, not just what it produced.',
        tension: 'This strength can tip into over-engineering a problem that needed a quick, ugly fix.',
      },
      {
        signature_number: '02', name: 'The Quiet Closer', domain: 'Driving', score: 21,
        core_statement: 'You finish what other people abandon once the interesting part is over.',
        evidence_analysis: 'You described shipping a project solo after two collaborators dropped off.',
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
      content: {
        must_haves: MUST_HAVES,
        must_avoids: MUST_AVOIDS,
        ideal_life: IDEAL_LIFE_TEXT,
      },
    });
  if (error) throw new Error(`Failed to seed path_direction_session: ${error.message}`);
}

async function grantEntitlement(supabase: SupabaseClient, userId: string) {
  const { error } = await supabase
    .from('entitlements')
    .insert({ user_id: userId, product: 'onetime_payment', status: 'active', source: 'manual' });
  if (error) throw new Error(`Failed to grant entitlement: ${error.message}`);
}

async function waitForCardCount(page: import('playwright').Page, count: number, timeout: number) {
  await page.waitForFunction(
    (n) => document.querySelectorAll('.constellation-card').length >= n,
    count,
    { timeout },
  );
}

async function main() {
  section('LEG A — initial generation, select a card, confirm to complete');

  await withVerificationSession(async ({ supabase, testUser, driver, seedArtifact }) => {
    await seedArtifact({ type: 'identity_report', content: identityReportContent() });
    await seedCompletedDirectionSession(supabase, testUser.userId);
    await grantEntitlement(supabase, testUser.userId);

    await driver.goto('/path');

    // ── Item 1: initial-generation spinner, then exactly 4 cards ──
    await driver.page.waitForSelector('text=Your options are being generated.', { timeout: 30000 });
    await driver.screenshot('01-generating-initial');
    assertTrue(true, 'initial-generation spinner renders immediately once Direction is complete');

    await waitForCardCount(driver.page, 4, 240000);
    await driver.screenshot('02-four-cards');

    const cards = driver.page.locator('.constellation-card');
    const cardCount = await cards.count();
    assertTrue(cardCount === 4, `exactly 4 cards render after initial generation (found ${cardCount})`);

    for (let i = 0; i < cardCount; i++) {
      const name = (await cards.nth(i).locator('.constellation-sig-name').innerText()).trim();
      const description = (await cards.nth(i).locator('.evidence-analysis').innerText()).trim();
      assertTrue(name.length > 0, `card ${i + 1} has a non-empty name`);
      assertTrue(description.length > 0, `card ${i + 1} has a non-empty description`);
      const selectButtonCount = await cards.nth(i).locator('button:has-text("Select This Path")').count();
      assertTrue(selectButtonCount === 1, `card ${i + 1} has a "Select This Path →" button`);
    }

    // ── Item 2: select a card, comments field appears, confirm to complete ──
    const chosenName = (await cards.nth(0).locator('.constellation-sig-name').innerText()).trim();
    const chosenDescription = (await cards.nth(0).locator('.evidence-analysis').innerText()).trim();

    await cards.nth(0).locator('button:has-text("Select This Path")').click();

    const commentsCard = driver.page.locator('.card', { hasText: 'ANYTHING ELSE?' });
    await commentsCard.waitFor({ timeout: 10000 });
    assertTrue(true, 'comments field appears on the same screen after selecting a card');
    await driver.screenshot('03-comments-field');

    const COMMENTS_TEXT = 'Please keep the first milestone realistic — I only have evenings free for this.';
    await commentsCard.locator('textarea').fill(COMMENTS_TEXT);
    await commentsCard.locator('button:has-text("Confirm selection")').click();

    await driver.page.waitForSelector('text=Your path is set', { timeout: 15000 });
    await driver.screenshot('04-complete-summary');
    const bodyText = await driver.page.locator('body').innerText();
    assertTrue(bodyText.includes(chosenName), 'terminal summary shows the chosen candidate’s name');
    assertTrue(bodyText.includes(chosenDescription), 'terminal summary shows the chosen candidate’s description');
    assertTrue(bodyText.includes(COMMENTS_TEXT), 'terminal summary shows the submitted comments');

    const { data: sessionRow, error: readErr } = await supabase
      .from('artifacts')
      .select('status, content')
      .eq('user_id', testUser.userId)
      .eq('type', 'path_options_session')
      .maybeSingle();
    if (readErr) throw new Error(`Failed reading path_options_session: ${readErr.message}`);
    assertTrue(sessionRow?.status === 'complete', `path_options_session.status is "complete" in the DB (got "${sessionRow?.status}")`);
    const content = sessionRow?.content as {
      candidates: Array<{ id: string; name: string }>;
      selected_candidate_id: string | null;
      comments: string | null;
    };
    assertTrue(
      Array.isArray(content?.candidates) && content.candidates.length === 4,
      `DB shows 4 candidates persisted (got ${content?.candidates?.length})`,
    );
    const selected = content?.candidates.find(c => c.name === chosenName);
    assertTrue(
      !!selected && content?.selected_candidate_id === selected.id,
      'DB selected_candidate_id matches the candidate that was clicked',
    );
    assertTrue(content?.comments === COMMENTS_TEXT, 'DB comments matches submitted text');
  });

  section('LEG B — refine twice (4 → 6 → 8), append-not-replace, cap hides refine, select from 8');

  await withVerificationSession(async ({ supabase, testUser, driver, seedArtifact }) => {
    await seedArtifact({ type: 'identity_report', content: identityReportContent() });
    await seedCompletedDirectionSession(supabase, testUser.userId);
    await grantEntitlement(supabase, testUser.userId);

    await driver.goto('/path');
    await waitForCardCount(driver.page, 4, 240000);
    await driver.screenshot('05-refine-initial-four');

    const initialCards = driver.page.locator('.constellation-card');
    const initialCount = await initialCards.count();
    const initialNames: string[] = [];
    for (let i = 0; i < initialCount; i++) {
      initialNames.push((await initialCards.nth(i).locator('.constellation-sig-name').innerText()).trim());
    }
    assertTrue(initialNames.length === 4, `captured 4 initial candidate names before refining (got ${initialNames.length})`);

    // ── Item 3: refine once → back to generating → 6 cards, originals intact ──
    const refineCard1 = driver.page.locator('.card', { hasText: 'Not quite right?' });
    await refineCard1.locator('textarea').fill('Something more hands-on and less abstract, please.');
    await refineCard1.locator('button:has-text("Generate 2 more options")').click();

    await driver.page.waitForSelector('text=Your options are being generated.', { timeout: 15000 });
    assertTrue(true, 'clicking refine returns the UI to a generating state');
    await driver.screenshot('06-refine-generating');

    await waitForCardCount(driver.page, 6, 240000);
    await driver.screenshot('07-six-cards');

    const sixCards = driver.page.locator('.constellation-card');
    const sixCount = await sixCards.count();
    assertTrue(sixCount === 6, `exactly 6 cards render after one refine round (found ${sixCount})`);

    const namesAfterFirstRefine: string[] = [];
    for (let i = 0; i < sixCount; i++) {
      namesAfterFirstRefine.push((await sixCards.nth(i).locator('.constellation-sig-name').innerText()).trim());
    }
    const allOriginalsPresentAt6 = initialNames.every(n => namesAfterFirstRefine.includes(n));
    assertTrue(
      allOriginalsPresentAt6,
      'all 4 original candidates are still present, unchanged, after refining to 6 (append, not replace)',
    );

    // ── Item 4: refine again → 8 cards ──
    const refineCard2 = driver.page.locator('.card', { hasText: 'Not quite right?' });
    await refineCard2.locator('textarea').fill(
      'Still want something more concrete — fewer strategy words, more of what I’d actually do day to day.',
    );
    await refineCard2.locator('button:has-text("Generate 2 more options")').click();

    await driver.page.waitForSelector('text=Your options are being generated.', { timeout: 15000 });
    await driver.screenshot('08-refine-generating-again');

    await waitForCardCount(driver.page, 8, 240000);
    await driver.screenshot('09-eight-cards');

    const eightCards = driver.page.locator('.constellation-card');
    const eightCount = await eightCards.count();
    assertTrue(eightCount === 8, `exactly 8 cards render after two refine rounds (found ${eightCount})`);

    const namesAfterSecondRefine: string[] = [];
    for (let i = 0; i < eightCount; i++) {
      namesAfterSecondRefine.push((await eightCards.nth(i).locator('.constellation-sig-name').innerText()).trim());
    }
    const allOriginalsPresentAt8 = initialNames.every(n => namesAfterSecondRefine.includes(n));
    assertTrue(
      allOriginalsPresentAt8,
      'all 4 original candidates are still present, unchanged, after refining to 8 (append, not replace)',
    );

    // ── Item 5: at the 8-cap, the refine section is no longer offered ──
    const refineSectionCount = await driver.page.locator('text=Not quite right?').count();
    assertTrue(refineSectionCount === 0, 'at the 8-candidate cap, the free-text refine section is no longer rendered');

    // ── Item 6: select from the 8-card state completes normally ──
    const chosenName2 = (await eightCards.nth(7).locator('.constellation-sig-name').innerText()).trim();
    await eightCards.nth(7).locator('button:has-text("Select This Path")').click();

    const commentsCard2 = driver.page.locator('.card', { hasText: 'ANYTHING ELSE?' });
    await commentsCard2.waitFor({ timeout: 10000 });
    await commentsCard2.locator('button:has-text("Confirm selection")').click();

    await driver.page.waitForSelector('text=Your path is set', { timeout: 15000 });
    await driver.screenshot('10-complete-from-eight');
    const bodyText2 = await driver.page.locator('body').innerText();
    assertTrue(bodyText2.includes(chosenName2), 'terminal summary correctly shows the candidate chosen from the 8-card state');

    const { data: sessionRow2 } = await supabase
      .from('artifacts')
      .select('status, content')
      .eq('user_id', testUser.userId)
      .eq('type', 'path_options_session')
      .maybeSingle();
    const content2 = sessionRow2?.content as { candidates: unknown[]; selected_candidate_id: string | null };
    assertTrue(sessionRow2?.status === 'complete', `path_options_session.status is "complete" after selecting from 8 (got "${sessionRow2?.status}")`);
    assertTrue(
      Array.isArray(content2?.candidates) && content2.candidates.length === 8,
      `DB shows all 8 candidates persisted (got ${content2?.candidates?.length})`,
    );
  });

  section(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch(err => {
  console.error('SCRIPT ERROR:', err);
  process.exitCode = 1;
});
