import { NextRequest, NextResponse } from 'next/server';
import { type EmailOtpType } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { kickoffIdentityGeneration } from '@/lib/kickoff-identity-generation';

export const maxDuration = 180;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const code = searchParams.get('code');

  // Build the success response first so the cookie adapter can write onto it.
  const response = NextResponse.redirect(new URL('/identity', req.url));

  if ((token_hash && type) || code) {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return req.cookies.getAll(); },
          setAll(cookiesToSet) {
            console.log('[callback] setAll fired, names:', cookiesToSet.map(c => c.name));
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options));
          },
        },
      }
    );

    if (token_hash && type) {
      const { data, error } = await supabase.auth.verifyOtp({ type, token_hash });
      console.log('[callback] verifyOtp error:', error?.message ?? null, '| session present:', !!data?.session);
      if (error) {
        return NextResponse.redirect(new URL('/login', req.url));
      }
    } else {
      const { error } = await supabase.auth.exchangeCodeForSession(code!);
      if (error) {
        return NextResponse.redirect(new URL('/login', req.url));
      }
    }

    const { data: { user } } = await supabase.auth.getUser();
    console.log('[callback] getUser user present:', !!user);
    if (!user) {
      return NextResponse.redirect(new URL('/login', req.url));
    }

    await kickoffIdentityGeneration(user);
  }

  return response;
}
