/**
 * Entry point for live verification passes (ticket #49). Bootstraps a
 * synthetic test user, opens an authenticated Playwright driver, hands both
 * to a callback, and tears the user down afterward — even if the callback
 * throws. See docs/briefs/49-run-project-skill.md and AGENTS.md for when to
 * reach for this.
 *
 * Typical usage — import into an ad hoc verification script for the session:
 *
 *   import { withVerificationSession } from '@/scripts/run-verification.mts';
 *
 *   await withVerificationSession(async ({ testUser, driver, seedArtifact }) => {
 *     await seedArtifact({ type: 'identity_report', content: { ... } });
 *     await driver.goto('/identity');
 *     const color = await driver.computedStyle('.cover-title', 'color');
 *     await driver.screenshot('identity-cover');
 *   });
 *
 * Run directly as a self-test (requires the dev server running):
 *   npx tsx --env-file=.env.local scripts/run-verification.mts --selftest
 *   npx tsx --env-file=.env.local scripts/run-verification.mts --selftest-fail
 *     (forces a throw mid-run to prove teardown still executes)
 */

import { fileURLToPath } from 'node:url';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createAdminClient,
  bootstrapTestUser,
  seedArtifact as seedArtifactRaw,
  seedConversation as seedConversationRaw,
  seedDiscoveryAnswers as seedDiscoveryAnswersRaw,
  teardownTestUser,
  type TestUser,
} from './verification/session.mts';
import { openDriver, type VerificationDriver } from './verification/driver.mts';

export interface VerificationContext {
  supabase: SupabaseClient;
  testUser: TestUser;
  driver: VerificationDriver;
  seedArtifact: (params: Parameters<typeof seedArtifactRaw>[2]) => ReturnType<typeof seedArtifactRaw>;
  seedConversation: (params?: Parameters<typeof seedConversationRaw>[2]) => ReturnType<typeof seedConversationRaw>;
  seedDiscoveryAnswers: (answers: Parameters<typeof seedDiscoveryAnswersRaw>[2]) => ReturnType<typeof seedDiscoveryAnswersRaw>;
}

export interface VerificationSessionOptions {
  baseUrl?: string;
  email?: string;
  headless?: boolean;
  metadata?: Record<string, unknown>;
}

/**
 * Bootstraps a test user + driver, runs `fn`, and always tears down — the
 * teardown call sits in `finally` so a throwing `fn` still leaves no
 * orphaned test user or rows behind.
 */
export async function withVerificationSession<T>(
  fn: (ctx: VerificationContext) => Promise<T>,
  opts: VerificationSessionOptions = {}
): Promise<T> {
  const supabase = createAdminClient();
  const testUser = await bootstrapTestUser(supabase, opts);
  const driver = await openDriver(testUser.storageStatePath, { headless: opts.headless });

  try {
    return await fn({
      supabase,
      testUser,
      driver,
      seedArtifact: (params) => seedArtifactRaw(supabase, testUser.userId, params),
      seedConversation: (params) => seedConversationRaw(supabase, testUser.userId, params),
      seedDiscoveryAnswers: (answers) => seedDiscoveryAnswersRaw(supabase, testUser.userId, answers),
    });
  } finally {
    await driver.close();
    await teardownTestUser(supabase, testUser);
  }
}

// ── Minimal content satisfying the fields app/identity/page.tsx renders ──────
// Not a spec-complete IdentitySignatureReportArtifactContent (see
// lib/artifact-schemas.ts for the full shape with exact array cardinalities)
// — just enough for a self-test smoke check to render without crashing.
function selftestIdentityReportContent() {
  return {
    cover: {
      prepared_for: 'Selftest User',
      named_identity: 'THE SELFTEST RUNNER',
      identity_context: 'QA · Tooling · Verification',
      report_metadata: 'Discovery Report · Version 1.0 · 2026',
      identity_thesis: 'A synthetic identity used only to smoke-test the verification pipeline.',
    },
    primary_constellation: [
      {
        signature_number: '01', name: 'Pattern Seeker', domain: 'Thinking', score: 20,
        core_statement: 'Finds structure others miss.',
        evidence_analysis: 'Selftest placeholder evidence analysis.',
        tension: 'Selftest placeholder tension.',
      },
    ],
    secondary_signature_analysis: [
      {
        signature_number: '06', name: 'Builder', domain: 'Driving', score: 12,
        core_statement: 'Turns ideas into shipped things.',
        analysis: 'Selftest placeholder analysis.',
      },
    ],
    constellation_synthesis: {
      named_identity: 'THE SELFTEST RUNNER',
      synthesis: 'Selftest placeholder synthesis text.',
    },
    how_you_operate: {
      work_style: 'Selftest placeholder.',
      thinking_style: 'Selftest placeholder.',
      relationship_style: 'Selftest placeholder.',
      decision_style: 'Selftest placeholder.',
      stress_pattern: 'Selftest placeholder.',
    },
    energisers: ['Clear scope', 'Fast feedback loops'],
    friction_points: ['Ambiguous requirements', 'Long review cycles'],
    domain_profile: { Visioning: 40, Thinking: 90, Connecting: 30, Driving: 60, Sensing: 20 },
  };
}

async function selftest(forceFailure: boolean) {
  console.log(`Running selftest (forceFailure=${forceFailure})…`);

  try {
    await withVerificationSession(async ({ testUser, seedArtifact, seedDiscoveryAnswers, driver }) => {
      console.log('Bootstrapped test user:', testUser.email);

      // app/identity/page.tsx gates on having at least one discovery_answers
      // row before it will look at the artifact at all.
      await seedDiscoveryAnswers([
        { question_number: 1, question_text: 'Selftest question', answer_text: 'Selftest answer' },
      ]);
      console.log('Seeded discovery_answers row.');

      await seedArtifact({ type: 'identity_report', content: selftestIdentityReportContent() });
      console.log('Seeded identity_report artifact.');

      if (forceFailure) {
        throw new Error('selftest: forced failure to prove teardown runs on throw');
      }

      await driver.goto('/identity');
      await driver.page.waitForSelector('.report-cover', { timeout: 15000 });
      const screenshotPath = await driver.screenshot('selftest-identity');
      console.log('Screenshot saved:', screenshotPath);

      const color = await driver.computedStyle('.report-cover h1', 'color');
      console.log('Cover heading color:', color);
    });

    console.log('\nSelftest PASSED — teardown completed cleanly.');
  } catch (err) {
    const message = (err as Error).message ?? String(err);
    const isExpectedForcedFailure = forceFailure && message.includes('forced failure to prove teardown runs on throw');

    if (isExpectedForcedFailure) {
      console.log('\nSelftest PASSED — forced failure propagated as expected, and teardown still ran:');
      console.log('  ', message);
    } else {
      console.error('\nSelftest FAILED', forceFailure ? '(not the expected forced failure)' : '', ':', err);
      process.exitCode = 1;
    }
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const forceFailure = process.argv.includes('--selftest-fail');
  if (forceFailure || process.argv.includes('--selftest')) {
    await selftest(forceFailure);
  } else {
    console.log('Usage: npx tsx --env-file=.env.local scripts/run-verification.mts [--selftest|--selftest-fail]');
  }
}
