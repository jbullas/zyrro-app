import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSessionClient } from '@/utils/supabase/server';
import { completeDiscovery } from '@/lib/complete-discovery';
import { QUESTIONS } from '@/lib/identity-questions';
import type { DiscoveryAnswer } from '@/lib/generate-identity-report';

// Keep in sync with GENERATION_BUDGET_MS in lib/generation-status.ts (240 s = 240_000 ms).
export const maxDuration = 240;

/**
 * #20 State 3: a logged-in user with zero discovery_answers submits the
 * questionnaire directly (no signUp()/email-confirmation step — they're
 * already authenticated). user_id is derived from the verified session,
 * never from the request body (same hardening pattern as #31/#36).
 */
export async function POST(req: NextRequest) {
  const sessionClient = await createSessionClient();
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json() as {
    answers?: Array<{ question_number: number; answer_text: string }>;
  };
  const rawAnswers = Array.isArray(body.answers) ? body.answers : [];

  if (rawAnswers.length !== QUESTIONS.length) {
    return NextResponse.json({ error: `Expected ${QUESTIONS.length} answers` }, { status: 400 });
  }

  const answers: DiscoveryAnswer[] = rawAnswers.map(a => ({
    question_number: a.question_number,
    question_text: QUESTIONS.find(q => q.number === a.question_number)?.question ?? '',
    answer_text: a.answer_text,
  }));

  const name = (user.user_metadata?.display_name ?? '') as string;

  // completeDiscovery's own idempotency check (live artifact already exists)
  // covers double-click / back-button-resubmit / retry-after-success here.
  const started = await completeDiscovery(user.id, answers, name);
  return NextResponse.json({ started });
}
