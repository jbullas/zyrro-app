import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { kickoffIdentityGeneration } from '@/lib/kickoff-identity-generation';

export const maxDuration = 180;

export async function POST(_req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const started = await kickoffIdentityGeneration(user);
  return NextResponse.json({ started });
}
