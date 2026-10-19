import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';
import { createClient as createSessionClient } from '@/utils/supabase/server';
import { getCurrentArtifact } from '@/lib/artifacts';
import { hasFullIdentityReport } from '@/lib/entitlements';
import { REPORT_PAYWALL } from '@/lib/feature-flags';
import { FLIP_GUARD_MS, GENERATION_BUDGET_MS } from '@/lib/generation-budget';
import {
  toLockedIdentityReport,
  type IdentityReportResponse,
  type IdentityReportStatus,
} from '@/lib/identity-report-view';

// #162: the signed-in user's Identity report. Every client reader goes through
// here rather than reading artifacts directly, so the paywall is enforced on
// the server: with REPORT_PAYWALL on, a user without identity_unlock or
// onetime_payment gets only the free projection (lib/identity-report-view.ts).
// Reads use the service role; once the identity_report RLS rule is applied,
// an unpaid user's own session can't read the row at all.

function createServiceClient() {
  return createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

type ArtifactRow = { id: string; status: IdentityReportStatus; content: unknown; created_at: string };

// GET: the current report row. ?status=ready returns the latest ready row
// instead, which is what /path has always read.
export async function GET(req: NextRequest) {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();
  const readyOnly = req.nextUrl.searchParams.get('status') === 'ready';
  const { data: row, error } = await getCurrentArtifact<ArtifactRow>(
    supabase,
    user.id,
    'identity_report',
    { select: 'id, status, content, created_at', ...(readyOnly ? { status: 'ready' as const } : {}) },
  );
  if (error) {
    console.error('identity-report read failed', { userId: user.id, error });
    return NextResponse.json({ error: 'Failed to read identity report' }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ artifact: null } satisfies IdentityReportResponse);
  }

  let status = row.status;

  // A generating row past the budget is stranded: flip it to failed, as the
  // client poller used to. The status guard keeps it from clobbering a row
  // that just turned ready, so re-read what the row actually is now.
  const age = Date.now() - new Date(row.created_at).getTime();
  if (status === 'generating' && age > GENERATION_BUDGET_MS + FLIP_GUARD_MS) {
    await supabase
      .from('artifacts')
      .update({ status: 'failed' })
      .eq('id', row.id)
      .eq('status', 'generating');
    const { data: current } = await supabase
      .from('artifacts')
      .select('status, content')
      .eq('id', row.id)
      .single();
    status = (current?.status as IdentityReportStatus | undefined) ?? 'failed';
    row.content = current?.content ?? row.content;
  }

  const base = { id: row.id, created_at: row.created_at };
  let body: IdentityReportResponse;
  if (status !== 'ready') {
    body = { artifact: { ...base, status, locked: false, content: null } };
  } else if (REPORT_PAYWALL && !(await hasFullIdentityReport(user.id))) {
    body = { artifact: { ...base, status, locked: true, content: toLockedIdentityReport(row.content) } };
  } else {
    body = { artifact: { ...base, status, locked: false, content: row.content } };
  }

  return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
}
