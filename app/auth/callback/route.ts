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

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');

  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.redirect(new URL('/login', req.url));
    }

    const admin = createServiceClient();

    // Idempotency: skip generation if a working report already exists.
    // A failed artifact does not block regeneration — the link click is the natural retry path.
    const { data: existing } = await admin
      .from('artifacts')
      .select('id')
      .eq('user_id', user.id)
      .eq('type', 'identity_report')
      .in('status', ['generating', 'ready'])
      .maybeSingle();

    if (!existing) {
      const rawAnswers = (user.user_metadata?.discovery_answers ?? []) as Array<{
        question_number: number;
        answer_text: string;
      }>;
      const name = (user.user_metadata?.display_name ?? '') as string;

      // Reconstruct full DiscoveryAnswer shape; question_text lives server-side in QUESTIONS
      const answers: DiscoveryAnswer[] = rawAnswers.map(a => ({
        question_number: a.question_number,
        question_text: QUESTIONS.find(q => q.number === a.question_number)?.question ?? '',
        answer_text: a.answer_text,
      }));

      // Upsert profile
      await admin
        .from('profiles')
        .upsert({ user_id: user.id, name }, { onConflict: 'user_id' });

      // Insert discovery answers only if not already present (guards against retry duplicates)
      const { count } = await admin
        .from('discovery_answers')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id);

      if ((count ?? 0) === 0 && answers.length > 0) {
        await admin
          .from('discovery_answers')
          .insert(answers.map(a => ({ ...a, user_id: user.id })));
      }

      // Remove any failed artifact so the insert below is clean
      await admin
        .from('artifacts')
        .delete()
        .eq('user_id', user.id)
        .eq('type', 'identity_report')
        .eq('status', 'failed');

      // Create artifact synchronously so /identity never races to an empty state
      const { data: artifact } = await admin
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

      if (artifact) {
        const artifactId = artifact.id;
        after(() => generateIdentityReport({ artifactId, answers, name }));
      }
    }
  }

  return NextResponse.redirect(new URL('/identity', req.url));
}
