import { NextRequest, NextResponse, after } from 'next/server';

// Keep in sync with GENERATION_BUDGET_MS in lib/generation-status.ts (240 s = 240_000 ms).
export const maxDuration = 240;
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';
import { createClient as createSessionClient } from '@/utils/supabase/server';
import { hasPaidEntitlement } from '@/lib/entitlements';
import { getChatCompletion } from '@/lib/llm';
import { PATH_OPTIONS_PROMPT } from '@/lib/prompts/path-options';
import type { PathOptionsArtifactContent } from '@/lib/artifact-schemas';
import { getCurrentArtifact } from '@/lib/artifacts';

function createServiceClient() {
  return createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function validatePathOptions(data: unknown): data is PathOptionsArtifactContent {
  const d = data as PathOptionsArtifactContent;
  if (!Array.isArray(d.options) || d.options.length !== 4) return false;
  const required = ['id', 'name', 'thesis', 'body', 'signatures_engaged', 'stretch'];
  if (!d.options.every(o => required.every(f => f in (o as object)))) return false;
  const stretches = d.options.map(o => o.stretch);
  if (!stretches.includes('Natural') || !stretches.includes('Reinvention')) return false;
  return true;
}

async function runGeneration(artifactId: string, identityReport: unknown, identityReframe: unknown) {
  const supabase = createServiceClient();

  try {
    const content = await getChatCompletion({
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: PATH_OPTIONS_PROMPT },
        { role: 'user', content: JSON.stringify({ identity_report: identityReport, identity_reframe: identityReframe }) },
      ],
      max_tokens: 6000,
      temperature: 0,
    });

    const options = JSON.parse(content ?? '{}');

    if (!validatePathOptions(options)) {
      throw new Error('Path options failed validation');
    }

    await supabase
      .from('artifacts')
      .update({ status: 'ready', content: options })
      .eq('id', artifactId);

  } catch (error) {
    console.error('Path options generation failed:', error);
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

  const entitled = await hasPaidEntitlement(user.id);
  if (!entitled) {
    return NextResponse.json({ error: 'Payment required' }, { status: 403 });
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

  // #129 Stage B bug fix: identity_reframe generation was retired entirely by
  // #124 (folded into identity_report's own reframe_teaser field) — nothing
  // creates an identity_reframe artifact for any user anymore, so the old
  // "fetch it, 409 if not ready" gate here permanently blocked path
  // generation for every new paying user. Read reframe_teaser straight off
  // the already-fetched identity_report content instead; no second fetch,
  // no readiness gate to fail.
  const reframeTeaser = (identityArtifact.content as { reframe_teaser?: unknown } | null)?.reframe_teaser ?? null;

  // #71: path_options is append-only (matching #59's identity_report
  // precedent) — always INSERT a new row so regenerating never destroys
  // history. A prior failed attempt has no informational content, so it's
  // deleted first (same call kickoffIdentityGeneration makes for #59)
  // rather than left to accumulate.
  await supabase
    .from('artifacts')
    .delete()
    .eq('user_id', user.id)
    .eq('type', 'path_options')
    .eq('status', 'failed');

  const { data: newArtifact, error } = await supabase
    .from('artifacts')
    .insert({
      user_id: user.id,
      type: 'path_options',
      access_level: 'paid',
      status: 'generating',
      content: {},
    })
    .select('id')
    .single();

  let artifactId: string;

  if (error?.code === '23505') {
    // Lost the #71 unique-index race against a concurrent call for this
    // user (e.g. a double-click) — someone else's generation already
    // started. Reuse that row's id rather than erroring, so the frontend
    // still gets a valid artifact_id to poll. No status filter: the winner's
    // row is guaranteed to be the newest for this user regardless of what
    // it's since resolved to.
    const { data: current } = await getCurrentArtifact<{ id: string }>(
      supabase,
      user.id,
      'path_options',
      { select: 'id' },
    );
    if (!current) {
      console.error('Path options insert lost the generating-row race but no current row was found:', error);
      return NextResponse.json({ error: 'Failed to create artifact' }, { status: 500 });
    }
    artifactId = current.id;
  } else if (error || !newArtifact) {
    console.error('Path options artifact insert error:', error);
    return NextResponse.json({ error: 'Failed to create artifact' }, { status: 500 });
  } else {
    artifactId = newArtifact.id;
  }

  after(() => runGeneration(artifactId, identityArtifact.content, reframeTeaser));

  return NextResponse.json({ artifact_id: artifactId });
}
