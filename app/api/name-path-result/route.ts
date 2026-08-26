import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';
import { createClient as createSessionClient } from '@/utils/supabase/server';
import { hasPaidEntitlement } from '@/lib/entitlements';

function createServiceClient() {
  return createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// #129 Stage D: persists project naming's outcome directly onto the
// path_checkpoint_result artifact's own content, as a deliberate, narrow
// exception to this table's Tier C append-only convention — this is
// user-chosen metadata attached after the fact, not a regeneration of the
// report's substantive (LLM-generated) content, and nothing else in this
// project ever mutates a Tier C row's content after creation. Chosen over
// reusing path_selections (#10's original storage) because that table's
// only other real consumer, /plan/page.tsx, polls forever for a path_plan
// artifact the new checkpoint flow never generates — see
// docs/changelogs/2026-08-26.md for the full reasoning.
//
// project_name is set to the real name on a genuine pick, or explicitly to
// `null` (not left absent) on "Skip" — the two need to be distinguishable
// so /path doesn't re-prompt on every future visit once the user has
// already been asked once, regardless of what they chose.
//
// No concurrency guard on the read-modify-write below — deliberate, not an
// oversight: unlike every checkpoint-flow write this project guards
// carefully (claimGeneration etc.), this doesn't gate an LLM call or touch
// session state machine — the expensive/stateful work is already done by
// the time this fires. A double-submit race just means the last request's
// project_name silently wins; the UI disables its submit control after the
// first click (matching this app's existing pattern elsewhere), so
// triggering it at all requires two genuinely distinct submissions landing
// before either resolves. Worst case is a surprising-but-harmless
// overwrite, trivially fixed by renaming again — not a crash, not
// corruption, not a stuck state — so the cost of a real JSONB-conditional
// guard isn't justified here.
export async function POST(req: NextRequest) {
  const sessionClient = await createSessionClient();
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { path_checkpoint_result_id, project_name } = await req.json() as {
    path_checkpoint_result_id: string;
    project_name?: string | null;
  };

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
    .select('content')
    .eq('id', path_checkpoint_result_id)
    .eq('user_id', user.id)
    .eq('type', 'path_checkpoint_result')
    .eq('status', 'ready')
    .maybeSingle();

  if (!resultArtifact) {
    return NextResponse.json({ error: 'Path result not found' }, { status: 404 });
  }

  const nextContent = {
    ...(resultArtifact.content as Record<string, unknown>),
    project_name: project_name ?? null,
  };

  const { error } = await supabase
    .from('artifacts')
    .update({ content: nextContent })
    .eq('id', path_checkpoint_result_id)
    .eq('user_id', user.id);

  if (error) {
    console.error('name-path-result update failed:', error);
    return NextResponse.json({ error: 'Failed to save project name' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, project_name: nextContent.project_name });
}
