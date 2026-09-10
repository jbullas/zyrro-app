import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';
import { createClient as createSessionClient } from '@/utils/supabase/server';
import { hasPaidEntitlement } from '@/lib/entitlements';
import { getChatCompletion } from '@/lib/llm';
import { PROJECT_NAME_PROMPT } from '@/lib/prompts/project-name';
import { getCurrentArtifact } from '@/lib/artifacts';
import type { PathReportContent } from '@/lib/generate-path-report';

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

// #134 Slice 3: project naming (#10, relocated to final-delivery completion
// by #129 Stage D) adapted in place a second time — now reads path_report
// instead of path_checkpoint_result. Same "adapt in place, don't keep a
// dead old branch" reasoning #129 Stage D's own comment already used for
// this route's first migration (path_options -> path_checkpoint_result).
// PROJECT_NAME_PROMPT itself was rewritten (lib/prompts/project-name.ts) to
// take path_report's real chosen_candidate { name, description } directly —
// the old { name, thesis, signatures_engaged } shape doesn't exist in the
// new flow's data model, same "new prompt, not a bridge into the old
// shape" principle lib/prompts/path-report.ts itself already established.
//
// Resolves the current user's ready path_report server-side via
// getCurrentArtifact rather than trusting a client-supplied id — the old
// version took path_checkpoint_result_id in the request body; this is a
// deliberate tightening, matching the convention
// app/api/path-options/route.ts's POST already established (server-resolves
// rather than trusts a client-passed id), not an oversight.
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

  const { data: report } = await getCurrentArtifact<{ content: PathReportContent }>(
    supabase,
    user.id,
    'path_report',
    { status: 'ready', select: 'content' },
  );

  if (!report) {
    return NextResponse.json({ error: 'Path report not found' }, { status: 404 });
  }

  try {
    const content = await getChatCompletion({
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: PROJECT_NAME_PROMPT },
        {
          role: 'user',
          content: JSON.stringify({
            name: report.content.chosen_candidate.name,
            description: report.content.chosen_candidate.description,
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
