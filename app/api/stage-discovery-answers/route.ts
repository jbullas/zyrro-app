import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';
import { QUESTIONS } from '@/lib/identity-questions';

function createServiceClient() {
  return createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * #106: stages discovery answers under an opaque token before signUp() —
 * intentionally reachable pre-signup (no session exists yet), so shape is
 * validated server-side rather than trusted from the client.
 */
export async function POST(req: NextRequest) {
  const body = await req.json() as {
    answers?: Array<{ question_number: number; answer_text: string }>;
  };
  const answers = Array.isArray(body.answers) ? body.answers : [];

  const valid = answers.length === QUESTIONS.length && answers.every(
    a => typeof a?.question_number === 'number'
      && a.question_number >= 1 && a.question_number <= QUESTIONS.length
      && typeof a?.answer_text === 'string'
  );

  if (!valid) {
    return NextResponse.json({ error: `Expected ${QUESTIONS.length} valid answers` }, { status: 400 });
  }

  const admin = createServiceClient();
  const { data, error } = await admin
    .from('pending_discovery_answers')
    .insert({ answers })
    .select('id')
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Failed to stage answers' }, { status: 500 });
  }

  return NextResponse.json({ id: data.id });
}
