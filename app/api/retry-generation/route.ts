import { NextRequest, NextResponse, after } from 'next/server';
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';
import { createClient } from '@/utils/supabase/server';
import { generateIdentityReport, DiscoveryAnswer } from '@/lib/generate-identity-report';
import { QUESTIONS } from '@/lib/identity-questions';

export const maxDuration = 60;

function createServiceClient() {
  return createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(_req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createServiceClient();

  const { data: artifact } = await admin
    .from('artifacts')
    .select('id')
    .eq('user_id', user.id)
    .eq('type', 'identity_report')
    .eq('status', 'failed')
    .maybeSingle();

  if (!artifact) {
    return NextResponse.json({ error: 'No failed artifact found' }, { status: 404 });
  }

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
    .from('artifacts')
    .update({ status: 'generating' })
    .eq('id', artifact.id);

  const artifactId = artifact.id;
  after(() => generateIdentityReport({ artifactId, answers, name }));

  return NextResponse.json({ artifact_id: artifactId });
}
