/**
 * #134 Slice 1 live verification — Checkpoint 1 "Direction" end to end via
 * the real browser UI, per the 5-item check list:
 *   1. Must-haves: select 3, confirm 4th disabled, deselect one, confirm
 *      re-enabled, submit.
 *   2. Must-avoids: same selection/disable/re-enable check, submit.
 *   3. Ideal-life: free text, submit.
 *   4. "Complete" summary screen shows the saved must-haves/must-avoids/
 *      ideal-life text back correctly.
 *   5. Refresh mid-flow (after must-haves, before must-avoids) resumes at
 *      the correct step rather than restarting.
 *
 * Run: npx tsx --env-file=.env.local scripts/verify-134-slice1.mts
 * Requires the dev server running at http://localhost:3000.
 */
import fs from 'node:fs';
import path from 'node:path';
import { withVerificationSession } from './run-verification.mts';

const SCREENSHOT_DIR = path.join(process.cwd(), '.verification-runs', 'screenshots', '134-slice1');
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

const ENERGISERS = ['Clear scope', 'Fast feedback loops', 'Deep focus time', 'Solving hard problems'];
const FRICTION_POINTS = ['Ambiguous requirements', 'Long review cycles', 'Context switching', 'Micromanagement'];
const IDEAL_LIFE_TEXT = 'Running a small, focused team that ships things people actually use, with real ownership over the outcome.';

function identityReportContent() {
  return {
    cover: {
      prepared_for: 'Slice1 Verify User',
      named_identity: 'THE VERIFIER',
      identity_context: 'QA · Verification',
      report_metadata: 'Discovery Report · Version 1.0 · 2026',
      identity_thesis: 'A synthetic identity used only to verify #134 Slice 1.',
    },
    primary_constellation: [],
    secondary_signature_analysis: [],
    constellation_synthesis: { named_identity: 'THE VERIFIER', synthesis: 'Placeholder synthesis.' },
    how_you_operate: {
      work_style: 'Placeholder.', thinking_style: 'Placeholder.', relationship_style: 'Placeholder.',
      decision_style: 'Placeholder.', stress_pattern: 'Placeholder.',
    },
    energisers: ENERGISERS,
    friction_points: FRICTION_POINTS,
    domain_profile: { Visioning: 40, Thinking: 90, Connecting: 30, Driving: 60, Sensing: 20 },
  };
}

async function main() {
  section('LEG A — full walkthrough: must-haves, must-avoids, ideal-life, complete summary');

  await withVerificationSession(async ({ supabase, testUser, driver, seedArtifact }) => {
    await seedArtifact({ type: 'identity_report', content: identityReportContent() });
    const { error: entError } = await supabase
      .from('entitlements')
      .insert({ user_id: testUser.userId, product: 'onetime_payment', status: 'active', source: 'manual' });
    if (entError) throw new Error(`Failed to grant entitlement: ${entError.message}`);

    await driver.goto('/path');
    await driver.page.waitForSelector('text=MUST HAVES', { timeout: 30000 });
    await driver.screenshot('01-must-haves-initial');

    // ── Item 1: must-haves select-3 / disable-4th / deselect / re-enable ──
    const rows = driver.page.locator('.selectable-row');
    const rowCount = await rows.count();
    assertTrue(rowCount === ENERGISERS.length, `must-haves list shows all ${ENERGISERS.length} energisers (found ${rowCount})`);

    for (let i = 0; i < 3; i++) {
      await rows.nth(i).click();
    }
    const countText1 = await driver.page.locator('.selection-count').innerText();
    assertTrue(countText1.includes('3 of 3'), `selection count reads "3 of 3" after 3 selections (got "${countText1}")`);

    const fourthDisabled = await rows.nth(3).isDisabled();
    assertTrue(fourthDisabled, 'must-haves: 4th (unselected) option is disabled once 3 are selected');
    await driver.screenshot('02-must-haves-3-selected-4th-disabled');

    // Deselect the 1st, confirm the 4th re-enables.
    await rows.nth(0).click();
    const countText2 = await driver.page.locator('.selection-count').innerText();
    assertTrue(countText2.includes('2 of 3'), `selection count reads "2 of 3" after deselecting one (got "${countText2}")`);
    const fourthReenabled = await rows.nth(3).isDisabled();
    assertTrue(!fourthReenabled, 'must-haves: 4th option re-enables after deselecting one of the 3');
    await driver.screenshot('03-must-haves-deselected-4th-reenabled');

    // Re-select the 1st back so we submit with a known, real 3-item set.
    await rows.nth(0).click();
    const countText3 = await driver.page.locator('.selection-count').innerText();
    assertTrue(countText3.includes('3 of 3'), `selection count back to "3 of 3" before submit (got "${countText3}")`);

    const expectedMustHaves = ENERGISERS.slice(0, 3);
    await driver.page.locator('button:has-text("Continue")').click();

    // ── Item 2: must-avoids, same checks ──
    await driver.page.waitForSelector('text=MUST AVOIDS', { timeout: 15000 });
    await driver.screenshot('04-must-avoids-initial');

    const avoidRows = driver.page.locator('.selectable-row');
    const avoidRowCount = await avoidRows.count();
    assertTrue(avoidRowCount === FRICTION_POINTS.length, `must-avoids list shows all ${FRICTION_POINTS.length} friction points (found ${avoidRowCount})`);

    for (let i = 0; i < 3; i++) {
      await avoidRows.nth(i).click();
    }
    const avoidCount1 = await driver.page.locator('.selection-count').innerText();
    assertTrue(avoidCount1.includes('3 of 3'), `must-avoids selection count reads "3 of 3" (got "${avoidCount1}")`);
    const avoidFourthDisabled = await avoidRows.nth(3).isDisabled();
    assertTrue(avoidFourthDisabled, 'must-avoids: 4th (unselected) option is disabled once 3 are selected');
    await driver.screenshot('05-must-avoids-3-selected-4th-disabled');

    await avoidRows.nth(0).click();
    const avoidCount2 = await driver.page.locator('.selection-count').innerText();
    assertTrue(avoidCount2.includes('2 of 3'), `must-avoids selection count reads "2 of 3" after deselect (got "${avoidCount2}")`);
    const avoidFourthReenabled = await avoidRows.nth(3).isDisabled();
    assertTrue(!avoidFourthReenabled, 'must-avoids: 4th option re-enables after deselecting one of the 3');
    await driver.screenshot('06-must-avoids-deselected-4th-reenabled');

    await avoidRows.nth(0).click();
    const expectedMustAvoids = FRICTION_POINTS.slice(0, 3);
    await driver.page.locator('button:has-text("Continue")').click();

    // ── Item 3: ideal-life free text ──
    await driver.page.waitForSelector('text=IDEAL LIFE', { timeout: 15000 });
    await driver.screenshot('07-ideal-life-initial');
    await driver.page.locator('textarea.input-field--textarea').fill(IDEAL_LIFE_TEXT);
    await driver.page.locator('button:has-text("Save and continue")').click();

    // ── Item 4: complete summary shows saved values back correctly ──
    // "CHECKPOINT 1 · DIRECTION" is on every screen in this flow (must-haves/
    // must-avoids/ideal-life/complete alike) — waiting on it alone would
    // resolve instantly against the ideal-life screen still on-screen, before
    // submitIdealLife's request even lands. Wait on text unique to the
    // complete step instead (DIRECTION_SAVED_EXPLANATION in DirectionFlow.tsx).
    await driver.page.waitForSelector('text=Your directions are next', { timeout: 15000 });
    await driver.page.waitForTimeout(500);
    await driver.screenshot('08-complete-summary');
    const bodyText = await driver.page.locator('body').innerText();

    for (const item of expectedMustHaves) {
      assertTrue(bodyText.includes(item), `complete summary shows must-have "${item}"`);
    }
    for (const item of expectedMustAvoids) {
      assertTrue(bodyText.includes(item), `complete summary shows must-avoid "${item}"`);
    }
    assertTrue(bodyText.includes(IDEAL_LIFE_TEXT), 'complete summary shows the ideal-life free text verbatim');

    // Direct DB confirmation, not just DOM — the actual persisted row.
    const { data: sessionRow, error: readErr } = await supabase
      .from('artifacts')
      .select('status, content')
      .eq('user_id', testUser.userId)
      .eq('type', 'path_direction_session')
      .maybeSingle();
    if (readErr) throw new Error(`Failed reading path_direction_session: ${readErr.message}`);
    assertTrue(sessionRow?.status === 'complete', `path_direction_session.status is "complete" in the DB (got "${sessionRow?.status}")`);
    const content = sessionRow?.content as { must_haves: string[]; must_avoids: string[]; ideal_life: string };
    assertTrue(
      JSON.stringify([...content.must_haves].sort()) === JSON.stringify([...expectedMustHaves].sort()),
      `DB must_haves matches what was selected: ${JSON.stringify(content.must_haves)}`,
    );
    assertTrue(
      JSON.stringify([...content.must_avoids].sort()) === JSON.stringify([...expectedMustAvoids].sort()),
      `DB must_avoids matches what was selected: ${JSON.stringify(content.must_avoids)}`,
    );
    assertTrue(content.ideal_life === IDEAL_LIFE_TEXT, `DB ideal_life matches submitted text: "${content.ideal_life}"`);
  });

  section('LEG B — refresh mid-flow (after must-haves, before must-avoids) resumes correctly');

  await withVerificationSession(async ({ supabase, testUser, driver, seedArtifact }) => {
    await seedArtifact({ type: 'identity_report', content: identityReportContent() });
    const { error: entError } = await supabase
      .from('entitlements')
      .insert({ user_id: testUser.userId, product: 'onetime_payment', status: 'active', source: 'manual' });
    if (entError) throw new Error(`Failed to grant entitlement: ${entError.message}`);

    await driver.goto('/path');
    await driver.page.waitForSelector('text=MUST HAVES', { timeout: 30000 });

    const rows = driver.page.locator('.selectable-row');
    for (let i = 0; i < 3; i++) {
      await rows.nth(i).click();
    }
    await driver.page.locator('button:has-text("Continue")').click();
    await driver.page.waitForSelector('text=MUST AVOIDS', { timeout: 15000 });
    await driver.screenshot('09-refresh-before');

    // Reload the browser mid-flow.
    await driver.page.reload();
    await driver.page.waitForSelector('text=MUST AVOIDS', { timeout: 30000 });
    await driver.screenshot('10-refresh-after');

    const bodyTextAfterReload = await driver.page.locator('body').innerText();
    assertTrue(bodyTextAfterReload.includes('MUST AVOIDS'), 'after refresh, page resumes on the MUST AVOIDS step');
    assertTrue(!bodyTextAfterReload.includes('MUST HAVES'), 'after refresh, page does NOT restart at MUST HAVES');

    const avoidRowsAfterReload = driver.page.locator('.selectable-row');
    const avoidCountAfterReload = await avoidRowsAfterReload.count();
    assertTrue(avoidCountAfterReload === FRICTION_POINTS.length, 'after refresh, must-avoids list renders fully (fresh selection state, none pre-checked)');

    // Confirm the DB itself already had must_haves saved and must_avoids
    // still null at the moment of reload — the resumption is reading real
    // persisted state, not just a lucky client-side cache.
    const { data: sessionRow } = await supabase
      .from('artifacts')
      .select('status, content')
      .eq('user_id', testUser.userId)
      .eq('type', 'path_direction_session')
      .maybeSingle();
    const content = sessionRow?.content as { must_haves: string[] | null; must_avoids: string[] | null };
    assertTrue(Array.isArray(content?.must_haves) && content.must_haves.length === 3, 'DB shows must_haves already persisted (3 items) at the point of refresh');
    assertTrue(content?.must_avoids === null, 'DB shows must_avoids still null at the point of refresh (confirms real server-side resumption, not a client fluke)');
  });

  section(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch(err => {
  console.error('SCRIPT ERROR:', err);
  process.exitCode = 1;
});
