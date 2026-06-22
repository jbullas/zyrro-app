import { NextRequest, NextResponse, after } from 'next/server';

export const maxDuration = 60;
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';
import { generateIdentityReport, DiscoveryAnswer } from '@/lib/generate-identity-report';

function createServiceClient() {
  return createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

console.log('[generate-report] SUPABASE_SERVICE_ROLE_KEY length:', process.env.SUPABASE_SERVICE_ROLE_KEY?.length ?? 0);
console.log('[generate-report] OPENAI_API_KEY length:', process.env.OPENAI_API_KEY?.length ?? 0);
console.log('[generate-report] OPENAI_API_KEY prefix:', process.env.OPENAI_API_KEY?.slice(0, 5) ?? 'undefined');

export async function POST(req: NextRequest) {
  const body = await req.json() as { user_id: string; name: string; answers: DiscoveryAnswer[] };
  const { user_id, name, answers } = body;

  if (!user_id || !name || !Array.isArray(answers)) {
    return NextResponse.json({ error: 'Missing user_id, name, or answers' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Insert profile row
  await supabase
    .from('profiles')
    .upsert({ user_id, name }, { onConflict: 'user_id' });

  // Insert discovery answers
  await supabase
    .from('discovery_answers')
    .insert(answers.map(a => ({ ...a, user_id })));

  const { data: artifact, error: insertError } = await supabase
    .from('artifacts')
    .insert({
      user_id,
      type: 'identity_report',
      access_level: 'free',
      status: 'generating',
      content: {},
    })
    .select('id')
    .single();

  if (insertError || !artifact) {
    console.error('Artifact insert error:', insertError);
    return NextResponse.json({ error: 'Failed to create artifact' }, { status: 500 });
  }

  const artifactId = artifact.id;

  after(() => generateIdentityReport({ artifactId, answers, name }));

  return NextResponse.json({ artifact_id: artifactId });
}
