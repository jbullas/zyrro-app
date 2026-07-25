import { createClient as createSupabaseAdmin, type User } from '@supabase/supabase-js';
import { DiscoveryAnswer } from '@/lib/generate-identity-report';
import { completeDiscovery } from '@/lib/complete-discovery';
import { QUESTIONS } from '@/lib/identity-questions';

function createServiceClient() {
  return createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Idempotent generation kickoff. Returns true if generation was started,
 * false if a live artifact (generating/ready) already exists.
 *
 * Race safety: the partial unique index on identity_report artifacts (scoped to
 * status = 'generating', #59) causes a second concurrent insert to error; we
 * swallow that error so concurrent calls are harmless.
 */
function toDiscoveryAnswers(
  rows: Array<{ question_number: number; answer_text: string }>
): DiscoveryAnswer[] {
  return rows.map(r => ({
    question_number: r.question_number,
    question_text: QUESTIONS.find(q => q.number === r.question_number)?.question ?? '',
    answer_text: r.answer_text,
  }));
}

export async function kickoffIdentityGeneration(user: User): Promise<boolean> {
  const admin = createServiceClient();

  const rawAnswers = (user.user_metadata?.discovery_answers ?? []) as Array<{
    question_number: number;
    answer_text: string;
  }>;
  const name = (user.user_metadata?.display_name ?? '') as string;

  // #20: a State-3 user's very first /auth/callback hit (and every one after
  // it, since they never signed up with answers in metadata) has nothing here
  // to generate from. Without this guard, this would create a garbage
  // generating/ready identity_report row on empty input, and that row would
  // then block the *real* generation once the user actually completes the
  // questionnaire later via completeDiscovery() (POST /api/complete-discovery)
  // — completeDiscovery's own idempotency check has no way to tell
  // "legitimate" from "garbage," so the fix has to be not creating the
  // garbage row at all.
  if (rawAnswers.length === 0) {
    await admin
      .from('profiles')
      .upsert({ user_id: user.id, name }, { onConflict: 'user_id' });

    // #72: a State-3 user (POST /api/complete-discovery) never has metadata
    // answers — they authenticated first, then answered — but does have real
    // discovery_answers DB rows. Check before giving up, so /identity's "Try
    // again" can recover a failed generation from those rows instead of
    // silently no-op'ing forever. A genuine State-1/2 user (or a fresh
    // signup, whose first /auth/callback also lands here) has zero rows too,
    // so this falls through to the unchanged `return false`.
    const { data: dbRows } = await admin
      .from('discovery_answers')
      .select('question_number, answer_text')
      .eq('user_id', user.id)
      .order('question_number');

    if (!dbRows || dbRows.length === 0) return false;

    return completeDiscovery(user.id, toDiscoveryAnswers(dbRows), name);
  }

  await admin
    .from('profiles')
    .upsert({ user_id: user.id, name }, { onConflict: 'user_id' });

  return completeDiscovery(user.id, toDiscoveryAnswers(rawAnswers), name);
}
