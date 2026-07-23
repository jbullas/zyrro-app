import { after } from 'next/server';
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';
import { generateIdentityReport, DiscoveryAnswer } from '@/lib/generate-identity-report';

function createServiceClient() {
  return createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Shared core of "a user has just supplied their 13 discovery answers":
 * insert discovery_answers (idempotent — skipped if already present), clear
 * any prior failed identity_report attempt (noise, not history — same call
 * made in #59), append a fresh identity_report row, and fire generation in
 * the background. identity_report is append-only (#59), so this insert is a
 * plain append regardless of what other rows already exist for the user.
 *
 * Called from both kickoffIdentityGeneration (answers sourced from signup
 * user_metadata) and POST /api/complete-discovery (#20 State 3 — answers
 * already in hand from an authenticated session).
 *
 * Returns true if generation was started, false if a live artifact already
 * exists (idempotency guard — covers double-click, back-button resubmission,
 * and retry-after-slow-but-successful-response for both callers) or if the
 * insert didn't happen (e.g. lost the #59 unique-index race against a
 * concurrent call for the same user).
 */
export async function completeDiscovery(
  userId: string,
  answers: DiscoveryAnswer[],
  name: string,
): Promise<boolean> {
  const admin = createServiceClient();

  // If a live artifact exists, nothing to do — this is the sole idempotency
  // guard now; kickoffIdentityGeneration used to do its own copy of this
  // check before delegating here, which meant two separate reads could
  // disagree on a fast-enough race. One check, one source of truth.
  const { data: existing } = await admin
    .from('artifacts')
    .select('id')
    .eq('user_id', userId)
    .eq('type', 'identity_report')
    .in('status', ['generating', 'ready'])
    .maybeSingle();

  if (existing) return false;

  // Only insert discovery_answers once; skip if already present (retry-safe)
  const { count } = await admin
    .from('discovery_answers')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);

  if ((count ?? 0) === 0 && answers.length > 0) {
    await admin
      .from('discovery_answers')
      .insert(answers.map(a => ({ ...a, user_id: userId })));
  }

  await admin
    .from('artifacts')
    .delete()
    .eq('user_id', userId)
    .eq('type', 'identity_report')
    .eq('status', 'failed');

  const { data: artifact, error: insertError } = await admin
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

  if (insertError || !artifact) return false;

  const artifactId = artifact.id;
  after(() => generateIdentityReport({ artifactId, answers, name }));
  return true;
}
