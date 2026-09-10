import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';
import { createClient as createSessionClient } from '@/utils/supabase/server';
import { hasPaidEntitlement } from '@/lib/entitlements';
import { getCurrentArtifact } from '@/lib/artifacts';
import type { PathReportContent } from '@/lib/generate-path-report';

function createServiceClient() {
  return createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// #134 Slice 3: persists project naming's outcome onto path_report's own
// content — adapted in place from path_checkpoint_result (see this file's
// prior version), same deliberate, narrow exception to Tier C append-only
// convention: user-chosen metadata attached after the fact, not a
// regeneration of the report's substantive (LLM-generated) content.
//
// project_name is set to the real name on a genuine pick, or explicitly to
// `null` (not left absent) on "Skip" — same distinction the prior version
// already established, so /path doesn't re-prompt once the user has
// already been asked once, regardless of what they chose.
//
// Resolves the current user's ready path_report server-side via
// getCurrentArtifact rather than trusting a client-supplied id — same
// tightening as this session's adapted /api/generate-project-name.
//
// No concurrency guard on the read-modify-write below — same reasoning as
// the prior version: this doesn't gate an LLM call or touch a session
// state machine, the expensive/stateful work is already done by the time
// this fires, and the UI disables its submit control after the first
// click, so a real race requires two genuinely distinct submissions
// landing before either resolves. Worst case is a harmless overwrite.
export async function POST(req: NextRequest) {
  const sessionClient = await createSessionClient();
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { project_name } = await req.json() as { project_name?: string | null };

  const entitled = await hasPaidEntitlement(user.id);
  if (!entitled) {
    return NextResponse.json({ error: 'Payment required' }, { status: 403 });
  }

  const supabase = createServiceClient();

  const { data: report } = await getCurrentArtifact<{ id: string; content: PathReportContent }>(
    supabase,
    user.id,
    'path_report',
    { status: 'ready', select: 'id, content' },
  );

  if (!report) {
    return NextResponse.json({ error: 'Path report not found' }, { status: 404 });
  }

  const nextContent: PathReportContent = {
    ...report.content,
    project_name: project_name ?? null,
  };

  const { error } = await supabase
    .from('artifacts')
    .update({ content: nextContent })
    .eq('id', report.id)
    .eq('user_id', user.id);

  if (error) {
    console.error('name-path-result update failed:', error);
    return NextResponse.json({ error: 'Failed to save project name' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, project_name: nextContent.project_name });
}
