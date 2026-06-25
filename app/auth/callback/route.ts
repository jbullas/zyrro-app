import { NextRequest, NextResponse } from 'next/server';
import { type EmailOtpType } from '@supabase/supabase-js';
import { createClient } from '@/utils/supabase/server';
import { kickoffIdentityGeneration } from '@/lib/kickoff-identity-generation';

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const code = searchParams.get('code');

  if ((token_hash && type) || code) {
    const supabase = await createClient();

    if (token_hash && type) {
      const { error } = await supabase.auth.verifyOtp({ type, token_hash });
      if (error) {
        return NextResponse.redirect(new URL('/login', req.url));
      }
    } else {
      await supabase.auth.exchangeCodeForSession(code!);
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.redirect(new URL('/login', req.url));
    }

    await kickoffIdentityGeneration(user);
  }

  return NextResponse.redirect(new URL('/identity', req.url));
}
