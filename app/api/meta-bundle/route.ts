import { NextResponse } from 'next/server';
import { createClient as createSessionClient } from '@/utils/supabase/server';
import { resolveMetaBundle } from '@/lib/meta-bundle';

export async function GET() {
  const sessionClient = await createSessionClient();
  const { data: { user } } = await sessionClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const bundle = await resolveMetaBundle(user.id);

  return NextResponse.json({ bundle });
}
