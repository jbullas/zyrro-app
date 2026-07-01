import { NextRequest, NextResponse } from 'next/server';

// Keep in sync with GENERATION_BUDGET_MS in lib/generation-status.ts (240 s = 240_000 ms).
export const maxDuration = 240;
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';
import { createClient as createSessionClient } from '@/utils/supabase/server';
import { hasPaidEntitlement } from '@/lib/entitlements';
import { generatePathPlan } from '@/lib/generate-path-plan';

function createServiceClient() {
  return createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(req: NextRequest) {
  const sessionClient = await createSessionClient();
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { path_options_artifact_id, path_id, project_name } = await req.json() as {
    path_options_artifact_id: string;
    path_id: string;
    project_name?: string;
  };

  if (!path_options_artifact_id || !path_id) {
    return NextResponse.json(
      { error: 'Missing path_options_artifact_id or path_id' },
      { status: 400 },
    );
  }

  const entitled = await hasPaidEntitlement(user.id);
  if (!entitled) {
    return NextResponse.json({ error: 'Payment required' }, { status: 403 });
  }

  const supabase = createServiceClient();

  // Record the selection event (append-only; latest row = active selection)
  const { error: insertError } = await supabase.from('path_selections').insert({
    user_id: user.id,
    path_options_artifact_id,
    path_id,
    ...(project_name ? { project_name } : {}),
  });

  if (insertError) {
    console.error('path_selections insert failed:', insertError);
    return NextResponse.json({ error: 'Failed to record selection' }, { status: 500 });
  }

  // Return the existing ready plan immediately — no regeneration, no cost
  const { data: existingPlan } = await supabase
    .from('artifacts')
    .select('id')
    .eq('user_id', user.id)
    .eq('type', 'path_plan')
    .eq('path_options_artifact_id', path_options_artifact_id)
    .eq('path_id', path_id)
    .eq('status', 'ready')
    .maybeSingle();

  if (existingPlan) {
    return NextResponse.json({ artifact_id: existingPlan.id, reused: true });
  }

  const artifactId = await generatePathPlan(user.id, path_options_artifact_id, path_id);

  if (!artifactId) {
    return NextResponse.json({ error: 'Failed to start plan generation' }, { status: 500 });
  }

  return NextResponse.json({ artifact_id: artifactId });
}
