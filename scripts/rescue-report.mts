/**
 * Rescue a stuck identity_report artifact for any user by email.
 * Reads existing discovery_answers — never re-inserts them.
 * Only regenerates when status is 'generating' or 'failed'.
 *
 * With --new-version, a user whose current report is already 'ready' gets a
 * NEW identity_report row instead (identity_report is append-only, #59) —
 * the existing row is never touched. If that generation fails, the new row is
 * deleted by its exact id: /identity shows the latest row regardless of
 * status, so a leftover failed row would shadow the good version.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/rescue-report.mts <email> [--info] [--new-version]
 *
 *   --info          Look up and print user data; write nothing.
 *   --new-version   If the current report is ready, generate a new version.
 */

import { createClient } from '@supabase/supabase-js';
import { generateIdentityReport } from '@/lib/generate-identity-report';
import { getCurrentArtifact } from '@/lib/artifacts';

// ── Args ──────────────────────────────────────────────────────────────────────
const email = process.argv[2];
const INFO_ONLY = process.argv.includes('--info');
const NEW_VERSION = process.argv.includes('--new-version');

if (!email) {
  console.error('Usage: npx tsx --env-file=.env.local scripts/rescue-report.mts <email> [--info] [--new-version]');
  process.exit(1);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ── 1. Find user ──────────────────────────────────────────────────────────────
console.log(`Looking up ${email}…`);
const { data: listData, error: listError } = await supabase.auth.admin.listUsers({ perPage: 200 });
if (listError) { console.error('listUsers failed:', listError); process.exit(1); }

const user = listData?.users?.find(u => u.email === email);
if (!user) { console.error(`No auth user found for ${email}`); process.exit(1); }
const userId = user.id;

// ── 2. Profile name ───────────────────────────────────────────────────────────
const { data: profile } = await supabase
  .from('profiles')
  .select('name')
  .eq('user_id', userId)
  .maybeSingle();
const name: string = profile?.name ?? email.split('@')[0];

// ── 3. Discovery answers ──────────────────────────────────────────────────────
const { data: answers, error: answersError } = await supabase
  .from('discovery_answers')
  .select('question_number, question_text, answer_text')
  .eq('user_id', userId)
  .order('question_number');
if (answersError) { console.error('answers fetch failed:', answersError); process.exit(1); }

// ── 4. Existing artifact ──────────────────────────────────────────────────────
const { data: artifact, error: artifactError } = await getCurrentArtifact<{ id: string; status: string }>(
  supabase,
  userId,
  'identity_report',
  { select: 'id, status' },
);
if (artifactError) { console.error('artifact fetch failed:', artifactError); process.exit(1); }

// ── Info dump ─────────────────────────────────────────────────────────────────
console.log('\n─── Found ───────────────────────────────────────');
console.log('user_id:         ', userId);
console.log('name:            ', name);
console.log('answers:         ', answers?.length ?? 0, '/ 13');
console.log('artifact id:     ', artifact?.id ?? 'NONE');
console.log('artifact status: ', artifact?.status ?? 'NONE');
console.log('─────────────────────────────────────────────────\n');

if (INFO_ONLY) {
  console.log('(--info: nothing written)');
  process.exit(0);
}

// ── Guards ────────────────────────────────────────────────────────────────────
const isNewVersion = NEW_VERSION && artifact?.status === 'ready';

if (artifact?.status === 'ready' && !isNewVersion) {
  console.log('Artifact is already ready — nothing to rescue. Stopping. (Pass --new-version to generate a new version.)');
  process.exit(0);
}

if (!artifact) {
  console.error('No identity_report artifact found — nothing to update. Stopping.');
  process.exit(1);
}

if (!answers?.length || answers.length < 13) {
  console.error(`Incomplete answer set (${answers?.length ?? 0}/13) — stopping to avoid a low-quality report.`);
  process.exit(1);
}

if (!isNewVersion && artifact.status !== 'generating' && artifact.status !== 'failed') {
  console.error(`Unexpected artifact status '${artifact.status}' — stopping. Check manually.`);
  process.exit(1);
}

// ── New version: append a fresh row, never touch the existing one ────────────
let targetId = artifact.id;
if (isNewVersion) {
  const { data: inserted, error: insertError } = await supabase
    .from('artifacts')
    .insert({
      user_id: userId,
      type: 'identity_report',
      access_level: 'free',
      status: 'generating',
      content: {},
    })
    .select('id')
    .single();
  if (insertError || !inserted) { console.error('new-version insert failed:', insertError); process.exit(1); }
  targetId = inserted.id;
  console.log(`New version row inserted: ${targetId} (previous ready row ${artifact.id} left untouched)`);
}

// ── Generate via shared module (same code path as the app) ───────────────────
console.log('Generating via lib/generate-identity-report…');
const startedAt = Date.now();
await generateIdentityReport({ artifactId: targetId, answers, name });
const elapsedMs = Date.now() - startedAt;

// ── Verify ────────────────────────────────────────────────────────────────────
const { data: verify } = await supabase
  .from('artifacts')
  .select('id, status, content')
  .eq('id', targetId)
  .single();

if (verify?.status === 'ready') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const namedIdentity = (verify.content as any)?.cover?.named_identity ?? '?';
  console.log('\n─── Done ────────────────────────────────────────');
  console.log('artifact id:   ', verify.id);
  console.log('status:        ', verify.status);
  console.log('named_identity:', namedIdentity);
  console.log('elapsed:       ', `${Math.round(elapsedMs / 1000)}s`);
  console.log('─────────────────────────────────────────────────');
} else {
  console.error('\nGeneration failed — artifact status:', verify?.status ?? 'unknown');
  if (isNewVersion) {
    const { error: deleteError } = await supabase.from('artifacts').delete().eq('id', targetId);
    if (deleteError) console.error(`Failed to delete new-version row ${targetId}:`, deleteError);
    else console.error(`Deleted failed new-version row ${targetId}; previous row ${artifact.id} remains current.`);
  }
  process.exit(1);
}
