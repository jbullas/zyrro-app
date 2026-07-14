/**
 * One-time backfill: apply #33's descending-score sort and #1's
 * domain_profile computation to already-generated identity_report
 * artifacts. Tier B correction per docs/standards/product-decisions.md's
 * Artifact Regeneration & Update Policy — UPDATE in place, no LLM calls.
 *
 * Reuses sortByScoreDescending and computeDomainProfile from
 * lib/generate-identity-report.ts — same logic new generations already use.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/backfill-signature-fixes.mts           (dry-run)
 *   npx tsx --env-file=.env.local scripts/backfill-signature-fixes.mts --apply   (writes)
 */

import { createClient } from '@supabase/supabase-js';
import {
  sortByScoreDescending,
  computeDomainProfile,
} from '@/lib/generate-identity-report';

const APPLY = process.argv.includes('--apply');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Content = any;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Confirms the shape the rest of this script depends on before touching a
// row — anything short of this is reported and skipped, not guessed at.
function hasExpectedShape(content: unknown): content is Content {
  if (!isPlainObject(content)) return false;
  if (!Array.isArray(content.primary_constellation)) return false;
  if (!Array.isArray(content.secondary_signature_analysis)) return false;
  if (!isPlainObject(content.signature_profile_summary)) return false;
  if (!Array.isArray(content.signature_profile_summary.primary_signatures)) return false;
  if (!Array.isArray(content.signature_profile_summary.secondary_signatures)) return false;
  return true;
}

function applyFixes(content: Content): Content {
  const fixed: Content = structuredClone(content);

  sortByScoreDescending(fixed.primary_constellation);
  sortByScoreDescending(fixed.secondary_signature_analysis);
  sortByScoreDescending(fixed.signature_profile_summary.primary_signatures);
  sortByScoreDescending(fixed.signature_profile_summary.secondary_signatures);

  fixed.domain_profile = computeDomainProfile([
    ...fixed.primary_constellation,
    ...fixed.secondary_signature_analysis,
  ]);

  return fixed;
}

// ── 1. Resolve user emails (best-effort, matches scripts/rescue-report.mts) ──
const { data: usersData, error: usersError } = await supabase.auth.admin.listUsers({ perPage: 200 });
if (usersError) console.error('listUsers failed (emails will show as unknown):', usersError);
const emailByUserId = new Map<string, string>();
for (const u of usersData?.users ?? []) {
  if (u.email) emailByUserId.set(u.id, u.email);
}

// ── 2. Load all ready identity_report artifacts ──────────────────────────────
const { data: rows, error: rowsError } = await supabase
  .from('artifacts')
  .select('id, user_id, content')
  .eq('type', 'identity_report')
  .eq('status', 'ready');

if (rowsError) {
  console.error('artifacts fetch failed:', rowsError);
  process.exit(1);
}

console.log(`\n${APPLY ? 'APPLY' : 'DRY-RUN'} — scanning ${rows?.length ?? 0} ready identity_report row(s)\n`);

let unchanged = 0;
let changed = 0;
let skipped = 0;

for (const row of rows ?? []) {
  const email = emailByUserId.get(row.user_id) ?? '(email unresolved)';

  if (!hasExpectedShape(row.content)) {
    skipped++;
    console.log(`SKIP    artifact=${row.id} user=${email} — unexpected content shape, needs manual review`);
    continue;
  }

  const original = row.content as Content;
  const fixed = applyFixes(original);

  const fieldChanges: string[] = [];
  if (JSON.stringify(original.primary_constellation) !== JSON.stringify(fixed.primary_constellation)) {
    fieldChanges.push('primary_constellation');
  }
  if (JSON.stringify(original.secondary_signature_analysis) !== JSON.stringify(fixed.secondary_signature_analysis)) {
    fieldChanges.push('secondary_signature_analysis');
  }
  if (
    JSON.stringify(original.signature_profile_summary.primary_signatures) !==
    JSON.stringify(fixed.signature_profile_summary.primary_signatures)
  ) {
    fieldChanges.push('signature_profile_summary.primary_signatures');
  }
  if (
    JSON.stringify(original.signature_profile_summary.secondary_signatures) !==
    JSON.stringify(fixed.signature_profile_summary.secondary_signatures)
  ) {
    fieldChanges.push('signature_profile_summary.secondary_signatures');
  }
  if (JSON.stringify(original.domain_profile) !== JSON.stringify(fixed.domain_profile)) {
    fieldChanges.push('domain_profile');
  }

  if (fieldChanges.length === 0) {
    unchanged++;
    continue;
  }

  changed++;
  console.log(
    `${APPLY ? 'UPDATE ' : 'WOULD UPDATE'} artifact=${row.id} user=${email} — fields: ${fieldChanges.join(', ')}`,
  );

  if (APPLY) {
    const { error: updateError } = await supabase
      .from('artifacts')
      .update({ content: fixed })
      .eq('id', row.id);

    if (updateError) {
      console.error(`  update failed for ${row.id}:`, updateError);
    }
  }
}

console.log('\n─── Summary ─────────────────────────────────────');
console.log('rows scanned: ', rows?.length ?? 0);
console.log('unchanged:    ', unchanged);
console.log(`${APPLY ? 'updated' : 'would update'}:`.padEnd(14), changed);
console.log('skipped:      ', skipped, skipped > 0 ? '(unexpected shape — see above)' : '');
console.log('─────────────────────────────────────────────────');

if (!APPLY) {
  console.log('\nDry-run only — no writes made. Re-run with --apply to write these changes.');
}
