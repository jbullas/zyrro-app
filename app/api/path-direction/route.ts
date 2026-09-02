import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';
import { createClient as createSessionClient } from '@/utils/supabase/server';
import { hasPaidEntitlement } from '@/lib/entitlements';
import { getCurrentArtifact } from '@/lib/artifacts';
import type { IdentitySignatureReportArtifactContent } from '@/lib/artifact-schemas';
import {
  startOrResumeDirectionSession,
  resolveDirectionStep,
  validateSelection,
  recordMustHaves,
  recordMustAvoids,
  recordIdealLife,
  type PathDirectionSessionRow,
} from '@/lib/path-direction';

// #134 Slice 1 — Checkpoint 1 "Direction" API surface. Unlike
// /api/generate-path-options (the old Checkpoint 1's bootstrap route), there
// is no background generation here: GET bootstraps/resumes the session
// synchronously, and POST persists exactly one of the three sequential
// inputs per call, each on its own request (must-haves, then must-avoids,
// then ideal-life) — see docs/briefs/134-path-redesign-direction-options-your-path.md §3.

function createServiceClient() {
  return createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function loadIdentityReport(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
): Promise<IdentitySignatureReportArtifactContent | null> {
  const { data } = await getCurrentArtifact<{ content: IdentitySignatureReportArtifactContent }>(
    supabase,
    userId,
    'identity_report',
    { status: 'ready', select: 'content' },
  );
  return data?.content ?? null;
}

export async function GET(_req: NextRequest) {
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

  const identityReport = await loadIdentityReport(supabase, user.id);
  if (!identityReport) {
    return NextResponse.json({ error: 'Identity report not found' }, { status: 404 });
  }

  const session = await startOrResumeDirectionSession(supabase, user.id);

  return NextResponse.json({
    status: session.status,
    content: session.content,
    step: resolveDirectionStep(session.content),
    energisers: identityReport.energisers,
    friction_points: identityReport.friction_points,
    prepared_for: identityReport.cover.prepared_for,
  });
}

type Body = {
  step?: 'must_haves' | 'must_avoids' | 'ideal_life';
  selected?: unknown;
  text?: unknown;
};

export async function POST(req: NextRequest) {
  const sessionClient = await createSessionClient();
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const entitled = await hasPaidEntitlement(user.id);
  if (!entitled) {
    return NextResponse.json({ error: 'Payment required' }, { status: 403 });
  }

  const body = (await req.json()) as Body;
  if (body.step !== 'must_haves' && body.step !== 'must_avoids' && body.step !== 'ideal_life') {
    return NextResponse.json({ error: 'step must be "must_haves", "must_avoids", or "ideal_life"' }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: session } = await getCurrentArtifact<PathDirectionSessionRow>(
    supabase,
    user.id,
    'path_direction_session',
    { select: 'id, user_id, status, content' },
  );
  if (!session) {
    return NextResponse.json({ error: 'No path_direction_session found — GET first to start one' }, { status: 404 });
  }

  // Steps are sequential and, for this slice, forward-only: a step can only
  // be submitted when it's the one the session is actually waiting on — not
  // skipped ahead of, and not resubmitted once answered. Editing an already-
  // answered step isn't part of the brief's scope for this slice.
  const currentStep = resolveDirectionStep(session.content);
  if (currentStep !== body.step) {
    return NextResponse.json(
      { error: `Session is at step "${currentStep}", not "${body.step}"` },
      { status: 409 },
    );
  }

  let updated: PathDirectionSessionRow;

  if (body.step === 'ideal_life') {
    if (typeof body.text !== 'string') {
      return NextResponse.json({ error: 'text must be a string' }, { status: 400 });
    }
    updated = await recordIdealLife(supabase, session.id, body.text.trim(), session.content);
  } else {
    const identityReport = await loadIdentityReport(supabase, user.id);
    if (!identityReport) {
      return NextResponse.json({ error: 'Identity report not found' }, { status: 404 });
    }

    const allowed = body.step === 'must_haves' ? identityReport.energisers : identityReport.friction_points;
    if (!validateSelection(body.selected, allowed, 3)) {
      const label = body.step === 'must_haves' ? 'energisers' : 'friction points';
      return NextResponse.json(
        { error: `selected must be at most 3 items drawn from the real ${label} list` },
        { status: 400 },
      );
    }

    updated = body.step === 'must_haves'
      ? await recordMustHaves(supabase, session.id, body.selected, session.content)
      : await recordMustAvoids(supabase, session.id, body.selected, session.content);
  }

  return NextResponse.json({
    status: updated.status,
    content: updated.content,
    step: resolveDirectionStep(updated.content),
  });
}
