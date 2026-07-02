import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';
import { createClient as createSessionClient } from '@/utils/supabase/server';
import { hasPaidEntitlement } from '@/lib/entitlements';
import { getChatCompletion } from '@/lib/llm';
import { PROJECT_NAME_PROMPT } from '@/lib/prompts/project-name';
import type { PathOption } from '@/lib/artifact-schemas';

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

export async function POST(req: NextRequest) {
  const sessionClient = await createSessionClient();
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { path_options_artifact_id, path_id } = await req.json() as {
    path_options_artifact_id: string;
    path_id: string;
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

  // Resolve the chosen option, same lookup as generatePathPlan
  const { data: pathOptionsArtifact } = await supabase
    .from('artifacts')
    .select('content')
    .eq('id', path_options_artifact_id)
    .eq('user_id', user.id)
    .eq('type', 'path_options')
    .eq('status', 'ready')
    .maybeSingle();

  if (!pathOptionsArtifact) {
    return NextResponse.json({ error: 'Path options not found' }, { status: 404 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chosenOption = (pathOptionsArtifact.content as any)?.options?.find(
    (o: PathOption) => o.id === path_id,
  ) as PathOption | undefined;

  if (!chosenOption) {
    return NextResponse.json({ error: 'Chosen path option not found' }, { status: 404 });
  }

  try {
    const content = await getChatCompletion({
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: PROJECT_NAME_PROMPT },
        {
          role: 'user',
          content: JSON.stringify({
            name: chosenOption.name,
            thesis: chosenOption.thesis,
            signatures_engaged: chosenOption.signatures_engaged,
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
