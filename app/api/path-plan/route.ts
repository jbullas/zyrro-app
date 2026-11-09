import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient, requireEntitledUser } from '@/lib/chat-turn';
import { getPathConversation, PATH_ENTITLEMENT } from '@/lib/path-conversation';
import { ensurePlanGeneration, planView } from '@/lib/path-plan-generation';

// #169, brief 169-plan-page: the Plan for the path chosen in the Path
// conversation, read by /plan. GET returns the state (it resumes a due
// generation that never started, and flips a stranded one to failed; it never
// starts a second one). POST { action: 'retry' } starts a new generation after
// a failed one. The generation runs in after(), so this matches the
// generation budget (GENERATION_BUDGET_MS in lib/generation-budget.ts).
export const maxDuration = 240;

async function state(retry: boolean) {
  const auth = await requireEntitledUser(PATH_ENTITLEMENT);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const supabase = createServiceClient();
  const existing = await getPathConversation(supabase, auth.userId);
  if (!existing) return NextResponse.json({ status: 'no_choice', path: null, plan: null, generated_at: null });
  if (retry) {
    const before = await planView(supabase, existing.conversation.id);
    if (before.status !== 'failed') return NextResponse.json({ error: 'nothing_to_retry' }, { status: 409 });
  }
  await ensurePlanGeneration(supabase, existing.conversation, { retry });
  return NextResponse.json(await planView(supabase, existing.conversation.id));
}

export async function GET() {
  return state(false);
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { action?: unknown };
  if (body.action !== 'retry') return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  return state(true);
}
