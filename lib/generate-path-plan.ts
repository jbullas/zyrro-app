import { after } from 'next/server';
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';
import { getChatCompletion } from '@/lib/llm';
import { PATH_PLAN_PROMPT } from '@/lib/prompts/path-plan';
import type { PathPlanArtifactContent, PathOption } from '@/lib/artifact-schemas';
import { getCurrentArtifact } from '@/lib/artifacts';

function createServiceClient() {
  return createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function validatePathPlan(data: unknown): data is PathPlanArtifactContent {
  const d = data as PathPlanArtifactContent;
  if (!d?.plan_frame) return false;
  if (!Array.isArray(d.full_path) || d.full_path.length < 3 || d.full_path.length > 5) return false;
  const phaseFields = ['phase_number', 'name', 'outcome', 'estimated_duration', 'milestones', 'signatures_leaned_on', 'body'];
  if (!d.full_path.every(p => phaseFields.every(f => f in (p as object)))) return false;
  if (!Array.isArray(d.start_here) || d.start_here.length < 5 || d.start_here.length > 7) return false;
  if (!d.start_here.every(a => 'action' in (a as object) && 'why' in (a as object))) return false;
  return true;
}

async function runPlanGeneration(
  artifactId: string,
  identityReport: unknown,
  chosenOption: PathOption,
) {
  const supabase = createServiceClient();

  try {
    const content = await getChatCompletion({
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: PATH_PLAN_PROMPT },
        {
          role: 'user',
          content: JSON.stringify({ identity_report: identityReport, chosen_option: chosenOption }),
        },
      ],
      max_tokens: 6000,
      temperature: 0,
    });

    const plan = JSON.parse(content ?? '{}');

    if (!validatePathPlan(plan)) {
      throw new Error('Path plan failed validation');
    }

    await supabase
      .from('artifacts')
      .update({ status: 'ready', content: plan })
      .eq('id', artifactId);

  } catch (error) {
    console.error('Path plan generation failed:', error);
    await supabase
      .from('artifacts')
      .update({ status: 'failed' })
      .eq('id', artifactId);
  }
}

// Shared function used by select-path and any future retry route.
// Does not re-record a selection — callers handle that separately.
export async function generatePathPlan(
  userId: string,
  pathOptionsArtifactId: string,
  pathId: string,
): Promise<string | null> {
  const supabase = createServiceClient();

  // Resolve the chosen option from the path_options artifact
  const { data: pathOptionsArtifact } = await supabase
    .from('artifacts')
    .select('content')
    .eq('id', pathOptionsArtifactId)
    .eq('type', 'path_options')
    .eq('status', 'ready')
    .maybeSingle();

  if (!pathOptionsArtifact) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chosenOption = (pathOptionsArtifact.content as any)?.options?.find(
    (o: PathOption) => o.id === pathId,
  ) as PathOption | undefined;

  if (!chosenOption) return null;

  // Resolve the identity report
  const { data: identityArtifact } = await getCurrentArtifact<{ content: unknown }>(
    supabase,
    userId,
    'identity_report',
    { status: 'ready', select: 'content' },
  );

  if (!identityArtifact) return null;

  // #71: path_plan is append-only, so more than one row can exist for the
  // same selection key — resolve the current one via getCurrentArtifact
  // (ordered by created_at) instead of a bare .maybeSingle() that would
  // throw once a second row exists.
  const { data: existing } = await getCurrentArtifact<{ id: string; status: string }>(
    supabase,
    userId,
    'path_plan',
    {
      match: { path_options_artifact_id: pathOptionsArtifactId, path_id: pathId },
      select: 'id, status',
    },
  );

  if (existing && (existing.status === 'generating' || existing.status === 'ready')) {
    // Already generating or ready — return the existing id without re-running
    return existing.id;
  }

  // No current row, or the current row failed — #71: delete failed rows for
  // this selection key (no informational content, same call #71 makes for
  // path_options) then INSERT a fresh row, rather than resetting the old
  // row's status in place.
  await supabase
    .from('artifacts')
    .delete()
    .eq('user_id', userId)
    .eq('type', 'path_plan')
    .eq('path_options_artifact_id', pathOptionsArtifactId)
    .eq('path_id', pathId)
    .eq('status', 'failed');

  const { data: newArtifact, error } = await supabase
    .from('artifacts')
    .insert({
      user_id: userId,
      type: 'path_plan',
      access_level: 'paid',
      status: 'generating',
      content: {},
      path_options_artifact_id: pathOptionsArtifactId,
      path_id: pathId,
    })
    .select('id')
    .single();

  let artifactId: string;

  if (error?.code === '23505') {
    // Lost the #71 composite unique-index race against a concurrent call
    // for this exact selection key — someone else's generation already
    // started. Reuse that row's id (same reuse pattern as path_options'
    // analogous race) rather than returning null, since select-path/route.ts
    // treats a null return as a genuine failure and surfaces a 500.
    const { data: current } = await getCurrentArtifact<{ id: string }>(
      supabase,
      userId,
      'path_plan',
      { match: { path_options_artifact_id: pathOptionsArtifactId, path_id: pathId }, select: 'id' },
    );
    if (!current) {
      console.error('Path plan insert lost the generating-row race but no current row was found:', error);
      return null;
    }
    return current.id;
  }

  if (error || !newArtifact) {
    console.error('Path plan artifact insert error:', error);
    return null;
  }
  artifactId = newArtifact.id;

  after(() => runPlanGeneration(artifactId, identityArtifact.content, chosenOption));

  return artifactId;
}
