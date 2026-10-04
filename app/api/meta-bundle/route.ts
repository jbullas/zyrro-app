import { NextResponse } from 'next/server';
import { createClient as createSessionClient } from '@/utils/supabase/server';
import { resolveMetaBundle } from '@/lib/meta-bundle';
import { withPipelineDeadline } from '@/lib/llm';

// #155: resolveMetaBundle can make one bundle call per unbundled conversation
// plus the meta call, so the whole request shares one LLM deadline inside
// this maxDuration.
export const maxDuration = 120;
const META_BUNDLE_DEADLINE_MS = 110_000;

export async function GET() {
  const sessionClient = await createSessionClient();
  const { data: { user } } = await sessionClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const bundle = await withPipelineDeadline(() => resolveMetaBundle(user.id), META_BUNDLE_DEADLINE_MS);

  return NextResponse.json({ bundle });
}
