import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { kickoffIdentityGeneration } from '@/lib/kickoff-identity-generation';

export const maxDuration = 60;

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

    await kickoffIdentityGeneration(user);
  }

  return NextResponse.redirect(new URL('/identity', req.url));
}
