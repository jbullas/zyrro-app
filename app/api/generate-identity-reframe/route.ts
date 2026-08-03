import { NextRequest, NextResponse, after } from 'next/server';

// Keep in sync with GENERATION_BUDGET_MS in lib/generation-status.ts (240 s = 240_000 ms).
export const maxDuration = 240;
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';
import { createClient as createSessionClient } from '@/utils/supabase/server';
import { getChatCompletion } from '@/lib/llm';
import { IDENTITY_REFRAME_PROMPT } from '@/lib/prompts/identity-reframe';
import type { IdentityReframeArtifactContent } from '@/lib/artifact-schemas';
import { getCurrentArtifact } from '@/lib/artifacts';

function createServiceClient() {
  return createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function validateIdentityReframe(data: unknown): data is IdentityReframeArtifactContent {
  const d = data as IdentityReframeArtifactContent;
  return !!(d?.recap && d.meaning && d.reframe && d.why);
}

async function runIdentityReframeGeneration(artifactId: string, identityReport: unknown) {
  const supabase = createServiceClient();

  try {
    const content = await getChatCompletion({
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: IDENTITY_REFRAME_PROMPT },
        { role: 'user', content: JSON.stringify(identityReport) },
      ],
      max_tokens: 3000,
      temperature: 0,
    });

    const reframe = JSON.parse(content ?? '{}');

    if (!validateIdentityReframe(reframe)) {
      throw new Error('Identity reframe failed validation');
    }

    await supabase
      .from('artifacts')
      .update({ status: 'ready', content: reframe })
      .eq('id', artifactId);

  } catch (error) {
    console.error('Identity reframe generation failed:', error);
    await supabase
      .from('artifacts')
      .update({ status: 'failed' })
      .eq('id', artifactId);
  }
}

export async function POST(_req: NextRequest) {
  const sessionClient = await createSessionClient();
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();

  const { data: identityArtifact } = await getCurrentArtifact<{ content: unknown }>(
    supabase,
    user.id,
    'identity_report',
    { status: 'ready', select: 'content' },
  );

  if (!identityArtifact) {
    return NextResponse.json({ error: 'Identity report not found' }, { status: 404 });
  }

  // Idempotency: same guard shape as completeDiscovery — if a live
  // (generating/ready) identity_reframe artifact already exists for this
  // user, return its id without re-inserting.
  const { data: existing } = await supabase
    .from('artifacts')
    .select('id')
    .eq('user_id', user.id)
    .eq('type', 'identity_reframe')
    .in('status', ['generating', 'ready'])
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ artifact_id: existing.id });
  }

  // A prior failed attempt has no informational content — delete it (same
  // cleanup path_options already does) rather than let it accumulate.
  await supabase
    .from('artifacts')
    .delete()
    .eq('user_id', user.id)
    .eq('type', 'identity_reframe')
    .eq('status', 'failed');

  const { data: newArtifact, error } = await supabase
    .from('artifacts')
    .insert({
      user_id: user.id,
      type: 'identity_reframe',
      access_level: 'free',
      status: 'generating',
      content: {},
    })
    .select('id')
    .single();

  let artifactId: string;

  if (error?.code === '23505') {
    // Lost the partial-unique-index race against a concurrent call for this
    // user — someone else's generation already started. Reuse that row's id
    // rather than erroring.
    const { data: current } = await getCurrentArtifact<{ id: string }>(
      supabase,
      user.id,
      'identity_reframe',
      { select: 'id' },
    );
    if (!current) {
      console.error('Identity reframe insert lost the generating-row race but no current row was found:', error);
      return NextResponse.json({ error: 'Failed to create artifact' }, { status: 500 });
    }
    artifactId = current.id;
  } else if (error || !newArtifact) {
    console.error('Identity reframe artifact insert error:', error);
    return NextResponse.json({ error: 'Failed to create artifact' }, { status: 500 });
  } else {
    artifactId = newArtifact.id;
  }

  after(() => runIdentityReframeGeneration(artifactId, identityArtifact.content));

  return NextResponse.json({ artifact_id: artifactId });
}
