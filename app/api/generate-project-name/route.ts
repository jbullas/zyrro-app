import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';
import { createClient as createSessionClient } from '@/utils/supabase/server';
import { hasPaidEntitlement } from '@/lib/entitlements';
import { getChatCompletion } from '@/lib/llm';
import { PROJECT_NAME_PROMPT } from '@/lib/prompts/project-name';

interface ProjectNameOption {
  name: string;
  rationale: string;
}

function createServiceClient() {
  return createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function validateProjectNameOptions(data: unknown): data is { options: ProjectNameOption[] } {
  const d = data as { options?: ProjectNameOption[] };
  if (!Array.isArray(d?.options) || d.options.length !== 3) return false;
  return d.options.every(o => typeof o?.name === 'string' && o.name.trim().length > 0
    && typeof o?.rationale === 'string' && o.rationale.trim().length > 0);
}

// #129 Stage D: project naming (#10) relocated from the old path_options
// "pick a card" moment to Stage 6 completion — this route now takes a
// path_checkpoint_result id instead of path_options_artifact_id + path_id.
// PROJECT_NAME_PROMPT itself is unchanged, still expecting { name, thesis,
// signatures_engaged }. Only this route's caller (formerly /path/page.tsx's
// old 4-card flow) had a caller at all — safe to adapt in place rather than
// keep a dead old branch. The chosen candidate's own short name (Stage 6's
// report has no equivalent short label of its own) and its anchoring
// signatures (Stage 5's deepened pass, not Stage 4's lighter one) are
// sourced from the linked path_checkpoint_session, not the final report
// content directly.
export async function POST(req: NextRequest) {
  const sessionClient = await createSessionClient();
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { path_checkpoint_result_id } = await req.json() as { path_checkpoint_result_id: string };

  if (!path_checkpoint_result_id) {
    return NextResponse.json({ error: 'Missing path_checkpoint_result_id' }, { status: 400 });
  }

  const entitled = await hasPaidEntitlement(user.id);
  if (!entitled) {
    return NextResponse.json({ error: 'Payment required' }, { status: 403 });
  }

  const supabase = createServiceClient();

  const { data: resultArtifact } = await supabase
    .from('artifacts')
    .select('content, path_checkpoint_session_id')
    .eq('id', path_checkpoint_result_id)
    .eq('user_id', user.id)
    .eq('type', 'path_checkpoint_result')
    .eq('status', 'ready')
    .maybeSingle();

  if (!resultArtifact) {
    return NextResponse.json({ error: 'Path result not found' }, { status: 404 });
  }

  let chosenCandidateName = '';
  let signaturesEngaged: string[] = [];

  if (resultArtifact.path_checkpoint_session_id) {
    const { data: session } = await supabase
      .from('artifacts')
      .select('content')
      .eq('id', resultArtifact.path_checkpoint_session_id)
      .eq('user_id', user.id)
      .maybeSingle();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sessionContent = session?.content as any;
    const stageOutputs = sessionContent?.stage_outputs;
    const chosenId = sessionContent?.chosen_candidate_id as string | undefined;
    const stage4Candidates = stageOutputs?.stage4?.candidates as Array<{ id: string; name: string }> | undefined;
    chosenCandidateName = stage4Candidates?.find(c => c.id === chosenId)?.name ?? '';

    const stage5AnchoringSignatures = stageOutputs?.stage5?.anchoring_signatures;
    if (Array.isArray(stage5AnchoringSignatures)) signaturesEngaged = stage5AnchoringSignatures;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const thesis = (resultArtifact.content as any)?.thesis ?? '';

  try {
    const content = await getChatCompletion({
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: PROJECT_NAME_PROMPT },
        {
          role: 'user',
          content: JSON.stringify({
            name: chosenCandidateName,
            thesis,
            signatures_engaged: signaturesEngaged,
          }),
        },
      ],
      max_tokens: 1000,
      temperature: 0.7,
    });

    const parsed = JSON.parse(content ?? '{}');

    if (!validateProjectNameOptions(parsed)) {
      throw new Error('Project name options failed validation');
    }

    return NextResponse.json({ options: parsed.options });
  } catch (error) {
    console.error('Project name generation failed:', error);
    return NextResponse.json({ error: 'Failed to generate project names' }, { status: 500 });
  }
}
