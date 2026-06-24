import { after } from 'next/server';
import { createClient as createSupabaseAdmin, type User } from '@supabase/supabase-js';
import { generateIdentityReport, DiscoveryAnswer } from '@/lib/generate-identity-report';
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
 * Race safety: the partial unique index on identity_report artifacts causes a
 * duplicate insert to error; we swallow that error so concurrent calls are harmless.
 */
export async function kickoffIdentityGeneration(user: User): Promise<boolean> {
  const admin = createServiceClient();

  // If a live artifact exists, nothing to do — covers double-click and quick retries
  const { data: existing } = await admin
    .from('artifacts')
    .select('id')
    .eq('user_id', user.id)
    .eq('type', 'identity_report')
    .in('status', ['generating', 'ready'])
    .maybeSingle();

  if (existing) return false;

  const rawAnswers = (user.user_metadata?.discovery_answers ?? []) as Array<{
    question_number: number;
    answer_text: string;
  }>;
  const name = (user.user_metadata?.display_name ?? '') as string;

  const answers: DiscoveryAnswer[] = rawAnswers.map(a => ({
    question_number: a.question_number,
    question_text: QUESTIONS.find(q => q.number === a.question_number)?.question ?? '',
    answer_text: a.answer_text,
  }));

  await admin
    .from('profiles')
    .upsert({ user_id: user.id, name }, { onConflict: 'user_id' });

  // Only insert discovery_answers once; skip if already present (retry-safe)
  const { count } = await admin
    .from('discovery_answers')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id);

  if ((count ?? 0) === 0 && answers.length > 0) {
    await admin
      .from('discovery_answers')
      .insert(answers.map(a => ({ ...a, user_id: user.id })));
  }

  // Consistent strategy: delete failed artifact, then insert fresh.
  // A concurrent call that wins the insert race will be the sole generation run;
  // the losing call's insert errors out (unique index) and we return false.
  await admin
    .from('artifacts')
    .delete()
    .eq('user_id', user.id)
    .eq('type', 'identity_report')
    .eq('status', 'failed');

  const { data: artifact, error: insertError } = await admin
    .from('artifacts')
    .insert({
      user_id: user.id,
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
