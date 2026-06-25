import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { kickoffIdentityGeneration } from '@/lib/kickoff-identity-generation';

// Keep in sync with GENERATION_BUDGET_MS in lib/generation-status.ts (240 s = 240_000 ms).
export const maxDuration = 240;

export async function POST(_req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const started = await kickoffIdentityGeneration(user);
  return NextResponse.json({ started });
}
